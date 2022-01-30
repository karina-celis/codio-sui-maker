import Player from '../player/Player';

/**
 * Forward the codio that is in session.
 * @param player Codio player instance.
 * @param timeSecs Time in seconds.
 */
export default function forward(player: Player, timeSecs?: number): void {
  if (player) {
    typeof timeSecs === 'number' ? player.forward(timeSecs) : player.forward(10);
  }
}
