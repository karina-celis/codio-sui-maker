import { v4 as uuid } from 'uuid';
import { UI, MESSAGES, showChooseAudioDevice, MODAL_MESSAGE_OBJS } from '../user_interface/messages';
import Recorder from '../recorder/Recorder';
import Player from '../player/Player';
import FSManager from '../filesystem/FSManager';
import { Uri } from 'vscode';
import { checkForFfmpeg } from '../utils';

export default async function recordCodio(
  fsManager: FSManager,
  player: Player,
  recorder: Recorder,
  destUri?: Uri,
  workspaceRoot?: Uri,
  getCodioName?: () => Promise<string>,
): Promise<void> {
  const hasFfmpeg = await checkForFfmpeg();
  if (!hasFfmpeg) {
    UI.showModalMessage(MODAL_MESSAGE_OBJS.ffmpegNotAvailable);
    return;
  }

  if (player.isPlaying) {
    player.stop();
  }

  let codioName = '';
  if (getCodioName) {
    codioName = await getCodioName();
  }

  codioName = codioName?.trim();
  if (!codioName) {
    UI.showModalMessage(MODAL_MESSAGE_OBJS.emptyCodioNameInvalid);
    return;
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
