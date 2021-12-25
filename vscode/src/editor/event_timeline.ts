import { commands } from 'vscode';
import { DocumentEvents } from './consts';
import processEvent from './event_dispatcher';

function createEventWithModifiedTime(event: CodioEvent, newTime: number): CodioEvent {
  return {
    ...event,
    data: {
      ...event.data,
      time: newTime,
    },
  };
}

export function createRelativeTimeline(events: Array<CodioEvent>, startTime: number): Array<CodioEvent> {
  return events.map((event) => {
    const newTime = event.data.time - startTime;
    return createEventWithModifiedTime(event, newTime);
  });
}

export function cutTimelineFrom(events: Array<CodioEvent>, time: number): Array<CodioEvent> {
  return events.filter((event) => event.data.time > time);
}

export function cutTimelineUntil(events: Array<CodioEvent>, time: number): Array<CodioEvent> {
  return events.filter((event) => event.data.time < time);
}

export function createTimelineWithAbsoluteTimes(
  eventsWithRelativeTimeline: Array<CodioEvent>,
  startTime: number,
): Array<CodioEvent> {
  return eventsWithRelativeTimeline.map((event) => {
    const newTime = event.data.time + startTime;
    return createEventWithModifiedTime(event, newTime);
  });
}
