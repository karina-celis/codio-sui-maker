import EditorRecorder from '../editor/EditorRecorder';
import ProgressTimer from '../ProgressTimer';
import FSManager from '../filesystem/FSManager';
import { Uri, commands } from 'vscode';
import AudioHandler from '../audio/Audio';
import Environment from '../environment/Environment';
import DebugRecorder from '../debug/DebugRecorder';

export const CODIO_FORMAT_VERSION = '0.2.0';
const IS_RECORDING = 'isRecording';
const IS_PAUSED = 'isRecordingPaused';

/**
 * Manage media to record, cancel, stop, and save recordings.
 */
export default class Recorder {
  audioRecorder: AudioHandler;
  editorRecorder: EditorRecorder;
  debugRecorder: DebugRecorder;
  timer: ProgressTimer;
  codioPath: string;
  destinationUri: Uri | null;
  workspaceUri: Uri | null;
  codioName: string;

  recordingStartTime: number;
  recordingLength = 0;
  isRecording = false;

  pauseStartTime: number;
  pauseTotalTime: number;
  isPaused = false;

  stateObservers: Array<(isRecording: boolean, isPaused: boolean) => void>;
  recordingSavedObservers: Array<() => void> = [];
  process: Promise<unknown>;
  stopRecordingResolver: (value?: unknown) => void;

  async loadCodio(codioPath: string, codioName: string, destinationUri: Uri, workspaceUri: Uri): Promise<void> {
    console.log('loadCodio', { codioPath, codioName, destinationUri, workspaceUri });
    this.timer = new ProgressTimer(0);
    this.audioRecorder = new AudioHandler(FSManager.audioPath(codioPath), Environment.getInstance());
    this.editorRecorder = new EditorRecorder(workspaceUri.path);
    this.debugRecorder = new DebugRecorder();
    this.setInitialState(codioPath, codioName, destinationUri, workspaceUri);
  }

  private setInitialState(
    codioPath = '',
    codioName = '',
    destinationUri: Uri | null = null,
    workspaceUri: Uri | null = null,
  ) {
    this.codioPath = codioPath;
    this.codioName = codioName;
    this.destinationUri = destinationUri;
    this.workspaceUri = workspaceUri;
    this.process = undefined;
    this.stateObservers = [];
    this.recordingSavedObservers = [];
    this.pauseStartTime = 0;
    this.pauseTotalTime = 0;
    this.timer.setInitialState();
  }

  /**
   * Add observer to be notified on timer update.
   * @param observer Observer to add to timer onUpdate array.
   */
  onTimerUpdate(observer: (currentSecond: number, totalSeconds: number) => void): void {
    this.timer.onUpdate(observer);
  }

  /**
   * Add observer to be notified when state updates.
   * @param observer Observer to add to state update array.
   */
  onStateUpdate(observer: (isRecording: boolean, isPaused: boolean) => void): void {
    this.stateObservers.push(observer);
  }

  /**
   * Add observer to be notified when recording is saved.
   * @param observer Observer to add to recording saved array.
   */
  onRecordingSaved(observer: () => void): void {
    this.recordingSavedObservers.push(observer);
  }

  async setRecordingDevice(prompt: (items: string[]) => Promise<string | undefined>): Promise<boolean> {
    return this.audioRecorder.setDevice(prompt);
  }

  /**
   * Start recording on all media and set state.
   */
  async startRecording(): Promise<void> {
    this.recordingStartTime = Date.now() + 300;

    this.timer.start(0);
    await this.audioRecorder.record();
    await this.editorRecorder.start(this.recordingStartTime);
    this.debugRecorder.start(this.recordingStartTime);
    this.process = new Promise((resolve) => (this.stopRecordingResolver = resolve));

    this.isRecording = true;
    this.updateContext(IS_RECORDING, this.isRecording);
  }

  /**
   * Update given context to given value and update observers.
   * @param context String representing context to update.
   * @param value Value to set given context string to.
   */
  private updateContext(context: string, value: unknown): void {
    commands.executeCommand('setContext', context, value);
    this.stateObservers.forEach((obs) => {
      obs(this.isRecording, this.isPaused);
    });
  }

  /**
   * Cancel recording and reset state.
   */
  async cancel(): Promise<void> {
    await this.stopRecording();
    this.setInitialState();
  }

  /**
   * Stop recording and set state.
   */
  async stopRecording(): Promise<void> {
    if (this.isPaused) {
      await this.resume();
    }

    this.debugRecorder.stop();
    this.editorRecorder.stop();
    await this.audioRecorder.stopRecording();
    this.timer.stop();

    // Todo: Check situation where pause time > recording time
    this.recordingLength = Math.abs(Date.now() - this.recordingStartTime - this.pauseTotalTime);
    this.stopRecordingResolver();

    this.isPaused = false;
    this.updateContext(IS_PAUSED, this.isPaused);

    this.isRecording = false;
    this.updateContext(IS_RECORDING, this.isRecording);
  }

  /**
   * Pause Codio media.
   */
  async pause(): Promise<void> {
    this.pauseStartTime = Date.now();
    this.debugRecorder.stop();
    this.editorRecorder.stop();
    await this.audioRecorder.pause();
    this.timer.stop();

    this.isPaused = true;
    this.updateContext(IS_PAUSED, this.isPaused);
  }

  /**
   * Resume Codio media.
   */
  async resume(): Promise<void> {
    // Keep track of total time paused through out recording
    if (this.pauseStartTime) {
      this.pauseTotalTime += Date.now() - this.pauseStartTime;
      this.pauseStartTime = 0;
    }

    this.timer.start(this.timer.currentSecond * 1000);
    await this.audioRecorder.resume();
    this.editorRecorder.start(this.recordingStartTime);
    this.debugRecorder.start(this.recordingStartTime);

    this.isPaused = false;
    this.updateContext(IS_PAUSED, this.isPaused);
  }

  /**
   * Save recording by getting codio content and constructing objects to save to file.
   * Alert any observers.
   */
  async saveRecording(): Promise<void> {
    try {
      const debugContent = this.debugRecorder.export();
      const editorContent = this.editorRecorder.export();
      const metaDataJsonContent = { length: this.recordingLength, name: this.codioName, version: CODIO_FORMAT_VERSION };
      const metaDataContent = JSON.stringify(metaDataJsonContent);

      await FSManager.saveRecordingToFile(
        debugContent,
        editorContent,
        metaDataContent,
        this.codioPath,
        this.destinationUri,
      );
      this.recordingSavedObservers.forEach((obs) => obs());
    } catch (e) {
      console.log('Saving recording failed', e);
    }
  }
}
