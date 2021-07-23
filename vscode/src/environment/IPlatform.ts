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
}