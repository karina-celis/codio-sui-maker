import { UI, MESSAGES } from '../user_interface/messages';
import Recorder from '../recorder/Recorder';

export default async function recordPause(recorder: Recorder): Promise<void> {
  try {
    if (recorder && recorder.isRecording) {
      await recorder.pause();
      UI.showMessage(MESSAGES.recordingPaused);
    }
  } catch (e) {
    UI.showMessage(`Pause Recording failed: ${e}`);
    console.log('Pause recording failed', e);
  }
}
