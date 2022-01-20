import { UI, MODAL_MESSAGE_OBJS } from '../user_interface/messages';
import Player from '../player/Player';
import FSManager from '../filesystem/FSManager';

export default function pauseCodio(player: Player): void {
  if (player && player.isPlaying) {
    player.pause();
    FSManager.update();
  } else {
    UI.showModalMessage(MODAL_MESSAGE_OBJS.noActiveCodio);
  }
}
