import { UI, MODAL_MESSAGE_OBJS } from '../user_interface/messages';
import Recorder from '../recorder/Recorder';

export default async function cancelRecording(recorder: Recorder): Promise<void> {
  try {
    // TODO: Don't think I need try and catch here
    if (recorder && recorder.isRecording) {
      await recorder.cancel();
      UI.showModalMessage(MODAL_MESSAGE_OBJS.recordingCanceled);
    }
  } catch (e) {
    UI.showMessage(`Cancel Recording failed: ${e}`);
    console.log('cancel recording failed', e);
  }
}
