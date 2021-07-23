export default interface IPlatform {
  /**
 * Check if dependencies need to be installed.
 * @returns Resolve to true if all dependencies are available.
 */
  resolveDependencies(): Promise<boolean>;
}