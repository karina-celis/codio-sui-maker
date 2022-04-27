import { Uri, Range, Position, Selection, TextDocumentContentChangeEvent } from 'vscode';
import {
  isSerializedDocumentChangeEvent,
  isSerializedSelectionEvent,
  isSerializedVisibleRangeEvent,
  isSerializedEditorEvent,
} from './event_creator';
import { DocumentEvents } from './consts';

/**
 * Construct an array of codio events from given arguments.
 * @param events An array of serialized codio events.
 * @param codioPath Path where the codio lives.
 * @returns An array of deserialized codio events.
 */
export default function deserializeEvents(
  events: SerializedDocumentEvent[],
  codioPath: string,
): DocumentEvent[] | CodioEvent[] {
  return events.map((serializedEvent) => {
    const event = deserializeFilePath(serializedEvent, codioPath);

    if (event.type === DocumentEvents.DOCUMENT_RENAME) {
      const dre = deserializeRenameEvent(event, codioPath);
      return dre;
    } else if (isSerializedDocumentChangeEvent(event)) {
      return deserializeTextEvent(event);
    } else if (isSerializedSelectionEvent(event)) {
      return deserializeSelectionEvent(event);
    } else if (isSerializedVisibleRangeEvent(event)) {
      return deserializeVisibleRangeEvent(event);
    } else if (isSerializedEditorEvent(event)) {
      return deserializeEditorEvent(event);
    } else {
      return event;
    }
  });
}

function deserializeFilePath(event: SerializedDocumentEvent, codioPath: string) {
  if (event.data.path) {
    const { path, ...eventData } = event.data;

    let uri;
    if (event.data.isUntitled) {
      uri = Uri.parse('untitled:' + path);
    } else {
      uri = Uri.joinPath(Uri.file(codioPath), path);
    }

    const newEvent = {
      ...event,
      data: {
        ...eventData,
        uri,
      },
    };
    return newEvent;
  } else {
    return event;
  }
}

/**
 * Construct a DocumentRenameEvent from given arguments.
 * @param event A serialized event to deserialize into a DocumentRenameEvent.
 * @param codioPath Path where the codio lives.
 * @returns A DocumentRenameEvent.
 */
function deserializeRenameEvent(event: SerializedDocumentEvent, codioPath: string): DocumentRenameEvent {
  const { oldPath, newPath, ...eventData } = event.data;
  return {
    ...event,
    data: {
      ...eventData,
      oldUri: Uri.joinPath(Uri.file(codioPath), oldPath),
      newUri: Uri.joinPath(Uri.file(codioPath), newPath),
    },
  } as DocumentRenameEvent;
}

/**
 * Construct a DocumentChangeEvent from given arguments.
 * @param event A serialized event to deserialize into a DocumentChangeEvent.
 * @returns A DocumentChangeEvent.
 */
function deserializeTextEvent(event: SerializedDocumentChangeEvent): DocumentChangeEvent {
  const changes: TextDocumentContentChangeEvent[] = event.data.changes.map((change) => {
    if (change.range) {
      console.log('deserializeTextEvent change.range', change.range);
      return { ...change, range: deserializeRange(change.range) };
    } else if (change.position) {
      return { ...change, position: deserializePosition(change.position) };
    }
  });

  return ({
    ...event,
    data: {
      ...event.data,
      changes,
    },
  } as unknown) as DocumentChangeEvent;
}

/**
 * Construct a CodioSelectionEvent from given arguments.
 * @param event A serialized event to deserialize into a CodioSelectionEvent.
 * @returns A CodioSelectionEvent.
 */
function deserializeSelectionEvent(event: SerializedDocumentSelectionEvent): DocumentSelectionEvent {
  const selections: Selection[] = event.data.selections.map((selection) => {
    return new Selection(deserializePosition(selection.anchor), deserializePosition(selection.active));
  });

  return ({
    ...event,
    data: {
      ...event.data,
      selections,
    },
  } as unknown) as DocumentSelectionEvent;
}

/**
 * Construct a CodioVisibleRangeEvent from given arguments.
 * @param event A serialized event to deserialize into a CodioVisibleRangeEvent.
 * @returns A CodioVisibleRangeEvent.
 */
function deserializeVisibleRangeEvent(event: SerializedDocumentVisibleRangeEvent): DocumentVisibleRangeEvent {
  console.log('deserializeVisibleRangeEvent', event.data);
  return ({
    ...event,
    data: {
      ...event.data,
      visibleRange: deserializeRange(event.data.visibleRange),
    },
  } as unknown) as DocumentVisibleRangeEvent;
}

/**
 * @note Deprecated
 * Construct a CodioChangeActiveEditorEvent from given arguments.
 * @param event A serialized event to deserialize into a CodioChangeActiveEditorEvent.
 * @returns A CodioChangeActiveEditorEvent.
 */
function deserializeEditorEvent(event: CodioSerializedChangeActiveEditorEvent): CodioChangeActiveEditorEvent {
  return ({
    ...event,
    data: {
      ...event.data,
      visibleRange: deserializeRange(event.data.visibleRange),
    },
  } as unknown) as CodioChangeActiveEditorEvent;
}

function deserializeRange(range: Range): Range {
  const startPosition = new Position(range[0].line, range[0].character);
  const endPosition = new Position(range[1].line, range[1].character);
  return new Range(startPosition, endPosition);
}

function deserializePosition(position): Position {
  return new Position(position.line, position.character);
}
