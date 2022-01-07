function createEventWithModifiedTime(event: CodioEvent, newTime: number): CodioEvent {
  return {
    ...event,
    data: {
      ...event.data,
      time: newTime,
    },
  };
}

/**
 * Create a new array of given events with times realtive to the given time.
 * @param events Editor and document events with relative time in milliseconds.
 * @param startTime A relative time in milliseconds.
 * @returns A new array of events with time relative to the given time.
 */
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

/**
 * Adjust given events by given start time.
 * @param eventsWithRelativeTimeline Editor and document events with relative time in milliseconds.
 * @param startTime Time to adjust in milliseconds.
 * @returns A new array of events with time absolute to the time given.
 */
export function createTimelineWithAbsoluteTimes(
  eventsWithRelativeTimeline: Array<CodioEvent>,
  startTime: number,
): Array<CodioEvent> {
  return eventsWithRelativeTimeline.map((event) => {
    const newTime = event.data.time + startTime;
    return createEventWithModifiedTime(event, newTime);
  });
}
