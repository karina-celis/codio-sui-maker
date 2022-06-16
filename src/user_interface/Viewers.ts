import * as vscode from 'vscode';
import FSManager from '../filesystem/FSManager';
import { join } from 'path';
import * as parser from 'subtitles-parser-vtt';
import { Commands } from '../commands';

export async function registerTreeViews(fsManager: FSManager, extensionPath: string): Promise<void> {
  const codioTreeDataProvider = new CodiosDataProvider(fsManager, extensionPath);
  vscode.window.createTreeView('codioMessages', { treeDataProvider: codioTreeDataProvider });
  fsManager.onCodiosChanged(() => codioTreeDataProvider.refresh());
  vscode.workspace.onDidChangeWorkspaceFolders(() => codioTreeDataProvider.refresh());
}

export class CodiosDataProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private fsManager: FSManager;
  private extensionPath: string;

  _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem | undefined> = new vscode.EventEmitter<
    vscode.TreeItem | undefined
  >();
  onDidChangeTreeData: vscode.Event<vscode.TreeItem | undefined> = this._onDidChangeTreeData.event;

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  constructor(fsManager: FSManager, extensionPath: string) {
    this.fsManager = fsManager;
    this.extensionPath = extensionPath;
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(): vscode.TreeItem[] {
    const workspaceCodios = this.fsManager.getWorkspaceCodios();

    if (!workspaceCodios.length) {
      return [new RecordActionItem(this.extensionPath)];
    }

    return workspaceCodios.map((codio) => new CodioItem(codio, this.extensionPath));
  }
}

/**
 * Creates an interactive item to record a codio.
 */
class RecordActionItem extends vscode.TreeItem {
  constructor(extensionPath: string) {
    super('Record Codio');
    this.iconPath = {
      dark: join(extensionPath, 'media/dark/mic.svg'),
      light: join(extensionPath, 'media/light/mic.svg'),
    };
    this.tooltip = 'Record Codio';
    this.command = {
      command: Commands.RECORD_START,
      title: '',
    };
  }
}

/**
 * Creates an interactive item to play a codio.
 */
class CodioItem extends vscode.TreeItem {
  constructor(codio: Codio, extensionPath: string) {
    super(codio.name);
    this.iconPath = {
      dark: join(extensionPath, 'media/dark/logo.svg'),
      light: join(extensionPath, 'media/light/logo.svg'),
    };
    this.command = {
      command: Commands.PLAY_START,
      title: 'Play Start',
      arguments: [codio.uri, codio.workspaceRoot],
    };
    this.description = this.getTimeDescription(codio.length);
    this.tooltip = this.getMsTooltip(codio.length);
    this.contextValue = 'codio';
  }

  /**
   * Format given milliseconds to ISO 8601 time format.
   * @param ms Milliseconds to format.
   * @returns ISO 8601 time format from given milliseconds.
   */
  private getTimeDescription(ms: number): string {
    const roundedSec = Math.round(+('0.' + (ms % 1000))) * 1000;
    const srt = parser.msToSrt(ms + roundedSec);
    return `${srt.split(',')[0]}`;
  }

  /**
   * Format given milliseconds to human readable format.
   * @param ms Milliseconds to format.
   * @returns Formatted milliseconds given.
   */
  private getMsTooltip(ms: number): string {
    return Intl.NumberFormat('en-US', {
      style: 'unit',
      unit: 'millisecond',
      unitDisplay: 'narrow',
    }).format(ms);
  }
}

export const cursorStyle = vscode.window.createTextEditorDecorationType({
  dark: {
    backgroundColor: vscode.workspace.getConfiguration('codio').get<string>('cursorColorDarkTheme'),
  },
  light: {
    backgroundColor: vscode.workspace.getConfiguration('codio').get<string>('cursorColorLightTheme'),
  },
  borderStyle: 'solid',
  borderWidth: '1px',
});
