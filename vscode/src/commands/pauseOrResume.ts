import Player from '../player/Player';

export default function pauseOrResume(player: Player): void {
  if (player && player.isPlaying) {
    player.pause();
  } else if (player && !player.isPlaying && player.relativeActiveTimeMs > 0) {
    player.resume();
  }
}
