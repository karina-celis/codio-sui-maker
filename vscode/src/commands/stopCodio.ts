import Player from '../player/Player';

export default function stopCodio(player: Player): void {
  if (player && player.isPlaying) {
    player.stop();
  }
}
