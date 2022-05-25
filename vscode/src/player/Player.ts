import EditorPlayer from './Editor';
import Timer from '../ProgressTimer';
import FSManager from '../filesystem/FSManager';
import { commands, Disposable, TextEditorSelectionChangeEvent, TextEditorSelectionChangeKind, window } from 'vscode';
import AudioHandler from '../audio/Audio';
import Subtitles from './Subtitles';
import Environment from '../environment/Environment';
import DebugPlayer from '../debug/DebugPlayer';
import { CODIO_FORMAT_VERSION } from '../recorder/Recorder';

const IS_PLAYING = 'isPlaying';
const IS_PAUSED = 'isPlayerPaused';

export default class Player {
  isPaused = false;
  isPlaying = false;
  codioPath: string;
  codioName: string;
  stateObservers: Array<(isPlaying: boolean, isPaused: boolean) => void>;

  codioLength: number;
  codioStartTimeMs: number;
  elapsedTimeMs = 0;

  editorPlayer: EditorPlayer;
  debugPlayer: DebugPlayer;
  audioPlayer: AudioHandler;
  subtitlesPlayer: Subtitles;
  timer: Timer;

  closeCodioResolver: (value?: unknown) => void;
  process: Promise<unknown>;
  onPauseHandler: Disposable;

  /**
   * Create all media needed for the codio.
   * @param codioPath Path where codio was unzipped to access files.
   * @param workspaceToPlayOn Path of the current workspace.
   */
  async loadCodio(codioPath: string, workspaceToPlayOn?: string): Promise<void> {
    console.log('loadCodio codioPath', codioPath);
    console.log('loadCodio workspaceToPlayOn', workspaceToPlayOn);
    try {
      this.setInitialState();
      this.codioPath = codioPath;
      const metaData = FSManager.getMetaData(codioPath);
      if (metaData.version !== CODIO_FORMAT_VERSION) {
        throw Error(`Verison Mismatch: ${metaData.version} !== ${CODIO_FORMAT_VERSION}`);
      }

      console.log('loadCodio metaData', metaData);
      this.codioName = metaData.name;
      this.codioLength = metaData.length;

      this.editorPlayer = new EditorPlayer(workspaceToPlayOn);
      this.editorPlayer.import(FSManager.editorPath(codioPath));

      this.debugPlayer = new DebugPlayer();
      this.debugPlayer.import(FSManager.debugPath(this.codioPath));

      this.audioPlayer = new AudioHandler(FSManager.audioPath(this.codioPath), Environment.getInstance());

      this.subtitlesPlayer = new Subtitles();
      const loaded = await this.subtitlesPlayer.load(FSManager.subtitlesPath(this.codioPath));
      if (!loaded) {
        this.subtitlesPlayer.destroy();
      }

      this.timer = new Timer(this.codioLength);
      this.timer.onFinish(() => {
        this.stop();
        FSManager.update();
      });

      this.process = new Promise((resolve) => (this.closeCodioResolver = resolve));
    } catch (e) {
      console.log('loadCodio failed', e);
    }
  }

  private setInitialState(): void {
    this.elapsedTimeMs = 0;
    this.codioStartTimeMs = undefined;
    this.codioLength = undefined;
    this.closeCodioResolver = undefined;
    this.process = undefined;
    this.stateObservers = [];
  }

  /**
   * Update given context to given value and update observers.
   * @param context String representing context to update.
   * @param value Value to set given context string to.
   */
  private updateContext(context: string, value: unknown): void {
    commands.executeCommand('setContext', context, value);
    this.stateObservers.forEach((obs) => {
      obs(this.isPlaying, this.isPaused);
    });
  }

  /**
   * Play media from given time in seconds.
   * @param timeMs Milliseconds to start playing media from.
   */
  play(timeMs: number): void {
    if (this.isPlaying) {
      this.pauseMedia();
    }

    this.isPaused = false;
    this.updateContext(IS_PAUSED, this.isPaused);

    console.log('play', timeMs);

    this.codioStartTimeMs = Date.now(); // The editor adjusts events' time.
    this.editorPlayer.start(timeMs);
    this.debugPlayer.start(timeMs);
    this.subtitlesPlayer.play(timeMs);
    this.audioPlayer.play(timeMs / 1000);
    this.timer.run(timeMs / 1000);

    this.isPlaying = true;
    this.updateContext(IS_PLAYING, this.isPlaying);

    this.listenToInteractions();
  }

  /**
   * Listen to mouse or keyboard interactions.
   */
  private listenToInteractions(): void {
    this.onPauseHandler = window.onDidChangeTextEditorSelection((e: TextEditorSelectionChangeEvent) => {
      if (e.kind && e.kind !== TextEditorSelectionChangeKind.Command) {
        this.onPauseHandler.dispose();
        this.pause();
      }
    });
  }

  /**
   * Stop the currently playing codio.
   */
  stop(): void {
    this.isPlaying = false;
    this.updateContext(IS_PLAYING, this.isPlaying);
    this.closeCodio();
  }

  /**
   * Pause all media types: Editor, Audio, Subtitles, and Timer.
   */
  private pauseMedia(): void {
    this.editorPlayer.stop();
    this.debugPlayer.stop();
    this.audioPlayer.pause();
    this.subtitlesPlayer.pause();
    this.timer.stop();
    this.onPauseHandler?.dispose();
  }

  /**
   * Pause media, update relative active time, and update state.
   */
  pause(): void {
    this.pauseMedia();
    // How long has the codio been playing?
    this.elapsedTimeMs = this.elapsedTimeMs + (Date.now() - this.codioStartTimeMs);
    this.isPaused = true;
    this.updateContext(IS_PAUSED, this.isPaused);
  }

  /**
   * Resume playing of loaded codio.
   */
  resume(): void {
    this.play(this.elapsedTimeMs);
  }

  /**
   * Stop all media.
   * @todo Add stop method to audioPlayer.
   */
  private closeCodio(): void {
    this.timer.stop();
    this.editorPlayer.stop();
    this.debugPlayer.stop();
    this.audioPlayer.pause();
    this.subtitlesPlayer.stop();
    this.closeCodioResolver();
    this.onPauseHandler?.dispose();
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
  onStateUpdate(observer: (isPlaying: boolean, isPaused: boolean) => void): void {
    this.stateObservers.push(observer);
  }

  /**
   * Rewind codio that is playing.
   * @param timeSecs Time in seconds.
   */
  rewind(timeSecs: number): void {
    // Get relative time since play started if not paused.
    if (!this.isPaused) {
      this.elapsedTimeMs = this.elapsedTimeMs + (Date.now() - this.codioStartTimeMs);
    }

    // Get time from when/if the codio was paused.
    let timeToRewind = this.elapsedTimeMs - timeSecs * 1000;
    if (timeToRewind < 0) {
      timeToRewind = 0;
    }
    this.goto(timeToRewind);
  }

  /**
   * Forward codio that is playing.
   * @param timeSecs Time in seconds.
   */
  forward(timeSecs: number): void {
    // Get relative time since play started if not paused.
    if (!this.isPaused) {
      this.elapsedTimeMs = this.elapsedTimeMs + (Date.now() - this.codioStartTimeMs);
    }

    // Get time from when/if the codio was paused.
    let timeToForward = this.elapsedTimeMs + timeSecs * 1000;
    if (timeToForward > this.codioLength) {
      timeToForward = this.codioLength;
    }
    this.goto(timeToForward);
  }

  /**
   * Move current loaded codio to given time.
   * @param relativeTimeMs Time in milliseconds.
   */
  goto(relativeTimeMs: number): void {
    console.log('goto', relativeTimeMs);
    this.elapsedTimeMs = relativeTimeMs;
    if (!this.isPaused) {
      this.pauseMedia();
      this.resume();
    }
    // TODO: Add goto methods to media.
  }
}
