import Player from '../player/Player';

export default function playStop(player: Player): void {
  if (player && player.isPlaying) {
    player.stop();
  }
}
