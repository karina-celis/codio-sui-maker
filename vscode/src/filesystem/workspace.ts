import * as vscode from 'vscode';
import { workspace, Uri } from 'vscode';
import { showCodioNameInputBox, UI, MODAL_MESSAGE_OBJS } from '../user_interface/messages';
import { basename, join } from 'path';
import { existsSync, mkdirSync } from 'fs';

const CODIO_EXT = '.codio';

const createWorkspaceCodioFolder = (workspaceUri: Uri) => {
  const codioWorkspaceFolder = join(workspaceUri.fsPath, CODIO_EXT);
  mkdirSync(codioWorkspaceFolder, { recursive: true });
  return codioWorkspaceFolder;
};

export const getRecordProject = async (): Promise<RecordProject> => {
  const rp: RecordProject = {
    codioUri: null,
    workspaceUri: null,
    codioName: null,
  };

  if (workspace.workspaceFolders) {
    let name = await showCodioNameInputBox();
    if (name) {
      rp.workspaceUri = workspace.workspaceFolders[0].uri;
      rp.codioUri = await getAvailableUri(name, rp.workspaceUri);
      name = basename(rp.codioUri.path, CODIO_EXT);
      rp.codioName = name;
    }
  } else {
    UI.showModalMessage(MODAL_MESSAGE_OBJS.noActiveWorkspace);
  }

  return rp;
};

/**
 * Get a URI that does not exist and safe to write to.
 * @param name Name to save codio to.
 * @param workspaceUri Workspace folder to save codio to.
 * @returns A safe Uri to write the new given codio to.
 */
const getAvailableUri = async (name: string, workspaceUri: Uri): Promise<vscode.Uri> => {
  let uri: Uri;
  let append = '';
  let count = 0;
  let filename;
  let fileStat: vscode.FileStat;
  const codioWorkspaceFolderPath = createWorkspaceCodioFolder(workspaceUri);

  do {
    filename = `${name.split(' ').join('_')}${append}${CODIO_EXT}`;
    uri = Uri.file(join(codioWorkspaceFolderPath, filename));
    try {
      fileStat = await vscode.workspace.fs.stat(uri);
      if (fileStat.type === vscode.FileType.File) {
        count++;
        append = `_${count.toString().padStart(2, '0')}`;
      }
    } catch (e) {
      // File doesn't exist and available to write to.
      fileStat = null;
    }
  } while (fileStat);

  return uri;
};

/**
 * Access workspace to get first workspace Uri and codio folder path.
 * @returns An object containing workspace root Uri and path to codio folder.
 */
export const getWorkspaceCodioData = (): { workspaceRootUri: Uri; workspaceCodioFolder: string } | undefined => {
  const workspaceRootUri = workspace.workspaceFolders[0]?.uri;
  if (workspaceRootUri) {
    const workspaceCodioFolder = join(workspaceRootUri.fsPath, CODIO_EXT);
    if (existsSync(workspaceCodioFolder)) {
      return { workspaceCodioFolder, workspaceRootUri };
    }
  }
};
