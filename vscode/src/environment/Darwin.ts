import { ChildProcess, exec } from "child_process";
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
    console.log('Darwin resolveDependencies');
    // TODO: ffmpeg

    return true;
  }

  public async zip(srcPath: string, destPath: string): Promise<void> {
    console.log('Darwin zip', srcPath, destPath);

    await promiseExec(`cd ${srcPath} && zip -r ${destPath} .`);
  }

  public normalizeFilePath(filePath: string): string {
    console.log('Darwin normalizeFilePath', filePath);

    return filePath;
  }

  public async record(inputDevice: string, filePath: string): Promise<[ChildProcess, number]> {
    console.log('Darwin record', inputDevice, filePath);

    const process = exec(`ffmpeg -hide_banner -nostats -loglevel error -f avfoundation -i :"${inputDevice}" -y ${filePath}`);
    const pid = process ? process.pid : null;
    return [process, pid];
  }

  async pause(pid: number): Promise<void> {
    console.log('Darwin pause', pid);

    process.kill(pid, 'SIGSTOP');
  }

  async resume(pid: number): Promise<void> {
    console.log('Darwin resume', pid);

    process.kill(pid, 'SIGCONT');
  }

  async kill(pid: number, cp: ChildProcess): Promise<void> {
    console.log('Darwin kill', pid);
    // process.kill(pid); // kill ESRCH because of unresolved promise
    cp.kill();
  }

  getExtensionFolder(): string {
    return join(homedir(), 'Library', 'codio');
  }

  getDeviceParser(): IDeviceParser {
    return {
      cmd: `ffmpeg -hide_banner -nostats -f avfoundation -list_devices true -i ""`,
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
    console.log('lineParser line', line);
    console.log('lineParser this.type', this.type);

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
