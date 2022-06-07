import Recorder from '../recorder/Recorder';
import Player from '../player/Player';
import { Commands } from '../commands';

/**
 * Get player UI to display.
 * @param player Player instance.
 * @returns A table UI to display name and controls.
 */
export function playerUI(player: Player): string {
  const title = getHeader(player.codioName);
  let primary;
  if (player.isPaused) {
    primary = `# [$(debug-reverse-continue)](command:${Commands.PLAY_REWIND}) [$(debug-start)](command:${Commands.PLAY_RESUME}) [$(debug-continue)](command:${Commands.PLAY_FORWARD})`;
  } else {
    primary = `# [$(debug-reverse-continue)](command:${Commands.PLAY_REWIND}) [$(debug-pause)](command:${Commands.PLAY_PAUSE}) [$(debug-continue)](command:${Commands.PLAY_FORWARD})`;
  }
  const secondary = `# [$(debug-stop)](command:${Commands.PLAY_STOP})`;
  return tableTmpl(title, primary, secondary);
}

/**
 * Get recorder UI to display.
 * @param recorder Recorder instance.
 * @returns A table UI to display name and controls.
 */
export function recorderUI(recorder: Recorder): string {
  const title = getHeader(recorder.codioName);
  let primary;
  if (recorder.isPaused) {
    primary = `# [$(save)](command:${Commands.RECORD_SAVE}) [$(record)](command:${Commands.RECORD_RESUME})`;
  } else {
    primary = `# [$(save)](command:${Commands.RECORD_SAVE}) [$(debug-pause)](command:${Commands.RECORD_PAUSE})`;
  }
  const secondary = `# [$(close)](command:${Commands.RECORD_CANCEL})`;
  return tableTmpl(title, primary, secondary);
}

/**
 * Get appropriate header display for given text.
 * @param text Text to dispaly as a header.
 * @returns Header Markdown string if given text.
 */
function getHeader(text: string): string {
  if (text.length < 7) {
    return `# ${text}`;
  } else if (text.length < 10) {
    return `### ${text}`;
  } else {
    return `##### ${text}`;
  }
}

/**
 * Construct a table UI from given arguments.
 * @param title Name to display as a header.
 * @param primaryControls Primary controls to display.
 * @param secondaryControls Secondary controls to display.
 * @returns
 */
function tableTmpl(title: string, primaryControls: string, secondaryControls: string): string {
  return `
<table>
<thead>
<tr><th align="center">

${title}

</th></tr>
</thead>
<tbody>
<tr>
<td align="center">

${primaryControls}

</td>
</tr>
<tr>
<td align="center">

${secondaryControls}

</td>
</tr>
</tbody>
</table>
  `;
}
