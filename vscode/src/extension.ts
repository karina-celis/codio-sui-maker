import { commands, ExtensionContext, Uri } from 'vscode';
import { UI, MODAL_MESSAGE_OBJS, MESSAGES } from './user_interface/messages';
import Player from './player/Player';
import Recorder from './recorder/Recorder';
import { registerTreeViews } from './user_interface/Viewers';
import FSManager from './filesystem/FSManager';
import { funcs, Commands } from './commands';
import { getRecordProject } from './filesystem/workspace';
import { checkForFFmpeg, saveExtensionPath } from './utils';
import Environment from './environment/Environment';

const fsManager = new FSManager();
const player = new Player();
const recorder = new Recorder();

export async function activate(context: ExtensionContext): Promise<void> {
  saveExtensionPath(context.extensionPath);
  await Environment.getInstance().resolveDependencies();

  await fsManager.createExtensionFolders();
  UI.shouldDisplayMessages = true;
  UI.createStatusBar(context);
  registerTreeViews(fsManager, context.extensionPath);

  const playForwardDisposable = commands.registerCommand(Commands.PLAY_FORWARD, async (time?: number) => {
    funcs.playForward(player, time);
  });

  const playGotoDisposable = commands.registerCommand(Commands.PLAY_GOTO, async (time?: number) => {
    funcs.playGoto(player, time);
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

  const playRewindDisposable = commands.registerCommand(Commands.PLAY_REWIND, async (time?: number) => {
    funcs.playRewind(player, time);
  });

  const playStartDisposable = commands.registerCommand(Commands.PLAY_START, async (source: Uri, workspaceUri?: Uri) => {
    const hasFFmpeg = checkForFFmpeg();
    if (!hasFFmpeg) {
      UI.showModalMessage(MODAL_MESSAGE_OBJS.ffmpegNotAvailable);
      return;
    }

    if (recorder && recorder.isRecording) {
      UI.showMessage(MESSAGES.cantPlayWhileRecording);
      return;
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
    const hasFFmpeg = checkForFFmpeg();
    if (!hasFFmpeg) {
      UI.showModalMessage(MODAL_MESSAGE_OBJS.ffmpegNotAvailable);
      return;
    }

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
