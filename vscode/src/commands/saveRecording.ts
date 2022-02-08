import { UI, MODAL_MESSAGE_OBJS } from '../user_interface/messages';
import Recorder from '../recorder/Recorder';
import { window, workspace } from 'vscode';
import { schemeSupported } from '../utils';

export default async function saveRecording(recorder: Recorder): Promise<void> {
  try {
    if (recorder && recorder.isRecording) {
      for (let i = 0; i < workspace.textDocuments.length; i++) {
        const td = workspace.textDocuments[i];
        if (!schemeSupported(td.uri.scheme)) {
          continue;
        }

        await window.showTextDocument(td.uri, { preview: false });
        await td.save();
      }

      await recorder.stopRecording();
      recorder.saveRecording();
      UI.showModalMessage(MODAL_MESSAGE_OBJS.recordingSaved);
    }
  } catch (e) {
    UI.showMessage(`Recording failed: ${e}`);
    console.log('finish recording failed', e);
  }
}
