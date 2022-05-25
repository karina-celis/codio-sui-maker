import { ChildProcess } from 'child_process';
import IDeviceParser from './IDeviceParser';

export default interface IPlatform {
  /**
   * Check if dependencies need to be installed.
   * @returns Resolve to true if all dependencies are available.
   */
  resolveDependencies(): Promise<boolean>;

  /**
   * Save files found in given codio path to a zip file in given destination path.
   * @param srcPath Source folder where files live.
   * @param destPath Destination folder where created zip file will live.
   * @returns The destination string where the zip file was successfully saved.
   */
  zip(srcPath: string, destPath: string): Promise<void>;

  /**
   * Uncompress given file to given destination.
   * @param srcPath Path of compressed file.
   * @param destPath Path to uncompress files to.
   * @param cb Callback to pass error result of unzip.
   */
  unzip(srcPath: string, destPath: string): Promise<void>;

  /**
   * Record using dependencies according to OS type.
   * @param inputDevice Input device identifier to use.
   * @param filePath File path to save at.
   */
  record(inputDevice: string, filePath: string): Promise<[ChildProcess, number]>;

  /**
   * Pause given process ID according to OS type.
   * @param pid Process ID to pause.
   */
  pause(pid: number): Promise<void>;

  /**
   * Resume given process ID according to OS type.
   * @param pid Process ID to resume.
   */
  resume(pid: number): Promise<void>;

  /**
   * Kill audio process according to OS type.
   * @param pid Process ID to stop.
   * @param cp Child process to try to quit.
   */
  kill(pid: number, cp: ChildProcess): Promise<void>;

  /**
   * Return extension folder according to OS type.
   */
  getExtensionFolder(): string;

  /**
   * Returns a device parser to be used to find input (audio and video) devices according to OS type.
   */
  getDeviceParser(): IDeviceParser;
}
