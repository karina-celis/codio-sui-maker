import IDeviceParser from "../environment/IDeviceParser";

//Heavily based on: https://github.com/syumai/ffmpeg-device-list-parser
const exec = require('child_process').exec;

/**
 * Get a list of input (audio and video) devices found.
 * @param deviceParser A device parser to help parsing OS specific output. 
 * @param callback Optional callback to alert requester when parsing is done.
 * @returns A DeviceList containing audio and video input devices found.
 */
function getDeviceList(
  deviceParser: IDeviceParser,
  callback?: (value: unknown) => void,
): Promise<DeviceList> {
  const videoDevices: Device[] = [];
  const audioDevices: Device[] = [];

  // Parse
  const execute = (fulfill?: (value: unknown) => void) => {
    exec(deviceParser.cmd, (err, stdout, stderr) => {
      stderr
        .split('\n')
        .filter(deviceParser.searchPrefix)
        .forEach((line: string) => {
          const result: Record<string, string | Device> | undefined = deviceParser.lineParser(line);
          const deviceList = result?.type === 'video' ? videoDevices : audioDevices;
          if (result) {
            console.log('getDeviceList result', result);
            deviceList.push(result.device as Device);
          }
        });

      fulfill({ videoDevices, audioDevices });
    });
  };

  if (typeof callback === 'function') {
    execute(callback);
  } else {
    return new Promise(execute) as Promise<DeviceList>;
  }
}

export { getDeviceList };
