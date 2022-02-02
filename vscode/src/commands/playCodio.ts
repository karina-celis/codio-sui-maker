import { commands, Uri, window, workspace } from 'vscode';
import { UI, MODAL_MESSAGE_OBJS } from '../user_interface/messages';
import Player from '../player/Player';
import FSManager from '../filesystem/FSManager';
import { isTreeItem } from '../utils';

export default async function playCodio(
  fsManager: FSManager,
  player: Player,
  codioUri?: Uri,
  workspaceUri?: Uri,
): Promise<void> {
  if (isTreeItem(codioUri)) {
    const command = codioUri['command'];
    codioUri = command?.arguments[0];
    workspaceUri = command?.arguments[1];
  }

  try {
    if (player && player.isPlaying) {
      player.stop();
    }

    if (codioUri) {
      const codioUnzippedFolder = await fsManager.getCodioUnzipped(codioUri);
      await loadAndPlay(player, codioUnzippedFolder, workspaceUri?.fsPath);
    } else {
      const itemSelected = await fsManager.chooseCodio();
      if (!itemSelected?.path) {
        UI.showModalMessage(MODAL_MESSAGE_OBJS.noActiveCodio);
        return;
      }
      //@TODO: add an if to check that the folder contains audio.mp3 and actions.json
      await loadAndPlay(player, itemSelected.path, itemSelected.workspaceRoot?.fsPath);
    }
  } catch (e) {
    console.log('Play codio failed', e);
  }
}

async function loadAndPlay(player: Player, path: string, workspacePath: string) {
  // Start with a clean workbench
  await commands.executeCommand('workbench.action.closeUnmodifiedEditors');
  for (let i = 0; i < workspace.textDocuments.length; i++) {
    const td = workspace.textDocuments[i];
    await window.showTextDocument(td.uri, { preview: false });
    const saved = await td.save();
    if (saved) {
      await commands.executeCommand('workbench.action.closeActiveEditor');
    } else {
      await commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
    }
  }

  await player.loadCodio(path, workspacePath);
  player.play(0);
  UI.showPlayerStatusBar(player);
}
