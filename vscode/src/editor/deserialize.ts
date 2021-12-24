import FSManager from '../filesystem/FSManager';
import { Uri, Range, Position, Selection } from 'vscode';
import {
  isSerializedTextEvent,
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
export default function deserializeEvents(events: Array<CodioSerializedEvent>, codioPath: string): Array<CodioEvent> {
  return events.map((serializedEvent) => {
    const event = deserializeFilePath(serializedEvent, codioPath);

    if (event.type === DocumentEvents.DOCUMENT_RENAME) {
      const dre = deserializeRenameEvent(event, codioPath);
      return dre;
    } else if (isSerializedTextEvent(event)) {
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

function deserializeFilePath(event: CodioSerializedEvent, codioPath: string) {
  if (event.data.path) {
    const { path, ...eventData } = event.data;
    const newEvent = { ...event, data: { ...eventData, uri: Uri.joinPath(Uri.file(codioPath), path) } };
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
function deserializeRenameEvent(event: CodioSerializedEvent, codioPath: string): DocumentRenameEvent {
  const { oldPath, newPath, ...eventData } = event.data;
  //@ts-ignore
  return {
    ...event,
    data: {
      ...eventData,
      oldUri: Uri.joinPath(Uri.file(codioPath), oldPath),
      newUri: Uri.joinPath(Uri.file(codioPath), newPath),
    },
  };
}

/**
 * Construct a DocumentChangeEvent from given arguments.
 * @param event A serialized event to deserialize into a DocumentChangeEvent.
 * @returns A DocumentChangeEvent.
 */
function deserializeTextEvent(event: CodioSerializedTextEvent): DocumentChangeEvent {
  return {
    ...event,
    //@ts-ignore
    data: {
      ...event.data,
      changes: event.data.changes.map((change) => {
        if (change.range) {
          return { ...change, range: deserializeRange(change.range) };
        } else if (change.position) {
          return { ...change, position: deserializePosition(change.position) };
        }
      }),
    },
  };
}

function deserializeSelectionEvent(event: CodioSerializedSelectionEvent): CodioSelectionEvent {
  return {
    ...event,
    //@ts-ignore
    data: {
      ...event.data,
      selections: event.data.selections.map((selection) => {
        return new Selection(deserializePosition(selection.anchor), deserializePosition(selection.active));
      }),
    },
  };
}

function deserializeVisibleRangeEvent(event: CodioSerializedVisibleRangeEvent): CodioVisibleRangeEvent {
  return {
    ...event,
    //@ts-ignore
    data: {
      ...event.data,
      visibleRange: deserializeRange(event.data.visibleRange),
    },
  };
}

function deserializeEditorEvent(event: CodioSerializedChangeActiveEditorEvent): CodioChangeActiveEditorEvent {
  return {
    ...event,
    //@ts-ignore
    data: {
      ...event.data,
      visibleRange: deserializeRange(event.data.visibleRange),
    },
  };
}
function deserializeRange(range): Range {
  const startPosition = new Position(range[0].line, range[0].character);
  const endPosition = new Position(range[1].line, range[1].character);
  return new Range(startPosition, endPosition);
}

function deserializePosition(position): Position {
  return new Position(position.line, position.character);
}
