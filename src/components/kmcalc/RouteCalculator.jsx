import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { PREDEFINED_TRIPS } from '../../data/kmcalc/masterStations';
import { PRELOADED_DUTIES } from '../../data/kmcalc/preloadedDuties';
import { calculateDistance, parseCSVToDuties, enhanceRosterDuties } from '../../utils/kmCalculator';
import { 
  Plus, 
  Trash2, 
  ArrowRight, 
  HelpCircle, 
  RotateCcw, 
  ShieldCheck, 
  MapPin, 
  Compass, 
  ArrowUpRight, 
  ArrowDownRight,
  Upload,
  UploadCloud,
  FileSpreadsheet,
  Download,
  Search,
  ChevronDown,
  ChevronUp,
  FileText,
  Maximize2,
  Smartphone,
  ZoomIn,
  ZoomOut
} from 'lucide-react';

// 32 main passenger stations with matching serial order and coordinates for the serpentine layout
const MAP_STATIONS = [
  // Row 1 (Left to Right): y = 60
  { code: 'BIET_BE', displayCode: 'BIET BE', x: 20, y: 60, row: 1, labelPos: 'above' },
  { code: 'BIET', displayCode: 'BIET', x: 60, y: 60, row: 1, labelPos: 'above' },
  { code: 'JDHL', displayCode: 'JIDL', x: 150, y: 60, row: 1, labelPos: 'above' },
  { code: 'MNJN', displayCode: 'MNJN', x: 240, y: 60, row: 1, labelPos: 'above' },
  { code: 'NGSA_PT', displayCode: 'NGSA PKT', x: 270, y: 20, row: 1, labelPos: 'below' },
  { code: 'NGSA_BE', displayCode: 'NGSA BE', x: 300, y: 60, row: 1, labelPos: 'above' },
  { code: 'NGSA', displayCode: 'NGSA', x: 330, y: 60, row: 1, labelPos: 'above' },
  { code: 'DSH', displayCode: 'DSH', x: 420, y: 60, row: 1, labelPos: 'above' },
  { code: 'JLHL', displayCode: 'JLHL', x: 510, y: 60, row: 1, labelPos: 'above' },
  { code: 'DEPOT', displayCode: 'DEPOT', x: 555, y: 20, row: 1, labelPos: 'below' },
  { code: 'PYID', displayCode: 'PYID', x: 600, y: 60, row: 1, labelPos: 'above' },
  { code: 'PEYA', displayCode: 'PEYA', x: 690, y: 60, row: 1, labelPos: 'above' },
  { code: 'YPI', displayCode: 'YPI', x: 780, y: 60, row: 1, labelPos: 'above' },
  { code: 'YPM', displayCode: 'YPM', x: 870, y: 60, row: 1, labelPos: 'above' },
  { code: 'SSFY', displayCode: 'SSFY', x: 960, y: 60, row: 1, labelPos: 'above' },

  // Row 2 (Right to Left): y = 160
  { code: 'MHLI', displayCode: 'MHLI', x: 960, y: 160, row: 2, labelPos: 'above' },
  { code: 'MHLI_PT', displayCode: 'MHLI PKT', x: 915, y: 120, row: 2, labelPos: 'below' },
  { code: 'RJNR', displayCode: 'RJNR', x: 870, y: 160, row: 2, labelPos: 'above' },
  { code: 'KVPR', displayCode: 'KVPR', x: 780, y: 160, row: 2, labelPos: 'above' },
  { code: 'SPRU', displayCode: 'SPRU', x: 690, y: 160, row: 2, labelPos: 'above' },
  { code: 'SPGD', displayCode: 'SPGD', x: 600, y: 160, row: 2, labelPos: 'above' },
  { code: 'KGWA', displayCode: 'KGWA', x: 510, y: 160, row: 2, labelPos: 'above' },
  { code: 'CKPE', displayCode: 'CKPE', x: 420, y: 160, row: 2, labelPos: 'above' },
  { code: 'KRMT', displayCode: 'KRMT', x: 330, y: 160, row: 2, labelPos: 'above' },
  { code: 'NLC', displayCode: 'NLC', x: 240, y: 160, row: 2, labelPos: 'above' },
  { code: 'NLC_PT', displayCode: 'NLC PKT', x: 200, y: 120, row: 2, labelPos: 'below' },
  { code: 'LBGH', displayCode: 'LBGH', x: 150, y: 160, row: 2, labelPos: 'above' },
  { code: 'SECE', displayCode: 'SECE', x: 60, y: 160, row: 2, labelPos: 'above' },

  // Row 3 (Left to Right): y = 260
  { code: 'JYN', displayCode: 'JYN', x: 60, y: 260, row: 3, labelPos: 'above' },
  { code: 'RVR', displayCode: 'RVR', x: 160, y: 260, row: 3, labelPos: 'above' },
  { code: 'BSNK', displayCode: 'BSNK', x: 260, y: 260, row: 3, labelPos: 'above' },
  { code: 'JPN', displayCode: 'JPN', x: 360, y: 260, row: 3, labelPos: 'above' },
  { code: 'PUTH', displayCode: 'PUTH', x: 460, y: 260, row: 3, labelPos: 'above' },
  { code: 'PUTH_BE', displayCode: 'PUTH BE', x: 510, y: 260, row: 3, labelPos: 'above' },
  { code: 'APRC', displayCode: 'APRC', x: 560, y: 260, row: 3, labelPos: 'above' },
  { code: 'KLPK', displayCode: 'KLPK', x: 660, y: 260, row: 3, labelPos: 'above' },
  { code: 'VJRH', displayCode: 'VJRH', x: 760, y: 260, row: 3, labelPos: 'above' },
  { code: 'TGTP', displayCode: 'TGTP', x: 860, y: 260, row: 3, labelPos: 'above' },
  { code: 'APTS', displayCode: 'APTS', x: 960, y: 260, row: 3, labelPos: 'above' },
  { code: 'APTS_BE', displayCode: 'APTS BE', x: 1000, y: 260, row: 3, labelPos: 'above' }
];

export default function RouteCalculator({ 
  stations, 
  selectedSequence, 
  setSelectedSequence,
  duties: externalDuties,
  setDuties: externalSetDuties,
  onImportDuties 
}) {
  const [activeTab, setActiveTab] = useState('rosterCalc');
  const [hoveredStation, setHoveredStation] = useState(null);

  // Roster Upload Calculator persistent state
  const [savedUpload, setSavedUpload] = useState(() => {
    try {
      const stored = localStorage.getItem('bmrcl_link_roster_upload_cache');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && Array.isArray(parsed.duties) && parsed.duties.length > 0) {
          return parsed;
        }
      }
    } catch (e) {
      console.warn("Could not read link roster cache:", e);
    }
    return null;
  });

  const [rosterSearch, setRosterSearch] = useState('');
  const [expandedDutyNo, setExpandedDutyNo] = useState('4');
  const [timetableSchedule, setTimetableSchedule] = useState(() => savedUpload?.dayType || 'WEEKDAY');
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);

  const [isCleared, setIsCleared] = useState(false);

  // Track Map Responsive View Engine States (Mobile / Laptop)
  const [trackViewMode, setTrackViewMode] = useState('FIT'); // 'FIT' | 'SCROLL'
  const [zoomLevel, setZoomLevel] = useState(100);

  const saveUploadedRoster = (fileName, rawParsedDuties, schedType = timetableSchedule) => {
    setIsCleared(false);
    setManualOverrides({});
    setEditingDutyNo(null);
    try {
      localStorage.removeItem('bmrcl_link_roster_manual_overrides');
    } catch (e) {}
    const enhanced = enhanceRosterDuties(rawParsedDuties, schedType);
    const data = {
      fileName,
      dayType: schedType,
      duties: rawParsedDuties,
      timestamp: new Date().toISOString()
    };
    setSavedUpload(data);
    try {
      localStorage.setItem('bmrcl_link_roster_upload_cache', JSON.stringify(data));
    } catch (e) {
      console.warn("Could not save link roster to localStorage:", e);
    }
    if (externalSetDuties) externalSetDuties(enhanced);
    if (onImportDuties) onImportDuties(enhanced);
  };

  const handleClearUploadedRoster = () => {
    setIsCleared(true);
    setSavedUpload(null);
    setManualOverrides({});
    setEditingDutyNo(null);
    try {
      localStorage.removeItem('bmrcl_link_roster_upload_cache');
      localStorage.removeItem('bmrcl_link_roster_manual_overrides');
    } catch (e) {}
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    if (externalSetDuties) externalSetDuties([]);
  };

  const handleLoadSampleRoster = () => {
    saveUploadedRoster('BMRCL_Sample_Benchmark_Link_Roster.xlsx', PRELOADED_DUTIES, timetableSchedule);
  };

  // Helper to sanitize duty numbers and remove binary garbage or corrupted cell characters
  const sanitizeDutyNo = (str) => {
    if (!str) return '';
    let s = String(str).trim().replace(/^(duty\s*(no\.?|#)?)[\s:]*/i, '');
    // Keep alphanumeric, spaces, hyphens, and basic duty punctuation like 1T, 2T, 3T, SB, RR, CC
    s = s.replace(/[^\w\s-]/gi, '').trim();
    return s;
  };

  // Helper to validate link roster duty and exclude binary garbage or raw crew profile tokens
  const isValidLinkRosterDuty = (d) => {
    if (!d || typeof d !== 'object') return false;
    const cleanDn = sanitizeDutyNo(d.dutyNo);
    if (!cleanDn || cleanDn.length === 0 || cleanDn.length > 25) return false;
    if (cleanDn === '---' || cleanDn === '==' || cleanDn === '===' || cleanDn === '***' || cleanDn.startsWith('~') || cleanDn.includes('/') || cleanDn.includes(';') || cleanDn.includes('=')) return false;
    // Exclude unformatted time numbers like 615, 620, 1235 when signOn/signOff times are missing
    if (/^\d{3,4}$/.test(cleanDn) && !d.sOnTime && !d.sOffTime && (!d.trips || d.trips.length === 0)) return false;
    return true;
  };

  const [editingDutyNo, setEditingDutyNo] = useState(null);
  const [editFormData, setEditFormData] = useState({});
  const [manualOverrides, setManualOverrides] = useState(() => {
    try {
      const stored = localStorage.getItem('bmrcl_link_roster_manual_overrides');
      if (stored) return JSON.parse(stored);
    } catch (e) {}
    return {};
  });

  const handleStartEditDuty = (duty) => {
    setEditingDutyNo(duty.dutyNo);
    const existing = manualOverrides[duty.dutyNo] || {};
    const leg1 = duty.trips?.[0];
    const leg2 = duty.trips?.[1];
    const leg3 = duty.trips?.[2];
    const leg4 = duty.trips?.[3];

    const getPathStr = (t) => t?.customPathStr || (t?.intermediateStations?.length > 0 ? t.intermediateStations.join(' → ') : (t?.boardingStation && t?.alightingStation ? `${t.boardingStation} → ${t.alightingStation}` : ''));

    setEditFormData({
      dutyNo: duty.dutyNo,
      leg1Path: existing.leg1Path !== undefined ? existing.leg1Path : getPathStr(leg1),
      leg1Km: existing.leg1Km !== undefined ? existing.leg1Km : (leg1?.calculatedKms || 0),
      leg2Path: existing.leg2Path !== undefined ? existing.leg2Path : getPathStr(leg2),
      leg2Km: existing.leg2Km !== undefined ? existing.leg2Km : (leg2?.calculatedKms || 0),
      leg3Path: existing.leg3Path !== undefined ? existing.leg3Path : getPathStr(leg3),
      leg3Km: existing.leg3Km !== undefined ? existing.leg3Km : (leg3?.calculatedKms || 0),
      leg4Path: existing.leg4Path !== undefined ? existing.leg4Path : getPathStr(leg4),
      leg4Km: existing.leg4Km !== undefined ? existing.leg4Km : (leg4?.calculatedKms || 0),
      totalKm: existing.totalKm !== undefined ? existing.totalKm : (duty.kms || 0),
    });
  };

  const handleSaveEditDuty = (dutyNo) => {
    const updated = {
      ...manualOverrides,
      [dutyNo]: {
        ...editFormData,
        leg1Km: Number(editFormData.leg1Km) || 0,
        leg2Km: Number(editFormData.leg2Km) || 0,
        leg3Km: Number(editFormData.leg3Km) || 0,
        leg4Km: Number(editFormData.leg4Km) || 0,
        totalKm: Number(editFormData.totalKm) !== undefined ? Number(editFormData.totalKm) : (Number(editFormData.leg1Km || 0) + Number(editFormData.leg2Km || 0) + Number(editFormData.leg3Km || 0) + Number(editFormData.leg4Km || 0))
      }
    };
    setManualOverrides(updated);
    try {
      localStorage.setItem('bmrcl_link_roster_manual_overrides', JSON.stringify(updated));
    } catch (e) {}
    setEditingDutyNo(null);
  };

  const handleResetDutyOverride = (dutyNo) => {
    const updated = { ...manualOverrides };
    delete updated[dutyNo];
    setManualOverrides(updated);
    try {
      localStorage.setItem('bmrcl_link_roster_manual_overrides', JSON.stringify(updated));
    } catch (e) {}
    if (editingDutyNo === dutyNo) setEditingDutyNo(null);
  };

  const activeDuties = React.useMemo(() => {
    if (isCleared) return [];
    let rawDuties = [];
    if (savedUpload && Array.isArray(savedUpload.duties) && savedUpload.duties.length > 0) {
      rawDuties = savedUpload.duties;
    } else {
      rawDuties = PRELOADED_DUTIES;
    }
    const validRaw = rawDuties.filter(isValidLinkRosterDuty).map(d => ({
      ...d,
      dutyNo: sanitizeDutyNo(d.dutyNo)
    })).filter(d => d.dutyNo !== '615' && d.dutyNo !== '620');

    const enhanced = enhanceRosterDuties(validRaw, timetableSchedule);

    return enhanced.map(duty => {
      const ov = manualOverrides[duty.dutyNo];
      if (!ov) return duty;

      const trips = [...(duty.trips || [])];
      for (let i = 0; i < 4; i++) {
        const legKey = `leg${i + 1}`;
        const kmKey = `${legKey}Km`;
        const pathKey = `${legKey}Path`;
        if (ov[kmKey] !== undefined || ov[pathKey] !== undefined) {
          if (!trips[i]) {
            trips[i] = { legNumber: i + 1, calculatedKms: 0 };
          }
          trips[i] = {
            ...trips[i],
            calculatedKms: ov[kmKey] !== undefined ? Number(ov[kmKey]) : trips[i].calculatedKms,
            customPathStr: ov[pathKey] !== undefined ? ov[pathKey] : trips[i].customPathStr
          };
        }
      }

      const totalKm = ov.totalKm !== undefined ? Number(ov.totalKm) : (
        trips.reduce((sum, t) => sum + (t?.calculatedKms || 0), 0)
      );

      return {
        ...duty,
        trips,
        kms: totalKm,
        isManuallyEdited: true
      };
    });
  }, [savedUpload, timetableSchedule, manualOverrides]);

  const handleScheduleChange = (newSched) => {
    setTimetableSchedule(newSched);
    if (savedUpload) {
      setSavedUpload(prev => ({
        ...prev,
        dayType: newSched
      }));
      try {
        localStorage.setItem('bmrcl_link_roster_upload_cache', JSON.stringify({
          ...savedUpload,
          dayType: newSched
        }));
      } catch (e) {}
    }
  };

  const parseExcelWorkbookToDuties = (workbook) => {
    try {
      if (!workbook || !workbook.SheetNames || workbook.SheetNames.length === 0) return null;

      const dutyKeywords = ['duty', 'duty no', 'duty_no', 'duty#', 'duty.', 'link', 'sl', 'sl.no', 's.no', 'shift', 'duty id'];
      const sOnKeywords = ['sign on', 's/on', 's on', 's-on', 's.on', 'son', 'on time', 'report time', 'start time', 'sign_on'];
      const sOnLocKeywords = ['sign on loc', 's/on loc', 's on loc', 'on_location', 'location', 'sign_on_loc', 'on loc', 's.on loc'];
      const sOffKeywords = ['sign off', 's/off', 's off', 's-off', 's.off', 'soff', 'off time', 'end time', 'sign_off'];
      const sOffLocKeywords = ['sign off loc', 's/off loc', 's off loc', 'off_location', 'sign_off_loc', 'off loc', 's.off loc'];
      const trainKeywords = ['train', 'tr.no', 'tr no', 'train no', 'train_no', 'train#', 'tr', 't.no'];
      const timeFrmKeywords = ['time frm', 'time_frm', 'frm', 'dep', 'departure', 'dep.time', 'from time', 'time from'];
      const timeToKeywords = ['time to', 'time_to', 'to', 'arr', 'arrival', 'arr.time', 'to time', 'time to'];
      const takeoverKeywords = ['takeover', 't/o', 'take over', 'takeover loc', 't/o loc'];
      const handoverKeywords = ['handover', 'h/o', 'hand over', 'handover loc', 'h/o loc'];

      const matchesKeyword = (headerStr, keywords) => {
        if (!headerStr) return false;
        const h = String(headerStr).toLowerCase().trim();
        const hClean = h.replace(/[^a-z0-9]/g, '');
        for (const kw of keywords) {
          const k = kw.toLowerCase().trim();
          const kClean = k.replace(/[^a-z0-9]/g, '');
          if (h === k || h.includes(k) || k.includes(h)) return true;
          if (hClean && kClean && (hClean.includes(kClean) || kClean.includes(hClean))) return true;
        }
        return false;
      };

      let bestParsedDuties = [];

      // Iterate through sheets in workbook
      for (const sheetName of workbook.SheetNames) {
        const worksheet = workbook.Sheets[sheetName];
        if (!worksheet || !worksheet['!ref']) continue;

        const range = XLSX.utils.decode_range(worksheet['!ref']);
        const rowsMatrix = [];

        for (let R = range.s.r; R <= range.e.r; ++R) {
          const rowCells = [];
          for (let C = range.s.c; C <= range.e.c; ++C) {
            const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
            const cell = worksheet[cellAddress];
            if (!cell) {
              rowCells.push({ val: '', bold: false, underline: false });
              continue;
            }
            const val = String(cell.w || cell.v || '').trim();
            const html = String(cell.h || '');
            const font = cell.s?.font || {};

            const isBold = Boolean(font.bold || font.b || html.includes('<b>') || html.includes('<strong>') || html.includes('font-weight:bold'));
            const isUnderline = Boolean(font.underline || font.u || html.includes('<u>') || html.includes('text-decoration:underline') || font.u === 'single' || font.u === 1 || font.u === true);

            rowCells.push({ val, bold: isBold, underline: isUnderline });
          }
          rowsMatrix.push(rowCells);
        }

        if (rowsMatrix.length < 2) continue;

        // Score header rows 0..25
        let bestHeaderIdx = 0;
        let maxScore = -1;

        for (let r = 0; r < Math.min(25, rowsMatrix.length); r++) {
          const row = rowsMatrix[r];
          let score = 0;
          row.forEach(cellObj => {
            if (matchesKeyword(cellObj.val, dutyKeywords)) score += 3;
            if (matchesKeyword(cellObj.val, sOnKeywords)) score += 2;
            if (matchesKeyword(cellObj.val, sOffKeywords)) score += 2;
            if (matchesKeyword(cellObj.val, trainKeywords)) score += 2;
            if (matchesKeyword(cellObj.val, timeFrmKeywords)) score += 1;
            if (matchesKeyword(cellObj.val, timeToKeywords)) score += 1;
          });
          if (score > maxScore) {
            maxScore = score;
            bestHeaderIdx = r;
          }
        }

        const headers = rowsMatrix[bestHeaderIdx].map(c => String(c.val || '').toLowerCase().trim());

        const findColIndex = (keywords) => {
          for (let c = 0; c < headers.length; c++) {
            if (matchesKeyword(headers[c], keywords)) return c;
          }
          return -1;
        };

        const dutyNoIdx = findColIndex(dutyKeywords);
        const sOnTimeIdx = findColIndex(sOnKeywords);
        const signOnLocIdx = findColIndex(sOnLocKeywords);
        const sOffTimeIdx = findColIndex(sOffKeywords);
        const signOffLocIdx = findColIndex(sOffLocKeywords);
        const kmsIdx = findColIndex(['kms', 'distance', 'km', 'kilometer', 'total km']);

        const trainColIndices = [];
        headers.forEach((h, c) => {
          if ((h.includes('train') || h === 'tr' || h.includes('tr.no') || h === 't.no') && !h.includes('trip')) {
            trainColIndices.push(c);
          }
        });

        const legCols = trainColIndices.map(tCol => {
          let timeFrmCol = -1, timeToCol = -1, takeoverCol = -1, handoverCol = -1;

          for (let c = Math.max(0, tCol - 2); c <= Math.min(headers.length - 1, tCol + 4); c++) {
            const h = headers[c];
            if (c < tCol && (h.includes('takeover') || h.includes('t/o') || h.includes('from loc'))) {
              takeoverCol = c;
            } else if (c >= tCol && (h.includes('frm') || h.includes('dep') || h.includes('from')) && timeFrmCol === -1) {
              timeFrmCol = c;
            } else if (c > tCol && (h.includes('to') || h.includes('arr')) && !h.includes('takeover') && !h.includes('handover') && timeToCol === -1) {
              timeToCol = c;
            } else if (c > tCol && (h.includes('handover') || h.includes('h/o') || h.includes('to loc'))) {
              handoverCol = c;
            }
          }
          if (timeFrmCol === -1) timeFrmCol = tCol + 1;
          if (timeToCol === -1) timeToCol = tCol + 2;

          return { trainCol: tCol, timeFrmCol, timeToCol, takeoverCol, handoverCol };
        });

        let sheetDuties = [];
        let currentDutyObj = null;

        for (let r = bestHeaderIdx + 1; r < rowsMatrix.length; r++) {
          const row = rowsMatrix[r];
          if (!row || row.length < 2) continue;

          let rawDutyVal = dutyNoIdx !== -1 ? row[dutyNoIdx]?.val : '';
          if (!rawDutyVal) {
            for (let c = 0; c < Math.min(4, row.length); c++) {
              const val = String(row[c]?.val || '').trim();
              const cleanVal = val.replace(/^duty\s*@?\s*/i, '').replace(/[^a-zA-Z0-9\s-]/g, '').trim();
              if (cleanVal && (/\d+/.test(cleanVal) || /^(pro|stby|r3|rd3|duty|sb)\d*/i.test(cleanVal))) {
                rawDutyVal = cleanVal;
                break;
              }
            }
          }

          const isSubRow = !rawDutyVal && currentDutyObj;
          if (!rawDutyVal && !isSubRow) continue;

          if (!isSubRow) {
            const dutyNo = sanitizeDutyNo(rawDutyVal);
            if (!dutyNo || dutyNo.toLowerCase().includes('total') || dutyNo.toLowerCase().includes('prepared') || dutyNo.startsWith('~')) continue;

            const sOnTime = sOnTimeIdx !== -1 ? row[sOnTimeIdx]?.val : '06:00:00';
            const signOnLocation = signOnLocIdx !== -1 ? row[signOnLocIdx]?.val : 'PYID';
            const sOffTime = sOffTimeIdx !== -1 ? row[sOffTimeIdx]?.val : '14:00:00';
            const signOffLocation = signOffLocIdx !== -1 ? row[signOffLocIdx]?.val : 'PYID';
            const kms = kmsIdx !== -1 ? (parseFloat(row[kmsIdx]?.val) || 0) : 0;

            const trips = [];

            legCols.forEach(lCol => {
              const trainCell = lCol.trainCol !== -1 ? row[lCol.trainCol] : null;
              const timeFrmCell = lCol.timeFrmCol !== -1 ? row[lCol.timeFrmCol] : null;
              const timeToCell = lCol.timeToCol !== -1 ? row[lCol.timeToCol] : null;
              const takeoverCell = lCol.takeoverCol !== -1 ? row[lCol.takeoverCol] : null;
              const handoverCell = lCol.handoverCol !== -1 ? row[lCol.handoverCol] : null;

              const trainNo = trainCell?.val || '';
              const timeFrm = timeFrmCell?.val || '';
              const timeTo = timeToCell?.val || '';
              const takeoverLocation = takeoverCell?.val || '';
              const handoverLocation = handoverCell?.val || '';

              if ((trainNo || timeFrm) && !/^\d{1,2}:\d{2}(:\d{2})?$/.test(String(trainNo).trim())) {
                const isUnderlined = Boolean(trainCell?.underline);
                const isFrmTimeBold = Boolean(timeFrmCell?.bold);
                const isToTimeBold = Boolean(timeToCell?.bold);
                const isBoldedTime = isFrmTimeBold || isToTimeBold;
                const trainLower = trainNo.toLowerCase();
                const isCounselling = trainLower.includes('couns') || trainLower.includes('counseling');

                trips.push({
                  legNumber: trips.length + 1,
                  trainNo: trainNo || 'Unknown',
                  timeFrm,
                  timeTo,
                  takeoverLocation: takeoverLocation || signOnLocation,
                  handoverLocation: handoverLocation || signOffLocation,
                  isShortLoop: isUnderlined,
                  isUnderlined,
                  isFrmTimeBold,
                  isToTimeBold,
                  isStartDnLine: isFrmTimeBold,
                  isEndDnLine: isToTimeBold,
                  isBoldedTime,
                  isDnLine: isBoldedTime,
                  isCounselling
                });
              }
            });

            // Smart trip fallback for row if header column matching returned 0 trips
            if (trips.length === 0) {
              const timeCells = [];
              const locationCells = [];
              const trainCells = [];

              row.forEach(cellObj => {
                const val = String(cellObj?.val || '').trim();
                if (!val) return;
                if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(val)) {
                  timeCells.push({ val, bold: cellObj.bold });
                } else if (/(PYID|KGWA|PUTH|DEPOT|DEPO|DPO|DHO|NLC|APTS|RJNR|YPM|NGSA|BIET|RD3)/i.test(val)) {
                  locationCells.push(val);
                } else if (/^(\d{3}|pro\s*\d*|rd3\s*stby|stby)$/i.test(val)) {
                  trainCells.push({ val, underline: cellObj.underline });
                }
              });

              if (trainCells.length > 0 || timeCells.length >= 2) {
                const numTrips = Math.max(trainCells.length, Math.floor((timeCells.length - 2) / 2));
                for (let tIdx = 0; tIdx < Math.min(4, Math.max(1, numTrips)); tIdx++) {
                  const trObj = trainCells[tIdx] || { val: `Train ${tIdx + 1}`, underline: false };
                  const tFrmObj = timeCells[1 + tIdx * 2] || timeCells[0] || { val: '06:00:00', bold: false };
                  const tToObj = timeCells[2 + tIdx * 2] || timeCells[1] || { val: '08:00:00', bold: false };
                  const tTake = locationCells[tIdx] || signOnLocation;
                  const tHand = locationCells[tIdx + 1] || signOffLocation;

                  trips.push({
                    legNumber: tIdx + 1,
                    trainNo: trObj.val,
                    timeFrm: tFrmObj.val,
                    timeTo: tToObj.val,
                    takeoverLocation: tTake,
                    handoverLocation: tHand,
                    isShortLoop: Boolean(trObj.underline),
                    isUnderlined: Boolean(trObj.underline),
                    isBoldedTime: Boolean(tFrmObj.bold || tToObj.bold),
                    isDnLine: Boolean(tFrmObj.bold || tToObj.bold),
                    isCounselling: String(trObj.val).toLowerCase().includes('couns')
                  });
                }
              }
            }

            currentDutyObj = {
              dutyNo,
              sOnTime: sOnTime || '06:00:00',
              signOnLocation: signOnLocation || 'PYID',
              sOffTime: sOffTime || '14:00:00',
              signOffLocation: signOffLocation || 'PYID',
              kms,
              trips
            };
            sheetDuties.push(currentDutyObj);
          } else {
            // Sub-row: extract leg entries for currentDutyObj
            for (let c = 0; c < row.length; c++) {
              const val = String(row[c]?.val || '').trim();
              if (/^\d{3}$/.test(val) || /^(pro|stby|2\d\d)/i.test(val)) {
                const trainNo = val;
                const timeFrm = row[c + 1]?.val || row[c + 2]?.val || '';
                const timeTo = row[c + 2]?.val || row[c + 3]?.val || '';
                const takeoverLocation = row[c - 1]?.val || currentDutyObj.signOnLocation;
                const handoverLocation = row[c + 4]?.val || currentDutyObj.signOffLocation;

                const isAlreadyAdded = currentDutyObj.trips.some(t => t.trainNo === trainNo && t.timeFrm === timeFrm);
                if (!isAlreadyAdded) {
                  const trainLower = trainNo.toLowerCase();
                  const isCounselling = trainLower.includes('couns') || trainLower.includes('counseling');

                  currentDutyObj.trips.push({
                    legNumber: currentDutyObj.trips.length + 1,
                    trainNo,
                    timeFrm,
                    timeTo,
                    takeoverLocation: takeoverLocation || currentDutyObj.signOnLocation,
                    handoverLocation: handoverLocation || currentDutyObj.signOffLocation,
                    isShortLoop: Boolean(row[c]?.underline),
                    isUnderlined: Boolean(row[c]?.underline),
                    isBoldedTime: Boolean(row[c + 1]?.bold || row[c + 2]?.bold),
                    isDnLine: Boolean(row[c + 1]?.bold || row[c + 2]?.bold),
                    isCounselling
                  });
                }
              }
            }
          }
        }

        // Positional Fallback for sheet if header scan yielded 0 or duties have 0 trips
        const totalTripsCount = sheetDuties.reduce((acc, d) => acc + (d.trips?.length || 0), 0);
        if (sheetDuties.length === 0 || totalTripsCount === 0) {
          const fallbackDuties = [];
          for (let r = 0; r < rowsMatrix.length; r++) {
            const row = rowsMatrix[r];
            if (!row || row.length < 3) continue;
            const firstCell = String(row[0]?.val || row[1]?.val || '').trim();
            const isDutyNo = /^\d{1,3}$/.test(firstCell) || /^(Duty|CC|SB|RR|PRO|1T|2T|3T|4T)\d*/i.test(firstCell);
            if (!isDutyNo) continue;

            const dutyNo = firstCell.replace(/^(duty\s*(no\.?|#)?)[\s:]*/i, '');
            const timesInRow = row.filter(c => /^\d{1,2}:\d{2}/.test(String(c.val || '').trim()));
            const sOnTime = timesInRow[0]?.val || '06:00:00';
            const sOffTime = timesInRow[timesInRow.length - 1]?.val || '14:00:00';

            const trips = [];
            for (let c = 1; c < row.length - 1; c++) {
              const val = String(row[c]?.val || '').trim();
              if (/^\d{3}$/.test(val) || /^(Pro|Stby|2\d\d)/i.test(val)) {
                trips.push({
                  trainNo: val,
                  timeFrm: row[c + 1]?.val || '',
                  timeTo: row[c + 2]?.val || '',
                  takeoverLocation: row[c + 3]?.val || 'PYID',
                  handoverLocation: row[c + 4]?.val || 'PYID',
                  isShortLoop: Boolean(row[c]?.underline),
                  isBoldedTime: Boolean(row[c + 1]?.bold || row[c + 2]?.bold)
                });
              }
            }

            fallbackDuties.push({
              dutyNo,
              sOnTime,
              signOnLocation: row[1]?.val || 'PYID',
              sOffTime,
              signOffLocation: row[row.length - 1]?.val || 'PYID',
              kms: 0,
              trips
            });
          }
          if (fallbackDuties.length > 0) {
            sheetDuties = fallbackDuties;
          }
        }

        if (sheetDuties.length > bestParsedDuties.length) {
          bestParsedDuties = sheetDuties;
        }
      }

      return bestParsedDuties.length > 0 ? bestParsedDuties : null;
    } catch (err) {
      console.warn("Advanced workbook parsing warning, using CSV fallback:", err);
      return null;
    }
  };

  const processFile = (file) => {
    if (!file) return;

    // Auto-detect schedule type from filename
    const nameLower = file.name.toLowerCase();
    let detectedSchedule = timetableSchedule;
    if (nameLower.includes('sat')) {
      detectedSchedule = 'SATURDAY';
    } else if (nameLower.includes('sun')) {
      detectedSchedule = 'SUNDAY';
    } else if (nameLower.includes('mon')) {
      detectedSchedule = 'MONDAY';
    } else if (nameLower.includes('week') || nameLower.includes('wkday')) {
      detectedSchedule = 'WEEKDAY';
    }

    setTimetableSchedule(detectedSchedule);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const arrayBuffer = evt.target.result;
        const workbook = XLSX.read(arrayBuffer, { type: 'array', cellStyles: true, cellHTML: true, cellNF: true, cellDates: true });
        
        let parsed = parseExcelWorkbookToDuties(workbook);
        
        if (!parsed || parsed.length === 0) {
          let bestSheetParsed = [];
          for (const sName of workbook.SheetNames) {
            const worksheet = workbook.Sheets[sName];
            const csvText = XLSX.utils.sheet_to_csv(worksheet);
            const sheetParsed = parseCSVToDuties(csvText);
            if (sheetParsed && sheetParsed.length > bestSheetParsed.length) {
              bestSheetParsed = sheetParsed;
            }
          }
          parsed = bestSheetParsed;
        }

        if (parsed && parsed.length > 0) {
          saveUploadedRoster(file.name, parsed, detectedSchedule);
          alert(`✅ Successfully calculated ${parsed.length} roster duties from ${file.name} for ${detectedSchedule} schedule! Saved calculation results until cleared.`);
        } else {
          alert(`⚠️ Could not extract duty rows from ${file.name}. Ensure file contains valid Duty No, Sign On/Off, and Train columns.`);
        }
      } catch (err) {
        console.error("Roster file upload error:", err);
        alert("Failed to parse roster file: " + err.message);
      }
    };

    reader.readAsArrayBuffer(file);
  };

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    processFile(file);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const file = e.dataTransfer?.files?.[0];
    processFile(file);
  };

  const handleExportRosterExcel = () => {
    const exportData = activeDuties.map(d => ({
      "Duty No": d.dutyNo,
      "Sign On Time": d.sOnTime,
      "Sign On Location": d.signOnLocation,
      "Leg 1 KM": d.trips?.[0]?.calculatedKms || 0,
      "Leg 2 KM": d.trips?.[1]?.calculatedKms || 0,
      "Leg 3 KM": d.trips?.[2]?.calculatedKms || 0,
      "Leg 4 KM": d.trips?.[3]?.calculatedKms || 0,
      "Total Duty KM": d.kms || 0,
      "Sign Off Time": d.sOffTime,
      "Sign Off Location": d.signOffLocation,
      "Duty Type": d.dutyType || 'Standard'
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Link Roster Leg KM");
    XLSX.writeFile(wb, `BMRCL_Link_Roster_Leg_KM_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handleResetPreloadedDuties = () => {
    if (window.confirm("Reset roster calculator back to BMRCL default preloaded duties?")) {
      updateDutiesList(PRELOADED_DUTIES);
    }
  };

  const addStationToSequence = () => {
    setSelectedSequence([...selectedSequence, '']);
  };

  const removeStationFromSequence = (index) => {
    if (selectedSequence.length <= 1) return;
    const nextSeq = [...selectedSequence];
    nextSeq.splice(index, 1);
    setSelectedSequence(nextSeq);
  };

  const updateStationInSequence = (index, code) => {
    const nextSeq = [...selectedSequence];
    nextSeq[index] = code;
    setSelectedSequence(nextSeq);
  };

  const clearSequence = () => {
    setSelectedSequence([]);
  };

  const handleStationClick = (code) => {
    // If we click a station, we append it to the current sequence
    // If the sequence contains empty slots, fill them first, otherwise append
    const emptyIndex = selectedSequence.indexOf('');
    if (emptyIndex !== -1) {
      const nextSeq = [...selectedSequence];
      nextSeq[emptyIndex] = code;
      setSelectedSequence(nextSeq);
    } else {
      setSelectedSequence([...selectedSequence, code]);
    }
  };

  // Compute segments and values
  const segments = [];
  let totalDistance = 0;

  for (let i = 0; i < selectedSequence.length - 1; i++) {
    const from = selectedSequence[i];
    const to = selectedSequence[i + 1];
    if (from && to) {
      const dist = calculateDistance(from, to);
      const fromStn = stations.find(s => s.code === from);
      const toStn = stations.find(s => s.code === to);
      
      let direction = 'Stationary';
      if (fromStn && toStn) {
        if (toStn.chainage > fromStn.chainage) {
          direction = 'DOWN';
        } else if (toStn.chainage < fromStn.chainage) {
          direction = 'UP';
        }
      }

      segments.push({ from, to, distance: dist, direction });
      totalDistance += dist;
    }
  }

  return (
    <div className="space-y-3.5" id="route-calculator-container">
      {/* Header and Mode Selector */}
      <div className="bg-slate-900 border border-slate-800 rounded p-3 px-4 shadow-md flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-tight text-emerald-400 flex items-center gap-2 font-mono">
            <RotateCcw className="w-4 h-4 text-emerald-500 animate-spin-slow" />
            Automatic Chainage Distance Engine
          </h2>
          <p className="text-slate-400 text-[10px] mt-0.5 font-mono">
            Click on the interactive map nodes below to build sequence routes, look up predetermined crew trips, or upload roster spreadsheets. Math is absolute difference in coordinates.
          </p>
        </div>
        
        {/* Tab Buttons */}
        <div className="bg-slate-950 p-0.5 rounded border border-slate-800 flex self-stretch md:self-auto overflow-x-auto">
          <button
            id="tab-btn-custom-calc"
            onClick={() => setActiveTab('custom')}
            className={`whitespace-nowrap flex-1 md:flex-none px-3 py-1 rounded text-[10px] font-mono font-semibold transition-colors ${
              activeTab === 'custom' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Interactive Track Builder
          </button>
          <button
            id="tab-btn-predefined-lookup"
            onClick={() => setActiveTab('lookup')}
            className={`whitespace-nowrap flex-1 md:flex-none px-3 py-1 rounded text-[10px] font-mono font-semibold transition-colors ${
              activeTab === 'lookup' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Predefined Trip Reference
          </button>
          <button
            id="tab-btn-roster-upload"
            onClick={() => setActiveTab('rosterCalc')}
            className={`whitespace-nowrap flex-1 md:flex-none px-3 py-1 rounded text-[10px] font-mono font-semibold transition-colors ${
              activeTab === 'rosterCalc' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Roster Upload Calculator
          </button>
        </div>
      </div>

      {activeTab === 'rosterCalc' ? (
        <div className="space-y-3.5" id="roster-upload-calculator-panel">
          {/* Header Controls & Upload Card matching pyidline2crew-41022.web.app */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-md space-y-4">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 border-b border-slate-800 pb-3">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-emerald-950 border border-emerald-700/80 rounded-lg text-emerald-400 font-extrabold font-mono text-sm tracking-wider shadow-sm">
                  KM
                </div>
                <div>
                  <h3 className="text-xs font-extrabold text-slate-100 uppercase tracking-wider font-mono">
                    LINK ROSTER LEG KILOMETER CALCULATOR
                  </h3>
                  <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                    Upload a Weekday/Monday/Sunday Link Roster Excel file to calculate Leg 1-4 and Total Kilometer summaries.
                  </p>
                </div>
              </div>

              {/* Timetable Selector & Export Control */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded px-2.5 py-1">
                  <span className="text-[9px] font-bold font-mono text-slate-400 uppercase tracking-wider">TIMETABLE:</span>
                  <select
                    value={timetableSchedule}
                    onChange={e => handleScheduleChange(e.target.value)}
                    className="bg-transparent text-emerald-400 font-bold text-[10px] font-mono focus:outline-none cursor-pointer"
                  >
                    <option value="WEEKDAY" className="bg-slate-900 text-slate-200">Weekday WTT</option>
                    <option value="MONDAY" className="bg-slate-900 text-slate-200">Monday WTT</option>
                    <option value="SATURDAY" className="bg-slate-900 text-slate-200">Saturday WTT</option>
                    <option value="SUNDAY" className="bg-slate-900 text-slate-200">Sunday WTT</option>
                  </select>
                </div>
                <button
                  onClick={handleExportRosterExcel}
                  className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-[10px] font-mono font-bold flex items-center gap-1.5 shadow-sm transition-colors uppercase tracking-wider"
                >
                  <Download className="w-3.5 h-3.5" />
                  DOWNLOAD EXCEL REPORT
                </button>
              </div>
            </div>

            {/* Active Uploaded Roster Notification Banner */}
            {savedUpload && (
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between bg-emerald-950/70 border border-emerald-700/80 rounded-xl p-3.5 gap-3 shadow-md font-mono">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-emerald-900/60 rounded-lg border border-emerald-600/50 shrink-0">
                    <FileSpreadsheet className="w-5 h-5 text-emerald-300" />
                  </div>
                  <div>
                    <div className="text-[10px] font-bold uppercase text-emerald-400 tracking-wider flex items-center gap-2">
                      <span>Uploaded Link Roster Saved & Active</span>
                      <span className="text-[9px] bg-emerald-900 text-emerald-300 px-1.5 py-0.5 rounded border border-emerald-700 font-mono">
                        {savedUpload.dayType}
                      </span>
                    </div>
                    <div className="text-xs font-bold text-slate-100 flex items-center gap-2 mt-0.5">
                      <span>{savedUpload.fileName}</span>
                      <span className="text-[10px] text-emerald-300 font-normal">({activeDuties.length} Duties Saved)</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 rounded text-[11px] font-semibold flex items-center justify-center gap-1.5 transition-colors w-full sm:w-auto"
                  >
                    <Upload className="w-3.5 h-3.5 text-emerald-400" />
                    Upload Different Roster
                  </button>
                  <button
                    onClick={handleClearUploadedRoster}
                    id="btn-clear-uploaded-link-roster-banner"
                    className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded text-[11px] font-bold flex items-center justify-center gap-1.5 transition-colors shadow-sm w-full sm:w-auto"
                    title="Clear uploaded roster file and reset calculations"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Clear Uploaded Link Roster
                  </button>
                </div>
              </div>
            )}

            {/* Dotted Drag & Drop Box matching pyidline2crew-41022.web.app */}
            <div 
              onClick={() => fileInputRef.current?.click()}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-xl p-8 text-center flex flex-col items-center justify-center cursor-pointer transition-all ${
                isDragging 
                  ? 'border-emerald-500 bg-emerald-500/10' 
                  : 'border-slate-800 hover:border-emerald-500/50 bg-slate-950/40 hover:bg-slate-950/70'
              }`}
            >
              <input 
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                accept=".csv,.xlsx,.xls"
                className="hidden"
                id="roster-file-input"
              />
              <UploadCloud className="w-10 h-10 text-emerald-400 mb-2 animate-pulse" />
              <h4 className="text-xs font-bold text-slate-200 font-mono tracking-tight">
                {savedUpload ? `Click or drop to replace current Link Roster (${savedUpload.fileName})` : `Drag & Drop your Link Roster excel sheet, or click to browse`}
              </h4>
              <p className="text-[10px] text-slate-500 font-mono mt-1">
                Supports standard WEEKDAY, Monday/Wednesday/Sunday Link Roster layout (.xlsx)
              </p>
            </div>
          </div>

          {/* Table Container Header matching pyidline2crew-41022.web.app */}
          <div className="bg-slate-900 border border-slate-800 rounded p-4 shadow-md space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2 pb-2 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <h3 className="text-xs font-extrabold text-slate-200 uppercase tracking-wider font-mono">
                    CALCULATED LINK DUTIES
                  </h3>
                  <span className="text-[9px] font-bold font-mono px-2 py-0.5 bg-emerald-950 text-emerald-400 border border-emerald-800 rounded uppercase">
                    {activeDuties.length} DUTIES
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <div className="relative w-64">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-2 pointer-events-none text-slate-400">
                      <Search className="w-3 h-3" />
                    </span>
                    <input
                      type="text"
                      value={rosterSearch}
                      onChange={e => setRosterSearch(e.target.value)}
                      placeholder="Search duty number..."
                      className="w-full pl-7 pr-2 py-1 bg-slate-950 border border-slate-800 rounded text-slate-200 text-[10px] font-mono focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  {activeDuties.length > 0 && (
                    <button
                      onClick={handleClearUploadedRoster}
                      className="px-2.5 py-1 bg-rose-950 hover:bg-rose-900 border border-rose-800 text-rose-300 hover:text-rose-200 rounded text-[10px] font-bold font-mono transition-colors flex items-center gap-1 shrink-0 uppercase"
                      title="Clear all calculated data and start fresh for next uploaded roster"
                    >
                      <Trash2 className="w-3 h-3" />
                      Clear Data
                    </button>
                  )}
                </div>
              </div>

              {/* Table Grid matching pyidline2crew-41022.web.app columns */}
              <div className="overflow-x-auto border border-slate-850 rounded custom-scrollbar">
                <table className="w-full text-left text-[10px] border-collapse font-mono">
                  <thead className="bg-slate-950 text-slate-400 uppercase tracking-wider text-[9px]">
                    <tr>
                      <th className="px-3 py-2 border-b border-slate-800 w-16 text-center">DUTY #</th>
                      <th className="px-3 py-2 border-b border-slate-800">LEG 1 ROUTE (KM)</th>
                      <th className="px-3 py-2 border-b border-slate-800">LEG 2 ROUTE (KM)</th>
                      <th className="px-3 py-2 border-b border-slate-800">LEG 3 ROUTE (KM)</th>
                      <th className="px-3 py-2 border-b border-slate-800">LEG 4 ROUTE (KM)</th>
                      <th className="px-3 py-2 border-b border-slate-800 text-right text-emerald-400 font-bold w-24">TOTAL KM</th>
                      <th className="px-3 py-2 border-b border-slate-800 text-center w-24">ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-850">
                    {activeDuties.length === 0 ? (
                      <tr>
                        <td colSpan="7" className="py-12 text-center">
                          <div className="flex flex-col items-center justify-center space-y-3">
                            <div className="p-3 bg-slate-950 rounded-full border border-slate-800">
                              <FileSpreadsheet className="w-8 h-8 text-emerald-500" />
                            </div>
                            <div>
                              <h4 className="text-xs font-bold text-slate-200 font-mono uppercase tracking-wider">
                                NO LINK ROSTER UPLOADED
                              </h4>
                              <p className="text-[10px] text-slate-400 font-mono mt-1 max-w-md mx-auto">
                                Upload a Weekday/Monday/Sunday Link Roster Excel file to calculate Leg 1-4 and Total Kilometer summaries.
                              </p>
                            </div>
                            <div className="flex items-center gap-3 pt-2">
                              <button
                                onClick={() => fileInputRef.current?.click()}
                                className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-mono font-bold flex items-center gap-2 transition-colors shadow-md uppercase tracking-wider"
                              >
                                <Upload className="w-4 h-4" />
                                Upload Link Roster Excel
                              </button>
                              <button
                                onClick={handleLoadSampleRoster}
                                className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs font-mono font-semibold flex items-center gap-2 transition-colors border border-slate-700"
                              >
                                Load Benchmark Link Roster
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    ) : (
                    activeDuties
                      .filter(d => {
                        if (!rosterSearch) return true;
                        const q = rosterSearch.toLowerCase();
                        return (
                          String(d.dutyNo).toLowerCase().includes(q) ||
                          String(d.signOnLocation).toLowerCase().includes(q) ||
                          String(d.dutyType || '').toLowerCase().includes(q) ||
                          (d.trips || []).some(t => String(t.trainNo || '').toLowerCase().includes(q))
                        );
                      })
                      .map((duty, idx) => {
                        const isExpanded = expandedDutyNo === duty.dutyNo;
                        const isEditing = editingDutyNo === duty.dutyNo;
                        const leg1 = duty.trips?.[0];
                        const leg2 = duty.trips?.[1];
                        const leg3 = duty.trips?.[2];
                        const leg4 = duty.trips?.[3];

                        const formatRouteKmCell = (trip, legNum) => {
                          if (!trip || trip.isCounselling || (trip.calculatedKms === 0 && !trip.boardingStation && !trip.customPathStr)) {
                            return <span className="text-slate-500 font-mono">-- (0 KM)</span>;
                          }
                          const kms = trip.calculatedKms || 0;
                          let pathStr = trip.customPathStr || "";
                          if (!pathStr) {
                            if (trip.intermediateStations && trip.intermediateStations.length > 0) {
                              pathStr = trip.intermediateStations.join(" → ");
                            } else if (trip.boardingStation && trip.alightingStation) {
                              pathStr = `${trip.boardingStation} → ${trip.alightingStation}`;
                            } else {
                              pathStr = `${trip.takeoverLocation || 'PYID'} → ${trip.handoverLocation || 'PYID'}`;
                            }
                          }

                          return (
                            <div className="text-[10px] font-mono leading-relaxed truncate max-w-xs" title={`${pathStr} (${kms} KM)`}>
                              <span className="text-slate-300">{pathStr}</span>{' '}
                              <span className="text-cyan-400 font-bold">({kms} KM)</span>
                            </div>
                          );
                        };

                        if (isEditing) {
                          return (
                            <tr key={duty.id || `edit-duty-${duty.dutyNo}`} className="bg-emerald-950/40 border-l-4 border-emerald-500">
                              <td className="px-2 py-2 text-center text-slate-100 font-bold border-r border-slate-850">
                                {duty.dutyNo}
                              </td>
                              {/* Leg 1 Edit Inputs */}
                              <td className="px-2 py-1.5 border-r border-slate-850">
                                <div className="space-y-1 font-mono">
                                  <input
                                    type="text"
                                    value={editFormData.leg1Path || ''}
                                    onChange={e => setEditFormData({ ...editFormData, leg1Path: e.target.value })}
                                    placeholder="e.g. KGWA → PYID"
                                    className="w-full bg-slate-950 border border-slate-800 rounded px-1.5 py-0.5 text-[10px] text-slate-200"
                                  />
                                  <div className="flex items-center justify-between text-[9px]">
                                    <span className="text-slate-400">Leg 1 KM:</span>
                                    <input
                                      type="number"
                                      value={editFormData.leg1Km}
                                      onChange={e => setEditFormData({ ...editFormData, leg1Km: e.target.value })}
                                      className="w-16 bg-slate-950 border border-slate-800 rounded px-1 py-0.5 text-[10px] text-cyan-400 font-bold text-right"
                                    />
                                  </div>
                                </div>
                              </td>
                              {/* Leg 2 Edit Inputs */}
                              <td className="px-2 py-1.5 border-r border-slate-850">
                                <div className="space-y-1 font-mono">
                                  <input
                                    type="text"
                                    value={editFormData.leg2Path || ''}
                                    onChange={e => setEditFormData({ ...editFormData, leg2Path: e.target.value })}
                                    placeholder="e.g. PYID → BIET"
                                    className="w-full bg-slate-950 border border-slate-800 rounded px-1.5 py-0.5 text-[10px] text-slate-200"
                                  />
                                  <div className="flex items-center justify-between text-[9px]">
                                    <span className="text-slate-400">Leg 2 KM:</span>
                                    <input
                                      type="number"
                                      value={editFormData.leg2Km}
                                      onChange={e => setEditFormData({ ...editFormData, leg2Km: e.target.value })}
                                      className="w-16 bg-slate-950 border border-slate-800 rounded px-1 py-0.5 text-[10px] text-cyan-400 font-bold text-right"
                                    />
                                  </div>
                                </div>
                              </td>
                              {/* Leg 3 Edit Inputs */}
                              <td className="px-2 py-1.5 border-r border-slate-850">
                                <div className="space-y-1 font-mono">
                                  <input
                                    type="text"
                                    value={editFormData.leg3Path || ''}
                                    onChange={e => setEditFormData({ ...editFormData, leg3Path: e.target.value })}
                                    placeholder="e.g. BIET → APTS"
                                    className="w-full bg-slate-950 border border-slate-800 rounded px-1.5 py-0.5 text-[10px] text-slate-200"
                                  />
                                  <div className="flex items-center justify-between text-[9px]">
                                    <span className="text-slate-400">Leg 3 KM:</span>
                                    <input
                                      type="number"
                                      value={editFormData.leg3Km}
                                      onChange={e => setEditFormData({ ...editFormData, leg3Km: e.target.value })}
                                      className="w-16 bg-slate-950 border border-slate-800 rounded px-1 py-0.5 text-[10px] text-cyan-400 font-bold text-right"
                                    />
                                  </div>
                                </div>
                              </td>
                              {/* Leg 4 Edit Inputs */}
                              <td className="px-2 py-1.5 border-r border-slate-850">
                                <div className="space-y-1 font-mono">
                                  <input
                                    type="text"
                                    value={editFormData.leg4Path || ''}
                                    onChange={e => setEditFormData({ ...editFormData, leg4Path: e.target.value })}
                                    placeholder="e.g. --"
                                    className="w-full bg-slate-950 border border-slate-800 rounded px-1.5 py-0.5 text-[10px] text-slate-200"
                                  />
                                  <div className="flex items-center justify-between text-[9px]">
                                    <span className="text-slate-400">Leg 4 KM:</span>
                                    <input
                                      type="number"
                                      value={editFormData.leg4Km}
                                      onChange={e => setEditFormData({ ...editFormData, leg4Km: e.target.value })}
                                      className="w-16 bg-slate-950 border border-slate-800 rounded px-1 py-0.5 text-[10px] text-cyan-400 font-bold text-right"
                                    />
                                  </div>
                                </div>
                              </td>
                              {/* Total KM Edit Input */}
                              <td className="px-2 py-1.5 border-r border-slate-850 text-right">
                                <div className="space-y-1 font-mono text-right">
                                  <span className="text-[9px] text-slate-400 block">Total KM:</span>
                                  <input
                                    type="number"
                                    value={editFormData.totalKm}
                                    onChange={e => setEditFormData({ ...editFormData, totalKm: e.target.value })}
                                    className="w-20 bg-slate-950 border border-emerald-600 rounded px-1.5 py-1 text-xs text-emerald-400 font-extrabold text-right"
                                  />
                                </div>
                              </td>
                              {/* Edit Action Buttons */}
                              <td className="px-2 py-2 text-center">
                                <div className="flex flex-col gap-1">
                                  <button
                                    onClick={() => handleSaveEditDuty(duty.dutyNo)}
                                    className="px-2 py-0.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-[9px] font-bold uppercase transition-colors"
                                  >
                                    Save
                                  </button>
                                  <button
                                    onClick={() => setEditingDutyNo(null)}
                                    className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[9px] font-medium transition-colors"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        }

                        return (
                          <React.Fragment key={duty.id || `duty-${duty.dutyNo || 'row'}-${idx}`}>
                            <tr 
                              className={`hover:bg-slate-850/60 transition-colors ${isExpanded ? 'bg-slate-950/80' : ''} ${duty.isManuallyEdited ? 'border-l-2 border-amber-400' : ''}`}
                            >
                              <td 
                                onClick={() => setExpandedDutyNo(isExpanded ? null : duty.dutyNo)}
                                className="px-3 py-2 text-slate-100 font-bold text-center border-r border-slate-850 cursor-pointer"
                              >
                                <div className="flex items-center justify-center gap-1">
                                  <span>{duty.dutyNo}</span>
                                  {duty.isManuallyEdited && (
                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400" title="Manually edited duty" />
                                  )}
                                </div>
                              </td>
                              <td 
                                onClick={() => setExpandedDutyNo(isExpanded ? null : duty.dutyNo)}
                                className="px-3 py-2 text-slate-300 border-r border-slate-850 cursor-pointer"
                              >
                                {formatRouteKmCell(leg1, 1)}
                              </td>
                              <td 
                                onClick={() => setExpandedDutyNo(isExpanded ? null : duty.dutyNo)}
                                className="px-3 py-2 text-slate-300 border-r border-slate-850 cursor-pointer"
                              >
                                {formatRouteKmCell(leg2, 2)}
                              </td>
                              <td 
                                onClick={() => setExpandedDutyNo(isExpanded ? null : duty.dutyNo)}
                                className="px-3 py-2 text-slate-300 border-r border-slate-850 cursor-pointer"
                              >
                                {formatRouteKmCell(leg3, 3)}
                              </td>
                              <td 
                                onClick={() => setExpandedDutyNo(isExpanded ? null : duty.dutyNo)}
                                className="px-3 py-2 text-slate-300 border-r border-slate-850 cursor-pointer"
                              >
                                {formatRouteKmCell(leg4, 4)}
                              </td>
                              <td 
                                onClick={() => setExpandedDutyNo(isExpanded ? null : duty.dutyNo)}
                                className="px-3 py-2 text-right text-xs font-black text-emerald-400 cursor-pointer"
                              >
                                {duty.kms} KM
                              </td>
                              <td className="px-2 py-2 text-center">
                                <div className="flex items-center justify-center gap-1">
                                  <button
                                    onClick={() => handleStartEditDuty(duty)}
                                    className="px-2 py-1 bg-slate-800 hover:bg-emerald-900/60 border border-slate-700 hover:border-emerald-700 text-slate-300 hover:text-emerald-300 rounded text-[9px] font-bold transition-colors uppercase"
                                    title="Manually edit leg routes and kilometers"
                                  >
                                    Edit
                                  </button>
                                  {duty.isManuallyEdited && (
                                    <button
                                      onClick={() => handleResetDutyOverride(duty.dutyNo)}
                                      className="px-1.5 py-1 bg-rose-950 hover:bg-rose-900 border border-rose-800 text-rose-300 rounded text-[9px] transition-colors"
                                      title="Reset to WTT calculated values"
                                    >
                                      Reset
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>

                          {/* Expanded Trips / Segments Breakdown */}
                          {isExpanded && (
                            <tr className="bg-slate-950/70">
                              <td colSpan={6} className="p-3 border-t border-slate-850">
                                <div className="space-y-2">
                                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono flex items-center justify-between">
                                    <div className="flex items-center gap-1.5">
                                      <FileText className="w-3.5 h-3.5 text-emerald-400" />
                                      Trip Segments Breakdown for Duty {duty.dutyNo}:
                                    </div>
                                    {duty.dutyNo === "4" && (
                                      <span className="text-[9px] text-emerald-400 font-bold bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-800">
                                        Leg 1: Depot → PYID (Rd3) → PUTH BE → PYID (UP) (44 KM)
                                      </span>
                                    )}
                                  </div>
                                  
                                  {duty.trips && duty.trips.length > 0 ? (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                      {duty.trips.map((trip, tIdx) => {
                                        const isShort = trip.isShortLoop || trip.isUnderlined;
                                        const isDn = trip.isDnLine || trip.isBoldedTime;
                                        const isCouns = trip.isCounselling;

                                        return (
                                          <div key={tIdx} className="bg-slate-900 border border-slate-800 rounded p-2 text-[10px] font-mono space-y-1">
                                            <div className="flex justify-between items-center text-slate-200 border-b border-slate-800 pb-1 flex-wrap gap-1">
                                              <div className="flex items-center gap-1.5">
                                                <span className={`font-bold ${isShort ? 'underline decoration-emerald-400 decoration-2 text-emerald-300' : 'text-cyan-400'}`}>
                                                  Trip {tIdx + 1}: Train {trip.trainNo}
                                                </span>
                                                {isShort && (
                                                  <span className="px-1.5 py-0.2 bg-emerald-950 text-emerald-400 border border-emerald-800 rounded text-[8px] uppercase">
                                                    Short Loop
                                                  </span>
                                                )}
                                                {isCouns && (
                                                  <span className="px-1.5 py-0.2 bg-slate-800 text-slate-400 border border-slate-700 rounded text-[8px] uppercase">
                                                    Counselling Excluded (0 KM)
                                                  </span>
                                                )}
                                              </div>
                                              <span className="text-emerald-400 font-bold">{trip.calculatedKms || 0} KM</span>
                                            </div>
                                            <div className="text-slate-400 flex justify-between flex-wrap gap-1">
                                              <span>
                                                Board: {trip.takeoverLocation}{' '}
                                                <span className={isDn ? 'font-black text-amber-300 underline' : ''}>
                                                  ({trip.timeFrm || '--'})
                                                </span>
                                                {isDn && (
                                                  <span className="ml-1 px-1 py-0.2 bg-amber-950 text-amber-300 border border-amber-800 rounded text-[8px] uppercase">
                                                    DN Line
                                                  </span>
                                                )}
                                              </span>
                                              <span>
                                                Deboard: {trip.handoverLocation}{' '}
                                                <span className={isDn ? 'font-black text-amber-300 underline' : ''}>
                                                  ({trip.timeTo || '--'})
                                                </span>
                                              </span>
                                            </div>
                                            {trip.segments && trip.segments.length > 0 && (
                                              <div className="text-[9px] text-slate-500 pt-0.5">
                                                Segments: {trip.segments.map(s => `${s.fromStationCode}→${s.toStationCode} (${s.calculatedKms}km)`).join(', ')}
                                              </div>
                                            )}
                                          </div>
                                        )
                                      })}
                                    </div>
                                  ) : (
                                    <div className="text-[10px] text-slate-500 italic">No train trips recorded for this duty (Standby / PRO).</div>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      )
                    })
                    )}
                  </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : activeTab === 'custom' ? (
        <div className="space-y-3.5">
          {/* Interactive Serpentine Grid Map Card */}
          <div className="bg-slate-900 border border-slate-800 rounded p-4 shadow-md" id="interactive-railway-tracks-card">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-3.5 pb-2.5 border-b border-slate-800/80">
              <div>
                <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5 font-mono">
                  <Compass className="w-4 h-4 text-emerald-400 animate-pulse" />
                  BMRCL Green Line Dual Parallel Tracks
                </h3>
                <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                  Top track is <span className="text-emerald-400 font-bold">UP Line (Northbound to BIET)</span>. Bottom track is <span className="text-cyan-400 font-bold">DOWN Line (Southbound to APTS)</span>.
                </p>
              </div>

              {/* View Control Toolbar for Mobile & Laptop */}
              <div className="flex flex-wrap items-center gap-2 text-[9px] font-mono">
                <div className="flex items-center bg-slate-955 border border-slate-800 rounded-lg p-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      setTrackViewMode('FIT');
                      setZoomLevel(100);
                    }}
                    className={`px-2 py-1 rounded font-bold transition flex items-center gap-1 cursor-pointer ${
                      trackViewMode === 'FIT' 
                        ? 'bg-emerald-600 text-slate-955 shadow' 
                        : 'text-slate-400 hover:text-white'
                    }`}
                    title="Auto-fit view for Mobile / Laptop screen width"
                  >
                    <Maximize2 className="w-3 h-3" />
                    <span>Auto-Fit Screen</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setTrackViewMode('SCROLL')}
                    className={`px-2 py-1 rounded font-bold transition flex items-center gap-1 cursor-pointer ${
                      trackViewMode === 'SCROLL' 
                        ? 'bg-emerald-600 text-slate-955 shadow' 
                        : 'text-slate-400 hover:text-white'
                    }`}
                    title="Full detail horizontal scroll view"
                  >
                    <Smartphone className="w-3 h-3" />
                    <span>Scroll Detail</span>
                  </button>
                </div>

                <div className="flex items-center bg-slate-955 border border-slate-800 rounded-lg px-1.5 py-0.5 gap-1">
                  <button
                    type="button"
                    onClick={() => setZoomLevel(prev => Math.max(60, prev - 15))}
                    className="p-1 text-slate-400 hover:text-emerald-400 font-bold text-xs cursor-pointer"
                    title="Zoom Out"
                  >
                    -
                  </button>
                  <span className="text-slate-300 font-bold px-1 text-[10px]">{zoomLevel}%</span>
                  <button
                    type="button"
                    onClick={() => setZoomLevel(prev => Math.min(180, prev + 15))}
                    className="p-1 text-slate-400 hover:text-emerald-400 font-bold text-xs cursor-pointer"
                    title="Zoom In"
                  >
                    +
                  </button>
                </div>

                <button
                  id="btn-reset-selection"
                  onClick={clearSequence}
                  className="px-2.5 py-1 bg-red-600 hover:bg-red-500 text-white font-bold font-mono text-[10px] rounded transition-all shadow-md shadow-red-950 flex items-center gap-1 uppercase tracking-wider cursor-pointer"
                >
                  <Trash2 className="w-3 h-3 text-white" />
                  CLEAR SELECTION
                </button>
              </div>
            </div>

            {/* Responsive Adaptive SVG Track Map Container */}
            <div className="w-full overflow-x-auto custom-scrollbar transition-all duration-300">
              <div 
                className={`${
                  trackViewMode === 'FIT' ? 'w-full min-w-0' : 'min-w-[1020px]'
                } select-none py-1 transition-all duration-300`}
                style={{
                  transform: zoomLevel !== 100 ? `scale(${zoomLevel / 100})` : 'none',
                  transformOrigin: 'top left'
                }}
              >
                <svg 
                  viewBox="0 0 1020 320" 
                  preserveAspectRatio="xMidYMid meet"
                  className="w-full h-auto bg-slate-955/60 rounded-xl border border-slate-800 p-2 shadow-inner"
                >
                  <defs>
                    <filter id="glow-up-line" x="-10%" y="-10%" width="120%" height="120%">
                      <feGaussianBlur stdDeviation="3" result="blur" />
                      <feMerge>
                        <feMergeNode in="blur" />
                        <feMergeNode in="SourceGraphic" />
                      </feMerge>
                    </filter>
                    <filter id="glow-dn-line" x="-10%" y="-10%" width="120%" height="120%">
                      <feGaussianBlur stdDeviation="3" result="blur" />
                      <feMerge>
                        <feMergeNode in="blur" />
                        <feMergeNode in="SourceGraphic" />
                      </feMerge>
                    </filter>
                    <filter id="glow-active-halo" x="-30%" y="-30%" width="160%" height="160%">
                      <feGaussianBlur stdDeviation="4" result="blur" />
                      <feColorMatrix type="matrix" values="0 0 0 0 0.06   0 0 0 0 0.71   0 0 0 0 0.84  0 0 0 1 0" />
                      <feMerge>
                        <feMergeNode in="blur" />
                        <feMergeNode in="SourceGraphic" />
                      </feMerge>
                    </filter>
                  </defs>

                  {/* Parallel Tracks Grid Lines in the background */}
                  <g stroke="#1e293b" strokeWidth="0.5" strokeDasharray="5 5">
                    <line x1="40" y1="60" x2="980" y2="60" />
                    <line x1="40" y1="160" x2="980" y2="160" />
                    <line x1="40" y1="260" x2="980" y2="260" />
                    {/* Depot guide line */}
                    <line x1="555" y1="20" x2="555" y2="60" />
                    {/* Pocket track guidelines */}
                    <line x1="270" y1="20" x2="270" y2="60" />
                    <line x1="915" y1="120" x2="915" y2="160" />
                    <line x1="200" y1="120" x2="200" y2="160" />
                  </g>

                  {/* DEPOT BRANCH BACKGROUND TRACKS (DOWN Track - Cyan) */}
                  <g>
                    <line x1="510" y1="66" x2="555" y2="26" stroke="#0284c7" strokeWidth="3.5" strokeLinecap="round" className="opacity-40" />
                    <line x1="555" y1="26" x2="600" y2="66" stroke="#0284c7" strokeWidth="3.5" strokeLinecap="round" className="opacity-40" />
                    <line x1="510" y1="66" x2="555" y2="26" stroke="#38bdf8" strokeWidth="1.5" strokeLinecap="round" style={{ filter: 'url(#glow-dn-line)' }} />
                    <line x1="555" y1="26" x2="600" y2="66" stroke="#38bdf8" strokeWidth="1.5" strokeLinecap="round" style={{ filter: 'url(#glow-dn-line)' }} />
                  </g>

                  {/* DEPOT BRANCH BACKGROUND TRACKS (UP Track - Emerald) */}
                  <g>
                    <line x1="510" y1="54" x2="555" y2="14" stroke="#047857" strokeWidth="3.5" strokeLinecap="round" className="opacity-40" />
                    <line x1="555" y1="14" x2="600" y2="54" stroke="#047857" strokeWidth="3.5" strokeLinecap="round" className="opacity-40" />
                    <line x1="510" y1="54" x2="555" y2="14" stroke="#34d399" strokeWidth="1.5" strokeLinecap="round" style={{ filter: 'url(#glow-up-line)' }} />
                    <line x1="555" y1="14" x2="600" y2="54" stroke="#34d399" strokeWidth="1.5" strokeLinecap="round" style={{ filter: 'url(#glow-up-line)' }} />
                  </g>

                  {/* NGSA_PT (NGSA PKT) BRANCH SIDING TRACKS */}
                  <g>
                    {/* DOWN Track (Cyan) */}
                    <line x1="270" y1="26" x2="330" y2="66" stroke="#0284c7" strokeWidth="3.5" strokeLinecap="round" className="opacity-40" />
                    <line x1="270" y1="26" x2="330" y2="66" stroke="#38bdf8" strokeWidth="1.5" strokeLinecap="round" style={{ filter: 'url(#glow-dn-line)' }} />
                    {/* UP Track (Emerald) */}
                    <line x1="270" y1="14" x2="330" y2="54" stroke="#047857" strokeWidth="3.5" strokeLinecap="round" className="opacity-40" />
                    <line x1="270" y1="14" x2="330" y2="54" stroke="#34d399" strokeWidth="1.5" strokeLinecap="round" style={{ filter: 'url(#glow-up-line)' }} />
                  </g>

                  {/* MHLI_PT (MHLI PKT) BRANCH SIDING TRACKS */}
                  <g>
                    {/* DOWN Track (Cyan) */}
                    <line x1="960" y1="166" x2="915" y2="126" stroke="#0284c7" strokeWidth="3.5" strokeLinecap="round" className="opacity-40" />
                    <line x1="960" y1="166" x2="915" y2="126" stroke="#38bdf8" strokeWidth="1.5" strokeLinecap="round" style={{ filter: 'url(#glow-dn-line)' }} />
                    {/* UP Track (Emerald) */}
                    <line x1="960" y1="154" x2="915" y2="114" stroke="#047857" strokeWidth="3.5" strokeLinecap="round" className="opacity-40" />
                    <line x1="960" y1="154" x2="915" y2="114" stroke="#34d399" strokeWidth="1.5" strokeLinecap="round" style={{ filter: 'url(#glow-up-line)' }} />
                  </g>

                  {/* NLC_PT (NLC PKT) BRANCH SIDING TRACKS */}
                  <g>
                    {/* DOWN Track (Cyan) */}
                    <line x1="240" y1="166" x2="200" y2="126" stroke="#0284c7" strokeWidth="3.5" strokeLinecap="round" className="opacity-40" />
                    <line x1="240" y1="166" x2="200" y2="126" stroke="#38bdf8" strokeWidth="1.5" strokeLinecap="round" style={{ filter: 'url(#glow-dn-line)' }} />
                    {/* UP Track (Emerald) */}
                    <line x1="240" y1="154" x2="200" y2="114" stroke="#047857" strokeWidth="3.5" strokeLinecap="round" className="opacity-40" />
                    <line x1="240" y1="154" x2="200" y2="114" stroke="#34d399" strokeWidth="1.5" strokeLinecap="round" style={{ filter: 'url(#glow-up-line)' }} />
                  </g>

                  {/* DOWN TRACK PATH (Offset +6px - cyan) */}
                  <path
                    d="M 54 66 H 966 A 50 50 0 0 1 966 166 H 54 A 50 50 0 0 0 54 266 H 966"
                    fill="none"
                    stroke="#0284c7"
                    strokeWidth="3.5"
                    strokeLinecap="round"
                    className="opacity-40"
                  />
                  <path
                    d="M 54 66 H 966 A 50 50 0 0 1 966 166 H 54 A 50 50 0 0 0 54 266 H 966"
                    fill="none"
                    stroke="#38bdf8"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    style={{ filter: 'url(#glow-dn-line)' }}
                  />

                  {/* UP TRACK PATH (Offset -6px - emerald) */}
                  <path
                    d="M 66 54 H 954 A 50 50 0 0 1 954 154 H 66 A 50 50 0 0 0 66 254 H 954"
                    fill="none"
                    stroke="#047857"
                    strokeWidth="3.5"
                    strokeLinecap="round"
                    className="opacity-40"
                  />
                  <path
                    d="M 66 54 H 954 A 50 50 0 0 1 954 154 H 66 A 50 50 0 0 0 66 254 H 954"
                    fill="none"
                    stroke="#34d399"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    style={{ filter: 'url(#glow-up-line)' }}
                  />

                  {/* Active Highlight Connection Paths */}
                  {selectedSequence.length >= 2 && selectedSequence.map((code, sIdx) => {
                    if (sIdx === selectedSequence.length - 1) return null;
                    const fromCode = selectedSequence[sIdx];
                    const toCode = selectedSequence[sIdx + 1];

                    const fromNode = MAP_STATIONS.find(n => n.code === fromCode);
                    const toNode = MAP_STATIONS.find(n => n.code === toCode);
                    if (!fromNode || !toNode) return null;

                    // Determine if travel is increasing chainage (DOWN) or decreasing (UP)
                    const fromStn = stations.find(s => s.code === fromCode);
                    const toStn = stations.find(s => s.code === toCode);
                    const isDown = fromStn && toStn ? toStn.chainage > fromStn.chainage : true;

                    // Depending on direction, we draw the path offset corresponding to UP (-6) or DOWN (+6) track line!
                    const yOffset = isDown ? 6 : -6;

                    return (
                      <line
                        key={`line-hl-${sIdx}`}
                        x1={fromNode.x}
                        y1={fromNode.y + yOffset}
                        x2={toNode.x}
                        y2={toNode.y + yOffset}
                        stroke={isDown ? '#06b6d4' : '#10b981'}
                        strokeWidth="4"
                        strokeDasharray="6 4"
                        className="animate-pulse"
                      />
                    );
                  })}

                  {/* Station Nodes & Text Labels */}
                  {MAP_STATIONS.map((stn, index) => {
                    const matchedStn = stations.find(s => s.code === stn.code);
                    const chainage = matchedStn?.chainage ?? 0.0;
                    
                    // Check if this station is selected in the sequence
                    const selectionIndices = [];
                    selectedSequence.forEach((code, idx) => {
                      if (code === stn.code) {
                        selectionIndices.push(idx);
                      }
                    });

                    const isSelected = selectionIndices.length > 0;
                    const isHovered = hoveredStation?.code === stn.code;

                    return (
                      <g
                        key={stn.code}
                        className="cursor-pointer"
                        onMouseEnter={() => setHoveredStation({ ...stn, name: matchedStn?.name ?? 'Unknown', chainage })}
                        onMouseLeave={() => setHoveredStation(null)}
                        onClick={() => handleStationClick(stn.code)}
                      >
                        {/* Selected halo ring logic */}
                        {isSelected && (
                          <circle
                            cx={stn.x}
                            cy={stn.y}
                            r="16"
                            fill="none"
                            stroke="#06b6d4"
                            strokeWidth="2.5"
                            style={{ filter: 'url(#glow-active-halo)' }}
                            className="animate-ping opacity-60"
                          />
                        )}

                        {/* Outer interactive ring */}
                        <circle
                          cx={stn.x}
                          cy={stn.y}
                          r={isHovered ? '13' : '9'}
                          fill="#030712"
                          stroke={isHovered ? '#10b981' : isSelected ? '#06b6d4' : '#475569'}
                          strokeWidth="2.5"
                          className="transition-all duration-150"
                        />

                        {/* Center dot */}
                        <circle
                          cx={stn.x}
                          cy={stn.y}
                          r={isHovered ? '6' : '4'}
                          fill={isSelected ? '#06b6d4' : '#10b981'}
                          className="transition-all duration-150"
                        />

                        {/* Selection badges count overlay (e.g., ❶, ❷, ❸) */}
                        {isSelected && (
                          <g>
                            <circle
                              cx={stn.x + 8}
                              cy={stn.y - 8}
                              r="7"
                              fill="#06b6d4"
                            />
                            <text
                              x={stn.x + 8}
                              y={stn.y - 5.5}
                              textAnchor="middle"
                              fill="#030712"
                              fontSize="8"
                              fontWeight="black"
                              fontFamily="monospace"
                            >
                              {selectionIndices[0] + 1}
                            </text>
                          </g>
                        )}

                        {/* Station Text Label */}
                        <text
                          x={stn.x}
                          y={stn.labelPos === 'below' ? stn.y + 22 : stn.y - 15}
                          textAnchor="middle"
                          fill={isSelected ? '#38bdf8' : isHovered ? '#34d399' : '#cbd5e1'}
                          fontSize="9"
                          fontWeight="bold"
                          fontFamily="monospace"
                        >
                          {stn.displayCode}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              </div>
            </div>

            {/* Hover Tooltip Information bar inside SVG Card */}
            <div className="bg-slate-950/40 border border-slate-950 rounded p-2.5 mt-3 flex items-center justify-between text-[11px] font-mono min-h-[38px]">
              {hoveredStation ? (
                <div className="flex items-center gap-4 text-slate-300 w-full justify-between">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                    <span>Station: <span className="text-slate-100 font-bold">{hoveredStation.name} ({hoveredStation.displayCode})</span></span>
                  </div>
                  <div>
                    <span>Chainage Coordinate: <span className="text-emerald-400 font-bold">{hoveredStation.chainage >= 0 ? `+${hoveredStation.chainage.toFixed(3)}` : hoveredStation.chainage.toFixed(3)} KM</span></span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 italic">Click to insert into route sheet</span>
                  </div>
                </div>
              ) : (
                <div className="text-slate-500 italic text-center w-full">
                  Hover over any station node on the serpentine grid to view coordinates. Click nodes to build a live routing path!
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5">
            {/* Sequence Selector Column */}
            <div className="lg:col-span-6 bg-slate-900 border border-slate-800 rounded p-4 shadow-md space-y-3.5 flex flex-col justify-between">
              <div>
                <div className="flex justify-between items-center mb-3">
                  <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5 font-mono">
                    <MapPin className="w-3.5 h-3.5 text-emerald-500" />
                    Trip Segment Station Sequence
                  </h3>
                  <button
                    id="btn-clear-calculator"
                    onClick={clearSequence}
                    className="bg-red-600/20 hover:bg-red-600/40 text-red-400 border border-red-500/50 px-2.5 py-1 rounded text-[10px] font-mono font-bold transition-all flex items-center gap-1 cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3 text-red-400" />
                    <span>Clear All</span>
                  </button>
                </div>

                <div className="space-y-2 max-h-60 overflow-y-auto pr-1.5 custom-scrollbar">
                  {selectedSequence.map((currentCode, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded bg-slate-950 border border-slate-800 flex items-center justify-center font-mono font-bold text-[10px] text-slate-400 shrink-0">
                        {index + 1}
                      </div>

                      <div className="flex-1">
                        <select name="routecalculator-i1"
                          id={`select-sequence-${index}`}
                          value={currentCode}
                          onChange={e => updateStationInSequence(index, e.target.value)}
                          className="w-full px-2 py-1 bg-slate-950 border border-slate-800 rounded text-slate-100 text-[11px] font-mono focus:outline-none focus:border-emerald-500"
                        >
                          <option value="">-- Choose Station / Point --</option>
                          {stations.map(stn => (
                            <option key={stn.id} value={stn.code}>
                              {stn.code} - {stn.name} ({stn.chainage >= 0 ? `+${stn.chainage.toFixed(3)}` : stn.chainage.toFixed(3)} KM)
                            </option>
                          ))}
                        </select>
                      </div>

                      <button
                        id={`btn-remove-seq-${index}`}
                        disabled={selectedSequence.length <= 1}
                        onClick={() => removeStationFromSequence(index)}
                        className="p-1 hover:bg-slate-850 rounded text-slate-500 hover:text-red-400 disabled:opacity-30 disabled:pointer-events-none transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}

                  {selectedSequence.length === 0 && (
                    <div className="border border-dashed border-slate-800 rounded p-6 text-center text-slate-500 italic text-[11px]">
                      Your route sequence sheet is currently empty. Click on any station node on the map above to select at least 3 stations!
                    </div>
                  )}
                </div>

                <button
                  id="btn-add-station-seq"
                  onClick={addStationToSequence}
                  className="mt-3 w-full py-1.5 border border-dashed border-slate-800 hover:border-emerald-500/50 hover:bg-emerald-500/5 rounded text-[11px] font-mono font-semibold text-slate-400 hover:text-emerald-400 transition flex items-center justify-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Route Stop
                </button>
              </div>

              {/* Validation Warning */}
              <div className="bg-slate-950 border border-slate-800/80 rounded p-3 flex items-start gap-2.5 text-[10px] font-mono text-slate-400">
                <HelpCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-slate-300 uppercase tracking-wider text-[9px]">Station Integrity Protocol</p>
                  <p className="mt-0.5 leading-relaxed text-slate-500">
                    Calculations are absolute differences between chainages. Ensure sequence follows logical physical crossovers.
                  </p>
                </div>
              </div>
            </div>

            {/* Results Sheet Column */}
            <div className="lg:col-span-6 bg-slate-900 border border-slate-800 rounded p-4 shadow-md flex flex-col justify-between">
              <div className="space-y-3.5">
                <div className="flex justify-between items-center">
                  <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider font-mono">
                    Distance Calculation Sheet
                  </h3>
                  <span className="text-[10px] font-mono text-slate-400 bg-slate-955 px-2 py-0.5 rounded border border-slate-800">
                    Segments: {segments.length}
                  </span>
                </div>

                {/* Grand Totals at Top */}
                <div className="bg-slate-955 border border-slate-800 rounded-xl p-3.5 space-y-2.5 shadow-inner">
                  <div className="flex justify-between items-baseline border-b border-slate-850 pb-2">
                    <span className="text-slate-400 font-mono text-[11px] uppercase font-bold">Precise Actual Kms:</span>
                    <span className="font-mono text-base font-bold text-slate-100">{totalDistance.toFixed(3)} KM</span>
                  </div>
                  <div className="flex justify-between items-baseline">
                    <span className="text-slate-400 font-mono text-[11px] uppercase font-bold">Round Off Kms:</span>
                    <span className="font-mono text-2xl font-black text-emerald-400">{Math.round(totalDistance)} KM</span>
                  </div>

                  <div className="bg-emerald-950/20 border border-emerald-500/20 rounded p-2 text-[10px] font-mono text-emerald-300 flex items-center gap-1.5 mt-1">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                    <span>BMRCL OCC distance parameters applied.</span>
                  </div>
                </div>

                {/* Segments list */}
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1 custom-scrollbar">
                  {segments.map((seg, idx) => {
                    const fromStn = stations.find(s => s.code === seg.from);
                    const toStn = stations.find(s => s.code === seg.to);

                    return (
                      <div key={idx} className="bg-slate-955 rounded p-2.5 border border-slate-850 flex justify-between items-center text-[11px] font-mono">
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5 text-slate-300 font-bold">
                            <span>{seg.from}</span>
                            <ArrowRight className="w-3 h-3 text-emerald-500" />
                            <span>{seg.to}</span>
                          </div>
                          
                          {/* Live Direction Engine Indicator */}
                          <div className="flex items-center gap-1.5">
                            {seg.direction === 'DOWN' ? (
                              <span className="px-1.5 py-0.2 bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 rounded text-[8px] font-bold flex items-center gap-0.5">
                                <ArrowDownRight className="w-2.5 h-2.5" />
                                DOWN LINE (Southbound)
                              </span>
                            ) : seg.direction === 'UP' ? (
                              <span className="px-1.5 py-0.2 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded text-[8px] font-bold flex items-center gap-0.5">
                                <ArrowUpRight className="w-2.5 h-2.5" />
                                UP LINE (Northbound)
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.2 bg-slate-800 text-slate-500 rounded text-[8px] font-bold">
                                STATIONARY BUFFER
                              </span>
                            )}
                          </div>

                          <div className="text-[9px] text-slate-600">
                            |{toStn?.chainage ?? 0} - {fromStn?.chainage ?? 0}|
                          </div>
                        </div>
                        <div className="font-mono text-emerald-400 font-bold text-xs">{seg.distance.toFixed(3)} KM</div>
                      </div>
                    );
                  })}
                  {segments.length === 0 && (
                    <p className="text-[11px] font-mono text-slate-500 italic text-center py-8">
                      Select at least two stations on the map to evaluate segments and directions.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Predefined Reference Table */
        <div className="bg-slate-900 border border-slate-800 rounded p-4 shadow-md">
          <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-3 font-mono">
            BMRCL Standard Pre-calculated Trips List
          </h3>
          <div className="overflow-x-auto border border-slate-850 rounded">
            <table className="w-full text-left text-[11px] border-collapse font-mono">
              <thead className="bg-slate-950 text-slate-400 uppercase tracking-wider sticky top-0 text-[10px]">
                <tr>
                  <th className="px-3 py-2 border-b border-slate-800">Trip Pattern / Description</th>
                  <th className="px-3 py-2 border-b border-slate-800 text-right">Actual Kms</th>
                  <th className="px-3 py-2 border-b border-slate-800 text-right">Round Off Kms</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-850">
                {PREDEFINED_TRIPS.map((pt, idx) => (
                  <tr key={idx} className="hover:bg-slate-850/40 transition-colors">
                    <td className="px-3 py-2 text-slate-300 font-medium font-sans">{pt.description}</td>
                    <td className="px-3 py-2 text-right text-slate-400">
                      {pt.actualKms ? `${pt.actualKms.toFixed(3)} KM` : '-'}
                    </td>
                    <td className="px-3 py-2 text-right font-bold text-emerald-400">
                      {pt.roundedKms} KM
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
