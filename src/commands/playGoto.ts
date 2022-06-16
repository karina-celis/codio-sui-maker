import Player from '../player/Player';
import { showGotoInputBox, UI, MODAL_MESSAGE_OBJS } from '../user_interface/messages';

/**
 * Make given player go to given time in milliseconds.
 * @param player Player to activate.
 * @param timeMs Time in milliseconds to go into codio.
 */
export default async function playGoto(player: Player, timeMs?: number): Promise<void> {
  // Ask for a time if none given.
  if (!timeMs) {
    let timeInSeconds = parseInt(await showGotoInputBox(player));

    // Validate input
    if (isNaN(timeInSeconds)) {
      UI.showModalMessage(MODAL_MESSAGE_OBJS.noStartTime);
      return;
    } else if (timeInSeconds < 0) {
      timeInSeconds = 0;
    } else if (timeInSeconds > player.totalMs / 1000) {
      timeInSeconds = player.totalMs / 1000;
    }

    timeMs = timeInSeconds * 1000;
  }

  player.goto(timeMs);
}
