import { ChildProcess, exec, spawn } from 'child_process';
import { getDeviceList } from './ffmpegDeviceListParser';
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
   * @param time Time in seconds to seek into audio file.
   */
  play(time: number): void {
    this.currentAudioProcess = exec(`ffplay -hide_banner -nodisp -nostats -autoexit -ss ${time} ${this.audioFilePath}`);
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
    if (this.isRecording()) {
      await this.iPlatform.stopRecording(this.pid, this.currentAudioProcess);
    } else {
      this.iPlatform.stopPlaying(this.pid);
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
   * Clear process and reset state.
   */
  private clear(): void {
    this.currentAudioProcess = null;
    this.state = State.NONE;
  }
}
