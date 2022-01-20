import { UI, MESSAGES } from '../user_interface/messages';
import Player from '../player/Player';
import FSManager from '../filesystem/FSManager';

export default function resumeCodio(player: Player): void {
  if (player && !player.isPlaying && player.relativeActiveTimeMs >= 0) {
    player.resume();
    FSManager.update();
  } else {
    UI.showMessage(MESSAGES.alreadyPlaying);
  }
}
