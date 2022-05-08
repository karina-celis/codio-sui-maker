declare interface Metadata {
  length: number;
  name: string;
  version: string;
}

declare interface Codio extends Metadata {
  uri: Uri;
  workspaceRoot?: Uri;
}

declare interface RecordProject {
  workspaceUri: Uri;
  codioUri: Uri;
  getCodioName: () => Promise<string>;
}

declare interface CodioEvent {
  type: string | number;
  data: {
    uri?: Uri | undefined;
    time: number;
  };
}

declare interface DocumentEvent {
  type: number;
  data: {
    viewColumn?: number;
    languageId?: string;
    isUntitled?: boolean;
    uri?: Uri;
    content?: string;
    time: number;
  };
}

declare interface DocumentRenameEvent extends DocumentEvent {
  type: number;
  data: {
    oldUri: Uri;
    newUri: Uri;
    content?: string;
    time: number;
  };
}

declare interface SerializedDocumentEvent {
  type: number | string;
  data: {
    languageId?: string;
    isUntitled?: boolean;
    path?: string | undefined;
    oldPath?: string | undefined;
    newPath?: string | undefined;
    content?: string | undefined;
    time: number;
  };
}
declare interface DocumentChangeEvent extends DocumentEvent {
  type: number;
  data: {
    uri: Uri;
    changes: readonly TextDocumentContentChangeEvent[];
    time: number;
  };
}

declare interface SerializedDocumentChangeEvent extends SerializedDocumentEvent {
  type: number;
  data: {
    path: string;
    changes: readonly TextDocumentContentChangeEvent[];
    time: number;
  };
}

declare interface DocumentVisibleEvent extends DocumentEvent {
  type: number;
  data: {
    uri: Uri;
    time: number;
    viewColumn: number;
  };
}

/**
 * Handled differently when processed.
 */
declare interface DocumentViewColumnEvent extends DocumentEvent {
  type: number;
  data: {
    uri: Uri;
    time: number;
    viewColumn: number;
  };
}

/**
 * Handled differently when processed.
 */
declare interface DocumentGroupEvent extends DocumentEvent {
  type: number;
  data: {
    uri: Uri;
    time: number;
    viewColumn: number;
  };
}

/**
 * Handled differently when processed.
 */
declare interface DocumentUngroupEvent extends DocumentEvent {
  type: number;
  data: {
    uri: Uri;
    time: number;
    viewColumn: number;
  };
}

declare interface DocumentFoldEvent extends DocumentEvent {
  type: number;
  data: {
    uri: Uri;
    time: number;
    startLine: number;
    direction: string;
    viewColumn: number;
  };
}

declare interface DocumentVisibleRangeEvent extends DocumentEvent {
  type: number;
  data: {
    uri: Uri;
    time: number;
    visibleRange: vscode.Range;
    viewColumn: number;
  };
}

declare interface SerializedDocumentVisibleRangeEvent extends SerializedDocumentEvent {
  type: number;
  data: {
    path: string;
    time: number;
    visibleRange: vscode.Range;
    viewColumn: number;
  };
}
declare interface DocumentSelectionEvent extends DocumentEvent {
  type: number;
  data: {
    uri: Uri;
    selections: readonly vscode.Selection[];
    time: number;
    viewColumn: number;
  };
}

declare interface SerializedDocumentSelectionEvent extends SerializedDocumentEvent {
  type: number;
  data: {
    path: string;
    selections: vscode.Selection[];
    time: number;
    viewColumn: number;
  };
}

declare interface CodioExecutionEvent extends CodioEvent {
  type: 'exec';
  data: {
    executionOutput: string;
    time: number;
  };
}

declare interface CodioSerializedExecutionEvent extends SerializedDocumentEvent {
  type: 'exec';
  data: {
    executionOutput: string;
    time: number;
  };
}

// @Note Deprecated
declare interface CodioChangeActiveEditorEvent extends CodioEvent {
  type: 'editor';
  data: {
    uri: Uri;
    time: number;
    isInitial: boolean;
    content: string;
    viewColumn: ViewColumn;
    visibleRange: vscode.Range;
    selections: readonly vscode.Selection[];
  };
}

// @Note Deprecated
declare interface CodioSerializedChangeActiveEditorEvent {
  type: 'editor';
  data: {
    path: string;
    time: number;
    isInitial: boolean;
    content: string;
    viewColumn: ViewColumn;
    visibleRange: vscode.Range;
    selections: vscode.Selection[];
  };
}

declare interface IntitialFileContent {
  content: string;
  uri: Uri;
}

declare interface CodioFile {
  document: ShadowDocument;
  column: ViewColumn;
  uri: Uri;
  lastAction: number;
}

declare interface CodioSerializedFile {
  text: string;
  column: number;
  path: string;
  lastActionCount: number;
}

declare interface Timeline {
  codioLength: number;
  events: SerializedDocumentEvent[];
  initialFrame: CodioSerializedFile[];
}

declare interface TimelineContent {
  openDocuments: sting[];
  events: SerializedDocumentEvent[];
  initialFrame: CodioSerializedFile[];
}

declare interface Device {
  id?: number;
  alternativeName?: string;
  name: string;
}

declare interface DeviceList {
  videoDevices: Device[];
  audioDevices: Device[];
}

declare interface ModalMessage {
  msg: string;
  detail?: string;
}

declare type CodioFrame = Array<CodioFile>;
