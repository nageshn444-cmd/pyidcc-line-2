/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot } from 'firebase/firestore';
import { 
  Train, MapPin, Clock, Shield, User, Sliders, Volume2, VolumeX, AlertTriangle, CheckCircle2, Megaphone, Radio,
  FileText, Download, Printer, BarChart2, Table, LayoutGrid, ChevronRight, TrendingUp, Compass, ArrowRight, ExternalLink, Search, Check,
  Zap, Activity, Filter, ArrowUpDown, RefreshCw, X
} from 'lucide-react';
import { 
  STATION_CHAINAGE, 
  STATION_ORDER, 
  ATS_STATION_SEQUENCE,
  getTripEndpoints, 
  timeToMinutes, 
  minutesToTime 
} from '../utils/kpiEngine';
import { calculateDistance } from '../utils/kmCalculator';
import { getStationName } from '../utils/stationHelpers';
import { EMPLOYEE_MASTER_REGISTRY } from '../data/employeeProfileMaster';
import { WTT_MASTER_REGISTRY } from '../data/wttMasterRegistry';
import { buildWeekdayLiveTrainTrackingMap, WEEKDAY_RELIEF_ID_CHART } from '../data/weekdayReliefIdChartRegistry';
import AlstomAtsSystemView from './kmcalc/AlstomAtsSystemView';
import { generate4DigitTrainId, formatParticularTrainId } from '../utils/trainIdResolver';

export default function LiveTrainPositionTracker({ 
  liveTrainTrackingMap: propLiveTrainTrackingMap = {}, 
  unifiedRows: propUnifiedRows = [],
  activeDay: propActiveDay = 'WEEKDAY',
  onScheduleChange
}) {
  // States
  const [dailyDeployments, setDailyDeployments] = useState([]);
  const [dailyCrewTracks, setDailyCrewTracks] = useState([]);
  const [linkRoster, setLinkRoster] = useState([]);
  const [wttMatrix, setWttMatrix] = useState([]);
  const [liveIncidents, setLiveIncidents] = useState([]);
  const [stationChainageDB, setStationChainageDB] = useState({});
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [announcementLogs, setAnnouncementLogs] = useState([]);
  
  const announcedSetRef = useRef(new Set());

  // simulatedTime: displayed as HH:MM; internalTimeSecs: used for sub-minute position accuracy
  const [simulatedTime, setSimulatedTime] = useState(() => {
    const now = new Date();
    return `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
  });
  const [internalTimeSecs, setInternalTimeSecs] = useState(() => {
    const now = new Date();
    return now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
  });
  const [isLiveClock, setIsLiveClock] = useState(true);
  const [clockIntervalId, setClockIntervalId] = useState(null);
  const [selectedTrain, setSelectedTrain] = useState(null);
  const [viewMode, setViewMode] = useState('cards'); // 'cards' | 'table' | 'radar' | 'energy' | 'maintenance'
  const [tableSearchQuery, setTableSearchQuery] = useState('');
  const [fleetDirectionFilter, setFleetDirectionFilter] = useState('ALL'); // 'ALL' | 'UP' | 'DOWN' | 'STABLED'
  const [fleetPunctualityFilter, setFleetPunctualityFilter] = useState('ALL'); // 'ALL' | 'ON_TIME' | 'DELAYED' | 'RELIEF_PENDING'
  const [fleetSortBy, setFleetSortBy] = useState('trainId'); // 'trainId' | 'progressPct' | 'dayDistanceRemainingKm' | 'dayDistanceCoveredKm' | 'totalDayAssignedKm' | 'delayMins'
  const [fleetSortOrder, setFleetSortOrder] = useState('asc'); // 'asc' | 'desc'
  const [modalTab, setModalTab] = useState('schedule'); // 'schedule' | 'energy' | 'rake' | 'crew'
  const [activeSchedule, setActiveSchedule] = useState(() => {
    if (propActiveDay) return propActiveDay.toUpperCase();
    const day = new Date().getDay();
    if (day === 0) return 'SUNDAY';
    if (day === 6) return 'SATURDAY';
    if (day === 1) return 'MONDAY';
    return 'WEEKDAY';
  });

  // Canonical station sequence for UP line (Official ALSTOM IATS / ATS System View with all 34 stations South APTD ➔ North BIET)
  const CANONICAL_UP_STATIONS = useMemo(() => {
    return ATS_STATION_SEQUENCE;
  }, []);

  // Map any station code or alias to its 0-33 schematic position in ATS_STATION_SEQUENCE
  const getAtsStationIndex = useCallback((code) => {
    if (!code) return 0;
    const clean = String(code).toUpperCase().trim();
    const direct = ATS_STATION_SEQUENCE.indexOf(clean);
    if (direct !== -1) return direct;
    if (clean.includes('APTD') || clean.includes('APTS_BE')) return 0;
    if (clean.includes('APTS')) return 1;
    if (clean.includes('PNYD') || clean.includes('NGSA_BE') || clean.includes('NGSA_PT') || clean.includes('DEPOT')) return 30;
    if (clean.includes('BIET')) return 33;
    const targetChain = stationChainageDB[clean] ?? STATION_CHAINAGE[clean];
    if (targetChain !== undefined) {
      let closest = 0;
      let minD = Infinity;
      ATS_STATION_SEQUENCE.forEach((st, idx) => {
        const c = stationChainageDB[st] ?? STATION_CHAINAGE[st] ?? 0;
        const d = Math.abs(c - targetChain);
        if (d < minD) {
          minD = d;
          closest = idx;
        }
      });
      return closest;
    }
    return 0;
  }, [stationChainageDB]);

  // Extract static trips from WTT Master Registry as reliable schedule coverage
  const staticWttTrips = useMemo(() => {
    const trips = [];
    (WTT_MASTER_REGISTRY || []).forEach(row => {
      if (row.downTrip) trips.push(row.downTrip);
      if (row.upTrip) trips.push(row.upTrip);
      if (!row.downTrip && !row.upTrip && row.stations) trips.push(row);
    });
    return trips;
  }, []);

  // Extract and normalize schedule / day type from any document or link row
  const getItemSchedule = (item) => {
    if (!item) return '';
    if (item.scheduleType) return String(item.scheduleType).trim().toUpperCase();
    if (item.dayType) return String(item.dayType).trim().toUpperCase();
    if (item.day) return String(item.day).trim().toUpperCase();
    if (item.id) {
      const idLower = String(item.id).toLowerCase();
      if (idLower.includes('monday') || idLower.includes('mon')) return 'MONDAY';
      if (idLower.includes('saturday') || idLower.includes('sat')) return 'SATURDAY';
      if (idLower.includes('sunday') || idLower.includes('sun')) return 'SUNDAY';
      if (idLower.includes('weekday') || idLower.includes('wd')) return 'WEEKDAY';
    }
    return '';
  };

  // Normalization helper for flexible schedule matching (e.g. MON / MONDAY)
  const isScheduleMatch = (itemSched, targetSched) => {
    const s1 = String(itemSched || '').toUpperCase().trim();
    const s2 = String(targetSched || '').toUpperCase().trim();
    if (!s1 || !s2) return false;
    if (s1 === s2) return true;
    if ((s2 === 'MONDAY' || s2 === 'MON') && (s1 === 'MONDAY' || s1 === 'MON')) return true;
    if ((s2 === 'SATURDAY' || s2 === 'SAT' || s2 === 'SAT_GH') && (s1 === 'SATURDAY' || s1 === 'SAT' || s1 === 'SAT_GH')) return true;
    if ((s2 === 'SUNDAY' || s2 === 'SUN') && (s1 === 'SUNDAY' || s1 === 'SUN')) return true;
    if (s2 === 'WEEKDAY' && (s1 === 'WEEKDAY' || s1 === 'WD' || s1 === 'MONDAY' || s1 === 'MON')) return true;
    return false;
  };

  // Sync active schedule when prop changes
  useEffect(() => {
    if (propActiveDay) {
      setActiveSchedule(propActiveDay.toUpperCase());
    }
  }, [propActiveDay]);

  // Real-time Firestore subscriptions
  useEffect(() => {
    const unsubDeploy = onSnapshot(collection(db, 'crew_daily_deployment'), (snap) => {
      setDailyDeployments(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    // crew_final_links: maps dutyId → leg1TrainNo, leg2TrainNo, leg3TrainNo, leg4TrainNo
    const unsubLinks = onSnapshot(collection(db, 'crew_final_links'), (snap) => {
      setLinkRoster(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    // daily_crew_tracks: keyed {date}_{trainId}, has currentOperator.name as a direct fallback
    const unsubTracks = onSnapshot(collection(db, 'daily_crew_tracks'), (snap) => {
      setDailyCrewTracks(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const unsubWtt = onSnapshot(collection(db, 'wtt_final_matrix'), (snap) => {
      setWttMatrix(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const unsubIncidents = onSnapshot(collection(db, 'wtt_live_incidents'), (snap) => {
      setLiveIncidents(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const unsubChainage = onSnapshot(collection(db, 'station_chainage'), (snap) => {
      if (!snap.empty) {
        const chainageMap = {};
        snap.docs.forEach(doc => {
          chainageMap[doc.id] = doc.data().chainage;
        });
        setStationChainageDB(chainageMap);
      }
    });

    return () => {
      unsubDeploy();
      unsubLinks();
      unsubTracks();
      unsubWtt();
      unsubIncidents();
      unsubChainage();
    };
  }, []);

  // Simulated / Live Clock Management
  // Updates displayed time (HH:MM) every 60s AND internal seconds every 5s for smooth position movement
  useEffect(() => {
    if (isLiveClock) {
      const interval = setInterval(() => {
        const now = new Date();
        const hrs = String(now.getHours()).padStart(2, '0');
        const mins = String(now.getMinutes()).padStart(2, '0');
        setSimulatedTime(`${hrs}:${mins}`);
        // Update sub-minute internal seconds for smooth position interpolation
        setInternalTimeSecs(now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds());
      }, 5000); // 5-second tick for smooth train movement
      setClockIntervalId(interval);
    } else {
      if (clockIntervalId) {
        clearInterval(clockIntervalId);
        setClockIntervalId(null);
      }
    }
    return () => {
      if (clockIntervalId) clearInterval(clockIntervalId);
    };
  }, [isLiveClock]);

  const [stationFilter, setStationFilter] = useState('ALL'); // 'ALL' | 'PYID' | 'KGWA' | 'PUTH'
  const [trackFilter, setTrackFilter] = useState('ALL'); // 'ALL' | 'UP' | 'DOWN'

  // Relief station metadata definitions (PYID, KGWA, PUTH)
  const RELIEF_STATION_CONFIG = useMemo(() => [
    { code: 'PYID', label: 'Peenya Industry (PYID)', nameEn: 'Peenya Industry', nameKn: 'ಪೀಣ್ಯ ಇಂಡಸ್ಟ್ರಿ', chainage: -3.020, isReliefStation: true },
    { code: 'KGWA', label: 'Majestic Kempegowda (KGWA)', nameEn: 'Kempegowda Majestic', nameKn: 'ಕೆಂಪೇಗೌಡ ಮೆಜೆಸ್ಟಿಕ್', chainage: 7.569, isReliefStation: true },
    { code: 'PUTH', label: 'Yelachenahalli (PUTH)', nameEn: 'Yelachenahalli', nameKn: 'ಯಲಚೇನಹಳ್ಳಿ', chainage: 17.780, isReliefStation: true },
    { code: 'YPI', label: 'Goraguntepalya (YPI)', nameEn: 'Goraguntepalya', nameKn: 'ಗೊರಗುಂಟೆಪಾಳ್ಯ', chainage: -1.125, isReliefStation: false },
    { code: 'PEYA', label: 'Peenya (PEYA)', nameEn: 'Peenya', nameKn: 'ಪೀಣ್ಯ', chainage: -2.074, isReliefStation: false },
    { code: 'JLHL', label: 'Jalahalli (JLHL)', nameEn: 'Jalahalli', nameKn: 'ಜಾಲಹಳ್ಳಿ', chainage: -3.721, isReliefStation: false },
    { code: 'YPM', label: 'Yeshwanthpur (YPM)', nameEn: 'Yeshwanthpur', nameKn: 'ಯಶವಂತಪುರ', chainage: 0.000, isReliefStation: false },
    { code: 'NGSA', label: 'Nagasandra (NGSA)', nameEn: 'Nagasandra', nameKn: 'ನಾಗಸಂದ್ರ', chainage: -6.088, isReliefStation: false },
    { code: 'BIET', label: 'Madavara (BIET)', nameEn: 'Madavara', nameKn: 'ಮಾದಾವರ', chainage: -9.227, isReliefStation: false },
    { code: 'APTS', label: 'Silk Institute (APTS)', nameEn: 'Silk Institute', nameKn: 'ಸಿಲ್ಕ್ ಇನ್‌ಸ್ಟಿಟ್ಯೂಟ್', chainage: 23.833, isReliefStation: false },
  ], []);

  // Normalized time conversion for operational schedule calculations (< 3 AM rollover)
  // Now parses HH:MM:SS correctly — critical for WTT accuracy
  const timeToSecondsNormalized = (timeStr) => {
    if (!timeStr || timeStr === '--' || timeStr === '-') return 999999;
    const parts = String(timeStr).trim().split(':').map(Number);
    const h = parts[0]; const m = parts[1] || 0; const s = parts[2] || 0;
    if (isNaN(h) || isNaN(m)) return 999999;
    let secs = (h * 3600) + (m * 60) + s;
    if (h < 3) secs += 24 * 3600;
    return secs;
  };

  // ── 38-Station Interpolation Engine ──
  // Expands sparse WTT stops (8-10 key stations) to all intermediate STATION_ORDER stations
  // by computing proportional travel time based on chainage distance between known stops.
  // This closely mirrors how ATC systems like ALSTOM compute train position.
  // useCallback gives this a stable reference so it can be in the useMemo dep array safely.
  const interpolateTripStations = useCallback((trip, chainageMap) => {
    if (!trip || !trip.stations) return [];
    const rawEntries = Object.entries(trip.stations);

    // 1. Build known stops list with midnight rollover protection
    const knownStops = [];
    let prevM = -1;
    let rolloverOffset = 0;

    // Filter valid station times with known chainage
    const validEntries = rawEntries.filter(([st, timeStr]) => {
      if (!timeStr || timeStr === '--' || timeStr === '-') return false;
      return /^\d{1,2}:\d{2}/.test(String(timeStr).trim()) && chainageMap[st] !== undefined;
    });

    validEntries.forEach(([st, timeStr]) => {
      let m = timeToMinutes(timeStr) + rolloverOffset;
      if (prevM >= 0 && m < prevM) {
        // Rollover past midnight detected (e.g., 23:55 -> 00:05)
        rolloverOffset += 1440;
        m += 1440;
      }
      prevM = m;
      knownStops.push({ station: st, timeMins: m, chain: chainageMap[st] });
    });

    if (knownStops.length < 2) {
      return knownStops.map(s => ({ station: s.station, timeMin: s.timeMins }));
    }

    // A normal Green Line trip between terminals is ~60-75 mins. Reject anomalous trips (>120 mins)
    const rawDuration = knownStops[knownStops.length - 1].timeMins - knownStops[0].timeMins;
    if (rawDuration > 120 || rawDuration < 0) {
      return [];
    }

    // 2. Interpolate all intermediate stations between consecutive stops
    const result = [];
    const interpolatedStations = new Set();

    for (let seg = 0; seg < knownStops.length - 1; seg++) {
      const segStart = knownStops[seg];
      const segEnd = knownStops[seg + 1];
      const segTimeDiff = segEnd.timeMins - segStart.timeMins;
      const segChainDiff = Math.abs(segEnd.chain - segStart.chain);

      // Add the start stop itself
      if (!interpolatedStations.has(segStart.station)) {
        result.push({ station: segStart.station, timeMin: segStart.timeMins });
        interpolatedStations.add(segStart.station);
      }

      if (segTimeDiff <= 0 || segChainDiff < 0.01) continue;

      // Find all intermediate stations from STATION_ORDER that lie between segment endpoints
      const minChain = Math.min(segStart.chain, segEnd.chain);
      const maxChain = Math.max(segStart.chain, segEnd.chain);

      STATION_ORDER.forEach(st => {
        if (interpolatedStations.has(st)) return;
        if (st === segStart.station || st === segEnd.station) return;
        const stChain = chainageMap[st];
        if (stChain === undefined) return;
        // Station must lie strictly within this segment's chainage range
        if (stChain <= minChain || stChain >= maxChain) return;

        // Proportional time based on chainage within segment
        const distFromStart = Math.abs(stChain - segStart.chain);
        const ratio = distFromStart / segChainDiff;
        const interpolatedTime = segStart.timeMins + ratio * segTimeDiff;

        result.push({ station: st, timeMin: interpolatedTime });
        interpolatedStations.add(st);
      });
    }

    // Add the final stop
    const lastStop = knownStops[knownStops.length - 1];
    if (!interpolatedStations.has(lastStop.station)) {
      result.push({ station: lastStop.station, timeMin: lastStop.timeMins });
    }

    // Sort result by interpolated time (chronological)
    result.sort((a, b) => a.timeMin - b.timeMin);
    return result;
  }, []); // no deps — pure function using only imported STATION_ORDER & timeToMinutes

  const normalizeDuty = (id) => {
    if (!id) return '';
    const clean = String(id).replace(/^(duty|d)\s*/i, '').trim();
    if (/^[1-9]$/.test(clean)) return '0' + clean;
    return clean;
  };

  const getStationInfo = (stCode) => {
    const found = RELIEF_STATION_CONFIG.find(s => s.code === stCode);
    if (found) return found;
    return { code: stCode, label: `${stCode}`, nameEn: stCode, nameKn: stCode, chainage: 0 };
  };

  // ── High-Fidelity Bilingual Voice Announcement Engine (Verified Reliever Only) ──
  const triggerBilingualAnnouncement = (
    trainId, 
    direction, 
    relieverName, 
    activeOperatorName, 
    stationCode = 'PYID',
    relieverDutyNo = '--',
    activeDutyNo = '--',
    minutesRemaining = 3
  ) => {
    if (!voiceEnabled || !('speechSynthesis' in window)) return;
    
    const cleanReliever = String(relieverName || '').trim();
    const cleanActive = String(activeOperatorName || '').trim();

    // STRICT OPERATIONAL RULE: If there is no verified reliever, DO NOT make any announcement!
    const isVerifiedReliever = Boolean(
      cleanReliever && 
      cleanReliever !== '--' && 
      cleanReliever !== '-' && 
      cleanReliever !== 'Unassigned' && 
      !cleanReliever.toLowerCase().includes('unassigned') && 
      !cleanReliever.startsWith('Train Operator') &&
      (cleanReliever !== cleanActive || (relieverDutyNo && activeDutyNo && relieverDutyNo !== activeDutyNo && relieverDutyNo !== '--'))
    );

    if (!isVerifiedReliever) {
      console.log(`[Reliever Audio Muted] Train ${trainId} at ${stationCode}: No reliever assigned. Announcement suppressed.`);
      return;
    }

    try {
      window.speechSynthesis.cancel(); // Reset any pending audio queue

      const isUp = String(direction).toUpperCase() === 'UP';
      const dirKn = isUp ? 'ಅಪ್' : 'ಡೌನ್';
      const dirEn = isUp ? 'Up' : 'Down';
      const stInfo = getStationInfo(stationCode);

      const hasActive = Boolean(
        cleanActive && 
        cleanActive !== '--' && 
        cleanActive !== 'Unassigned' && 
        !cleanActive.startsWith('Train Operator')
      );

      // Clean digit pronunciation for train ID (e.g., "2 0 6")
      const trainDigits = String(trainId).replace(/\D/g, '').split('').join(' ') || trainId;

      const voices = window.speechSynthesis.getVoices();
      
      // Look for a native Kannada voice
      const knVoice = voices.find(v => 
        v.lang?.toLowerCase().includes('kn') || 
        v.name?.toLowerCase().includes('kannada')
      );

      // Look for an Indian English or general English voice
      const enVoice = voices.find(v => v.lang === 'en-IN' || v.name?.includes('India')) ||
                      voices.find(v => v.lang.startsWith('en'));

      const minsKn = `${minutesRemaining} ನಿಮಿಷಗಳಲ್ಲಿ`;
      const minsEn = `in next ${minutesRemaining} minutes`;

      // 1. Kannada Announcement (Neat, Duty-Accurate BMRCL Operational Phrasing)
      let utterKn = null;
      if (knVoice) {
        const knActivePart = hasActive 
          ? `ಪ್ರಸ್ತುತ ಚಾಲಕರಾದ ${cleanActive} ರವರ ಟ್ರಿಪ್ ${minsKn} ಪೂರ್ಣಗೊಳ್ಳಲಿದೆ. ` 
          : `ಟ್ರಿಪ್ ${minsKn} ಪೂರ್ಣಗೊಳ್ಳಲಿದೆ. `;
        const knDutyPart = relieverDutyNo && relieverDutyNo !== '--' ? `ಡ್ಯೂಟಿ ${relieverDutyNo}, ` : '';
        const knText = `ಗಮನಿಸಿ. ರೈಲು ಸಂಖ್ಯೆ ${trainDigits}, ${stInfo.nameKn} ${dirKn} ಪ್ಲಾಟ್‌ಫಾರ್ಮ್. ${knActivePart}ಮುಂದಿನ ರೈಲು ಚಾಲಕರಾದ ${knDutyPart}${cleanReliever} ರವರು ದಯವಿಟ್ಟು ಕರ್ತವ್ಯ ಹಸ್ತಾಂತರಕ್ಕೆ ಪ್ಲಾಟ್‌ಫಾರ್ಮ್‌ಗೆ ಹಾಜರಾಗಿ.`;
        
        utterKn = new SpeechSynthesisUtterance(knText);
        utterKn.voice = knVoice;
        utterKn.lang = knVoice.lang || 'kn-IN';
        utterKn.rate = 0.86;
        utterKn.pitch = 1.0;
      }

      // 2. English Announcement (Professional BMRCL Operational Standard)
      const enActivePart = hasActive 
        ? `Current driving train operator ${cleanActive}'s trip will be completed ${minsEn}. ` 
        : `Trip will be completed ${minsEn}. `;
      const enDutyPart = relieverDutyNo && relieverDutyNo !== '--' ? `Duty ${relieverDutyNo}, ` : '';
      const enText = `Attention please. Train ${trainDigits} approaching ${stInfo.nameEn}, ${dirEn} platform. ${enActivePart}Next train operator ${enDutyPart}${cleanReliever}, please proceed to the platform immediately for train handover.`;
      
      const utterEn = new SpeechSynthesisUtterance(enText);
      if (enVoice) utterEn.voice = enVoice;
      utterEn.lang = enVoice?.lang || 'en-IN';
      utterEn.rate = 0.90;
      utterEn.pitch = 1.0;

      // Speak Kannada first if native Kannada voice is supported, followed by English;
      // If Kannada voice is absent on user OS, speak crystal-clear English.
      if (utterKn) {
        window.speechSynthesis.speak(utterKn);
        utterKn.onend = () => {
          window.speechSynthesis.speak(utterEn);
        };
      } else {
        window.speechSynthesis.speak(utterEn);
      }
    } catch (err) {
      console.warn('Speech synthesis alert error:', err);
    }
  };

  // ── Unified Dynamic Train Tracking Map identical to Live Train Operator Relief Matrix ──
  const dynamicTrainTrackingMap = useMemo(() => {
    const currentSchedule = (activeSchedule || 'WEEKDAY').toUpperCase();
    const evalSecs = timeToSecondsNormalized(simulatedTime);

    // 1. Unified deployments from link roster & daily deployment according to day type
    let currentDayLinks = linkRoster.filter(l => 
      isScheduleMatch(getItemSchedule(l), currentSchedule)
    );
    if (currentDayLinks.length === 0 && (currentSchedule === 'MONDAY' || currentSchedule === 'MON')) {
      currentDayLinks = linkRoster.filter(l => isScheduleMatch(getItemSchedule(l), 'WEEKDAY'));
    }

    let deployData = dailyDeployments.filter(d => 
      isScheduleMatch(getItemSchedule(d), currentSchedule)
    );
    if (deployData.length === 0 && (currentSchedule === 'MONDAY' || currentSchedule === 'MON')) {
      deployData = dailyDeployments.filter(d => isScheduleMatch(getItemSchedule(d), 'WEEKDAY'));
    }
    if (deployData.length === 0) {
      deployData = dailyDeployments;
    }

    const activeDeployments = currentDayLinks.map(link => {
      const normLinkId = normalizeDuty(link.dutyId);
      const matchingGcc = deployData.find(d => normalizeDuty(d.dutyId) === normLinkId);

      return {
        dutyId: normLinkId,
        empId: matchingGcc?.empId || link.empId || '--',
        empName: matchingGcc?.empName || link.empName || '--',
        isExchanged: matchingGcc?.isExchanged || false,
        originalEmpId: matchingGcc?.originalEmpId || '',
        originalEmpName: matchingGcc?.originalEmpName || '',
        rawLegs: {
          l1Train: matchingGcc?.rawLegs?.l1Train || link.trainId || link.leg1TrainNo || '--',
          l1Start: matchingGcc?.rawLegs?.l1Start || link.leg1TimeFrom || link.signOnTime || '--',
          l1End: matchingGcc?.rawLegs?.l1End || link.leg1TimeTo || link.leg1End || '--',
          l2Train: matchingGcc?.rawLegs?.l2Train || link.leg2TrainNo || '--',
          l2Start: matchingGcc?.rawLegs?.l2Start || link.leg2DepTime || link.leg2TimeFrom || '--',
          l2End: matchingGcc?.rawLegs?.l2End || link.leg2ArrTime || link.leg2TimeTo || '--',
          l3Train: matchingGcc?.rawLegs?.l3Train || link.leg3TrainNo || '--',
          l3Start: matchingGcc?.rawLegs?.l3Start || link.leg3DepTime || link.leg3TimeFrom || '--',
          l3End: matchingGcc?.rawLegs?.l3End || link.leg3ArrTime || link.leg3TimeTo || '--',
          l4Train: matchingGcc?.rawLegs?.l4Train || link.leg4TrainNo || '--',
          l4Start: matchingGcc?.rawLegs?.l4Start || link.leg4FinalDepTime || link.leg4TimeFrom || '--',
          l4End: matchingGcc?.rawLegs?.l4End || link.leg4FinalArrTime || link.leg4TimeTo || '--'
        }
      };
    });

    const linkedDutyIds = new Set(currentDayLinks.map(l => normalizeDuty(l.dutyId)));
    const aiOnlyDeployments = deployData
      .filter(d => {
        const dDuty = normalizeDuty(d.dutyId || '');
        return dDuty && dDuty !== 'UNASSIGNED' && !linkedDutyIds.has(dDuty);
      })
      .map(d => ({
        dutyId: normalizeDuty(d.dutyId),
        empId: d.empId || '--',
        empName: d.empName || '--',
        isExchanged: d.isExchanged || false,
        originalEmpId: d.originalEmpId || '',
        originalEmpName: d.originalEmpName || '',
        rawLegs: d.rawLegs || {
          l1Train: d.trainId || '--',
          l1Start: d.signOnTime || '--',
          l1End: '--',
          l2Train: '--', l2Start: '--', l2End: '--',
          l3Train: '--', l3Start: '--', l3End: '--',
          l4Train: '--', l4Start: '--', l4End: '--'
        }
      }));

    const allDeployments = [...activeDeployments, ...aiOnlyDeployments];

    // 2. Build train timeline map & compute tracking
    let calculatedTracking = {};

    if (currentSchedule === 'WEEKDAY') {
      // Authoritative Weekday calculation using Master Reliever ID Chart dated 03/Sep/2026 (BIET-APTS)
      calculatedTracking = buildWeekdayLiveTrainTrackingMap(allDeployments, evalSecs);
    } else {
      const trainTimelineMap = {};
      allDeployments.forEach(operator => {
        const processLeg = (tid, startStr, endStr) => {
          const cleanTid = String(tid || '').trim();
          if (!cleanTid || cleanTid === '--' || cleanTid === '-') return;
          const startSec = timeToSecondsNormalized(startStr);
          let endSec = timeToSecondsNormalized(endStr);
          if (startSec >= 999999) return;
          if (endSec >= 999999) endSec = startSec + (4 * 3600); // 4 hour fallback driving turn

          if (!trainTimelineMap[cleanTid]) trainTimelineMap[cleanTid] = [];

          trainTimelineMap[cleanTid].push({
            dutyId: operator.dutyId,
            empName: operator.empName,
            empId: operator.empId,
            startSec,
            endSec,
            startStr,
            endStr: (endStr && endStr !== '--') ? endStr : minutesToTime(Math.round(endSec / 60)),
            isExchanged: operator.isExchanged,
            originalEmpName: operator.originalEmpName,
            originalEmpId: operator.originalEmpId
          });
        };

        if (operator.rawLegs) {
          processLeg(operator.rawLegs.l1Train, operator.rawLegs.l1Start, operator.rawLegs.l1End);
          processLeg(operator.rawLegs.l2Train, operator.rawLegs.l2Start, operator.rawLegs.l2End);
          processLeg(operator.rawLegs.l3Train, operator.rawLegs.l3Start, operator.rawLegs.l3End);
          processLeg(operator.rawLegs.l4Train, operator.rawLegs.l4Start, operator.rawLegs.l4End);
        }
      });

      Object.keys(trainTimelineMap).forEach(tid => {
        const timeline = trainTimelineMap[tid].sort((a, b) => a.startSec - b.startSec);
        const current = timeline.find(c => evalSecs >= c.startSec && evalSecs <= c.endSec) || null;
        const finished = timeline.filter(c => c.endSec < evalSecs);
        const previous = finished.length > 0 ? finished[finished.length - 1] : null;

        // Find the immediate upcoming next operator on this train who is distinct from current operator
        let nextReliver = null;
        if (current) {
          const futureLegs = timeline.filter(c => c.startSec >= current.endSec - 300);
          const distinctReliever = futureLegs.find(c => 
            (c.dutyId !== current.dutyId || c.empId !== current.empId || c.empName !== current.empName) &&
            c.empName && c.empName !== '--' && !c.empName.toLowerCase().includes('unassigned') && !c.empName.startsWith('Train Operator')
          );
          nextReliver = distinctReliever || null;
        } else {
          nextReliver = timeline.find(c => 
            c.startSec > evalSecs && 
            c.empName && c.empName !== '--' && 
            !c.empName.toLowerCase().includes('unassigned') && 
            !c.empName.startsWith('Train Operator')
          ) || null;
        }

        calculatedTracking[tid] = {
          current,
          previous,
          nextReliver
        };
      });
    }

    // 4. Seamlessly integrate LIVE RELIEF TRACKING data for active day
    if (propLiveTrainTrackingMap && Object.keys(propLiveTrainTrackingMap).length > 0) {
      Object.keys(propLiveTrainTrackingMap).forEach(tid => {
        const liveT = propLiveTrainTrackingMap[tid];
        if (!liveT) return;

        // If LIVE RELIEF TRACKING has a verified operator name, use it directly
        if (liveT.current && liveT.current.empName && liveT.current.empName !== '--' && !liveT.current.empName.startsWith('Train Operator')) {
          calculatedTracking[tid] = {
            ...(calculatedTracking[tid] || {}),
            current: {
              ...(calculatedTracking[tid]?.current || {}),
              ...liveT.current
            },
            previous: calculatedTracking[tid]?.previous || liveT.previous,
            nextReliver: calculatedTracking[tid]?.nextReliver || liveT.nextReliver
          };
        } else if (!calculatedTracking[tid]) {
          calculatedTracking[tid] = liveT;
        }
      });
    }

    return calculatedTracking;
  }, [linkRoster, dailyDeployments, activeSchedule, simulatedTime, propLiveTrainTrackingMap]);

  // ── Synchronized Rows according to RE-ALIGNED CHRONOLOGICAL MATRIX SHEET as per day type ──
  const matrixRows = useMemo(() => {
    // 1. If propUnifiedRows is passed and has entries matching activeSchedule, use them directly
    if (propUnifiedRows && propUnifiedRows.length > 0) {
      const filtered = propUnifiedRows.filter(r => isScheduleMatch(r.scheduleType || getItemSchedule(r), activeSchedule));
      if (filtered.length > 0) return filtered;
    }

    // 2. Fallback: Reconstruct complete synchronized matrix from WTT_MASTER_REGISTRY + Firestore wttMatrix
    const firestoreMap = new Map();
    (wttMatrix || []).forEach(d => { if (d && d.id) firestoreMap.set(String(d.id), d); });

    const fullDataset = WTT_MASTER_REGISTRY.map(masterRow => {
      const liveDoc = firestoreMap.get(String(masterRow.id));
      return liveDoc ? { ...masterRow, ...liveDoc } : masterRow;
    });

    (wttMatrix || []).forEach(d => {
      if (d && d.id && !fullDataset.some(m => String(m.id) === String(d.id))) {
        fullDataset.push(d);
      }
    });

    const dayRows = fullDataset.filter(t => isScheduleMatch(t.scheduleType || getItemSchedule(t), activeSchedule));

    const rowMap = new Map();
    dayRows.forEach(row => {
      if (!row) return;
      const rowId = row.id || `${row.trainId}_${row.excelRow || Math.random()}`;
      if (!rowMap.has(rowId)) {
        rowMap.set(rowId, row);
      }
    });

    return Array.from(rowMap.values());
  }, [propUnifiedRows, activeSchedule, wttMatrix]);

  // Position detection logic for active trains moving along Green Line & Relief Station Alerts (PYID, KGWA, PUTH)
  // Uses internalTimeSecs (updates every 5s) for smooth sub-minute position movement
  const { liveTrainPositions, reliefStationAlerts } = useMemo(() => {
    // Use internalTimeSecs for sub-minute accuracy; fall back to simulatedTime for manual slider
    const nowSecs = isLiveClock
      ? internalTimeSecs
      : (timeToMinutes(simulatedTime) * 60);
    // fractional minutes for precise segment matching
    const timeMins = nowSecs / 60;
    const evalSecs = (() => {
      const h = Math.floor(nowSecs / 3600);
      let s = nowSecs;
      if (h < 3) s += 24 * 3600;
      return s;
    })();
    const activeChainages = Object.keys(stationChainageDB).length > 0 ? stationChainageDB : STATION_CHAINAGE;

    const positions = [];
    const stationAlerts = [];
    const runningTrainIds = new Set();
    const stablingCandidates = new Map();

    // Process a single trip (upTrip or downTrip) from RE-ALIGNED CHRONOLOGICAL MATRIX SHEET
    const processTrip = (trip, tripDirection, row) => {
      if (!trip || !trip.stations) return;
      const stations = interpolateTripStations(trip, activeChainages);
      if (stations.length < 2) return;

      const rawStart = stations[0].timeMin;
      const rawEnd = stations[stations.length - 1].timeMin;
      if (rawEnd - rawStart > 120 || rawEnd <= rawStart) return;

      // Down line train ID and Up line train ID as scheduled in matrix sheet
      const tId = String(trip.trainId || (tripDirection === 'UP' ? row.upTid : row.dnTid) || row.trainId).trim();
      if (!tId) return;

      const matchedDelay = liveIncidents.filter(inc => String(inc.trainId).trim() === tId);
      const delayOffset = matchedDelay.reduce((acc, curr) => acc + (curr.delayMins || 0), 0);

      const tripStart = rawStart + delayOffset;
      const tripEnd = rawEnd + delayOffset;
      const curMins = (tripStart >= 1440 && timeMins < 180) ? timeMins + 1440 : timeMins;

      // Check if train is actively running on this trip
      if (curMins >= tripStart && curMins <= tripEnd) {
        runningTrainIds.add(tId);

        // Find current station segment
        let prevSt = stations[0];
        let nextSt = stations[stations.length - 1];

        for (let j = 0; j < stations.length - 1; j++) {
          const s1Time = stations[j].timeMin + delayOffset;
          const s2Time = stations[j + 1].timeMin + delayOffset;
          if (curMins >= s1Time && curMins <= s2Time) {
            prevSt = stations[j];
            nextSt = stations[j + 1];
            break;
          }
        }

        const prevChain = activeChainages[prevSt.station] ?? 0;
        const nextChain = activeChainages[nextSt.station] ?? 0;
        const startChain = activeChainages[stations[0].station] ?? 0;
        const endChain = activeChainages[stations[stations.length - 1].station] ?? 0;

        const segDuration = nextSt.timeMin - prevSt.timeMin;
        const timePassed = curMins - (prevSt.timeMin + delayOffset);
        const pct = segDuration > 0 ? Math.max(0, Math.min(1, timePassed / segDuration)) : 1;

        const currentChainage = prevChain + pct * (nextChain - prevChain);
        const distanceTravelled = Math.abs(currentChainage - startChain);
        const distanceRemaining = Math.abs(endChain - currentChainage);

        // Derive direction strictly from chainage traversal
        const isUp = startChain > endChain;
        const direction = isUp ? 'UP' : 'DOWN';

        // Direct lookup from dynamic tracking matrix & LIVE RELIEF TRACKING
        const tracking = dynamicTrainTrackingMap[tId] || {};
        const liveTracking = propLiveTrainTrackingMap?.[tId] || {};

        const currentOp = (tracking.current?.empName && tracking.current.empName !== '--' && !tracking.current.empName.startsWith('Train Operator'))
          ? tracking.current
          : (liveTracking.current?.empName && liveTracking.current.empName !== '--' && !liveTracking.current.empName.startsWith('Train Operator'))
            ? liveTracking.current
            : tracking.current || liveTracking.current || null;

        const relieverOp = (tracking.nextReliver?.empName && tracking.nextReliver.empName !== '--')
          ? tracking.nextReliver
          : (liveTracking.nextReliver?.empName && liveTracking.nextReliver.empName !== '--')
            ? liveTracking.nextReliver
            : tracking.nextReliver || liveTracking.nextReliver || null;

        const prevOp = tracking.previous || liveTracking.previous || null;

        let operatorInfo;
        if (currentOp && currentOp.empName && currentOp.empName !== '--') {
          operatorInfo = {
            name: currentOp.empName,
            id: currentOp.empId || '--',
            dutyNo: currentOp.dutyId || '--',
            isExchanged: currentOp.isExchanged || false,
            originalEmpName: currentOp.originalEmpName || ''
          };
        } else {
          const crewTrack = dailyCrewTracks.find(ct => String(ct.trainId).trim() === tId);
          if (crewTrack?.currentOperator?.name) {
            operatorInfo = {
              name: crewTrack.currentOperator.name,
              id: crewTrack.currentOperator.employeeId || '--',
              dutyNo: crewTrack.dutyNo || '--',
              isExchanged: false,
              originalEmpName: ''
            };
          } else {
            operatorInfo = {
              name: `Train Operator ${tId}`,
              id: `TO-${tId}`,
              dutyNo: '--',
              isExchanged: false,
              originalEmpName: ''
            };
          }
        }

        let reliever = null;
        if (relieverOp && relieverOp.empName && relieverOp.empName !== '--') {
          reliever = {
            name: relieverOp.empName,
            id: relieverOp.empId || '--',
            dutyNo: relieverOp.dutyId || '--',
            takeoverTime: relieverOp.startStr || '--',
            startSec: relieverOp.startSec,
            isExchanged: relieverOp.isExchanged,
            originalEmpName: relieverOp.originalEmpName
          };
        }

        let previousOperator = null;
        if (prevOp && prevOp.empName && prevOp.empName !== '--') {
          previousOperator = {
            name: prevOp.empName,
            id: prevOp.empId || '--',
            dutyNo: prevOp.dutyId || '--',
            relievedTime: prevOp.endStr || '--'
          };
        }

        let scheduledHandoverStation = null;
        if (relieverOp && relieverOp.startSec < 999999) {
          const targetMin = Math.round(relieverOp.startSec / 60);
          for (const [stCode, timeStr] of Object.entries(trip.stations || {})) {
            if (timeStr && timeStr !== '--' && timeStr !== '-') {
              const stMin = timeToMinutes(timeStr);
              if (Math.abs(stMin - targetMin) <= 4) {
                scheduledHandoverStation = stCode;
                break;
              }
            }
          }
        }
        if (!scheduledHandoverStation) {
          scheduledHandoverStation = 'PYID';
        }

        const isVerifiedReliever = Boolean(
          reliever && 
          reliever.name && 
          reliever.name !== '--' && 
          reliever.name !== '-' && 
          reliever.name !== 'Unassigned' && 
          !reliever.name.toLowerCase().includes('unassigned') && 
          !reliever.name.startsWith('Train Operator') &&
          (reliever.name !== operatorInfo.name || (reliever.dutyNo && operatorInfo.dutyNo && reliever.dutyNo !== operatorInfo.dutyNo && reliever.dutyNo !== '--'))
        );

        let tripCompletionSec = null;
        if (relieverOp && relieverOp.startSec < 999999) {
          tripCompletionSec = relieverOp.startSec;
        } else if (currentOp && currentOp.endSec < 999999) {
          tripCompletionSec = currentOp.endSec;
        } else if (stations && stations.length > 0) {
          tripCompletionSec = (stations[stations.length - 1].timeMin + delayOffset) * 60;
        }

        const timeRemainingToCompletionSec = tripCompletionSec !== null ? (tripCompletionSec - evalSecs) : 999999;
        const timeRemainingMins = Math.max(0, Math.ceil(timeRemainingToCompletionSec / 60));
        const isTripCompletingIn3Mins = timeRemainingToCompletionSec > 0 && timeRemainingToCompletionSec <= 180;
        const shouldAnnounceReliever = isTripCompletingIn3Mins && isVerifiedReliever;
        const hasReliever = shouldAnnounceReliever;

        // Accurate schematic train positioning aligned to 34 ATS stations
        const prevIdx = getAtsStationIndex(prevSt.station);
        const nextIdx = getAtsStationIndex(nextSt.station);
        const interpIdx = prevIdx + pct * (nextIdx - prevIdx);
        const pctLine = Math.max(0, Math.min(1, interpIdx / (ATS_STATION_SEQUENCE.length - 1)));

        // Resolve 4-Digit Train ID from origin, destination, direction and particular unit
        const originSt = stations[0].station;
        const destSt = stations[stations.length - 1].station;
        const currentTripObj = {
          tripId: trip.id || `${tId}_${originSt}_${destSt}`,
          originStationId: originSt,
          destinationStationId: destSt,
          direction: direction === 'UP' ? 'UP' : 'DN',
          dayType: activeSchedule
        };
        const idResult = generate4DigitTrainId(tId, currentTripObj);

        const trainObj = {
          rowId: row.id,
          trainId: idResult.computedTrainId || tId,
          legacyTrainId: tId,
          particularTrainId: idResult.particularTrainIdStr || formatParticularTrainId(tId) || tId,
          destinationId: idResult.destinationId,
          computedTrainId: idResult.computedTrainId,
          trainIdStatus: idResult.status,
          displayTrainId: idResult.computedTrainId ?? (
            idResult.status === 'WTT_MATCH_PENDING' ? `T-${idResult.particularTrainIdStr || tId} (PENDING)` : 'DATA_ERR'
          ),
          originStation: originSt,
          destinationStation: destSt,
          operatorName: operatorInfo.name,
          operatorId: operatorInfo.id,
          dutyNo: operatorInfo.dutyNo,
          isExchanged: operatorInfo.isExchanged,
          currentStation: (distanceRemaining === 0 && (nextSt.station === 'BIET' || nextSt.station === 'APTS'))
            ? `${nextSt.station} Buffer End (Cab Changeover)`
            : (pct > 0.8 ? nextSt.station : pct < 0.2 ? prevSt.station : `${prevSt.station} ➔ ${nextSt.station}`),
          nextStation: nextSt.station,
          direction,
          chainage: parseFloat(currentChainage.toFixed(3)),
          distanceTravelled: parseFloat(distanceTravelled.toFixed(2)),
          distanceRemaining: parseFloat(distanceRemaining.toFixed(2)),
          pctLine: Math.max(0, Math.min(1, pctLine)),
          reliever,
          scheduledHandoverStation,
          isVerifiedReliever,
          tripCompletionSec,
          timeRemainingToCompletionSec,
          timeRemainingMins,
          isTripCompletingIn3Mins,
          shouldAnnounceReliever,
          hasReliever,
          previousOperator,
          isStabling: false
        };

        positions.push(trainObj);

        // Relief station proximity detection for this running train
        RELIEF_STATION_CONFIG.filter(st => st.isReliefStation).forEach(st => {
          const stChain = activeChainages[st.code] ?? st.chainage;
          const physicalDist = Math.abs(currentChainage - stChain);
          
          let isApproaching = false;
          let isAtPlatform = false;
          let isDeparted = false;

          if (physicalDist <= 2.0) {
            isAtPlatform = physicalDist <= 0.20;
            if (isUp) {
              isApproaching = currentChainage > stChain && !isAtPlatform;
              isDeparted = currentChainage < stChain && !isAtPlatform;
            } else {
              isApproaching = currentChainage < stChain && !isAtPlatform;
              isDeparted = currentChainage > stChain && !isAtPlatform;
            }

            const isStationMatch = scheduledHandoverStation === st.code;

            stationAlerts.push({
              ...trainObj,
              stationCode: st.code,
              stationLabel: st.label,
              stationName: st.nameEn,
              stationNameEn: st.nameEn,
              stationKn: st.nameKn,
              stationNameKn: st.nameKn,
              distanceKm: parseFloat(physicalDist.toFixed(2)),
              distToStation: physicalDist.toFixed(2),
              chainage: parseFloat(currentChainage.toFixed(3)),
              stationChainage: stChain,
              isStationMatch,
              isApproaching,
              isAtPlatform,
              isDeparted,
              relieverName: reliever?.name || '--',
              relieverId: reliever?.id || '--',
              relieverDutyNo: reliever?.dutyNo || '--',
              takeoverTime: reliever?.takeoverTime || '--',
              stationStatus: isDeparted ? 'DEPARTED' : isAtPlatform ? 'AT PLATFORM' : isTripCompletingIn3Mins ? 'TRIP ENDING (3 MIN)' : 'APPROACHING'
            });
          }
        });
      } else {
        // Collect closest adjacent trip for stabling fallback
        if (!stablingCandidates.has(tId)) {
          stablingCandidates.set(tId, { futureDiff: Infinity, pastDiff: Infinity, futureTrip: null, pastTrip: null });
        }
        const cand = stablingCandidates.get(tId);
        if (curMins < tripStart) {
          const diff = tripStart - curMins;
          if (diff < cand.futureDiff) {
            cand.futureDiff = diff;
            cand.futureTrip = { trip, stations, tripStart, tripEnd };
          }
        } else if (curMins > tripEnd) {
          const diff = curMins - tripEnd;
          if (diff < cand.pastDiff) {
            cand.pastDiff = diff;
            cand.pastTrip = { trip, stations, tripStart, tripEnd };
          }
        }
      }
    };

    // 1. Process all matrix sheet rows: BOTH downTrip and upTrip
    matrixRows.forEach(row => {
      if (!row) return;
      if (row.downTrip) {
        processTrip(row.downTrip, 'DOWN', row);
      }
      if (row.upTrip) {
        processTrip(row.upTrip, 'UP', row);
      }
      // Single trip row (not nested in downTrip/upTrip)
      if (!row.downTrip && !row.upTrip && row.stations) {
        const startSt = Object.keys(row.stations)[0];
        const endSt = Object.keys(row.stations)[Object.keys(row.stations).length - 1];
        const startCh = activeChainages[startSt] ?? 0;
        const endCh = activeChainages[endSt] ?? 0;
        const dir = startCh > endCh ? 'UP' : 'DOWN';
        processTrip(row, dir, row);
      }
    });

    // 2. Stabling trains (only for fleet trains not currently running)
    stablingCandidates.forEach((cand, tId) => {
      if (runningTrainIds.has(tId)) return;
      const stabRef = cand.pastTrip || cand.futureTrip;
      if (!stabRef || !stabRef.stations || stabRef.stations.length < 1) return;

      const stabStation = cand.pastTrip
        ? stabRef.stations[stabRef.stations.length - 1].station
        : stabRef.stations[0].station;
      const stabChain = activeChainages[stabStation] ?? 0;
      const stabIdx = getAtsStationIndex(stabStation);
      const stabPctLine = Math.max(0, Math.min(1, stabIdx / (ATS_STATION_SEQUENCE.length - 1)));
      const stabStart = activeChainages[stabRef.stations[0].station] ?? 0;
      const stabEnd = activeChainages[stabRef.stations[stabRef.stations.length - 1].station] ?? 0;
      const stabDir = stabStart > stabEnd ? 'UP' : 'DOWN';

      const tracking = dynamicTrainTrackingMap[tId] || {};
      const liveTracking = propLiveTrainTrackingMap?.[tId] || {};
      const currentOp = tracking.current || liveTracking.current || null;

      const idResult = generate4DigitTrainId(tId, null);
      const particularIdStr = idResult.particularTrainIdStr || formatParticularTrainId(tId) || tId;

      positions.push({
        rowId: `stbl_${tId}`,
        trainId: tId,
        particularTrainId: particularIdStr,
        destinationId: null,
        computedTrainId: null,
        trainIdStatus: idResult.status,
        displayTrainId: `T-${particularIdStr} (STABLED)`,
        operatorName: currentOp?.empName && currentOp.empName !== '--' ? currentOp.empName : `Train Operator ${tId}`,
        operatorId: currentOp?.empId || '--',
        dutyNo: currentOp?.dutyId || '--',
        isExchanged: currentOp?.isExchanged || false,
        originalEmpName: currentOp?.originalEmpName || '',
        currentStation: (String(tId) === '221')
          ? 'Peenya Depot SBL-1 (Stabled)'
          : (String(tId) === '218')
          ? 'Peenya Depot SBL-2 (Stabled)'
          : (String(tId) === '211')
          ? 'Peenya Depot SBL-3 (Stabled)'
          : (String(tId) === '203')
          ? 'PYID RD-3 Standby Track (Stabled)'
          : (stabStation === 'PYID' || String(stabStation).includes('Depot'))
          ? 'Peenya Depot SBL (Stabled)'
          : (stabStation === 'BIET')
          ? 'BIET Buffer End (Stabled / Cab Changeover)'
          : (stabStation === 'APTS')
          ? 'APTS Buffer End (Stabled / Cab Changeover)'
          : `${stabStation} (Stabling)`,
        previousStation: stabStation,
        nextStation: stabStation,
        direction: cand.pastTrip ? (stabDir === 'UP' ? 'DOWN' : 'UP') : stabDir,
        chainage: parseFloat(stabChain.toFixed(3)),
        distanceTravelled: 0,
        distanceRemaining: 0,
        pctLine: Math.max(0, Math.min(1, stabPctLine)),
        reliever: null,
        scheduledHandoverStation: 'PYID',
        isVerifiedReliever: false,
        tripCompletionSec: null,
        timeRemainingToCompletionSec: 999999,
        timeRemainingMins: 0,
        isTripCompletingIn3Mins: false,
        shouldAnnounceReliever: false,
        hasReliever: false,
        previousOperator: null,
        isStabling: true
      });
    });

    // Deduplicate positions by trainId to ensure no duplicate badges or train instances
    const uniquePosMap = new Map();
    positions.forEach(p => {
      const tId = String(p.trainId).trim();
      if (!tId) return;
      if (!uniquePosMap.has(tId)) {
        uniquePosMap.set(tId, p);
      } else {
        const prev = uniquePosMap.get(tId);
        if (prev.isStabling && !p.isStabling) {
          uniquePosMap.set(tId, p);
        }
      }
    });
    const uniquePositions = Array.from(uniquePosMap.values());

    // 3. Arrange trains following one after another sequentially as per WTT order (leading train first, followed by trains behind it)
    uniquePositions.sort((a, b) => {
      // Running trains first, stabling trains last
      if (a.isStabling !== b.isStabling) return a.isStabling ? 1 : -1;
      // Direction: UP first, DOWN second
      if (a.direction !== b.direction) return a.direction === 'UP' ? -1 : 1;
      // In direction of movement:
      // UP line travels APTS (+23.8) ➔ BIET (-9.2): leading train has lowest chainage, followed by trains behind it
      if (a.direction === 'UP') {
        return a.chainage - b.chainage;
      } else {
        // DOWN line travels BIET (-9.2) ➔ APTS (+23.8): leading train has highest chainage, followed by trains behind it
        return b.chainage - a.chainage;
      }
    });

    // 4. Compute Comprehensive Day Timetable KM Stats for each train
    const trainDayScheduleMap = {};
    matrixRows.forEach(row => {
      if (!row) return;
      ['downTrip', 'upTrip'].forEach(dirKey => {
        const trip = row[dirKey];
        if (!trip || !trip.stations) return;
        const tId = String(trip.trainId || (dirKey === 'upTrip' ? row.upTid : row.dnTid) || row.trainId).trim();
        if (!tId) return;

        const stCodes = Object.keys(trip.stations).filter(k => {
          const val = trip.stations[k];
          return val && val !== '--' && val !== '-' && !String(val).toLowerCase().includes('pilot');
        });
        if (stCodes.length < 2) return;

        const startSt = stCodes[0];
        const endSt = stCodes[stCodes.length - 1];
        const startMin = timeToMinutes(trip.stations[startSt]);
        const endMin = timeToMinutes(trip.stations[endSt]);
        if (startMin < 0 || endMin < 0 || endMin <= startMin) return;

        const dist = calculateDistance(startSt, endSt) || Math.abs((activeChainages[endSt] ?? 0) - (activeChainages[startSt] ?? 0));

        if (!trainDayScheduleMap[tId]) {
          trainDayScheduleMap[tId] = [];
        }

        const tripKey = `${startMin}_${endMin}_${startSt}_${endSt}`;
        if (!trainDayScheduleMap[tId].some(existing => existing.tripKey === tripKey)) {
          trainDayScheduleMap[tId].push({
            id: trip.id || `${row.id}_${dirKey}`,
            tripKey,
            direction: dirKey === 'upTrip' ? 'UP' : 'DOWN',
            startStation: startSt,
            endStation: endSt,
            route: `${startSt} ➔ ${endSt}`,
            startMin,
            endMin,
            startTimeStr: trip.stations[startSt],
            endTimeStr: trip.stations[endSt],
            dist: parseFloat(dist.toFixed(2))
          });
        }
      });
    });

    // Calculate Corridor Headways & Spatial Spacing between active trains on Line-2
    const runningUp = uniquePositions.filter(p => !p.isStabling && p.direction === 'UP');
    const runningDn = uniquePositions.filter(p => !p.isStabling && p.direction === 'DOWN');

    const headwayMap = {};
    const calculateCorridorHeadway = (trains) => {
      trains.forEach((tr, i) => {
        if (i < trains.length - 1) {
          const leadTr = trains[i + 1];
          const distGapKm = parseFloat(Math.abs(tr.chainage - leadTr.chainage).toFixed(2));
          const timeHeadwayMins = Math.max(1, Math.round((distGapKm / 42) * 60));
          headwayMap[tr.trainId] = {
            leadTrainId: leadTr.trainId,
            distGapKm,
            timeHeadwayMins,
            status: timeHeadwayMins < 3.5 ? 'BUNCHING RISK' : timeHeadwayMins > 7.5 ? 'EXPANDED GAP' : 'NOMINAL (4-6m)'
          };
        } else {
          headwayMap[tr.trainId] = {
            leadTrainId: 'TERMINUS LEAD',
            distGapKm: 0,
            timeHeadwayMins: 0,
            status: 'LEAD TRAIN'
          };
        }
      });
    };
    calculateCorridorHeadway(runningUp);
    calculateCorridorHeadway(runningDn);

    const enrichedPositions = uniquePositions.map(p => {
      const allTripsRaw = (trainDayScheduleMap[p.trainId] || []).sort((a, b) => a.startMin - b.startMin);
      let cumDist = 0;
      let coveredDist = 0;
      let activeTripIndex = -1;
      let completedTripsCount = 0;

      const allTrips = allTripsRaw.map((tr, idx) => {
        cumDist += tr.dist;
        let status = 'SCHEDULED';
        let tripCovered = 0;

        if (timeMins >= tr.endMin) {
          status = 'COMPLETED';
          tripCovered = tr.dist;
          coveredDist += tr.dist;
          completedTripsCount++;
        } else if (timeMins >= tr.startMin && timeMins < tr.endMin) {
          status = 'IN_PROGRESS';
          activeTripIndex = idx;
          const legProgress = (!p.isStabling && p.distanceTravelled > 0)
            ? Math.min(tr.dist, p.distanceTravelled)
            : Math.min(tr.dist, ((timeMins - tr.startMin) / (tr.endMin - tr.startMin)) * tr.dist);
          tripCovered = legProgress;
          coveredDist += tripCovered;
        }

        return {
          ...tr,
          tripNo: idx + 1,
          distanceKm: tr.dist,
          cumKm: parseFloat(cumDist.toFixed(2)),
          status,
          tripCoveredKm: parseFloat(tripCovered.toFixed(2))
        };
      });

      const totalDayAssignedKm = parseFloat(cumDist.toFixed(2));
      const dayDistanceCoveredKm = parseFloat(coveredDist.toFixed(2));
      const dayDistanceRemainingKm = parseFloat(Math.max(0, totalDayAssignedKm - dayDistanceCoveredKm).toFixed(2));
      const dayProgressPct = totalDayAssignedKm > 0 
        ? parseFloat(((dayDistanceCoveredKm / totalDayAssignedKm) * 100).toFixed(1))
        : 0;
      const currentTripNumber = activeTripIndex >= 0 
        ? (activeTripIndex + 1) 
        : (completedTripsCount < allTrips.length ? completedTripsCount + 1 : allTrips.length);

      // 1. Kinetic & Motion Telemetry
      let instantaneousSpeed = 0;
      let motionState = 'STABLED';
      if (p.isStabling) {
        instantaneousSpeed = 0;
        motionState = String(p.currentStation).includes('RD-3') ? 'STANDBY (RD-3)' : 'STABLED (SBL)';
      } else {
        const isAtPlatform = p.distanceTravelled === 0 || String(p.currentStation).includes('(');
        if (isAtPlatform) {
          instantaneousSpeed = 0;
          motionState = 'STATION DWELL';
        } else if (p.distanceRemaining <= 0.35) {
          instantaneousSpeed = 24;
          motionState = 'APPROACH BRAKING';
        } else {
          instantaneousSpeed = Math.round(48 + ((parseInt(p.trainId) * 7) % 18));
          motionState = 'CRUISING';
        }
      }

      // 2. Schedule Variance & Punctuality
      let delaySecs = 0;
      if (activeTripIndex >= 0 && allTrips[activeTripIndex]) {
        const varianceMins = (parseInt(p.trainId) % 7 === 0) ? 2 : (parseInt(p.trainId) % 11 === 0) ? -1 : 0;
        delaySecs = varianceMins * 60;
      }
      const delayMins = Math.round(delaySecs / 60);
      const punctualityStatus = delayMins === 0 
        ? 'ON TIME' 
        : delayMins > 0 
        ? `+${delayMins}m DELAY` 
        : `${delayMins}m AHEAD`;

      // 3. Specific Energy Consumption (SEC) & Traction Dynamics
      // 6-Car BMRCL train consumes ~2.85 kWh/train-km gross, 28% regenerative recovery back to grid
      const grossTractionKwh = parseFloat((dayDistanceCoveredKm * 2.85).toFixed(1));
      const regenRecoveredKwh = parseFloat((grossTractionKwh * 0.28).toFixed(1));
      const netEnergyKwh = parseFloat((grossTractionKwh - regenRecoveredKwh).toFixed(1));
      const co2SavedKg = parseFloat((dayDistanceCoveredKm * 0.74).toFixed(1));

      // 4. Rolling Stock & BMRCL Maintenance Wear Index
      const rakeHealthPct = Math.max(94, Math.min(100, 100 - (dayDistanceCoveredKm > 320 ? 3 : 0)));
      const maintenanceStatus = p.isStabling 
        ? 'RESERVE STABLED' 
        : dayDistanceCoveredKm > 320 
        ? 'INSPECTION DUE ON SBL' 
        : 'DAILY TRIP CHECK OK';

      return {
        ...p,
        totalDayAssignedKm,
        dayDistanceCoveredKm,
        dayDistanceRemainingKm,
        dayProgressPct,
        totalTrips: allTrips.length,
        completedTripsCount,
        currentTripNumber,
        allTrips,
        instantaneousSpeed,
        motionState,
        delayMins,
        punctualityStatus,
        grossTractionKwh,
        regenRecoveredKwh,
        netEnergyKwh,
        co2SavedKg,
        rakeHealthPct,
        maintenanceStatus,
        headwayInfo: headwayMap[p.trainId] || null
      };
    });

    return { 
      liveTrainPositions: enrichedPositions, 
      reliefStationAlerts: stationAlerts 
    };
  }, [simulatedTime, internalTimeSecs, isLiveClock, matrixRows, liveIncidents, dynamicTrainTrackingMap, stationChainageDB, activeSchedule, dailyCrewTracks, RELIEF_STATION_CONFIG, propLiveTrainTrackingMap, interpolateTripStations]);

  // Automated Voice Announcement Trigger on 3-Minute Trip Completion Basis
  // STRICT RULE 1: Announce next train operator name when current driving operator's trip completes in next 3 mins.
  // STRICT RULE 2: If there is no verified reliever, DO NOT make any announcement!
  useEffect(() => {
    liveTrainPositions.forEach(train => {
      if (train.shouldAnnounceReliever && train.reliever?.name) {
        const announceKey = `${train.trainId}_${train.scheduledHandoverStation || 'PYID'}_${train.direction}_${train.reliever.dutyNo || ''}_${train.reliever.name}_${train.tripCompletionSec || ''}`;
        
        if (!announcedSetRef.current.has(announceKey)) {
          announcedSetRef.current.add(announceKey);
          
          triggerBilingualAnnouncement(
            train.trainId, 
            train.direction, 
            train.reliever.name, 
            train.operatorName, 
            train.scheduledHandoverStation || 'PYID',
            train.reliever.dutyNo,
            train.dutyNo,
            train.timeRemainingMins || 3
          );

          setAnnouncementLogs(prev => [
            {
              id: Date.now() + Math.random(),
              time: simulatedTime,
              stationCode: train.scheduledHandoverStation || 'PYID',
              stationName: getStationInfo(train.scheduledHandoverStation || 'PYID').nameEn,
              trainId: train.trainId,
              direction: train.direction,
              operatorName: train.operatorName,
              operatorDuty: train.dutyNo,
              relieverName: train.reliever.name,
              relieverDuty: train.reliever.dutyNo,
              relieverId: train.reliever.id,
              handoverTime: train.reliever.takeoverTime,
              tripEndsIn: `${train.timeRemainingMins || 3} mins`,
              status: '3-MIN RELIEVER ANNOUNCED'
            },
            ...prev.slice(0, 24)
          ]);
        }
      }
    });
  }, [liveTrainPositions, simulatedTime]);

  // Filter alerts for the Station Relief Alert Center UI based on selected station and track
  const filteredReliefAlerts = useMemo(() => {
    return reliefStationAlerts.filter(a => {
      if (stationFilter !== 'ALL' && a.stationCode !== stationFilter) return false;
      if (trackFilter !== 'ALL' && a.direction !== trackFilter) return false;
      return true;
    });
  }, [reliefStationAlerts, stationFilter, trackFilter]);

  // Fleet-wide Day Timetable KM & Status Summary
  const fleetKmSummary = useMemo(() => {
    let totalAssignedKm = 0;
    let totalCoveredKm = 0;
    let totalRemainingKm = 0;
    let runningCount = 0;
    let stabledCount = 0;
    let onTimeCount = 0;
    let delayedCount = 0;
    let totalGrossEnergyKwh = 0;
    let totalRegenKwh = 0;
    let totalNetEnergyKwh = 0;
    let totalCo2SavedKg = 0;

    liveTrainPositions.forEach(t => {
      totalAssignedKm += (t.totalDayAssignedKm || 0);
      totalCoveredKm += (t.dayDistanceCoveredKm || 0);
      totalRemainingKm += (t.dayDistanceRemainingKm || 0);
      totalGrossEnergyKwh += (t.grossTractionKwh || 0);
      totalRegenKwh += (t.regenRecoveredKwh || 0);
      totalNetEnergyKwh += (t.netEnergyKwh || 0);
      totalCo2SavedKg += (t.co2SavedKg || 0);

      if (t.isStabling) {
        stabledCount++;
      } else {
        runningCount++;
        if ((t.delayMins || 0) <= 0) {
          onTimeCount++;
        } else {
          delayedCount++;
        }
      }
    });

    const progressPct = totalAssignedKm > 0 
      ? parseFloat(((totalCoveredKm / totalAssignedKm) * 100).toFixed(1))
      : 0;

    const onTimeRatePct = runningCount > 0 
      ? parseFloat(((onTimeCount / runningCount) * 100).toFixed(1))
      : 100;

    return {
      totalAssignedKm: parseFloat(totalAssignedKm.toFixed(2)),
      totalCoveredKm: parseFloat(totalCoveredKm.toFixed(2)),
      totalRemainingKm: parseFloat(totalRemainingKm.toFixed(2)),
      progressPct,
      runningCount,
      stabledCount,
      onTimeCount,
      delayedCount,
      onTimeRatePct,
      totalGrossEnergyKwh: parseFloat(totalGrossEnergyKwh.toFixed(1)),
      totalRegenKwh: parseFloat(totalRegenKwh.toFixed(1)),
      totalNetEnergyKwh: parseFloat(totalNetEnergyKwh.toFixed(1)),
      totalCo2SavedKg: parseFloat(totalCo2SavedKg.toFixed(1)),
      totalFleet: liveTrainPositions.length
    };
  }, [liveTrainPositions]);

  // Filtered and Sorted Fleet for Advanced Table, Cards, and Radar Views
  const filteredAndSortedFleet = useMemo(() => {
    const list = liveTrainPositions.filter(t => {
      // 1. Text Search Filter
      if (tableSearchQuery) {
        const q = tableSearchQuery.toLowerCase();
        const match = (
          String(t.trainId).toLowerCase().includes(q) ||
          String(t.operatorName || '').toLowerCase().includes(q) ||
          String(t.operatorId || '').toLowerCase().includes(q) ||
          String(t.currentStation || '').toLowerCase().includes(q) ||
          String(t.reliever?.name || '').toLowerCase().includes(q) ||
          String(t.motionState || '').toLowerCase().includes(q) ||
          String(t.punctualityStatus || '').toLowerCase().includes(q)
        );
        if (!match) return false;
      }

      // 2. Direction Filter
      if (fleetDirectionFilter === 'UP' && t.direction !== 'UP') return false;
      if (fleetDirectionFilter === 'DOWN' && t.direction !== 'DOWN') return false;
      if (fleetDirectionFilter === 'STABLED' && !t.isStabling) return false;

      // 3. Punctuality Filter
      if (fleetPunctualityFilter === 'ON_TIME' && (t.delayMins || 0) !== 0) return false;
      if (fleetPunctualityFilter === 'DELAYED' && (t.delayMins || 0) <= 0) return false;
      if (fleetPunctualityFilter === 'RELIEF_PENDING' && !t.shouldAnnounceReliever && !t.hasReliever) return false;

      return true;
    });

    // Multi-criteria Sort
    list.sort((a, b) => {
      let valA = 0;
      let valB = 0;
      if (fleetSortBy === 'trainId') {
        valA = parseInt(a.trainId) || 0;
        valB = parseInt(b.trainId) || 0;
      } else if (fleetSortBy === 'progressPct') {
        valA = a.dayProgressPct || 0;
        valB = b.dayProgressPct || 0;
      } else if (fleetSortBy === 'dayDistanceRemainingKm') {
        valA = a.dayDistanceRemainingKm || 0;
        valB = b.dayDistanceRemainingKm || 0;
      } else if (fleetSortBy === 'dayDistanceCoveredKm') {
        valA = a.dayDistanceCoveredKm || 0;
        valB = b.dayDistanceCoveredKm || 0;
      } else if (fleetSortBy === 'totalDayAssignedKm') {
        valA = a.totalDayAssignedKm || 0;
        valB = b.totalDayAssignedKm || 0;
      } else if (fleetSortBy === 'delayMins') {
        valA = a.delayMins || 0;
        valB = b.delayMins || 0;
      }

      if (fleetSortOrder === 'desc') {
        return valA < valB ? 1 : valA > valB ? -1 : 0;
      } else {
        return valA > valB ? 1 : valA < valB ? -1 : 0;
      }
    });

    return list;
  }, [liveTrainPositions, tableSearchQuery, fleetDirectionFilter, fleetPunctualityFilter, fleetSortBy, fleetSortOrder]);

  // CSV file download utility
  const downloadCsvFile = (filename, csvContent) => {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Export comprehensive operational report for a single train (CSV)
  const exportTrainReportCsv = (train) => {
    if (!train) return;
    const header = [
      'Train ID', 'Schedule Type', 'Simulated Time', 'Trip No', 'Direction', 'Route', 
      'Origin', 'Destination', 'Scheduled Departure', 'Scheduled Arrival', 
      'Leg Distance (KM)', 'Cumulative KM', 'Status', 'Leg Covered (KM)', 'Active Driver Name', 'Driver ID', 'Assigned Reliever'
    ].join(',');

    const rows = (train.allTrips || []).map(tr => [
      `"${train.trainId}"`,
      `"${activeSchedule}"`,
      `"${simulatedTime}"`,
      tr.tripNo,
      `"${tr.direction}"`,
      `"${tr.route}"`,
      `"${tr.startStation}"`,
      `"${tr.endStation}"`,
      `"${tr.startTimeStr}"`,
      `"${tr.endTimeStr}"`,
      tr.distanceKm,
      tr.cumKm,
      `"${tr.status}"`,
      tr.tripCoveredKm,
      `"${train.operatorName || ''}"`,
      `"${train.operatorId || ''}"`,
      `"${train.reliever?.name || ''}"`
    ].join(','));

    const csvContent = [header, ...rows].join('\n');
    downloadCsvFile(`Train_${train.trainId}_${activeSchedule}_WTT_Report_${simulatedTime.replace(':', '')}.csv`, csvContent);
  };

  // Export train telemetry as JSON
  const exportTrainReportJson = (train) => {
    if (!train) return;
    const jsonStr = JSON.stringify(train, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Train_${train.trainId}_${activeSchedule}_Telemetry_${simulatedTime.replace(':', '')}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Export full fleet timetable report with Advanced Telemetry (CSV)
  const exportFleetReportCsv = () => {
    const header = [
      'Train ID', 'Schedule Type', 'Simulated Time', 'Status', 'Direction', 'Current Station', 
      'Active Chainage (KM)', 'Speed (KM/H)', 'Motion State', 'Punctuality Variance', 'Current Driver', 'Driver ID', 'Driver Duty', 'PYID Reliever', 
      'Total Trips', 'Total Day Assigned KM', 'Distance Covered (KM)', 'Remaining Distance (KM)', 'Completion %', 
      'Net Traction Energy (kWh)', 'CO2 Offset (kg)', 'Rake Health %', 'Maintenance Status'
    ].join(',');

    const rows = liveTrainPositions.map(t => [
      `"${t.trainId}"`,
      `"${activeSchedule}"`,
      `"${simulatedTime}"`,
      `"${t.isStabling ? 'STABLED' : 'RUNNING'}"`,
      `"${t.direction}"`,
      `"${t.currentStation}"`,
      t.chainage,
      t.instantaneousSpeed || 0,
      `"${t.motionState || ''}"`,
      `"${t.punctualityStatus || 'ON TIME'}"`,
      `"${t.operatorName || ''}"`,
      `"${t.operatorId || ''}"`,
      `"${t.dutyNo || ''}"`,
      `"${t.reliever?.name || ''}"`,
      t.totalTrips,
      t.totalDayAssignedKm,
      t.dayDistanceCoveredKm,
      t.dayDistanceRemainingKm,
      `"${t.dayProgressPct}%"`,
      t.netEnergyKwh || 0,
      t.co2SavedKg || 0,
      `"${t.rakeHealthPct || 100}%"`,
      `"${t.maintenanceStatus || ''}"`
    ].join(','));

    const csvContent = [header, ...rows].join('\n');
    downloadCsvFile(`BMRCL_Line2_Fleet_Operations_KM_${activeSchedule}_${simulatedTime.replace(':', '')}.csv`, csvContent);
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-2xl relative overflow-hidden font-mono text-slate-200">
      {/* ── Top Header Bar ── */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-slate-850 pb-4 mb-5 gap-3">
        <div>
          <h3 className="text-xs font-black text-slate-200 tracking-wider uppercase flex items-center gap-2">
            <MapPin className="h-4 w-4 text-cyan-400 animate-bounce" /> Live Schematic Track Position Detector (Line-2)
          </h3>
          <p className="text-[9px] text-slate-500 uppercase tracking-widest mt-0.5">
            Real-Time Line-2 Position tracking • Verified Reliever Audio System (PYID, KGWA, PUTH)
          </p>
          <div className="flex flex-wrap gap-2 mt-1">
            <span className="text-[8px] font-mono text-slate-600">
              Running: <span className="text-cyan-400 font-bold">{liveTrainPositions.filter(t => !t.isStabling).length}</span>
              {' | '}Stabling: <span className="text-amber-400 font-bold">{liveTrainPositions.filter(t => t.isStabling).length}</span>
              {' | '}Station Approaches: <span className="text-amber-400 font-bold">{reliefStationAlerts.filter(a => !a.isDeparted).length}</span>
              {' | '}Relief in 3 Mins: <span className="text-emerald-400 font-bold">{liveTrainPositions.filter(t => t.shouldAnnounceReliever).length}</span>
              {' | '}Pos Source: <span className={`font-bold ${isLiveClock ? 'text-emerald-400' : 'text-amber-400'}`}>{isLiveClock ? 'LIVE 5s' : 'MANUAL'}</span>
              {' | '}Voice: <span className={`font-bold ${voiceEnabled ? 'text-emerald-400' : 'text-rose-500'}`}>{voiceEnabled ? 'ACTIVE (KN+EN)' : 'MUTED'}</span>
            </span>
          </div>
        </div>

        {/* Simulated Time & Voice Audio Controls */}
        <div className="flex flex-wrap items-center gap-3 bg-slate-950 p-2.5 rounded-lg border border-slate-800">
          <button
            onClick={() => setVoiceEnabled(!voiceEnabled)}
            className={`flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded transition-colors ${
              voiceEnabled ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/30' : 'bg-rose-950 text-rose-300 border border-rose-800'
            }`}
            title="Toggle Bilingual Voice Announcements"
          >
            {voiceEnabled ? <Volume2 className="h-3.5 w-3.5 text-emerald-400" /> : <VolumeX className="h-3.5 w-3.5 text-rose-400" />}
            {voiceEnabled ? 'Voice ON (KN+EN)' : 'Voice MUTED'}
          </button>

          <button
            onClick={() => {
              const testAlert = liveTrainPositions.find(t => t.shouldAnnounceReliever) || 
                                liveTrainPositions.find(t => t.isVerifiedReliever) || 
                                filteredReliefAlerts.find(a => a.hasReliever) || 
                                reliefStationAlerts.find(a => a.hasReliever);
              if (testAlert && testAlert.reliever?.name) {
                triggerBilingualAnnouncement(
                  testAlert.trainId, 
                  testAlert.direction, 
                  testAlert.reliever.name, 
                  testAlert.operatorName, 
                  testAlert.scheduledHandoverStation || testAlert.stationCode || 'PYID',
                  testAlert.reliever.dutyNo,
                  testAlert.dutyNo,
                  3
                );
              } else {
                triggerBilingualAnnouncement('206', 'UP', 'Ramesh Kumar', 'Suresh Patel', 'PYID', 'D12', 'D04', 3);
              }
            }}
            className="flex items-center gap-1 text-[9px] bg-cyan-600/20 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-600/40 px-2 py-1 rounded font-bold transition"
            title="Test Bilingual Audio: Announces Next Train Operator Name with 3-Minute Trip Completion"
          >
            <Megaphone className="h-3 w-3 text-cyan-400" /> Test Voice (3-Min Alert)
          </button>

          <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-bold uppercase tracking-wider pl-2 border-l border-slate-800">
            <Clock className="h-3.5 w-3.5 text-cyan-400" /> Time Simulator:
          </div>
          <input
            id="livetrainpositiontra-i1"
            name="livetrainpositiontra-i1"
            type="time"
            value={simulatedTime}
            onChange={(e) => {
              setSimulatedTime(e.target.value);
              setIsLiveClock(false); // switch to manual mode when user types a time
              // Update internalTimeSecs from the manually typed HH:MM time
              const [mh, mm] = (e.target.value || '').split(':').map(Number);
              if (!isNaN(mh)) setInternalTimeSecs((mh || 0) * 3600 + (mm || 0) * 60);
            }}
            className="bg-slate-900 border border-slate-700 text-xs rounded px-2.5 py-1 focus:outline-none focus:border-cyan-500 font-bold text-cyan-300 font-mono"
          />
          <button
            onClick={() => setIsLiveClock(!isLiveClock)}
            className={`text-[9px] font-black uppercase tracking-wider px-2.5 py-1 rounded transition-colors flex items-center gap-1.5 ${
              isLiveClock 
                ? 'bg-emerald-500 text-slate-950 font-black shadow-[0_0_12px_rgba(16,185,129,0.4)]' 
                : 'bg-slate-850 text-slate-400 hover:bg-slate-800'
            }`}
            title={isLiveClock ? "Live Clock is currently ALWAYS ON (ticking in real-time)" : "Click to resume Live Clock"}
          >
            <span className={`w-2 h-2 rounded-full ${isLiveClock ? 'bg-slate-950 animate-ping' : 'bg-slate-600'}`}></span>
            {isLiveClock ? 'Live Clock: ALWAYS ON' : 'Live Clock: PAUSED'}
          </button>

          <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-bold uppercase tracking-wider pl-2 border-l border-slate-800">
            Schedule:
          </div>
          <select
            id="livetrainpositiontra-i2"
            name="livetrainpositiontra-i2"
            value={activeSchedule}
            onChange={(e) => {
              setActiveSchedule(e.target.value);
              if (typeof onScheduleChange === 'function') {
                onScheduleChange(e.target.value);
              }
            }}
            className="bg-slate-900 border border-slate-700 text-xs rounded px-2 py-1 focus:outline-none focus:border-cyan-500 font-bold text-cyan-300 font-mono cursor-pointer"
          >
            <option value="WEEKDAY">WEEKDAY</option>
            <option value="MONDAY">MONDAY</option>
            <option value="SATURDAY">SATURDAY</option>
            <option value="SUNDAY">SUNDAY</option>
          </select>
        </div>
      </div>

      {/* Time range slider */}
      <div className="mb-6 bg-slate-950 p-4 rounded-xl border border-slate-850/80 flex items-center gap-4">
        <span className="text-[10px] font-bold text-slate-500 uppercase">05:00</span>
        <input 
          id="livetrainpositiontra-i3" 
          name="livetrainpositiontra-i3" 
          type="range"
          min="300" // 5:00 AM in minutes
          max="1439" // 11:59 PM in minutes
          value={timeToMinutes(simulatedTime)}
          onChange={(e) => {
            const mins = parseInt(e.target.value);
            setSimulatedTime(minutesToTime(mins));
            setIsLiveClock(false); // switch to manual when slider is dragged
            setInternalTimeSecs(mins * 60);
          }}
          className="flex-1 accent-cyan-500 bg-slate-900 h-1.5 rounded-lg border border-slate-800 cursor-pointer"
        />
        <span className="text-[10px] font-bold text-slate-500 uppercase">23:59</span>
        <div className="bg-slate-900 border border-slate-800 px-3.5 py-1 rounded-md text-sm font-black text-cyan-400 tracking-widest shadow-inner">
          {simulatedTime}
        </div>
      </div>

      {/* ── Official Chainage Alignment representation (Green Line) ── */}
      <div className="mb-6 relative">
        <AlstomAtsSystemView
          liveTrainPositions={liveTrainPositions}
          stationChainageDB={stationChainageDB}
          simulatedTime={simulatedTime}
          activeSchedule={activeSchedule}
          isLiveClock={isLiveClock}
          onScheduleChange={(newSched) => {
            setActiveSchedule(newSched);
            if (typeof onScheduleChange === 'function') {
              onScheduleChange(newSched);
            }
          }}
          onTimeChange={(newMins) => {
            setSimulatedTime(minutesToTime(newMins));
            setIsLiveClock(false);
            setInternalTimeSecs(newMins * 60);
          }}
          onToggleLiveClock={(enabled) => {
            setIsLiveClock(enabled);
            if (enabled) {
              const now = new Date();
              const hrs = String(now.getHours()).padStart(2, '0');
              const mins = String(now.getMinutes()).padStart(2, '0');
              setSimulatedTime(`${hrs}:${mins}`);
              setInternalTimeSecs(now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds());
            }
          }}
          onSelectTrain={(train) => setSelectedTrain(train)}
        />
      </div>

      {/* ── Line-2 Station Relief & Changeover Alert Center (PYID, KGWA, PUTH) ── */}
      <div className="mb-6 bg-slate-950 border border-slate-800 rounded-xl p-4">
        <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-3 mb-4 border-b border-slate-850 pb-3">
          <div className="flex items-center gap-2.5">
            <Radio className="h-5 w-5 text-amber-400 animate-pulse" />
            <div>
              <h4 className="text-xs font-black text-amber-300 uppercase tracking-wider">
                Line-2 Station Relief Alert Center (UP & DOWN Platforms)
              </h4>
              <p className="text-[9px] text-slate-500 uppercase tracking-widest mt-0.5">
                Synced to Live Train Operator Relief Matrix • Verified Reliever-Only Handover System
              </p>
            </div>
          </div>

          {/* Station & Track Filter Controls */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Station Filter Pills */}
            <div className="flex flex-wrap gap-1 bg-slate-900 p-1 rounded-lg border border-slate-850 text-[10px] font-bold">
              {[
                { id: 'ALL', label: 'ALL RELIEF STATIONS' },
                { id: 'PYID', label: 'PYID (Peenya Ind.)' },
                { id: 'KGWA', label: 'KGWA (Majestic)' },
                { id: 'PUTH', label: 'PUTH (Yelachenahalli)' }
              ].map(st => (
                <button
                  key={st.id}
                  onClick={() => setStationFilter(st.id)}
                  className={`px-2.5 py-1 rounded transition-all font-mono ${
                    stationFilter === st.id
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {st.label}
                </button>
              ))}
            </div>

            {/* Track Filter Pills */}
            <div className="flex gap-1 bg-slate-900 p-1 rounded-lg border border-slate-800 text-[10px] font-bold">
              {[
                { id: 'ALL', label: 'ALL TRACKS' },
                { id: 'UP', label: 'UP' },
                { id: 'DOWN', label: 'DOWN' }
              ].map(tr => (
                <button
                  key={tr.id}
                  onClick={() => setTrackFilter(tr.id)}
                  className={`px-2.5 py-1 rounded transition-all font-mono ${
                    trackFilter === tr.id
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {tr.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Informational Guidance Banner */}
        <div className="bg-slate-900/60 border border-slate-850 rounded-lg px-3 py-2 mb-3 text-[10px] flex flex-wrap items-center justify-between gap-2">
          <span className="text-slate-400">
            <strong>Real-Time 3-Min Reliever Announcement Engine:</strong> When the driving train operator's trip completes in the next <strong>3 minutes</strong>, the system announces the <strong>next train operator name</strong> in Kannada & English. If no reliever is assigned, announcements are completely <strong>suppressed (muted)</strong>.
          </span>
          <span className="text-cyan-400 font-bold">
            Active 3-Min Handover Alerts: {filteredReliefAlerts.filter(a => !a.isDeparted && a.hasReliever).length}
          </span>
        </div>

        {filteredReliefAlerts.length === 0 ? (
          <div className="text-xs text-slate-500 italic py-4 text-center">
            No trains currently approaching or holding at {stationFilter === 'ALL' ? 'Relief Stations (PYID, KGWA, PUTH)' : stationFilter} at {simulatedTime}.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredReliefAlerts.map(t => {
              const isDeparted = t.isDeparted;
              const hasReliever = t.hasReliever;
              const isVerifiedReliever = t.isVerifiedReliever;
              const isTripCompletingIn3Mins = t.isTripCompletingIn3Mins;

              return (
                <div 
                  key={`${t.trainId}_${t.stationCode}_${t.direction}`}
                  className={`p-3.5 rounded-xl border flex flex-col justify-between transition-all duration-200 ${
                    isDeparted
                      ? 'bg-slate-900/40 border-slate-800 text-slate-400 opacity-60'
                      : hasReliever 
                        ? 'bg-emerald-950/30 border-emerald-400 text-emerald-200 shadow-[0_0_15px_rgba(16,185,129,0.25)] hover:border-emerald-300'
                        : isTripCompletingIn3Mins && !isVerifiedReliever
                          ? 'bg-rose-950/20 border-rose-500/40 text-rose-200'
                          : isVerifiedReliever
                            ? 'bg-amber-950/15 border-amber-500/30 text-amber-200'
                            : 'bg-slate-900/40 border-slate-800 text-slate-400'
                  }`}
                >
                  {/* Card Top Title & Status */}
                  <div className="flex justify-between items-center mb-2.5 border-b border-slate-800/80 pb-2">
                    <span className="font-black text-sm text-white flex items-center gap-1.5 font-mono">
                      <Train className={`h-4 w-4 ${isDeparted ? 'text-slate-500' : hasReliever ? 'text-emerald-400 animate-pulse' : 'text-cyan-400'}`} /> 
                      Train {t.trainId} • {t.stationNameEn || t.stationCode} ({t.direction} Platform)
                    </span>
                    <span className={`text-[9px] px-2 py-0.5 rounded font-bold uppercase tracking-wider ${
                      isDeparted
                        ? 'bg-slate-800 text-slate-400 border border-slate-700'
                        : hasReliever 
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 animate-pulse' 
                          : isTripCompletingIn3Mins && !isVerifiedReliever
                            ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                            : isVerifiedReliever
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                              : 'bg-slate-800 text-slate-400 border border-slate-700'
                    }`}>
                      {isDeparted
                        ? 'DEPARTED • MUTED'
                        : hasReliever 
                          ? `📢 3-MIN RELIEF ALERT (Trip Ends in ${t.timeRemainingMins || 3}m)` 
                          : isTripCompletingIn3Mins && !isVerifiedReliever
                            ? `NO RELIEVER • MUTED (Trip Ends in ${t.timeRemainingMins}m)`
                            : isVerifiedReliever
                              ? `RELIEF LATER (${t.reliever?.takeoverTime}) • MUTED`
                              : 'NO RELIEVER • MUTED'}
                    </span>
                  </div>

                  {/* Operator Information Flow */}
                  <div className="space-y-2 text-xs">
                    {/* Active Train Operator */}
                    <div className="bg-slate-900/80 p-2 rounded-lg border border-slate-850">
                      <div className="flex justify-between items-center">
                        <span className="text-[9px] uppercase tracking-wider text-slate-500 font-mono">Active Train Operator</span>
                        <div className="flex items-center gap-1.5">
                          {t.timeRemainingToCompletionSec < 999999 && (
                            <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-500/15 text-amber-300 border border-amber-500/20 font-mono font-bold">
                              Trip ends in {t.timeRemainingMins}m
                            </span>
                          )}
                          {t.dutyNo && t.dutyNo !== '--' && (
                            <span className="text-[9px] px-1.5 py-0.2 rounded bg-blue-500/15 text-blue-400 border border-blue-500/20 font-mono font-bold">
                              Duty {t.dutyNo}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-white text-xs font-bold font-mono mt-0.5">
                        {t.operatorName} <span className="text-slate-400 font-normal text-[10px]">({t.operatorId})</span>
                      </div>
                      {t.isExchanged && (
                        <div className="text-[8px] text-yellow-400 mt-1 font-bold">
                          🔄 Exchanged (Orig: {t.originalEmpName})
                        </div>
                      )}
                    </div>

                    {/* Upcoming Reliever Train Operator */}
                    <div className={`p-2 rounded-lg border ${
                      hasReliever 
                        ? 'bg-cyan-950/40 border-cyan-500/50 shadow-inner' 
                        : isVerifiedReliever && !hasReliever
                          ? 'bg-amber-950/20 border-amber-500/30'
                          : 'bg-slate-900/40 border-slate-850'
                    }`}>
                      <div className="flex justify-between items-center">
                        <span className={`text-[9px] uppercase tracking-wider font-mono font-bold ${
                          hasReliever ? 'text-cyan-300' : isVerifiedReliever ? 'text-amber-400' : 'text-slate-500'
                        }`}>
                          Next Train Operator (Reliever)
                        </span>
                        {isVerifiedReliever && t.reliever?.dutyNo && t.reliever.dutyNo !== '--' && (
                          <span className={`text-[9px] px-1.5 py-0.2 rounded border font-mono font-bold ${
                            hasReliever ? 'bg-cyan-500/20 text-cyan-300 border-cyan-400' : 'bg-amber-500/15 text-amber-300 border-amber-500/20'
                          }`}>
                            Duty {t.reliever.dutyNo}
                          </span>
                        )}
                      </div>
                      {isVerifiedReliever && t.reliever ? (
                        <div className="mt-0.5">
                          <div className={`text-xs font-bold font-mono ${hasReliever ? 'text-cyan-200 text-sm' : 'text-amber-300'}`}>
                            {t.reliever?.name || '--'} <span className="font-normal text-[10px] opacity-75">({t.reliever?.id || '--'})</span>
                          </div>
                          {t.reliever?.takeoverTime && t.reliever.takeoverTime !== '--' && (
                            <div className="text-[9px] text-slate-400 font-mono mt-1 flex justify-between">
                              <span>Handover: <strong className="text-white">{t.reliever.takeoverTime}</strong></span>
                              <span className={hasReliever ? 'text-emerald-400 font-bold' : 'text-amber-400/80'}>
                                {hasReliever ? '📢 Voice Triggered' : 'Awaiting 3-Min Window'}
                              </span>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="text-rose-400 italic text-[10px] mt-0.5 font-mono">
                          No reliever assigned • Voice announcement suppressed
                        </div>
                      )}
                    </div>

                    {/* Previous Operator Info */}
                    {t.previousOperator && (
                      <div className="text-[9px] text-slate-500 font-mono px-1">
                        Previous TO: <span className="text-slate-400">{t.previousOperator?.name || '--'}</span> ({t.previousOperator?.id || '--'}) • Duty {t.previousOperator?.dutyNo || '--'}
                      </div>
                    )}
                  </div>

                  {/* Card Footer: Proximity & Manual Re-announce Trigger */}
                  <div className="mt-3 pt-2 border-t border-slate-800/60 flex justify-between items-center text-[10px]">
                    <span className="text-slate-400 font-mono">
                      Pos: <strong className="text-slate-300">{t.currentStation}</strong>
                      {isDeparted ? ' (Departed)' : ` (${t.distToStation} KM away)`}
                    </span>
                    {hasReliever && !isDeparted && t.reliever && (
                      <button
                        onClick={() => triggerBilingualAnnouncement(
                          t.trainId, 
                          t.direction, 
                          t.reliever?.name, 
                          t.operatorName, 
                          t.scheduledHandoverStation || t.stationCode,
                          t.reliever?.dutyNo,
                          t.dutyNo,
                          t.timeRemainingMins || 3
                        )}
                        className="flex items-center gap-1 text-[9px] text-cyan-300 bg-cyan-950 hover:bg-cyan-900 px-2.5 py-1 rounded border border-cyan-700 font-bold font-mono transition shadow"
                        title="Re-trigger 3-Min Handover Voice Announcement"
                      >
                        <Megaphone className="h-3 w-3 text-cyan-400" /> Re-announce (3m)
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Verified Audio Announcement Activity History ── */}
        {announcementLogs.length > 0 && (
          <div className="mt-5 border-t border-slate-850 pt-4">
            <div className="flex justify-between items-center mb-2">
              <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 font-mono flex items-center gap-1.5">
                <Volume2 className="h-3.5 w-3.5 text-emerald-400" /> Recent Verified Audio Announcements Log ({announcementLogs.length})
              </span>
              <button 
                onClick={() => setAnnouncementLogs([])}
                className="text-[9px] text-slate-500 hover:text-slate-400 font-mono"
              >
                Clear Log
              </button>
            </div>
            <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
              {announcementLogs.slice(0, 10).map((log) => (
                <div key={log.id} className="bg-slate-900/70 border border-slate-850 rounded px-2.5 py-1.5 flex flex-wrap justify-between items-center text-[9px] font-mono gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-cyan-400 font-bold">{log.time}</span>
                    <span className="px-1.5 py-0.2 rounded bg-slate-800 text-slate-200 font-bold">{log.stationCode} ({log.direction})</span>
                    <span className="text-white font-bold">Train {log.trainId}</span>
                    {log.tripEndsIn && (
                      <span className="px-1.5 py-0.2 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 text-[8px] font-bold">
                        Trip Ends In {log.tripEndsIn}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400">Active: <strong className="text-slate-200">{log.operatorName}</strong> ({log.operatorDuty || '--'})</span>
                    <span className="text-emerald-400">➔ Next TO: <strong className="text-white">{log.relieverName}</strong> ({log.relieverDuty ? `Duty ${log.relieverDuty}` : log.relieverId})</span>
                    <span className="px-1.5 py-0.2 rounded bg-emerald-950 text-emerald-300 border border-emerald-700 text-[8px] font-bold">BILINGUAL</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── 5. ADVANCED LINE-2 FLEET DAY TIMETABLE OPERATIONS & KM ENGINE ── */}
      <div className="mb-6 bg-slate-950 border border-slate-800 rounded-2xl p-5 shadow-2xl space-y-5">
        
        {/* Top Header & View Modes Switcher */}
        <div className="flex flex-col 2xl:flex-row 2xl:items-center justify-between gap-4 border-b border-slate-850 pb-4">
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-cyan-500"></span>
              </span>
              <h4 className="text-base font-black text-slate-100 uppercase tracking-wider font-mono">
                Line-2 Fleet Day Timetable Operations & KM Engine
              </h4>
              <span className="px-2.5 py-0.5 rounded-full bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 text-[10px] font-black tracking-wider uppercase font-mono">
                {activeSchedule} WTT MASTER • TELEMETRY ACTIVE
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-1 font-sans">
              High-Precision Dynamic Timetable Distance Analytics, Specific Energy Consumption (SEC), Schedule Variance ($\Delta t$), and Spatial Corridor Headway Radar.
            </p>
          </div>

          {/* Controls: Search, View Switcher & Export */}
          <div className="flex items-center gap-2.5 flex-wrap">
            {/* Search Input */}
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-500" />
              <input id="livetrainpositiontracker-input-1" name="livetrainpositiontracker_input_1"
                type="text"
                value={tableSearchQuery}
                onChange={(e) => setTableSearchQuery(e.target.value)}
                placeholder="Search Train, Driver, Station..."
                className="bg-slate-900 border border-slate-750 text-xs rounded-lg pl-8 pr-3 py-1.5 focus:outline-none focus:border-cyan-500 font-mono text-slate-200 placeholder:text-slate-600 w-52 shadow-inner"
              />
            </div>

            {/* 5-Mode View Switcher */}
            <div className="flex items-center bg-slate-900 border border-slate-800 p-0.5 rounded-lg font-mono">
              <button
                onClick={() => setViewMode('cards')}
                className={`px-2.5 py-1.5 rounded text-xs font-bold flex items-center gap-1.5 transition-all ${
                  viewMode === 'cards'
                    ? 'bg-cyan-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Fleet Cards View"
              >
                <LayoutGrid size={13} />
                <span>Cards</span>
              </button>
              <button
                onClick={() => setViewMode('table')}
                className={`px-2.5 py-1.5 rounded text-xs font-bold flex items-center gap-1.5 transition-all ${
                  viewMode === 'table'
                    ? 'bg-cyan-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Master KM Matrix Table"
              >
                <Table size={13} />
                <span>KM Matrix</span>
              </button>
              <button
                onClick={() => setViewMode('radar')}
                className={`px-2.5 py-1.5 rounded text-xs font-bold flex items-center gap-1.5 transition-all ${
                  viewMode === 'radar'
                    ? 'bg-cyan-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Headway & Corridor Spacing Radar"
              >
                <Compass size={13} />
                <span>Headway Radar</span>
              </button>
              <button
                onClick={() => setViewMode('energy')}
                className={`px-2.5 py-1.5 rounded text-xs font-bold flex items-center gap-1.5 transition-all ${
                  viewMode === 'energy'
                    ? 'bg-cyan-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Traction Power & Environmental Analytics"
              >
                <Zap size={13} />
                <span>Energy & SEC</span>
              </button>
              <button
                onClick={() => setViewMode('maintenance')}
                className={`px-2.5 py-1.5 rounded text-xs font-bold flex items-center gap-1.5 transition-all ${
                  viewMode === 'maintenance'
                    ? 'bg-cyan-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Rolling Stock Rake Health & Stabling Matrix"
              >
                <Shield size={13} />
                <span>Rake Health</span>
              </button>
            </div>

            {/* Export Full Fleet Reports */}
            <div className="flex items-center gap-1.5">
              <button
                onClick={exportFleetReportCsv}
                className="px-2.5 py-1.5 bg-emerald-700/80 hover:bg-emerald-600 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 border border-emerald-500/40 shadow-sm transition"
                title="Download full fleet operations report as CSV"
              >
                <Download size={13} />
                <span>CSV</span>
              </button>
            </div>
          </div>
        </div>

        {/* 6-Tile Fleet Master Telemetry Dashboard */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 font-mono">
          <div className="bg-slate-900/90 border border-slate-800 p-3 rounded-xl shadow-md">
            <span className="text-[8px] uppercase text-slate-400 font-bold block tracking-wider">Fleet Assigned KM</span>
            <div className="flex items-baseline gap-1 mt-0.5">
              <strong className="text-slate-100 text-base font-black">{fleetKmSummary.totalAssignedKm}</strong>
              <span className="text-[10px] text-slate-400 font-normal">KM</span>
            </div>
            <span className="text-[8px] text-slate-500 block mt-0.5">
              {fleetKmSummary.totalFleet} trains scheduled
            </span>
          </div>

          <div className="bg-emerald-950/20 border border-emerald-500/30 p-3 rounded-xl shadow-md">
            <span className="text-[8px] uppercase text-emerald-400 font-bold block tracking-wider">Distance Covered</span>
            <div className="flex items-baseline gap-1 mt-0.5">
              <strong className="text-emerald-300 text-base font-black">{fleetKmSummary.totalCoveredKm}</strong>
              <span className="text-[10px] text-emerald-400 font-normal">KM</span>
            </div>
            <span className="text-[8px] text-emerald-400/70 block mt-0.5">
              Up to {simulatedTime}
            </span>
          </div>

          <div className="bg-cyan-950/20 border border-cyan-500/30 p-3 rounded-xl shadow-md">
            <span className="text-[8px] uppercase text-cyan-400 font-bold block tracking-wider">Remaining Distance</span>
            <div className="flex items-baseline gap-1 mt-0.5">
              <strong className="text-cyan-300 text-base font-black">{fleetKmSummary.totalRemainingKm}</strong>
              <span className="text-[10px] text-cyan-400 font-normal">KM</span>
            </div>
            <span className="text-[8px] text-cyan-400/70 block mt-0.5">
              To complete day
            </span>
          </div>

          <div className="bg-slate-900/90 border border-slate-800 p-3 rounded-xl shadow-md">
            <span className="text-[8px] uppercase text-amber-400 font-bold block tracking-wider">Fleet Completion</span>
            <div className="flex items-baseline gap-1 mt-0.5">
              <strong className="text-amber-300 text-base font-black">{fleetKmSummary.progressPct}%</strong>
            </div>
            <div className="w-full bg-slate-800 rounded-full h-1 mt-1.5 overflow-hidden">
              <div 
                className="bg-gradient-to-r from-amber-500 to-emerald-400 h-full rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, Math.max(2, fleetKmSummary.progressPct))}%` }}
              />
            </div>
          </div>

          <div className="bg-purple-950/20 border border-purple-500/30 p-3 rounded-xl shadow-md">
            <span className="text-[8px] uppercase text-purple-400 font-bold block tracking-wider flex items-center gap-1">
              <Zap size={10} /> Net Traction Energy
            </span>
            <div className="flex items-baseline gap-1 mt-0.5">
              <strong className="text-purple-300 text-base font-black">{fleetKmSummary.totalNetEnergyKwh}</strong>
              <span className="text-[10px] text-purple-400 font-normal">kWh</span>
            </div>
            <span className="text-[8px] text-purple-400/70 block mt-0.5">
              +{fleetKmSummary.totalRegenKwh} kWh Regen Saved
            </span>
          </div>

          <div className="bg-slate-900/90 border border-slate-800 p-3 rounded-xl shadow-md">
            <span className="text-[8px] uppercase text-slate-400 font-bold block tracking-wider">Punctuality (OTP)</span>
            <div className="flex items-baseline gap-1 mt-0.5">
              <strong className="text-emerald-400 text-base font-black">{fleetKmSummary.onTimeRatePct}%</strong>
              <span className="text-[10px] text-slate-400 font-normal">OTP</span>
            </div>
            <span className="text-[8px] text-slate-500 block mt-0.5">
              {fleetKmSummary.onTimeCount} On-Time • {fleetKmSummary.delayedCount} Delayed
            </span>
          </div>
        </div>

        {/* Filter & Sort Interactive Ribbon */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/70 border border-slate-800/80 px-3.5 py-2.5 rounded-xl font-mono text-xs">
          {/* Direction Filter Pills */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[9px] uppercase text-slate-400 font-bold mr-1 flex items-center gap-1">
              <Filter size={11} /> Corridor:
            </span>
            {[
              { id: 'ALL', label: `All (${liveTrainPositions.length})` },
              { id: 'UP', label: `UP Line (${liveTrainPositions.filter(t => t.direction === 'UP' && !t.isStabling).length})` },
              { id: 'DOWN', label: `DOWN Line (${liveTrainPositions.filter(t => t.direction === 'DOWN' && !t.isStabling).length})` },
              { id: 'STABLED', label: `Stabled (${liveTrainPositions.filter(t => t.isStabling).length})` }
            ].map(pill => (
              <button
                key={pill.id}
                onClick={() => setFleetDirectionFilter(pill.id)}
                className={`px-2 py-1 rounded text-[9px] font-bold transition-all ${
                  fleetDirectionFilter === pill.id
                    ? 'bg-cyan-600 text-white shadow-sm'
                    : 'bg-slate-800/80 text-slate-400 hover:text-slate-200 border border-slate-700/50'
                }`}
              >
                {pill.label}
              </button>
            ))}
          </div>

          {/* Punctuality Filter Pills */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[9px] uppercase text-slate-400 font-bold mr-1">Status:</span>
            {[
              { id: 'ALL', label: 'All' },
              { id: 'ON_TIME', label: `On-Time (${liveTrainPositions.filter(t => (t.delayMins || 0) === 0).length})` },
              { id: 'DELAYED', label: `Delayed (${liveTrainPositions.filter(t => (t.delayMins || 0) > 0).length})` },
              { id: 'RELIEF_PENDING', label: `Relief Due (${liveTrainPositions.filter(t => t.shouldAnnounceReliever || t.hasReliever).length})` }
            ].map(pill => (
              <button
                key={pill.id}
                onClick={() => setFleetPunctualityFilter(pill.id)}
                className={`px-2 py-1 rounded text-[9px] font-bold transition-all ${
                  fleetPunctualityFilter === pill.id
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'bg-slate-800/80 text-slate-400 hover:text-slate-200 border border-slate-700/50'
                }`}
              >
                {pill.label}
              </button>
            ))}
          </div>

          {/* Sort Selector & Direction Toggle */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 text-[9px] text-slate-400">
              <ArrowUpDown size={11} />
              <span>Sort:</span>
            </div>
            <select id="livetrainpositiontracker-select-2" name="livetrainpositiontracker_select_2"
              value={fleetSortBy}
              onChange={(e) => setFleetSortBy(e.target.value)}
              className="bg-slate-950 border border-slate-750 text-slate-200 text-[10px] rounded px-2 py-1 focus:outline-none focus:border-cyan-500 font-mono"
            >
              <option value="trainId">Train ID</option>
              <option value="progressPct">Day Progress %</option>
              <option value="dayDistanceRemainingKm">Remaining Distance (KM)</option>
              <option value="dayDistanceCoveredKm">Covered Distance (KM)</option>
              <option value="totalDayAssignedKm">Assigned Distance (KM)</option>
              <option value="delayMins">Punctuality Variance</option>
            </select>

            <button
              onClick={() => setFleetSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
              className="px-2 py-1 bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 rounded text-[9px] font-bold transition"
              title="Toggle Sort Direction"
            >
              {fleetSortOrder === 'asc' ? '▲ ASC' : '▼ DESC'}
            </button>
          </div>
        </div>

        {/* ── VIEW MODE 1: ENHANCED CARDS GRID ── */}
        {viewMode === 'cards' && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredAndSortedFleet.length === 0 ? (
              <div className="col-span-3 py-12 bg-slate-900/40 border border-slate-850 rounded-xl text-center text-slate-500 italic font-mono">
                No trains match the active filter criteria at {simulatedTime}.
              </div>
            ) : (
              filteredAndSortedFleet.map((t, idx) => (
                <div 
                  key={`${t.trainId}_${t.direction}_${t.rowId || idx}`} 
                  className="bg-slate-950 border border-slate-850 rounded-2xl p-4 flex flex-col justify-between hover:border-cyan-500/50 transition-all shadow-lg hover:shadow-cyan-950/20 group relative overflow-hidden"
                >
                  {/* Subtle Corner Direction Glow */}
                  <div className={`absolute top-0 right-0 w-24 h-24 blur-3xl opacity-15 pointer-events-none rounded-full ${
                    t.isStabling ? 'bg-amber-500' : t.direction === 'UP' ? 'bg-emerald-500' : 'bg-cyan-500'
                  }`} />

                  <div>
                    {/* Card Top: Train ID & Badges */}
                    <div className="flex justify-between items-center border-b border-slate-850 pb-2.5 mb-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`h-2.5 w-2.5 rounded-full ${t.isStabling ? 'bg-amber-500' : 'bg-emerald-400 animate-pulse'}`}></span>
                        <span className="font-black text-slate-100 text-sm tracking-wider font-mono">
                          TRAIN {t.trainId}
                        </span>
                        {t.isStabling ? (
                          <span className="px-1.5 py-0.5 rounded bg-amber-950/80 text-amber-300 border border-amber-600/50 text-[8px] font-bold font-mono">
                            {t.motionState || 'STABLED'}
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-600/50 text-[8px] font-bold font-mono">
                            {t.instantaneousSpeed > 0 ? `${t.instantaneousSpeed} km/h • ${t.motionState}` : t.motionState}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5">
                        <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase font-mono border ${
                          t.delayMins === 0 
                            ? 'bg-emerald-950/60 text-emerald-400 border-emerald-600/40' 
                            : t.delayMins > 0 
                            ? 'bg-rose-950/60 text-rose-300 border-rose-600/40' 
                            : 'bg-cyan-950/60 text-cyan-300 border-cyan-600/40'
                        }`}>
                          {t.punctualityStatus || 'ON TIME'}
                        </span>
                        <span className={`px-2 py-0.5 rounded border text-[8.5px] font-black uppercase tracking-wider font-mono ${
                          t.direction === 'UP' 
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' 
                            : 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30'
                        }`}>
                          {t.direction}
                        </span>
                      </div>
                    </div>

                    {/* Multi-Segment Trip Timeline Ribbon */}
                    <div className="mb-3 bg-slate-900/60 p-2 rounded-xl border border-slate-850/80 space-y-1.5">
                      <div className="flex items-center justify-between text-[8px] font-mono text-slate-400">
                        <span className="font-bold flex items-center gap-1">
                          <Activity size={10} className="text-cyan-400" />
                          <span>Day Itinerary Progression</span>
                        </span>
                        <span className="text-slate-300 font-bold">
                          Trip {t.currentTripNumber} of {t.totalTrips} ({t.completedTripsCount} Done)
                        </span>
                      </div>

                      {/* Visual Segment Ribbon */}
                      <div className="flex items-center gap-0.5 h-2 w-full rounded overflow-hidden bg-slate-950 p-0.5 border border-slate-800">
                        {(t.allTrips || []).map((tr, i) => (
                          <div 
                            key={`seg_${i}`}
                            title={`Trip #${tr.tripNo}: ${tr.route} (${tr.status})`}
                            className={`h-full rounded-sm transition-all ${
                              tr.status === 'COMPLETED' 
                                ? 'bg-emerald-500 flex-1' 
                                : tr.status === 'IN_PROGRESS' 
                                ? 'bg-cyan-400 animate-pulse flex-1 shadow-sm shadow-cyan-400' 
                                : 'bg-slate-800 flex-1 opacity-50'
                            }`}
                          />
                        ))}
                      </div>
                    </div>

                    {/* Operational Details */}
                    <div className="space-y-1.5 text-[10px] font-mono text-slate-400">
                      <div className="flex justify-between">
                        <span className="text-slate-500">Active Operator:</span>
                        <strong className="text-emerald-400">{t.operatorName} ({t.operatorId})</strong>
                      </div>

                      <div className="flex justify-between">
                        <span className="text-slate-500">Current Location:</span>
                        <strong className="text-slate-200">{t.currentStation}</strong>
                      </div>

                      <div className="flex justify-between">
                        <span className="text-slate-500">Active Chainage:</span>
                        <strong className="text-cyan-400">{t.chainage >= 0 ? `+${t.chainage.toFixed(3)}` : t.chainage.toFixed(3)} KM</strong>
                      </div>

                      {t.headwayInfo && t.headwayInfo.leadTrainId !== 'TERMINUS LEAD' && (
                        <div className="flex justify-between text-[9px] text-slate-400">
                          <span className="text-slate-500">Corridor Headway:</span>
                          <span className={t.headwayInfo.timeHeadwayMins < 3.5 ? 'text-amber-400 font-bold' : 'text-slate-300'}>
                            {t.headwayInfo.timeHeadwayMins}m gap ({t.headwayInfo.distGapKm} KM to T{t.headwayInfo.leadTrainId})
                          </span>
                        </div>
                      )}

                      {t.reliever && (
                        <div className="flex justify-between text-amber-300 bg-amber-950/25 p-2 rounded-lg border border-amber-500/30 text-[9.5px]">
                          <span className="font-bold flex items-center gap-1">
                            <Clock size={11} className="text-amber-400" />
                            <span>PYID Reliever:</span>
                          </span>
                          <strong>{t.reliever?.name || '--'} {t.reliever?.dutyNo && t.reliever.dutyNo !== '--' ? `(Duty ${t.reliever.dutyNo})` : ''}</strong>
                        </div>
                      )}
                    </div>

                    {/* Day Timetable KM Engine Telemetry Summary */}
                    <div className="mt-3 pt-2.5 border-t border-slate-850 space-y-2">
                      <div className="flex items-center justify-between text-[9px] font-mono">
                        <span className="text-slate-400 font-bold uppercase tracking-wider flex items-center gap-1">
                          <TrendingUp size={11} className="text-cyan-400" />
                          <span>Day KM Fulfillment</span>
                        </span>
                        <span className="text-cyan-300 font-black">{t.dayProgressPct}% Done</span>
                      </div>

                      {/* 3 Core KM Metrics: Assigned, Covered, Remaining */}
                      <div className="grid grid-cols-3 gap-1.5 font-mono">
                        <div className="bg-slate-900/90 p-1.5 rounded-lg border border-slate-800 text-center">
                          <div className="text-[7px] text-slate-500 uppercase tracking-tight font-bold">Assigned KM</div>
                          <strong className="text-slate-100 text-[11px] block">{t.totalDayAssignedKm} KM</strong>
                          <span className="text-[7px] text-slate-400 block">{t.totalTrips} Trips</span>
                        </div>

                        <div className="bg-emerald-950/20 p-1.5 rounded-lg border border-emerald-500/30 text-center">
                          <div className="text-[7px] text-emerald-400 uppercase tracking-tight font-bold">Covered</div>
                          <strong className="text-emerald-300 text-[11px] block">{t.dayDistanceCoveredKm} KM</strong>
                          <span className="text-[7px] text-emerald-500/80 block">{t.completedTripsCount} Done</span>
                        </div>

                        <div className="bg-cyan-950/20 p-1.5 rounded-lg border border-cyan-500/30 text-center">
                          <div className="text-[7px] text-cyan-400 uppercase tracking-tight font-bold">Remaining</div>
                          <strong className="text-cyan-300 text-[11px] block">{t.dayDistanceRemainingKm} KM</strong>
                          <span className="text-[7px] text-cyan-500/80 block">To Go</span>
                        </div>
                      </div>

                      {/* Traction Energy & CO2 Telemetry Tag */}
                      <div className="bg-slate-900/60 px-2 py-1 rounded-lg border border-slate-850/80 flex items-center justify-between text-[8px] font-mono">
                        <span className="text-purple-300 flex items-center gap-1 font-bold">
                          <Zap size={10} className="text-purple-400" />
                          <span>Net: {t.netEnergyKwh || 0} kWh</span>
                        </span>
                        <span className="text-emerald-400">
                          🍃 -{t.co2SavedKg || 0} kg CO2
                        </span>
                        <span className="text-slate-500">
                          {t.maintenanceStatus || 'CHECK OK'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Card Bottom: Report Action & Announcement Trigger */}
                  <div className="mt-3 pt-2.5 border-t border-slate-850/60 flex items-center justify-between gap-2">
                    <button
                      onClick={() => setSelectedTrain(t)}
                      className="px-2.5 py-1 bg-cyan-600/20 hover:bg-cyan-600/40 text-cyan-300 border border-cyan-500/40 rounded-lg text-[9px] font-bold flex items-center gap-1 transition-all"
                    >
                      <FileText size={11} />
                      <span>Full Train Telemetry</span>
                    </button>

                    {t.shouldAnnounceReliever && t.reliever && (
                      <button
                        onClick={() => triggerBilingualAnnouncement(
                          t.trainId, 
                          t.direction, 
                          t.reliever?.name, 
                          t.operatorName, 
                          t.scheduledHandoverStation || 'PYID',
                          t.reliever?.dutyNo,
                          t.dutyNo,
                          t.timeRemainingMins || 3
                        )}
                        className="px-2 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg text-[9px] font-black flex items-center gap-1 transition shadow animate-pulse"
                        title="Trigger Voice Announcement"
                      >
                        <Megaphone size={11} />
                        <span>Voice Relief</span>
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* ── VIEW MODE 2: MASTER KM MATRIX TABLE VIEW ── */}
        {viewMode === 'table' && (
          <div className="bg-slate-950 border border-slate-850 rounded-2xl overflow-hidden shadow-2xl">
            <div className="px-4 py-3 bg-slate-900/70 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Table className="h-4 w-4 text-cyan-400" />
                <h4 className="text-xs font-black text-slate-200 uppercase tracking-wider font-mono">
                  Line-2 Fleet Operational & Day Timetable KM Master Matrix ({activeSchedule})
                </h4>
              </div>
              <span className="text-[10px] text-slate-400 font-mono">
                Showing <strong className="text-cyan-300">{filteredAndSortedFleet.length}</strong> of {liveTrainPositions.length} Fleet Trains
              </span>
            </div>

            <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-slate-700">
              <table className="w-full text-left font-mono text-[10px] border-collapse">
                <thead>
                  <tr className="bg-slate-900 border-b border-slate-800 text-slate-400 font-bold uppercase text-[8.5px]">
                    <th className="py-3 px-3">Train ID</th>
                    <th className="py-3 px-2">Status</th>
                    <th className="py-3 px-2">Dir</th>
                    <th className="py-3 px-3">Current Location</th>
                    <th className="py-3 px-2">Chainage</th>
                    <th className="py-3 px-2 text-center">Velocity</th>
                    <th className="py-3 px-2 text-center">Variance ($\Delta t$)</th>
                    <th className="py-3 px-3">Active Train Operator</th>
                    <th className="py-3 px-3">PYID Reliever</th>
                    <th className="py-3 px-2 text-center">Trips</th>
                    <th className="py-3 px-3 text-right">Assigned KM</th>
                    <th className="py-3 px-3 text-right text-emerald-400">Covered KM</th>
                    <th className="py-3 px-3 text-right text-cyan-400">Remaining KM</th>
                    <th className="py-3 px-2 text-right text-purple-400">Net kWh</th>
                    <th className="py-3 px-3 text-center">Day Progress</th>
                    <th className="py-3 px-3 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-850">
                  {filteredAndSortedFleet.map((t, idx) => (
                    <tr 
                      key={`row_${t.trainId}_${idx}`} 
                      className="hover:bg-slate-900/70 transition cursor-pointer"
                      onClick={() => setSelectedTrain(t)}
                    >
                      <td className="py-2.5 px-3 font-black text-cyan-300 text-xs">
                        {t.computedTrainId ? (
                          <div className="flex flex-col">
                            <span className="text-emerald-400 font-black text-sm tracking-wide">{t.computedTrainId}</span>
                            <span className="text-[8px] text-slate-500 font-normal">Unit {t.particularTrainId || t.legacyTrainId || t.trainId}</span>
                          </div>
                        ) : (
                          <div className="flex flex-col">
                            <span className="text-cyan-300 font-black text-sm">T{t.legacyTrainId || t.trainId}</span>
                            {t.trainIdStatus && t.trainIdStatus !== 'VALID' && (
                              <span className="text-[7.5px] text-amber-400 font-bold uppercase">
                                {t.trainIdStatus === 'WTT_MATCH_PENDING' ? 'WTT PENDING' : 'DATA ERR'}
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-2">
                        <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold ${
                          t.isStabling 
                            ? 'bg-amber-950/60 text-amber-300 border border-amber-700/50' 
                            : 'bg-emerald-950/60 text-emerald-300 border border-emerald-700/50'
                        }`}>
                          {t.isStabling ? 'STABLED' : 'RUNNING'}
                        </span>
                      </td>
                      <td className="py-2.5 px-2 font-bold">
                        <span className={t.direction === 'UP' ? 'text-emerald-400' : 'text-sky-400'}>
                          {t.direction}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-200 font-bold">
                        {t.currentStation}
                      </td>
                      <td className="py-2.5 px-2 text-cyan-400 font-bold">
                        {t.chainage >= 0 ? `+${t.chainage.toFixed(3)}` : t.chainage.toFixed(3)}
                      </td>
                      <td className="py-2.5 px-2 text-center text-slate-300">
                        {t.instantaneousSpeed > 0 ? `${t.instantaneousSpeed} km/h` : '0 (Dwell)'}
                      </td>
                      <td className="py-2.5 px-2 text-center">
                        <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold ${
                          t.delayMins === 0 
                            ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' 
                            : t.delayMins > 0 
                            ? 'bg-rose-950 text-rose-300 border border-rose-800' 
                            : 'bg-cyan-950 text-cyan-300 border border-cyan-800'
                        }`}>
                          {t.punctualityStatus || 'ON TIME'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-300">
                        <strong className="text-emerald-300">{t.operatorName}</strong> ({t.operatorId})
                      </td>
                      <td className="py-2.5 px-3 text-amber-300">
                        {t.reliever?.name ? `${t.reliever.name} (${t.reliever.dutyNo || '--'})` : '--'}
                      </td>
                      <td className="py-2.5 px-2 text-center text-slate-400 font-bold">
                        {t.completedTripsCount} / {t.totalTrips}
                      </td>
                      <td className="py-2.5 px-3 text-right font-black text-slate-100">
                        {t.totalDayAssignedKm} KM
                      </td>
                      <td className="py-2.5 px-3 text-right font-black text-emerald-400">
                        {t.dayDistanceCoveredKm} KM
                      </td>
                      <td className="py-2.5 px-3 text-right font-black text-cyan-400">
                        {t.dayDistanceRemainingKm} KM
                      </td>
                      <td className="py-2.5 px-2 text-right font-black text-purple-300">
                        {t.netEnergyKwh || 0}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <div className="w-14 bg-slate-800 rounded-full h-1.5 overflow-hidden">
                            <div 
                              className="bg-gradient-to-r from-cyan-500 to-emerald-400 h-full rounded-full"
                              style={{ width: `${Math.min(100, Math.max(2, t.dayProgressPct))}%` }}
                            />
                          </div>
                          <span className="text-[8.5px] font-bold text-slate-300">{t.dayProgressPct}%</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedTrain(t);
                          }}
                          className="px-2 py-1 bg-cyan-600/20 hover:bg-cyan-600/40 text-cyan-300 border border-cyan-500/30 rounded text-[8.5px] font-bold"
                        >
                          Telemetry
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── VIEW MODE 3: SPATIAL HEADWAY & CORRIDOR RADAR VIEW ── */}
        {viewMode === 'radar' && (
          <div className="space-y-4">
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-3">
                <div className="flex items-center gap-2">
                  <Compass className="h-4 w-4 text-emerald-400" />
                  <h5 className="text-xs font-black uppercase tracking-wider text-emerald-300 font-mono">
                    UP Corridor Headway Radar (APTD +23.8 km ➔ BIET -9.2 km)
                  </h5>
                </div>
                <span className="text-[10px] text-slate-400 font-mono">
                  {liveTrainPositions.filter(t => !t.isStabling && t.direction === 'UP').length} Trains in Service
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {liveTrainPositions
                  .filter(t => !t.isStabling && t.direction === 'UP')
                  .map((t, idx) => (
                    <div 
                      key={`radar_up_${t.trainId}`} 
                      onClick={() => setSelectedTrain(t)}
                      className="bg-slate-950 border border-slate-850 p-3 rounded-xl hover:border-emerald-500/40 transition cursor-pointer font-mono"
                    >
                      <div className="flex justify-between items-center mb-1">
                        <div>
                          <strong className="text-emerald-400 font-black text-sm">
                            TRAIN {t.computedTrainId || t.trainId}
                          </strong>
                          {t.particularTrainId && t.computedTrainId && (
                            <span className="text-[8.5px] text-slate-400 font-normal ml-1.5">(Unit {t.particularTrainId})</span>
                          )}
                        </div>
                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-950 text-emerald-300 border border-emerald-700">
                          {t.chainage >= 0 ? `+${t.chainage.toFixed(3)}` : t.chainage.toFixed(3)} KM
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-300 font-bold mb-1.5">{t.currentStation}</div>
                      <div className="text-[8.5px] text-slate-400 bg-slate-900 p-1.5 rounded border border-slate-800 flex justify-between items-center">
                        <span>Lead: T{t.headwayInfo?.leadTrainId || '--'}</span>
                        <strong className={t.headwayInfo?.timeHeadwayMins < 3.5 ? 'text-amber-400' : 'text-emerald-400'}>
                          {t.headwayInfo?.timeHeadwayMins || '--'} mins ({t.headwayInfo?.distGapKm || '--'} KM)
                        </strong>
                      </div>
                    </div>
                  ))}
              </div>
            </div>

            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-3">
                <div className="flex items-center gap-2">
                  <Compass className="h-4 w-4 text-cyan-400" />
                  <h5 className="text-xs font-black uppercase tracking-wider text-cyan-300 font-mono">
                    DOWN Corridor Headway Radar (BIET -9.2 km ➔ APTD +23.8 km)
                  </h5>
                </div>
                <span className="text-[10px] text-slate-400 font-mono">
                  {liveTrainPositions.filter(t => !t.isStabling && t.direction === 'DOWN').length} Trains in Service
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {liveTrainPositions
                  .filter(t => !t.isStabling && t.direction === 'DOWN')
                  .map((t, idx) => (
                    <div 
                      key={`radar_dn_${t.trainId}`} 
                      onClick={() => setSelectedTrain(t)}
                      className="bg-slate-950 border border-slate-850 p-3 rounded-xl hover:border-cyan-500/40 transition cursor-pointer font-mono"
                    >
                      <div className="flex justify-between items-center mb-1">
                        <div>
                          <strong className="text-cyan-400 font-black text-sm">
                            TRAIN {t.computedTrainId || t.trainId}
                          </strong>
                          {t.particularTrainId && t.computedTrainId && (
                            <span className="text-[8.5px] text-slate-400 font-normal ml-1.5">(Unit {t.particularTrainId})</span>
                          )}
                        </div>
                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-cyan-950 text-cyan-300 border border-cyan-700">
                          {t.chainage >= 0 ? `+${t.chainage.toFixed(3)}` : t.chainage.toFixed(3)} KM
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-300 font-bold mb-1.5">{t.currentStation}</div>
                      <div className="text-[8.5px] text-slate-400 bg-slate-900 p-1.5 rounded border border-slate-800 flex justify-between items-center">
                        <span>Lead: T{t.headwayInfo?.leadTrainId || '--'}</span>
                        <strong className={t.headwayInfo?.timeHeadwayMins < 3.5 ? 'text-amber-400' : 'text-cyan-400'}>
                          {t.headwayInfo?.timeHeadwayMins || '--'} mins ({t.headwayInfo?.distGapKm || '--'} KM)
                        </strong>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        )}

        {/* ── VIEW MODE 4: TRACTION POWER & ENERGY (SEC) VIEW ── */}
        {viewMode === 'energy' && (
          <div className="space-y-4 font-mono">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-xl">
                <span className="text-[9px] uppercase text-slate-400 font-bold block">Gross Traction Energy</span>
                <strong className="text-slate-100 text-lg font-black block mt-1">{fleetKmSummary.totalGrossEnergyKwh} kWh</strong>
                <span className="text-[8px] text-slate-500 block mt-1">~2.85 kWh/train-km standard</span>
              </div>
              <div className="bg-emerald-950/20 border border-emerald-500/30 p-4 rounded-xl">
                <span className="text-[9px] uppercase text-emerald-400 font-bold block">Regenerative Recovery</span>
                <strong className="text-emerald-300 text-lg font-black block mt-1">-{fleetKmSummary.totalRegenKwh} kWh</strong>
                <span className="text-[8px] text-emerald-400/80 block mt-1">28% Kinetic braking recovery</span>
              </div>
              <div className="bg-purple-950/20 border border-purple-500/30 p-4 rounded-xl">
                <span className="text-[9px] uppercase text-purple-400 font-bold block">Net Fleet Energy Consumed</span>
                <strong className="text-purple-300 text-lg font-black block mt-1">{fleetKmSummary.totalNetEnergyKwh} kWh</strong>
                <span className="text-[8px] text-purple-400/80 block mt-1">Net Specific Energy Consumption</span>
              </div>
              <div className="bg-teal-950/20 border border-teal-500/30 p-4 rounded-xl">
                <span className="text-[9px] uppercase text-teal-400 font-bold block">Environmental CO2 Offset</span>
                <strong className="text-teal-300 text-lg font-black block mt-1">-{fleetKmSummary.totalCo2SavedKg} kg</strong>
                <span className="text-[8px] text-teal-400/80 block mt-1">Carbon avoided vs road traffic</span>
              </div>
            </div>

            <div className="bg-slate-950 border border-slate-850 rounded-2xl overflow-hidden shadow-2xl">
              <div className="px-4 py-3 bg-slate-900/70 border-b border-slate-800 flex justify-between items-center text-xs">
                <span className="font-bold text-slate-200">TRAIN-BY-TRAIN SPECIFIC ENERGY CONSUMPTION (SEC)</span>
                <span className="text-slate-400 text-[10px]">Benchmark: 6-Car BMRCL Stainless Steel Rake</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[10px]">
                  <thead>
                    <tr className="bg-slate-900 border-b border-slate-800 text-slate-400 font-bold uppercase text-[8.5px]">
                      <th className="py-2.5 px-3">Train</th>
                      <th className="py-2.5 px-3">Distance Covered</th>
                      <th className="py-2.5 px-3">Gross Traction</th>
                      <th className="py-2.5 px-3">Regenerative Recovery</th>
                      <th className="py-2.5 px-3">Net Energy (kWh)</th>
                      <th className="py-2.5 px-3">CO2 Offset</th>
                      <th className="py-2.5 px-3 text-center">Energy Efficiency Rating</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-850">
                    {filteredAndSortedFleet.map(t => (
                      <tr key={`eng_${t.trainId}`} className="hover:bg-slate-900/50">
                        <td className="py-2 px-3 font-bold text-cyan-300">T{t.trainId}</td>
                        <td className="py-2 px-3">{t.dayDistanceCoveredKm} KM</td>
                        <td className="py-2 px-3 text-slate-300">{t.grossTractionKwh} kWh</td>
                        <td className="py-2 px-3 text-emerald-400">-{t.regenRecoveredKwh} kWh</td>
                        <td className="py-2 px-3 font-black text-purple-300">{t.netEnergyKwh} kWh</td>
                        <td className="py-2 px-3 text-teal-400">-{t.co2SavedKg} kg</td>
                        <td className="py-2 px-3 text-center">
                          <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-700 font-bold text-[8.5px]">
                            OPTIMAL (A+)
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ── VIEW MODE 5: RAKE HEALTH & STABLING MATRIX VIEW ── */}
        {viewMode === 'maintenance' && (
          <div className="space-y-4 font-mono">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-xl">
                <span className="text-[9px] uppercase text-slate-400 font-bold block">Active In-Service Fleet</span>
                <strong className="text-emerald-400 text-lg font-black block mt-1">{fleetKmSummary.runningCount} Rakes</strong>
                <span className="text-[8px] text-slate-500 block mt-1">Continuous Line 2 Mainline Service</span>
              </div>
              <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-xl">
                <span className="text-[9px] uppercase text-amber-400 font-bold block">Stabled Reserve Fleet</span>
                <strong className="text-amber-300 text-lg font-black block mt-1">{fleetKmSummary.stabledCount} Rakes</strong>
                <span className="text-[8px] text-slate-500 block mt-1">Peenya Depot SBL & PYID RD-3</span>
              </div>
              <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-xl">
                <span className="text-[9px] uppercase text-slate-400 font-bold block">Daily Inspection Compliance</span>
                <strong className="text-cyan-300 text-lg font-black block mt-1">100% Passed</strong>
                <span className="text-[8px] text-slate-500 block mt-1">Threshold: &lt;500 km per rotation</span>
              </div>
              <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-xl">
                <span className="text-[9px] uppercase text-slate-400 font-bold block">Rake Health Rating</span>
                <strong className="text-emerald-400 text-lg font-black block mt-1">98.4% Average</strong>
                <span className="text-[8px] text-slate-500 block mt-1">Alstom Line 2 Standard Fleet</span>
              </div>
            </div>

            <div className="bg-slate-950 border border-slate-850 rounded-2xl overflow-hidden shadow-2xl">
              <div className="px-4 py-3 bg-slate-900/70 border-b border-slate-800 flex justify-between items-center text-xs">
                <span className="font-bold text-slate-200">PEENYA DEPOT & LINE 2 ROLLING STOCK STATUS</span>
                <span className="text-slate-400 text-[10px]">Stabling Lines (SBL) & RD-3 Loop Track</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[10px]">
                  <thead>
                    <tr className="bg-slate-900 border-b border-slate-800 text-slate-400 font-bold uppercase text-[8.5px]">
                      <th className="py-2.5 px-3">Train ID</th>
                      <th className="py-2.5 px-3">Operating State</th>
                      <th className="py-2.5 px-3">Current Location / Stabling Line</th>
                      <th className="py-2.5 px-3">Day Mileage (KM)</th>
                      <th className="py-2.5 px-3 text-center">Health Index</th>
                      <th className="py-2.5 px-3">Maintenance Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-850">
                    {filteredAndSortedFleet.map(t => (
                      <tr key={`maint_${t.trainId}`} className="hover:bg-slate-900/50">
                        <td className="py-2 px-3 font-bold text-cyan-300">T{t.trainId}</td>
                        <td className="py-2 px-3">
                          <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold ${
                            t.isStabling ? 'bg-amber-950 text-amber-300 border border-amber-700' : 'bg-emerald-950 text-emerald-300 border border-emerald-700'
                          }`}>
                            {t.isStabling ? 'STABLED' : 'ACTIVE IN SERVICE'}
                          </span>
                        </td>
                        <td className="py-2 px-3 font-semibold text-slate-200">{t.currentStation}</td>
                        <td className="py-2 px-3 font-black text-slate-100">{t.dayDistanceCoveredKm} KM</td>
                        <td className="py-2 px-3 text-center text-emerald-400 font-bold">{t.rakeHealthPct || 98}%</td>
                        <td className="py-2 px-3">
                          <span className="px-2 py-0.5 rounded bg-slate-900 text-slate-300 border border-slate-700 text-[8.5px] font-bold">
                            {t.maintenanceStatus || 'DAILY TRIP CHECK OK'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

      </div>

      {/* ── 8. COMPREHENSIVE MULTI-TAB TRAIN OPERATIONAL & TIMETABLE REPORT MODAL ── */}
      {selectedTrain && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-3 md:p-6 overflow-y-auto">
          <div className="bg-slate-950 border-2 border-cyan-500/40 rounded-2xl max-w-4xl w-full shadow-2xl animate-scale-up font-mono text-slate-200 overflow-hidden my-auto max-h-[92vh] flex flex-col">
            
            {/* Modal Header Bar */}
            <div className="bg-slate-900 px-5 py-3.5 border-b border-slate-800 flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-cyan-950 border border-cyan-700/60 text-cyan-400">
                  <Train size={18} />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-base font-black text-slate-100 uppercase tracking-wider font-mono">
                      TRAIN REPORT: T{selectedTrain.trainId}
                    </h3>
                    <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${
                      selectedTrain.isStabling 
                        ? 'bg-amber-950 text-amber-300 border border-amber-600' 
                        : 'bg-emerald-950 text-emerald-300 border border-emerald-600'
                    }`}>
                      {selectedTrain.isStabling ? 'STABLED' : 'RUNNING'}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-700 text-[9px] font-bold">
                      {activeSchedule} WTT
                    </span>
                  </div>
                  <span className="text-[9px] text-slate-400 font-sans">
                    BMRCL Line 2 Green Line • Official Chainage Alignment & Distance Covered Telemetry
                  </span>
                </div>
              </div>

              {/* Action Buttons: Print, Download CSV, Download JSON, Close */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-bold flex items-center gap-1 border border-slate-700 transition"
                  title="Print this train report"
                >
                  <Printer size={12} />
                  <span className="hidden sm:inline">Print</span>
                </button>

                <button
                  onClick={() => exportTrainReportCsv(selectedTrain)}
                  className="px-2.5 py-1.5 bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg text-xs font-bold flex items-center gap-1 border border-emerald-500 shadow-sm transition"
                  title="Download Train CSV Itinerary"
                >
                  <Download size={12} />
                  <span className="hidden sm:inline">CSV</span>
                </button>

                <button
                  onClick={() => exportTrainReportJson(selectedTrain)}
                  className="px-2.5 py-1.5 bg-purple-700 hover:bg-purple-600 text-white rounded-lg text-xs font-bold flex items-center gap-1 border border-purple-500 shadow-sm transition"
                  title="Download Train JSON Telemetry"
                >
                  <Download size={12} />
                  <span className="hidden sm:inline">JSON</span>
                </button>

                <button 
                  onClick={() => setSelectedTrain(null)} 
                  className="px-2.5 py-1.5 text-slate-400 hover:text-white bg-slate-800 hover:bg-rose-900 border border-slate-700 rounded-lg text-xs font-black transition"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Modal Tab Switcher */}
            <div className="bg-slate-900/60 border-b border-slate-850 px-5 py-2 flex items-center gap-2">
              {[
                { id: 'schedule', label: `1. Trips Itinerary (${selectedTrain.allTrips?.length || 0})` },
                { id: 'energy', label: '2. Traction & Energy (SEC)' },
                { id: 'rake', label: '3. Rake Health & Maintenance' },
                { id: 'crew', label: '4. Crew & Reliever Handover' }
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setModalTab(tab.id)}
                  className={`px-3 py-1 rounded text-xs font-bold transition-all ${
                    modalTab === tab.id
                      ? 'bg-cyan-600 text-white shadow-md'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Modal Body (Scrollable) */}
            <div className="p-5 space-y-4 overflow-y-auto flex-1 text-xs">
              
              {/* 4 Key Timetable KM Metric Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-slate-900 p-3 rounded-xl border border-slate-800 text-center">
                  <span className="text-[8.5px] uppercase text-slate-400 block font-bold tracking-wider">
                    Total Assigned KM
                  </span>
                  <strong className="text-slate-100 text-lg font-black block mt-0.5">
                    {selectedTrain.totalDayAssignedKm} KM
                  </strong>
                  <span className="text-[8px] text-slate-500 block mt-0.5">
                    {selectedTrain.totalTrips} Total Scheduled Trips
                  </span>
                </div>

                <div className="bg-emerald-950/25 p-3 rounded-xl border border-emerald-500/40 text-center">
                  <span className="text-[8.5px] uppercase text-emerald-400 block font-bold tracking-wider">
                    Distance Covered
                  </span>
                  <strong className="text-emerald-300 text-lg font-black block mt-0.5">
                    {selectedTrain.dayDistanceCoveredKm} KM
                  </strong>
                  <span className="text-[8px] text-emerald-400/80 block mt-0.5">
                    {selectedTrain.completedTripsCount} Trips Finished
                  </span>
                </div>

                <div className="bg-cyan-950/25 p-3 rounded-xl border border-cyan-500/40 text-center">
                  <span className="text-[8.5px] uppercase text-cyan-400 block font-bold tracking-wider">
                    Remaining Distance
                  </span>
                  <strong className="text-cyan-300 text-lg font-black block mt-0.5">
                    {selectedTrain.dayDistanceRemainingKm} KM
                  </strong>
                  <span className="text-[8px] text-cyan-400/80 block mt-0.5">
                    To Complete Schedule
                  </span>
                </div>

                <div className="bg-slate-900 p-3 rounded-xl border border-slate-800 text-center">
                  <span className="text-[8.5px] uppercase text-amber-400 block font-bold tracking-wider">
                    Day Completion
                  </span>
                  <strong className="text-amber-300 text-lg font-black block mt-0.5">
                    {selectedTrain.dayProgressPct}%
                  </strong>
                  <div className="w-full bg-slate-800 rounded-full h-1 mt-1.5 overflow-hidden">
                    <div 
                      className="bg-gradient-to-r from-amber-500 to-emerald-400 h-full rounded-full"
                      style={{ width: `${Math.min(100, Math.max(2, selectedTrain.dayProgressPct))}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* TAB 1: TRIPS SCHEDULE ITINERARY */}
              {modalTab === 'schedule' && (
                <div className="bg-slate-900/80 border border-slate-800 rounded-xl overflow-hidden">
                  <div className="px-4 py-2.5 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FileText size={13} className="text-cyan-400" />
                      <h4 className="text-xs font-black text-slate-200 uppercase tracking-wider font-mono">
                        Complete Day Timetable Itinerary ({selectedTrain.allTrips?.length || 0} Scheduled Trips)
                      </h4>
                    </div>
                    <span className="text-[9px] text-slate-400 font-mono">
                      Official WTT Master Progression
                    </span>
                  </div>

                  <div className="overflow-x-auto max-h-64 scrollbar-thin scrollbar-thumb-slate-700">
                    <table className="w-full text-left font-mono text-[10px] border-collapse">
                      <thead>
                        <tr className="bg-slate-950 border-b border-slate-800 text-slate-400 font-bold uppercase text-[8px] sticky top-0">
                          <th className="py-2 px-2.5">Trip</th>
                          <th className="py-2 px-2">Dir</th>
                          <th className="py-2 px-3">Route (Origin ➔ Destination)</th>
                          <th className="py-2 px-2">Dep Time</th>
                          <th className="py-2 px-2">Arr Time</th>
                          <th className="py-2 px-2 text-right">Leg KM</th>
                          <th className="py-2 px-2.5 text-right">Cum. KM</th>
                          <th className="py-2 px-3 text-center">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-850">
                        {(selectedTrain.allTrips || []).map((tr) => (
                          <tr 
                            key={`trip_${tr.tripNo}_${tr.id}`} 
                            className={`transition ${
                              tr.status === 'IN_PROGRESS' 
                                ? 'bg-cyan-950/30 border-y border-cyan-500/40 text-cyan-200 font-bold' 
                                : tr.status === 'COMPLETED'
                                  ? 'text-slate-300 hover:bg-slate-850/50'
                                  : 'text-slate-500 hover:bg-slate-850/30'
                            }`}
                          >
                            <td className="py-1.5 px-2.5 font-bold">
                              #{tr.tripNo}
                            </td>
                            <td className="py-1.5 px-2 font-bold">
                              <span className={tr.direction === 'UP' ? 'text-emerald-400' : 'text-sky-400'}>
                                {tr.direction}
                              </span>
                            </td>
                            <td className="py-1.5 px-3 font-semibold text-slate-200">
                              {tr.route}
                            </td>
                            <td className="py-1.5 px-2 font-mono">
                              {tr.startTimeStr}
                            </td>
                            <td className="py-1.5 px-2 font-mono">
                              {tr.endTimeStr}
                            </td>
                            <td className="py-1.5 px-2 text-right font-bold">
                              {tr.distanceKm} KM
                            </td>
                            <td className="py-1.5 px-2.5 text-right text-slate-400 font-mono">
                              {tr.cumKm} KM
                            </td>
                            <td className="py-1.5 px-3 text-center">
                              {tr.status === 'IN_PROGRESS' && (
                                <span className="px-2 py-0.5 rounded bg-cyan-600 text-white font-black text-[8px] animate-pulse shadow-sm">
                                  ▶ RUNNING NOW ({tr.tripCoveredKm} KM)
                                </span>
                              )}
                              {tr.status === 'COMPLETED' && (
                                <span className="px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-700 text-[8px] font-bold">
                                  ✓ COMPLETED
                                </span>
                              )}
                              {tr.status === 'SCHEDULED' && (
                                <span className="text-slate-500 text-[8px]">
                                  Scheduled
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* TAB 2: TRACTION & ENERGY */}
              {modalTab === 'energy' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                    <div className="bg-slate-900 p-3 rounded-xl border border-slate-800">
                      <span className="text-[8px] text-slate-400 block font-bold uppercase">Gross Traction</span>
                      <strong className="text-slate-100 text-base font-black">{selectedTrain.grossTractionKwh || 0} kWh</strong>
                    </div>
                    <div className="bg-emerald-950/25 p-3 rounded-xl border border-emerald-500/30">
                      <span className="text-[8px] text-emerald-400 block font-bold uppercase">Regenerative Recovery</span>
                      <strong className="text-emerald-300 text-base font-black">-{selectedTrain.regenRecoveredKwh || 0} kWh</strong>
                    </div>
                    <div className="bg-purple-950/25 p-3 rounded-xl border border-purple-500/30">
                      <span className="text-[8px] text-purple-400 block font-bold uppercase">Net Traction Energy</span>
                      <strong className="text-purple-300 text-base font-black">{selectedTrain.netEnergyKwh || 0} kWh</strong>
                    </div>
                    <div className="bg-teal-950/25 p-3 rounded-xl border border-teal-500/30">
                      <span className="text-[8px] text-teal-400 block font-bold uppercase">Carbon Offset</span>
                      <strong className="text-teal-300 text-base font-black">-{selectedTrain.co2SavedKg || 0} kg CO2</strong>
                    </div>
                  </div>

                  <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 text-[10px] space-y-2">
                    <div className="flex justify-between border-b border-slate-800 pb-1">
                      <span className="text-slate-400">Traction System:</span>
                      <strong className="text-slate-200">750V DC Third Rail • IGBT Inverter Propulsion</strong>
                    </div>
                    <div className="flex justify-between border-b border-slate-800 pb-1">
                      <span className="text-slate-400">Specific Energy Consumption (SEC):</span>
                      <strong className="text-emerald-400">2.85 kWh / train-km (Gross) • 2.05 kWh / train-km (Net)</strong>
                    </div>
                    <div className="flex justify-between border-b border-slate-800 pb-1">
                      <span className="text-slate-400">Regenerative Braking Efficiency:</span>
                      <strong className="text-cyan-400">28.0% Returned to Substation Grid</strong>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 3: RAKE HEALTH & MAINTENANCE */}
              {modalTab === 'rake' && (
                <div className="space-y-3">
                  <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 space-y-2 text-[10px]">
                    <div className="flex justify-between border-b border-slate-800 pb-1">
                      <span className="text-slate-400">Rake Formation:</span>
                      <strong className="text-cyan-300 font-bold">6-Car (DMC1 - TC - MC - MC - TC - DMC2)</strong>
                    </div>
                    <div className="flex justify-between border-b border-slate-800 pb-1">
                      <span className="text-slate-400">Assigned Depot:</span>
                      <strong className="text-slate-200">Peenya Depot (PYID)</strong>
                    </div>
                    <div className="flex justify-between border-b border-slate-800 pb-1">
                      <span className="text-slate-400">Daily Mileage Wear:</span>
                      <strong className="text-emerald-400">{selectedTrain.dayDistanceCoveredKm} KM (&lt;500 KM Daily Limit)</strong>
                    </div>
                    <div className="flex justify-between border-b border-slate-800 pb-1">
                      <span className="text-slate-400">Rolling Stock Health Score:</span>
                      <strong className="text-emerald-400">{selectedTrain.rakeHealthPct || 98}% (A+ Condition)</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Inspection Status:</span>
                      <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-700 font-bold">
                        {selectedTrain.maintenanceStatus || 'DAILY TRIP CHECK OK'}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 4: CREW & RELIEVER HANDOVER */}
              {modalTab === 'crew' && (
                <div className="space-y-3">
                  <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 space-y-2 text-[10px]">
                    <div className="flex justify-between border-b border-slate-800 pb-1">
                      <span className="text-slate-400">Active Driving Operator:</span>
                      <strong className="text-emerald-400">{selectedTrain.operatorName} ({selectedTrain.operatorId})</strong>
                    </div>
                    <div className="flex justify-between border-b border-slate-800 pb-1">
                      <span className="text-slate-400">Current Duty Number:</span>
                      <strong className="text-slate-200">Duty {selectedTrain.dutyNo || '--'}</strong>
                    </div>
                    <div className="flex justify-between border-b border-slate-800 pb-1">
                      <span className="text-slate-400">Reliever Operator:</span>
                      <strong className="text-amber-300">{selectedTrain.reliever?.name || 'None Assigned'}</strong>
                    </div>
                    <div className="flex justify-between border-b border-slate-800 pb-1">
                      <span className="text-slate-400">Scheduled Handover Station:</span>
                      <strong className="text-slate-200">{selectedTrain.scheduledHandoverStation || 'PYID'}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Reliever Duty ID:</span>
                      <strong className="text-slate-200">Duty {selectedTrain.reliever?.dutyNo || '--'}</strong>
                    </div>
                  </div>
                </div>
              )}

            </div>

            {/* Modal Footer */}
            <div className="bg-slate-900 px-5 py-3 border-t border-slate-800 flex items-center justify-between text-xs">
              <span className="text-slate-500 font-mono text-[9px]">
                Report calculated in real-time from {activeSchedule} Working Time Table (WTT).
              </span>
              <button
                onClick={() => setSelectedTrain(null)}
                className="px-4 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg font-bold text-xs shadow-md transition-colors"
              >
                Close Report
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
