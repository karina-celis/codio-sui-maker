import { Position, Range } from 'vscode';
import FSManager from '../filesystem/FSManager';
import { DocumentEvents } from './consts';
import { isDocumentChangeEvent } from './event_creator';

export default function serialize(events: DocumentEvent[], rootPath: string): SerializedDocumentEvent[] {
  return events.map((event) => serializeEvent(event, rootPath)).filter((event) => !!event);
}

function serializeEvent(event: DocumentEvent, rootPath: string): SerializedDocumentEvent {
  if (isDocumentChangeEvent(event)) {
    return serializeTextEvent(event, rootPath);
  } else if (event.type === DocumentEvents.DOCUMENT_RENAME) {
    return serializeRenameEvent(event as DocumentRenameEvent, rootPath);
  } else {
    return serializeFilePath(event, rootPath);
  }
}

function serializeTextEvent(event: DocumentChangeEvent, rootPath: string): SerializedDocumentChangeEvent {
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
      return { position: startPosition, text: change.text };
    }
    return { range: new Range(startPosition, endPosition), text: change.text };
  });
  return serializedEvent;
}

function serializeFilePath(event: DocumentEvent, rootPath: string): SerializedDocumentEvent {
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
function serializeRenameEvent(event: DocumentRenameEvent, rootPath: string): SerializedDocumentEvent {
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
