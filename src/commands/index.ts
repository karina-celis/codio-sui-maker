import playForward from './playForward';
import playGoto from './playGoto';
import playPause from './playPause';
import playResume from './playResume';
import playRewind from './playRewind';
import playStart from './playStart';
import playStop from './playStop';
import recordCancel from './recordCancel';
import recordPause from './recordPause';
import recordResume from './recordResume';
import recordSave from './recordSave';
import recordStart from './recordStart';

export const funcs = {
  playForward,
  playGoto,
  playPause,
  playResume,
  playRewind,
  playStart,
  playStop,
  recordCancel,
  recordPause,
  recordResume,
  recordSave,
  recordStart,
};

export enum Commands {
  PLAY_FORWARD = 'codio.play.forward',
  PLAY_GOTO = 'codio.play.goto',
  PLAY_PAUSE = 'codio.play.pause',
  PLAY_RESUME = 'codio.play.resume',
  PLAY_REWIND = 'codio.play.rewind',
  PLAY_START = 'codio.play.start',
  PLAY_STOP = 'codio.play.stop',
  RECORD_CANCEL = 'codio.record.cancel',
  RECORD_PAUSE = 'codio.record.pause',
  RECORD_RESUME = 'codio.record.resume',
  RECORD_SAVE = 'codio.record.save',
  RECORD_START = 'codio.record.start',
}
