import { ChildProcess } from 'child_process';
import IPlatform from '../environment/IPlatform';

/**
 * Handle Audio.
 */
export default abstract class Audio {
  protected audioFilePath: string;
  protected pid: number;
  protected currentAudioProcess: ChildProcess;
  protected iPlatform: IPlatform;

  constructor(path: string, ip: IPlatform) {
    this.audioFilePath = path;
    this.iPlatform = ip;
  }
}
