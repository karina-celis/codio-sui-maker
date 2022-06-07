import { UI, MODAL_MESSAGE_OBJS } from '../user_interface/messages';
import Player from '../player/Player';

export default function playPause(player: Player): void {
  if (player && player.isPlaying && !player.isPaused) {
    player.pause();
  } else {
    UI.showModalMessage(MODAL_MESSAGE_OBJS.noActiveCodio);
  }
}
