export function createEventWithModifiedTime(event: DocumentEvent, newTime: number): DocumentEvent {
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
export function createEventsWithRelativeTime(events: DocumentEvent[], startTime: number): DocumentEvent[] {
  return events.map((event) => {
    const newTime = event.data.time - startTime;
    return createEventWithModifiedTime(event, newTime);
  });
}

export function cutTimelineFrom(events: DocumentEvent[], time: number): DocumentEvent[] {
  return events.filter((event) => event.data.time > time);
}

export function cutTimelineUntil(events: DocumentEvent[], time: number): DocumentEvent[] {
  return events.filter((event) => event.data.time < time);
}

/**
 * Adjust given events by given start time.
 * @param eventsWithRelativeTime Editor and document events with relative time in milliseconds.
 * @param startTime Time to adjust in milliseconds.
 * @returns A new array of events with time absolute to the time given.
 */
export function createEventsWithAbsoluteTime(
  eventsWithRelativeTime: DocumentEvent[],
  startTime: number,
): DocumentEvent[] {
  return eventsWithRelativeTime.map((event) => {
    const newTime = event.data.time + startTime;
    return createEventWithModifiedTime(event, newTime);
  });
}
