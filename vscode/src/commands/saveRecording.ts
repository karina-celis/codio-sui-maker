import { UI, MODAL_MESSAGE_OBJS } from '../user_interface/messages';
import Recorder from '../recorder/Recorder';
import { workspace } from 'vscode';

export default async function saveRecording(recorder: Recorder): Promise<void> {
  try {
    if (recorder && recorder.isRecording) {
      await workspace.saveAll(true);
      await recorder.stopRecording();
      recorder.saveRecording();
      UI.showModalMessage(MODAL_MESSAGE_OBJS.recordingSaved);
    }
  } catch (e) {
    UI.showMessage(`Recording failed: ${e}`);
    console.log('finish recording failed', e);
  }
}
