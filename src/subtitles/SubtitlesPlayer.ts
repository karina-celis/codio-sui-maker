import * as vscode from 'vscode';
import * as parser from 'subtitles-parser-vtt';
import { readFileSync } from 'fs';

/**
 * Cue object properties.
 */
interface Cue {
  id: number;
  startTime: number;
  endTime: number;
  text: string;
}

/**
 * Class handles loading and manipulation of the subtitles.
 */
export default class SubtitlesPlayer implements IMedia, IImport {
  private oc: vscode.OutputChannel;
  private timerRef: NodeJS.Timer;
  private cues: Cue[] = [];
  private startMS: number;

  /**
   * Create Output Channel.
   */
  constructor() {
    this.oc = vscode.window.createOutputChannel('Codio Subtitles');
  }

  /**
   * Import given subtitles file and create dictionary.
   * @param filePath Subtitles file to import.
   */
  import(filePath: string): void {
    try {
      const content = readFileSync(filePath);
      this.cues = parser.fromSrt(content.toString(), 'ms');
      if (!this.cues.length) {
        throw new Error('No subtitles found.');
      }

      this.display('Codio Subtitles Imported');
    } catch (error) {
      console.warn('Subtitles Import', error.message);
      this.destroy();
    }
  }

  /**
   * Release memory and guard against future errors.
   */
  private destroy(): void {
    this.start = () => {
      // Intentionally left blank.
    };
    this.goto = () => -1;
    this.oc.dispose();
    this.oc = null;
  }

  /**
   * Display given string on the output channel.
   * @param str String to display.
   */
  private display(str: string) {
    this.oc.show(true);
    this.oc.appendLine(str);
  }

  /**
   * Format given cue into a string.
   * @param cue Cue to format into a string.
   * @returns Formatted string to display.
   */
  private getCueStr(cue: Cue): string {
    return parser.msToSrt(cue.startTime) + '\t' + cue.text;
  }

  /**
   * Start subtitles from given milliseconds.
   * @param timeMs Time in milliseconds into subtitles to start.
   */
  start(timeMs: number): void {
    const cueIndex = this.goto(timeMs);
    if (cueIndex === -1) {
      return;
    }

    this.startMS = Date.now() - timeMs;
    const cue = this.cues[cueIndex];
    this.showCue(cue, cue.startTime - timeMs);
  }

  /**
   * Show given cue at given delay.
   * @param cue The current cue to show.
   * @param delay Time in milliseconds to delay showing given cue.
   */
  private showCue(cue: Cue, delay: number): void {
    if (!cue || isNaN(delay)) {
      return;
    }

    this.timerRef = setTimeout(() => {
      this.display(this.getCueStr(cue));

      cue = this.cues[cue.id]; // id points to the next cue in array because id starts from 1.
      const elapsed = Date.now() - this.startMS;
      const delay = cue?.startTime - elapsed; // optional because we could have processed the last cue.

      if (!this.timerRef) {
        return;
      }

      this.showCue(cue, delay);
    }, delay);
  }

  /**
   * Stop subtitles display.
   */
  stop(): void {
    clearTimeout(this.timerRef);
    this.timerRef = null;
  }

  /**
   * Make media go to given time and update state.
   * @param timeMs Time in milliseconds to go to.
   */
  goto(timeMs: number): number {
    this.stop();

    this.oc.clear();

    const cueIndex = this.cues.findIndex((cue) => {
      return cue.startTime >= timeMs;
    });
    if (cueIndex === -1) {
      return cueIndex;
    }

    // Build previous cues to display.
    let cueOutput = 'Codio Subtitles Starting...\n';
    const prevCues = this.cues.slice(0, cueIndex);
    prevCues.forEach((cue) => {
      cueOutput += this.getCueStr(cue) + '\n';
    });
    cueOutput = cueOutput.slice(0, cueOutput.length - 1); // remove last newline
    this.display(cueOutput);

    return cueIndex;
  }
}
