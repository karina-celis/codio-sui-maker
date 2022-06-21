import { UI, MESSAGES } from '../user_interface/messages';
import Player from '../player/Player';

export default function playResume(player: Player): void {
  if (player && player.isPlaying && player.isPaused && player.elapsedTimeMs >= 0) {
    player.play(player.elapsedTimeMs);
  } else {
    UI.showMessage(MESSAGES.alreadyPlaying);
  }
}
