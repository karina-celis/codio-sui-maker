import { UI, MODAL_MESSAGE_OBJS, ProgressObserver } from '../user_interface/messages';
import Recorder from '../recorder/Recorder';
import { window, workspace } from 'vscode';
import { schemeSupported } from '../utils';

export default async function recordSave(recorder: Recorder): Promise<void> {
  if (!recorder || !recorder.isRecording) {
    return;
  }

  try {
    const processedPaths = {};
    await recorder.stopRecording();

    let increment;
    let obs = new ProgressObserver(window.visibleTextEditors.length, false);
    UI.showProgress('Processing Visible Text Editors', obs);

    // Save visible documents
    for (let i = 0; i < obs.total; i++) {
      const te = window.visibleTextEditors[i];
      const td = te.document;

      if (!schemeSupported(td.uri.scheme) || processedPaths[td.uri.path]) {
        continue;
      }

      increment = Math.round(((i + 1) / obs.total) * 100);
      obs.update(increment, `${i + 1} of ${obs.total}.`);

      await window.showTextDocument(td.uri, { viewColumn: te.viewColumn, preview: false });
      await td.save();

      // Guard against multiple visible columns with the same file.
      processedPaths[td.uri.path] = 1;
    }
    obs.done();

    obs = new ProgressObserver(workspace.textDocuments.length, false);
    UI.showProgress('Processing Text Documents', obs);

    // Saved opened but not visible documents
    for (let i = 0; i < obs.total; i++) {
      const td = workspace.textDocuments[i];
      if (!td || !schemeSupported(td.uri.scheme)) {
        continue;
      }

      increment = Math.round(((i + 1) / obs.total) * 100);
      obs.update(increment, `${i + 1} of ${obs.total}.`);

      if (processedPaths[td.uri.path]) {
        continue;
      }

      await window.showTextDocument(td.uri, { viewColumn: 1, preview: false });
      await td.save();
    }
    obs.done();

    recorder.saveRecording();
    UI.showModalMessage(MODAL_MESSAGE_OBJS.recordingSaved);
  } catch (e) {
    UI.showMessage(`Recording failed: ${e}`);
    console.log('finish recording failed', e);
  }
}
