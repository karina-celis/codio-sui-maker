import { readFileSync } from 'fs';
import { AbortController } from 'node-abort-controller';
import { debug } from 'vscode';
import { DebugEvent, DebugEvents, DebugStartEvent, DebugStopEvent, deserializeDebugStartEvent } from './DebugEvents';

/**
 * Import and control debug events.
 */
export default class DebugPlayer implements IMedia, IImport {
  private events: DebugEvent[] = [];
  private ac: AbortController;
  private abortHandler: () => void;
  private currentEventTimer: NodeJS.Timer;

  private readonly eventsToProcess = {
    [DebugEvents.DEBUG_START]: this.processDebugStart,
    [DebugEvents.DEBUG_STOP]: this.processDebugStop,
  };

  /**
   * Start processing debug events from given relative millisecond time.
   * @param timeMs Relative time in milliseconds to start events from.
   */
  start(timeMs: number): void {
    this.ac = new AbortController();
    const events = this.getEventsFrom(timeMs);
    const absoluteEvents = this.getAbsoluteEvents(events, Date.now());
    this.processEvents(absoluteEvents);
  }

  /**
   * Get events starting from given time in milliseconds.
   * @param timeMs Time in milliseconds to test against.
   * @returns An array of debug events at or greater than given time in milliseconds.
   */
  private getEventsFrom(timeMs: number): DebugEvent[] {
    const futureEvents = this.events.filter((event) => {
      return event.data.time >= timeMs;
    });
    return futureEvents;
  }

  /**
   * Get events with absolute times from given events and time in milliseconds.
   * @param events Events to parse against.
   * @param timeMs Time in milliseconds to add event data time to.
   * @returns An array of events with absolute times.
   */
  private getAbsoluteEvents(events: DebugEvent[], timeMs: number): DebugEvent[] {
    return events.map((e) => {
      return {
        ...e,
        data: {
          ...e.data,
          time: e.data.time + timeMs,
        },
      };
    });
  }

  /**
   * Process cancelable given events.
   * @param events Events to process.
   * @returns void.
   */
  private processEvents(events: DebugEvent[]): void {
    if (!events.length) {
      console.log('processEvents no events');
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
          console.log(DebugEvents[event.type], event);
          if (event.type === DebugEvents.DEBUG_START) {
            await this.eventsToProcess[event.type](event as DebugStartEvent);
          } else if (event.type === DebugEvents.DEBUG_STOP) {
            await this.eventsToProcess[event.type](event as DebugStopEvent);
          }

          if (signal.aborted || this.currentEventTimer === null) {
            return;
          }

          signal.removeEventListener('abort', this.abortHandler);
          res();
        }, Math.max(delay, 0));
      })
        .then(() => {
          if (events.length) {
            this.processEvents(events);
          }
        })
        .catch((e) => console.log("Event's Promise ", e));
    } catch (e) {
      console.log('processEvent error', e);
    }
  }

  stop(): void {
    this.ac.abort();
  }

  /**
   * Process debug start event.
   * @param dse Debug start event.
   */
  private async processDebugStart(dse: DebugStartEvent) {
    console.log('processDebugStart', dse);
    debug.removeBreakpoints(debug.breakpoints);
    await debug.startDebugging(dse.data.workspaceFolder, {
      name: dse.data.name,
      program: dse.data.program,
      type: dse.data.type,
      request: dse.data.request,
    });
  }

  /**
   * Process debug stop event.
   * @param dse Debug stop event to process.
   */
  private async processDebugStop(dse: DebugStopEvent) {
    console.log('processDebugStop', dse);
    /*
    Turning off processing this event because of the different processing speeds
    that can happen on the same computer. A stop event could be processed sooner than
    when the debugger stops processing. This would halt a debug before it finishes.
    */
    // await debug.stopDebugging();
  }

  /**
   * Import given path and save deserialized events.
   * @param jsonPath Path to JSON file to import.
   */
  import(jsonPath: string): void {
    const content = readFileSync(jsonPath);
    const serializedEvents = JSON.parse(content.toString());
    this.events = serializedEvents.map((sde) => {
      if (sde.type === DebugEvents.DEBUG_START) {
        return deserializeDebugStartEvent(sde);
      }
      return sde as DebugStopEvent;
    });
  }
}
