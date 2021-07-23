import { spawn } from "child_process";
import { sep } from "path";
import { exists, getExtensionPath } from "../utils";
import IPlatform from "./IPlatform";

export default class Windows_NT implements IPlatform {
  /**
   * Check if dependencies need to be installed.
   * @returns Resolve to true if all dependencies are available.
   */
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
}