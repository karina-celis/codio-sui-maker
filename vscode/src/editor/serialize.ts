import { Position, Range } from 'vscode';
import FSManager from '../filesystem/FSManager';
import { DocumentEvents } from './consts';
import { isTextEvent } from './event_creator';

export default function serialize(events: DocumentEvent[], rootPath: string): SerializedDocumentEvent[] {
  return events
    .map((event) => {
      const se = serializeEvent(event, rootPath);
      console.log('event serialized', event, se);
      return se;
    })
    .filter((event) => !!event);
}

function serializeEvent(event: DocumentEvent, rootPath): SerializedDocumentEvent {
  if (isTextEvent(event)) {
    return serializeTextEvent(event, rootPath);
  } else if (event.type === DocumentEvents.DOCUMENT_RENAME) {
    return serializeRenameEvent(event as DocumentRenameEvent, rootPath);
  } else {
    //if (isSelectionEvent(event) || isEditorEvent(event) || isExecutionEvent(event) || isVisibleRangeEvent(event)) {
    return serializeFilePath(event, rootPath);
  }
}

function serializeTextEvent(event: DocumentChangeEvent, rootPath): SerializedDocumentChangeEvent {
  serializeFilePath(event, rootPath);
  if (event.data.changes.length === 0) {
    console.log('serializeTextEvent with 0 length', event);
    //@TODO: figure out which actions do not have a change
    return undefined;
  }
  const { uri, ...eventData } = event.data;
  const serializedEvent = {
    ...event,
    data: {
      ...eventData,
      path: FSManager.toRelativePath(uri, rootPath),
      changes: [],
    },
  };
  serializedEvent.data.changes = event.data.changes.map((change) => {
    const range = change.range;
    const rangeLength = change.rangeLength;
    const startPosition = new Position(range.start.line, range.start.character);
    const endPosition = new Position(range.end.line, range.end.character);
    if (rangeLength === 0) {
      return { position: startPosition, value: change.text };
    }
    return { range: new Range(startPosition, endPosition), value: change.text };
  });
  return serializedEvent;
}

function serializeFilePath(event: DocumentEvent, rootPath): SerializedDocumentEvent {
  if (event.data.uri) {
    const { uri, ...eventData } = event.data;
    const newEvent = {
      ...event,
      data: {
        ...eventData,
        path: FSManager.toRelativePath(uri, rootPath),
      },
    };
    return newEvent;
  }
}

/**
 * Serialize given DocumentRenameEvent.
 * @param event DocumentRenameEvent to serialize.
 * @param rootPath Root path of workspace.
 * @returns A serialized codio event.
 */
function serializeRenameEvent(event: DocumentRenameEvent, rootPath): SerializedDocumentEvent {
  if (event.data.oldUri) {
    const { oldUri, newUri, ...eventData } = event.data;
    const newEvent = {
      ...event,
      data: {
        ...eventData,
        oldPath: FSManager.toRelativePath(oldUri, rootPath),
        newPath: FSManager.toRelativePath(newUri, rootPath),
      },
    };
    return newEvent;
  }
}
