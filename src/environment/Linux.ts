import { ChildProcess, spawn } from 'child_process';
import IDeviceParser from './IDeviceParser';
import IPlatform from './IPlatform';

export default class Linux implements IPlatform {
  // Line Parser specific
  private type = 'audio';

  /**
   * Check if dependencies need to be installed.
   * @returns Resolve to true if all dependencies are available.
   */
  public async resolveDependencies(): Promise<boolean> {
    // TODO: ffmpeg
    return true;
  }

  public async record(inputDevice: string, filePath: string): Promise<[ChildProcess, number]> {
    const cp = spawn('ffmpeg', [
      '-hide_banner',
      '-nostats',
      '-loglevel',
      'error',
      '-f',
      'pulse',
      '-i',
      `${inputDevice}`,
      '-y',
      filePath,
    ]);

    const pid = cp ? cp.pid : null;
    return [cp, pid];
  }

  async pause(pid: number): Promise<void> {
    process.kill(pid, 'SIGSTOP');
  }

  async resume(pid: number): Promise<void> {
    process.kill(pid, 'SIGCONT');
  }

  kill(pid: number, cp: ChildProcess): void {
    console.log('kill', { pid, cp });
    if (cp) {
      cp.kill();
      return;
    }
    try {
      process.kill(pid);
    } catch (error) {
      if (error.code === 'ESRCH') {
        console.warn(`PID: ${pid} not found.`);
      } else {
        console.error(`${error.code}: ${error.message}`);
      }
    }
  }

  getDeviceParser(): IDeviceParser {
    return {
      cmd: 'pactl',
      args: ['list', 'short', 'sources'],
      searchPrefix: (line: string) => line.search(/input/) > -1,
      lineParser: this.lineParser.bind(this),
    };
  }

  /**
   * Check given line for identifiable device information to create a device object from.
   * @param line Line to parse.
   * @returns Created type and device data if given line is valid, undefined otherwise.
   */
  private lineParser(line: string): Record<string, string | Device> | undefined {
    // Get input device id and name
    const id = line.match(/^\d+/);
    const name = line.match(/[^\d+\s+]\S+/);

    // Get device parameters.
    if (id.length && name.length) {
      const device: Device = {
        id: parseInt(id[0]),
        name: name[0],
      };

      return { type: this.type, device };
    }

    return undefined;
  }
}
