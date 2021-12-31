/* eslint-disable @typescript-eslint/no-empty-function */
import { isNull } from 'util';
import processEvent, { removeSelection } from '../editor/event_dispatcher';
import deserializeEvents from '../editor/deserialize';
import { createTimelineWithAbsoluteTimes, createRelativeTimeline } from '../editor/event_timeline';
import deserializeFrame from '../editor/frame/deserialize_frame';
import { DocumentEvents } from '../editor/consts';

export default class EditorPlayer {
  currentEventTimer: NodeJS.Timer;
  events: Array<CodioEvent>;
  initialFrame: Array<CodioFile>; // DEPRECATED
  workspaceFolder: string;

  /**
   * Load given data to create events and initial frame.
   * @param workspacePath Path to where codio lives.
   * @param timeline Object containing properties to act on.
   * @returns True if loaded correctly; false otherwise.
   */
  load(workspacePath: string, timeline: Timeline): boolean {
    this.events = deserializeEvents(timeline.events, workspacePath);
    this.initialFrame = deserializeFrame(timeline.initialFrame, workspacePath);
    return !!this.events.length || !!this.initialFrame.length;
  }

  /**
   * Guard against future errors.
   */
  destroy(): void {
    // eslint-disable-next-line prettier/prettier
    this.play = () => { };
    // eslint-disable-next-line prettier/prettier
    this.pause = () => { };
    this.getEventsFrom = () => [];
  }

  play(events: Array<CodioEvent>, time: number): void {
    const timeline = createTimelineWithAbsoluteTimes(events, time);
    console.log('play events', events);
    console.log('play timeline', timeline.length);
    this.playEvents(timeline);
  }

  /**
   * Play given events with a calculated delay.
   * @param timeline An array of events to play.
   * @returns void.
   */
  private playEvents(timeline: Array<CodioEvent> = []): void {
    if (!timeline.length) {
      console.log('playEvents no timeline');
      return;
    }

    try {
      const event = timeline.shift();
      const delay = event.data.time - Date.now();

      this.currentEventTimer = setTimeout(async () => {
        await processEvent(event);

        // While timeout was executing play could have stopped.
        if (isNull(this.currentEventTimer)) {
          return;
        }

        if (timeline.length) {
          this.playEvents(timeline);
        }
      }, Math.max(delay, 0));
    } catch (e) {
      console.log('timeline error', e);
    }
  }

  /**
   * Get events from given time.
   * The logic here is to split events to past/present and future.
   * Reconcile past events and adjust future events using given time.
   * Concatenate reconciled events with adjusted future events.
   * @param timeMS Time in milliseconds to split events.
   * @returns Events that have been reconciled and adjusted for play.
   */
  getEventsFrom(timeMS: number): CodioEvent[] {
    const [pastEvts, futureEvts] = this.getPastAndFutureEvents(this.events, timeMS);
    const adjustedEvents = createRelativeTimeline(futureEvts, timeMS);
    const pathEvents = this.getPathEvents(pastEvts);

    let flatten = [];
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
  private getPathEvents(events: CodioEvent[]): Record<string, CodioEvent[]> {
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

  pause(): void {
    clearTimeout(this.currentEventTimer);
    this.currentEventTimer = null;
    removeSelection();
  }
}
