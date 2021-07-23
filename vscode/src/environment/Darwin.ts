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
}