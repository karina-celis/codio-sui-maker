import {
  window,
  StatusBarItem,
  StatusBarAlignment,
  ExtensionContext,
  MarkdownString,
  commands,
  QuickPickItem,
  QuickInputButtons,
  ThemeIcon,
  Uri,
  ProgressLocation,
} from 'vscode';
import { Commands } from '../commands';
import Player from '../player/Player';
import Recorder, { CODIO_FORMAT_VERSION } from '../recorder/Recorder';
import { playerUI, recorderUI } from './popups';

export const showCodioNameInputBox = async (): Promise<string> => {
  return await window.showInputBox({
    ignoreFocusOut: true,
    placeHolder: 'New Filename',
    prompt: 'Use the same filename to create a series.',
    title: 'Record Codio',
  });
};

export const showPlayFromInputBox = async (player: Player): Promise<string> => {
  return await window.showInputBox({
    ignoreFocusOut: true,
    placeHolder: 'Seconds',
    prompt: `Valid entry from 0 to ${player.totalMs / 1000} seconds.`,
    title: 'Starting Time',
  });
};

export const showChooseAudioDevice = async (items: string[]): Promise<string | undefined> => {
  const audioDevice = await window.showQuickPick(items, {
    ignoreFocusOut: true,
    placeHolder: 'Choose an audio device to record from',
    title: 'Recording Audio Devices',
  });
  return audioDevice;
};

/**
 * Allow user to choose from given codios.
 * @param codiosMetadata An array of codio interface objects.
 * @returns An object containg the path and root of chosen codio or undefined.
 */
export const choose = async (codiosMetadata: Codio[]): Promise<{ path: string; workspaceRoot: Uri } | undefined> => {
  let unlock: (value?: unknown) => void;
  let codioSelected: QuickPickItem;

  const quickPick = window.createQuickPick();
  quickPick.ignoreFocusOut = true;
  quickPick.placeholder = 'Type or select codio name';
  quickPick.title = 'Play Start';

  quickPick.buttons = [QuickInputButtons.Back];
  quickPick.onDidTriggerButton(() => {
    unlock();
    quickPick.hide();
  });

  quickPick.items = codiosMetadata.map((codio) => ({
    label: codio.name,
    buttons: [{ iconPath: new ThemeIcon('play'), tooltip: 'Play Start' }],
  }));

  quickPick.onDidTriggerItemButton((e) => {
    codioSelected = e.item;
    unlock();
    quickPick.hide();
  });
  quickPick.onDidChangeSelection((e) => {
    codioSelected = e[0];
    unlock();
    quickPick.hide();
  });
  quickPick.onDidHide(() => {
    quickPick.dispose();
    unlock();
  });

  quickPick.show();
  await new Promise((res) => (unlock = res));

  const codio: Codio = codiosMetadata.find((codio) => {
    return codio.name === codioSelected?.label;
  });
  return codio ? { path: codio.uri.fsPath, workspaceRoot: codio.workspaceRoot } : undefined;
};

export const MESSAGES = {
  startingToRecord: 'Starting to record.',
  recordingPaused: 'Recording paused.',
  recordingResumed: 'Recording resumed.',
  cantPlayWhileRecording: "Can't play codio while recording.",
  alreadyPlaying: 'Codio already playing.',
  interactive: 'Entering interactive mode.',
};

export const MODAL_MESSAGE_OBJS = {
  recordingSaved: { msg: 'Recording saved.' },
  recordingCanceled: { msg: 'Recording canceled.' },
  noActiveCodio: { msg: 'No codio playing.', detail: 'Please resume or select a codio from the list.' },
  noStartTime: { msg: 'No start time entered.', detail: 'Please enter a time is seconds to start from.' },
  tarNotAvailable: {
    msg: 'Codio requires tar to work.',
    detail: 'Path accessible? Please reinstall tar; it should be native to your OS.',
  },
  ffmpegNotAvailable: {
    msg: 'Codio requires FFmpeg to work.',
    detail: 'Please install FFmpeg: https://www.ffmpeg.org/download.html',
  },
  noRecordingDeviceAvailable: {
    msg: 'Codio could not find an audio recording device.',
    detail: 'Make sure a microphone is active.',
  },
  noActiveWorkspace: {
    msg: 'Active workspace needed to record a codio.',
    detail: 'Open a folder from the File menu option.',
  },
  Incompatible: {
    msg: `The current codio format version is incompatible with version ${CODIO_FORMAT_VERSION}.`,
    detail: 'Please update VS Codio version.',
  },
};

class UIController {
  shouldDisplayMessages: boolean;
  private statusBar: StatusBarItem;
  private mds: MarkdownString;

  constructor(shouldDisplayMessages) {
    this.shouldDisplayMessages = shouldDisplayMessages;

    this.mds = new MarkdownString('', true);
    this.mds.isTrusted = true;
    this.mds.supportHtml = true;
  }

  /**
   * Create a status bar item to write codio progress to.
   * @param context Context from when the extension was activated.
   */
  createStatusBar(context: ExtensionContext): void {
    if (this.statusBar) {
      this.statusBar.dispose();
    }

    this.statusBar = window.createStatusBarItem(StatusBarAlignment.Right, 101);
    context.subscriptions.push(this.statusBar);
  }

  showMessage(message: string): void {
    if (this.shouldDisplayMessages) {
      window.showInformationMessage(message);

      // Best case effort to clear or hide notification.
      const validMsgs = Object.values(MESSAGES);
      setTimeout(() => {
        commands.executeCommand('notifications.focusLastToast').then((msg: string) => {
          if (validMsgs.indexOf(msg)) {
            commands.executeCommand('notification.clear');
          } else {
            commands.executeCommand('notifications.focusPreviousToast').then((msg: string) => {
              if (validMsgs.indexOf(msg)) {
                commands.executeCommand('notification.clear');
              } else {
                commands.executeCommand('notifications.hideToasts');
              }
            });
          }
        });
      }, 3000);
    }
  }

  showModalMessage(mm: ModalMessage): Thenable<string> {
    if (this.shouldDisplayMessages) {
      return window.showInformationMessage(mm.msg, { modal: true, detail: mm.detail });
    }
  }

  /**
   * Show given message as an error pop-up.
   * @param message Message to show in error pop-up.
   */
  showError(message: string): void {
    window.showErrorMessage(message);
  }

  /**
   * Show codio player progress on status bar item.
   * @param player Player to get updates from.
   */
  showPlayerStatusBar(player: Player): void {
    this.mds.value = playerUI(player);
    this.statusBar.tooltip = this.mds;

    player.onStateUpdate((isPlaying, isPaused) => {
      this.mds.value = playerUI(player);
      this.statusBar.tooltip = this.mds;
      this.statusBar.command = isPaused ? Commands.PLAY_RESUME : Commands.PLAY_PAUSE;
    });

    this.statusBar.command = Commands.PLAY_PAUSE;
    this.statusBar.name = 'Codio Player';
    this.statusBar.text = '$(megaphone) Playing...';
    this.statusBar.show();

    player.onTimerUpdate((currentSecs, totalSecs) => {
      const percentage = (currentSecs / totalSecs) * 100;
      const current = this.getTimeDisplay(currentSecs);
      const total = this.getTimeDisplay(totalSecs);
      this.statusBar.text = `$(megaphone) Codio $(mention)${Math.round(percentage)}% - ${current}/${total}`;
    });

    player.process.then(() => {
      this.clearStatusBar();
      this.statusBar.hide();
    });
  }

  /**
   * Using given time, get human readable time to display.
   * @param timeSecs Time in seconds.
   * @returns Display time using time system of units.
   */
  private getTimeDisplay(timeSecs: number): string {
    const seconds = Math.floor(timeSecs % 60);
    let minutes = Math.floor(timeSecs / 60);
    const hours = Math.floor(minutes / 60);
    minutes %= 60;

    let display = '';
    if (hours) {
      display = `${hours}h`;
    }

    if (minutes && minutes < 60) {
      if (display) {
        display += ':';
      }
      display += `${minutes}min`;
    }

    if (seconds) {
      if (display) {
        display += ':';
      }
      display += `${seconds}s`;
    }

    return display;
  }

  /**
   * Show codio recorder progress on status bar item.
   * @param recorder Recorder to get updatess from.
   */
  showRecorderStatusBar(recorder: Recorder): void {
    this.mds.value = recorderUI(recorder);
    this.statusBar.tooltip = this.mds;

    recorder.onStateUpdate((isRecording, isPaused) => {
      this.mds.value = recorderUI(recorder);
      this.statusBar.tooltip = this.mds;
      this.statusBar.command = isPaused ? Commands.RECORD_RESUME : Commands.RECORD_PAUSE;
    });

    this.statusBar.command = Commands.RECORD_PAUSE;
    this.statusBar.name = 'Codio Recorder';
    this.statusBar.text = '$(pulse) Recording...';
    this.statusBar.show();

    recorder.onTimerUpdate(async (currentSecs) => {
      const display = this.getTimeDisplay(currentSecs);
      this.statusBar.text = `$(pulse) Recording Codio $(mention) ${display}`;
    });

    recorder.process.then(() => {
      this.clearStatusBar();
      this.statusBar.hide();
    });
  }

  /**
   * Clear data from statusBar member.
   */
  private clearStatusBar(): void {
    this.statusBar.command = '';
    this.statusBar.tooltip = '';
    this.statusBar.text = '';
  }

  /**
   * Show progress of given title and observer.
   * @param title Title to show on progress notification.
   * @param observer Observer type to act on outcomes.
   */
  showProgress(title: string, observer: Observer): void {
    window.withProgress(
      {
        location: ProgressLocation.Notification,
        title,
        cancellable: true,
      },
      async (progress, token) => {
        token.onCancellationRequested(observer.cancel);
        observer.onUpdate((increment, message) => {
          progress.report({ increment, message });
        });
        await observer.unitilFinished;
      },
    );
  }
}

export const UI = new UIController(false);
