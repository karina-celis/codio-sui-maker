import { Uri } from 'vscode';
import { tmpdir } from 'os';
import { lstatSync, PathLike, readFileSync, writeFileSync, readdirSync, mkdirSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { getWorkspaceCodioData } from './workspace';
import { choose, ProgressObserver, UI } from '../user_interface/messages';
import { compress, decompress } from './zlib_utils';

const onCodiosChangedSubscribers = [];

const CODIO_AUDIO_FILE = 'audio.mp3';
const CODIO_DEBUG_FILE = 'debug.json';
const CODIO_EDITOR_FILE = 'editor.json';
const CODIO_META_FILE = 'meta.json';
const CODIO_SUBTITLE_FILE = 'subtitles.srt';

const URI_SEP = '/';

export default class FSManager {
  tempFolder: string;

  constructor() {
    this.tempFolder = tmpdir();
  }

  onCodiosChanged(func: () => unknown): void {
    onCodiosChangedSubscribers.push(func);
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
    return join(codioPath, CODIO_AUDIO_FILE);
  }

  /**
   * Return the path to the subtitles file.
   * @param codioPath Path to unzipped codio.
   */
  static subtitlesPath(codioPath: string): string {
    return join(codioPath, CODIO_SUBTITLE_FILE);
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
    const obs = new ProgressObserver(0, false);

    UI.showProgress('Save Files', obs);
    obs.update(33, `Saving '${CODIO_DEBUG_FILE}'.`);
    this.saveFile(join(codioPath, CODIO_DEBUG_FILE), debugContent);
    obs.update(67, `Saving '${CODIO_EDITOR_FILE}'.`);
    this.saveFile(join(codioPath, CODIO_EDITOR_FILE), editorContent);
    obs.update(100, `Saving '${CODIO_META_FILE}'.`);
    this.saveFile(join(codioPath, CODIO_META_FILE), metaDataContent);
    obs.done();

    UI.showProgress('Compressing Archive', obs);
    compress(codioPath, destinationFolder.fsPath);
    obs.done();

    this.update();
  }

  static saveFile(path: number | PathLike, content: string): void {
    try {
      writeFileSync(path, content);
      console.log('The file was saved!', path);
    } catch (e) {
      console.error(`Saving file: ${path} fail`, e);
    }
  }

  /**
   * Alert subscribers that the configuration has changed.
   */
  static update(): void {
    onCodiosChangedSubscribers.forEach((func) => func());
  }

  createTempCodioFolder(): string {
    const path = join(this.tempFolder, randomUUID());
    try {
      mkdirSync(path);
      return path;
    } catch (e) {
      console.log(`Problem creating folder ${this.tempFolder}`, e);
    }
  }

  /**
   * Get an array of unzipped codios from given path.
   * @param folder .codio folder containing codios.
   * @returns An array of unzipped codio paths.
   */
  private getCodioPathsFromFolder(folder: PathLike): string[] {
    const folderContents = readdirSync(folder);
    return folderContents
      .map((file) => {
        const fullPath = join(folder.toString(), file);
        const fileUri = Uri.file(fullPath);
        return this.getUnzippedCodioFolder(fileUri);
      })
      .filter((folder) => !!folder);
  }

  /**
   * Get the unzipped codio folder.
   * @param uri Uri to check if it already exists.
   * @returns Unzipped codio folder path.
   */
  getUnzippedCodioFolder(uri: Uri): string {
    if (lstatSync(uri.fsPath).isDirectory()) {
      return uri.fsPath;
    } else if (uri.fsPath.endsWith('.codio')) {
      return this.unzipCodio(uri.fsPath);
    }
  }

  /**
   * Unzip given source path to a temporary folder.
   * @param srcPath Source path to unzip.
   * @returns Temporary folder path of unzipped source.
   */
  private unzipCodio(srcPath: string): string {
    const codioTempFolder = this.createTempCodioFolder();
    try {
      decompress(srcPath, codioTempFolder);
      return codioTempFolder;
    } catch (e) {
      console.error(`unzipping codio with path: ${srcPath} failed`, e);
    }
  }

  /**
   * Get codios found in given folder.
   * @param folder Folder containing codios to get.
   * @param workspaceRoot Uri for the root of the workspace.
   * @returns An array of codios found.
   */
  private getCodios(folder: string, workspaceRoot: Uri): Codio[] {
    const codios: Codio[] = [];

    try {
      const codioPaths = this.getCodioPathsFromFolder(folder);
      codioPaths.map((path: string) => {
        codios.push({
          ...FSManager.getMetadata(path),
          uri: Uri.file(path),
          workspaceRoot,
        });
      });

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
      console.error(`getCodios failed`, e);
    }

    return codios;
  }

  /**
   * Get workspace codio array.
   * @returns An array containing workspace codios.
   */
  getWorkspaceCodios(): Codio[] {
    const workspaceCodioData = getWorkspaceCodioData();
    return workspaceCodioData
      ? this.getCodios(workspaceCodioData.workspaceCodioFolder, workspaceCodioData.workspaceRootUri)
      : [];
  }

  /**
   * Get metadata file data.
   * @param codioFolderPath Path to codio zip file containing metadata file.
   * @returns Metadata object.
   */
  static getMetadata(codioFolderPath: string): Metadata {
    try {
      const metaData = readFileSync(join(codioFolderPath, CODIO_META_FILE));
      return JSON.parse(metaData.toString());
    } catch (e) {
      console.warn(`Problem getting codio ${codioFolderPath} metadata`, e);
    }
  }

  async chooseCodio(): Promise<{ path: string; workspaceRoot?: Uri } | undefined> {
    return choose(this.getWorkspaceCodios());
  }
}
