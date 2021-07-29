import { ChildProcess, spawn } from "child_process";
import { homedir } from "os";
import { join } from "path";
import { promiseExec } from "../utils";
import IDeviceParser from "./IDeviceParser";
import IPlatform from "./IPlatform";

export default class Darwin implements IPlatform {
  // Line Parser specific
  private type = 'video';

  /**
   * Check if dependencies need to be installed.
   * @returns Resolve to true if all dependencies are available.
   */
  public async resolveDependencies(): Promise<boolean> {
    // TODO: ffmpeg
    return true;
  }

  public async zip(srcPath: string, destPath: string): Promise<void> {
    await promiseExec(`cd ${srcPath} && zip -r ${destPath} .`);
  }

  public normalizeFilePath(filePath: string): string {
    return filePath;
  }

  public async record(inputDevice: string, filePath: string): Promise<[ChildProcess, number]> {
    const cp = spawn(
      'ffmpeg',
      [
        '-hide_banner',
        '-nostats',
        '-loglevel',
        'error',
        '-f',
        'avfoundation',
        '-i',
        `:${inputDevice}`,
        '-y',
        filePath,
      ],
    );
    const pid = cp ? cp.pid : null;
    return [cp, pid];
  }

  async pause(pid: number): Promise<void> {
    process.kill(pid, 'SIGSTOP');
  }

  async resume(pid: number): Promise<void> {
    process.kill(pid, 'SIGCONT');
  }

  async kill(pid: number, cp: ChildProcess): Promise<void> {
    // process.kill(pid); // kill ESRCH because of unresolved promise
    cp.kill();
  }

  getExtensionFolder(): string {
    return join(homedir(), 'Library', 'codio');
  }

  getDeviceParser(): IDeviceParser {
    return {
      cmd: 'ffmpeg',
      args: [
        '-hide_banner',
        '-nostats',
        '-f',
        'avfoundation',
        '-list_devices',
        'true',
        '-i',
        '""'
      ],
      searchPrefix: (line: string) => line.search(/^\[AVFoundation/) > -1,
      lineParser: this.lineParser.bind(this),
    }
  }

  /**
   * Check given line for identifiable device information to create a device object from.
   * @param line Line to parse.
   * @returns Created type and device data if given line is valid, undefined otherwise.
   */
  private lineParser(line: string): Record<string, string | Device> | undefined {
    // Check for when video devices are encountered.
    if (this.type === 'audio' && line.search(/AVFoundation\svideo\sdevices/) > -1) {
      this.type = 'video';
      return;
    }

    // Check for when audio devices are encountered.
    if (this.type === 'video' && line.search(/AVFoundation\saudio\sdevices/) > -1) {
      this.type = 'audio';
      return;
    }

    // Get device parameters.
    const params = line.match(/^\[AVFoundation.*?\]\s\[(\d*?)\]\s(.*)$/);
    if (params) {
      const device: Device = {
        id: parseInt(params[1]),
        name: params[2],
      };

      return { type: this.type, device };
    }

    return undefined;
  }
}
