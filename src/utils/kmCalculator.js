/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { MASTER_STATIONS } from '../data/kmcalc/masterStations';

/**
 * Calculates absolute distance between two stations based on chainage values.
 * Returns exact distance in KM.
 */
export function calculateDistance(fromStationCode, toStationCode) {
  const normalize = (code) => {
    let c = String(code || '').trim().toUpperCase().replace(/[\s_]/g, '');
    
    // Normalize Depot Handover (DHO) and Depot terms to 'DEPOT'
    if (
      c.includes('DEPOT') || 
      c.includes('DEPO') || 
      c.includes('DPO') || 
      c.includes('DHO') || 
      c === 'BDHO' || 
      c === 'PDHO'
    ) {
      return 'DEPOT';
    }
    
    // Normalize pocket tracks and buffer ends
    if (c === 'BIETBE' || c === 'BIETBUFFEREND') return 'BIET_BE';
    if (c === 'NGSABE' || c === 'NGSABUFFEREND') return 'NGSA_BE';
    if (c === 'NGSAPT' || c === 'NGSAPKT' || c === 'NPKT' || c.includes('NPKT') || c === 'NGSAPOCKET') return 'NGSA_PT';
    if (c === 'NLCPT' || c === 'NLCPKT' || c === 'NLCPOCKET') return 'NLC_PT';
    if (c === 'MHLIPT' || c === 'MHLIPKT' || c === 'MHLIPOCKET') return 'MHLI_PT';
    if (c === 'PUTHBE' || c === 'PUTHBUFFEREND') return 'PUTH_BE';
    if (c === 'APTSBE' || c === 'APTSBUFFEREND') return 'APTS_BE';
    
    // Normalize Road 3 (Rd-3/Rd3) at Peenya Industry to 'PYID'
    if (c === 'RD3' || c === 'RD-3' || c === 'RD3INDUCT' || c === 'RD3STBY') {
      return 'PYID';
    }
    
    if (c === 'JIDL') return 'JDHL';
    
    return String(code || '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
  };

  const normFrom = normalize(fromStationCode);
  const normTo = normalize(toStationCode);

  const fromStn = MASTER_STATIONS.find(s => s.code.toUpperCase() === normFrom);
  const toStn = MASTER_STATIONS.find(s => s.code.toUpperCase() === normTo);

  if (!fromStn || !toStn) {
    return 0;
  }

  return Math.abs(toStn.chainage - fromStn.chainage);
}

/**
 * Calculates cumulative distance for a sequence of station codes.
 * e.g. ["PYID", "BIET_BE", "APTS_BE", "PYID"]
 */
export function calculateSequenceDistance(stationCodes) {
  const segments = [];
  let totalExact = 0;

  for (let i = 0; i < stationCodes.length - 1; i++) {
    const fromCode = stationCodes[i];
    const toCode = stationCodes[i + 1];
    const dist = calculateDistance(fromCode, toCode);
    
    if (dist > 0) {
      segments.push({
        fromStationCode: fromCode,
        toStationCode: toCode,
        calculatedKms: parseFloat(dist.toFixed(3))
      });
      totalExact += dist;
    }
  }

  return {
    segments,
    totalExact: parseFloat(totalExact.toFixed(3)),
    totalRounded: Math.round(totalExact)
  };
}

/**
 * Parses time-string "HH:MM:SS" or "HH:MM" to seconds.
 */
export function timeStringToSeconds(timeStr) {
  if (!timeStr) return 0;
  const parts = timeStr.split(':').map(Number);
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  } else if (parts.length === 2) {
    return parts[0] * 3600 + parts[1] * 60;
  }
  return 0;
}

/**
 * Converts seconds back to "HH:MM:SS" format.
 */
export function secondsToTimeString(totalSeconds) {
  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;

  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
}

/**
 * Parses raw CSV lines to Duty array.
 * Maps headers like: Duty No, S ON Time, Sign ON Location, Train No, Time Frm, Time To, etc.
 */
export function parseCSVToDuties(csvText) {
  if (!csvText) return [];

  // Split lines, handle carriage returns
  const lines = csvText.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (lines.length < 2) return [];

  // Parse headers
  const headers = lines[0].split(',').map(h => h.trim().replace(/^["']|["']$/g, ''));
  const parsedDuties = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    // Simple CSV split (handles basic quotes)
    const values = line.split(',').map(v => v.trim().replace(/^["']|["']$/g, ''));
    if (values.length < 3) continue;

    // Helper to get value by header name search (case-insensitive, flexible spacing)
    const getVal = (possibleHeaders) => {
      for (const ph of possibleHeaders) {
        const index = headers.findIndex(h => h.toLowerCase().includes(ph.toLowerCase()) || ph.toLowerCase().includes(h.toLowerCase()));
        if (index !== -1 && values[index]) {
          return values[index];
        }
      }
      return '';
    };

    const dutyNo = getVal(['duty no', 'duty_no', 'duty#', 'duty']);
    if (!dutyNo) continue;

    const sOnTime = getVal(['s on time', 'sign on time', 'on_time', 'start time']);
    const signOnLocation = getVal(['sign on location', 'on_location', 'location', 'sign_on']);
    const sOffTime = getVal(['s off time', 'sign off time', 'off_time', 'end time']);
    const signOffLocation = getVal(['sign off location', 'off_location', 'sign_off']);
    const kmsStr = getVal(['kms', 'distance', 'km', 'kilometer']);
    const kms = parseFloat(kmsStr) || 0;
    const dutyHrs = getVal(['duty hrs', 'duty_hours', 'hours']);
    const drivingHrs = getVal(['driving hrs', 'driving_hours', 'driving']);
    const breakTime = getVal(['break', 'rest', 'break_time']);
    const counselling = getVal(['counselling', 'couns']);
    const dutyType = getVal(['duty type', 'type']);

    // Build sub trips
    const trips = [];
    const train1 = getVal(['train no', 'train_no', 'train1']);
    const timeFrm1 = getVal(['time frm', 'time_frm', 'frm1']);
    const timeTo1 = getVal(['time to', 'time_to', 'to1']);
    const tripTime1 = getVal(['trip time', 'trip_time', 't1']);
    const takeover1 = getVal(['takeover location', 'takeover_location', 'takeover1']);
    const handover1 = getVal(['handover location', 'handover_location', 'handover1']);

    if (train1 || timeFrm1) {
      trips.push({
        trainNo: train1 || 'Unknown',
        timeFrm: timeFrm1,
        timeTo: timeTo1,
        tripTime: tripTime1,
        takeoverLocation: takeover1,
        handoverLocation: handover1,
        breakTime: breakTime
      });
    }

    parsedDuties.push({
      dutyNo,
      sOnTime: sOnTime || '00:00:00',
      signOnLocation: signOnLocation || 'Unknown',
      sOffTime: sOffTime || '00:00:00',
      signOffLocation: signOffLocation || 'Unknown',
      kms: kms,
      dutyHrs: dutyHrs || '00:00:00',
      drivingHrs: drivingHrs || '00:00:00',
      breakTime: breakTime || '00:00:00',
      counselling: counselling || '',
      dutyType: dutyType || 'Standard',
      trips,
      isNightShift: parseFloat(sOnTime) > 18 || sOnTime.includes('PM') || sOnTime.startsWith('21:') || sOnTime.startsWith('22:')
    });
  }

  return parsedDuties;
}

// Predefined WTT standard station loop sequences for each Monday Link Roster duty
export const DUTY_TRIP_PATTERNS = {
  "3": [
    ["KGWA", "PUTH_BE", "PYID"],
    ["PYID", "BIET_BE", "APTS_BE", "PYID"],
    ["PYID", "BIET_BE", "APTS_BE", "PYID"]
  ],
  "4": [
    ["DEPOT", "BIET_BE", "PYID"],
    ["PYID", "BIET_BE", "PUTH_BE", "DEPOT"],
    ["PYID", "NGSA_BE", "PYID"]
  ],
  "5": [
    ["PYID", "BIET_BE", "PYID"],
    ["PYID", "BIET_BE", "PUTH_BE", "PYID"],
    ["PYID", "BIET_BE", "APTS_BE", "PYID"]
  ],
  "6": [
    ["PYID", "BIET_BE", "PYID"],
    ["PYID", "BIET_BE", "PUTH_BE", "PYID"],
    ["PYID", "BIET_BE", "PYID"],
    ["PYID", "NGSA_BE", "PYID"]
  ],
  "7": [
    ["DEPOT", "BIET_BE", "APTS_BE", "PYID"],
    ["PYID", "BIET_BE", "PUTH_BE", "PYID"],
    ["PYID", "BIET_BE", "PUTH_BE", "PYID"]
  ],
  "8": [
    ["KGWA", "PUTH_BE", "PYID"],
    ["PYID", "BIET_BE", "APTS_BE", "PYID"],
    ["PYID", "NGSA_BE", "DEPOT"]
  ],
  "9": [
    ["PYID", "BIET_BE", "APTS_BE", "PYID"],
    ["PYID", "BIET_BE", "APTS_BE", "PYID"],
    ["PYID", "BIET_BE", "APTS_BE", "PYID"]
  ],
  "10": [
    ["DEPOT", "BIET_BE", "PUTH_BE", "PYID"],
    ["PYID", "BIET_BE", "PUTH_BE", "PYID"],
    ["PYID", "BIET_BE", "PUTH_BE", "PYID"]
  ],
  "11": [
    ["KGWA", "BIET_BE", "APTS_BE", "PYID"],
    ["PYID", "BIET_BE", "PUTH_BE", "PYID"],
    ["PYID", "NGSA_BE", "PYID"]
  ],
  "12": [
    ["DEPOT", "BIET_BE", "PUTH_BE", "PYID"],
    ["PYID", "BIET_BE", "PUTH_BE", "DEPOT"],
    ["PYID", "NGSA_BE", "PYID"]
  ],
  "13": [
    ["PYID", "BIET_BE", "PUTH_BE", "PYID"],
    ["PYID", "BIET_BE", "PUTH_BE", "PYID"],
    ["PYID", "NGSA_BE", "PYID"],
    ["PYID", "NGSA_BE", "PYID"]
  ],
  "14": [
    ["PYID", "BIET_BE", "APTS_BE", "PYID"],
    ["PYID", "BIET_BE", "APTS_BE", "PYID"],
    ["PYID", "BIET_BE", "APTS_BE", "PYID"]
  ],
  "18": [
    ["DEPOT", "BIET_BE", "PUTH_BE", "PYID"],
    ["PYID", "BIET_BE", "PUTH_BE", "DEPOT"],
    [] // Counselling: 0 km
  ],
  "33": [
    ["PYID", "NGSA_BE", "PYID"],
    ["PYID", "BIET_BE", "PUTH_BE", "PYID"],
    ["PYID", "BIET_BE", "PUTH_BE", "PYID"],
    ["PYID", "BIET_BE", "DEPOT"]
  ],
  "35": [
    [], // Counselling
    ["PYID", "BIET_BE", "PUTH_BE", "PYID"],
    ["PYID", "BIET_BE", "PUTH_BE", "PYID"]
  ],
  "47": [
    ["PYID", "BIET_BE", "APTS_BE", "PYID"],
    ["PYID", "BIET_BE", "APTS_BE", "PYID"],
    ["PYID", "BIET_BE", "KGWA"]
  ],
  "64": [
    ["PUTH", "APTS_BE", "APTS"],
    ["APTS", "KGWA"]
  ],
  "65": [
    ["PYID", "NLC"],
    ["NLC", "PUTH"]
  ],
  "66": [
    ["KGWA", "PUTH"],
    ["PUTH", "PYID"]
  ],
  "67": [
    ["PUTH", "APTS_BE"],
    ["APTS_BE", "KGWA"]
  ],
  "77": [
    ["KGWA", "DEPOT"],
    [] // Shunter/PDC loop: 0 km
  ]
};

/**
 * Enhances roster duties by dynamically calculating exact kilometers for each trip
 * based on WTT segments and Link Roster details, excluding counselling trips.
 */
export function enhanceRosterDuties(duties) {
  if (!duties) return [];
  
  return duties.map(duty => {
    let totalKms = 0;
    
    const isSpecialType = (type) => {
      const t = String(type || '').toLowerCase();
      return t.includes('sby') || t.includes('standby') || t.includes('pro');
    };
    
    // If the duty is standby or pro with no explicit active train trips, set to 0
    if (isSpecialType(duty.dutyType) && (!duty.trips || duty.trips.length === 0 || duty.trips.every(t => String(t.trainNo || '').toLowerCase().includes('stby') || String(t.trainNo || '').toLowerCase().includes('pro')))) {
      return {
        ...duty,
        kms: 0
      };
    }

    const updatedTrips = (duty.trips || []).map((trip, idx) => {
      const trainNoClean = String(trip.trainNo || '').toLowerCase();
      
      // Exclude counselling trips
      const isCounselling = 
        trainNoClean.includes('couns') || 
        trainNoClean.includes('counseling') ||
        trip.counsellingTime;
        
      if (isCounselling) {
        return {
          ...trip,
          calculatedKms: 0,
          segments: []
        };
      }
      
      const takeNorm = String(trip.takeoverLocation || '').toUpperCase();
      const handNorm = String(trip.handoverLocation || '').toUpperCase();
      if (takeNorm === 'DEPOT' && handNorm === 'DEPOT') {
        return {
          ...trip,
          calculatedKms: 0,
          segments: []
        };
      }
      
      let routeStopCodes = null;
      const patterns = DUTY_TRIP_PATTERNS[duty.dutyNo];
      if (patterns && patterns[idx]) {
        routeStopCodes = patterns[idx];
      } else if (trip.segments && trip.segments.length > 0) {
        routeStopCodes = [trip.segments[0].fromStationCode, ...trip.segments.map(s => s.toStationCode)];
      } else {
        routeStopCodes = [trip.takeoverLocation, trip.handoverLocation].filter(Boolean);
      }
      
      if (routeStopCodes && routeStopCodes.length >= 2) {
        const result = calculateSequenceDistance(routeStopCodes);
        totalKms += result.totalRounded;
        return {
          ...trip,
          calculatedKms: result.totalRounded,
          segments: result.segments
        };
      }
      
      return {
        ...trip,
        calculatedKms: 0,
        segments: []
      };
    });
    
    return {
      ...duty,
      kms: totalKms,
      trips: updatedTrips
    };
  });
}
