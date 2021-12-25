/* eslint-disable @typescript-eslint/no-empty-function */
import { isNull } from 'util';
import processEvent, { removeSelection } from '../editor/event_dispatcher';
import { createFrame, applyFrame } from '../editor/frame';
import deserializeEvents from '../editor/deserialize';
import {
  createTimelineWithAbsoluteTimes,
  cutTimelineFrom,
  cutTimelineUntil,
  createRelativeTimeline,
} from '../editor/event_timeline';
import deserializeFrame from '../editor/frame/deserialize_frame';

export default class EditorPlayer {
  currentEventTimer: NodeJS.Timer;
  events: Array<CodioEvent>;
  initialFrame: Array<CodioFile>;
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
    this.moveToFrame = (): Promise<void> => Promise.resolve();
    this.getTimeline = () => [];
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

        if (timeline.length !== 1) {
          this.playEvents(timeline);
        }
      }, Math.max(delay, 0));
    } catch (e) {
      console.log('timeline error', e);
    }
  }

  //todo: moveToFrame should use create+applyFrame when time is 0
  async moveToFrame(time: number): Promise<void> {
    if (time > 0) {
      const initialToCurrentFrameActions = cutTimelineUntil(this.events, time);
      console.log('moveToFrame time', time);
      console.log('moveToFrame initialToCurrentFrameAction', initialToCurrentFrameActions);
      // const interacterContent = getInteracterContent(this.tutorial);
      const frame = createFrame(this.initialFrame, initialToCurrentFrameActions);
      console.log('moveToFrame this.initialFrame', this.initialFrame);
      console.log('moveToFrame frame', frame);
      // const finalFrame = addInteracterContentToFrame(frame, interacterContent);
      await applyFrame(frame);
    }
  }

  getTimeline(relativeTimeToStart: number): CodioEvent[] {
    const timelineFromTime = cutTimelineFrom(this.events, relativeTimeToStart);
    return createRelativeTimeline(timelineFromTime, relativeTimeToStart);
  }

  pause(): void {
    clearTimeout(this.currentEventTimer);
    this.currentEventTimer = null;
    removeSelection();
  }
}
