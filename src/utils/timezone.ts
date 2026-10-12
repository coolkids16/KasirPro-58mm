/**
 * Utility functions for timezone handling and localized date-time formatting
 * Supports Indonesia timezones: WIB (Asia/Jakarta), WITA (Asia/Makassar), WIT (Asia/Jayapura)
 */

export const DEFAULT_TIMEZONE = 'Asia/Jakarta';

export interface TimezoneOption {
  value: string;
  label: string;
  shortLabel: string; // WIB, WITA, WIT
  offset: string;
  description: string;
}

export const TIMEZONE_OPTIONS: TimezoneOption[] = [
  {
    value: 'Asia/Jakarta',
    label: 'WIB - Waktu Indonesia Barat',
    shortLabel: 'WIB',
    offset: 'UTC+7',
    description: 'Jakarta, Jawa, Sumatra, Kalimantan Barat & Tengah'
  },
  {
    value: 'Asia/Makassar',
    label: 'WITA - Waktu Indonesia Tengah',
    shortLabel: 'WITA',
    offset: 'UTC+8',
    description: 'Makassar, Sulawesi, Bali, NTB, NTT, Kalimantan Selatan & Timur'
  },
  {
    value: 'Asia/Jayapura',
    label: 'WIT - Waktu Indonesia Timur',
    shortLabel: 'WIT',
    offset: 'UTC+9',
    description: 'Jayapura, Papua, Maluku, Maluku Utara'
  }
];

/**
 * Get short abbreviation (WIB / WITA / WIT) for a timezone string.
 */
export const getTimezoneAbbr = (timeZone: string = DEFAULT_TIMEZONE): string => {
  const match = TIMEZONE_OPTIONS.find(tz => tz.value === timeZone);
  return match ? match.shortLabel : 'WIB';
};

/**
 * Get full option metadata for a timezone string.
 */
export const getTimezoneOption = (timeZone: string = DEFAULT_TIMEZONE): TimezoneOption => {
  const match = TIMEZONE_OPTIONS.find(tz => tz.value === timeZone);
  return match || TIMEZONE_OPTIONS[0];
};

/**
 * Format timestamp into short date & time for table rows.
 * Example: "12 Okt, 14:30 WIB"
 */
export const formatTransactionTableDateTime = (
  timestamp: number | string | Date,
  timeZone: string = DEFAULT_TIMEZONE
): string => {
  if (!timestamp) return '-';
  const dateObj = new Date(timestamp);
  if (isNaN(dateObj.getTime())) return '-';

  try {
    const tz = timeZone || DEFAULT_TIMEZONE;
    const formatter = new Intl.DateTimeFormat('id-ID', {
      timeZone: tz,
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
    const abbr = getTimezoneAbbr(tz);
    return `${formatter.format(dateObj)} ${abbr}`;
  } catch (err) {
    console.warn('Error formatting table date with timezone:', err);
    return new Date(timestamp).toLocaleString('id-ID');
  }
};

/**
 * Format timestamp into full date & time with seconds for detail cards.
 * Example: "12 Oktober 2026 14:30:15 WIB"
 */
export const formatTransactionDetailDateTime = (
  timestamp: number | string | Date,
  timeZone: string = DEFAULT_TIMEZONE
): string => {
  if (!timestamp) return '-';
  const dateObj = new Date(timestamp);
  if (isNaN(dateObj.getTime())) return '-';

  try {
    const tz = timeZone || DEFAULT_TIMEZONE;
    const formatter = new Intl.DateTimeFormat('id-ID', {
      timeZone: tz,
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
    const abbr = getTimezoneAbbr(tz);
    return `${formatter.format(dateObj)} ${abbr}`;
  } catch (err) {
    console.warn('Error formatting detail date with timezone:', err);
    return new Date(timestamp).toLocaleString('id-ID');
  }
};

/**
 * Format receipt date and time parts for 58mm thermal printer.
 * Output: { dateStr: '12/10/26', timeStr: '14:30 WIB' }
 */
export const formatReceiptDateTime = (
  timestamp: number | string | Date,
  timeZone: string = DEFAULT_TIMEZONE
): { dateStr: string; timeStr: string } => {
  if (!timestamp) return { dateStr: '', timeStr: '' };
  const dateObj = new Date(timestamp);
  if (isNaN(dateObj.getTime())) return { dateStr: '', timeStr: '' };

  try {
    const tz = timeZone || DEFAULT_TIMEZONE;
    const dateFormatter = new Intl.DateTimeFormat('id-ID', {
      timeZone: tz,
      day: '2-digit',
      month: '2-digit',
      year: '2-digit'
    });
    const timeFormatter = new Intl.DateTimeFormat('id-ID', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
    return {
      dateStr: dateFormatter.format(dateObj),
      timeStr: `${timeFormatter.format(dateObj)} ${getTimezoneAbbr(tz)}`
    };
  } catch (err) {
    return {
      dateStr: dateObj.toLocaleDateString('id-ID'),
      timeStr: dateObj.toLocaleTimeString('id-ID')
    };
  }
};

/**
 * Extract Year, Month (0-indexed 0-11), and Day (1-31) in target timezone.
 * Used for accurate calendar day aggregation regardless of device local clock.
 */
export const getTimezoneDateParts = (
  timestamp: number | string | Date,
  timeZone: string = DEFAULT_TIMEZONE
): { year: number; month: number; day: number } => {
  const dateObj = new Date(timestamp);
  try {
    const tz = timeZone || DEFAULT_TIMEZONE;
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric'
    });
    const parts = formatter.formatToParts(dateObj);
    let year = dateObj.getFullYear();
    let month = dateObj.getMonth();
    let day = dateObj.getDate();

    for (const part of parts) {
      if (part.type === 'year') year = parseInt(part.value, 10);
      if (part.type === 'month') month = parseInt(part.value, 10) - 1; // 0-indexed
      if (part.type === 'day') day = parseInt(part.value, 10);
    }
    return { year, month, day };
  } catch (err) {
    return {
      year: dateObj.getFullYear(),
      month: dateObj.getMonth(),
      day: dateObj.getDate()
    };
  }
};

/**
 * Returns a live preview string for current time in the selected timezone.
 * Example: "Senin, 12 Okt 2026 14:30:15 WIB"
 */
export const getCurrentTimePreview = (timeZone: string = DEFAULT_TIMEZONE): string => {
  try {
    const tz = timeZone || DEFAULT_TIMEZONE;
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('id-ID', {
      timeZone: tz,
      weekday: 'long',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
    const abbr = getTimezoneAbbr(tz);
    return `${formatter.format(now)} ${abbr}`;
  } catch (err) {
    return new Date().toLocaleString('id-ID');
  }
};
