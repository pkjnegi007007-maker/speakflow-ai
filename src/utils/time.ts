/**
 * Formats a duration in seconds into MM:SS format
 * @param seconds Duration in seconds
 */
export function formatTime(seconds: number): string {
  const mins = Math.max(0, Math.floor(seconds / 60));
  const secs = Math.max(0, seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}
