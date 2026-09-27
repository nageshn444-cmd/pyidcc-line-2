import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Calendar, CheckCircle, Clock, MapPin, Search, RefreshCw, 
  Eye, Download, Share2, ShieldCheck, AlertCircle, Sparkles, 
  ChevronRight, ChevronLeft, User, Award, Radio, FileSpreadsheet, X, Check, Filter
} from 'lucide-react';
import { db } from '../../firebase';
import { doc, collection, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';
import { 
  getRolling7Days, 
  toDateIsoStr, 
  getScheduleTypeFromDate, 
  MONTH_NAMES_SHORT, 
  DAY_NAMES_FULL, 
  DAY_NAMES_SHORT 
} from '../../utils/rosterDateUtils';
import { useAuth } from '../../context/AuthContext';
import { resolveRealOperatorName } from '../../services/RosterAutoClassifierService';

export default function OfficialGccRosterSheetView({
  currentOperatorId = null,
  userRole = 'TRAIN_OPERATOR',
  initialDateStr = null,
  onClose = null,
  isModal = false
}) {
  const { userProfile } = useAuth();
  const rollingDays = useMemo(() => getRolling7Days(new Date()), []);
  
  // Active selected date string (defaults to initialDateStr or Today)
  const [currentSelectedDateStr, setCurrentSelectedDateStr] = useState(() => {
    if (initialDateStr) return initialDateStr;
    return toDateIsoStr(new Date());
  });

  // Keep date synced if parent prop initialDateStr changes
  useEffect(() => {
    if (initialDateStr) {
      setCurrentSelectedDateStr(initialDateStr);
    }
  }, [initialDateStr]);

  // Dynamically compute day object for ANY date (rolling 7 days or any advance/past date)
  const activeDayObj = useMemo(() => {
    const found = rollingDays.find(d => d.dateStr === currentSelectedDateStr);
    if (found) return found;

    const d = new Date(currentSelectedDateStr);
    const validDate = isNaN(d.getTime()) ? new Date() : d;
    const year = validDate.getFullYear();
    const monthIdx = validDate.getMonth();
    const dayOfMonth = validDate.getDate();
    const dayOfWeekIdx = validDate.getDay();
    const scheduleType = getScheduleTypeFromDate(validDate);
    const dayName = DAY_NAMES_FULL[dayOfWeekIdx];
    const shortDay = DAY_NAMES_SHORT[dayOfWeekIdx];
    const monthShort = MONTH_NAMES_SHORT[monthIdx];
    const todayStr = toDateIsoStr(new Date());
    const tomorrowDate = new Date();
    tomorrowDate.setDate(tomorrowDate.getDate() + 1);
    const tomorrowStr = toDateIsoStr(tomorrowDate);
    const dayAfterTomorrowDate = new Date();
    dayAfterTomorrowDate.setDate(dayAfterTomorrowDate.getDate() + 2);
    const dayAfterTomorrowStr = toDateIsoStr(dayAfterTomorrowDate);

    const isToday = currentSelectedDateStr === todayStr;
    const isTomorrow = currentSelectedDateStr === tomorrowStr;
    const isDayAfterTomorrow = currentSelectedDateStr === dayAfterTomorrowStr;

    let relativeLabel = `${dayName}, ${dayOfMonth} ${monthShort}`;
    let badge = `${shortDay.toUpperCase()}`;
    if (isToday) {
      badge = 'TODAY';
      relativeLabel = 'Today';
    } else if (isTomorrow) {
      badge = 'TOMORROW';
      relativeLabel = 'Tomorrow';
    } else if (isDayAfterTomorrow) {
      badge = 'D+2';
      relativeLabel = 'Day After Tomorrow';
    }

    return {
      dateStr: currentSelectedDateStr,
      date: validDate,
      isToday,
      isTomorrow,
      isDayAfterTomorrow,
      scheduleType,
      dayName,
      shortDay,
      dayOfMonth,
      badge,
      relativeLabel,
      sheetTag: `${dayOfMonth}.${monthIdx + 1}`,
      displayLabel: `${relativeLabel} • ${dayOfMonth} ${monthShort} (${shortDay})`,
      fullOfficialTitle: `${dayOfMonth} ${monthShort} ${year} ${dayName.toUpperCase()}`,
      chipLabel: `${dayOfMonth} ${monthShort} (${shortDay})`
    };
  }, [rollingDays, currentSelectedDateStr]);

  const activeDateStr = activeDayObj.dateStr;

  const handleShiftDate = (daysDelta) => {
    const cur = new Date(currentSelectedDateStr);
    if (isNaN(cur.getTime())) return;
    cur.setDate(cur.getDate() + daysDelta);
    setCurrentSelectedDateStr(toDateIsoStr(cur));
  };

  const [rosterData, setRosterData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategoryFilter, setActiveCategoryFilter] = useState('ALL');
  const [publishing, setPublishing] = useState(false);

  // Selected Duty or Person for detailed inspection
  const [selectedDutyId, setSelectedDutyId] = useState(null);
  const [selectedRightItem, setSelectedRightItem] = useState(null);

  // Operator ID to highlight
  const effectiveEmpId = String(
    currentOperatorId || userProfile?.employeeId || userProfile?.empNo || ''
  ).trim();

  // Real-time listener for the selected date's published roster
  useEffect(() => {
    setLoading(true);
    setSelectedDutyId(null);
    setSelectedRightItem(null);

    const mergeArr = (a, b) => (a && a.length > 0) ? a : (b || []);
    const mergeObj = (a, b) => (a && Object.keys(a).length > 0) ? a : (b || {});

    // Smart merge: base is the date-specific doc; supplement fills in any missing duties/arrays
    const mergeRoster = (base, supplement) => {
      if (!base && !supplement) return null;
      if (!base) return supplement;
      if (!supplement) return base;
      return {
        ...supplement,
        ...base,
        duties: mergeArr(base.duties, supplement.duties),
        controlDesks: mergeArr(base.controlDesks, supplement.controlDesks),
        weeklyOffs: mergeArr(base.weeklyOffs, supplement.weeklyOffs),
        standbys: mergeArr(base.standbys, supplement.standbys),
        outstationStepbacks: mergeArr(base.outstationStepbacks, supplement.outstationStepbacks),
        leaves: mergeArr(base.leaves, supplement.leaves),
        absents: mergeArr(base.absents, supplement.absents),
        notReporting: mergeArr(base.notReporting, supplement.notReporting),
        crtTraining: mergeArr(base.crtTraining, supplement.crtTraining),
        bmrtiTraining: mergeArr(base.bmrtiTraining, supplement.bmrtiTraining),
        relievedOperators: mergeArr(base.relievedOperators, supplement.relievedOperators),
        pmeOperators: mergeArr(base.pmeOperators, supplement.pmeOperators),
        routeLearning: mergeArr(base.routeLearning, supplement.routeLearning),
        bookedOff: mergeArr(base.bookedOff, supplement.bookedOff),
        onDuty: mergeArr(base.onDuty, supplement.onDuty),
        customRegisters: mergeObj(base.customRegisters, supplement.customRegisters),
      };
    };

    // Mutable refs to hold latest snapshots from each source
    let dateData = undefined;  // undefined = not yet received
    let currentCacheData = null;
    let consoleData = null;
    const unsubscribers = [];

    const publish = () => {
      // Wait until we've at least heard back from the date doc
      if (dateData === undefined) return;
      const supplement = mergeRoster(currentCacheData, consoleData);
      setRosterData(mergeRoster(dateData, supplement));
      setLoading(false);
    };

    // Listener 1: date-specific doc
    const docRef = doc(db, 'dispatch_excel_cache', activeDateStr);
    const unsub = onSnapshot(docRef, (snap) => {
      dateData = snap.exists() ? snap.data() : null;
      publish();
    }, (err) => {
      console.error('Official GCC Sheet listener error:', err);
      dateData = null;
      publish();
    });
    unsubscribers.push(unsub);

    // Listener 2+3: for today, also watch current docs as supplemental duty source
    if (activeDayObj.isToday) {
      const unsubCache = onSnapshot(doc(db, 'dispatch_excel_cache', 'current'), (snap) => {
        currentCacheData = snap.exists() ? snap.data() : null;
        publish();
      });
      unsubscribers.push(unsubCache);

      const unsubConsole = onSnapshot(doc(db, 'roster_desk_console', 'current'), (snap) => {
        consoleData = snap.exists() ? snap.data() : null;
        publish();
      });
      unsubscribers.push(unsubConsole);
    }

    return () => unsubscribers.forEach(fn => fn());
  }, [activeDateStr, activeDayObj.isToday]);

  const sanitizeItem = (item) => {
    if (!item) return item;
    const empNo = item.empNo || item.empId || '';
    let name = item.name || item.empName || '';
    name = resolveRealOperatorName(name, empNo);
    return { ...item, name, empName: name, empNo, empId: empNo };
  };

  const rawDuties = rosterData?.duties || rosterData?.deployments || [];
  const isPublished = Boolean(rosterData?.isPublishedForOperators !== false && rawDuties.length > 0);
  const dutiesList = useMemo(() => {
    if (!rawDuties || rawDuties.length === 0) return [];
    let list = rawDuties.map(d => {
      const dutyId = String(d.dutyId || '').trim();
      let empId = d.empId || d.empNo || '';
      let empName = d.empName || d.name || '';
      if (dutyId === '01' || dutyId === '1') {
        if (!empId || empId === '--' || !empName || empName.toUpperCase().includes('VACANT')) {
          empId = '21968';
          empName = 'Venkata Kiran Kumar M';
        }
      }
      empName = resolveRealOperatorName(empName, empId);
      return { ...d, empId, empName };
    });
    if (!list.some(d => String(d.dutyId).trim() === '01' || String(d.dutyId).trim() === '1')) {
      list.unshift({
        dutyId: '01',
        empId: '21968',
        empName: 'Venkata Kiran Kumar M',
        trainId: 'Pro1',
        dutyType: 'PR01',
        signOnTime: '06:00',
        signOnLocation: 'PYID',
        signOffTime: '06:00',
        signOffLocation: 'PYID',
        status: 'ACTIVE'
      });
    }
    return list;
  }, [rawDuties]);

  const weeklyOffsList = useMemo(() => (rosterData?.weeklyOffs || []).map(sanitizeItem), [rosterData?.weeklyOffs]);
  const leavesList = useMemo(() => (rosterData?.leaves || []).map(sanitizeItem), [rosterData?.leaves]);
  const controlDesksList = useMemo(() => (rosterData?.controlDesks || []).map(sanitizeItem), [rosterData?.controlDesks]);
  const standbysList = useMemo(() => (rosterData?.standbys || []).map(sanitizeItem), [rosterData?.standbys]);
  const absentsList = useMemo(() => (rosterData?.absents || []).map(sanitizeItem), [rosterData?.absents]);
  const notReportingList = useMemo(() => (rosterData?.notReporting || []).map(sanitizeItem), [rosterData?.notReporting]);
  const customRegs = rosterData?.customRegisters || {};
  const crrcTraining = customRegs['CRRC 4RS DM-DTG TRAINING AT PEENYA DEPOT (RBL)'] || 
                       customRegs['RS CRRC-DM Train 440kms Trg'] || 
                       rosterData?.crtTraining || [];

  // Dedicated NGSA Train Operators List
  const ngsaList = useMemo(() => {
    const list = [];
    (rosterData?.outstationStepbacks || []).forEach(sb => {
      const stn = String(sb.station || sb.code || sb.name || '').toUpperCase();
      if (stn.includes('NGSA')) {
        if (!list.some(x => (x.empNo || x.empId) === (sb.empNo || sb.empId))) {
          list.push({ ...sb, station: 'NGSA', time: sb.time || '07:00 - 15:00' });
        }
      }
    });
    Object.entries(customRegs).forEach(([catKey, items]) => {
      if (/NGSA/i.test(catKey) && Array.isArray(items)) {
        items.forEach(it => {
          if (!list.some(x => (x.empNo || x.empId) === (it.empNo || it.empId))) {
            list.push({ ...it, station: 'NGSA', time: it.time || it.info || '' });
          }
        });
      }
    });
    if (rosterData?.ngsa && Array.isArray(rosterData.ngsa)) {
      rosterData.ngsa.forEach(it => {
        if (!list.some(x => (x.empNo || x.empId) === (it.empNo || it.empId))) {
          list.push(it);
        }
      });
    }
    return list.map(sanitizeItem);
  }, [rosterData?.outstationStepbacks, rosterData?.ngsa, customRegs]);

  // Dedicated 1Stbk (Outstation Stepback) List (II GSA, PUTH, etc., excluding NGSA)
  const stepbacksList = useMemo(() => {
    const list = [];
    (rosterData?.outstationStepbacks || []).forEach(sb => {
      const stn = String(sb.station || sb.code || '').toUpperCase();
      if (!stn.includes('NGSA')) {
        if (!list.some(x => (x.empNo || x.empId) === (sb.empNo || sb.empId))) {
          list.push(sb);
        }
      }
    });
    Object.entries(customRegs).forEach(([catKey, items]) => {
      if (/(STBK|STEPBACK|PUTH|GSA)/i.test(catKey) && !/NGSA/i.test(catKey) && Array.isArray(items)) {
        items.forEach(it => {
          if (!list.some(x => (x.empNo || x.empId) === (it.empNo || it.empId))) {
            list.push({ ...it, station: it.station || catKey, time: it.time || it.info || '' });
          }
        });
      }
    });
    return list.map(sanitizeItem);
  }, [rosterData?.outstationStepbacks, customRegs]);

  // Dedicated BO (Booked Off) List
  const bookedOffList = useMemo(() => {
    const list = rosterData?.bookedOff ? [...rosterData.bookedOff] : [];
    Object.entries(customRegs).forEach(([catKey, items]) => {
      if (/\b(BO|BOOK\s*OFF|BOOKED\s*OFF)\b/i.test(catKey) && Array.isArray(items)) {
        items.forEach(it => {
          if (!list.some(x => (x.empNo || x.empId) === (it.empNo || it.empId))) {
            list.push({ ...it, type: 'BO', from: it.from || it.info || '' });
          }
        });
      }
    });
    return list.map(sanitizeItem);
  }, [rosterData?.bookedOff, customRegs]);

  // Toggle Publish / Unpublish (Controllers / Admins only)
  const handleTogglePublish = async () => {
    if (!['CONTROLLER', 'CREW_CONTROLLER', 'ADMIN', 'SUPER_ADMIN'].includes(userRole)) return;
    setPublishing(true);
    try {
      const nextStatus = !isPublished;
      await setDoc(doc(db, 'dispatch_excel_cache', activeDateStr), {
        isPublishedForOperators: nextStatus,
        publishedAt: serverTimestamp(),
        lastUpdated: serverTimestamp()
      }, { merge: true });
    } catch (err) {
      console.error(err);
      alert("Failed to toggle publish status: " + err.message);
    } finally {
      setPublishing(false);
    }
  };

  // Find if current operator has an assignment on this day
  const myAssignment = useMemo(() => {
    if (!effectiveEmpId) return null;
    const cleanId = effectiveEmpId.toLowerCase();

    // 1. In Duties
    const dMatch = dutiesList.find(d => String(d.empId || '').toLowerCase() === cleanId);
    if (dMatch) return { type: 'DUTY', ...dMatch };

    // 2. In Weekly Offs
    const woMatch = weeklyOffsList.find(w => String(w.empNo || w.empId || '').toLowerCase() === cleanId);
    if (woMatch) return { type: 'WEEKLY_OFF', name: woMatch.name || woMatch.empName, empNo: woMatch.empNo };

    // 3. In Leaves
    const lvMatch = leavesList.find(l => String(l.empNo || l.empId || '').toLowerCase() === cleanId);
    if (lvMatch) return { type: 'LEAVE', leaveType: lvMatch.type || 'CL', name: lvMatch.name, empNo: lvMatch.empNo };

    // 4. In CC Desk
    const ccMatch = controlDesksList.find(c => String(c.empNo || c.empId || '').toLowerCase() === cleanId);
    if (ccMatch) return { type: 'CC_DESK', code: ccMatch.code || 'CC Desk', name: ccMatch.name, empNo: ccMatch.empNo };

    // 5. In Standby
    const sbMatch = standbysList.find(s => String(s.empNo || s.empId || '').toLowerCase() === cleanId);
    if (sbMatch) return { type: 'STANDBY', code: sbMatch.code || 'OR', name: sbMatch.name, empNo: sbMatch.empNo };

    // 6. In NGSA
    const ngsaMatch = ngsaList.find(n => String(n.empNo || n.empId || '').toLowerCase() === cleanId);
    if (ngsaMatch) return { type: 'NGSA', station: 'NGSA', name: ngsaMatch.name, empNo: ngsaMatch.empNo, time: ngsaMatch.time };

    // 7. In 1Stbk (Outstation Stepback)
    const stbkMatch = stepbacksList.find(s => String(s.empNo || s.empId || '').toLowerCase() === cleanId);
    if (stbkMatch) return { type: 'STBK', station: stbkMatch.station || '1Stbk', name: stbkMatch.name, empNo: stbkMatch.empNo, time: stbkMatch.time };

    // 8. In BO
    const boMatch = bookedOffList.find(b => String(b.empNo || b.empId || '').toLowerCase() === cleanId);
    if (boMatch) return { type: 'BO', name: boMatch.name, empNo: boMatch.empNo, period: `${boMatch.from || ''} ${boMatch.to ? '➔ ' + boMatch.to : ''}` };

    // 9. In CRRC Training
    const trgMatch = (crrcTraining || []).find(t => String(t.empNo || t.empId || '').toLowerCase() === cleanId);
    if (trgMatch) return { type: 'TRAINING', tag: 'CRRC Training', name: trgMatch.name, empNo: trgMatch.empNo };

    return null;
  }, [effectiveEmpId, dutiesList, weeklyOffsList, leavesList, controlDesksList, standbysList, ngsaList, stepbacksList, bookedOffList, crrcTraining]);

  // Selected Duty Object
  const selectedDutyObj = useMemo(() => {
    if (!selectedDutyId) return null;
    return dutiesList.find(d => String(d.dutyId) === String(selectedDutyId));
  }, [dutiesList, selectedDutyId]);

  // Universal search matcher helper
  const matchesSearch = (item) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    return (
      String(item.name || item.empName || '').toLowerCase().includes(q) ||
      String(item.empNo || item.empId || '').toLowerCase().includes(q) ||
      String(item.station || item.code || item.dutyId || item.type || item.time || item.from || item.tag || '').toLowerCase().includes(q)
    );
  };

  // Search filtering across all desks and duties
  const filteredDuties = useMemo(() => {
    if (!searchQuery.trim()) return dutiesList;
    const q = searchQuery.toLowerCase().trim();
    return dutiesList.filter(d => 
      String(d.dutyId || '').toLowerCase().includes(q) ||
      String(d.empName || '').toLowerCase().includes(q) ||
      String(d.empId || '').toLowerCase().includes(q) ||
      String(d.trainId || '').toLowerCase().includes(q) ||
      String(d.dutyType || '').toLowerCase().includes(q) ||
      String(d.signOnLocation || '').toLowerCase().includes(q) ||
      String(d.signOffLocation || '').toLowerCase().includes(q)
    );
  }, [dutiesList, searchQuery]);

  const filteredControlDesks = useMemo(() => controlDesksList.filter(matchesSearch), [controlDesksList, searchQuery]);
  const filteredStepbacks = useMemo(() => stepbacksList.filter(matchesSearch), [stepbacksList, searchQuery]);
  const filteredNgsa = useMemo(() => ngsaList.filter(matchesSearch), [ngsaList, searchQuery]);
  const filteredStandbys = useMemo(() => standbysList.filter(matchesSearch), [standbysList, searchQuery]);
  const filteredWeeklyOffs = useMemo(() => weeklyOffsList.filter(matchesSearch), [weeklyOffsList, searchQuery]);
  const filteredLeaves = useMemo(() => leavesList.filter(matchesSearch), [leavesList, searchQuery]);
  const filteredAbsents = useMemo(() => absentsList.filter(matchesSearch), [absentsList, searchQuery]);
  const filteredBookedOff = useMemo(() => bookedOffList.filter(matchesSearch), [bookedOffList, searchQuery]);

  // Close on Escape key press
  useEffect(() => {
    if (!onClose) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className={`flex flex-col bg-[#070b14] text-white font-sans ${isModal ? 'h-full w-full max-h-full overflow-hidden' : 'min-h-screen'}`}>
      
      {/* ── TOP 7-DAY ROLLING SELECTOR BAR ── */}
      <div className="bg-[#0b1220] border-b border-slate-800 px-3 py-2 flex items-center justify-between gap-2 shrink-0 z-20">
        <div className="flex items-center gap-1.5 overflow-x-auto py-1 scrollbar-none flex-1 min-w-0 mr-2">
          <div className="flex items-center gap-1 text-[11px] font-black uppercase text-emerald-400 tracking-wider mr-2 shrink-0">
            <Calendar className="w-4 h-4 text-emerald-400" />
            <span>DAY-WISE ROSTERS:</span>
          </div>
          {rollingDays.map((d) => {
            const isSelected = d.dateStr === currentSelectedDateStr;
            return (
              <button
                key={d.dateStr}
                onClick={() => setCurrentSelectedDateStr(d.dateStr)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition whitespace-nowrap shrink-0 cursor-pointer ${
                  isSelected
                    ? 'bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-950 ring-2 ring-emerald-300 font-black'
                    : 'bg-[#11192b] hover:bg-[#1a253e] text-slate-300 hover:text-white border border-slate-700/70'
                }`}
              >
                <span className={`text-[10px] px-1.5 py-0.2 rounded font-black ${
                  isSelected
                    ? 'bg-slate-950 text-emerald-300'
                    : d.isToday
                      ? 'bg-cyan-500/20 text-cyan-300'
                      : d.isTomorrow
                        ? 'bg-amber-500/20 text-amber-300'
                        : 'bg-slate-800 text-slate-400'
                }`}>
                  {d.badge}
                </span>
                <span>{d.chipLabel}</span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2 shrink-0 pl-2 border-l border-slate-800">
          {/* Controller Publish / Unpublish Toggle */}
          {['CONTROLLER', 'CREW_CONTROLLER', 'ADMIN', 'SUPER_ADMIN'].includes(userRole) && (
            <button
              onClick={handleTogglePublish}
              disabled={publishing || dutiesList.length === 0}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-mono font-bold transition shadow cursor-pointer ${
                isPublished 
                  ? 'bg-emerald-950 border border-emerald-500 text-emerald-300 hover:bg-rose-950 hover:text-rose-300 hover:border-rose-500'
                  : 'bg-amber-500 hover:bg-amber-400 text-slate-950 font-black'
              }`}
              title="Click to toggle operator visibility for this day"
            >
              <Radio className={`w-3.5 h-3.5 ${isPublished ? 'text-emerald-400 animate-pulse' : 'text-slate-950'}`} />
              <span>{publishing ? 'Updating...' : isPublished ? '● PUBLISHED TO TOs' : '○ PUBLISH TO TOs'}</span>
            </button>
          )}

          {/* Prominent High-Contrast Close Button */}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-black font-mono transition cursor-pointer shadow-lg border border-rose-400 hover:scale-105 active:scale-95 shrink-0"
              title="Close Roster Sheet Window (Esc)"
            >
              <X className="w-4 h-4 stroke-[3]" />
              <span>CLOSE</span>
            </button>
          )}
        </div>
      </div>

      {/* ── SEARCH & LIVE STATUS BAR WITH INTERACTIVE DATE CONTROLS ── */}
      <div className="bg-[#0e1628] border-b border-slate-800 px-3 py-2 flex flex-wrap items-center justify-between gap-3 text-xs shrink-0">
        <div className="flex items-center gap-2 font-mono flex-wrap">
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-950/90 border border-emerald-500/60 text-emerald-300 text-[11px] font-black shrink-0">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
            LIVE SYNC WITH GCC DESK
          </span>

          {/* Interactive Date Switcher & Day Navigation */}
          <div className="flex items-center bg-[#070b14] border border-slate-700 rounded-lg p-0.5 text-xs font-mono shadow-inner">
            <button
              type="button"
              onClick={() => handleShiftDate(-1)}
              title="Previous Day"
              className="px-2 py-1 rounded text-slate-300 hover:text-white hover:bg-slate-800 transition font-bold cursor-pointer"
            >
              ◀
            </button>

            <div className="flex items-center gap-1.5 px-2 py-0.5 border-x border-slate-800">
              <span className="text-slate-400 text-[11px] hidden sm:inline">• Date:</span>
              <input
                id="official-gcc-active-date-picker"
                type="date"
                value={activeDateStr}
                onChange={(e) => {
                  if (e.target.value) setCurrentSelectedDateStr(e.target.value);
                }}
                className="bg-transparent text-white font-black text-xs border-none outline-none cursor-pointer focus:ring-1 focus:ring-emerald-400 rounded px-1"
                title="Click to select any date"
              />
              <span className="text-cyan-300 font-black text-[11px] uppercase tracking-wide">
                ({activeDayObj.dayName?.toUpperCase() || activeDayObj.scheduleType})
              </span>
            </div>

            <button
              type="button"
              onClick={() => handleShiftDate(1)}
              title="Next Day"
              className="px-2 py-1 rounded text-slate-300 hover:text-white hover:bg-slate-800 transition font-bold cursor-pointer"
            >
              ▶
            </button>
          </div>

          {/* Quick Date Switcher Chips */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setCurrentSelectedDateStr(toDateIsoStr(new Date()))}
              className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold transition uppercase cursor-pointer ${
                activeDayObj.isToday
                  ? 'bg-cyan-500 text-slate-950 font-black shadow'
                  : 'bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-800'
              }`}
            >
              Today
            </button>
            {rollingDays[1] && (
              <button
                type="button"
                onClick={() => setCurrentSelectedDateStr(rollingDays[1].dateStr)}
                className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold transition uppercase cursor-pointer ${
                  activeDayObj.isTomorrow
                    ? 'bg-amber-500 text-slate-950 font-black shadow'
                    : 'bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-800'
                }`}
              >
                Tomorrow
              </button>
            )}
            {rollingDays[2] && (
              <button
                type="button"
                onClick={() => setCurrentSelectedDateStr(rollingDays[2].dateStr)}
                className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold transition uppercase cursor-pointer ${
                  activeDayObj.isDayAfterTomorrow
                    ? 'bg-emerald-500 text-slate-950 font-black shadow'
                    : 'bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-800'
                }`}
              >
                Day After Tomorrow
              </button>
            )}
          </div>

          {/* Live Publication Status Badge */}
          <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${
            isPublished 
              ? 'bg-emerald-950/80 border-emerald-500/80 text-emerald-300' 
              : 'bg-amber-950/80 border-amber-500/80 text-amber-300'
          }`}>
            {isPublished ? '● PUBLISHED' : '○ DRAFT'}
          </span>

          <span className="text-[10px] text-cyan-400 bg-cyan-950/60 border border-cyan-800/60 px-2 py-0.5 rounded font-mono hidden xl:inline">
            💡 Click any duty or staff to inspect
          </span>
        </div>

        {/* Search by Name or ID */}
        <div className="relative flex-1 max-w-xs">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input id="officialgccrostersheetview-input-1" name="officialgccrostersheetview_input_1"
            type="text"
            placeholder="Search Name / Emp ID / Duty / Desk..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#070b14] border border-slate-700 rounded-lg pl-8 pr-7 py-1 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-mono"
          />
          {searchQuery && (
            <button 
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs cursor-pointer"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* ── DESK & ROSTER CATEGORY FILTERS BAR ── */}
      <div className="bg-[#0b1324] border-b border-slate-800/90 px-3 py-1.5 flex items-center gap-1.5 overflow-x-auto scrollbar-none text-[11px] font-mono shrink-0 z-10">
        <span className="text-slate-400 font-bold uppercase text-[10px] shrink-0 mr-1 flex items-center gap-1">
          <Filter className="w-3 h-3 text-cyan-400" />
          <span>FILTERS:</span>
        </span>

        {/* ALL */}
        <button
          type="button"
          onClick={() => setActiveCategoryFilter('ALL')}
          className={`flex items-center gap-1 px-2.5 py-1 rounded-lg font-bold transition shrink-0 cursor-pointer border ${
            activeCategoryFilter === 'ALL'
              ? 'bg-emerald-500 text-slate-950 border-emerald-300 font-black shadow-md ring-1 ring-emerald-300'
              : 'bg-[#121c34] text-slate-300 hover:text-white border-slate-700/80 hover:bg-[#1a284a]'
          }`}
        >
          <span>ALL</span>
          <span className={`px-1 rounded text-[9px] font-black ${activeCategoryFilter === 'ALL' ? 'bg-slate-950 text-emerald-300' : 'bg-slate-800 text-slate-400'}`}>
            {filteredDuties.length + filteredControlDesks.length + filteredStepbacks.length + filteredNgsa.length + filteredStandbys.length + filteredWeeklyOffs.length + filteredLeaves.length + filteredBookedOff.length}
          </span>
        </button>

        {/* Duties */}
        <button
          type="button"
          onClick={() => setActiveCategoryFilter('DUTIES')}
          className={`flex items-center gap-1 px-2.5 py-1 rounded-lg font-bold transition shrink-0 cursor-pointer border ${
            activeCategoryFilter === 'DUTIES'
              ? 'bg-amber-400 text-slate-950 border-amber-300 font-black shadow-md ring-1 ring-amber-300'
              : 'bg-[#121c34] text-slate-300 hover:text-white border-slate-700/80 hover:bg-[#1a284a]'
          }`}
        >
          <span>Duties (1-85)</span>
          <span className={`px-1 rounded text-[9px] font-black ${activeCategoryFilter === 'DUTIES' ? 'bg-slate-950 text-amber-300' : 'bg-slate-800 text-slate-400'}`}>
            {filteredDuties.length}
          </span>
        </button>

        {/* Crew Controller Desks */}
        <button
          type="button"
          onClick={() => setActiveCategoryFilter('CC')}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-bold transition shrink-0 cursor-pointer border ${
            activeCategoryFilter === 'CC'
              ? 'bg-emerald-400 text-slate-950 border-emerald-300 font-black shadow-md ring-1 ring-emerald-300'
              : 'bg-[#121c34] text-emerald-300 hover:text-white border-slate-700/80 hover:bg-[#1a284a]'
          }`}
          title="Filter Crew Controller Desks (CC1 - CC3)"
        >
          <ShieldCheck className="w-3 h-3 text-emerald-400" />
          <span>@Crew Controller Desks</span>
          <span className={`px-1 rounded text-[9px] font-black ${activeCategoryFilter === 'CC' ? 'bg-slate-950 text-emerald-300' : 'bg-slate-800 text-emerald-300'}`}>
            {filteredControlDesks.length}
          </span>
        </button>

        {/* 1Stbk (Outstation Stepback) */}
        <button
          type="button"
          onClick={() => setActiveCategoryFilter('STBK')}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-bold transition shrink-0 cursor-pointer border ${
            activeCategoryFilter === 'STBK'
              ? 'bg-indigo-400 text-slate-950 border-indigo-200 font-black shadow-md ring-1 ring-indigo-300'
              : 'bg-[#121c34] text-indigo-300 hover:text-white border-slate-700/80 hover:bg-[#1a284a]'
          }`}
          title="Filter 1Stbk (Outstation Stepback)"
        >
          <MapPin className="w-3 h-3 text-indigo-400" />
          <span>@1Stbk (Outstation Stepback)</span>
          <span className={`px-1 rounded text-[9px] font-black ${activeCategoryFilter === 'STBK' ? 'bg-slate-950 text-indigo-300' : 'bg-slate-800 text-indigo-300'}`}>
            {filteredStepbacks.length}
          </span>
        </button>

        {/* Standby / Over-Rest (OR) */}
        <button
          type="button"
          onClick={() => setActiveCategoryFilter('OR')}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-bold transition shrink-0 cursor-pointer border ${
            activeCategoryFilter === 'OR'
              ? 'bg-amber-400 text-slate-950 border-amber-300 font-black shadow-md ring-1 ring-amber-300'
              : 'bg-[#121c34] text-amber-300 hover:text-white border-slate-700/80 hover:bg-[#1a284a]'
          }`}
          title="Filter Standby / Over-Rest (OR)"
        >
          <Clock className="w-3 h-3 text-amber-400" />
          <span>@Standby / Over-Rest (OR)</span>
          <span className={`px-1 rounded text-[9px] font-black ${activeCategoryFilter === 'OR' ? 'bg-slate-950 text-amber-300' : 'bg-slate-800 text-amber-300'}`}>
            {filteredStandbys.length}
          </span>
        </button>

        {/* Weekly Off (WO) */}
        <button
          type="button"
          onClick={() => setActiveCategoryFilter('WO')}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-bold transition shrink-0 cursor-pointer border ${
            activeCategoryFilter === 'WO'
              ? 'bg-amber-400 text-slate-950 border-amber-300 font-black shadow-md ring-1 ring-amber-300'
              : 'bg-[#121c34] text-slate-300 hover:text-white border-slate-700/80 hover:bg-[#1a284a]'
          }`}
          title="Filter Weekly Off (WO)"
        >
          <Calendar className="w-3 h-3 text-amber-400" />
          <span>@Weekly Off (WO)</span>
          <span className={`px-1 rounded text-[9px] font-black ${activeCategoryFilter === 'WO' ? 'bg-slate-950 text-amber-300' : 'bg-slate-800 text-slate-400'}`}>
            {filteredWeeklyOffs.length}
          </span>
        </button>

        {/* Leaves & Medical (CL/EL/ML) */}
        <button
          type="button"
          onClick={() => setActiveCategoryFilter('LEAVE')}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-bold transition shrink-0 cursor-pointer border ${
            activeCategoryFilter === 'LEAVE'
              ? 'bg-rose-500 text-white border-rose-300 font-black shadow-md ring-1 ring-rose-300'
              : 'bg-[#121c34] text-rose-300 hover:text-white border-slate-700/80 hover:bg-[#1a284a]'
          }`}
          title="Filter Leaves & Medical (CL/EL/ML/AB)"
        >
          <AlertCircle className="w-3 h-3 text-rose-400" />
          <span>@Leaves & Medical (CL/EL/ML)</span>
          <span className={`px-1 rounded text-[9px] font-black ${activeCategoryFilter === 'LEAVE' ? 'bg-slate-950 text-rose-300' : 'bg-slate-800 text-rose-300'}`}>
            {filteredLeaves.length + filteredAbsents.length}
          </span>
        </button>

        {/* BO */}
        <button
          type="button"
          onClick={() => setActiveCategoryFilter('BO')}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-bold transition shrink-0 cursor-pointer border ${
            activeCategoryFilter === 'BO'
              ? 'bg-purple-400 text-slate-950 border-purple-200 font-black shadow-md ring-1 ring-purple-300'
              : 'bg-[#121c34] text-purple-300 hover:text-white border-slate-700/80 hover:bg-[#1a284a]'
          }`}
          title="Filter BO (Booked Off)"
        >
          <span>@BO</span>
          <span className={`px-1 rounded text-[9px] font-black ${activeCategoryFilter === 'BO' ? 'bg-slate-950 text-purple-300' : 'bg-slate-800 text-purple-300'}`}>
            {filteredBookedOff.length}
          </span>
        </button>

        {/* NGSA */}
        <button
          type="button"
          onClick={() => setActiveCategoryFilter('NGSA')}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-bold transition shrink-0 cursor-pointer border ${
            activeCategoryFilter === 'NGSA'
              ? 'bg-cyan-400 text-slate-950 border-cyan-200 font-black shadow-md ring-1 ring-cyan-300'
              : 'bg-[#121c34] text-cyan-300 hover:text-white border-slate-700/80 hover:bg-[#1a284a]'
          }`}
          title="Filter NGSA Station Coverage & Stepback"
        >
          <MapPin className="w-3 h-3 text-cyan-400" />
          <span>@NGSA</span>
          <span className={`px-1 rounded text-[9px] font-black ${activeCategoryFilter === 'NGSA' ? 'bg-slate-950 text-cyan-300' : 'bg-slate-800 text-cyan-300'}`}>
            {filteredNgsa.length}
          </span>
        </button>
      </div>

      {/* ── MY INDIVIDUAL DUTY CALLOUT BANNER (if operator logged in) ── */}
      {myAssignment && (
        <div className="bg-gradient-to-r from-amber-950/90 via-[#0e1628] to-amber-950/70 border-b border-amber-500/60 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs shrink-0 shadow-lg animate-in fade-in duration-200">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-amber-500/20 border border-amber-400/50 rounded-lg text-amber-300">
              <Sparkles className="w-4 h-4 animate-spin text-amber-300" />
            </div>
            <div>
              <div className="text-[10px] font-black uppercase text-amber-300 tracking-wider">
                {activeDayObj.relativeLabel.toUpperCase()}'S ASSIGNMENT ({activeDayObj.displayLabel}):
              </div>
              <div className="text-sm font-bold text-white flex items-center gap-2 font-mono flex-wrap">
                {myAssignment.type === 'DUTY' && (
                  <>
                    <span className="bg-amber-400 text-slate-950 px-2 py-0.5 rounded font-black text-xs">DUTY {myAssignment.dutyId}</span>
                    <span className="text-slate-500">|</span>
                    <span className="text-cyan-300 font-bold">Train: {myAssignment.trainId || 'Auto'}</span>
                    <span className="text-slate-500">|</span>
                    <span className="text-emerald-400 font-black">Sign-On: {myAssignment.signOnTime} ({myAssignment.signOnLocation})</span>
                    <span className="text-slate-500">➔</span>
                    <span className="text-rose-400 font-black">Sign-Off: {myAssignment.signOffTime} ({myAssignment.signOffLocation})</span>
                  </>
                )}
                {myAssignment.type === 'WEEKLY_OFF' && (
                  <span className="text-amber-300 font-black tracking-wide">REST DAY / WEEKLY OFF (WO) — ENJOY YOUR REST!</span>
                )}
                {myAssignment.type === 'LEAVE' && (
                  <span className="text-rose-400 font-black tracking-wide">ON OFFICIAL LEAVE ({myAssignment.leaveType})</span>
                )}
                {myAssignment.type === 'CC_DESK' && (
                  <span className="text-cyan-300 font-black tracking-wide">CREW CONTROLLER DESK: {myAssignment.code}</span>
                )}
                {myAssignment.type === 'STANDBY' && (
                  <span className="text-amber-300 font-black tracking-wide">STANDBY / OVER-REST: {myAssignment.code}</span>
                )}
                {myAssignment.type === 'NGSA' && (
                  <span className="text-cyan-300 font-black tracking-wide">NGSA COVERAGE / STEPBACK ({myAssignment.time || 'Assigned'})</span>
                )}
                {myAssignment.type === 'STBK' && (
                  <span className="text-indigo-300 font-black tracking-wide">1STBK (OUTSTATION STEPBACK): {myAssignment.station} ({myAssignment.time || 'Assigned'})</span>
                )}
                {myAssignment.type === 'BO' && (
                  <span className="text-purple-300 font-black tracking-wide">BOOKED OFF (BO): {myAssignment.period}</span>
                )}
                {myAssignment.type === 'TRAINING' && (
                  <span className="text-sky-300 font-black tracking-wide">{myAssignment.tag}</span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 rounded bg-amber-400 text-slate-950 text-[10px] font-mono font-black shadow">
              OPERATOR ID: {effectiveEmpId}
            </span>
          </div>
        </div>
      )}

      {/* ── HIGH-CONTRAST SELECTED DUTY / DATA INSPECTOR DOCK ── */}
      {selectedDutyObj && (
        <div className="bg-[#0b1426] border-y-2 border-amber-400 px-4 py-3 shadow-[0_4px_25px_rgba(0,0,0,0.6)] backdrop-blur-md flex flex-wrap items-center justify-between gap-3 text-xs shrink-0 z-30 animate-in slide-in-from-top duration-200">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 rounded-lg bg-amber-400 text-slate-950 font-black text-sm tracking-wider shadow">
                DUTY #{selectedDutyObj.dutyId}
              </span>
              {selectedDutyObj.dutyType && (
                <span className="px-2.5 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-600 font-black text-xs font-mono">
                  {selectedDutyObj.dutyType}
                </span>
              )}
            </div>

            <div className="h-6 w-px bg-slate-700 hidden sm:block"></div>

            {/* Operator Name & ID */}
            <div className="flex items-center gap-2">
              <span className="text-sm font-black text-white tracking-wide">
                {selectedDutyObj.empName || "UNASSIGNED"}
              </span>
              <span className="px-2 py-0.5 rounded bg-amber-950/90 text-amber-300 border border-amber-500 font-mono font-black text-xs">
                EMP #{selectedDutyObj.empId || "--"}
              </span>
            </div>

            <div className="h-6 w-px bg-slate-700 hidden sm:block"></div>

            {/* Shift Timings */}
            <div className="flex items-center gap-2 font-mono text-xs">
              <div className="flex items-center gap-1">
                <span className="text-slate-400 text-[10px] uppercase font-sans">Sign-On:</span>
                <span className="text-emerald-400 font-black">{selectedDutyObj.signOnTime}</span>
                <span className="text-cyan-300 font-bold">({selectedDutyObj.signOnLocation || "PYID"})</span>
              </div>
              <span className="text-slate-500">➔</span>
              <div className="flex items-center gap-1">
                <span className="text-slate-400 text-[10px] uppercase font-sans">Sign-Off:</span>
                <span className="text-rose-400 font-black">{selectedDutyObj.signOffTime}</span>
                <span className="text-cyan-300 font-bold">({selectedDutyObj.signOffLocation || "PYID"})</span>
              </div>
            </div>

            {selectedDutyObj.trainId && (
              <>
                <div className="h-6 w-px bg-slate-700 hidden md:block"></div>
                <div className="flex items-center gap-1 font-mono">
                  <span className="text-slate-400 text-[10px] uppercase font-sans">Train:</span>
                  <span className="px-2 py-0.5 rounded bg-teal-950 text-teal-300 border border-teal-500 font-black text-xs">
                    {selectedDutyObj.trainId}
                  </span>
                </div>
              </>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setSelectedDutyId(null)}
              className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white font-bold text-xs transition cursor-pointer border border-slate-600"
            >
              ✕ Clear Selection
            </button>
          </div>
        </div>
      )}

      {/* ── HIGH-CONTRAST SELECTED RIGHT ITEM INSPECTOR DOCK ── */}
      {selectedRightItem && !selectedDutyObj && (
        <div className="bg-[#0b1426] border-y-2 border-cyan-400 px-4 py-3 shadow-[0_4px_25px_rgba(0,0,0,0.6)] backdrop-blur-md flex flex-wrap items-center justify-between gap-3 text-xs shrink-0 z-30 animate-in slide-in-from-top duration-200">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="px-3 py-1 rounded-lg bg-cyan-500 text-slate-950 font-black text-xs tracking-wider shadow uppercase">
              {selectedRightItem.category}: {selectedRightItem.label || selectedRightItem.type || selectedRightItem.code || "SELECTED"}
            </span>
            <span className="text-sm font-black text-white">
              {selectedRightItem.name}
            </span>
            <span className="px-2 py-0.5 rounded bg-amber-950/90 text-amber-300 border border-amber-500 font-mono font-black text-xs">
              EMP #{selectedRightItem.empNo || selectedRightItem.empId || "--"}
            </span>
            {selectedRightItem.time && (
              <span className="text-cyan-300 font-mono font-bold">
                Shift: {selectedRightItem.time}
              </span>
            )}
            {selectedRightItem.from && (
              <span className="text-rose-300 font-mono font-bold">
                Period: {selectedRightItem.from} {selectedRightItem.to ? `➔ ${selectedRightItem.to}` : ''}
              </span>
            )}
          </div>
          <button
            onClick={() => setSelectedRightItem(null)}
            className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white font-bold text-xs transition cursor-pointer border border-slate-600"
          >
            ✕ Clear Selection
          </button>
        </div>
      )}

      {/* ── MAIN ROSTER SHEET CONTAINER ── */}
      <div className="flex-1 overflow-auto p-2 sm:p-4 bg-[#070b14] font-mono">
        {loading ? (
          <div className="flex flex-col items-center justify-center min-h-[400px] text-slate-400 gap-3">
            <RefreshCw className="w-8 h-8 text-emerald-400 animate-spin" />
            <span className="text-xs font-mono tracking-widest uppercase">Fetching Official GCC Published Roster...</span>
          </div>
        ) : !rosterData || dutiesList.length === 0 ? (
          /* Empty / Not Published Notice */
          <div className="flex flex-col items-center justify-center min-h-[420px] max-w-lg mx-auto text-center p-6 bg-[#0e1628] border border-slate-800 rounded-2xl shadow-xl space-y-4">
            <div className="p-3.5 bg-amber-500/10 border border-amber-500/30 rounded-2xl text-amber-400">
              <AlertCircle className="w-10 h-10" />
            </div>
            <div>
              <h3 className="text-base font-black text-white uppercase tracking-wider">
                {activeDayObj.relativeLabel} Roster ({activeDayObj.sheetTag}) Not Yet Published
              </h3>
              <p className="text-xs text-slate-300 mt-1.5 leading-relaxed">
                The official GCC duty roster for <span className="text-amber-300 font-bold">{activeDayObj.fullOfficialTitle}</span> has not been deployed to this terminal yet.
              </p>
            </div>
            <div className="p-3 bg-[#070b14] rounded-xl border border-slate-800 text-[11px] text-slate-300 text-left font-mono space-y-1 w-full">
              <div className="text-white font-bold">Automatic Synchronization Protocol:</div>
              <div>• As soon as GCC uploads or deploys the Excel file at Dispatch Gate, it will instantly render here.</div>
              <div>• Any manual duty swap or replacement will reflect in real-time.</div>
            </div>
          </div>
        ) : (
          /* ── 1:1 EXACT OFFICIAL GCC ROSTER SHEET TABLE ── */
          <div className="border border-slate-700/80 rounded-xl overflow-hidden shadow-2xl bg-[#0b1220] text-white min-w-[980px]">
            
            {/* 1. Official Green Title Banner (Exact match to Reference Image) */}
            <div className="bg-[#48752c] text-white py-2.5 px-4 text-center font-bold text-sm sm:text-base tracking-wider uppercase shadow-md flex items-center justify-between border-b border-[#3b6024]">
              <span className="text-xs font-mono font-bold text-emerald-100">BMRCL LINE 2 • PEENYA DEPOT</span>
              <span className="text-base font-black tracking-widest text-white drop-shadow">
                {rosterData.fullOfficialTitle || activeDayObj.fullOfficialTitle}
              </span>
              <span className="text-xs font-mono bg-black/40 px-2.5 py-0.5 rounded text-emerald-200 font-bold">
                {dutiesList.length} DUTIES DEPLOYED
              </span>
            </div>

            {/* 2. Main Two-Column Roster Grid */}
            <div className="grid grid-cols-12 divide-x divide-slate-800">
              
              {/* ── LEFT COLUMN (COLUMNS A-I): DUTIES 1 to 85 (Span 8 in ALL, Span 12 in DUTIES) ── */}
              {(activeCategoryFilter === 'ALL' || activeCategoryFilter === 'DUTIES') && (
                <div className={`${activeCategoryFilter === 'DUTIES' ? 'col-span-12' : 'col-span-12 xl:col-span-8'} overflow-x-auto bg-[#070b14]`}>
                  {activeCategoryFilter === 'DUTIES' && (
                    <div className="bg-[#11192b] border-b border-slate-700 px-4 py-2 flex items-center justify-between">
                      <span className="text-xs font-mono font-black text-amber-300 uppercase tracking-wider flex items-center gap-2">
                        <span>MAIN DRIVING DUTIES (DUTIES 1 - 85)</span>
                        <span className="px-2 py-0.5 rounded bg-amber-400 text-slate-950 text-[10px] font-black">
                          {filteredDuties.length} DUTIES
                        </span>
                      </span>
                      <button
                        onClick={() => setActiveCategoryFilter('ALL')}
                        className="text-[11px] font-mono font-bold text-cyan-300 hover:text-white underline cursor-pointer"
                      >
                        ← Back to All Sections
                      </button>
                    </div>
                  )}
                <table className="w-full text-[11px] border-collapse">
                  <thead>
                    <tr className="bg-[#11192b] border-b border-slate-700 font-black text-slate-200 text-center sticky top-0 z-10 shadow-sm">
                      <th className="py-2 px-1.5 border-r border-slate-700 w-12 text-amber-300">DUTY No.</th>
                      <th className="py-2 px-1.5 border-r border-slate-700 text-cyan-300">Type</th>
                      <th className="py-2 px-1.5 border-r border-slate-700 text-emerald-400">Sign ON</th>
                      <th className="py-2 px-1.5 border-r border-slate-700 text-cyan-300">Sign ON Place</th>
                      <th className="py-2 px-2.5 border-r border-slate-700 text-left text-white">Operator Name</th>
                      <th className="py-2 px-1.5 border-r border-slate-700 text-amber-300">Emp Id</th>
                      <th className="py-2 px-1.5 border-r border-slate-700 text-rose-400">Sign OFF</th>
                      <th className="py-2 px-1.5 border-r border-slate-700 text-cyan-300">Place</th>
                      <th className="py-2 px-1.5 text-teal-300">Train ID</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80">
                    {filteredDuties.map((d, rowIdx) => {
                      const isTargetUser = effectiveEmpId && String(d.empId || '').toLowerCase() === effectiveEmpId.toLowerCase();
                      const isSelected = selectedDutyId && String(d.dutyId) === String(selectedDutyId);
                      
                      // Explicit row backgrounds with guaranteed high contrast
                      let rowBg = rowIdx % 2 === 0 ? 'bg-[#090e1c]' : 'bg-[#0e1628]';
                      if (isSelected) {
                        rowBg = 'bg-amber-400 text-slate-950 font-black ring-2 ring-amber-300 shadow-xl';
                      } else if (isTargetUser) {
                        rowBg = 'bg-amber-950/60 border-l-4 border-amber-400 ring-2 ring-amber-500/50';
                      }

                      return (
                        <tr 
                          key={d.dutyId} 
                          onClick={() => {
                            setSelectedDutyId(isSelected ? null : d.dutyId);
                            setSelectedRightItem(null);
                          }}
                          className={`transition cursor-pointer select-none ${rowBg} ${
                            !isSelected ? 'hover:bg-[#16233d]' : ''
                          }`}
                        >
                          {/* Duty No */}
                          <td className={`py-1.5 px-1.5 text-center font-black border-r border-slate-800 ${
                            isSelected ? 'text-slate-950 font-extrabold text-xs' : 'text-amber-300'
                          }`}>
                            {d.dutyId}
                            {isTargetUser && !isSelected && (
                              <span className="block text-[8px] bg-amber-400 text-black px-1 rounded font-black tracking-tighter">YOU</span>
                            )}
                          </td>

                          {/* Duty Type */}
                          <td className="py-1.5 px-1.5 text-center font-bold border-r border-slate-800 whitespace-nowrap">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                              isSelected 
                                ? 'bg-slate-950 text-cyan-300 font-black' 
                                : 'bg-slate-900 text-cyan-300 border border-slate-700'
                            }`}>
                              {d.dutyType || '--'}
                            </span>
                          </td>

                          {/* Sign On Time */}
                          <td className={`py-1.5 px-1.5 text-center font-black border-r border-slate-800 whitespace-nowrap font-mono ${
                            isSelected ? 'text-slate-950' : 'text-emerald-400'
                          }`}>
                            {d.signOnTime}
                          </td>

                          {/* Sign On Place */}
                          <td className={`py-1.5 px-1.5 text-center font-bold border-r border-slate-800 whitespace-nowrap ${
                            isSelected ? 'text-slate-950' : 'text-cyan-300'
                          }`}>
                            {d.signOnLocation || '--'}
                          </td>

                          {/* Operator Name */}
                          <td className={`py-1.5 px-2.5 text-left font-extrabold border-r border-slate-800 whitespace-nowrap ${
                            isSelected ? 'text-slate-950 text-xs' : 'text-white'
                          }`}>
                            {d.empName}
                          </td>

                          {/* Emp Id */}
                          <td className={`py-1.5 px-1.5 text-center font-mono font-bold border-r border-slate-800 whitespace-nowrap ${
                            isSelected ? 'text-slate-950 font-black' : 'text-amber-300'
                          }`}>
                            {d.empId || '--'}
                          </td>

                          {/* Sign Off Time */}
                          <td className={`py-1.5 px-1.5 text-center font-black border-r border-slate-800 whitespace-nowrap font-mono ${
                            isSelected ? 'text-slate-950' : 'text-rose-400'
                          }`}>
                            {d.signOffTime}
                          </td>

                          {/* Sign Off Place */}
                          <td className={`py-1.5 px-1.5 text-center font-bold border-r border-slate-800 whitespace-nowrap ${
                            isSelected ? 'text-slate-950' : 'text-cyan-300'
                          }`}>
                            {d.signOffLocation || '--'}
                          </td>

                          {/* Train ID */}
                          <td className={`py-1.5 px-1.5 text-center font-mono font-black whitespace-nowrap ${
                            isSelected ? 'text-slate-950' : 'text-teal-300'
                          }`}>
                            {d.trainId || '--'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* ── RIGHT COLUMN: AUXILIARY TABLES (Span 4 in ALL, Span 12 in Focused Mode) ── */}
            {activeCategoryFilter !== 'DUTIES' && (
              <div className={`${activeCategoryFilter === 'ALL' ? 'col-span-12 xl:col-span-4' : 'col-span-12'} bg-[#0a101f] text-[11px] p-2 sm:p-3 space-y-3`}>
                
                {activeCategoryFilter !== 'ALL' && (
                  <div className="bg-[#11192b] border border-slate-700 rounded-xl px-4 py-2.5 flex items-center justify-between mb-3 shadow">
                    <span className="text-xs font-mono font-black text-cyan-300 uppercase tracking-wider flex items-center gap-2">
                      <span>FOCUSED VIEW: {activeCategoryFilter}</span>
                    </span>
                    <button
                      onClick={() => setActiveCategoryFilter('ALL')}
                      className="text-[11px] font-mono font-bold text-amber-300 hover:text-white underline cursor-pointer"
                    >
                      ← Back to All Sections
                    </button>
                  </div>
                )}

                {/* 1. Crew Controller Desks */}
                {(activeCategoryFilter === 'ALL' || activeCategoryFilter === 'CC') && (
                  <div className="bg-[#0e1628] border border-emerald-800/80 rounded-xl p-2.5 space-y-1.5 shadow-sm">
                    <div className="text-[10px] font-black uppercase text-slate-300 tracking-wider flex items-center justify-between border-b border-slate-700/80 pb-1.5">
                      <span className="flex items-center gap-1.5 text-emerald-400">
                        <ShieldCheck className="w-3.5 h-3.5" />
                        Crew Controller Desks
                      </span>
                      <span className="text-emerald-400 font-mono font-bold">CC1 - CC3 • {filteredControlDesks.length} STAFF</span>
                    </div>
                    {filteredControlDesks.length > 0 ? (
                      <div className={activeCategoryFilter === 'CC' ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2' : 'space-y-1.5'}>
                        {filteredControlDesks.map((cc, i) => {
                          const isMe = effectiveEmpId && String(cc.empNo || cc.empId || '').toLowerCase() === effectiveEmpId.toLowerCase();
                          const isCardSelected = selectedRightItem?.category === 'CC' && selectedRightItem?.empNo === cc.empNo;
                          return (
                            <div 
                              key={i} 
                              onClick={() => {
                                setSelectedRightItem({ category: 'CC', label: cc.code || `CC${i+1}`, ...cc });
                                setSelectedDutyId(null);
                              }}
                              className={`flex items-center justify-between p-2 rounded-lg font-mono text-[10px] transition cursor-pointer border ${
                                isCardSelected
                                  ? 'bg-cyan-500 text-slate-950 font-black border-cyan-300 shadow-md ring-2 ring-cyan-300'
                                  : isMe 
                                    ? 'bg-amber-400 text-slate-950 font-black border-amber-300 shadow ring-2 ring-amber-300' 
                                    : 'bg-[#121c34] hover:bg-[#1a284a] border-slate-700/80 text-white'
                              }`}
                            >
                              <span className={`font-black px-1.5 py-0.5 rounded text-[10px] ${
                                isCardSelected || isMe ? 'bg-black/30 text-slate-950' : 'bg-emerald-950 text-emerald-300 border border-emerald-600'
                              }`}>
                                {cc.code || `CC${i+1}`}
                              </span>
                              <span className={isCardSelected || isMe ? 'text-slate-900 font-bold' : 'text-cyan-300'}>
                                {cc.time?.split('-')[0]?.trim()}
                              </span>
                              <span className="font-extrabold truncate max-w-[120px] text-white">
                                {cc.name}
                              </span>
                              <span className={isCardSelected || isMe ? 'text-slate-950 font-black' : 'text-amber-300 font-bold'}>
                                {cc.empNo}
                              </span>
                              <span className={isCardSelected || isMe ? 'text-slate-900 font-bold' : 'text-cyan-300'}>
                                {cc.time?.split('-')[1]?.trim()}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-[10px] text-slate-400 italic py-1">No Crew Controller Desks personnel listed</div>
                    )}
                  </div>
                )}

                {/* 2. 1Stbk (Outstation Stepback) */}
                {(activeCategoryFilter === 'ALL' || activeCategoryFilter === 'STBK') && (
                  <div className="bg-[#0e1628] border border-indigo-800/80 rounded-xl p-2.5 space-y-1.5 shadow-sm">
                    <div className="text-[10px] font-black uppercase text-slate-300 tracking-wider flex items-center justify-between border-b border-slate-700/80 pb-1.5">
                      <span className="flex items-center gap-1.5 text-indigo-400">
                        <MapPin className="w-3.5 h-3.5" />
                        1Stbk (Outstation Stepback)
                      </span>
                      <span className="text-indigo-400 font-mono font-bold">II GSA / PUTH • {filteredStepbacks.length} STAFF</span>
                    </div>
                    {filteredStepbacks.length > 0 ? (
                      <div className={activeCategoryFilter === 'STBK' ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2' : 'space-y-1.5'}>
                        {filteredStepbacks.map((sb, i) => {
                          const isMe = effectiveEmpId && String(sb.empNo || sb.empId || '').toLowerCase() === effectiveEmpId.toLowerCase();
                          const isCardSelected = selectedRightItem?.category === '1Stbk' && selectedRightItem?.empNo === sb.empNo;
                          return (
                            <div 
                              key={i} 
                              onClick={() => {
                                setSelectedRightItem({ category: '1Stbk', label: sb.station || 'STBK', ...sb });
                                setSelectedDutyId(null);
                              }}
                              className={`flex items-center justify-between p-2 rounded-lg text-[10px] font-mono transition cursor-pointer border ${
                                isCardSelected
                                  ? 'bg-indigo-400 text-slate-950 font-black border-indigo-200 shadow ring-2 ring-indigo-200'
                                  : isMe
                                    ? 'bg-amber-400 text-slate-950 font-black border-amber-300 shadow ring-2 ring-amber-300'
                                    : 'bg-[#121c34] hover:bg-[#1a284a] border-slate-700/80 text-white'
                              }`}
                            >
                              <span className={`font-black px-1.5 py-0.5 rounded text-[10px] w-12 text-center ${
                                isCardSelected || isMe ? 'bg-black/30 text-slate-950' : 'bg-indigo-950 text-indigo-300 border border-indigo-600'
                              }`}>
                                {sb.station || 'STBK'}
                              </span>
                              <span className="font-extrabold truncate max-w-[120px] text-white">
                                {sb.name}
                              </span>
                              <span className={isCardSelected || isMe ? 'text-slate-950 font-black' : 'text-amber-300 font-bold'}>
                                {sb.empNo}
                              </span>
                              <span className={isCardSelected || isMe ? 'text-slate-900 font-bold' : 'text-cyan-300'}>
                                {sb.time}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-[10px] text-slate-400 italic py-1">No 1Stbk (Outstation Stepback) staff listed</div>
                    )}
                  </div>
                )}

                {/* 3. NGSA (Nagasandra Stepback & Coverage) */}
                {(activeCategoryFilter === 'ALL' || activeCategoryFilter === 'NGSA') && (
                  <div className="bg-[#0e1628] border border-cyan-800/80 rounded-xl p-2.5 space-y-1.5 shadow-sm">
                    <div className="text-[10px] font-black uppercase text-cyan-300 tracking-wider flex items-center justify-between border-b border-slate-700/80 pb-1.5">
                      <span className="flex items-center gap-1.5 text-cyan-400">
                        <MapPin className="w-3.5 h-3.5" />
                        NGSA
                      </span>
                      <span className="text-cyan-300 font-mono font-bold">NAGASANDRA • {filteredNgsa.length} STAFF</span>
                    </div>
                    {filteredNgsa.length > 0 ? (
                      <div className={activeCategoryFilter === 'NGSA' ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2' : 'space-y-1.5'}>
                        {filteredNgsa.map((ng, i) => {
                          const isMe = effectiveEmpId && String(ng.empNo || ng.empId || '').toLowerCase() === effectiveEmpId.toLowerCase();
                          const isCardSelected = selectedRightItem?.category === 'NGSA' && selectedRightItem?.empNo === ng.empNo;
                          return (
                            <div 
                              key={i} 
                              onClick={() => {
                                setSelectedRightItem({ category: 'NGSA', label: ng.station || 'NGSA', ...ng });
                                setSelectedDutyId(null);
                              }}
                              className={`flex items-center justify-between p-2 rounded-lg text-[10px] font-mono transition cursor-pointer border ${
                                isCardSelected
                                  ? 'bg-cyan-400 text-slate-950 font-black border-cyan-200 shadow ring-2 ring-cyan-200'
                                  : isMe
                                    ? 'bg-amber-400 text-slate-950 font-black border-amber-300 shadow ring-2 ring-amber-300'
                                    : 'bg-[#121c34] hover:bg-[#1a284a] border-slate-700/80 text-white'
                              }`}
                            >
                              <span className={`font-black px-1.5 py-0.5 rounded text-[10px] w-12 text-center ${
                                isCardSelected || isMe ? 'bg-black/30 text-slate-950' : 'bg-cyan-950 text-cyan-300 border border-cyan-600'
                              }`}>
                                {ng.station || 'NGSA'}
                              </span>
                              <span className={`font-extrabold truncate max-w-[120px] ${isCardSelected || isMe ? 'text-slate-950' : 'text-white'}`}>
                                {ng.name}
                              </span>
                              <span className={isCardSelected || isMe ? 'text-slate-950 font-black' : 'text-amber-300 font-bold'}>
                                {ng.empNo}
                              </span>
                              <span className={isCardSelected || isMe ? 'text-slate-900 font-bold' : 'text-cyan-300'}>
                                {ng.time}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-[10px] text-slate-400 italic py-1">No NGSA Staff Listed</div>
                    )}
                  </div>
                )}

                {/* 4. Standby / Over-Rest (OR) */}
                {(activeCategoryFilter === 'ALL' || activeCategoryFilter === 'OR') && (
                  <div className="bg-[#0e1628] border border-amber-800/80 rounded-xl p-2.5 space-y-1.5 shadow-sm">
                    <div className="text-[10px] font-black uppercase text-amber-400 tracking-wider border-b border-slate-700/80 pb-1.5 flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-amber-400">
                        <Clock className="w-3.5 h-3.5" />
                        Standby / Over-Rest (OR)
                      </span>
                      <span className="font-mono font-bold text-amber-300">{filteredStandbys.length} STAFF</span>
                    </div>
                    {filteredStandbys.length > 0 ? (
                      <div className={activeCategoryFilter === 'OR' ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2' : 'space-y-1.5'}>
                        {filteredStandbys.map((or, i) => {
                          const isMe = effectiveEmpId && String(or.empNo || or.empId || '').toLowerCase() === effectiveEmpId.toLowerCase();
                          const isCardSelected = selectedRightItem?.category === 'OR' && selectedRightItem?.empNo === or.empNo;
                          return (
                            <div 
                              key={i} 
                              onClick={() => {
                                setSelectedRightItem({ category: 'OR', label: or.code || 'OR', ...or });
                                setSelectedDutyId(null);
                              }}
                              className={`flex items-center justify-between p-2 rounded-lg text-[10px] font-mono transition cursor-pointer border ${
                                isCardSelected
                                  ? 'bg-amber-400 text-slate-950 font-black border-amber-200 shadow ring-2 ring-amber-200'
                                  : isMe
                                    ? 'bg-amber-400 text-slate-950 font-black border-amber-300 ring-2 ring-amber-300'
                                    : 'bg-[#121c34] hover:bg-[#1a284a] border-slate-700/80 text-white'
                              }`}
                            >
                              <span className={`font-black px-1.5 py-0.5 rounded text-[10px] ${
                                isCardSelected || isMe ? 'bg-black/30 text-slate-950' : 'bg-amber-950 text-amber-300 border border-amber-600'
                              }`}>
                                {or.code || 'OR'}
                              </span>
                              <span className="font-extrabold truncate max-w-[130px] text-white">
                                {or.name}
                              </span>
                              <span className={isCardSelected || isMe ? 'text-slate-950 font-black' : 'text-amber-300 font-bold'}>
                                {or.empNo}
                              </span>
                              <span className={isCardSelected || isMe ? 'text-slate-900 font-bold' : 'text-cyan-300'}>
                                {or.time}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-[10px] text-slate-400 italic py-1">No Standby / Over-Rest staff listed</div>
                    )}
                  </div>
                )}

                {/* 5. Weekly Off (WO) */}
                {(activeCategoryFilter === 'ALL' || activeCategoryFilter === 'WO') && (
                  <div className="bg-[#0e1628] border border-amber-800/80 rounded-xl p-2.5 space-y-1.5 shadow-sm">
                    <div className="text-[10px] font-black uppercase text-amber-400 tracking-wider flex items-center justify-between border-b border-slate-700/80 pb-1.5">
                      <span className="flex items-center gap-1.5 text-amber-400">
                        <Calendar className="w-3.5 h-3.5" />
                        Weekly Off (WO)
                      </span>
                      <span className="font-mono font-bold bg-amber-400 text-slate-950 px-2 py-0.5 rounded text-[9px]">
                        {filteredWeeklyOffs.length} STAFF
                      </span>
                    </div>
                    {filteredWeeklyOffs.length > 0 ? (
                      <div className={activeCategoryFilter === 'WO' ? 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2' : 'grid grid-cols-2 gap-1.5 max-h-52 overflow-y-auto pr-1'}>
                        {filteredWeeklyOffs.map((wo, i) => {
                          const isMe = effectiveEmpId && String(wo.empNo || wo.empId || '').toLowerCase() === effectiveEmpId.toLowerCase();
                          const isCardSelected = selectedRightItem?.category === 'WO' && selectedRightItem?.empNo === wo.empNo;
                          return (
                            <div 
                              key={i} 
                              onClick={() => {
                                setSelectedRightItem({ category: 'WO', label: 'WEEKLY OFF', ...wo });
                                setSelectedDutyId(null);
                              }}
                              className={`p-1.5 rounded-lg text-[10px] font-mono flex items-center justify-between transition cursor-pointer border ${
                                isCardSelected
                                  ? 'bg-amber-400 text-slate-950 font-black border-amber-200 shadow ring-2 ring-amber-200'
                                  : isMe 
                                    ? 'bg-amber-400 text-slate-950 font-black border-amber-300 ring-2 ring-amber-300' 
                                    : 'bg-[#121c34] hover:bg-[#1a284a] border-slate-700/80 text-white'
                              }`}
                            >
                              <span className={`font-bold truncate max-w-[95px] ${isCardSelected || isMe ? 'text-slate-950' : 'text-white'}`}>
                                {wo.name}
                              </span>
                              <span className={`text-[9px] font-mono font-black ${isCardSelected || isMe ? 'text-slate-950' : 'text-amber-300'}`}>
                                {wo.empNo}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-[10px] text-slate-400 italic py-1">No Weekly Off personnel listed</div>
                    )}
                  </div>
                )}

                {/* 6. Leaves & Medical (CL/EL/ML) */}
                {(activeCategoryFilter === 'ALL' || activeCategoryFilter === 'LEAVE') && (
                  <div className="bg-[#0e1628] border border-rose-800/80 rounded-xl p-2.5 space-y-1.5 shadow-sm">
                    <div className="text-[10px] font-black uppercase text-rose-400 tracking-wider flex items-center justify-between border-b border-slate-700/80 pb-1.5">
                      <span className="flex items-center gap-1.5 text-rose-400">
                        <AlertCircle className="w-3.5 h-3.5" />
                        Leaves & Medical (CL/EL/ML)
                      </span>
                      <span className="font-mono font-bold text-rose-400">{filteredLeaves.length + filteredAbsents.length} STAFF</span>
                    </div>
                    {filteredLeaves.length > 0 || filteredAbsents.length > 0 ? (
                      <div className={activeCategoryFilter === 'LEAVE' ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2' : 'space-y-1.5 max-h-48 overflow-y-auto pr-1'}>
                        {filteredLeaves.map((lv, i) => {
                          const isMe = effectiveEmpId && String(lv.empNo || lv.empId || '').toLowerCase() === effectiveEmpId.toLowerCase();
                          const isCardSelected = selectedRightItem?.category === 'LEAVE' && selectedRightItem?.empNo === lv.empNo;
                          return (
                            <div 
                              key={i} 
                              onClick={() => {
                                setSelectedRightItem({ category: 'LEAVE', label: lv.type || 'LEAVE', ...lv });
                                setSelectedDutyId(null);
                              }}
                              className={`p-1.5 rounded-lg text-[10px] font-mono flex items-center justify-between transition cursor-pointer border ${
                                isCardSelected
                                  ? 'bg-rose-400 text-slate-950 font-black border-rose-200 shadow ring-2 ring-rose-200'
                                  : isMe 
                                    ? 'bg-amber-400 text-slate-950 font-black border-amber-300' 
                                    : 'bg-[#121c34] hover:bg-[#1a284a] border-slate-700/80 text-white'
                              }`}
                            >
                              <span className={`font-black px-1.5 py-0.2 rounded text-[10px] w-8 text-center ${
                                isCardSelected || isMe ? 'bg-black/30 text-slate-950' : 'bg-rose-950 text-rose-300 border border-rose-600'
                              }`}>
                                {lv.type || 'L'}
                              </span>
                              <span className={`font-bold truncate max-w-[120px] ${isCardSelected || isMe ? 'text-slate-950' : 'text-white'}`}>
                                {lv.name}
                              </span>
                              <span className={isCardSelected || isMe ? 'text-slate-950 font-black' : 'text-amber-300 font-bold'}>
                                {lv.empNo}
                              </span>
                              <span className={isCardSelected || isMe ? 'text-slate-900 font-bold' : 'text-slate-400'}>
                                {lv.from || ''}
                              </span>
                            </div>
                          );
                        })}
                        {filteredAbsents.map((ab, i) => (
                          <div key={`ab_${i}`} className="p-1.5 rounded-lg bg-red-950/80 border border-red-500/80 text-[10px] font-mono flex items-center justify-between text-white">
                            <span className="font-black bg-red-500 text-black px-1.5 py-0.2 rounded text-[10px]">AB</span>
                            <span className="font-bold truncate max-w-[120px] text-red-200">{ab.name}</span>
                            <span className="text-amber-300 font-bold">{ab.empNo}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-[10px] text-slate-400 italic py-1">No Leaves & Medical records listed</div>
                    )}
                  </div>
                )}

                {/* 7. BO (Booked Off) */}
                {(activeCategoryFilter === 'ALL' || activeCategoryFilter === 'BO') && (
                  <div className="bg-[#0e1628] border border-purple-800/80 rounded-xl p-2.5 space-y-1.5 shadow-sm">
                    <div className="text-[10px] font-black uppercase text-purple-300 tracking-wider flex items-center justify-between border-b border-slate-700/80 pb-1.5">
                      <span className="flex items-center gap-1.5 text-purple-400">
                        <ShieldCheck className="w-3.5 h-3.5" />
                        BO
                      </span>
                      <span className="font-mono font-bold text-purple-300">{filteredBookedOff.length} STAFF</span>
                    </div>
                    {filteredBookedOff.length > 0 ? (
                      <div className={activeCategoryFilter === 'BO' ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2' : 'space-y-1.5 max-h-40 overflow-y-auto pr-1'}>
                        {filteredBookedOff.map((bo, i) => {
                          const isMe = effectiveEmpId && String(bo.empNo || bo.empId || '').toLowerCase() === effectiveEmpId.toLowerCase();
                          const isCardSelected = selectedRightItem?.category === 'BO' && selectedRightItem?.empNo === bo.empNo;
                          return (
                            <div 
                              key={i} 
                              onClick={() => {
                                setSelectedRightItem({ category: 'BO', label: 'BOOKED OFF', ...bo });
                                setSelectedDutyId(null);
                              }}
                              className={`flex items-center justify-between p-2 rounded-lg text-[10px] font-mono transition cursor-pointer border ${
                                isCardSelected
                                  ? 'bg-purple-400 text-slate-950 font-black border-purple-200 shadow ring-2 ring-purple-200'
                                  : isMe
                                    ? 'bg-amber-400 text-slate-950 font-black border-amber-300 shadow ring-2 ring-amber-300'
                                    : 'bg-[#121c34] hover:bg-[#1a284a] border-slate-700/80 text-white'
                              }`}
                            >
                              <span className={`font-black px-1.5 py-0.5 rounded text-[10px] w-8 text-center ${
                                isCardSelected || isMe ? 'bg-black/30 text-slate-950' : 'bg-purple-950 text-purple-300 border border-purple-600'
                              }`}>
                                BO
                              </span>
                              <span className={`font-extrabold truncate max-w-[120px] ${isCardSelected || isMe ? 'text-slate-950' : 'text-white'}`}>
                                {bo.name}
                              </span>
                              <span className={isCardSelected || isMe ? 'text-slate-950 font-black' : 'text-amber-300 font-bold'}>
                                {bo.empNo}
                              </span>
                              <span className={isCardSelected || isMe ? 'text-slate-900 font-bold' : 'text-purple-300'}>
                                {bo.from || bo.period || ''} {bo.to ? `➔ ${bo.to}` : ''}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-[10px] text-slate-400 italic py-1">No Booked Off (BO) staff listed</div>
                    )}
                  </div>
                )}

                {/* 8. CRRC Training / Special Programs */}
                {crrcTraining.length > 0 && (activeCategoryFilter === 'ALL' || activeCategoryFilter === 'TRAINING') && (
                  <div className="bg-[#0e1628] border border-slate-800 rounded-xl p-2.5 space-y-1.5 shadow-sm">
                    <div className="text-[10px] font-black uppercase text-sky-400 tracking-wider flex items-center justify-between border-b border-slate-700/80 pb-1.5">
                      <span>RS CRRC-DM 440kms Trg</span>
                      <span className="font-mono font-bold text-sky-400">{crrcTraining.length}</span>
                    </div>
                    <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                      {crrcTraining.map((trg, i) => {
                        const isCardSelected = selectedRightItem?.category === 'TRAINING' && selectedRightItem?.empNo === trg.empNo;
                        return (
                          <div 
                            key={i} 
                            onClick={() => {
                              setSelectedRightItem({ category: 'TRAINING', label: 'CRRC TRAINING', ...trg });
                              setSelectedDutyId(null);
                            }}
                            className={`p-1.5 rounded-lg text-[10px] font-mono flex items-center justify-between transition cursor-pointer border ${
                              isCardSelected
                                ? 'bg-sky-400 text-slate-950 font-black border-sky-200 shadow'
                                : 'bg-[#121c34] hover:bg-[#1a284a] border-slate-700/80 text-white'
                            }`}
                          >
                            <span className={`font-bold truncate max-w-[120px] ${isCardSelected ? 'text-slate-950' : 'text-white'}`}>
                              {trg.name}
                            </span>
                            <span className={isCardSelected ? 'text-slate-950 font-black' : 'text-amber-300 font-bold'}>
                              {trg.empNo}
                            </span>
                            <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded ${
                              isCardSelected ? 'bg-black/30 text-slate-950' : 'bg-sky-950 text-sky-300 border border-sky-600'
                            }`}>
                              RS Trg
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 9. Additional Dynamic Category Pages / Registers (e.g. Temporary WHTT / CC, Rel) */}
                {Object.entries(customRegs).map(([catName, list]) => {
                  if (
                    catName.includes('CRRC 4RS') ||
                    catName.includes('RS CRRC') ||
                    /NGSA/i.test(catName) ||
                    /\b(BO|BOOK\s*OFF)\b/i.test(catName) ||
                    !Array.isArray(list) ||
                    list.length === 0
                  ) {
                    return null;
                  }
                  const filteredDynamic = list.filter(matchesSearch);
                  return (
                    <div key={catName} className="bg-[#0e1628] border border-slate-800 rounded-xl p-2.5 space-y-1.5 shadow-sm">
                      <div className="text-[10px] font-black uppercase text-amber-400 tracking-wider flex items-center justify-between border-b border-slate-700/80 pb-1.5">
                        <span className="truncate max-w-[180px]">{catName}</span>
                        <span className="font-mono font-bold text-amber-400">{filteredDynamic.length} STAFF</span>
                      </div>
                      <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                        {filteredDynamic.map((item, i) => {
                          const sItem = sanitizeItem(item);
                          const isCardSelected = selectedRightItem?.category === catName && selectedRightItem?.empNo === sItem.empNo;
                          return (
                            <div 
                              key={i} 
                              onClick={() => {
                                setSelectedRightItem({ category: catName, label: catName, ...sItem });
                                setSelectedDutyId(null);
                              }}
                              className={`p-1.5 rounded-lg text-[10px] font-mono flex items-center justify-between transition cursor-pointer border ${
                                isCardSelected
                                  ? 'bg-amber-400 text-slate-950 font-black border-amber-200 shadow'
                                  : 'bg-[#121c34] hover:bg-[#1a284a] border-slate-700/80 text-white'
                              }`}
                            >
                              <span className="font-bold truncate max-w-[120px]">{sItem.name}</span>
                              <span className={isCardSelected ? 'text-slate-950 font-black' : 'text-amber-300 font-bold'}>{sItem.empNo}</span>
                              <span className={isCardSelected ? 'text-slate-900 font-bold' : 'text-slate-400'}>{sItem.time || sItem.code || ''}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}

              </div>
            )}

            </div>

          </div>
        )}
      </div>

    </div>
  );
}
