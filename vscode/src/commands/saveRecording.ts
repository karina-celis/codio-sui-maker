import { UI, MODAL_MESSAGE_OBJS } from '../user_interface/messages';
import Recorder from '../recorder/Recorder';
import { window, workspace } from 'vscode';
import { schemeSupported } from '../utils';

export default async function saveRecording(recorder: Recorder): Promise<void> {
  try {
    if (recorder && recorder.isRecording) {
      const processedPaths = {};
      await recorder.stopRecording();

      // Save visible documents
      for (let i = 0; i < window.visibleTextEditors.length; i++) {
        const te = window.visibleTextEditors[i];
        const td = te.document;
        if (!schemeSupported(td.uri.scheme) || processedPaths[td.uri.path]) {
          continue;
        }

        await window.showTextDocument(td.uri, { viewColumn: te.viewColumn, preview: false });
        await td.save();
        processedPaths[td.uri.path] = 1;
      }

      // Saved opened but not visible documents
      for (let i = 0; i < workspace.textDocuments.length; i++) {
        const td = workspace.textDocuments[i];
        if (!schemeSupported(td.uri.scheme) || processedPaths[td.uri.path]) {
          continue;
        }

        await window.showTextDocument(td.uri, { viewColumn: 1, preview: false });
        await td.save();
      }

      recorder.saveRecording();
      UI.showModalMessage(MODAL_MESSAGE_OBJS.recordingSaved);
    }
  } catch (e) {
    UI.showMessage(`Recording failed: ${e}`);
    console.log('finish recording failed', e);
  }
}
