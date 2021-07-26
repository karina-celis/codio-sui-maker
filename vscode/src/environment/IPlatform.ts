import { ChildProcess } from "child_process";
import IDeviceParser from "./IDeviceParser";

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
   * Normalize for environments where case is sensitive.
   * @param filePath File path to normalize.
   * @returns Normalized given file path.
   */
  normalizeFilePath(filePath: string): string;

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
   * Stop playing audio according to OS type.
   * @param pid Process ID to stop.
   */
  stopPlaying(pid: number): Promise<void>;

  /**
   * Stop recording audio according to OS type.
   * @param pid Process ID to stop.
   * @param cp Child process to try to quit.
   */
  stopRecording(pid: number, cp: ChildProcess): Promise<string | void>;

  /**
   * Return extension folder according to OS type.
   */
  getExtensionFolder(): string;

  /**
   * Returns a device parser to be used to find input (audio and video) devices according to OS type.
   */
  getDeviceParser(): IDeviceParser;
}
