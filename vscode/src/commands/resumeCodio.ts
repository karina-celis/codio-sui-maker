import { UI, MESSAGES } from '../user_interface/messages';
import Player from '../player/Player';

export default function resumeCodio(player: Player): void {
  if (player && player.isPlaying && player.isPaused && player.elapsedTimeMs >= 0) {
    player.resume();
  } else {
    UI.showMessage(MESSAGES.alreadyPlaying);
  }
}
