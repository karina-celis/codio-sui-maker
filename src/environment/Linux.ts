import { ChildProcess, execSync, spawn } from 'child_process';
import { sep } from 'path';
import { chmod, constants } from 'fs';
import which = require('which');
import IDeviceParser from './IDeviceParser';
import IPlatform from './IPlatform';
import { getExtensionPath } from '../utils';

export default class Linux implements IPlatform {
  // Line Parser specific
  private type = 'audio';
  private zipPgm = '';

  /**
   * Check if dependencies need to be installed.
   * @returns Resolve to true if all dependencies are available.
   */
  public async resolveDependencies(): Promise<boolean> {
    // TODO: ffmpeg

    // Global install?
    let found = which.sync('7z', { nothrow: true });
    if (found) {
      this.zipPgm = '7z';
      return true;
    }

    // Local valid install?
    const libPath = `${getExtensionPath()}${sep}dependencies${sep}linux${sep}`;
    found = which.sync('7za', { nothrow: true, path: `${libPath}` });
    if (found) {
      this.zipPgm = `${libPath}7za`;
      return true;
    }

    // Install and change to executable
    const success = await this.install7zip();
    if (success) {
      const exeOptions =
        constants.S_IXUSR |
        constants.S_IXGRP |
        constants.S_IXOTH |
        constants.S_IRUSR |
        constants.S_IRGRP |
        constants.S_IROTH;

      this.zipPgm = `${libPath}7za`;

      // Not on Windows
      chmod(`${this.zipPgm}`, exeOptions, (err) => {
        console.log('chmod error: ', err);
      });
      console.info('Installed 7za!');
    }
    return success;
  }

  /**
   * Install 7zip.
   */
  private install7zip(): Promise<boolean> {
    const installPath = `${getExtensionPath()}${sep}dependencies${sep}linux${sep}install.cjs`;

    return new Promise((res, rej) => {
      try {
        const cp = spawn('node', ['--unhandled-rejections=strict', installPath]);
        cp.on('close', (code) => {
          if (code) {
            console.error('install7zip process error code:', code);
            rej(false);
          }

          res(true);
        });

        cp.on('error', (data) => {
          console.error('install7zip error data', data.toString());
        });
        cp.stderr.on('data', (data) => {
          console.info('install7zip info:', data.toString());
        });
      } catch (error) {
        console.error('Install Error', error.message);
        rej(false);
      }
    });
  }

  public zip(srcPath: string, destPath: string): void {
    execSync(`cd ${srcPath} && ${this.zipPgm} a -tzip ${destPath} .`);
  }

  public unzip(srcPath: string, destPath: string): void {
    execSync(`${this.zipPgm} x -o${destPath} ${srcPath}`);
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

  async kill(pid: number, cp: ChildProcess): Promise<void> {
    cp.kill();
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
