import Player from '../player/Player';

/**
 * Rewind the codio that is in session.
 * @param player Codio player instance.
 * @param timeSecs Time in seconds.
 */
export default function rewind(player: Player, timeSecs?: number): void {
  if (player) {
    typeof timeSecs === 'number' ? player.rewind(timeSecs) : player.rewind(10);
  }
}
