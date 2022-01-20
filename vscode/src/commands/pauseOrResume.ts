import Player from '../player/Player';

export default function pauseOrResume(player: Player): void {
  if (player && player.isPlaying && !player.isPaused) {
    player.pause();
  } else if (player && player.isPaused && player.relativeActiveTimeMs > 0) {
    player.resume();
  }
}
