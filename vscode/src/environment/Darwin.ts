import { ChildProcess, exec } from "child_process";
import { homedir } from "os";
import { join } from "path";
import { promiseExec } from "../utils";
import IPlatform from "./IPlatform";

export default class Darwin implements IPlatform {
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

    const process = exec(`ffmpeg -f avfoundation -i :"${inputDevice}" ${filePath}`);
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

  async stopPlaying(pid: number): Promise<void> {
    console.log('Darwin stopPlaying', pid);

    process.kill(pid);
  }

  async stopRecording(pid: number, cp: ChildProcess): Promise<void> {
    console.log('Darwin stopRecording', pid, cp);

    process.kill(pid);
  }

  getExtensionFolder(): string {
    return join(homedir(), 'Library', 'codio');
  }
}
