import { commands, Uri, window, workspace } from 'vscode';
import { UI } from '../user_interface/messages';
import Player from '../player/Player';
import FSManager from '../filesystem/FSManager';
import { schemeSupported } from '../utils';

/**
 * Start playing a codio.
 * This command can be executed multiple ways:
 * * Command Palette
 * * Side Bar Viewer
 * * Side Bar Viewer Item
 * * Status Bar Hover and Command
 */
export default async function playStart(
  fsManager: FSManager,
  player: Player,
  codioUri: Uri,
  workspaceUri: Uri,
): Promise<void> {
  try {
    if (player && player.isPlaying) {
      player.stop();
    }

    const path = fsManager.getUnzippedCodioFolder(codioUri);
    await loadAndPlay(player, path, workspaceUri.fsPath);
  } catch (e) {
    console.error('Play codio failed', e);
  }
}

async function loadAndPlay(player: Player, path: string, workspacePath: string) {
  console.log('window.visibleTextEditors', window.visibleTextEditors);
  console.log('workspace.textDocuments', workspace.textDocuments);

  // Start with a clean workbench
  await commands.executeCommand('workbench.action.closeUnmodifiedEditors');
  let total = workspace.textDocuments.length;
  while (total--) {
    const td = workspace.textDocuments[total];
    if (!schemeSupported(td.uri.scheme)) {
      continue;
    }

    console.log('loadAndPlay Showing td', td);

    await window.showTextDocument(td.uri, { preview: false });
    const saved = await td.save();
    if (saved) {
      await commands.executeCommand('workbench.action.closeActiveEditor');
    } else {
      await commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
    }
  }

  try {
    await player.loadCodio(path, workspacePath);
    player.play(0);
    UI.showPlayerStatusBar(player);
  } catch (e) {
    console.error(e.message);
  }
}
