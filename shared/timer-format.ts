/**
 * The one clock every timer, countdown and duration in the game shows.
 *
 * A minute or more reads HH:MM ("02:05" for 2 h 5 min, "00:12" for 12 min 30 s,
 * "100:00" for 100 h): whole minutes, rounded down, so the switch to the
 * seconds form happens exactly when less than a minute is left. Under a minute
 * it reads MM:SS ("00:45", "00:05", "00:00"). Negative and non-finite values
 * read "00:00".
 */
export function formatTimer(seconds: number) {
  const total = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  if (total < 60) return `00:${pad(total)}`;
  return `${pad(Math.floor(total / 3_600))}:${pad(Math.floor(total % 3_600 / 60))}`;
}

/**
 * formatTimer for a countdown in milliseconds. Partial seconds round up, so a
 * countdown never reads "00:00" while time is still left.
 */
export function formatTimerMs(milliseconds: number) {
  return formatTimer(Math.ceil(milliseconds / 1_000));
}

const pad = (value: number) => String(value).padStart(2, "0");
