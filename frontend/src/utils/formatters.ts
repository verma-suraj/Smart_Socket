/**
 * Pure formatting utility functions for the Smart Socket Dashboard.
 */

/**
 * Truncate display name to at most 33 characters (30 + "...").
 * If input is 30 chars or fewer, returns unchanged.
 */
export function truncateDisplayName(name: string): string {
  if (name.length > 30) {
    return name.slice(0, 30) + '...';
  }
  return name;
}

/**
 * Format a telemetry value to the appropriate decimal precision based on field name.
 * - voltage: 1 decimal place
 * - current: 2 decimal places
 * - power: 1 decimal place
 * - frequency: 1 decimal place
 * - powerFactor: 2 decimal places
 * - temperature: 1 decimal place
 */
export function formatTelemetryValue(field: string, value: number): string {
  switch (field) {
    case 'voltage':
    case 'power':
    case 'frequency':
    case 'temperature':
      return value.toFixed(1);
    case 'current':
    case 'powerFactor':
      return value.toFixed(2);
    default:
      return value.toString();
  }
}

/**
 * Format a Unix timestamp (milliseconds) to "YYYY-MM-DD HH:MM:SS" in local timezone.
 */
export function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

/**
 * Format a non-negative integer of seconds into "HH:MM:SS" format.
 */
export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * Truncate an error message to at most 200 characters.
 * If input is 200 chars or fewer, returns unchanged.
 */
export function truncateErrorMessage(message: string): string {
  if (message.length > 200) {
    return message.slice(0, 200);
  }
  return message;
}
