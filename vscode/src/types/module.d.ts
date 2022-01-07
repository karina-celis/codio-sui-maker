// import { DocumentEvents } from '../editor/consts';

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
    uri: Uri;
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

declare interface CodioSerializedEvent {
  type: string | number;
  data: {
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

declare interface CodioSerializedTextEvent extends CodioSerializedEvent {
  type: number;
  data: {
    path: string;
    changes: readonly TextDocumentContentChangeEvent[];
    time: number;
  };
}

declare interface CodioVisibleRangeEvent extends CodioEvent {
  type: 'visibleRange';
  data: {
    uri: Uri;
    time: number;
    visibleRange: vscode.Range;
  };
}

declare interface CodioSerializedVisibleRangeEvent extends CodioSerializedEvent {
  type: 'visibleRange';
  data: {
    path: string;
    time: number;
    visibleRange: vscode.Range;
  };
}
declare interface CodioSelectionEvent extends CodioEvent {
  type: 'selection';
  data: {
    uri: Uri;
    selections: readonly vscode.Selection[];
    time: number;
  };
}

declare interface CodioSerializedSelectionEvent extends CodioSerializedEvent {
  type: 'selection';
  data: {
    path: string;
    selections: vscode.Selection[];
    time: number;
  };
}

declare interface CodioExecutionEvent extends CodioEvent {
  type: 'exec';
  data: {
    executionOutput: string;
    time: number;
  };
}

declare interface CodioSerializedExecutionEvent extends CodioSerializedEvent {
  type: 'exec';
  data: {
    executionOutput: string;
    time: number;
  };
}

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

declare interface CodioSerializedChangeActiveEditorEvent {
  type: 'editor';
  data: {
    path: string;
    time: number;
    isInitial: boolean;
    content: string;
    viewColumn: ViewColumn;
    visibleRange: [
      {
        line: number;
        character: number;
      },
      {
        line: number;
        character: number;
      },
    ];
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
  events: CodioSerializedEvent[];
  initialFrame: CodioSerializedFile[];
}

declare interface TimelineContent {
  openDocuments: sting[];
  events: CodioSerializedEvent[];
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

declare type CodioFrame = Array<CodioFile>;
