import {
  TextDocumentChangeEvent,
  TextEditorSelectionChangeEvent,
  TextEditor,
  TextEditorVisibleRangesChangeEvent,
  Uri,
} from 'vscode';

import { CODIO_EXEC, CODIO_EDITOR_CHANGED, DocumentEvents } from './consts';

export function createDocumentEvent(
  type: DocumentEvents,
  uri: Uri,
  content?: string,
  isUntitled?: boolean,
): DocumentEvent {
  return {
    type,
    data: {
      isUntitled,
      uri,
      content,
      time: Date.now(),
    },
  } as DocumentEvent;
}

export function createDocumentRenameEvent(oldUri: Uri, newUri: Uri, content: string): DocumentRenameEvent {
  return {
    type: DocumentEvents.DOCUMENT_RENAME,
    data: {
      oldUri,
      newUri,
      content,
      time: Date.now(),
    },
  } as DocumentRenameEvent;
}

export function createDocumentChangeEvent(e: TextDocumentChangeEvent): DocumentChangeEvent {
  return {
    type: DocumentEvents.DOCUMENT_CHANGE,
    data: {
      isUntitled: e.document.isUntitled,
      uri: e.document.uri,
      changes: e.contentChanges,
      time: Date.now(),
    },
  } as DocumentChangeEvent;
}

export function createDocumentVisibleRangeEvent(e: TextEditorVisibleRangesChangeEvent): DocumentVisibleRangeEvent {
  return {
    type: DocumentEvents.DOCUMENT_VISIBLE_RANGE,
    data: {
      isUntitled: e.textEditor.document.isUntitled,
      time: Date.now(),
      uri: e.textEditor.document.uri,
      //@TODO: Currently does not support folding.
      visibleRange: e.visibleRanges[0],
    },
  } as DocumentVisibleRangeEvent;
}

export function createDocumentSelectionEvent(e: TextEditorSelectionChangeEvent): DocumentSelectionEvent {
  return {
    type: DocumentEvents.DOCUMENT_SELECTION,
    data: {
      isUntitled: e.textEditor.document.isUntitled,
      uri: e.textEditor.document.uri,
      selections: e.selections,
      time: Date.now(),
    },
  } as DocumentSelectionEvent;
}

export function createCodioExecutionEvent(output: string): CodioExecutionEvent {
  return {
    type: CODIO_EXEC,
    data: {
      executionOutput: output,
      time: Date.now(),
    },
  };
}

export function createCodioEditorEvent(
  e: TextEditor,
  content: string,
  isInitial: boolean,
): CodioChangeActiveEditorEvent {
  return {
    type: CODIO_EDITOR_CHANGED,
    data: {
      uri: e.document.uri,
      isInitial,
      content,
      viewColumn: e.viewColumn,
      visibleRange: e.visibleRanges[0],
      selections: e.selections,
      time: Date.now(),
    },
  };
}

export function isTextEvent(event: CodioEvent): event is DocumentChangeEvent {
  return event.type === DocumentEvents.DOCUMENT_CHANGE;
}

export function isSerializedTextEvent(event: SerializedDocumentEvent): event is SerializedDocumentChangeEvent {
  return event.type === DocumentEvents.DOCUMENT_CHANGE;
}

export function isSelectionEvent(event: CodioEvent): event is DocumentSelectionEvent {
  return event.type === DocumentEvents.DOCUMENT_SELECTION;
}

export function isSerializedSelectionEvent(event: CodioEvent): event is SerializedDocumentSelectionEvent {
  return event.type === DocumentEvents.DOCUMENT_SELECTION;
}

export function isVisibleRangeEvent(event: CodioEvent): event is DocumentVisibleRangeEvent {
  return event.type === DocumentEvents.DOCUMENT_VISIBLE_RANGE;
}

export function isSerializedVisibleRangeEvent(
  event: SerializedDocumentEvent,
): event is SerializedDocumentVisibleRangeEvent {
  return event.type === DocumentEvents.DOCUMENT_VISIBLE_RANGE;
}

export function isExecutionEvent(event: CodioEvent): event is CodioExecutionEvent | CodioSerializedExecutionEvent {
  return event.type === CODIO_EXEC;
}

export function isEditorEvent(event: CodioEvent): event is CodioChangeActiveEditorEvent {
  return event.type === CODIO_EDITOR_CHANGED;
}

export function isSerializedEditorEvent(
  event: SerializedDocumentEvent,
): event is CodioSerializedChangeActiveEditorEvent {
  return event.type === CODIO_EDITOR_CHANGED;
}
