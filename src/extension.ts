import { commands, ExtensionContext, Uri } from 'vscode';
import { UI, MODAL_MESSAGE_OBJS, MESSAGES } from './user_interface/messages';
import Player from './player/Player';
import Recorder from './recorder/Recorder';
import { registerTreeViews } from './user_interface/Viewers';
import FSManager from './filesystem/FSManager';
import { funcs, Commands } from './commands';
import { getRecordProject } from './filesystem/workspace';
import { checkForFFmpeg, isTreeItem, saveExtensionPath } from './utils';
import Environment from './environment/Environment';

const fsManager = new FSManager();
const player = new Player();
const recorder = new Recorder();

export async function activate(context: ExtensionContext): Promise<void> {
  UI.shouldDisplayMessages = true;
  const hasFFmpeg = checkForFFmpeg();
  if (!hasFFmpeg) {
    await UI.showModalMessage(MODAL_MESSAGE_OBJS.ffmpegNotAvailable);
    return;
  }

  saveExtensionPath(context.extensionPath);
  await Environment.getInstance().resolveDependencies();
  UI.createStatusBar(context);
  registerTreeViews(fsManager, context.extensionPath);

  const playForwardDisposable = commands.registerCommand(Commands.PLAY_FORWARD, async (timeMs?: number) => {
    funcs.playForward(player, timeMs);
  });

  const playGotoDisposable = commands.registerCommand(Commands.PLAY_GOTO, async (timeMs?: number) => {
    funcs.playGoto(player, timeMs);
    FSManager.update();
  });

  const playPauseDisposable = commands.registerCommand(Commands.PLAY_PAUSE, () => {
    funcs.playPause(player);
    FSManager.update();
  });

  const playResumeDisposable = commands.registerCommand(Commands.PLAY_RESUME, () => {
    funcs.playResume(player);
    FSManager.update();
  });

  const playRewindDisposable = commands.registerCommand(Commands.PLAY_REWIND, async (timeMs?: number) => {
    funcs.playRewind(player, timeMs);
  });

  const playStartDisposable = commands.registerCommand(Commands.PLAY_START, async (source: Uri, workspaceUri?: Uri) => {
    if (recorder && recorder.isRecording) {
      UI.showMessage(MESSAGES.cantPlayWhileRecording);
      return;
    }

    // source and workspaceUri will be empty on a Command Palette execution.
    if (!source) {
      const itemSelected = await fsManager.chooseCodio();
      if (!itemSelected?.path) {
        UI.showModalMessage(MODAL_MESSAGE_OBJS.noActiveCodio);
        return;
      }
      source = Uri.file(itemSelected.path);
      workspaceUri = itemSelected.workspaceRoot;
    } else if (isTreeItem(source)) {
      // A tree item execution by button will have the source in a different format.
      const command = source['command'];
      source = command?.arguments[0];
      workspaceUri = command?.arguments[1];
    }

    funcs.playStart(fsManager, player, source, workspaceUri);
    FSManager.update();
  });

  const playStopDisposable = commands.registerCommand(Commands.PLAY_STOP, () => {
    funcs.playStop(player);
    FSManager.update();
  });

  const recordCancelDisposable = commands.registerCommand(Commands.RECORD_CANCEL, () => {
    funcs.recordCancel(recorder);
  });

  const recordPauseDisposable = commands.registerCommand(Commands.RECORD_PAUSE, () => {
    funcs.recordPause(recorder);
  });

  const recordResumeDisposable = commands.registerCommand(Commands.RECORD_RESUME, () => {
    funcs.recordResume(recorder);
  });

  const recordSaveDisposable = commands.registerCommand(Commands.RECORD_SAVE, () => {
    funcs.recordSave(recorder);
  });

  const recordStartDisposable = commands.registerCommand(Commands.RECORD_START, async () => {
    if (player.isPlaying) {
      player.stop();
    }

    const rp: RecordProject = await getRecordProject();
    if (rp.workspaceUri && rp.codioUri && rp.codioName) {
      const codioName = rp.codioName;
      funcs.recordStart(fsManager, recorder, rp.codioUri, rp.workspaceUri, codioName);
    }
  });

  context.subscriptions.push(playForwardDisposable);
  context.subscriptions.push(playGotoDisposable);
  context.subscriptions.push(playPauseDisposable);
  context.subscriptions.push(playResumeDisposable);
  context.subscriptions.push(playRewindDisposable);
  context.subscriptions.push(playStartDisposable);
  context.subscriptions.push(playStopDisposable);
  context.subscriptions.push(recordCancelDisposable);
  context.subscriptions.push(recordPauseDisposable);
  context.subscriptions.push(recordResumeDisposable);
  context.subscriptions.push(recordSaveDisposable);
  context.subscriptions.push(recordStartDisposable);
}

export function deactivate(): void {
  player.stop();
  recorder.stopRecording();
}
