import { Uri } from 'vscode';
import { tmpdir } from 'os';
import {
  lstatSync,
  statSync,
  PathLike,
  readFileSync,
  writeFileSync,
  readdirSync,
  unlinkSync,
  mkdirSync,
  existsSync,
} from 'fs';
import { join } from 'path';
import { v4 as uuid } from 'uuid';
import { getWorkspaceRootAndCodiosFolder } from './workspace';
import Environment from '../environment/Environment';
import { choose } from '../user_interface/messages';

const onCodiosChangedSubscribers = [];
const EXTENSION_FOLDER = Environment.getInstance().getExtensionFolder();
const codiosFolder = join(EXTENSION_FOLDER, 'codios');

const CODIO_META_FILE = 'meta.json';
const CODIO_DEBUG_FILE = 'debug.json';
const CODIO_EDITOR_FILE = 'editor.json';

const URI_SEP = '/';

export default class FSManager {
  tempFolder: string;

  onCodiosChanged(func: () => unknown): void {
    onCodiosChangedSubscribers.push(func);
  }

  codioPath(codioId: string): string {
    return join(codiosFolder, codioId);
  }

  constructor() {
    this.tempFolder = tmpdir();
  }

  /**
   * Return path to editor JSON file.
   * @param codioPath Path to unzip codio file.
   * @returns Path to editor JSON file.
   */
  static editorPath(codioPath: string): string {
    return join(codioPath, CODIO_EDITOR_FILE);
  }

  static debugPath(codioPath: string): string {
    return join(codioPath, CODIO_DEBUG_FILE);
  }

  static audioPath(codioPath: string): string {
    return join(codioPath, 'audio.mp3');
  }

  /**
   * Return the path to the subtitles file.
   * @param codioPath Path to unzipped codio.
   */
  static subtitlesPath(codioPath: string): string {
    return join(codioPath, 'subtitles.srt');
  }

  static toRelativePath(uri: Uri, rootPath: string): string {
    const pathSplit = uri.path.split(URI_SEP);
    if (pathSplit.length === 1) {
      return pathSplit[0];
    }

    const rootPathSplit = rootPath.split(URI_SEP);
    const relativePath = pathSplit.slice(rootPathSplit.length).join(URI_SEP);

    return relativePath;
  }

  static async saveRecordingToFile(
    debugContent: string,
    editorContent: string,
    metaDataContent: string,
    codioPath: string,
    destinationFolder: Uri,
  ): Promise<void> {
    this.saveFile(join(codioPath, CODIO_DEBUG_FILE), debugContent);
    this.saveFile(join(codioPath, CODIO_EDITOR_FILE), editorContent);
    this.saveFile(join(codioPath, CODIO_META_FILE), metaDataContent);
    await this.zip(codioPath, destinationFolder.fsPath);
    this.update();
  }

  static saveFile(path: number | PathLike, content: string): void {
    try {
      writeFileSync(path, content);
      console.log('The file was saved!', path);
    } catch (e) {
      console.log('save file fail', e);
    }
  }

  /**
   * Save files found in given codio path to a zip file in given destination path.
   * @param srcPath Source folder where files live.
   * @param destPath Destination folder where created zip file will live.
   * @returns The destination string where the zip file was successfully saved.
   */
  static async zip(srcPath: string, destPath: string): Promise<string> {
    try {
      await Environment.getInstance().zip(srcPath, destPath);
      return `${destPath}`;
    } catch (e) {
      console.log(`zip for folder ${srcPath} failed`, e);
    }
  }

  /**
   * Alert subscribers that the configuration has changed.
   */
  static update(): void {
    onCodiosChangedSubscribers.forEach((func) => func());
  }

  async folderNameExists(folderName: string): Promise<boolean> {
    return existsSync(join(EXTENSION_FOLDER, folderName));
  }

  async createExtensionFolders(): Promise<void> {
    try {
      const extensionFolderExists = existsSync(EXTENSION_FOLDER);
      if (!extensionFolderExists) {
        mkdirSync(EXTENSION_FOLDER);
      }
      const codiosFolderExists = existsSync(codiosFolder);
      if (!codiosFolderExists) {
        mkdirSync(codiosFolder);
      }
    } catch (e) {
      console.log('Problem creating your extension folders', e);
    }
  }

  async createCodioFolder(folderName: string): Promise<string> {
    try {
      const path = join(codiosFolder, folderName);
      mkdirSync(path);
      return path;
    } catch (e) {
      console.log('Problem creating folder', e);
    }
  }

  async createTempCodioFolder(codioId: string): Promise<string> {
    try {
      const path = join(this.tempFolder, codioId);
      mkdirSync(path);
      return path;
    } catch (e) {
      console.log('Problem creating folder', e);
    }
  }

  getCodioUnzipped(uri: Uri): string | Promise<string> {
    if (lstatSync(uri.fsPath).isDirectory()) {
      return uri.fsPath;
    } else {
      return this.unzipCodio(uri.fsPath);
    }
  }

  async unzipCodio(srcPath: string): Promise<string> {
    const codioTempFolder = join(this.tempFolder, uuid());
    try {
      await Environment.getInstance().unzip(srcPath, codioTempFolder);
      return codioTempFolder;
    } catch (e) {
      console.log(`unzipping codio with path: ${srcPath} failed`, e);
    }
  }

  async deleteFilesInCodio(codioId: string): Promise<string> {
    const path = join(codiosFolder, codioId);
    const files = readdirSync(path);
    // currently I am assuming there won't be directories inside the directory
    await Promise.all(files.map((f) => unlinkSync(join(path, f))));
    return path;
  }

  async getCodiosUnzippedFromCodioFolder(folder: PathLike): Promise<unknown[]> {
    const folderContents = readdirSync(folder);
    return await Promise.all(
      folderContents
        .map((file) => {
          const fullPath = join(folder.toString(), file);
          if (statSync(fullPath).isDirectory()) {
            return fullPath;
          } else if (file.endsWith('.codio')) {
            return this.getCodioUnzipped(Uri.file(fullPath));
          }
        })
        .filter((folder) => !!folder),
    );
  }

  /**
   * Get codios found in given folder.
   * @param folder Folder containing codios to get.
   * @param workspaceRoot Optional URI for the root of the workspace.
   * @returns An array of codios found.
   */
  private async getCodios(folder = codiosFolder, workspaceRoot?: Uri): Promise<Codio[]> {
    const codios: Codio[] = [];

    try {
      const directories = await this.getCodiosUnzippedFromCodioFolder(folder);
      await Promise.all(
        directories.map(async (dir: string) => {
          codios.push({
            ...FSManager.getMetaData(dir),
            uri: Uri.file(dir),
            workspaceRoot,
          });
        }),
      );

      // Order codios by name.
      codios.sort((a: Metadata, b: Metadata) => {
        const nameA = a.name.toLowerCase();
        const nameB = b.name.toLowerCase();

        if (nameA < nameB) {
          return -1;
        } else if (nameA > nameB) {
          return 1;
        }

        return 0;
      });
    } catch (e) {
      console.log(`getCodios failed`, e);
    }

    return codios;
  }

  /**
   * Get workspace and library codio array.
   * @returns Array containing workspace and library codios.
   */
  async getAllCodiosMetadata(): Promise<Codio[]> {
    return [...(await this.getWorkspaceCodios()), ...(await this.getLibraryCodios())];
  }

  /**
   * Get workspace codio array.
   * @returns Array containing workspace codios.
   */
  async getWorkspaceCodios(): Promise<Codio[]> {
    const workspaceFolders = getWorkspaceRootAndCodiosFolder();
    return workspaceFolders
      ? await this.getCodios(workspaceFolders.workspaceCodiosFolder, workspaceFolders.workspaceRootUri)
      : [];
  }

  /**
   * Get library codio array.
   * @returns Array containing library codios.
   */
  async getLibraryCodios(): Promise<Codio[]> {
    return await this.getCodios();
  }

  /**
   * Get metadata file data.
   * @param codioFolderPath Path to codio zip file containing metadata file.
   * @returns Metadata object.
   */
  static getMetaData(codioFolderPath: string): Metadata {
    try {
      const metaData = readFileSync(join(codioFolderPath, CODIO_META_FILE));
      return JSON.parse(metaData.toString());
    } catch (e) {
      console.log(`Problem getting codio ${codioFolderPath} meta data`, e);
    }
  }

  async chooseCodio(): Promise<{ path: string; workspaceRoot?: Uri } | undefined> {
    return choose(await this.getAllCodiosMetadata());
  }
}
