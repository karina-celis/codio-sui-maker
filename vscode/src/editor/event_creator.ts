import {
  TextDocumentChangeEvent,
  TextEditorSelectionChangeEvent,
  TextEditor,
  TextEditorVisibleRangesChangeEvent,
  Uri,
  TextDocument,
} from 'vscode';

import { CODIO_EXEC, CODIO_EDITOR_CHANGED, DocumentEvents } from './consts';

export function createDocumentEvent(
  type: DocumentEvents,
  uri: Uri,
  content?: string,
  isUntitled?: boolean,
  languageId?: string,
  viewColumn?: number,
): DocumentEvent {
  return {
    type,
    data: {
      languageId,
      isUntitled,
      uri,
      content,
      time: Date.now(),
      viewColumn,
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
      visibleRange: e.visibleRanges[0],
      viewColumn: e.textEditor.viewColumn,
    },
  } as DocumentVisibleRangeEvent;
}

/**
 * Create event when a text document is visible.
 * @param td Text document that is visible.
 * @param viewColumn The view column in which given text document is visible.
 * @returns New event with given data.
 */
export function createDocumentVisibleEvent(td: TextDocument, viewColumn: number): DocumentVisibleEvent {
  return createEventType(DocumentEvents.DOCUMENT_VISIBLE, td, viewColumn) as DocumentVisibleEvent;
}

/**
 * Create event when a text editor's viewColumn changes to or from 3.
 * @note Processed differently than createDocumentVisibleEvent.
 * @param td Text document that changed.
 * @param viewColumn New view column number.
 * @returns New event with given data.
 */
export function createDocumentViewColumnEvent(td: TextDocument, viewColumn: number): DocumentViewColumnEvent {
  return createEventType(DocumentEvents.DOCUMENT_VIEW_COLUMN, td, viewColumn) as DocumentViewColumnEvent;
}

/**
 * Create event when a text editor was grouped.
 * @param td Text document that was grouped.
 * @param viewColumn View column of document that got grouped.
 * @returns New event with given data.
 */
export function createDocumentGroupEvent(td: TextDocument, viewColumn: number): DocumentGroupEvent {
  return createEventType(DocumentEvents.DOCUMENT_GROUP, td, viewColumn) as DocumentGroupEvent;
}

/**
 * Create event when a text editor was ungrouped.
 * @param td Text document that was ungrouped.
 * @param viewColumn View column of document that got ungrouped.
 * @returns New event with given data.
 */
export function createDocumentUngroupEvent(td: TextDocument, viewColumn: number): DocumentUngroupEvent {
  return createEventType(DocumentEvents.DOCUMENT_UNGROUP, td, viewColumn) as DocumentUngroupEvent;
}

/**
 * Create an event of given type with given data.
 * @param type Type of event to create.
 * @param td Text document for event.
 * @param viewColumn View column for event.
 * @returns New event of type with given data.
 */
function createEventType(type: DocumentEvents, td: TextDocument, viewColumn: number): DocumentEvent {
  return {
    type,
    data: {
      isUntitled: td.isUntitled,
      time: Date.now(),
      uri: td.uri,
      viewColumn,
    },
  } as DocumentEvent;
}

export function createDocumentFoldEvent(
  e: TextEditorVisibleRangesChangeEvent,
  startLine: number,
  direction: string,
): DocumentFoldEvent {
  return {
    type: DocumentEvents.DOCUMENT_FOLD,
    data: {
      isUntitled: e.textEditor.document.isUntitled,
      time: Date.now(),
      uri: e.textEditor.document.uri,
      startLine,
      direction,
      viewColumn: e.textEditor.viewColumn,
    },
  } as DocumentFoldEvent;
}

export function createDocumentSelectionEvent(e: TextEditorSelectionChangeEvent): DocumentSelectionEvent {
  return {
    type: DocumentEvents.DOCUMENT_SELECTION,
    data: {
      isUntitled: e.textEditor.document.isUntitled,
      uri: e.textEditor.document.uri,
      selections: e.selections,
      time: Date.now(),
      viewColumn: e.textEditor.viewColumn,
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

// @Note Deprecated
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

export function isDocumentChangeEvent(event: CodioEvent): event is DocumentChangeEvent {
  return event.type === DocumentEvents.DOCUMENT_CHANGE;
}

export function isSerializedDocumentChangeEvent(
  event: SerializedDocumentEvent,
): event is SerializedDocumentChangeEvent {
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

// @Note Deprecated
export function isEditorEvent(event: CodioEvent): event is CodioChangeActiveEditorEvent {
  return event.type === CODIO_EDITOR_CHANGED;
}

// @Note Deprecated
export function isSerializedEditorEvent(
  event: SerializedDocumentEvent,
): event is CodioSerializedChangeActiveEditorEvent {
  return event.type === CODIO_EDITOR_CHANGED;
}
