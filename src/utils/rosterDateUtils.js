/**
 * BMRCL Crew Control - Rolling 7-Day Roster Date Utilities
 * Supports day-wise multi-sheet tracking (Today, Tomorrow, Day+2 ... Day+6)
 */

export const MONTH_NAMES_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

export const MONTH_NAMES_FULL = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export const DAY_NAMES_FULL = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'
];

export const DAY_NAMES_SHORT = [
  'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'
];

/**
 * Returns an ISO YYYY-MM-DD string from a Date or date string
 */
export const toDateIsoStr = (d = new Date()) => {
  const date = d instanceof Date ? d : new Date(d);
  if (isNaN(date.getTime())) return new Date().toISOString().split('T')[0];
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Normalizes BMRCL Schedule Type (WEEKDAY, SATURDAY, SUNDAY, MONDAY)
 */
export const getScheduleTypeFromDate = (d = new Date()) => {
  const date = d instanceof Date ? d : new Date(d);
  if (isNaN(date.getTime())) return 'WEEKDAY';
  const dayOfWeek = date.getDay(); // 0 = Sun, 1 = Mon ... 6 = Sat
  if (dayOfWeek === 0) return 'SUNDAY';
  if (dayOfWeek === 6) return 'SATURDAY';
  if (dayOfWeek === 1) return 'MONDAY';
  return 'WEEKDAY';
};

/**
 * Generates an array of next 7 rolling days starting from baseDate (or Today)
 * index 0: Today
 * index 1: Tomorrow
 * index 2: Day +2
 * ... up to index 6 (Day +6)
 */
export const getRolling7Days = (baseDate = new Date()) => {
  const start = baseDate instanceof Date ? new Date(baseDate) : new Date(baseDate || Date.now());
  const validStart = isNaN(start.getTime()) ? new Date() : start;

  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(validStart);
    d.setDate(d.getDate() + i);

    const year = d.getFullYear();
    const monthIdx = d.getMonth();
    const dayOfMonth = d.getDate();
    const dayOfWeekIdx = d.getDay();

    const dateStr = `${year}-${String(monthIdx + 1).padStart(2, '0')}-${String(dayOfMonth).padStart(2, '0')}`;
    const sheetTag = `${dayOfMonth}.${monthIdx + 1}`; // e.g. "20.9", "21.9"
    const paddedSheetTag = `${String(dayOfMonth).padStart(2, '0')}.${String(monthIdx + 1).padStart(2, '0')}`;
    const dayName = DAY_NAMES_FULL[dayOfWeekIdx];
    const shortDay = DAY_NAMES_SHORT[dayOfWeekIdx];
    const monthShort = MONTH_NAMES_SHORT[monthIdx];
    const monthFull = MONTH_NAMES_FULL[monthIdx];

    let badge = `+${i}D`;
    let relativeLabel = `Day +${i}`;
    if (i === 0) {
      badge = 'TODAY';
      relativeLabel = 'Today';
    } else if (i === 1) {
      badge = 'TOMORROW';
      relativeLabel = 'Tomorrow';
    } else if (i === 2) {
      relativeLabel = 'Day After Tomorrow';
    }

    days.push({
      offset: i,
      isToday: i === 0,
      isTomorrow: i === 1,
      date: d,
      dateStr,
      sheetTag,
      paddedSheetTag,
      dayOfMonth,
      dayName,
      shortDay,
      monthShort,
      monthFull,
      year,
      badge,
      relativeLabel,
      scheduleType: getScheduleTypeFromDate(d),
      // e.g. "21 September 2026 Monday"
      fullOfficialTitle: `${dayOfMonth} ${monthFull} ${year} ${dayName}`,
      // e.g. "Tomorrow • 21 Sep (Mon)"
      displayLabel: `${relativeLabel} • ${dayOfMonth} ${monthShort} (${shortDay})`,
      chipLabel: i === 0 ? `Today (${sheetTag})` : i === 1 ? `Tomorrow (${sheetTag})` : `${shortDay} (${sheetTag})`
    });
  }

  return days;
};

/**
 * Extracts date info from free text or header cell
 * e.g. "21 September 2026 Monday", "21.9", "20.9", "21-09-2026", "21 Sep"
 */
export const parseRosterDateText = (text, fallbackYear = 2026) => {
  if (!text) return null;
  const str = String(text).trim();

  // Pattern A: "21 September 2026 Monday" or "21 Sep 2026"
  const textDateMatch = str.match(/(\d{1,2})\s+([A-Za-z]+)(?:\s+(\d{4}))?(?:\s+([A-Za-z]+))?/);
  if (textDateMatch) {
    const day = parseInt(textDateMatch[1], 10);
    const monthStr = textDateMatch[2].toLowerCase();
    const year = textDateMatch[3] ? parseInt(textDateMatch[3], 10) : fallbackYear;
    
    let monthIdx = -1;
    MONTH_NAMES_SHORT.forEach((m, idx) => {
      if (monthStr.startsWith(m.toLowerCase())) monthIdx = idx;
    });
    if (monthIdx === -1) {
      MONTH_NAMES_FULL.forEach((m, idx) => {
        if (monthStr.startsWith(m.toLowerCase())) monthIdx = idx;
      });
    }

    if (monthIdx !== -1 && day >= 1 && day <= 31) {
      const d = new Date(year, monthIdx, day);
      return {
        dateStr: toDateIsoStr(d),
        sheetTag: `${day}.${monthIdx + 1}`,
        dayName: DAY_NAMES_FULL[d.getDay()],
        scheduleType: getScheduleTypeFromDate(d),
        fullOfficialTitle: `${day} ${MONTH_NAMES_FULL[monthIdx]} ${year} ${DAY_NAMES_FULL[d.getDay()]}`
      };
    }
  }

  // Pattern B: "21.9" or "21.09" or "21-9" or "21/9"
  const dotDateMatch = str.match(/^(\d{1,2})[.\-\/](\d{1,2})(?:[.\-\/](\d{2,4}))?$/);
  if (dotDateMatch) {
    const day = parseInt(dotDateMatch[1], 10);
    const month = parseInt(dotDateMatch[2], 10);
    let year = dotDateMatch[3] ? parseInt(dotDateMatch[3], 10) : fallbackYear;
    if (year < 100) year += 2000;

    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const d = new Date(year, month - 1, day);
      return {
        dateStr: toDateIsoStr(d),
        sheetTag: `${day}.${month}`,
        dayName: DAY_NAMES_FULL[d.getDay()],
        scheduleType: getScheduleTypeFromDate(d),
        fullOfficialTitle: `${day} ${MONTH_NAMES_FULL[month - 1]} ${year} ${DAY_NAMES_FULL[d.getDay()]}`
      };
    }
  }

  return null;
};
