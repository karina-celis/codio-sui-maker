import Player from '../player/Player';

/**
 * Rewind the codio that is playing.
 * @param player Codio player instance.
 * @param timeSecs Time in seconds.
 */
export function rewind(player: Player, timeSecs?: number): void {
  if (player) {
    typeof timeSecs === 'number' ? player.rewind(timeSecs) : player.rewind(10);
  }
}

/**
 * Forward the codio that is playing.
 * @param player Codio player instance.
 * @param timeSecs Time in seconds.
 */
export function forward(player: Player, timeSecs?: number): void {
  if (player) {
    typeof timeSecs === 'number' ? player.forward(timeSecs) : player.forward(10);
  }
}
