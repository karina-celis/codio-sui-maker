import { clearTimeout } from 'timers';
import { AbortController } from 'node-abort-controller';
import processEvent, { removeSelection } from '../editor/event_dispatcher';
import deserializeEvents from '../editor/deserialize';
import {
  createTimelineWithAbsoluteTimes,
  createRelativeTimeline,
  createEventWithModifiedTime,
} from '../editor/event_timeline';
import { DocumentEvents } from '../editor/consts';
import { nthIndex, replaceRange } from '../utils';
import { Position } from 'vscode';

export default class EditorPlayer {
  currentEventTimer: NodeJS.Timer;
  events: DocumentEvent[];
  workspaceFolder: string;
  private ac: AbortController;
  private abortHandler: () => void;

  /**
   * Construct EditorPlayer necessities.
   */
  constructor() {
    this.abortHandler = () => undefined;
  }

  /**
   * Load given data to create events and initial frame.
   * @param workspacePath Path to where codio lives.
   * @param timeline Object containing properties to act on.
   * @returns True if loaded correctly; false otherwise.
   */
  load(workspacePath: string, timeline: Timeline): boolean {
    this.events = deserializeEvents(timeline.events, workspacePath) as DocumentEvent[];
    return !!this.events.length;
  }

  /**
   * Guard against future errors.
   */
  destroy(): void {
    this.play = () => undefined;
    this.stop = () => undefined;
    this.getEventsFrom = () => [];
  }

  /**
   * Play given events after time adjustment of given time.
   * @param events Editor and document events to play.
   * @param time Time in milliseconds.
   */
  play(events: DocumentEvent[], time: number): void {
    this.ac = new AbortController();
    const absoluteEvents = createTimelineWithAbsoluteTimes(events, time);
    console.log('play events', events);
    console.log('play absoluteEvents', absoluteEvents.length);
    this.playEvents(absoluteEvents);
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
        .catch((e) => console.log("Event's Promise ", e));
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
  getEventsFrom(timeMs: number): DocumentEvent[] {
    const vitalEvents = [];

    const [pastEvts, futureEvts] = this.getPastAndFutureEvents(this.events, timeMs);
    const adjustedEvents = createRelativeTimeline(futureEvts, timeMs);

    const lastVisibleRange = this.getLastEventOfType(pastEvts, DocumentEvents.DOCUMENT_VISIBLE_RANGE);
    if (lastVisibleRange) {
      vitalEvents.push(lastVisibleRange);
    }

    const lastSelection = this.getLastEventOfType(pastEvts, DocumentEvents.DOCUMENT_SELECTION);
    if (lastSelection) {
      vitalEvents.push(lastSelection);
    }

    const coreEvents = this.getEventsWithoutTypes(pastEvts, [
      DocumentEvents.DOCUMENT_VISIBLE_RANGE,
      DocumentEvents.DOCUMENT_SELECTION,
    ]);

    const pathEvents = this.getPathEvents(coreEvents);
    for (const path in pathEvents) {
      const events = this.getReconciledEvents(pathEvents[path]);

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

    return clonedEvents.concat(adjustedEvents);
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
   * Each event knows it's state other than Change, Selection, and VisibleRange.
   * @param events Events to reconcile.
   * @returns An array of reconciled events.
   */
  private getReconciledEvents(events: DocumentEvent[]): DocumentEvent[] {
    const eventsAfterDelete = this.discardEventsBeforeType(events, DocumentEvents.DOCUMENT_DELETE);
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
          text = replaceRange(text, index, index, change.value);
        } else if (change.range) {
          const range = change.range;
          const startIndex = this.getTextPositionIndex(text, range[0]);
          const endIndex = this.getTextPositionIndex(text, range[1]);
          text = replaceRange(text, startIndex, endIndex, change.value);
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
