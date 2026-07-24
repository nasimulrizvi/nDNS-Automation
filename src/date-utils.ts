// Utilities for formatting time and date explicitly in UTC+06:00 timezone

export function formatTimeUtcPlus6(dateInput?: string | number | Date): string {
  if (!dateInput) return '';
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return '';
  const utc6 = new Date(date.getTime() + 6 * 60 * 60 * 1000);
  const pad = (n: number) => n.toString().padStart(2, '0');
  const hh = pad(utc6.getUTCHours());
  const min = pad(utc6.getUTCMinutes());
  const ss = pad(utc6.getUTCSeconds());
  return `${hh}:${min}:${ss}`;
}

export function formatDateTimeUtcPlus6(dateInput?: string | number | Date): string {
  if (!dateInput) return '';
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return '';
  const utc6 = new Date(date.getTime() + 6 * 60 * 60 * 1000);
  const pad = (n: number) => n.toString().padStart(2, '0');
  const yyyy = utc6.getUTCFullYear();
  const mm = pad(utc6.getUTCMonth() + 1);
  const dd = pad(utc6.getUTCDate());
  const hh = pad(utc6.getUTCHours());
  const min = pad(utc6.getUTCMinutes());
  const ss = pad(utc6.getUTCSeconds());
  return `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`;
}
