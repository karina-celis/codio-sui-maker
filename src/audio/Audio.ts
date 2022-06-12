import { ChildProcess, spawn } from 'child_process';
import { getDeviceList } from '../utils';
import IPlatform from '../environment/IPlatform';

/**
 * Possible audio process states.
 */
enum State {
  NONE,
  PLAYING,
  RECORDING,
  PAUSE,
}

/**
 * Handle playing and recording of audio.
 * @todo Could break this up to be AudioRecorder and AudioPlayer.
 */
export default class AudioHandler {
  audioFilePath: string;
  private pid: number;
  private currentAudioProcess: ChildProcess;
  private audioInputDevice: string;
  private state: State;
  private iPlatform: IPlatform;

  constructor(path: string, ip: IPlatform) {
    this.audioFilePath = path;
    this.iPlatform = ip;
  }

  async setDevice(prompt: (items: string[]) => Promise<string | undefined>): Promise<boolean> {
    if (this.iPlatform) {
      const deviceList: DeviceList = await getDeviceList(this.iPlatform.getDeviceParser());
      console.log('deviceList', deviceList);
      const audioDevices: Device[] = deviceList.audioDevices;
      if (audioDevices.length) {
        if (audioDevices.length > 1) {
          const deviceName = await prompt(audioDevices.map((device: Device) => device.name));
          if (deviceName) {
            this.audioInputDevice = deviceName;
          }
        } else {
          this.audioInputDevice = audioDevices[0].name;
        }
      }
      if (!this.audioInputDevice) {
        return false;
      } else {
        return true;
      }
    }
  }

  async record(): Promise<void> {
    [this.currentAudioProcess, this.pid] = await this.iPlatform.record(this.audioInputDevice, this.audioFilePath);
    this.state = State.RECORDING;
  }

  async stopRecording(): Promise<void> {
    await this.stopAudioProcess();
  }

  /**
   * Play audio file with no visuals and exit when done.
   * @param timeMs Time in milliseconds to seek into audio file.
   */
  start(timeMs: number): void {
    this.currentAudioProcess = spawn('ffplay', [
      '-hide_banner',
      '-nodisp',
      '-nostats',
      '-autoexit',
      '-ss',
      `${timeMs / 1000}`,
      `${this.audioFilePath}`,
    ]);
    this.pid = this.currentAudioProcess.pid;
    this.state = State.PLAYING;
  }

  /**
   * Pause when playing or recording audio.
   * @returns Void
   */
  async pause(): Promise<void> {
    if (!this.state || this.state === State.PAUSE) {
      return;
    }

    if (this.state === State.PLAYING) {
      await this.stopAudioProcess();
      return;
    }

    // Recording
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
  private async stopAudioProcess(): Promise<void> {
    const cp = this.currentAudioProcess;
    if (this.isRecording()) {
      // Kill if VS Code process exits before audio process
      const killFunc = () => {
        this.iPlatform.kill(this.pid, cp);
      };
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
    } else {
      this.iPlatform.kill(this.pid, this.currentAudioProcess);
    }

    this.clear();
  }

  /**
   * Check if the current process writeable.
   * @return True if writeable, false otherwise.
   */
  private isRecording(): boolean {
    return this.currentAudioProcess?.stdin.writable && this.state === State.RECORDING;
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
