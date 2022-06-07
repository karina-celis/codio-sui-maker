import { v4 as uuid } from 'uuid';
import { UI, MESSAGES, showChooseAudioDevice, MODAL_MESSAGE_OBJS } from '../user_interface/messages';
import Recorder from '../recorder/Recorder';
import FSManager from '../filesystem/FSManager';
import { Uri } from 'vscode';

export default async function recordStart(
  fsManager: FSManager,
  recorder: Recorder,
  destUri: Uri,
  workspaceRoot: Uri,
  codioName: string,
): Promise<void> {
  if (recorder.isRecording) {
    await recorder.stopRecording();
    recorder.saveRecording();
  }

  const path = await fsManager.createTempCodioFolder(uuid());
  await recorder.loadCodio(path, codioName, destUri, workspaceRoot);
  const isDeviceAvailable = await recorder.setRecordingDevice(showChooseAudioDevice);
  if (!isDeviceAvailable) {
    UI.showModalMessage(MODAL_MESSAGE_OBJS.noRecordingDeviceAvailable);
    return;
  }

  await recorder.startRecording();
  UI.showRecorderStatusBar(recorder);
  UI.showMessage(MESSAGES.startingToRecord);
}
