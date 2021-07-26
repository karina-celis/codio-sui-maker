export default interface IDeviceParser {
  cmd: string;
  searchPrefix(line: string): boolean;
  lineParser(line: string): Record<string, string | Device> | undefined;
}
