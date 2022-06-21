import { execFile, execFileSync } from 'child_process';
import IDeviceParser from './environment/IDeviceParser';

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
export function getDeviceList(deviceParser: IDeviceParser, callback?: (value: unknown) => void): Promise<DeviceList> {
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

/**
 * Check if the archival program `tar` exists.
 * @returns True if `tar` exists; false otherwise
 */
export function containsTar(): boolean {
  try {
    execFileSync('tar', ['--version']);
    return true;
  } catch (error) {
    console.log('error', error.message);
    return false;
  }
}

interface FFmpegVersion {
  major: number;
  minor: number;
  patch: number;
}

let ffmpegVersion: FFmpegVersion = { major: 0, minor: 0, patch: 0 };

export const getFFmpegVersion = (): FFmpegVersion => {
  return ffmpegVersion;
};

/**
 * Check if FFmpeg is on the system and update version info.
 * @returns Return FFmpeg version object or false otherwise.
 */
export const containsFFmpeg = (): FFmpegVersion | boolean => {
  try {
    const output = execFileSync('ffmpeg', ['-version'], { encoding: 'utf8' });
    const versionRE = RegExp(/\d+\.\d+\.?\d*/);
    const results = versionRE.exec(output);
    if (!results.length) {
      return false;
    }

    const parts = results[0].split('.');
    ffmpegVersion = {
      major: parseInt(parts[0]),
      minor: parseInt(parts[1]),
      patch: parseInt(parts[2]),
    };
    return ffmpegVersion;
  } catch (error) {
    console.log('error', error.message);
    return false;
  }
};

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
