import { basename } from 'path';
import { DebugSession, WorkspaceFolder } from 'vscode';

enum DebugEvents {
  DEBUG_START,
  DEBUG_STOP,
}

interface DebugEvent extends IEvent {
  type: DebugEvents;
}

/**
 * Properties needed to start debugging and found in `launch.json` configuration.
 * @see debug.startDebugging
 * @see vscode.debug.DebugConfiguration
 */
interface DebugStartEvent extends DebugEvent {
  data: {
    time: number;
    name: string;
    program: string;
    request: string;
    type: string;
    workspaceFolder: WorkspaceFolder;
  };
}

/**
 * Properties needed to stop debugging.
 * @see debug.stopDebugging
 */
interface DebugStopEvent extends DebugEvent {
  data: {
    time: number;
  };
}

/**
 * Changes the workspaceFolder data type to a JSON string.
 */
interface SerializedDebugStartEvent {
  type: number;
  data: {
    time: number;
    name: string;
    program: string;
    type: string;
    workspaceFolderJson: string;
  };
}

/**
 * Create a debug start event with given data.
 * @param ds Debug session to get data from.
 * @returns A created DebugStartEvent.
 */
function createDebugStartEvent(ds: DebugSession): DebugStartEvent {
  // The program variable is the file that is being debugged.
  const program = basename(ds.configuration['program']);
  return {
    type: DebugEvents.DEBUG_START,
    data: {
      time: Date.now(),
      name: ds.name,
      program,
      request: ds.configuration.request,
      type: ds.type,
      workspaceFolder: ds.workspaceFolder,
    },
  } as DebugStartEvent;
}

/**
 * Create a debug stop event with given data.
 * @returns A created DebugStopEvent.
 */
function createDebugStopEvent(): DebugStopEvent {
  return {
    type: DebugEvents.DEBUG_STOP,
    data: {
      time: Date.now(),
    },
  } as DebugStopEvent;
}

/**
 * Converts the workspaceFolder data type to a JSON string.
 */
function serializeDebugStartEvent(dse: DebugStartEvent): SerializedDebugStartEvent {
  const { workspaceFolder, ...eventData } = dse.data;
  return ({
    ...dse,
    data: {
      ...eventData,
      workspaceFolderJson: JSON.stringify(workspaceFolder),
    },
  } as unknown) as SerializedDebugStartEvent;
}

/**
 * Converts JSON string to a workspaceFolder data type.
 */
function deserializeDebugStartEvent(sde: SerializedDebugStartEvent): DebugStartEvent {
  const { workspaceFolderJson, ...eventData } = sde.data;
  return ({
    ...sde,
    data: {
      ...eventData,
      workspaceFolder: JSON.parse(workspaceFolderJson),
    },
  } as unknown) as DebugStartEvent;
}

export {
  DebugEvents,
  DebugEvent,
  DebugStartEvent,
  DebugStopEvent,
  createDebugStartEvent,
  createDebugStopEvent,
  serializeDebugStartEvent,
  deserializeDebugStartEvent,
};
