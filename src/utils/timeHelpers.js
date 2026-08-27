// Centralized time math and timezone calculations for PYIDCC (Asia/Kolkata IST)

export const TIMEZONE_IST = 'Asia/Kolkata';

/**
 * Converts any 12-hour, AM/PM, or ambiguous time string to strict 24-hour "HH:MM" format.
 * Automatically handles BMRCL shift patterns (Morning, Afternoon/Evening, Night).
 */
export const formatTo24HourTime = (timeStr, sOnTime = null, shift = null) => {
  if (!timeStr || timeStr === '--' || timeStr === '—' || timeStr === '-') return timeStr || '—';
  
  let str = String(timeStr).trim().toUpperCase();

  // Strip seconds if in "HH:MM:SS" format
  if (/^\d{1,2}:\d{2}:\d{2}$/.test(str)) {
    str = str.substring(0, 5);
  }
  
  // Handle explicit AM / PM strings (e.g. "2:14 PM", "02:14 PM")
  if (str.includes('PM')) {
    const clean = str.replace('PM', '').trim();
    const [h, m] = clean.split(':');
    const hour = parseInt(h, 10);
    const min = m || '00';
    const h24 = hour === 12 ? 12 : hour + 12;
    return `${String(h24).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
  }
  if (str.includes('AM')) {
    const clean = str.replace('AM', '').trim();
    const [h, m] = clean.split(':');
    const hour = parseInt(h, 10);
    const min = m || '00';
    const h24 = hour === 12 ? 0 : hour;
    return `${String(h24).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
  }

  const parts = str.split(':');
  let h = parseInt(parts[0], 10);
  const m = parts[1] ? String(parts[1]).padStart(2, '0') : '00';
  if (isNaN(h)) return str;

  // If already in 24h format (>= 13), return standard zero-padded
  if (h >= 13) {
    return `${String(h).padStart(2, '0')}:${m}`;
  }

  const onHour = sOnTime ? parseInt(String(sOnTime).split(':')[0], 10) : null;
  const shiftUpper = shift ? String(shift).toUpperCase() : '';

  // A Shift (Morning 05:00 - 12:00) -> Sign off in afternoon (12:00 - 17:00)
  if (shiftUpper === 'A' || shiftUpper === 'PRO' || shiftUpper === 'STBY' || (onHour !== null && onHour >= 5 && onHour < 12)) {
    if (h >= 1 && h <= 5) {
      h += 12; // 02:14 -> 14:14, 01:44 -> 13:44, 02:13 -> 14:13
    } else if (h === 0) {
      h = 12; // 00:34 -> 12:34
    }
    return `${String(h).padStart(2, '0')}:${m}`;
  }

  // B Shift (Afternoon 12:00 - 17:00) -> Sign off in evening/night (20:00 - 23:59)
  if (shiftUpper === 'B' || (onHour !== null && onHour >= 12 && onHour < 18)) {
    if (h >= 7 && h <= 11) {
      h += 12; // 08:30 -> 20:30, 09:30 -> 21:30, 10:00 -> 22:00
    } else if (h >= 1 && h <= 3) {
      h += 20; // 02:10 -> 22:10, 01:55 -> 21:55
    } else if (h >= 4 && h <= 6) {
      h += 12;
    }
    return `${String(h).padStart(2, '0')}:${m}`;
  }

  // N / Night Shift (Night 20:00 - 23:59) -> Sign off next morning (04:00 - 08:00)
  if (shiftUpper === 'N' || (onHour !== null && (onHour >= 20 || onHour <= 4))) {
    // Already morning next day (05:xx, 06:xx, 07:xx)
    return `${String(h).padStart(2, '0')}:${m}`;
  }

  // Default fallback heuristic: if morning sign-on and 1 <= h <= 5, convert to 13:xx-17:xx
  if (h >= 1 && h <= 5 && onHour !== null && onHour >= 6 && onHour <= 10) {
    h += 12;
  }

  return `${String(h).padStart(2, '0')}:${m}`;
};

/**
 * Converts a HH:MM or HH:MM:SS string to total seconds
 */
export const timeToSeconds = (tStr) => {
  if (!tStr || tStr === '--' || tStr === '-') return 0;
  const parts = String(tStr).trim().split(':');
  const h = parseInt(parts[0], 10) || 0;
  const m = parseInt(parts[1], 10) || 0;
  const s = parseInt(parts[2], 10) || 0;
  return h * 3600 + m * 60 + s;
};

/**
 * Converts a HH:MM or HH:MM:SS string to total minutes
 */
export const timeToMinutes = (tStr) => {
  if (!tStr || tStr === '--' || tStr === '-') return 0;
  const parts = String(tStr).trim().split(':');
  const h = parseInt(parts[0], 10) || 0;
  const m = parseInt(parts[1], 10) || 0;
  return h * 60 + m;
};

/**
 * Converts seconds to "HH : MM : SS"
 */
export const secondsToHHMMSS = (totalSecs) => {
  if (totalSecs <= 0 || isNaN(totalSecs)) return '00 : 00 : 00';
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = totalSecs % 60;
  return `${String(h).padStart(2, '0')} : ${String(m).padStart(2, '0')} : ${String(s).padStart(2, '0')}`;
};

/**
 * Converts seconds to "HH:MM"
 */
export const secondsToHHMM = (totalSecs) => {
  if (totalSecs <= 0 || isNaN(totalSecs)) return '00:00';
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

/**
 * Calculates positive duty duration in minutes, handling midnight-crossing (e.g. 23:30 to 05:30 -> 360 mins)
 */
export const calculateDutyDurationMinutes = (signOnStr, signOffStr) => {
  if (!signOnStr || !signOffStr || signOnStr === '--' || signOffStr === '--') return 0;
  const onMin = timeToMinutes(signOnStr);
  const offMin = timeToMinutes(signOffStr);
  if (offMin >= onMin) {
    return offMin - onMin;
  }
  // Crosses midnight (e.g. on 23:30, off 05:30 -> 1440 - 1410 + 330 = 360 mins)
  return (1440 - onMin) + offMin;
};

/**
 * Formats duration in minutes to readable string (e.g. "6h 30m" or "06:30")
 */
export const formatDutyDuration = (signOnStr, signOffStr) => {
  const mins = calculateDutyDurationMinutes(signOnStr, signOffStr);
  if (mins <= 0) return '--';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

/**
 * Returns the current date in YYYY-MM-DD format in Asia/Kolkata (IST)
 */
export const getCurrentISTDateString = () => {
  const now = new Date();
  const options = { timeZone: TIMEZONE_IST, year: 'numeric', month: '2-digit', day: '2-digit' };
  const parts = new Intl.DateTimeFormat('en-CA', options).formatToParts(now);
  const year = parts.find(p => p.type === 'year')?.value || '2026';
  const month = parts.find(p => p.type === 'month')?.value || '08';
  const day = parts.find(p => p.type === 'day')?.value || '19';
  return `${year}-${month}-${day}`;
};

/**
 * Formats a Date object into IST Time string "HH:MM:SS"
 */
export const getCurrentISTTimeString = (date = new Date()) => {
  return date.toLocaleTimeString('en-IN', {
    timeZone: TIMEZONE_IST,
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
};

/**
 * Resolves clean BMRCL Duty Type / Link string from duty data
 * avoiding Excel unformatted decimals (e.g. 0.059027...) and ensuring
 * clear, professional duty type labels for all duties #1 to #78+
 */
export const formatDutyTypeLink = (item) => {
  if (!item) return '—';

  // 1. Special assignment categories
  if (item.assignmentCategory === 'CREW_CONTROLLER') {
    const code = item.assignedDutyCode || item.assignmentSubType || item.tag || 'CC Desk';
    if (code === 'CC1' || code === 'CC-1') return 'CC-1 (ALS / Early)';
    if (code === 'CC2' || code === 'CC-2') return 'CC-2 (General)';
    if (code === 'CC3' || code === 'CC-3') return 'CC-3 (Night Desk)';
    if (code === 'GCC') return 'GCC (General CC)';
    return code;
  }
  if (item.assignmentCategory === 'SPECIAL_AUX_DUTY') {
    const sub = item.assignmentSubType || item.assignedDutyCode || item.tag || 'Special Duty';
    if (sub.includes('STBK') || sub.includes('Standby')) return sub;
    if (sub === 'OR1' || sub === 'OR-1') return 'OR-1 (PYID)';
    if (sub === 'OR2' || sub === 'OR-2') return 'OR-2 (TGTP)';
    if (sub === 'OR_SPARE' || sub.includes('Spare')) return 'OR Spare Pool';
    return sub;
  }
  if (item.assignmentCategory === 'TRAINEE') {
    return item.mentorName ? `Shadow (${item.mentorName})` : "JMD TD's Shadow";
  }
  if (item.assignmentCategory === 'NOT_AVAILABLE') {
    return item.assignmentSubType || item.tag || item.dutyCode || 'Not Available';
  }

  const num = parseInt(item.dutyNo, 10);
  const shift = item.shift || (item.isNight ? 'N' : 'A');
  const padNo = !isNaN(num) ? String(num).padStart(2, '0') : '';
  const rawTrain = item.trainNo || item.trainId || (item.rawLegs && item.rawLegs.l1Train);
  const train = rawTrain && rawTrain !== '0' && rawTrain !== '--' && !String(rawTrain).startsWith('0.') ? String(rawTrain).trim() : null;

  // 2. Named invariants from BMRCL timetable
  if (shift === 'PRO' || num === 1 || (train && train.toLowerCase().includes('pro 1'))) return 'PRO 1 (Pilot Relief)';
  if (shift === 'STBY' || num === 2 || (train && train.toLowerCase().includes('rd3'))) return 'RD3 STBY (Standby)';
  if (shift === 'NPRO' || num === 78 || (train && train.toLowerCase().includes('n-pro'))) return 'N-PRO (Night Pilot)';
  if (shift === 'NCRRC' || num === 79 || (train && train.toLowerCase().includes('ncrrc'))) return 'N-CRRC (Testing)';
  if (shift === 'NTST' || num === 80 || (train && train.toLowerCase().includes('ntst'))) return 'N-TST (Test Track)';

  // 3. Check existing dutyCode if it is a clean text string (and NOT decimal/numbers)
  const rawCode = item.assignedDutyCode || item.dutyCode;
  const isNumericOrDecimal = typeof rawCode === 'number' || (typeof rawCode === 'string' && (/^\d+(\.\d+)?$/.test(rawCode.trim()) || /^\d+\.\d+/.test(rawCode.trim())));
  const isTemplatePrefix = typeof rawCode === 'string' && (rawCode.startsWith('Wday_') || rawCode.startsWith('Sat_') || rawCode.startsWith('Sun_') || rawCode.startsWith('Mon_') || rawCode.startsWith('GH_'));

  if (rawCode && !isNumericOrDecimal && !isTemplatePrefix && rawCode !== 'ACTIVE_DUTY') {
    return rawCode;
  }

  // 4. Construct clean official BMRCL link code by shift band
  if (shift === 'N' || item.isNight || (num >= 59 && num <= 77)) {
    if (train) {
      if (train.toLowerCase().startsWith('n')) return train;
      if (train.toLowerCase().includes('pro') || train.toLowerCase().includes('cc3')) return `N-${padNo} (${train})`;
      return `N-${padNo} (Tr ${train})`;
    }
    return `N-${padNo} (Night Link)`;
  }

  if (shift === 'B' || (num >= 33 && num <= 63)) {
    if (train) {
      if (train.toLowerCase().startsWith('b')) return train;
      if (train.toLowerCase().includes('couns')) return `B-${padNo} (Couns)`;
      return `B-${padNo} (Tr ${train})`;
    }
    return `B-${padNo} (Mainline)`;
  }

  // A Shift (Duties 3 to 32)
  if (shift === 'A' || (num >= 3 && num <= 32)) {
    if (train) {
      if (train.toLowerCase().startsWith('a')) return train;
      if (train.toLowerCase().includes('couns')) return `A-${padNo} (Couns)`;
      if (train.toLowerCase().includes('rd3')) return `A-${padNo} (Rd3 Induct)`;
      return `A-${padNo} (Tr ${train})`;
    }
    return `A-${padNo} (Mainline)`;
  }

  if (train) return `${shift || 'Duty'} (Tr ${train})`;
  return `Duty #${num || ''}`;
};

