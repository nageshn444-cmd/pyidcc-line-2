// Centralized time math calculations for PYIDCC

export const timeToSeconds = (tStr) => {
  if (!tStr || tStr === '--' || tStr === '-') return 0;
  const parts = String(tStr).split(':');
  const h = parseInt(parts[0], 10) || 0;
  const m = parseInt(parts[1], 10) || 0;
  const s = parseInt(parts[2], 10) || 0;
  return h * 3600 + m * 60 + s;
};

export const secondsToHHMMSS = (totalSecs) => {
  if (totalSecs <= 0 || isNaN(totalSecs)) return '00 : 00 : 00';
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = totalSecs % 60;
  return `${String(h).padStart(2, '0')} : ${String(m).padStart(2, '0')} : ${String(s).padStart(2, '0')}`;
};

export const secondsToHHMM = (totalSecs) => {
  if (totalSecs <= 0 || isNaN(totalSecs)) return '00:00';
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};
