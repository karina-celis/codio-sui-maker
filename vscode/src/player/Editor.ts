import { clearTimeout } from 'timers';
import { AbortController } from 'node-abort-controller';
import processEvent, { removeSelection } from '../editor/event_dispatcher';
import deserializeEvents from '../editor/deserialize';
import { createTimelineWithAbsoluteTimes, createRelativeTimeline } from '../editor/event_timeline';
import { DocumentEvents } from '../editor/consts';

export default class EditorPlayer {
  currentEventTimer: NodeJS.Timer;
  events: CodioEvent[];
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
    this.events = deserializeEvents(timeline.events, workspacePath);
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
  play(events: CodioEvent[], time: number): void {
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
  private playEvents(events: CodioEvent[] = []): void {
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
        signal.removeEventListener('abort', this.abortHandler);

        this.abortHandler = () => {
          signal.removeEventListener('abort', this.abortHandler);
          clearTimeout(this.currentEventTimer);
          this.currentEventTimer = null;
          rej('abort');
        };

        if (!signal.aborted) {
          signal.addEventListener('abort', this.abortHandler);
        }

        // Process event in calculated delay.
        this.currentEventTimer = setTimeout(async () => {
          await processEvent(event);

          if (signal.aborted || this.currentEventTimer === null) {
            return;
          }

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
   * Reconcile past events and adjust future events using given time.
   * Concatenate reconciled events with adjusted future events.
   * @param timeMS Relative time in milliseconds to split events.
   * @returns Events that have been reconciled and adjusted for play.
   */
  getEventsFrom(timeMS: number): CodioEvent[] {
    const [pastEvts, futureEvts] = this.getPastAndFutureEvents(this.events, timeMS);
    const adjustedEvents = createRelativeTimeline(futureEvts, timeMS);

    let flatten = [];
    const pathEvents = this.getPathEvents(pastEvts);
    for (const path in pathEvents) {
      const events = this.reconcileEvents(pathEvents[path]);
      flatten = flatten.concat(events);
    }

    // Sort by time
    flatten.sort((el1, el2) => {
      return el1.data.time - el2.data.time;
    });

    // Rewrite time
    let eventCounter = 0;
    for (const e in flatten) {
      flatten[e].data.time = eventCounter++;
    }

    return flatten.concat(adjustedEvents);
  }

  /**
   * Split given events by given time.
   * @param events Time ordered events to spilt.
   * @param relativeMS Time in milliseconds to split.
   * @returns Two arrays of past/present and future events.
   */
  private getPastAndFutureEvents(events: CodioEvent[], relativeMS: number): [CodioEvent[], CodioEvent[]] {
    // Find closest future event
    const closestEventIndex = events.findIndex((evt) => {
      return evt.data.time > relativeMS;
    });
    if (closestEventIndex === -1) {
      return [events.slice(), []]; // All past events.
    }

    const pastPresentEvents = events.slice(0, closestEventIndex);
    const futureEvents = events.slice(closestEventIndex);
    return [pastPresentEvents, futureEvents];
  }

  /**
   * Find unique paths from given events and construct an object containg each paths' ordered events.
   * @param events Events to parse through to find unique paths and their events.
   * @returns An object containing paths and their ordered events.
   */
  private getPathEvents(events: CodioEvent[]): { [key: string]: CodioEvent[] } {
    const paths = {};

    events.forEach((e) => {
      // Check for Rename events.
      const path =
        e.type === DocumentEvents.DOCUMENT_RENAME ? (e as DocumentRenameEvent)?.data.oldUri.path : e.data.uri.path;

      let pathEvents = paths[path];
      if (!pathEvents) {
        paths[path] = [];
        pathEvents = paths[path];
      }

      pathEvents.push(e);
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
  private reconcileEvents(events: CodioEvent[]): CodioEvent[] {
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
  private discardEventsBeforeType(events: CodioEvent[], type: DocumentEvents): CodioEvent[] {
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
   * Remove events of given type from given array.
   * @param events Events to remove type from.
   * @param type Type of event to remove.
   */
  private removeEventsOfType(events: CodioEvent[], type: DocumentEvents): void {
    let typeEventIndex;
    do {
      typeEventIndex = events.findIndex((e) => {
        return e.type === type;
      });
      if (typeEventIndex > -1) {
        events.splice(typeEventIndex, 1);
      }
    } while (typeEventIndex !== -1);
  }

  stop(): void {
    this.ac.abort();
    removeSelection();
  }
}
