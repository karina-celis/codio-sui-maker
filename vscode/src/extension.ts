import { commands, ExtensionContext, Uri } from 'vscode';
import { UI, showCodioNameInputBox, MODAL_MESSAGE_OBJS, MESSAGES } from './user_interface/messages';
import Player from './player/Player';
import Recorder from './recorder/Recorder';
import { registerTreeViews } from './user_interface/Viewers';
import FSManager from './filesystem/FSManager';
import { codioCommands, CommandNames } from './commands';
import { getWorkspaceUriAndCodioDestinationUri } from './filesystem/workspace';
import { checkForFfmpeg, saveExtensionPath } from './utils';
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

  const recordCodioDisposable = commands.registerCommand(
    CommandNames.RECORD_CODIO,
    async (destination?: Uri, workspaceRoot?: Uri) => {
      codioCommands.recordCodio(fsManager, player, recorder, destination, workspaceRoot, showCodioNameInputBox);
    },
  );

  const recordCodioToProjectDisposable = commands.registerCommand(CommandNames.RECORD_CODIO_TO_PROJECT, async () => {
    const rp: RecordProject = await getWorkspaceUriAndCodioDestinationUri();
    if (rp.workspaceUri && rp.codioUri && rp.getCodioName) {
      codioCommands.recordCodio(fsManager, player, recorder, rp.codioUri, rp.workspaceUri, rp.getCodioName);
    }
  });

  const saveRecordingDisposable = commands.registerCommand(CommandNames.SAVE_RECORDING, () => {
    codioCommands.saveRecording(recorder);
  });

  const pauseRecordingDisposable = commands.registerCommand(CommandNames.PAUSE_RECORDING, () => {
    codioCommands.pauseRecording(recorder);
  });

  const resumeRecordingDisposable = commands.registerCommand(CommandNames.RESUME_RECORDING, () => {
    codioCommands.resumeRecording(recorder);
  });

  const cancelRecordingDisposable = commands.registerCommand(CommandNames.CANCEL_RECORDING, () => {
    codioCommands.cancelRecording(recorder);
  });

  const playCodioDisposable = commands.registerCommand(
    CommandNames.PLAY_CODIO,
    async (source: Uri, workspaceUri?: Uri) => {
      const hasFfmpeg = await checkForFfmpeg();
      if (!hasFfmpeg) {
        UI.showModalMessage(MODAL_MESSAGE_OBJS.ffmpegNotAvailable);
        return;
      }

      if (recorder && recorder.isRecording) {
        UI.showMessage(MESSAGES.cantPlayWhileRecording);
        return;
      }

      codioCommands.playCodio(fsManager, player, source, workspaceUri);
      FSManager.update();
    },
  );

  const playCodioTaskDisposable = commands.registerCommand(
    CommandNames.PLAY_CODIO_TASK,
    async (source: Uri, workspaceUri?: Uri) => {
      codioCommands.playCodioTask(fsManager, player, recorder, source, workspaceUri);
    },
  );

  const gotoDisposable = commands.registerCommand(CommandNames.PLAY_GOTO, async (time?: number) => {
    codioCommands.goto(player, time);
    FSManager.update();
  });

  const stopCodioDisposable = commands.registerCommand(CommandNames.STOP_CODIO, () => {
    codioCommands.stopCodio(player);
    FSManager.update();
  });

  const pauseCodioDisposable = commands.registerCommand(CommandNames.PAUSE_CODIO, () => {
    codioCommands.pauseCodio(player);
    FSManager.update();
  });

  const pauseOrResumeDisposable = commands.registerCommand(CommandNames.PAUSE_OR_RESUME, () => {
    codioCommands.pauseOrResume(player);
  });

  const resumeCodioDisposable = commands.registerCommand(CommandNames.RESUME_CODIO, () => {
    codioCommands.resumeCodio(player);
    FSManager.update();
  });

  const rewindDisposable = commands.registerCommand(CommandNames.REWIND, async (time?: number) => {
    codioCommands.rewind(player, time);
  });

  const forwardDisposable = commands.registerCommand(CommandNames.FORWARD, async (time?: number) => {
    codioCommands.forward(player, time);
  });

  const trimEnd = commands.registerCommand(CommandNames.TRIM_END, async () => {
    codioCommands.trimEnd(player);
  });

  context.subscriptions.push(recordCodioDisposable);
  context.subscriptions.push(saveRecordingDisposable);
  context.subscriptions.push(pauseRecordingDisposable);
  context.subscriptions.push(resumeRecordingDisposable);
  context.subscriptions.push(cancelRecordingDisposable);
  context.subscriptions.push(recordCodioToProjectDisposable);
  context.subscriptions.push(playCodioDisposable);
  context.subscriptions.push(playCodioTaskDisposable);
  context.subscriptions.push(stopCodioDisposable);
  context.subscriptions.push(pauseCodioDisposable);
  context.subscriptions.push(resumeCodioDisposable);
  context.subscriptions.push(gotoDisposable);
  context.subscriptions.push(rewindDisposable);
  context.subscriptions.push(forwardDisposable);
  context.subscriptions.push(pauseOrResumeDisposable);
  context.subscriptions.push(trimEnd);
}

export function deactivate(): void {
  player.stop();
  recorder.stopRecording();
}
