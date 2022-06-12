/**
 * Keep track of time passed and alert any observers.
 */
export default class ProgressTimer implements IMedia {
  private totalMs: number;
  private timer: NodeJS.Timer;
  currentSecond: number;

  private onUpdateObservers: Array<(currentSecond: number, totalSeconds: number) => void> = [];
  private onFinishObservers: Array<() => void> = [];

  constructor(totalMs: number) {
    this.totalMs = totalMs;
  }

  setInitialState(): void {
    this.onUpdateObservers = [];
    this.onFinishObservers = [];
  }

  /**
   * Add given observer to be notified when timer finished.
   * @param observer Function to be executed when timer finishes.
   */
  onFinish(observer: () => void): void {
    this.onFinishObservers.push(observer);
  }

  /**
   * Add given obeserver to be notified on timer updates.
   * @param observer Function to be executed receiving current second and total seconds if applicable.
   */
  onUpdate(observer: (currentSecond: number, totalSeconds: number) => void): void {
    this.onUpdateObservers.push(observer);
  }

  stop(): void {
    clearInterval(this.timer);
    this.timer = null;
  }

  /**
   * Run timer and alert observers on update and on finish.
   * @param timeMs Time in milliseconds to set current second to.
   */
  start(timeMs: number): void {
    try {
      if (this.timer) {
        this.stop();
      }

      this.currentSecond = timeMs / 1000;
      this.timer = setInterval(() => {
        this.currentSecond++;

        const totalSeconds = this.totalMs / 1000;
        if (this.totalMs && this.currentSecond > totalSeconds) {
          this.onUpdateObservers.forEach((observer) => observer(totalSeconds, totalSeconds));
          this.onFinishObservers.forEach((observer) => observer());
          this.stop();
        } else {
          this.onUpdateObservers.forEach((observer) => observer(this.currentSecond, totalSeconds));
        }
      }, 1000);
    } catch (e) {
      console.log('report progress error,', e);
    }
  }

  /**
   * Make media go to given time and update state.
   * @param timeMs Time in milliseconds to go to.
   */
  goto(timeMs: number): void {
    this.currentSecond = timeMs / 1000;
    this.onUpdateObservers.forEach((observer) => observer(this.currentSecond, this.totalMs / 1000));
  }
}
