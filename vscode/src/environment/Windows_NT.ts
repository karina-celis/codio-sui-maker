import { ChildProcess, spawn } from "child_process";
import { join, sep } from "path";
import { zip } from 'cross-zip';
import { exists, getExtensionPath } from "../utils";
import IPlatform from "./IPlatform";
import { homedir } from "os";

export default class Windows_NT implements IPlatform {
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

  async stopPlaying(pid: number): Promise<void> {
    console.log('Windows stopPlaying', pid);

    this.taskKill(pid);
  }

  async stopRecording(pid: number, cp: ChildProcess): Promise<string> {
    console.log('Windows stopRecording', pid, cp);

    // Kill if VS Code process exits before audio process
    const anonFunc = () => { this.taskKill(pid) };
    process.once('exit', anonFunc);

    // Listen to child process events and handle accordingly when quitting
    const p = new Promise<string>((res, rej) => {
      cp.once('exit', (code, signal) => {
        console.log('Windows cp exit', code, signal);

        process.removeListener('exit', anonFunc);

        if (this.exitWin32Process(code, signal)) {
          res('');
        } else {
          this.taskKill(pid);
          rej('stopAudioProcess exitWin32Process Error');
        }
      });
      cp.once('error', (err) => {
        console.log('Windows cp error', err);

        process.removeListener('exit', anonFunc);
        this.taskKill(pid);
        rej(err.message);
      });
    });

    this.quitRecording(cp);

    return p;
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

  /**
   * Quit recording on ffmpeg by sending 'q' to the process input.
   * Only valid if duration argument not given when executed.
   */
  private quitRecording(cp: ChildProcess) {
    cp.stdin.write('q');
  }

  /**
   * Check if windows process exited cleanly.
   * @param code Exit code; 0 for no issues.
   * @param signal Signal code; null for no issues.
   * @return True on clean exit, false otherwise.
   */
  private exitWin32Process(code: number, signal: string) {
    if (code || signal) {
      return false;
    }
    return true;
  }

  getExtensionFolder(): string {
    return join(homedir(), 'codio');
  }
}
