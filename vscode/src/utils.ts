import * as vscode from 'vscode';
import { execFile } from 'child_process';
import IDeviceParser from './environment/IDeviceParser';

//filesystem
export const uriSeperator = '/';

/**
 * VS Code schemes supported by software.
 */
const supportedSchemeTypes = ['file', 'untitled'];
export function schemeSupported(scheme: string): boolean {
  return supportedSchemeTypes.includes(scheme);
}

/**
 * Get a list of input (audio and video) devices found.
 * @note Heavily based on: https://github.com/syumai/ffmpeg-device-list-parser
 * @param deviceParser A device parser to help parsing OS specific output.
 * @param callback Optional callback to alert requester when parsing is done.
 * @returns A DeviceList containing audio and video input devices found.
 */
export function getDeviceList(
  deviceParser: IDeviceParser,
  callback?: (value: unknown) => void,
): Promise<DeviceList> {
  const videoDevices: Device[] = [];
  const audioDevices: Device[] = [];

  // Parse
  const execute = (fulfill?: (value: unknown) => void) => {
    execFile(deviceParser.cmd, deviceParser.args, (err, stdout, stderr) => {
      const output = stderr ? stderr : stdout; // stdout for Linux
      output
        .split('\n')
        .filter(deviceParser.searchPrefix)
        .forEach((line: string) => {
          const result: Record<string, string | Device> | undefined = deviceParser.lineParser(line);
          const deviceList = result?.type === 'video' ? videoDevices : audioDevices;
          if (result) {
            deviceList.push(result.device as Device);
          }
        });

      fulfill({ videoDevices, audioDevices });
    });
  };

  if (typeof callback === 'function') {
    execute(callback);
  } else {
    return new Promise(execute) as Promise<DeviceList>;
  }
}

//ffmpeg
export const checkForFfmpeg = async (): Promise<unknown> => {
  return new Promise((res) => {
    execFile('ffmpeg', ['-version'], (error) => {
      res(!error);
    });
  });
};

//editor
export async function overrideEditorText(editor: vscode.TextEditor, newText: string): Promise<void> {
  console.log('overrideEditorText editor', editor);
  console.log('overrideEditorText newText', newText);

  const invalidRange = new vscode.Range(0, 0, editor.document.lineCount /*intentionally missing the '-1' */, 0);
  console.log('overrideEditorText invalidRange', invalidRange);
  const fullRange = editor.document.validateRange(invalidRange);
  console.log('overrideEditorText fullRange', fullRange);
  console.log('overrideEditorText editor.selection', editor.selection);
  console.log('overrideEditorText editor.selections', editor.selections);
  await editor.edit((edit) => {
    console.log('editor edit', edit);
    return edit.replace(fullRange, newText);
  });
  console.log('overrideEditorText after editor.selection', editor.selection);
  console.log('overrideEditorText after editor.selections', editor.selections);
}

export function getTextEditor(path: string): vscode.TextEditor {
  return vscode.window.visibleTextEditors.find((editor) => editor.document.uri.path === path);
}
//strings
export function replaceRange(s: string, start: number, end: number, substitute: string): string {
  return s.substring(0, start) + substitute + s.substring(end);
}

export function nthIndex(str: string, pat: string, n: number): number {
  const L = str.length;
  let i = -1;
  while (n-- && i++ < L) {
    i = str.indexOf(pat, i);
    if (i < 0) {
      break;
    }
  }
  return i;
}

/**
 * After each interation wait for callback to return to continue.
 * @param array Array to iterate through and pass to callback.
 * @param callback Callback to wait on.
 */
export async function asyncForEach(
  array: Array<unknown>,
  callback: (elem: unknown, i: number, arr: Array<unknown>) => unknown,
): Promise<void> {
  for (let index = 0; index < array.length; index++) {
    await callback(array[index], index, array);
  }
}

/**
 * Check if given object is a tree item.
 * @param obj Object to check properties on.
 * @returns Return true if given object is a tree item; false otherwise.
 */
export function isTreeItem(obj = {}): boolean {
  return 'contextValue' in obj || 'command' in obj;
}

let extensionPath = null;

/**
 * Save extension path for later use.
 * @param path Path of extension being executed.
 */
export function saveExtensionPath(path: string): void {
  extensionPath = path;
}

/**
 * Get path to the extension being executed.
 * @returns The path to the extension being executed.
 */
export function getExtensionPath(): string {
  return extensionPath;
}
