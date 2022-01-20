import FSManager from '../filesystem/FSManager';
import Player from '../player/Player';

export default function stopCodio(player: Player): void {
  if (player && player.isPlaying) {
    player.stop();
    FSManager.update();
  }
}
