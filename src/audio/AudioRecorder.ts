import { ChildProcess } from 'child_process';
import { getDeviceList } from '../utils';
import Audio from './Audio';

/**
 * Possible audio process states.
 */
enum State {
  NONE,
  RECORDING,
  PAUSE,
}

/**
 * Handle recording of audio.
 */
export default class AudioRecorder extends Audio implements IMedia {
  private audioInputDevice: string;
  private state: State;

  async setDevice(prompt: (items: string[]) => Promise<string | undefined>): Promise<boolean> {
    if (this.iPlatform) {
      const deviceList: DeviceList = await getDeviceList(this.iPlatform.getDeviceParser());
      console.log('deviceList', deviceList);
      const audioDevices: Device[] = deviceList.audioDevices;
      if (audioDevices.length > 1) {
        const deviceName = await prompt(audioDevices.map((device: Device) => device.name));
        if (deviceName) {
          this.audioInputDevice = deviceName;
        }
      } else if (audioDevices.length === 1) {
        this.audioInputDevice = audioDevices[0].name;
      }
      return this.audioInputDevice ? true : false;
    }
  }

  async start(): Promise<void> {
    [this.currentAudioProcess, this.pid] = await this.iPlatform.record(this.audioInputDevice, this.audioFilePath);
    this.state = State.RECORDING;
  }

  /**
   * Pause when recording audio.
   * @returns Void
   */
  async pause(): Promise<void> {
    if (!this.state || this.state === State.PAUSE) {
      return;
    }

    await this.iPlatform.pause(this.pid);
    this.state = State.PAUSE;
  }

  /**
   * Resume audio recording process.
   * @returns Void
   */
  async resume(): Promise<void> {
    if (this.state !== State.PAUSE) {
      return;
    }

    await this.iPlatform.resume(this.pid);
    this.state = State.RECORDING;
  }

  /**
   * Stop audio process in regards to OS.
   */
  async stop(): Promise<void> {
    const cp = this.currentAudioProcess;

    // Kill if VS Code process exits before audio process
    const killFunc = () => {
      this.iPlatform.kill(this.pid, cp);
    };

    if(!this.processExitedCleanly(cp.exitCode, cp.signalCode)){
      killFunc();
      console.log('stopAudioProcess processExitedCleanly Error');
      return;
    }
    process.once('exit', killFunc);
    // Listen to child process events and handle accordingly when quitting
    const p = new Promise<string>((res, rej) => {
      cp.once('exit', (code, signal) => {
        console.log('Audio cp exit', code, signal);

        process.removeListener('exit', killFunc);

        if (this.processExitedCleanly(code, signal)) {
          res('');
        } else {
          killFunc();
          rej('stopAudioProcess processExitedCleanly Error');
        }
      });

      cp.once('error', (err) => {
        console.log('Audio cp error', err);

        process.removeListener('exit', killFunc);
        killFunc();
        rej(err.message);
      });
    });

    this.quitRecording(cp);
    await p;
    this.clear();
  }

  /**
   * Quit recording on ffmpeg by sending 'q' to the process input.
   * Only valid if duration argument not given when executed.
   */
  private quitRecording(cp: ChildProcess) {
    cp.stdin.write('q');
  }

  /**
   * Check if process exited cleanly.
   * @param code Exit code; 0 for no issues.
   * @param signal Signal code; null for no issues.
   * @return True on clean exit, false otherwise.
   */
  private processExitedCleanly(code: number, signal: string) {
    if (code || signal) {
      return false;
    }
    return true;
  }

  /**
   * Clear process and reset state.
   */
  private clear(): void {
    this.currentAudioProcess = null;
    this.state = State.NONE;
  }
}
