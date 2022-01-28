import pauseOrResume from './pauseOrResume';
import playCodio from './playCodio';
import playCodioTask from './playCodioTask';
import goto from './goto';
import { forward, rewind } from './rewindAndForward';
import resumeCodio from './resumeCodio';
import pauseCodio from './pauseCodio';
import stopCodio from './stopCodio';
import pauseRecording from './pauseRecording';
import resumeRecording from './resumeRecording';
import saveRecording from './saveRecording';
import recordCodio from './recordCodio';
import cancelRecording from './cancelRecording';
import trimEnd from './trimEnd';

export const codioCommands = {
  pauseOrResume,
  playCodio,
  playCodioTask,
  goto,
  forward,
  rewind,
  resumeCodio,
  pauseCodio,
  stopCodio,
  cancelRecording,
  pauseRecording,
  resumeRecording,
  saveRecording,
  recordCodio,
  trimEnd,
};

// @TODO RECORDER_ACTION, PLAYER_ACTION
// @TODO codio.recorder.action, codio.player.action
export class CommandNames {
  public static readonly PLAY_CODIO = 'codio.playCodio';
  public static readonly PLAY_CODIO_TASK = 'codio.playCodioTask';
  public static readonly STOP_CODIO = 'codio.stopCodio';
  public static readonly RECORD_CODIO = 'codio.recordCodio';
  public static readonly SAVE_RECORDING = 'codio.saveRecording';
  public static readonly PAUSE_RECORDING = 'codio.pauseRecording';
  public static readonly RESUME_RECORDING = 'codio.resumeRecording';
  public static readonly CANCEL_RECORDING = 'codio.cancelRecording';
  public static readonly PAUSE_CODIO = 'codio.pauseCodio';
  public static readonly RESUME_CODIO = 'codio.resumeCodio';
  public static readonly PLAY_GOTO = 'codio.goto';
  public static readonly UPLOAD_CODIO = 'codio.uploadCodio';
  public static readonly DOWNLOAD_CODIO = 'codio.downloadCodio';
  public static readonly SEND_MESSAGE = 'codio.sendMessage';
  public static readonly RECORD_MESSAGE = 'codio.recordMessage';
  public static readonly PLAY_MESSAGE = 'codio.playMessage';
  public static readonly REWIND = 'codio.rewind';
  public static readonly FORWARD = 'codio.forward';
  public static readonly PAUSE_OR_RESUME = 'codio.pauseOrResume';
  public static readonly RECORD_CODIO_TO_PROJECT = 'codio.recordCodioToProject';
  public static readonly TRIM_END = 'codio.trimEnd';
}
