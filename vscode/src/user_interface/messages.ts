import { window, StatusBarItem, StatusBarAlignment, ExtensionContext, MarkdownString, commands } from 'vscode';
import Player from '../player/Player';
import Recorder from '../recorder/Recorder';
import { playerUI, recorderUI } from './popups';

export const showCodioNameInputBox = async (): Promise<string> => {
  return await window.showInputBox({ prompt: 'Give your codio a name:' });
};

export const showChooseAudioDevice = async (items: string[]): Promise<string | undefined> => {
  const audioDevice = await window.showQuickPick(items, { placeHolder: 'Choose an Audio Device to record from' });
  return audioDevice;
};

export const showPlayFromInputBox = async (player: Player): Promise<string> => {
  return await window.showInputBox({
    prompt: `Choose a starting time from 0 to ${player.codioLength / 1000} seconds.`,
  });
};

export const MESSAGES = {
  startingToRecord: 'Starting to record.',
  recordingPaused: 'Recording paused.',
  recordingResumed: 'Recording resumed.',
  cantPlayWhileRecording: "Can't play codio while recording.",
  alreadyPlaying: 'Codio already playing.',
};

export const MODAL_MESSAGE_OBJS = {
  recordingSaved: { msg: 'Recording saved.' },
  recordingCanceled: { msg: 'Recording canceled.' },
  noActiveCodio: { msg: 'No codio playing.', detail: 'Please select a codio from the list.' },
  noStartTime: { msg: 'No start time entered.', detail: 'Please enter a time is seconds to start from.' },
  ffmpegNotAvailable: {
    msg: 'Codio requires FFmpeg to work.',
    detail: 'Please install FFmpeg: https://www.ffmpeg.org/download.html',
  },
  emptyCodioNameInvalid: { msg: 'Filename needed to save codio to.', detail: 'Enter a filename to save to.' },
  noRecordingDeviceAvailable: {
    msg: 'Codio could not find an audio recording device.',
    detail: 'Make sure a microphone is active.',
  },
  noActiveWorkspace: {
    msg: 'Active workspace needed to record a codio.',
    detail: 'Open a folder from the File menu option.',
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

  showMessage(message): void {
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

  showModalMessage(mm: ModalMessage): void {
    if (this.shouldDisplayMessages) {
      window.showInformationMessage(mm.msg, { modal: true, detail: mm.detail });
    }
  }

  /**
   * Show given message as an error pop-up.
   * @param message Message to show in error pop-up.
   */
  showError(message): void {
    window.showErrorMessage(message);
  }

  /**
   * Show codio player progress on status bar item.
   * @param player Player to get updates from.
   */
  showPlayerStatusBar(player: Player): void {
    this.mds.value = playerUI(player.codioName);
    this.statusBar.tooltip = this.mds;

    this.statusBar.name = 'Codio Player';
    this.statusBar.text = '$(megaphone) Playing...';
    this.statusBar.show();

    player.onTimerUpdate((currentTime, totalTime) => {
      const percentage = (currentTime / totalTime) * 100;
      this.statusBar.text = `$(megaphone) Codio $(mention)${Math.round(percentage)}% - ${Math.round(
        currentTime,
      )}s/${Math.round(totalTime)}s`;
    });

    player.process.then(() => {
      this.clearStatusBar();
      this.statusBar.hide();
    });
  }

  /**
   * Show codio recorder progress on status bar item.
   * @param recorder Recorder to get updatess from.
   */
  showRecorderStatusBar(recorder: Recorder): void {
    this.mds.value = recorderUI(recorder.codioName);
    this.statusBar.tooltip = this.mds;

    this.statusBar.name = 'Codio Recorder';
    this.statusBar.text = '$(pulse) Recording...';
    this.statusBar.show();

    recorder.onTimerUpdate(async (currentTime) => {
      this.statusBar.text = `$(pulse) Recording Codio $(mention) ${Math.round(currentTime)}s`;
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
}

export const UI = new UIController(false);
