import { ChildProcess, spawn } from "child_process";
import { join, sep } from "path";
import { zip } from 'cross-zip';
import { exists, getExtensionPath } from "../utils";
import IPlatform from "./IPlatform";
import { homedir } from "os";
import IDeviceParser from "./IDeviceParser";

export default class Windows_NT implements IPlatform {
  // Line Parser specific
  private type = 'video';
  private lastDevice: Device;

  public async resolveDependencies(): Promise<boolean> {
    console.log('Windows resolveDependencies');
    // TODO: ffmpeg

    // Recorder Pause/Resume
    const libPath = `${getExtensionPath()}${sep}dependencies${sep}win${sep}win32-${process.arch}_lib.node`;
    const fileExists = await exists(libPath);
    if (!fileExists) {
      return await this.installWindowsPauseResume();
    }

    return true;
  }

  /**
   * Install ntsuspend.
   */
  private async installWindowsPauseResume(): Promise<boolean> {
    console.log('Windows installWindowsPauseResume');

    const libPath = `${getExtensionPath()}${sep}dependencies${sep}win${sep}install.cjs`;

    return new Promise((res, rej) => {
      try {
        const cp = spawn('node', ['--unhandled-rejections=strict', libPath]);
        cp.on('close', (code) => {
          if (code) {
            console.error('installWindowsPauseResume process error code:', code);
            rej(false);
          }

          res(true);
        });

        cp.on('error', (data) => {
          console.error('installWindowsPauseResume error data', data.toString());
        });
        cp.stderr.on('data', (data) => {
          console.info('installWindowsPauseResume info:', data.toString());
        });
      } catch (error) {
        console.error('Install Error', error.message);
        rej(false);
      }
    });
  }

  public async zip(srcPath: string, destPath: string): Promise<void> {
    console.log('Windows zip', srcPath, destPath);

    await new Promise((res, rej) => zip(srcPath, destPath, (error: Error) => (error ? rej(error) : res(''))));
  }

  public normalizeFilePath(filePath: string): string {
    console.log('Windows normalizeFilePath', filePath);

    return filePath.toLowerCase();
  }

  public async record(inputDevice: string, filePath: string): Promise<[ChildProcess, number]> {
    console.log('Windows record', inputDevice, filePath);

    let pid = null;
    const cp = spawn(
      'ffmpeg',
      [
        '-hide_banner',
        '-nostats',
        '-loglevel',
        'error',
        '-f',
        'dshow',
        '-i',
        `audio="${inputDevice}"`,
        '-y',
        filePath,
      ],
      { shell: 'powershell.exe' }, // Using powershell will result in one instance to handle
    );

    try {
      pid = await this.findPID('ffmpeg.exe');
    } catch (error) {
      console.log('Audio record', error);
    }

    return [cp, pid];
  }

  /**
   * Finds Process Id of given command. This is Windows based because of how
   * some third party package managers install shims.
   * @see https://github.com/lukesampson/scoop/issues/4376
   * @param cmd Command to find in the tasklist.
   * @returns Resolves to PID found or error strings if rejected.
   */
  private findPID(cmd: string): Promise<number> {
    return new Promise((res, rej) => {
      let output = '';

      const callAndParse = (cmd: string) => {
        const taskListProcess = spawn('tasklist.exe', ['/FI', `"IMAGENAME eq ${cmd}"`, '/FO', 'CSV', '/NH'], {
          shell: 'powershell.exe',
        });

        taskListProcess.stderr.on('data', (data) => {
          rej(data.toString());
        });

        // Compile data received
        taskListProcess.stdout.on('data', (data) => {
          output += data.toString();
        });

        taskListProcess.on('close', (code) => {
          if (code) {
            rej(`Error code: ${code}`);
          }

          const arr = this.getLastLine(output).split(',');
          if (arr.length < 2) {
            rej('PID in array not found.');
          }

          const pid = parseInt(arr[1]);
          pid > 0 ? res(pid) : rej('Valid PID not found.');
        });
      };

      callAndParse(cmd);
    });
  }

  /**
   * Get the last non-empty line from the given output.
   * @param output Output to parse.
   * @returns String found or empty string on no data.
   */
  private getLastLine(output: string): string {
    let lines = output.split('\n');
    lines = lines.filter((line) => line.length);
    const last = lines[lines.length - 1];
    return last.replace(/"/gm, '');
  }

  async pause(pid: number): Promise<void> {
    console.log('Windows pause', pid);

    const { suspend } = await import(`..${sep}..${sep}dependencies${sep}win${sep}win32-${process.arch}_lib.node`);
    suspend(pid);
  }

  async resume(pid: number): Promise<void> {
    console.log('Windows resume', pid);

    const { resume } = await import(`..${sep}..${sep}dependencies${sep}win${sep}win32-${process.arch}_lib.node`);
    resume(pid);
  }

  async kill(pid: number, cp: ChildProcess): Promise<void> {
    console.log('Windows kill', pid);

    this.taskKill(pid);
  }

  /**
   * Windows specific way to kill a process when all else fails.
   * taskkill options:
   * '/pid' Process Id to kill.
   * '/f' Force.
   * '/t' Terminate any children.
   */
  private taskKill(pid: number) {
    spawn('taskkill', ['/pid', pid.toString(), '/f', '/t']);
  }

  getExtensionFolder(): string {
    return join(homedir(), 'codio');
  }

  getDeviceParser(): IDeviceParser {
    return {
      cmd: `ffmpeg.exe -hide_banner -nostats -f dshow -list_devices true -i dummy`,
      searchPrefix: (line: string) => line.search(/\[dshow/) > -1,
      lineParser: this.lineParser.bind(this),
    }
  }

  /**
   * Check given line for identifiable device information to create a device object from.
   * @param line Line to parse.
   * @returns Created type and device data if given line is valid, undefined otherwise.
   */
  private lineParser(line: string): Record<string, string | Device> | undefined {
    console.log('lineParser line', line);
    console.log('lineParser this.type', this.type);

    // Check for when video devices are encountered.
    if (this.type === 'audio' && line.search(/DirectShow\svideo\sdevices/) > -1) {
      this.type = 'video';
      return;
    }

    // Check for when audio devices are encountered.
    if (this.type === 'video' && line.search(/DirectShow\saudio\sdevices/) > -1) {
      this.type = 'audio';
      return;
    }

    // Check for when alternative name is reached on Windows
    // and set last device's  alternativeName to it.
    if (line.search(/Alternative\sname/) > -1) {
      this.lastDevice.alternativeName = line.match(/Alternative\sname\s*?\"(.*?)\"/)[1];
      return;
    }

    // Get device parameters.
    const params = line.match(/\"(.*?)\"/);
    if (params) {
      const device: Device = {
        name: params[1],
      };

      this.lastDevice = device;
      return { type: this.type, device };
    }

    return undefined;
  }
}
