import Player from '../player/Player';
import { showPlayFromInputBox, UI, MODAL_MESSAGE_OBJS } from '../user_interface/messages';

/**
 * Make given player go to given time in milliseconds.
 * @param player Player to activate.
 * @param time Given milliseconds time to go into codio.
 */
export default async function goto(player: Player, time?: number): Promise<void> {
  // Ask for a time if none given.
  if (!time) {
    let timeInSeconds = parseInt(await showPlayFromInputBox(player));

    // Validate input
    if (isNaN(timeInSeconds)) {
      UI.showModalMessage(MODAL_MESSAGE_OBJS.noStartTime);
      return;
    } else if (timeInSeconds < 0) {
      timeInSeconds = 0;
    } else if (timeInSeconds > player.codioLength / 1000) {
      timeInSeconds = player.codioLength / 1000;
    }

    time = timeInSeconds * 1000;
  }

  player.goto(time);
  UI.showPlayerStatusBar(player);
}
