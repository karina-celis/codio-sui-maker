import { debug, DebugSession, Disposable } from 'vscode';
import {
  createDebugStartEvent,
  createDebugStopEvent,
  DebugEvent,
  DebugEvents,
  DebugStartEvent,
  DebugStopEvent,
  serializeDebugStartEvent,
} from './DebugEvents';

/**
 * Create events on listened to debug events.
 * The debugger is dependent on properties found in the '.vscode/launch.json' file.
 */
export default class DebugRecorder implements IMedia, IExport {
  private startTimeMs: number;
  private onDidStartDebugSessionListener: Disposable;
  private onDidTerminateDebugSessionListener: Disposable;

  private events: DebugEvent[] = [];

  start(timeMs: number): void {
    this.startTimeMs = timeMs;

    this.onDidStartDebugSessionListener = debug.onDidStartDebugSession(this.onDidStartDebugSession, this);
    this.onDidTerminateDebugSessionListener = debug.onDidTerminateDebugSession(this.onDidTerminateDebugSession, this);
  }

  stop(): void {
    this.onDidStartDebugSessionListener.dispose();
    this.onDidTerminateDebugSessionListener.dispose();
  }

  /**
   * Create a debug start event.
   * @param ds Debug session to create event for.
   * @returns void.
   */
  private onDidStartDebugSession(ds: DebugSession): void {
    console.log('onDidStartDebugSession', ds);
    if (!ds.name || ds.parentSession) {
      return;
    }

    const event = createDebugStartEvent(ds);
    this.events.push(event);
  }

  /**
   * Create a debug stop event.
   * @param ds Debug session to create event for.
   * @returns void.
   */
  private onDidTerminateDebugSession(ds: DebugSession): void {
    console.log('onDidTerminateDebugSession', ds);
    if (!ds.name || ds.parentSession) {
      return;
    }

    const event = createDebugStopEvent();
    this.events.push(event);
  }

  /**
   * Convert recorded event data times to relative times and create serialized events.
   * @returns JSON string of serialized events.
   */
  export(): string {
    const relativeEvents = this.events.map((e) => {
      return {
        ...e,
        data: {
          ...e.data,
          time: e.data.time - this.startTimeMs,
        },
      };
    });

    const serializedEvents = relativeEvents.map((e) => {
      if (e.type === DebugEvents.DEBUG_START) {
        return serializeDebugStartEvent(e as DebugStartEvent);
      }
      return e as DebugStopEvent;
    });

    return JSON.stringify(serializedEvents);
  }

  /**
  * Convert recorded event data times to relative times and create serialized events.
  * @returns JSON string of serialized events.
  */
   debugList(): object {
    const relativeEvents = this.events.map((e) => {
      return {
        ...e,
        data: {
          time: e.data.time - this.startTimeMs,
        },
      };
    });

    const serializedEvents = relativeEvents.filter((e) => e.type === DebugEvents.DEBUG_START);
    return serializedEvents;
   }
}
