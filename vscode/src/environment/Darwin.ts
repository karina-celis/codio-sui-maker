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
}