/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot } from 'firebase/firestore';
import { 
  Train, MapPin, Clock, Shield, User, Sliders, Volume2, VolumeX, AlertTriangle, CheckCircle2, Megaphone, Radio
} from 'lucide-react';
import { 
  STATION_CHAINAGE, 
  STATION_ORDER, 
  getTripEndpoints, 
  timeToMinutes, 
  minutesToTime 
} from '../utils/kpiEngine';
import { EMPLOYEE_MASTER_REGISTRY } from '../data/employeeProfileMaster';
import { WTT_MASTER_REGISTRY } from '../data/wttMasterRegistry';

export default function LiveTrainPositionTracker({ 
  liveTrainTrackingMap: propLiveTrainTrackingMap = {}, 
  activeDay: propActiveDay = 'WEEKDAY' 
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

  const [simulatedTime, setSimulatedTime] = useState(() => {
    const now = new Date();
    return `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
  });
  const [isLiveClock, setIsLiveClock] = useState(true);
  const [clockIntervalId, setClockIntervalId] = useState(null);
  const [selectedTrain, setSelectedTrain] = useState(null);
  const [activeSchedule, setActiveSchedule] = useState(() => {
    if (propActiveDay) return propActiveDay.toUpperCase();
    const day = new Date().getDay();
    if (day === 0) return 'SUNDAY';
    if (day === 6) return 'SATURDAY';
    if (day === 1) return 'MONDAY';
    return 'WEEKDAY';
  });

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
  useEffect(() => {
    if (isLiveClock) {
      const interval = setInterval(() => {
        const now = new Date();
        const hrs = String(now.getHours()).padStart(2, '0');
        const mins = String(now.getMinutes()).padStart(2, '0');
        setSimulatedTime(`${hrs}:${mins}`);
      }, 1000);
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
  const timeToSecondsNormalized = (timeStr) => {
    if (!timeStr || timeStr === '--' || timeStr === '-') return 999999;
    const [h, m] = String(timeStr).trim().split(':').map(Number);
    if (isNaN(h) || isNaN(m)) return 999999;
    let secs = (h * 3600) + (m * 60);
    if (h < 3) secs += 24 * 3600;
    return secs;
  };

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

    // 2. Build train timeline map
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

    // 3. Compute current, previous, and nextReliver for each train
    const calculatedTracking = {};
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

  // Position detection logic for active trains moving along Green Line & Relief Station Alerts (PYID, KGWA, PUTH)
  const { liveTrainPositions, reliefStationAlerts } = useMemo(() => {
    const timeMins = timeToMinutes(simulatedTime);
    const evalSecs = timeToSecondsNormalized(simulatedTime);
    const activeChainages = Object.keys(stationChainageDB).length > 0 ? stationChainageDB : STATION_CHAINAGE;

    // Filter WTT matrix for active day (with full WTT master registry fallback for complete schedule coverage)
    const firestoreTrips = (wttMatrix || []).filter(t => isScheduleMatch(t.scheduleType, activeSchedule));
    const activeTrips = firestoreTrips.length > 0 
      ? firestoreTrips 
      : staticWttTrips.filter(t => isScheduleMatch(t.scheduleType, activeSchedule));
    const activeWTTTrains = [...new Set(activeTrips.map(t => String(t.trainId).trim()))];
    const positions = [];
    const stationAlerts = [];

    activeWTTTrains.forEach((tId) => {
      const trainTrips = activeTrips.filter(t => String(t.trainId).trim() === tId);
      let activeTrip = null;

      // Find if train has an active trip at this time
      for (let i = 0; i < trainTrips.length; i++) {
        const trip = trainTrips[i];
        const stations = [];
        for (const [st, timeStr] of Object.entries(trip.stations || {})) {
          if (timeStr && timeStr !== '--' && timeStr !== '-') {
            stations.push({ station: st, timeMin: timeToMinutes(timeStr) });
          }
        }
        if (stations.length < 2) continue;
        stations.sort((a, b) => a.timeMin - b.timeMin);

        // Incorporate active live delays
        const matchedDelay = liveIncidents.filter(inc => String(inc.trainId).trim() === tId);
        const delayOffset = matchedDelay.reduce((acc, curr) => acc + (curr.delayMins || 0), 0);

        const tripStart = stations[0].timeMin + delayOffset;
        const tripEnd = stations[stations.length - 1].timeMin + delayOffset;

        if (timeMins >= tripStart && timeMins <= tripEnd) {
          activeTrip = trip;
          break;
        }
      }

      if (activeTrip) {
        const stations = [];
        for (const [st, timeStr] of Object.entries(activeTrip.stations || {})) {
          if (timeStr && timeStr !== '--' && timeStr !== '-') {
            stations.push({ station: st, timeMin: timeToMinutes(timeStr) });
          }
        }
        stations.sort((a, b) => a.timeMin - b.timeMin);

        // Apply delay offsets
        const matchedDelay = liveIncidents.filter(inc => String(inc.trainId).trim() === tId);
        const delayOffset = matchedDelay.reduce((acc, curr) => acc + (curr.delayMins || 0), 0);
        stations.forEach(s => s.timeMin += delayOffset);

        // Find current station segment
        let prevSt = stations[0];
        let nextSt = stations[stations.length - 1];

        for (let j = 0; j < stations.length - 1; j++) {
          if (timeMins >= stations[j].timeMin && timeMins <= stations[j+1].timeMin) {
            prevSt = stations[j];
            nextSt = stations[j+1];
            break;
          }
        }

        const prevChain = activeChainages[prevSt.station] || 0;
        const nextChain = activeChainages[nextSt.station] || 0;
        const startChain = activeChainages[stations[0].station] || 0;
        const endChain = activeChainages[stations[stations.length - 1].station] || 0;

        // Calculate progress percentage in segment
        const segmentDuration = nextSt.timeMin - prevSt.timeMin;
        const timePassed = timeMins - prevSt.timeMin;
        const pct = segmentDuration > 0 ? timePassed / segmentDuration : 1;

        // Calculate current chainage
        const currentChainage = prevChain + pct * (nextChain - prevChain);

        // Calculate distance travelled / remaining
        const distanceTravelled = Math.abs(currentChainage - startChain);
        const distanceRemaining = Math.abs(endChain - currentChainage);

        // Get direction
        const { direction } = getTripEndpoints(activeTrip);
        const isUp = direction === 'UP';

        // ── Direct lookup from dynamic tracking matrix & LIVE RELIEF TRACKING ──
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

        // Reliever lookup from dynamic tracking matrix
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

        // Previous operator lookup from dynamic tracking matrix
        let previousOperator = null;
        if (prevOp && prevOp.empName && prevOp.empName !== '--') {
          previousOperator = {
            name: prevOp.empName,
            id: prevOp.empId || '--',
            dutyNo: prevOp.dutyId || '--',
            relievedTime: prevOp.endStr || '--'
          };
        }

        // Determine the exact scheduled handover station for this reliever (from WTT timetable at reliever takeover time)
        let scheduledHandoverStation = null;
        if (relieverOp && relieverOp.startSec < 999999) {
          const targetMin = Math.round(relieverOp.startSec / 60);
          for (let ti = 0; ti < trainTrips.length; ti++) {
            const trip = trainTrips[ti];
            for (const [stCode, timeStr] of Object.entries(trip.stations || {})) {
              if (timeStr && timeStr !== '--' && timeStr !== '-') {
                const stMin = timeToMinutes(timeStr);
                if (Math.abs(stMin - targetMin) <= 4) {
                  scheduledHandoverStation = stCode;
                  break;
                }
              }
            }
            if (scheduledHandoverStation) break;
          }
        }
        if (!scheduledHandoverStation) {
          scheduledHandoverStation = 'PYID'; // Default Line-2 main crew changeover depot
        }

        // Check if reliever is valid and distinct from current operator
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

        // Determine scheduled trip / duty turn completion time for current driving operator
        let tripCompletionSec = null;
        if (relieverOp && relieverOp.startSec < 999999) {
          tripCompletionSec = relieverOp.startSec;
        } else if (currentOp && currentOp.endSec < 999999) {
          tripCompletionSec = currentOp.endSec;
        } else if (stations && stations.length > 0) {
          tripCompletionSec = stations[stations.length - 1].timeMin * 60;
        }

        // Time remaining until the current driving operator's trip is completed (in seconds & minutes)
        const timeRemainingToCompletionSec = tripCompletionSec !== null ? (tripCompletionSec - evalSecs) : 999999;
        const timeRemainingMins = Math.max(0, Math.ceil(timeRemainingToCompletionSec / 60));

        // EXACT REQUIREMENT:
        // "once the current driving train operator trip time will be completed next 3 mins"
        // Active when remaining time is between 0 and 180 seconds (0 to 3 minutes)
        const isTripCompletingIn3Mins = timeRemainingToCompletionSec > 0 && timeRemainingToCompletionSec <= 180;

        // EXACT REQUIREMENT:
        // "if there is no reliver dont make any announcement"
        const shouldAnnounceReliever = isTripCompletingIn3Mins && isVerifiedReliever;
        const hasReliever = shouldAnnounceReliever;

        const trainObj = {
          trainId: tId,
          operatorName: operatorInfo.name,
          operatorId: operatorInfo.id,
          dutyNo: operatorInfo.dutyNo,
          isExchanged: operatorInfo.isExchanged,
          originalEmpName: operatorInfo.originalEmpName,
          currentStation: pct > 0.8 ? nextSt.station : pct < 0.2 ? prevSt.station : `${prevSt.station} ➔ ${nextSt.station}`,
          previousStation: prevSt.station,
          nextStation: nextSt.station,
          direction,
          chainage: parseFloat(currentChainage.toFixed(3)),
          distanceTravelled: parseFloat(distanceTravelled.toFixed(2)),
          distanceRemaining: parseFloat(distanceRemaining.toFixed(2)),
          pctLine: (currentChainage - activeChainages.BIET) / (activeChainages.APTS - activeChainages.BIET),
          reliever,
          scheduledHandoverStation,
          isVerifiedReliever,
          tripCompletionSec,
          timeRemainingToCompletionSec,
          timeRemainingMins,
          isTripCompletingIn3Mins,
          shouldAnnounceReliever,
          hasReliever,
          previousOperator
        };

        positions.push(trainObj);

        // ── Precise Proximity & Departure Detection for Verified Relief Stations (PYID, KGWA, PUTH) ──
        RELIEF_STATION_CONFIG.filter(st => st.isReliefStation).forEach(st => {
          const stChain = activeChainages[st.code] ?? st.chainage;
          
          let distToStation;
          let isApproaching = false;
          let isAtPlatform = false;
          let isDeparted = false;

          if (isUp) {
            // UP Track: travels APTS (+23.833) ➔ BIET (-9.227) [decreasing chainage]
            distToStation = currentChainage - stChain; // > 0 before station, < 0 after station
            isApproaching = distToStation >= -0.15 && distToStation <= 1.35;
            isAtPlatform = Math.abs(distToStation) <= 0.15;
            isDeparted = distToStation < -0.15;
          } else {
            // DOWN Track: travels BIET (-9.227) ➔ APTS (+23.833) [increasing chainage]
            distToStation = stChain - currentChainage; // > 0 before station, < 0 after station
            isApproaching = distToStation >= -0.15 && distToStation <= 1.35;
            isAtPlatform = Math.abs(distToStation) <= 0.15;
            isDeparted = distToStation < -0.15;
          }

          // Relief Station matching logic
          const isStationMatch = (st.code === scheduledHandoverStation);
          const stationHasReliever = shouldAnnounceReliever && (isStationMatch || !scheduledHandoverStation);

          // If train is in the vicinity of this station or scheduled for relief here
          if ((isApproaching || isAtPlatform || (distToStation >= -0.8 && distToStation < 0)) || nextSt.station === st.code || prevSt.station === st.code || trainObj.currentStation.includes(st.code) || (isStationMatch && isTripCompletingIn3Mins)) {
            stationAlerts.push({
              ...trainObj,
              stationCode: st.code,
              stationLabel: st.label,
              stationNameEn: st.nameEn,
              stationNameKn: st.nameKn,
              hasReliever: stationHasReliever,
              isTripCompletingIn3Mins,
              shouldAnnounceReliever,
              isStationMatch,
              isApproaching: (isApproaching || isAtPlatform || trainObj.currentStation.includes(st.code)) && !isDeparted,
              isAtPlatform,
              isDeparted,
              distToStation: Math.abs(distToStation).toFixed(2),
              stationStatus: isDeparted ? 'DEPARTED' : isAtPlatform ? 'AT PLATFORM' : isTripCompletingIn3Mins ? 'TRIP ENDING (3 MIN)' : 'APPROACHING'
            });
          }
        });
      }
    });

    return { 
      liveTrainPositions: positions, 
      reliefStationAlerts: stationAlerts 
    };
  }, [simulatedTime, wttMatrix, staticWttTrips, liveIncidents, dynamicTrainTrackingMap, stationChainageDB, activeSchedule, dailyCrewTracks, RELIEF_STATION_CONFIG, propLiveTrainTrackingMap]);

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
              Active Fleet: <span className="text-cyan-400 font-bold">{liveTrainPositions.length}</span>
              {' | '}Station Approaches: <span className="text-amber-400 font-bold">{reliefStationAlerts.filter(a => !a.isDeparted).length}</span>
              {' | '}Relief in 3 Mins: <span className="text-emerald-400 font-bold">{liveTrainPositions.filter(t => t.shouldAnnounceReliever).length}</span>
              {' | '}Voice System: <span className={`font-bold ${voiceEnabled ? 'text-emerald-400' : 'text-rose-500'}`}>{voiceEnabled ? 'ACTIVE (KN + EN)' : 'MUTED'}</span>
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
            onChange={(e) => setActiveSchedule(e.target.value)}
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
            setSimulatedTime(minutesToTime(parseInt(e.target.value)));
          }}
          className="flex-1 accent-cyan-500 bg-slate-900 h-1.5 rounded-lg border border-slate-800 cursor-pointer"
        />
        <span className="text-[10px] font-bold text-slate-500 uppercase">23:59</span>
        <div className="bg-slate-900 border border-slate-800 px-3.5 py-1 rounded-md text-sm font-black text-cyan-400 tracking-widest shadow-inner">
          {simulatedTime}
        </div>
      </div>

      {/* ── Official Chainage Alignment representation (Green Line) ── */}
      <div className="bg-slate-950 border border-slate-850 p-6 rounded-2xl relative overflow-x-auto mb-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-4 border-b border-slate-850 pb-2">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-[10px] text-slate-400 uppercase tracking-widest font-black">
              Official Chainage Alignment representation (Green Line)
            </h4>
            <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[8px] font-black uppercase tracking-wider">
              {activeSchedule} SCHEDULE • LIVE RELIEF TRACKING SYNCED
            </span>
            {isLiveClock && (
              <span className="px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 text-[8px] font-black uppercase tracking-wider flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse"></span>
                LIVE CLOCK: ALWAYS ON
              </span>
            )}
          </div>
          <div className="flex gap-4 text-[9px] font-mono font-bold">
            <span className="flex items-center gap-1 text-emerald-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              UP TRACK (APTS ➔ BIET)
            </span>
            <span className="flex items-center gap-1 text-cyan-400">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-pulse"></span>
              DOWN TRACK (BIET ➔ APTS)
            </span>
          </div>
        </div>
        
        {/* Track Graphic Container */}
        <div className="w-[1700px] h-[220px] relative select-none py-10">
          
          {/* UP Track Line (Emerald) */}
          <div className="absolute top-[40px] left-[4%] right-[4%] h-1 bg-emerald-950/60 rounded-full border-t border-emerald-800/40"></div>
          
          {/* DOWN Track Line (Cyan) */}
          <div className="absolute top-[130px] left-[4%] right-[4%] h-1 bg-cyan-950/60 rounded-full border-t border-cyan-800/40"></div>

          {/* Station grid alignment lines & tick marks */}
          {STATION_ORDER.map((station) => {
            const chainages = Object.keys(stationChainageDB).length > 0 ? stationChainageDB : STATION_CHAINAGE;
            const posPct = (chainages[station] - chainages.BIET) / (chainages.APTS - chainages.BIET);
            const leftPos = `${4 + posPct * 92}%`;
            const isPyidStation = station === 'PYID';
            
            return (
              <div 
                key={station} 
                className="absolute top-0 bottom-0 -translate-x-1/2 flex flex-col items-center group cursor-help z-10"
                style={{ left: leftPos, height: '180px' }}
              >
                {/* Station label rotated at -45 degrees */}
                <div className={`absolute -top-3 text-[9px] font-bold font-mono group-hover:text-slate-100 transition-colors transform -rotate-45 origin-bottom-left whitespace-nowrap pl-1 ${
                  isPyidStation ? 'text-amber-400 font-black scale-110' : 'text-slate-400'
                }`}>
                  {station} {isPyidStation ? '📍' : ''}
                </div>

                {/* Vertical dashed alignment marker */}
                <div className={`absolute top-4 bottom-6 w-0.5 border-l border-dashed transition-colors ${
                  isPyidStation ? 'border-amber-500/80 w-1' : 'border-slate-800/60 group-hover:border-cyan-500/30'
                }`}></div>

                {/* UP track tick */}
                <div className={`absolute top-[40px] -translate-y-1/2 h-3 w-3 rounded-full bg-slate-950 border-2 flex items-center justify-center transition-colors shadow ${
                  isPyidStation ? 'border-amber-400 bg-amber-950' : 'border-slate-700 group-hover:border-emerald-400 group-hover:bg-slate-900'
                }`}>
                  <span className={`h-1 w-1 rounded-full ${isPyidStation ? 'bg-amber-400 animate-ping' : 'bg-emerald-500/20 group-hover:bg-emerald-400'}`}></span>
                </div>

                {/* DOWN track tick */}
                <div className={`absolute top-[130px] -translate-y-1/2 h-3 w-3 rounded-full bg-slate-950 border-2 flex items-center justify-center transition-colors shadow ${
                  isPyidStation ? 'border-amber-400 bg-amber-950' : 'border-slate-700 group-hover:border-cyan-400 group-hover:bg-slate-900'
                }`}>
                  <span className={`h-1 w-1 rounded-full ${isPyidStation ? 'bg-amber-400 animate-ping' : 'bg-cyan-500/20 group-hover:bg-cyan-400'}`}></span>
                </div>

                {/* Chainage display */}
                <div className="absolute bottom-0 text-[7px] text-slate-600 font-mono tracking-wide group-hover:text-slate-300 transition-colors">
                  {chainages[station]?.toFixed(3)}
                </div>
              </div>
            );
          })}

          {/* Dynamic train markers moving on the tracks with DISTINCT ACTIVE OPERATOR NAME */}
          {liveTrainPositions.map((train) => {
            const leftPos = `${4 + train.pctLine * 92}%`;
            const isUp = train.direction === 'UP';
            const topOffset = isUp ? '40px' : '130px';
            const themeColorClass = isUp 
              ? 'bg-emerald-500 text-slate-950 font-black border-emerald-400/40 shadow-[0_0_12px_rgba(16,185,129,0.5)]' 
              : 'bg-cyan-500 text-slate-950 font-black border-cyan-400/40 shadow-[0_0_12px_rgba(6,182,212,0.5)]';

            return (
              <div
                key={train.trainId}
                className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center group z-20 transition-all duration-300"
                style={{ left: leftPos, top: topOffset }}
              >
                {/* Glowing train badge */}
                <div 
                  onClick={() => setSelectedTrain(train)}
                  className={`${themeColorClass} text-[9px] px-2 py-1 rounded-md border flex items-center gap-1 cursor-pointer hover:scale-105 transition-transform`}
                >
                  <Train size={9} className={isUp ? 'rotate-180 transition-transform' : ''} />
                  T{train.trainId}
                </div>

                {/* Real-Time Operator Name & Duty label from LIVE RELIEF TRACKING */}
                <div className="absolute top-6 bg-slate-900/95 text-[8px] font-bold text-cyan-300 px-2 py-0.5 rounded border border-slate-700 whitespace-nowrap shadow-lg flex items-center gap-1 z-20">
                  <User className="h-2.5 w-2.5 text-emerald-400 shrink-0" />
                  <span className="truncate max-w-[110px]">{train.operatorName}</span>
                  {train.dutyNo && train.dutyNo !== '--' && (
                    <span className="text-[7px] px-1 py-0.2 rounded bg-cyan-950 text-cyan-300 border border-cyan-800 font-mono font-bold">
                      D{train.dutyNo}
                    </span>
                  )}
                </div>

                {/* 3-Minute Trip Completion Alert badge */}
                {train.shouldAnnounceReliever && train.reliever && (
                  <div className="absolute -top-6 bg-gradient-to-r from-emerald-600 to-cyan-600 text-white text-[7px] font-black px-2 py-0.5 rounded border border-emerald-300 animate-pulse whitespace-nowrap shadow-lg flex items-center gap-1">
                    <Megaphone className="h-2 w-2 text-yellow-300" />
                    <span>Relief in {train.timeRemainingMins}m: {train.reliever.name.split(' ')[0]}</span>
                  </div>
                )}
                {train.isTripCompletingIn3Mins && !train.isVerifiedReliever && (
                  <div className="absolute -top-6 bg-slate-800 text-slate-400 text-[7px] font-mono px-1.5 py-0.5 rounded border border-slate-700 whitespace-nowrap">
                    Trip End in {train.timeRemainingMins}m (No Reliever • Muted)
                  </div>
                )}

                {/* Popover detailed info panel on hover */}
                <div className="absolute top-11 w-56 bg-slate-950 border border-slate-800 p-2.5 rounded-lg shadow-2xl invisible group-hover:visible z-30 flex flex-col gap-1 text-[9px] text-slate-400 font-sans tracking-wide">
                  <div className="font-bold text-slate-200 font-mono text-[10px] border-b border-slate-850 pb-1 mb-1 flex justify-between">
                    <span>Train {train.trainId} ({train.direction})</span>
                    <span className="text-cyan-400 font-sans">Ch: {train.chainage}</span>
                  </div>
                  <div>Current Operator: <strong className="text-emerald-400 font-mono">{train.operatorName} ({train.operatorId})</strong></div>
                  <div>Duty No: <strong className="text-blue-300 font-mono">{train.dutyNo}</strong></div>
                  <div>Schedule / Day Type: <strong className="text-cyan-300 font-mono">{activeSchedule}</strong></div>
                  <div>Current Station: <strong className="text-slate-200 font-mono">{train.currentStation}</strong></div>
                  <div>Next Target: <strong className="text-slate-300 font-mono">{train.nextStation}</strong></div>
                  {train.timeRemainingToCompletionSec < 999999 && (
                    <div className="text-[9px] text-amber-300 font-mono">
                      Trip Completing In: <strong>{train.timeRemainingMins} mins</strong>
                    </div>
                  )}
                  {train.reliever && (
                    <div className={`border-t border-slate-800 pt-1 mt-1 font-mono ${train.shouldAnnounceReliever ? 'text-emerald-300 font-black animate-pulse' : 'text-amber-300 font-bold'}`}>
                      {train.shouldAnnounceReliever ? '📢 Handover in 3m: ' : 'Reliever TO: '}
                      {train.reliever.name} ({train.reliever.id}) • Duty {train.reliever.dutyNo}
                    </div>
                  )}
                  {train.isTripCompletingIn3Mins && !train.isVerifiedReliever && (
                    <div className="text-rose-400 text-[8px] italic border-t border-slate-800 pt-1 mt-1">
                      No reliever assigned • Voice announcement suppressed
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
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
                      {isVerifiedReliever ? (
                        <div className="mt-0.5">
                          <div className={`text-xs font-bold font-mono ${hasReliever ? 'text-cyan-200 text-sm' : 'text-amber-300'}`}>
                            {t.reliever.name} <span className="font-normal text-[10px] opacity-75">({t.reliever.id})</span>
                          </div>
                          {t.reliever.takeoverTime && t.reliever.takeoverTime !== '--' && (
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
                        Previous TO: <span className="text-slate-400">{t.previousOperator.name}</span> ({t.previousOperator.id}) • Duty {t.previousOperator.dutyNo}
                      </div>
                    )}
                  </div>

                  {/* Card Footer: Proximity & Manual Re-announce Trigger */}
                  <div className="mt-3 pt-2 border-t border-slate-800/60 flex justify-between items-center text-[10px]">
                    <span className="text-slate-400 font-mono">
                      Pos: <strong className="text-slate-300">{t.currentStation}</strong>
                      {isDeparted ? ' (Departed)' : ` (${t.distToStation} KM away)`}
                    </span>
                    {hasReliever && !isDeparted && (
                      <button
                        onClick={() => triggerBilingualAnnouncement(
                          t.trainId, 
                          t.direction, 
                          t.reliever.name, 
                          t.operatorName, 
                          t.scheduledHandoverStation || t.stationCode,
                          t.reliever.dutyNo,
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

      {/* Active Trains Position details list grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {liveTrainPositions.length === 0 ? (
          <div className="col-span-3 py-10 bg-slate-950 border border-slate-850 rounded-xl text-center text-slate-500 italic font-bold">
            No scheduled train matrix movements detected at {simulatedTime}.
          </div>
        ) : (
          liveTrainPositions.map((t) => (
            <div key={t.trainId} className="bg-slate-950 border border-slate-850 rounded-xl p-4 flex flex-col justify-between hover:border-cyan-500/30 transition shadow-md group">
              <div className="flex justify-between items-center border-b border-slate-850 pb-2 mb-3">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded bg-cyan-500 animate-ping"></span>
                  <span className="font-black text-slate-100 text-xs tracking-wider font-mono">TRAIN ID: {t.trainId}</span>
                </div>
                <span className="px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 text-[9px] font-black uppercase tracking-wider">
                  {t.direction} Direction
                </span>
              </div>

              <div className="space-y-1.5 text-[10px] text-slate-400 font-sans">
                <div className="flex justify-between font-mono">
                  <span>Current Train Operator:</span>
                  <strong className="text-emerald-400">{t.operatorName} ({t.operatorId})</strong>
                </div>
                <div className="flex justify-between font-mono">
                  <span>Current Position:</span>
                  <strong className="text-slate-200">{t.currentStation}</strong>
                </div>
                <div className="flex justify-between font-mono">
                  <span>Active Chainage:</span>
                  <strong className="text-cyan-400 font-bold">{t.chainage.toFixed(3)}</strong>
                </div>
                {t.reliever && (
                  <div className="flex justify-between font-mono text-amber-300 bg-amber-950/20 p-1.5 rounded border border-amber-500/30">
                    <span>PYID Reliever:</span>
                    <strong>{t.reliever.name}</strong>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-slate-850/60 font-mono">
                  <div className="bg-slate-900 p-2 rounded border border-slate-800 text-center">
                    <div className="text-[8px] text-slate-500 uppercase tracking-widest">Travelled</div>
                    <strong className="text-slate-200 text-[11px]">{t.distanceTravelled} KM</strong>
                  </div>
                  <div className="bg-slate-900 p-2 rounded border border-slate-800 text-center">
                    <div className="text-[8px] text-slate-500 uppercase tracking-widest">Remaining</div>
                    <strong className="text-slate-200 text-[11px]">{t.distanceRemaining} KM</strong>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Selected Train Dialog Box */}
      {selectedTrain && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-6 w-full max-w-md shadow-2xl animate-scale-up font-mono">
            <div className="flex justify-between items-start border-b border-slate-800 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <Train className="text-cyan-400 h-5 w-5" />
                <h3 className="text-base font-black text-slate-100 uppercase">TRAIN MODULE: T{selectedTrain.trainId}</h3>
              </div>
              <button 
                onClick={() => setSelectedTrain(null)} 
                className="text-slate-500 hover:text-slate-350 text-sm font-bold bg-slate-900 border border-slate-800 hover:border-slate-700 px-2 py-1 rounded"
              >
                CLOSE
              </button>
            </div>

            <div className="space-y-3.5 text-xs text-slate-400">
              <div className="bg-slate-900/60 border border-slate-800 p-3 rounded-lg flex items-center justify-between">
                <div>
                  <span className="text-[9px] uppercase text-slate-500 block font-mono">Current Active Train Operator</span>
                  <strong className="text-emerald-400 text-sm font-mono">{selectedTrain.operatorName}</strong>
                  <span className="text-xs text-slate-400 font-mono"> ({selectedTrain.operatorId})</span>
                  {selectedTrain.dutyNo && selectedTrain.dutyNo !== '--' && (
                    <span className="ml-2 text-[9px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 font-mono">
                      Duty {selectedTrain.dutyNo}
                    </span>
                  )}
                  {selectedTrain.isExchanged && (
                    <div className="text-[8px] text-yellow-400 font-bold mt-0.5">
                      🔄 Exchanged Duty (Original: {selectedTrain.originalEmpName})
                    </div>
                  )}
                </div>
                <User className="h-5 w-5 text-emerald-400" />
              </div>

              {selectedTrain.reliever && (
                <div className={`p-3 rounded-lg flex items-center justify-between border ${
                  selectedTrain.hasReliever 
                    ? 'bg-amber-950/30 border-amber-500/40 text-amber-200' 
                    : 'bg-slate-900/60 border-slate-800 text-slate-400'
                }`}>
                  <div>
                    <span className="text-[9px] uppercase text-amber-400 block font-bold font-mono">Assigned Reliever Operator</span>
                    <strong className="text-amber-300 text-sm font-mono">{selectedTrain.reliever.name}</strong>
                    <span className="text-xs text-amber-300/70 font-mono"> ({selectedTrain.reliever.id})</span>
                    {selectedTrain.reliever.dutyNo && selectedTrain.reliever.dutyNo !== '--' && (
                      <span className="ml-2 text-[9px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20 font-mono">
                        Duty {selectedTrain.reliever.dutyNo}
                      </span>
                    )}
                    {selectedTrain.reliever.takeoverTime && selectedTrain.reliever.takeoverTime !== '--' && (
                      <div className="text-[9px] text-amber-400/80 font-mono mt-0.5">
                        Scheduled Handover: <strong className="text-white">{selectedTrain.reliever.takeoverTime}</strong>
                        {!selectedTrain.hasReliever && <span className="text-slate-500 ml-1">(Handover not active now)</span>}
                      </div>
                    )}
                  </div>
                  {selectedTrain.hasReliever && (
                    <button
                      onClick={() => triggerBilingualAnnouncement(
                        selectedTrain.trainId, 
                        selectedTrain.direction, 
                        selectedTrain.reliever.name, 
                        selectedTrain.operatorName, 
                        selectedTrain.currentStation?.includes('KGWA') ? 'KGWA' : selectedTrain.currentStation?.includes('PUTH') ? 'PUTH' : 'PYID',
                        selectedTrain.reliever.dutyNo,
                        selectedTrain.dutyNo
                      )}
                      className="p-2 rounded-lg bg-amber-500/20 hover:bg-amber-500/40 text-amber-300 border border-amber-500/30 transition"
                      title="Trigger Handover Voice Announcement"
                    >
                      <Megaphone className="h-4 w-4 text-amber-400 animate-pulse" />
                    </button>
                  )}
                </div>
              )}

              {selectedTrain.previousOperator && (
                <div className="bg-slate-900/40 border border-slate-850 p-2.5 rounded-lg text-[10px] text-slate-400 font-mono">
                  <span className="text-[8px] uppercase text-slate-500 block">Previously Relieved Operator</span>
                  <span className="text-slate-300 font-bold">{selectedTrain.previousOperator.name}</span> ({selectedTrain.previousOperator.id}) • Duty {selectedTrain.previousOperator.dutyNo}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3.5">
                <div className="bg-slate-900/40 p-2.5 border border-slate-850 rounded">
                  <span className="text-[9px] uppercase text-slate-500 block font-mono">Active Chainage</span>
                  <strong className="text-cyan-400 font-mono text-sm">{selectedTrain.chainage} KM</strong>
                </div>
                <div className="bg-slate-900/40 p-2.5 border border-slate-850 rounded">
                  <span className="text-[9px] uppercase text-slate-500 block font-mono">Directional Run</span>
                  <strong className="text-slate-200 uppercase text-sm font-mono">{selectedTrain.direction}</strong>
                </div>
              </div>

              <div className="bg-slate-900/40 p-3 border border-slate-850 rounded space-y-1.5 font-mono">
                <div className="flex justify-between">
                  <span>Current Leg Segment:</span>
                  <strong className="text-slate-200">{selectedTrain.currentStation}</strong>
                </div>
                <div className="flex justify-between">
                  <span>Previous Station:</span>
                  <strong className="text-slate-300">{selectedTrain.previousStation}</strong>
                </div>
                <div className="flex justify-between">
                  <span>Next Target Station:</span>
                  <strong className="text-slate-300">{selectedTrain.nextStation}</strong>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-900/60 border border-slate-800 p-3 rounded text-center">
                  <span className="text-[8px] text-slate-500 uppercase tracking-wider block">Odometer Travelled</span>
                  <strong className="text-emerald-400 text-base font-black">{selectedTrain.distanceTravelled} KM</strong>
                </div>
                <div className="bg-slate-900/60 border border-slate-800 p-3 rounded text-center">
                  <span className="text-[8px] text-slate-500 uppercase tracking-wider block">Distance Remaining</span>
                  <strong className="text-cyan-400 text-base font-black">{selectedTrain.distanceRemaining} KM</strong>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
