import { Uri } from 'vscode';
import { UI, MESSAGES, MODAL_MESSAGE_OBJS } from '../user_interface/messages';
import Player from '../player/Player';
import Recorder from '../recorder/Recorder';
import FSManager from '../filesystem/FSManager';
import { checkForFfmpeg, isTreeItem } from '../utils';

export default async function playCodio(
  fsManager: FSManager,
  player: Player,
  recorder: Recorder,
  codioUri?: Uri,
  workspaceUri?: Uri,
): Promise<void> {
  if (isTreeItem(codioUri)) {
    const command = codioUri['command'];
    codioUri = command?.arguments[0];
    workspaceUri = command?.arguments[1];
  }

  try {
    const hasFfmpeg = await checkForFfmpeg();
    if (!hasFfmpeg) {
      UI.showModalMessage(MODAL_MESSAGE_OBJS.ffmpegNotAvailable);
      return;
    }

    if (recorder && recorder.isRecording) {
      UI.showMessage(MESSAGES.cantPlayWhileRecording);
      return;
    }

    if (player && player.isPlaying) {
      player.stop();
    }

    if (codioUri) {
      const codioUnzippedFolder = await fsManager.getCodioUnzipped(codioUri);
      await loadAndPlay(player, codioUnzippedFolder, workspaceUri?.fsPath);
    } else {
      const itemSelected = await fsManager.chooseCodio();
      if (itemSelected?.path) {
        //@TODO: add an if to check that the folder contains audio.mp3 and actions.json
        await loadAndPlay(player, itemSelected.path, itemSelected.workspaceRoot?.fsPath);
      }
    }
  } catch (e) {
    console.log('Play codio failed', e);
  }
}

async function loadAndPlay(player: Player, path: string, workspacePath: string) {
  await player.loadCodio(path, workspacePath);
  await player.startCodio();
  UI.showPlayerStatusBar(player);
}
