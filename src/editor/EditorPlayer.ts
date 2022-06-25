import { Position, Range } from 'vscode';
import { readFileSync } from 'fs';
import { clearTimeout } from 'timers';
import { AbortController } from 'node-abort-controller';
import { processEvent, removeSelection } from './event_processor';
import deserializeEvents from './deserialize';
import { createEventsWithAbsoluteTime, createEventsWithRelativeTime, createEventWithModifiedTime } from './event_time';
import { DocumentEvents } from './consts';
import { nthIndex, replaceRange } from '../utils';
import { ProgressObserver, UI } from '../user_interface/messages';

export default class EditorPlayer implements IMedia, IImport {
  currentEventTimer: NodeJS.Timer;
  workspacePath: string;
  private events: DocumentEvent[];
  private ac: AbortController;
  private abortHandler: () => void;

  /**
   * Construct EditorPlayer necessities.
   */
  constructor(workspacePath: string) {
    this.workspacePath = workspacePath;
    this.abortHandler = () => undefined;
  }

  import(jsonPath: string): void {
    const editorContent = readFileSync(jsonPath);
    const events = JSON.parse(editorContent.toString());
    console.log('import events', events);
    this.events = deserializeEvents(events, this.workspacePath) as DocumentEvent[];
    if (!this.events.length) {
      this.destroy(); // @note Is this actually needed?
    }
    console.log('import', jsonPath, this.events);
  }

  /**
   * Guard against future errors.
   */
  destroy(): void {
    this.start = () => undefined;
    this.stop = () => undefined;
    this.getEventsFrom = () => [];
  }

  /**
   * Find events from given time and play them.
   * @param elapsedTimeMs Elapsed time in milliseconds.
   */
  start(elapsedTimeMs: number): void {
    this.ac = new AbortController();
    const events = this.getEventsFrom(elapsedTimeMs);
    const absoluteEvents = createEventsWithAbsoluteTime(events, Date.now());
    console.log('play events', events);
    console.log('play absoluteEvents', absoluteEvents.length);
    this.playEvents(absoluteEvents);
  }

  /**
   * Make media go to given time and update state.
   * @param timeMs Time in milliseconds to go to.
   */
  goto(timeMs: number): void {
    const [pastEvts] = this.getPastAndFutureEvents(this.events, timeMs);
    if (!pastEvts.length) {
      return;
    }

    const adjustedPastEvents = this.handlePastEvents(pastEvts);
    const obs = new ProgressObserver(adjustedPastEvents.length);
    UI.showProgress('Processing Events', obs);

    (async () => {
      for (let i = 0; i < obs.total; i++) {
        const increment = Math.round(((i + 1) / obs.total) * 100);
        obs.update(increment, `${i + 1} of ${obs.total}.`);
        const event = adjustedPastEvents[i];
        await processEvent(event);
      }
      if (obs.total) {
        obs.done();
      }
    })();
  }

  /**
   * Play given events with a calculated delay.
   * @param events An array of events to play with absolute times.
   * @returns void.
   */
  private playEvents(events: DocumentEvent[]): void {
    if (!events.length) {
      console.log('playEvents no events');
      return;
    }

    try {
      const event = events.shift();
      const delay = event.data.time - Date.now();
      const signal = this.ac.signal;

      // Timer wrapped in promise to handle abort.
      new Promise<void>((res, rej) => {
        this.abortHandler = () => {
          signal.removeEventListener('abort', this.abortHandler);
          clearTimeout(this.currentEventTimer);
          this.currentEventTimer = null;
          rej('abort');
        };

        if (!signal.aborted) {
          signal.addEventListener('abort', this.abortHandler, { once: true });
        }

        // Process event in calculated delay.
        this.currentEventTimer = setTimeout(async () => {
          await processEvent(event);

          if (signal.aborted || this.currentEventTimer === null) {
            return;
          }

          signal.removeEventListener('abort', this.abortHandler);
          res();
        }, Math.max(delay, 0));
      })
        .then(() => {
          if (events.length) {
            this.playEvents(events);
          }
        })
        .catch((e) => console.log("Event's Promise", e));
    } catch (e) {
      console.log('playEvents error', e);
    }
  }

  /**
   * Get events from given time.
   * The logic here is to split events to past/present and future.
   * Reconcile and consolidate past events and adjust future events using given time.
   * Concatenate reconciled/consolidated events with adjusted future events.
   * @param timeMs Relative time in milliseconds to split events.
   * @returns Events that have been reconciled and adjusted for play.
   */
  private getEventsFrom(timeMs: number): DocumentEvent[] {
    if (!timeMs) {
      return this.events;
    }

    const [pastEvts, futureEvts] = this.getPastAndFutureEvents(this.events, timeMs);
    const adjustedPastEvents = this.handlePastEvents(pastEvts);
    const adjustedFutureEvents = this.handleFutureEvents(futureEvts, timeMs);
    return adjustedPastEvents.concat(adjustedFutureEvents);
  }

  /**
   * Reconcile and consolidate to important events to process.
   * @param events Past events to reconcile and consolidate.
   * @returns An array of important events to process.
   */
  private handlePastEvents(events: DocumentEvent[]): DocumentEvent[] {
    const vitalEvents = [];

    const lastVisibleRange = this.getLastEventOfType(events, DocumentEvents.DOCUMENT_VISIBLE_RANGE);
    if (lastVisibleRange) {
      vitalEvents.push(lastVisibleRange);
    }

    const lastSelection = this.getLastEventOfType(events, DocumentEvents.DOCUMENT_SELECTION);
    if (lastSelection) {
      vitalEvents.push(lastSelection);
    }

    const coreEvents = this.getEventsWithoutTypes(events, [
      DocumentEvents.DOCUMENT_VISIBLE_RANGE,
      DocumentEvents.DOCUMENT_SELECTION,
    ]);

    /*
    Reconcile each path
    Our understanding is that documents start unfolded, ungrouped, and scrolled to the top.
    A text editor could open in any available view column.
    Visible and active events present a document in a text editor.
    */
    const pathEvents = this.getPathEvents(coreEvents);
    for (const path in pathEvents) {
      const events = this.getReconciledEvents(pathEvents[path]);

      // These events could cancel each other out if even.
      // In terms of odd events: fold, unfold, fold; the last fold event is valid.
      const foldUpEvents = this.getEventsOfType(events, DocumentEvents.DOCUMENT_FOLD_UP) as DocumentFoldUpEvent[];
      const foldDownEvents = this.getEventsOfType(events, DocumentEvents.DOCUMENT_FOLD_DOWN) as DocumentFoldDownEvent[];
      const foldDownLines = foldDownEvents.map((e) => e.data.startLine);
      const validFoldUpEvents = foldUpEvents.filter((e) => {
        const index = foldDownLines.indexOf(e.data.startLine);
        if (index > -1) {
          foldDownLines.splice(index, 1);
          return false;
        }
        return true;
      });
      vitalEvents.push(...validFoldUpEvents);

      // These events cancel each other out if even.
      const groupEvents = this.getEventsOfType(events, DocumentEvents.DOCUMENT_GROUP);
      const ungroupEvents = this.getEventsOfType(events, DocumentEvents.DOCUMENT_UNGROUP);
      const totalGroupEvts = groupEvents.length;
      const totalUngroupEvts = ungroupEvents.length;
      if (totalGroupEvts > totalUngroupEvts) {
        vitalEvents.push(groupEvents[totalGroupEvts - 1]);
      } else if (totalUngroupEvts > totalGroupEvts) {
        vitalEvents.push(ungroupEvents[totalUngroupEvts - 1]);
      }

      // Get view column and visible events
      const viewColumnEvents = this.getEventsOfTypes(events, [
        DocumentEvents.DOCUMENT_VIEW_COLUMN,
        DocumentEvents.DOCUMENT_VISIBLE,
      ]);
      const viewColumns = viewColumnEvents.map((e) => e.data.viewColumn);
      const uniqueViewColumns = [...new Set(viewColumns)];
      const visibleEvent = this.getEventOfType(events, DocumentEvents.DOCUMENT_VISIBLE) as DocumentVisibleEvent;

      // Create visible event clones
      const clonedVisibleEvents = uniqueViewColumns.map((viewColumn) => {
        const { type, data } = visibleEvent;
        return {
          type,
          data: {
            ...data,
            viewColumn,
          },
        } as DocumentVisibleEvent;
      });
      vitalEvents.push(...clonedVisibleEvents);

      // Consolidate remaining text change events
      if (events.length > 2) {
        const finalEvent = this.getConsolidatedEvent(events);
        vitalEvents.push(finalEvent);
      } else {
        vitalEvents.push(events[0]);
      }
    }

    // Sort by time
    vitalEvents.sort((el1, el2) => {
      return el1?.data.time - el2?.data.time;
    });

    // Rewrite time
    const clonedEvents = [];
    for (let i = 0; i < vitalEvents.length; i++) {
      const clone = createEventWithModifiedTime(vitalEvents[i], i);
      clonedEvents.push(clone);
    }

    return clonedEvents;
  }

  private handleFutureEvents(events: DocumentEvent[], timeMs: number): DocumentEvent[] {
    return createEventsWithRelativeTime(events, timeMs);
  }

  /**
   * Split given events by given time.
   * @param events Time ordered events to spilt.
   * @param relativeMs Time in milliseconds to split.
   * @returns Two arrays of past/present and future events.
   */
  private getPastAndFutureEvents(events: DocumentEvent[], relativeMs: number): [DocumentEvent[], DocumentEvent[]] {
    // Find closest future event
    const closestEventIndex = events.findIndex((evt) => {
      return evt.data.time > relativeMs;
    });
    if (closestEventIndex === -1) {
      return [events.slice(), []]; // All past events.
    }

    const pastPresentEvents = events.slice(0, closestEventIndex);
    const futureEvents = events.slice(closestEventIndex);
    return [pastPresentEvents, futureEvents];
  }

  /**
   * Get last event of given type.
   * @param events Events to parse.
   * @param type Event type to test for.
   * @returns The last event of given type or null if not found.
   */
  private getLastEventOfType(events: DocumentEvent[], type: number | string): DocumentEvent {
    let lastIndex = events.length;
    while (lastIndex--) {
      if (events[lastIndex].type === type) {
        break;
      }
    }
    return lastIndex === -1 ? null : events[lastIndex];
  }

  /**
   * Get a new array without the given types from given array.
   * @param events Events to parse.
   * @param types An array containing event types to remove.
   * @returns New array containing events not of given types.
   */
  private getEventsWithoutTypes(events: DocumentEvent[], types: (number | string)[]): DocumentEvent[] {
    return events.filter((e) => {
      return !types.includes(e.type);
    });
  }

  /**
   * Find unique paths from given events and construct an object containg each paths' ordered events.
   * @param events Events to parse through to find unique paths and their events.
   * @returns An object containing paths and their ordered events.
   */
  private getPathEvents(events: DocumentEvent[]): { [key: string]: DocumentEvent[] } {
    const paths = {};

    events.forEach((e) => {
      // Check for Rename events.
      const path =
        e.type === DocumentEvents.DOCUMENT_RENAME
          ? (e as unknown as DocumentRenameEvent)?.data.oldUri.path
          : e.data.uri.path;

      if (!paths[path]) {
        paths[path] = [];
      }
      paths[path].push(e);
    });

    return paths;
  }

  /**
   * Reconcile given events.
   * The logic here is looking at events that are most final to least.
   * Each event checked here knows it's state.
   * @param events Events to reconcile.
   * @returns An array of reconciled events.
   */
  private getReconciledEvents(events: DocumentEvent[]): DocumentEvent[] {
    const eventsAfterDelete = this.discardEventsBeforeType(events, DocumentEvents.DOCUMENT_DELETE);
    // Rename is 'deleting' an old file; the new file will have an open event with another path containing the new name.
    const eventsAfterRename = this.discardEventsBeforeType(eventsAfterDelete, DocumentEvents.DOCUMENT_RENAME);
    const eventsAfterClose = this.discardEventsBeforeType(eventsAfterRename, DocumentEvents.DOCUMENT_CLOSE);
    const eventsAfterSave = this.discardEventsBeforeType(eventsAfterClose, DocumentEvents.DOCUMENT_SAVE);
    return this.discardEventsBeforeType(eventsAfterSave, DocumentEvents.DOCUMENT_OPEN);
  }

  /**
   * Find the last event of given type and return events from found type to end.
   * @param events Events to parse through.
   * @param type Type of event to find the last of.
   * @returns Remaining events from last found event type.
   */
  private discardEventsBeforeType(events: DocumentEvent[], type: DocumentEvents): DocumentEvent[] {
    const reversedArr = events.slice().reverse();
    const typeEventIndex = reversedArr.findIndex((e) => {
      return e.type === type;
    });
    if (typeEventIndex === -1) {
      return events;
    }

    const evenstAfterType = events.slice(reversedArr.length - 1 - typeEventIndex);
    return evenstAfterType;
  }

  /**
   * Consolidate given events to one event.
   * @param events Events to parse.
   * @returns A consolidated event.
   */
  private getConsolidatedEvent(events: DocumentEvent[]): DocumentEvent {
    let text = '';

    // Get starting text, if any.
    const openEvent = this.getEventsOfType(events, DocumentEvents.DOCUMENT_OPEN).pop();
    if (openEvent) {
      text += openEvent.data.content;
    }

    // Build text depending on changes.
    const changeEvents = this.getEventsOfType(events, DocumentEvents.DOCUMENT_CHANGE) as DocumentChangeEvent[];
    changeEvents.forEach((e) => {
      e.data.changes.forEach((change) => {
        if (change.position) {
          const index = this.getTextPositionIndex(text, change.position);
          text = replaceRange(text, index, index, change.text);
        } else if (change.range) {
          const range = change.range as Range;
          const startIndex = this.getTextPositionIndex(text, range.start);
          const endIndex = this.getTextPositionIndex(text, range.end);
          text = replaceRange(text, startIndex, endIndex, change.text);
        }
      });
    });

    // Set final text on an open or create event.
    if (openEvent) {
      const clone = createEventWithModifiedTime(openEvent, openEvent.data.time);
      clone.data.content = text;
      return clone;
    }

    const createEvent = this.getEventsOfType(events, DocumentEvents.DOCUMENT_CREATE).pop();
    if (createEvent) {
      const clone = createEventWithModifiedTime(createEvent, createEvent.data.time);
      clone.data.content = text;
      return clone;
    }
  }

  /**
   * Get events of given type from given array.
   * @param events Events to parse.
   * @param type Event type to test for.
   * @returns A new array containing events of given type.
   */
  private getEventsOfType(events: DocumentEvent[], type: number): DocumentEvent[] {
    return events.filter((e) => {
      return e.type === type;
    });
  }

  /**
   * Get events of given types from given array.
   * @param events Events to parse.
   * @param type Event types to test for.
   * @returns A new array containing events of given types.
   */
  private getEventsOfTypes(events: DocumentEvent[], type: number[]): DocumentEvent[] {
    return events.filter((e) => {
      return type.includes(e.type);
    });
  }

  /**
   * Get event of given type from given array.
   * @param events Events to parse.
   * @param type Event type to test for.
   * @returns Event found of given type or null.
   */
  private getEventOfType(events: DocumentEvent[], type: number): DocumentEvent | undefined {
    return events.find((e) => {
      return e.type === type;
    });
  }

  /**
   * Get the index from given text of given position.
   * @param text Text to parse.
   * @param position Position object to find index for.
   * @returns Index of given position object.
   */
  private getTextPositionIndex(text: string, position: Position): number {
    const index = nthIndex(text, '\n', position.line);
    return index + position.character + 1;
  }

  stop(): void {
    this.ac.abort();
    removeSelection();
  }
}
