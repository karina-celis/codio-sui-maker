import { spawn } from 'child_process';
import Audio from './Audio';

/**
 * Handle playing of audio.
 */
export default class AudioPlayer extends Audio implements IMedia {
  /**
   * Start audio file from given time with no visuals and exit when done.
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
  }

  stop(): void {
    if(this.currentAudioProcess) {
      this.iPlatform.kill(this.pid, this.currentAudioProcess);
      this.currentAudioProcess = null;
    }
  }
}
