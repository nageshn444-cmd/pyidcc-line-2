/**
 * changeoverService.js
 * ─────────────────────────────────────────────────────────────────
 * Night Changeover engine driven by the official Excel file:
 *   "Night Changeover.xlsx" (C:\Users\nages\OneDrive\Desktop\...)
 *
 * The Excel defines EXACTLY which night duties link to which
 * morning-takeover duties for every currentDay→nextDay combination.
 *
 * Column layout in the Excel (per row):
 *  [0]  Duty No
 *  [1]  Sign ON time        (night)
 *  [2]  Sign ON Location    (night)
 *  [3]  Train No            (night)
 *  [4]  Time From           (night leg)
 *  [5]  Time To             (night leg hand-over)
 *  [6]  Trip time           (night leg)
 *  [7]  Handover Location   (night)
 *  [8]  Break               (between night & morning)
 *  [9]  Night Kms
 *  [12] Morn Kms
 *  [13] Takeover Location   (morning)
 *  [14] Train No            (morning)
 *  [15] Time From           (morning leg)
 *  [16] Time To             (morning leg / sign-off)
 *  [17] Trip time           (morning leg)
 *  [18] Handover/Sign-Off Location (morning)
 *  [19] Sign OFF time
 *  [20] Sign Off Location
 *  [21] Total Kms
 *  [22] Duty Hrs
 *  [23] Driving Hrs
 *  [24] Break
 * ─────────────────────────────────────────────────────────────────
 */

import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { db } from "../firebase.js";
import { WTT_MASTER_REGISTRY } from "../data/wttMasterRegistry.js";
import { calculateDistance, normalizeStationCode } from "../utils/kmCalculator.js";


// ─── Time helpers ────────────────────────────────────────────────
const toSec = (tStr) => {
  if (!tStr || tStr === "--" || tStr === "-" || tStr === "") return -1;
  const parts = String(tStr).split(":").map(Number);
  if (parts.some(isNaN)) return -1;
  return parts[0] * 3600 + parts[1] * 60 + (parts[2] || 0);
};

const toTimeStr = (sec) => {
  if (sec < 0) return "--";
  const hrs = Math.floor(sec / 3600);
  const mins = Math.floor((sec % 3600) / 60);
  const secs = sec % 60;
  return [hrs, mins, secs].map((v) => String(v).padStart(2, "0")).join(":");
};

const getLegDuration = (dep, arr) => {
  const d = toSec(dep),
    a = toSec(arr);
  if (d < 0 || a < 0) return 0;
  let diff = a - d;
  if (diff < 0) diff += 86400;
  return diff;
};

// ─── Changeover table (parsed from Night Changeover.xlsx) ────────
//
//  Key format:  "CURRENT_TYPE__NEXT_TYPE"
//  Each entry:  duty number (zero-padded 2-digit string) → row data
//
// The object below is the authoritative source of truth.
// It exactly mirrors the Excel file.
//
// Structure per duty entry:
// {
//   signOnTime, signOnLocation,
//   nightTrainNo, nightDepTime, nightArrTime, nightTripTime,
//   nightHandoverLoc, nightBreak, nightKms,
//   mornKms, takeoverLocation, mornTrainNo,
//   mornDepTime, mornArrTime, mornTripTime, mornHandoverLoc,
//   signOffTime, signOffLocation,
//   totalKms, dutyHrs, drivingHrs, breakTime
// }

export const CHANGEOVER_TABLE = {
  // ══════════════════════════════════════════════════════════════
  // WEEKDAY Night  ➔  SATURDAY Morning
  // ══════════════════════════════════════════════════════════════
  WEEKDAY__SATURDAY: {
    64: {
      dutyNo: "64",
      signOnTime: "21:15:00",
      signOnLocation: "PUTH Dn",
      nightTrainNo: "204",
      nightDepTime: "21:32:00",
      nightArrTime: "00:15:00",
      nightTripTime: "02:43:00",
      nightHandoverLoc: "APTS Dn",
      nightBreak: "04:25:00",
      nightKms: 75,
      mornKms: 41,
      takeoverLocation: "APTS DN",
      mornTrainNo: "210",
      mornDepTime: "04:40:00",
      mornArrTime: "06:49:00",
      mornTripTime: "02:09:00",
      mornHandoverLoc: "PYID DN",
      signOffTime: "06:55:00",
      signOffLocation: "PYID",
      totalKms: 116,
      dutyHrs: "09:40:00",
      drivingHrs: "04:52:00",
      breakTime: "04:25:00",
    },
    65: {
      dutyNo: "65",
      signOnTime: "21:30:00",
      signOnLocation: "PYID Up",
      nightTrainNo: "213",
      nightDepTime: "21:46:12",
      nightArrTime: "23:55:00",
      nightTripTime: "02:08:48",
      nightHandoverLoc: "NLC Up",
      nightBreak: "04:25:00",
      nightKms: 55,
      mornKms: 38,
      takeoverLocation: "NLC UP PF",
      mornTrainNo: "207",
      mornDepTime: "04:20:00",
      mornArrTime: "06:30:00",
      mornTripTime: "02:10:00",
      mornHandoverLoc: "KGWA DN",
      signOffTime: "06:35:00",
      signOffLocation: "KGWA",
      totalKms: 93,
      dutyHrs: "09:05:00",
      drivingHrs: "04:18:48",
      breakTime: "04:25:00",
    },
    66: {
      dutyNo: "66",
      signOnTime: "21:30:00",
      signOnLocation: "KGWA Up",
      nightTrainNo: "201",
      nightDepTime: "21:48:00",
      nightArrTime: "00:10:00",
      nightTripTime: "02:22:00",
      nightHandoverLoc: "PUTH Dn",
      nightBreak: "04:20:00",
      nightKms: 58,
      mornKms: 35,
      takeoverLocation: "PUTH DN",
      mornTrainNo: "211",
      mornDepTime: "04:30:00",
      mornArrTime: "06:18:12",
      mornTripTime: "01:48:12",
      mornHandoverLoc: "PYID Up",
      signOffTime: "06:25:00",
      signOffLocation: "PYID",
      totalKms: 93,
      dutyHrs: "08:55:00",
      drivingHrs: "04:10:12",
      breakTime: "04:20:00",
    },
    67: {
      dutyNo: "67",
      signOnTime: "21:30:00",
      signOnLocation: "PUTH Up",
      nightTrainNo: "212",
      nightDepTime: "21:48:00",
      nightArrTime: "00:15:00",
      nightTripTime: "02:27:00",
      nightHandoverLoc: "APTS Up",
      nightBreak: "04:15:00",
      nightKms: 62,
      mornKms: 40,
      takeoverLocation: "APTS UP",
      mornTrainNo: "209",
      mornDepTime: "04:30:00",
      mornArrTime: "06:38:00",
      mornTripTime: "02:08:00",
      mornHandoverLoc: "PYID DN",
      signOffTime: "06:45:00",
      signOffLocation: "PYID",
      totalKms: 102,
      dutyHrs: "09:15:00",
      drivingHrs: "04:35:00",
      breakTime: "04:15:00",
    },
    68: {
      dutyNo: "68",
      signOnTime: "21:30:00",
      signOnLocation: "KGWA Up",
      nightTrainNo: "220",
      nightDepTime: "21:42:00",
      nightArrTime: "23:50:00",
      nightTripTime: "02:08:00",
      nightHandoverLoc: "PUTH Up",
      nightBreak: "04:25:00",
      nightKms: 58,
      mornKms: 34,
      takeoverLocation: "PUTH UP",
      mornTrainNo: "208",
      mornDepTime: "04:15:00",
      mornArrTime: "06:27:00",
      mornTripTime: "02:12:00",
      mornHandoverLoc: "PYID DN",
      signOffTime: "06:30:00",
      signOffLocation: "PYID",
      totalKms: 92,
      dutyHrs: "09:00:00",
      drivingHrs: "04:20:00",
      breakTime: "04:25:00",
    },
    69: {
      dutyNo: "69",
      signOnTime: "21:05:00",
      signOnLocation: "KGWA Dn",
      nightTrainNo: "221",
      nightDepTime: "21:22:00",
      nightArrTime: "23:10:00",
      nightTripTime: "01:48:00",
      nightHandoverLoc: "BIET DnBE",
      nightBreak: "07:20:00",
      nightKms: 51,
      mornKms: 7,
      takeoverLocation: "BIET DnBE",
      mornTrainNo: "217",
      mornDepTime: "06:30:00",
      mornArrTime: "07:27:00",
      mornTripTime: "00:57:00",
      mornHandoverLoc: "PYID Dn",
      signOffTime: "07:30:00",
      signOffLocation: "PYID",
      totalKms: 58,
      dutyHrs: "10:25:00",
      drivingHrs: "02:45:00",
      breakTime: "07:20:00",
    },
    70: {
      dutyNo: "70",
      signOnTime: "21:15:00",
      signOnLocation: "KGWA Dn",
      nightTrainNo: "205",
      nightDepTime: "21:30:00",
      nightArrTime: "00:10:00",
      nightTripTime: "02:40:00",
      nightHandoverLoc: "B DHO",
      nightBreak: "00:30:00",
      nightKms: 61,
      mornKms: 0,
      takeoverLocation: "Depot/CC",
      mornTrainNo: "Ntest",
      mornDepTime: "00:40:00",
      mornArrTime: "06:00:00",
      mornTripTime: "05:20:00",
      mornHandoverLoc: "Depot",
      signOffTime: "06:05:00",
      signOffLocation: "Depot",
      totalKms: 61,
      dutyHrs: "08:50:00",
      drivingHrs: "02:40:00",
      breakTime: "00:30:00",
    },
    71: {
      dutyNo: "71",
      signOnTime: "21:20:00",
      signOnLocation: "PYID Dn",
      nightTrainNo: "207",
      nightDepTime: "21:34:00",
      nightArrTime: "23:55:00",
      nightTripTime: "02:21:00",
      nightHandoverLoc: "NGSA DnPf",
      nightBreak: "04:05:00",
      nightKms: 64,
      mornKms: 59,
      takeoverLocation: "NGSA DN PF",
      mornTrainNo: "202",
      mornDepTime: "04:00:00",
      mornArrTime: "06:48:12",
      mornTripTime: "02:48:12",
      mornHandoverLoc: "PYID Up",
      signOffTime: "06:50:00",
      signOffLocation: "PYID",
      totalKms: 123,
      dutyHrs: "09:30:00",
      drivingHrs: "05:09:12",
      breakTime: "04:05:00",
    },
    72: {
      dutyNo: "72",
      signOnTime: "21:20:00",
      signOnLocation: "PYID Up",
      nightTrainNo: "211",
      nightDepTime: "21:37:12",
      nightArrTime: "00:20:00",
      nightTripTime: "02:42:48",
      nightHandoverLoc: "BIET UpPf",
      nightBreak: "04:20:00",
      nightKms: 75,
      mornKms: 62,
      takeoverLocation: "BIET UP PF",
      mornTrainNo: "204",
      mornDepTime: "04:40:00",
      mornArrTime: "07:18:12",
      mornTripTime: "02:38:12",
      mornHandoverLoc: "PYID Up",
      signOffTime: "07:20:00",
      signOffLocation: "PYID",
      totalKms: 137,
      dutyHrs: "10:00:00",
      drivingHrs: "05:21:00",
      breakTime: "04:20:00",
    },
    73: {
      dutyNo: "73",
      signOnTime: "21:25:00",
      signOnLocation: "KGWA Dn",
      nightTrainNo: "210",
      nightDepTime: "21:42:00",
      nightArrTime: "00:15:00",
      nightTripTime: "02:33:00",
      nightHandoverLoc: "SPGD DnPf",
      nightBreak: "04:10:00",
      nightKms: 66,
      mornKms: 45,
      takeoverLocation: "SPGD DN PF",
      mornTrainNo: "201",
      mornDepTime: "04:25:00",
      mornArrTime: "06:33:12",
      mornTripTime: "02:08:12",
      mornHandoverLoc: "PYID Up",
      signOffTime: "06:40:00",
      signOffLocation: "PYID",
      totalKms: 111,
      dutyHrs: "09:15:00",
      drivingHrs: "04:41:12",
      breakTime: "04:10:00",
    },
    74: {
      dutyNo: "74",
      signOnTime: "21:30:00",
      signOnLocation: "PYID Dn",
      nightTrainNo: "215",
      nightDepTime: "21:44:00",
      nightArrTime: "00:15:00",
      nightTripTime: "02:31:00",
      nightHandoverLoc: "JIDL UpPf",
      nightBreak: "04:30:00",
      nightKms: 64,
      mornKms: 45,
      takeoverLocation: "JIDL UP",
      mornTrainNo: "205",
      mornDepTime: "04:45:00",
      mornArrTime: "06:55:00",
      mornTripTime: "02:10:00",
      mornHandoverLoc: "PUTH UP",
      signOffTime: "07:00:00",
      signOffLocation: "PUTH",
      totalKms: 109,
      dutyHrs: "09:30:00",
      drivingHrs: "04:41:00",
      breakTime: "04:30:00",
    },
    75: {
      dutyNo: "75",
      signOnTime: "21:40:00",
      signOnLocation: "PYID Dn",
      nightTrainNo: "217",
      nightDepTime: "21:54:00",
      nightArrTime: "00:05:00",
      nightTripTime: "02:11:00",
      nightHandoverLoc: "BIET DnPf",
      nightBreak: "04:25:00",
      nightKms: 62,
      mornKms: 62,
      takeoverLocation: "BIET DN PF",
      mornTrainNo: "203",
      mornDepTime: "04:30:00",
      mornArrTime: "07:03:00",
      mornTripTime: "02:33:00",
      mornHandoverLoc: "PYID Up",
      signOffTime: "07:05:00",
      signOffLocation: "PYID",
      totalKms: 124,
      dutyHrs: "09:25:00",
      drivingHrs: "04:44:00",
      breakTime: "04:25:00",
    },
    76: {
      dutyNo: "76",
      signOnTime: "21:40:00",
      signOnLocation: "PYID Up",
      nightTrainNo: "223",
      nightDepTime: "21:54:12",
      nightArrTime: "22:40:00",
      nightTripTime: "00:45:48",
      nightHandoverLoc: "NPKT/DEPOT",
      nightBreak: "05:50:00",
      nightKms: 10,
      mornKms: 26,
      takeoverLocation: "Depo-JHLI trn Bk",
      mornTrainNo: "206",
      mornDepTime: "04:30:00",
      mornArrTime: "06:15:00",
      mornTripTime: "01:45:00",
      mornHandoverLoc: "KGWA DN",
      signOffTime: "06:20:00",
      signOffLocation: "KGWA",
      totalKms: 36,
      dutyHrs: "08:40:00",
      drivingHrs: "02:30:48",
      breakTime: "05:50:00",
    },
    77: {
      dutyNo: "77",
      signOnTime: "21:40:00",
      signOnLocation: "KGWA Up",
      nightTrainNo: "202",
      nightDepTime: "21:56:00",
      nightArrTime: "23:30:00",
      nightTripTime: "01:34:00",
      nightHandoverLoc: "B DHO",
      nightBreak: "06:00:00",
      nightKms: 15,
      mornKms: 0,
      takeoverLocation: "PDC 214; 215; 216",
      mornTrainNo: "--",
      mornDepTime: "05:30:00",
      mornArrTime: "07:00:00",
      mornTripTime: "01:30:00",
      mornHandoverLoc: "PYID Up",
      signOffTime: "07:05:00",
      signOffLocation: "PYID",
      totalKms: 15,
      dutyHrs: "09:25:00",
      drivingHrs: "03:04:00",
      breakTime: "06:00:00",
    },
  },
  // ══════════════════════════════════════════════════════════════
  // SATURDAY Night  ➔  SUNDAY Morning
  // ══════════════════════════════════════════════════════════════
  SATURDAY__SUNDAY: {
    59: {
      dutyNo: "59",
      signOnTime: "21:15:00",
      signOnLocation: "PUTH DN",
      nightTrainNo: "208",
      nightDepTime: "21:32:00",
      nightArrTime: "00:15:00",
      nightTripTime: "02:43:00",
      nightHandoverLoc: "APTS DN",
      nightBreak: "06:00:00",
      nightKms: 75,
      mornKms: 28,
      takeoverLocation: "APTS Dn",
      mornTrainNo: "204",
      mornDepTime: "06:15:00",
      mornArrTime: "07:48:12",
      mornTripTime: "01:33:12",
      mornHandoverLoc: "PYID Up",
      signOffTime: "07:55:00",
      signOffLocation: "PYID",
      totalKms: 103,
      dutyHrs: "10:40:00",
      drivingHrs: "04:16:12",
      breakTime: "06:00:00",
    },
    60: {
      dutyNo: "60",
      signOnTime: "21:25:00",
      signOnLocation: "KGWA UP",
      nightTrainNo: "218",
      nightDepTime: "21:42:00",
      nightArrTime: "23:50:00",
      nightTripTime: "02:08:00",
      nightHandoverLoc: "PUTH UP",
      nightBreak: "05:55:00",
      nightKms: 58,
      mornKms: 21,
      takeoverLocation: "PUTH Up",
      mornTrainNo: "203",
      mornDepTime: "05:45:00",
      mornArrTime: "07:38:12",
      mornTripTime: "01:53:12",
      mornHandoverLoc: "PYID Up",
      signOffTime: "07:45:00",
      signOffLocation: "PYID",
      totalKms: 79,
      dutyHrs: "10:20:00",
      drivingHrs: "04:01:12",
      breakTime: "05:55:00",
    },
    61: {
      dutyNo: "61",
      signOnTime: "21:30:00",
      signOnLocation: "PYID",
      nightTrainNo: "209",
      nightDepTime: "21:45:12",
      nightArrTime: "23:45:00",
      nightTripTime: "01:59:48",
      nightHandoverLoc: "NLC UP",
      nightBreak: "06:45:00",
      nightKms: 54,
      mornKms: 19,
      takeoverLocation: "TGTP Dn",
      mornTrainNo: "205",
      mornDepTime: "06:30:00",
      mornArrTime: "07:43:00",
      mornTripTime: "01:13:00",
      mornHandoverLoc: "KGWA Up",
      signOffTime: "07:50:00",
      signOffLocation: "KGWA",
      totalKms: 73,
      dutyHrs: "10:20:00",
      drivingHrs: "03:12:48",
      breakTime: "06:45:00",
    },
    62: {
      dutyNo: "62",
      signOnTime: "21:15:00",
      signOnLocation: "PUTH UP",
      nightTrainNo: "220",
      nightDepTime: "21:30:00",
      nightArrTime: "00:10:00",
      nightTripTime: "02:40:00",
      nightHandoverLoc: "PUTH DN",
      nightBreak: "06:20:00",
      nightKms: 69,
      mornKms: 13,
      takeoverLocation: "PUTH Dn",
      mornTrainNo: "206",
      mornDepTime: "06:30:00",
      mornArrTime: "07:40:00",
      mornTripTime: "01:10:00",
      mornHandoverLoc: "PUTH Up",
      signOffTime: "07:45:00",
      signOffLocation: "PUTH",
      totalKms: 82,
      dutyHrs: "10:30:00",
      drivingHrs: "03:50:00",
      breakTime: "06:20:00",
    },
    63: {
      dutyNo: "63",
      signOnTime: "21:35:00",
      signOnLocation: "PUTH UP",
      nightTrainNo: "203",
      nightDepTime: "21:50:00",
      nightArrTime: "00:15:00",
      nightTripTime: "02:25:00",
      nightHandoverLoc: "APTS UP",
      nightBreak: "05:30:00",
      nightKms: 62,
      mornKms: 28,
      takeoverLocation: "APTS Up",
      mornTrainNo: "202",
      mornDepTime: "05:45:00",
      mornArrTime: "07:28:00",
      mornTripTime: "01:43:00",
      mornHandoverLoc: "PYID Up",
      signOffTime: "07:35:00",
      signOffLocation: "PYID",
      totalKms: 90,
      dutyHrs: "10:00:00",
      drivingHrs: "04:08:00",
      breakTime: "05:30:00",
    },
    64: {
      dutyNo: "64",
      signOnTime: "21:05:00",
      signOnLocation: "KGWA DN",
      nightTrainNo: "221",
      nightDepTime: "21:22:00",
      nightArrTime: "23:15:00",
      nightTripTime: "01:53:00",
      nightHandoverLoc: "BT DN B/E",
      nightBreak: "00:30:00",
      nightKms: 51,
      mornKms: 0,
      takeoverLocation: "--",
      mornTrainNo: "Ntest",
      mornDepTime: "23:45:00",
      mornArrTime: "06:00:00",
      mornTripTime: "06:15:00",
      mornHandoverLoc: "Depot",
      signOffTime: "06:05:00",
      signOffLocation: "Depot",
      totalKms: 51,
      dutyHrs: "09:00:00",
      drivingHrs: "01:53:00",
      breakTime: "00:30:00",
    },
    65: {
      dutyNo: "65",
      signOnTime: "21:15:00",
      signOnLocation: "KGWA DN",
      nightTrainNo: "210",
      nightDepTime: "21:32:00",
      nightArrTime: "00:00:00",
      nightTripTime: "02:28:00",
      nightHandoverLoc: "B DHO",
      nightBreak: "06:15:00",
      nightKms: 59,
      mornKms: 16,
      takeoverLocation: "Depot",
      mornTrainNo: "212",
      mornDepTime: "06:15:00",
      mornArrTime: "07:49:00",
      mornTripTime: "01:34:00",
      mornHandoverLoc: "PYID DN",
      signOffTime: "07:55:00",
      signOffLocation: "PYID",
      totalKms: 75,
      dutyHrs: "10:40:00",
      drivingHrs: "04:02:00",
      breakTime: "06:15:00",
    },
    66: {
      dutyNo: "66",
      signOnTime: "21:15:00",
      signOnLocation: "KGWA UP",
      nightTrainNo: "211",
      nightDepTime: "21:34:00",
      nightArrTime: "22:30:00",
      nightTripTime: "00:56:00",
      nightHandoverLoc: "N PKT",
      nightBreak: "07:30:00",
      nightKms: 15,
      mornKms: 2,
      takeoverLocation: "Depot",
      mornTrainNo: "219",
      mornDepTime: "06:00:00",
      mornArrTime: "07:15:00",
      mornTripTime: "01:15:00",
      mornHandoverLoc: "Rd3 Stbl",
      signOffTime: "07:20:00",
      signOffLocation: "PYID",
      totalKms: 17,
      dutyHrs: "10:05:00",
      drivingHrs: "02:11:00",
      breakTime: "07:30:00",
    },
    67: {
      dutyNo: "67",
      signOnTime: "21:20:00",
      signOnLocation: "PYID DN",
      nightTrainNo: "216",
      nightDepTime: "21:34:00",
      nightArrTime: "23:55:00",
      nightTripTime: "02:21:00",
      nightHandoverLoc: "NG DN PF",
      nightBreak: "05:50:00",
      nightKms: 65,
      mornKms: 47,
      takeoverLocation: "NGSA Dn",
      mornTrainNo: "201",
      mornDepTime: "05:45:00",
      mornArrTime: "07:00:00",
      mornTripTime: "01:15:00",
      mornHandoverLoc: "KGWA Up",
      signOffTime: "07:05:00",
      signOffLocation: "KGWA",
      totalKms: 112,
      dutyHrs: "09:45:00",
      drivingHrs: "03:36:00",
      breakTime: "05:50:00",
    },
    68: {
      dutyNo: "68",
      signOnTime: "21:20:00",
      signOnLocation: "PYID",
      nightTrainNo: "217",
      nightDepTime: "21:35:12",
      nightArrTime: "00:15:00",
      nightTripTime: "02:39:48",
      nightHandoverLoc: "BIET UP PF",
      nightBreak: "06:25:00",
      nightKms: 74,
      mornKms: 7,
      takeoverLocation: "BEIT Up",
      mornTrainNo: "209",
      mornDepTime: "06:40:00",
      mornArrTime: "07:22:00",
      mornTripTime: "00:42:00",
      mornHandoverLoc: "PYID Dn",
      signOffTime: "07:30:00",
      signOffLocation: "PYID",
      totalKms: 81,
      dutyHrs: "10:10:00",
      drivingHrs: "03:21:48",
      breakTime: "06:25:00",
    },
    69: {
      dutyNo: "69",
      signOnTime: "21:25:00",
      signOnLocation: "PUTH UP",
      nightTrainNo: "201",
      nightDepTime: "21:40:00",
      nightArrTime: "23:30:00",
      nightTripTime: "01:50:00",
      nightHandoverLoc: "B DHO",
      nightBreak: "06:40:00",
      nightKms: 36,
      mornKms: 16,
      takeoverLocation: "Depot",
      mornTrainNo: "211",
      mornDepTime: "06:10:00",
      mornArrTime: "07:39:00",
      mornTripTime: "01:29:00",
      mornHandoverLoc: "PYID DN",
      signOffTime: "06:30:00",
      signOffLocation: "PYID",
      totalKms: 52,
      dutyHrs: "09:05:00",
      drivingHrs: "03:19:00",
      breakTime: "06:40:00",
    },
    70: {
      dutyNo: "70",
      signOnTime: "21:25:00",
      signOnLocation: "KGWA DN",
      nightTrainNo: "202",
      nightDepTime: "21:42:00",
      nightArrTime: "00:00:00",
      nightTripTime: "02:18:00",
      nightHandoverLoc: "SPGD/Depot",
      nightBreak: "00:40:00",
      nightKms: 68,
      mornKms: 0,
      takeoverLocation: "Depot/CC",
      mornTrainNo: "Ntest",
      mornDepTime: "00:40:00",
      mornArrTime: "06:00:00",
      mornTripTime: "05:20:00",
      mornHandoverLoc: "Depot",
      signOffTime: "06:05:00",
      signOffLocation: "Depot",
      totalKms: 68,
      dutyHrs: "08:40:00",
      drivingHrs: "02:18:00",
      breakTime: "00:40:00",
    },
    71: {
      dutyNo: "71",
      signOnTime: "21:30:00",
      signOnLocation: "PYID DN",
      nightTrainNo: "206",
      nightDepTime: "21:44:00",
      nightArrTime: "00:20:00",
      nightTripTime: "02:36:00",
      nightHandoverLoc: "JIDL UP PF",
      nightBreak: "06:10:00",
      nightKms: 60,
      mornKms: 10,
      takeoverLocation: "NGSA Up",
      mornTrainNo: "210",
      mornDepTime: "06:30:00",
      mornArrTime: "07:29:00",
      mornTripTime: "00:59:00",
      mornHandoverLoc: "PYID Dn",
      signOffTime: "07:35:00",
      signOffLocation: "PYID",
      totalKms: 70,
      dutyHrs: "10:05:00",
      drivingHrs: "03:35:00",
      breakTime: "06:10:00",
    },
    72: {
      dutyNo: "72",
      signOnTime: "21:35:00",
      signOnLocation: "PYID DN",
      nightTrainNo: "207",
      nightDepTime: "21:54:00",
      nightArrTime: "00:15:00",
      nightTripTime: "02:21:00",
      nightHandoverLoc: "BIET DN PF",
      nightBreak: "06:15:00",
      nightKms: 62,
      mornKms: 7,
      takeoverLocation: "BEIT Dn",
      mornTrainNo: "208",
      mornDepTime: "06:30:00",
      mornArrTime: "07:15:00",
      mornTripTime: "00:45:00",
      mornHandoverLoc: "PYID Dn",
      signOffTime: "07:20:00",
      signOffLocation: "PYID",
      totalKms: 69,
      dutyHrs: "09:45:00",
      drivingHrs: "03:06:00",
      breakTime: "06:15:00",
    },
  },
  // ══════════════════════════════════════════════════════════════
  // SUNDAY Night  ➔  MONDAY Regular 04:00hrs Morning
  // ══════════════════════════════════════════════════════════════
  SUNDAY__MONDAY: {
    48: {
      dutyNo: "48",
      signOnTime: "21:05:00",
      signOnLocation: "PUTH Up",
      nightTrainNo: "204",
      nightDepTime: "21:22:00",
      nightArrTime: "23:45:00",
      nightTripTime: "02:23:00",
      nightHandoverLoc: "PUTH Up",
      nightBreak: "03:55:00",
      nightKms: 68,
      mornKms: 34,
      takeoverLocation: "PUTH Up",
      mornTrainNo: "208",
      mornDepTime: "03:40:00",
      mornArrTime: "05:42:00",
      mornTripTime: "02:02:00",
      mornHandoverLoc: "PYID DN",
      signOffTime: "06:00:00",
      signOffLocation: "PYID",
      totalKms: 102,
      dutyHrs: "08:55:00",
      drivingHrs: "04:25:00",
      breakTime: "03:55:00",
    },
    49: {
      dutyNo: "49",
      signOnTime: "21:15:00",
      signOnLocation: "PUTH Dn",
      nightTrainNo: "215",
      nightDepTime: "21:33:00",
      nightArrTime: "00:10:00",
      nightTripTime: "02:37:00",
      nightHandoverLoc: "APTS Dn",
      nightBreak: "03:55:00",
      nightKms: 75,
      mornKms: 30,
      takeoverLocation: "APTS Dn",
      mornTrainNo: "210",
      mornDepTime: "04:05:00",
      mornArrTime: "06:30:00",
      mornTripTime: "02:25:00",
      mornHandoverLoc: "KGWA Dn",
      signOffTime: "06:35:00",
      signOffLocation: "KGWA",
      totalKms: 105,
      dutyHrs: "09:20:00",
      drivingHrs: "05:02:00",
      breakTime: "03:55:00",
    },
    50: {
      dutyNo: "50",
      signOnTime: "21:30:00",
      signOnLocation: "PUTH Up",
      nightTrainNo: "206",
      nightDepTime: "21:44:00",
      nightArrTime: "00:00:00",
      nightTripTime: "02:16:00",
      nightHandoverLoc: "APTS Up",
      nightBreak: "03:45:00",
      nightKms: 61,
      mornKms: 30,
      takeoverLocation: "APTS Up",
      mornTrainNo: "209",
      mornDepTime: "03:45:00",
      mornArrTime: "06:15:00",
      mornTripTime: "02:30:00",
      mornHandoverLoc: "KGWA DN",
      signOffTime: "06:20:00",
      signOffLocation: "KGWA",
      totalKms: 91,
      dutyHrs: "08:50:00",
      drivingHrs: "04:46:00",
      breakTime: "03:45:00",
    },
    51: {
      dutyNo: "51",
      signOnTime: "21:30:00",
      signOnLocation: "PYID",
      nightTrainNo: "217",
      nightDepTime: "21:44:12",
      nightArrTime: "23:45:00",
      nightTripTime: "02:00:48",
      nightHandoverLoc: "NLC Up",
      nightBreak: "03:50:00",
      nightKms: 55,
      mornKms: 55,
      takeoverLocation: "NLC Up",
      mornTrainNo: "207",
      mornDepTime: "03:35:00",
      mornArrTime: "06:40:00",
      mornTripTime: "03:05:00",
      mornHandoverLoc: "PUTH UP",
      signOffTime: "06:45:00",
      signOffLocation: "PUTH",
      totalKms: 110,
      dutyHrs: "09:15:00",
      drivingHrs: "05:05:48",
      breakTime: "03:50:00",
    },
    52: {
      dutyNo: "52",
      signOnTime: "21:30:00",
      signOnLocation: "KGWA Up",
      nightTrainNo: "213",
      nightDepTime: "21:47:00",
      nightArrTime: "00:00:00",
      nightTripTime: "02:13:00",
      nightHandoverLoc: "PUTH Dn",
      nightBreak: "04:15:00",
      nightKms: 58,
      mornKms: 48,
      takeoverLocation: "PUTH Dn",
      mornTrainNo: "211",
      mornDepTime: "04:15:00",
      mornArrTime: "06:27:00",
      mornTripTime: "02:12:00",
      mornHandoverLoc: "PYID Dn",
      signOffTime: "06:30:00",
      signOffLocation: "PYID",
      totalKms: 106,
      dutyHrs: "09:00:00",
      drivingHrs: "04:25:00",
      breakTime: "04:15:00",
    },
    53: {
      dutyNo: "53",
      signOnTime: "21:05:00",
      signOnLocation: "PUTH Dn",
      nightTrainNo: "214",
      nightDepTime: "21:23:00",
      nightArrTime: "23:40:00",
      nightTripTime: "02:17:00",
      nightHandoverLoc: "B DHO",
      nightBreak: "06:00:00",
      nightKms: 48,
      mornKms: 34,
      takeoverLocation: "PYID DN",
      mornTrainNo: "208",
      mornDepTime: "05:40:00",
      mornArrTime: "06:55:00",
      mornTripTime: "01:15:00",
      mornHandoverLoc: "PUTH UP",
      signOffTime: "07:00:00",
      signOffLocation: "PUTH",
      totalKms: 82,
      dutyHrs: "09:55:00",
      drivingHrs: "03:32:00",
      breakTime: "06:00:00",
    },
    54: {
      dutyNo: "54",
      signOnTime: "21:10:00",
      signOnLocation: "PYID",
      nightTrainNo: "212",
      nightDepTime: "21:28:00",
      nightArrTime: "00:10:00",
      nightTripTime: "02:42:00",
      nightHandoverLoc: "BEIT Dn",
      nightBreak: "03:35:00",
      nightKms: 75,
      mornKms: 61,
      takeoverLocation: "BIET DnPf",
      mornTrainNo: "203",
      mornDepTime: "03:45:00",
      mornArrTime: "06:33:00",
      mornTripTime: "02:48:00",
      mornHandoverLoc: "PYID UP",
      signOffTime: "06:40:00",
      signOffLocation: "PYID",
      totalKms: 136,
      dutyHrs: "09:30:00",
      drivingHrs: "05:30:00",
      breakTime: "03:35:00",
    },
    55: {
      dutyNo: "55",
      signOnTime: "21:15:00",
      signOnLocation: "KGWA Up",
      nightTrainNo: "203",
      nightDepTime: "21:32:00",
      nightArrTime: "23:00:00",
      nightTripTime: "01:28:00",
      nightHandoverLoc: "B DHO",
      nightBreak: "06:10:00",
      nightKms: 25,
      mornKms: 16,
      takeoverLocation: "Dep-Jhli trBk",
      mornTrainNo: "206",
      mornDepTime: "05:10:00",
      mornArrTime: "06:47:00",
      mornTripTime: "01:37:00",
      mornHandoverLoc: "PYID Dn",
      signOffTime: "06:50:00",
      signOffLocation: "PYID",
      totalKms: 41,
      dutyHrs: "09:35:00",
      drivingHrs: "03:05:00",
      breakTime: "06:10:00",
    },
    56: {
      dutyNo: "56",
      signOnTime: "21:15:00",
      signOnLocation: "KGWA Dn",
      nightTrainNo: "208",
      nightDepTime: "21:33:00",
      nightArrTime: "00:10:00",
      nightTripTime: "02:37:00",
      nightHandoverLoc: "B DHO",
      nightBreak: "00:30:00",
      nightKms: 59,
      mornKms: 0,
      takeoverLocation: "Depot/CC",
      mornTrainNo: "Ntest",
      mornDepTime: "00:40:00",
      mornArrTime: "06:00:00",
      mornTripTime: "05:20:00",
      mornHandoverLoc: "Depot",
      signOffTime: "06:05:00",
      signOffLocation: "Depot",
      totalKms: 59,
      dutyHrs: "08:50:00",
      drivingHrs: "02:37:00",
      breakTime: "00:30:00",
    },
    57: {
      dutyNo: "57",
      signOnTime: "21:20:00",
      signOnLocation: "PYID Dn",
      nightTrainNo: "216",
      nightDepTime: "21:35:00",
      nightArrTime: "00:00:00",
      nightTripTime: "02:25:00",
      nightHandoverLoc: "NGSA Dn",
      nightBreak: "03:30:00",
      nightKms: 64,
      mornKms: 58,
      takeoverLocation: "NGSA DnPf",
      mornTrainNo: "202",
      mornDepTime: "03:30:00",
      mornArrTime: "06:18:00",
      mornTripTime: "02:48:00",
      mornHandoverLoc: "PYID UP",
      signOffTime: "06:25:00",
      signOffLocation: "PYID",
      totalKms: 122,
      dutyHrs: "09:05:00",
      drivingHrs: "05:13:00",
      breakTime: "03:30:00",
    },
    58: {
      dutyNo: "58",
      signOnTime: "21:20:00",
      signOnLocation: "PYID",
      nightTrainNo: "202",
      nightDepTime: "21:36:12",
      nightArrTime: "00:10:00",
      nightTripTime: "02:33:48",
      nightHandoverLoc: "BEIT Up",
      nightBreak: "04:00:00",
      nightKms: 74,
      mornKms: 51,
      takeoverLocation: "BIET UpPf",
      mornTrainNo: "204",
      mornDepTime: "04:10:00",
      mornArrTime: "06:28:00",
      mornTripTime: "02:18:00",
      mornHandoverLoc: "KGWA UP",
      signOffTime: "06:35:00",
      signOffLocation: "KGWA",
      totalKms: 125,
      dutyHrs: "09:15:00",
      drivingHrs: "04:51:48",
      breakTime: "04:00:00",
    },
    59: {
      dutyNo: "59",
      signOnTime: "21:20:00",
      signOnLocation: "PUTH Up",
      nightTrainNo: "205",
      nightDepTime: "21:38:00",
      nightArrTime: "23:25:00",
      nightTripTime: "01:47:00",
      nightHandoverLoc: "B DHO",
      nightBreak: "06:05:00",
      nightKms: 36,
      mornKms: 0,
      takeoverLocation: "PDC 213;214;215",
      mornTrainNo: "--",
      mornDepTime: "05:30:00",
      mornArrTime: "07:00:00",
      mornTripTime: "01:30:00",
      mornHandoverLoc: "PYID",
      signOffTime: "07:05:00",
      signOffLocation: "PYID",
      totalKms: 36,
      dutyHrs: "09:45:00",
      drivingHrs: "03:17:00",
      breakTime: "06:05:00",
    },
    60: {
      dutyNo: "60",
      signOnTime: "21:25:00",
      signOnLocation: "PUTH Dn",
      nightTrainNo: "201",
      nightDepTime: "21:43:00",
      nightArrTime: "23:20:00",
      nightTripTime: "01:37:00",
      nightHandoverLoc: "BT Dn BE",
      nightBreak: "07:10:00",
      nightKms: 41,
      mornKms: 7,
      takeoverLocation: "BIET DnBE",
      mornTrainNo: "217",
      mornDepTime: "06:30:00",
      mornArrTime: "07:27:00",
      mornTripTime: "00:57:00",
      mornHandoverLoc: "PYID Dn",
      signOffTime: "07:30:00",
      signOffLocation: "PYID",
      totalKms: 48,
      dutyHrs: "10:05:00",
      drivingHrs: "02:34:00",
      breakTime: "07:10:00",
    },
    61: {
      dutyNo: "61",
      signOnTime: "21:25:00",
      signOnLocation: "KGWA Dn",
      nightTrainNo: "209",
      nightDepTime: "21:43:00",
      nightArrTime: "00:10:00",
      nightTripTime: "02:27:00",
      nightHandoverLoc: "SPGD Dn",
      nightBreak: "03:30:00",
      nightKms: 66,
      mornKms: 59,
      takeoverLocation: "SPGD DnPf",
      mornTrainNo: "201",
      mornDepTime: "03:40:00",
      mornArrTime: "06:37:00",
      mornTripTime: "02:57:00",
      mornHandoverLoc: "PYID DN",
      signOffTime: "06:40:00",
      signOffLocation: "PYID",
      totalKms: 125,
      dutyHrs: "09:15:00",
      drivingHrs: "05:24:00",
      breakTime: "03:30:00",
    },
    62: {
      dutyNo: "62",
      signOnTime: "21:30:00",
      signOnLocation: "PYID Dn",
      nightTrainNo: "210",
      nightDepTime: "21:45:00",
      nightArrTime: "00:10:00",
      nightTripTime: "02:25:00",
      nightHandoverLoc: "JIDL Up",
      nightBreak: "03:50:00",
      nightKms: 64,
      mornKms: 64,
      takeoverLocation: "JIDL UpPf",
      mornTrainNo: "205",
      mornDepTime: "04:00:00",
      mornArrTime: "06:41:00",
      mornTripTime: "02:41:00",
      mornHandoverLoc: "KGWA Up",
      signOffTime: "06:45:00",
      signOffLocation: "KGWA",
      totalKms: 128,
      dutyHrs: "09:15:00",
      drivingHrs: "05:06:00",
      breakTime: "03:50:00",
    },
  },
  // ══════════════════════════════════════════════════════════════
  // SUNDAY Night  ➔  MONDAY GH Morning
  // ══════════════════════════════════════════════════════════════
  SUNDAY__MONDAY_GH: {
    48: {
      dutyNo: "48",
      signOnTime: "21:05:00",
      signOnLocation: "PUTH Up",
      nightTrainNo: "204",
      nightDepTime: "21:22:00",
      nightArrTime: "23:45:00",
      nightTripTime: "02:23:00",
      nightHandoverLoc: "PUTH Up",
      nightBreak: "03:55:00",
      nightKms: 68,
      mornKms: 34,
      takeoverLocation: "PUTH Up",
      mornTrainNo: "207",
      mornDepTime: "03:40:00",
      mornArrTime: "05:42:00",
      mornTripTime: "02:02:00",
      mornHandoverLoc: "PYID Dn",
      signOffTime: "06:25:00",
      signOffLocation: "PYID",
      totalKms: 102,
      dutyHrs: "09:20:00",
      drivingHrs: "04:25:00",
      breakTime: "03:55:00",
    },
    49: {
      dutyNo: "49",
      signOnTime: "21:15:00",
      signOnLocation: "PUTH Dn",
      nightTrainNo: "215",
      nightDepTime: "21:33:00",
      nightArrTime: "00:10:00",
      nightTripTime: "02:37:00",
      nightHandoverLoc: "APTS Dn",
      nightBreak: "03:50:00",
      nightKms: 75,
      mornKms: 30,
      takeoverLocation: "APTS Dn",
      mornTrainNo: "209",
      mornDepTime: "04:00:00",
      mornArrTime: "06:30:00",
      mornTripTime: "02:30:00",
      mornHandoverLoc: "KGWA Dn",
      signOffTime: "06:35:00",
      signOffLocation: "KGWA",
      totalKms: 105,
      dutyHrs: "09:20:00",
      drivingHrs: "05:07:00",
      breakTime: "03:50:00",
    },
    50: {
      dutyNo: "50",
      signOnTime: "21:30:00",
      signOnLocation: "PUTH Up",
      nightTrainNo: "206",
      nightDepTime: "21:44:00",
      nightArrTime: "00:00:00",
      nightTripTime: "02:16:00",
      nightHandoverLoc: "APTS Up",
      nightBreak: "03:45:00",
      nightKms: 61,
      mornKms: 30,
      takeoverLocation: "APTS Up",
      mornTrainNo: "208",
      mornDepTime: "03:45:00",
      mornArrTime: "06:15:00",
      mornTripTime: "02:30:00",
      mornHandoverLoc: "KGWA Dn",
      signOffTime: "06:20:00",
      signOffLocation: "KGWA",
      totalKms: 91,
      dutyHrs: "08:50:00",
      drivingHrs: "04:46:00",
      breakTime: "03:45:00",
    },
    51: {
      dutyNo: "51",
      signOnTime: "21:30:00",
      signOnLocation: "PYID",
      nightTrainNo: "217",
      nightDepTime: "21:44:12",
      nightArrTime: "23:45:00",
      nightTripTime: "02:00:48",
      nightHandoverLoc: "NLC Up",
      nightBreak: "03:50:00",
      nightKms: 55,
      mornKms: 55,
      takeoverLocation: "NLC Up",
      mornTrainNo: "206",
      mornDepTime: "03:35:00",
      mornArrTime: "06:40:00",
      mornTripTime: "03:05:00",
      mornHandoverLoc: "PUTH UP",
      signOffTime: "06:45:00",
      signOffLocation: "PUTH",
      totalKms: 110,
      dutyHrs: "09:15:00",
      drivingHrs: "05:05:48",
      breakTime: "03:50:00",
    },
    52: {
      dutyNo: "52",
      signOnTime: "21:30:00",
      signOnLocation: "KGWA Up",
      nightTrainNo: "213",
      nightDepTime: "21:47:00",
      nightArrTime: "00:00:00",
      nightTripTime: "02:13:00",
      nightHandoverLoc: "PUTH Dn",
      nightBreak: "04:15:00",
      nightKms: 58,
      mornKms: 48,
      takeoverLocation: "PUTH Dn",
      mornTrainNo: "210",
      mornDepTime: "04:15:00",
      mornArrTime: "06:27:00",
      mornTripTime: "02:12:00",
      mornHandoverLoc: "PYID Dn",
      signOffTime: "06:30:00",
      signOffLocation: "PYID",
      totalKms: 106,
      dutyHrs: "09:00:00",
      drivingHrs: "04:25:00",
      breakTime: "04:15:00",
    },
    53: {
      dutyNo: "53",
      signOnTime: "21:05:00",
      signOnLocation: "PUTH Dn",
      nightTrainNo: "214",
      nightDepTime: "21:23:00",
      nightArrTime: "23:40:00",
      nightTripTime: "02:17:00",
      nightHandoverLoc: "B DHO",
      nightBreak: "06:20:00",
      nightKms: 48,
      mornKms: 2,
      takeoverLocation: "Depot",
      mornTrainNo: "219",
      mornDepTime: "06:00:00",
      mornArrTime: "07:00:00",
      mornTripTime: "01:00:00",
      mornHandoverLoc: "Rd3 Stbl",
      signOffTime: "07:05:00",
      signOffLocation: "PYID",
      totalKms: 50,
      dutyHrs: "10:00:00",
      drivingHrs: "03:17:00",
      breakTime: "06:20:00",
    },
    54: {
      dutyNo: "54",
      signOnTime: "21:10:00",
      signOnLocation: "PYID",
      nightTrainNo: "212",
      nightDepTime: "21:28:00",
      nightArrTime: "00:10:00",
      nightTripTime: "02:42:00",
      nightHandoverLoc: "BEIT Dn",
      nightBreak: "03:35:00",
      nightKms: 75,
      mornKms: 61,
      takeoverLocation: "BEIT Dn",
      mornTrainNo: "203",
      mornDepTime: "03:45:00",
      mornArrTime: "06:33:00",
      mornTripTime: "02:48:00",
      mornHandoverLoc: "PYID Up",
      signOffTime: "07:10:00",
      signOffLocation: "PYID",
      totalKms: 136,
      dutyHrs: "10:00:00",
      drivingHrs: "05:30:00",
      breakTime: "03:35:00",
    },
    55: {
      dutyNo: "55",
      signOnTime: "21:15:00",
      signOnLocation: "KGWA Up",
      nightTrainNo: "203",
      nightDepTime: "21:32:00",
      nightArrTime: "23:00:00",
      nightTripTime: "01:28:00",
      nightHandoverLoc: "B DHO",
      nightBreak: "06:40:00",
      nightKms: 25,
      mornKms: 44,
      takeoverLocation: "PYID Dn",
      mornTrainNo: "207",
      mornDepTime: "05:40:00",
      mornArrTime: "07:13:00",
      mornTripTime: "01:33:00",
      mornHandoverLoc: "KGWA UP",
      signOffTime: "07:20:00",
      signOffLocation: "KGWA",
      totalKms: 69,
      dutyHrs: "10:05:00",
      drivingHrs: "03:01:00",
      breakTime: "06:40:00",
    },
    56: {
      dutyNo: "56",
      signOnTime: "21:15:00",
      signOnLocation: "KGWA Dn",
      nightTrainNo: "208",
      nightDepTime: "21:33:00",
      nightArrTime: "00:10:00",
      nightTripTime: "02:37:00",
      nightHandoverLoc: "B DHO",
      nightBreak: "04:50:00",
      nightKms: 59,
      mornKms: 0,
      takeoverLocation: "ID 212; 213",
      mornTrainNo: "--",
      mornDepTime: "05:00:00",
      mornArrTime: "06:00:00",
      mornTripTime: "01:00:00",
      mornHandoverLoc: "--",
      signOffTime: "06:30:00",
      signOffLocation: "Depot",
      totalKms: 59,
      dutyHrs: "09:15:00",
      drivingHrs: "03:37:00",
      breakTime: "04:50:00",
    },
    57: {
      dutyNo: "57",
      signOnTime: "21:20:00",
      signOnLocation: "PYID Dn",
      nightTrainNo: "216",
      nightDepTime: "21:35:00",
      nightArrTime: "00:00:00",
      nightTripTime: "02:25:00",
      nightHandoverLoc: "NGSA Dn",
      nightBreak: "03:30:00",
      nightKms: 64,
      mornKms: 58,
      takeoverLocation: "NGSA Dn",
      mornTrainNo: "202",
      mornDepTime: "03:30:00",
      mornArrTime: "06:18:00",
      mornTripTime: "02:48:00",
      mornHandoverLoc: "PYID Up",
      signOffTime: "06:55:00",
      signOffLocation: "PYID",
      totalKms: 122,
      dutyHrs: "09:35:00",
      drivingHrs: "05:13:00",
      breakTime: "03:30:00",
    },
    58: {
      dutyNo: "58",
      signOnTime: "21:20:00",
      signOnLocation: "PYID",
      nightTrainNo: "202",
      nightDepTime: "21:36:12",
      nightArrTime: "00:10:00",
      nightTripTime: "02:33:48",
      nightHandoverLoc: "BEIT Up",
      nightBreak: "03:50:00",
      nightKms: 74,
      mornKms: 62,
      takeoverLocation: "BEIT Up",
      mornTrainNo: "204",
      mornDepTime: "04:00:00",
      mornArrTime: "06:48:00",
      mornTripTime: "02:48:00",
      mornHandoverLoc: "PYID Up",
      signOffTime: "07:05:00",
      signOffLocation: "PYID",
      totalKms: 136,
      dutyHrs: "09:45:00",
      drivingHrs: "05:21:48",
      breakTime: "03:50:00",
    },
    59: {
      dutyNo: "59",
      signOnTime: "21:20:00",
      signOnLocation: "PUTH Up",
      nightTrainNo: "205",
      nightDepTime: "21:38:00",
      nightArrTime: "23:25:00",
      nightTripTime: "01:47:00",
      nightHandoverLoc: "B DHO",
      nightBreak: "06:00:00",
      nightKms: 36,
      mornKms: 11,
      takeoverLocation: "Depo - JHLI  Trn Bk",
      mornTrainNo: "211",
      mornDepTime: "05:25:00",
      mornArrTime: "06:57:00",
      mornTripTime: "01:32:00",
      mornHandoverLoc: "PYID Dn",
      signOffTime: "06:20:00",
      signOffLocation: "PYID",
      totalKms: 47,
      dutyHrs: "09:00:00",
      drivingHrs: "03:19:00",
      breakTime: "06:00:00",
    },
    60: {
      dutyNo: "60",
      signOnTime: "21:25:00",
      signOnLocation: "PUTH Dn",
      nightTrainNo: "201",
      nightDepTime: "21:43:00",
      nightArrTime: "23:20:00",
      nightTripTime: "01:37:00",
      nightHandoverLoc: "BT Dn BE",
      nightBreak: "00:40:00",
      nightKms: 41,
      mornKms: 0,
      takeoverLocation: "--",
      mornTrainNo: "Ntest",
      mornDepTime: "00:00:00",
      mornArrTime: "06:00:00",
      mornTripTime: "06:00:00",
      mornHandoverLoc: "--",
      signOffTime: "06:30:00",
      signOffLocation: "PYID",
      totalKms: 41,
      dutyHrs: "09:05:00",
      drivingHrs: "07:37:00",
      breakTime: "00:40:00",
    },
    61: {
      dutyNo: "61",
      signOnTime: "21:25:00",
      signOnLocation: "KGWA Dn",
      nightTrainNo: "209",
      nightDepTime: "21:43:00",
      nightArrTime: "00:10:00",
      nightTripTime: "02:27:00",
      nightHandoverLoc: "SPGD Dn",
      nightBreak: "03:30:00",
      nightKms: 66,
      mornKms: 59,
      takeoverLocation: "SPGD Dn",
      mornTrainNo: "201",
      mornDepTime: "03:40:00",
      mornArrTime: "06:37:00",
      mornTripTime: "02:57:00",
      mornHandoverLoc: "PYID Dn",
      signOffTime: "06:40:00",
      signOffLocation: "PYID",
      totalKms: 125,
      dutyHrs: "09:15:00",
      drivingHrs: "05:24:00",
      breakTime: "03:30:00",
    },
    62: {
      dutyNo: "62",
      signOnTime: "21:30:00",
      signOnLocation: "PYID Dn",
      nightTrainNo: "210",
      nightDepTime: "21:45:00",
      nightArrTime: "00:10:00",
      nightTripTime: "02:25:00",
      nightHandoverLoc: "NGSA Up",
      nightBreak: "04:00:00",
      nightKms: 64,
      mornKms: 64,
      takeoverLocation: "JIDL Up",
      mornTrainNo: "205",
      mornDepTime: "04:10:00",
      mornArrTime: "07:03:00",
      mornTripTime: "02:53:00",
      mornHandoverLoc: "PYID Up",
      signOffTime: "07:20:00",
      signOffLocation: "PYID",
      totalKms: 128,
      dutyHrs: "09:50:00",
      drivingHrs: "05:18:00",
      breakTime: "04:00:00",
    },
  },
  // ══════════════════════════════════════════════════════════════
  // MONDAY GH Night  ➔  WEEKDAY Morning
  // ══════════════════════════════════════════════════════════════
  MONDAY_GH__WEEKDAY: {
    51: {
      dutyNo: "51",
      signOnTime: "21:15:00",
      signOnLocation: "PUTH Dn",
      nightTrainNo: "202",
      nightDepTime: "21:33:00",
      nightArrTime: "00:10:00",
      nightTripTime: "02:37:00",
      nightHandoverLoc: "APTS Dn",
      nightBreak: "04:37:00",
      nightKms: 75,
      mornKms: 41,
      takeoverLocation: "APTS Dn",
      mornTrainNo: "210",
      mornDepTime: "04:47:00",
      mornArrTime: "06:47:00",
      mornTripTime: "02:00:00",
      mornHandoverLoc: "PYID Dn",
      signOffTime: "06:50:00",
      signOffLocation: "PYID",
      totalKms: 116,
      dutyHrs: "09:35:00",
      drivingHrs: "04:37:00",
      breakTime: "04:37:00",
    },
    52: {
      dutyNo: "52",
      signOnTime: "21:30:00",
      signOnLocation: "PUTH Up",
      nightTrainNo: "210",
      nightDepTime: "21:44:00",
      nightArrTime: "00:00:00",
      nightTripTime: "02:16:00",
      nightHandoverLoc: "APTS Up",
      nightBreak: "04:30:00",
      nightKms: 61,
      mornKms: 40,
      takeoverLocation: "APTS Up",
      mornTrainNo: "209",
      mornDepTime: "04:30:00",
      mornArrTime: "06:37:00",
      mornTripTime: "02:07:00",
      mornHandoverLoc: "PYID Dn",
      signOffTime: "06:40:00",
      signOffLocation: "PYID",
      totalKms: 101,
      dutyHrs: "09:10:00",
      drivingHrs: "04:23:00",
      breakTime: "04:30:00",
    },
    53: {
      dutyNo: "53",
      signOnTime: "21:35:00",
      signOnLocation: "KGWA Up",
      nightTrainNo: "208",
      nightDepTime: "21:49:00",
      nightArrTime: "00:10:00",
      nightTripTime: "02:21:00",
      nightHandoverLoc: "PUTH Dn",
      nightBreak: "04:30:00",
      nightKms: 58,
      mornKms: 47,
      takeoverLocation: "PUTH Dn",
      mornTrainNo: "211",
      mornDepTime: "04:40:00",
      mornArrTime: "06:57:00",
      mornTripTime: "02:17:00",
      mornHandoverLoc: "PYID Dn",
      signOffTime: "07:00:00",
      signOffLocation: "PYID",
      totalKms: 105,
      dutyHrs: "09:25:00",
      drivingHrs: "04:38:00",
      breakTime: "04:30:00",
    },
    54: {
      dutyNo: "54",
      signOnTime: "21:30:00",
      signOnLocation: "PYID",
      nightTrainNo: "214",
      nightDepTime: "21:44:12",
      nightArrTime: "23:40:00",
      nightTripTime: "01:55:48",
      nightHandoverLoc: "NLC Up",
      nightBreak: "04:40:00",
      nightKms: 55,
      mornKms: 38,
      takeoverLocation: "NLC Up",
      mornTrainNo: "207",
      mornDepTime: "04:20:00",
      mornArrTime: "06:30:00",
      mornTripTime: "02:10:00",
      mornHandoverLoc: "KGWA Dn",
      signOffTime: "06:35:00",
      signOffLocation: "KGWA",
      totalKms: 93,
      dutyHrs: "09:05:00",
      drivingHrs: "04:05:48",
      breakTime: "04:40:00",
    },
    55: {
      dutyNo: "55",
      signOnTime: "21:25:00",
      signOnLocation: "KGWA Up",
      nightTrainNo: "215",
      nightDepTime: "21:40:00",
      nightArrTime: "23:40:00",
      nightTripTime: "02:00:00",
      nightHandoverLoc: "PUTH Up",
      nightBreak: "04:35:00",
      nightKms: 58,
      mornKms: 34,
      takeoverLocation: "PUTH Up",
      mornTrainNo: "208",
      mornDepTime: "04:15:00",
      mornArrTime: "06:27:00",
      mornTripTime: "02:12:00",
      mornHandoverLoc: "PYID Dn",
      signOffTime: "06:30:00",
      signOffLocation: "PYID",
      totalKms: 92,
      dutyHrs: "09:05:00",
      drivingHrs: "04:12:00",
      breakTime: "04:35:00",
    },
    56: {
      dutyNo: "56",
      signOnTime: "21:10:00",
      signOnLocation: "PUTH Dn",
      nightTrainNo: "201",
      nightDepTime: "21:23:00",
      nightArrTime: "23:45:00",
      nightTripTime: "02:22:00",
      nightHandoverLoc: "Bt DHO",
      nightBreak: "05:45:00",
      nightKms: 48,
      mornKms: 0,
      takeoverLocation: "213; 214; 215",
      mornTrainNo: "--",
      mornDepTime: "05:30:00",
      mornArrTime: "07:00:00",
      mornTripTime: "01:30:00",
      mornHandoverLoc: "PYID",
      signOffTime: "07:05:00",
      signOffLocation: "PYID",
      totalKms: 48,
      dutyHrs: "09:55:00",
      drivingHrs: "03:52:00",
      breakTime: "05:45:00",
    },
    57: {
      dutyNo: "57",
      signOnTime: "21:10:00",
      signOnLocation: "KGWA Dn",
      nightTrainNo: "211",
      nightDepTime: "21:23:00",
      nightArrTime: "00:00:00",
      nightTripTime: "02:37:00",
      nightHandoverLoc: "Bt DHO",
      nightBreak: "00:40:00",
      nightKms: 59,
      mornKms: 0,
      takeoverLocation: "Depot/CC",
      mornTrainNo: "Ntest",
      mornDepTime: "00:40:00",
      mornArrTime: "06:00:00",
      mornTripTime: "05:20:00",
      mornHandoverLoc: "Depot",
      signOffTime: "06:05:00",
      signOffLocation: "Depot",
      totalKms: 59,
      dutyHrs: "08:55:00",
      drivingHrs: "07:57:00",
      breakTime: "00:40:00",
    },
    58: {
      dutyNo: "58",
      signOnTime: "21:15:00",
      signOnLocation: "PYID",
      nightTrainNo: "213",
      nightDepTime: "21:28:12",
      nightArrTime: "23:55:00",
      nightTripTime: "02:26:48",
      nightHandoverLoc: "BEIT Dn",
      nightBreak: "04:20:00",
      nightKms: 74,
      mornKms: 51,
      takeoverLocation: "BEIT Dn",
      mornTrainNo: "203",
      mornDepTime: "04:15:00",
      mornArrTime: "06:43:00",
      mornTripTime: "02:28:00",
      mornHandoverLoc: "KGWA Up",
      signOffTime: "06:50:00",
      signOffLocation: "KGWA",
      totalKms: 125,
      dutyHrs: "09:35:00",
      drivingHrs: "04:54:48",
      breakTime: "04:20:00",
    },
    59: {
      dutyNo: "59",
      signOnTime: "21:15:00",
      signOnLocation: "KGWA Dn",
      nightTrainNo: "203",
      nightDepTime: "21:33:00",
      nightArrTime: "00:10:00",
      nightTripTime: "02:37:00",
      nightHandoverLoc: "Bt DHO",
      nightBreak: "00:30:00",
      nightKms: 59,
      mornKms: 0,
      takeoverLocation: "CC/Depot",
      mornTrainNo: "N test",
      mornDepTime: "00:40:00",
      mornArrTime: "06:30:00",
      mornTripTime: "05:50:00",
      mornHandoverLoc: "Depot",
      signOffTime: "06:30:00",
      signOffLocation: "Depot",
      totalKms: 59,
      dutyHrs: "09:15:00",
      drivingHrs: "08:27:00",
      breakTime: "00:30:00",
    },
    60: {
      dutyNo: "60",
      signOnTime: "21:20:00",
      signOnLocation: "PYID Dn",
      nightTrainNo: "204",
      nightDepTime: "21:35:00",
      nightArrTime: "23:55:00",
      nightTripTime: "02:20:00",
      nightHandoverLoc: "NGSA Dn",
      nightBreak: "04:05:00",
      nightKms: 64,
      mornKms: 59,
      takeoverLocation: "NGSA DnPf",
      mornTrainNo: "202",
      mornDepTime: "04:00:00",
      mornArrTime: "06:48:12",
      mornTripTime: "02:48:12",
      mornHandoverLoc: "PYID Up",
      signOffTime: "06:55:00",
      signOffLocation: "PYID",
      totalKms: 123,
      dutyHrs: "09:35:00",
      drivingHrs: "05:08:12",
      breakTime: "04:05:00",
    },
    61: {
      dutyNo: "61",
      signOnTime: "21:20:00",
      signOnLocation: "PYID",
      nightTrainNo: "206",
      nightDepTime: "21:36:12",
      nightArrTime: "00:10:00",
      nightTripTime: "02:33:48",
      nightHandoverLoc: "BEIT Up",
      nightBreak: "04:35:00",
      nightKms: 74,
      mornKms: 51,
      takeoverLocation: "BIET UpPf",
      mornTrainNo: "204",
      mornDepTime: "04:45:00",
      mornArrTime: "06:58:00",
      mornTripTime: "02:13:00",
      mornHandoverLoc: "KGWA Up",
      signOffTime: "07:05:00",
      signOffLocation: "KGWA",
      totalKms: 125,
      dutyHrs: "09:45:00",
      drivingHrs: "04:46:48",
      breakTime: "04:35:00",
    },
    62: {
      dutyNo: "62",
      signOnTime: "21:30:00",
      signOnLocation: "KGWA Dn",
      nightTrainNo: "212",
      nightDepTime: "21:43:00",
      nightArrTime: "00:05:00",
      nightTripTime: "02:22:00",
      nightHandoverLoc: "SPGD Dn",
      nightBreak: "04:20:00",
      nightKms: 66,
      mornKms: 45,
      takeoverLocation: "SPGD DnPf",
      mornTrainNo: "201",
      mornDepTime: "04:25:00",
      mornArrTime: "06:33:12",
      mornTripTime: "02:08:12",
      mornHandoverLoc: "PYID Up",
      signOffTime: "06:40:00",
      signOffLocation: "PYID",
      totalKms: 111,
      dutyHrs: "09:10:00",
      drivingHrs: "04:30:12",
      breakTime: "04:20:00",
    },
    63: {
      dutyNo: "63",
      signOnTime: "21:30:00",
      signOnLocation: "PYID Dn",
      nightTrainNo: "205",
      nightDepTime: "21:45:00",
      nightArrTime: "00:10:00",
      nightTripTime: "02:25:00",
      nightHandoverLoc: "JIDL Up",
      nightBreak: "04:35:00",
      nightKms: 64,
      mornKms: 55,
      takeoverLocation: "JIDL UpPf",
      mornTrainNo: "205",
      mornDepTime: "04:45:00",
      mornArrTime: "07:13:00",
      mornTripTime: "02:28:00",
      mornHandoverLoc: "KGWA Up",
      signOffTime: "07:20:00",
      signOffLocation: "KGWA",
      totalKms: 119,
      dutyHrs: "09:50:00",
      drivingHrs: "04:53:00",
      breakTime: "04:35:00",
    },
    64: {
      dutyNo: "64",
      signOnTime: "21:15:00",
      signOnLocation: "KGWA Up",
      nightTrainNo: "207",
      nightDepTime: "21:32:00",
      nightArrTime: "23:00:00",
      nightTripTime: "01:28:00",
      nightHandoverLoc: "Bt DHO",
      nightBreak: "07:30:00",
      nightKms: 25,
      mornKms: 7,
      takeoverLocation: "BIET DnBE",
      mornTrainNo: "217",
      mornDepTime: "06:30:00",
      mornArrTime: "07:27:00",
      mornTripTime: "00:57:00",
      mornHandoverLoc: "PYID Dn",
      signOffTime: "07:30:00",
      signOffLocation: "PYID",
      totalKms: 32,
      dutyHrs: "10:15:00",
      drivingHrs: "02:25:00",
      breakTime: "07:30:00",
    },
    65: {
      dutyNo: "65",
      signOnTime: "21:20:00",
      signOnLocation: "PUTH Up",
      nightTrainNo: "209",
      nightDepTime: "21:38:00",
      nightArrTime: "23:25:00",
      nightTripTime: "01:47:00",
      nightHandoverLoc: "Bt DHO",
      nightBreak: "04:50:00",
      nightKms: 36,
      mornKms: 26,
      takeoverLocation: "Depo - JHLI  Trn Bk",
      mornTrainNo: "206",
      mornDepTime: "04:15:00",
      mornArrTime: "06:15:00",
      mornTripTime: "02:00:00",
      mornHandoverLoc: "KGWA Dn",
      signOffTime: "06:20:00",
      signOffLocation: "KGWA",
      totalKms: 62,
      dutyHrs: "09:00:00",
      drivingHrs: "03:47:00",
      breakTime: "04:50:00",
    },
  },
  // ══════════════════════════════════════════════════════════════
  // SATURDAY Night  ➔  WEEKDAY Morning
  // ══════════════════════════════════════════════════════════════
  SATURDAY__WEEKDAY: {
    59: {
      dutyNo: "59",
      signOnTime: "21:15:00",
      signOnLocation: "KGWA DN",
      nightTrainNo: "208",
      nightDepTime: "21:32:00",
      nightArrTime: "00:15:00",
      nightTripTime: "02:43:00",
      nightHandoverLoc: "APTS DN",
      nightBreak: "04:32:00",
      nightKms: 74,
      mornKms: 41,
      takeoverLocation: "APTS Dn",
      mornTrainNo: "210",
      mornDepTime: "04:47:00",
      mornArrTime: "06:47:00",
      mornTripTime: "02:00:00",
      mornHandoverLoc: "PYID Dn",
      signOffTime: "06:50:00",
      signOffLocation: "PYID",
      totalKms: 115,
      dutyHrs: "09:35:00",
      drivingHrs: "04:43:00",
      breakTime: "04:32:00",
    },
    60: {
      dutyNo: "60",
      signOnTime: "21:25:00",
      signOnLocation: "KGWA UP",
      nightTrainNo: "218",
      nightDepTime: "21:42:00",
      nightArrTime: "23:50:00",
      nightTripTime: "02:08:00",
      nightHandoverLoc: "PUTH UP",
      nightBreak: "04:25:00",
      nightKms: 58,
      mornKms: 34,
      takeoverLocation: "PUTH Up",
      mornTrainNo: "208",
      mornDepTime: "04:15:00",
      mornArrTime: "06:27:00",
      mornTripTime: "02:12:00",
      mornHandoverLoc: "PYID Dn",
      signOffTime: "06:30:00",
      signOffLocation: "PYID",
      totalKms: 92,
      dutyHrs: "09:05:00",
      drivingHrs: "04:20:00",
      breakTime: "04:25:00",
    },
    61: {
      dutyNo: "61",
      signOnTime: "21:30:00",
      signOnLocation: "PYID",
      nightTrainNo: "209",
      nightDepTime: "21:45:12",
      nightArrTime: "23:45:00",
      nightTripTime: "01:59:48",
      nightHandoverLoc: "NLC UP",
      nightBreak: "04:35:00",
      nightKms: 54,
      mornKms: 38,
      takeoverLocation: "NLC Up",
      mornTrainNo: "207",
      mornDepTime: "04:20:00",
      mornArrTime: "06:30:00",
      mornTripTime: "02:10:00",
      mornHandoverLoc: "KGWA Dn",
      signOffTime: "06:35:00",
      signOffLocation: "KGWA",
      totalKms: 92,
      dutyHrs: "09:05:00",
      drivingHrs: "04:09:48",
      breakTime: "04:35:00",
    },
    62: {
      dutyNo: "62",
      signOnTime: "21:15:00",
      signOnLocation: "PUTH UP",
      nightTrainNo: "220",
      nightDepTime: "21:30:00",
      nightArrTime: "00:10:00",
      nightTripTime: "02:40:00",
      nightHandoverLoc: "PUTH DN",
      nightBreak: "04:30:00",
      nightKms: 69,
      mornKms: 47,
      takeoverLocation: "PUTH Dn",
      mornTrainNo: "211",
      mornDepTime: "04:40:00",
      mornArrTime: "06:57:00",
      mornTripTime: "02:17:00",
      mornHandoverLoc: "PYID Dn",
      signOffTime: "07:00:00",
      signOffLocation: "PYID",
      totalKms: 116,
      dutyHrs: "09:45:00",
      drivingHrs: "04:57:00",
      breakTime: "04:30:00",
    },
    63: {
      dutyNo: "63",
      signOnTime: "21:35:00",
      signOnLocation: "PUTH UP",
      nightTrainNo: "203",
      nightDepTime: "21:50:00",
      nightArrTime: "00:15:00",
      nightTripTime: "02:25:00",
      nightHandoverLoc: "APTS UP",
      nightBreak: "04:15:00",
      nightKms: 62,
      mornKms: 40,
      takeoverLocation: "APTS Up",
      mornTrainNo: "209",
      mornDepTime: "04:30:00",
      mornArrTime: "06:37:00",
      mornTripTime: "02:07:00",
      mornHandoverLoc: "PYID Dn",
      signOffTime: "06:40:00",
      signOffLocation: "PYID",
      totalKms: 102,
      dutyHrs: "09:05:00",
      drivingHrs: "04:32:00",
      breakTime: "04:15:00",
    },
    64: {
      dutyNo: "64",
      signOnTime: "21:05:00",
      signOnLocation: "KGWA DN",
      nightTrainNo: "221",
      nightDepTime: "21:22:00",
      nightArrTime: "23:15:00",
      nightTripTime: "01:53:00",
      nightHandoverLoc: "BT DN B/E",
      nightBreak: "07:15:00",
      nightKms: 51,
      mornKms: 7,
      takeoverLocation: "BIET DnBE",
      mornTrainNo: "217",
      mornDepTime: "06:30:00",
      mornArrTime: "07:27:00",
      mornTripTime: "00:57:00",
      mornHandoverLoc: "PYID Dn",
      signOffTime: "07:30:00",
      signOffLocation: "PYID",
      totalKms: 58,
      dutyHrs: "10:25:00",
      drivingHrs: "02:50:00",
      breakTime: "07:15:00",
    },
    65: {
      dutyNo: "65",
      signOnTime: "21:15:00",
      signOnLocation: "KGWA DN",
      nightTrainNo: "210",
      nightDepTime: "21:32:00",
      nightArrTime: "00:00:00",
      nightTripTime: "02:28:00",
      nightHandoverLoc: "B DHO",
      nightBreak: "00:40:00",
      nightKms: 59,
      mornKms: 0,
      takeoverLocation: "Depot/CC",
      mornTrainNo: "Ntest",
      mornDepTime: "00:40:00",
      mornArrTime: "06:00:00",
      mornTripTime: "05:20:00",
      mornHandoverLoc: "Depot",
      signOffTime: "06:05:00",
      signOffLocation: "Depot",
      totalKms: 59,
      dutyHrs: "08:50:00",
      drivingHrs: "07:48:00",
      breakTime: "00:40:00",
    },
    66: {
      dutyNo: "66",
      signOnTime: "21:15:00",
      signOnLocation: "KGWA UP",
      nightTrainNo: "211",
      nightDepTime: "21:34:00",
      nightArrTime: "22:30:00",
      nightTripTime: "00:56:00",
      nightHandoverLoc: "N PKT",
      nightBreak: "07:00:00",
      nightKms: 15,
      mornKms: 0,
      takeoverLocation: "PDC 213;214;215",
      mornTrainNo: "--",
      mornDepTime: "05:30:00",
      mornArrTime: "07:00:00",
      mornTripTime: "01:30:00",
      mornHandoverLoc: "PYID",
      signOffTime: "07:05:00",
      signOffLocation: "PYID",
      totalKms: 15,
      dutyHrs: "09:50:00",
      drivingHrs: "02:26:00",
      breakTime: "07:00:00",
    },
    67: {
      dutyNo: "67",
      signOnTime: "21:20:00",
      signOnLocation: "PYID DN",
      nightTrainNo: "216",
      nightDepTime: "21:34:00",
      nightArrTime: "23:55:00",
      nightTripTime: "02:21:00",
      nightHandoverLoc: "NG DN PF",
      nightBreak: "04:05:00",
      nightKms: 65,
      mornKms: 59,
      takeoverLocation: "NGSA DnPf",
      mornTrainNo: "202",
      mornDepTime: "04:00:00",
      mornArrTime: "06:48:12",
      mornTripTime: "02:48:12",
      mornHandoverLoc: "PYID Up",
      signOffTime: "06:55:00",
      signOffLocation: "PYID",
      totalKms: 124,
      dutyHrs: "09:35:00",
      drivingHrs: "05:09:12",
      breakTime: "04:05:00",
    },
    68: {
      dutyNo: "68",
      signOnTime: "21:20:00",
      signOnLocation: "PYID",
      nightTrainNo: "217",
      nightDepTime: "21:35:12",
      nightArrTime: "00:15:00",
      nightTripTime: "02:39:48",
      nightHandoverLoc: "BIET UP PF",
      nightBreak: "04:30:00",
      nightKms: 74,
      mornKms: 51,
      takeoverLocation: "BIET UpPf",
      mornTrainNo: "204",
      mornDepTime: "04:45:00",
      mornArrTime: "06:58:00",
      mornTripTime: "02:13:00",
      mornHandoverLoc: "KGWA Up",
      signOffTime: "07:05:00",
      signOffLocation: "KGWA",
      totalKms: 125,
      dutyHrs: "09:45:00",
      drivingHrs: "04:52:48",
      breakTime: "04:30:00",
    },
    69: {
      dutyNo: "69",
      signOnTime: "21:25:00",
      signOnLocation: "PUTH UP",
      nightTrainNo: "201",
      nightDepTime: "21:40:00",
      nightArrTime: "23:30:00",
      nightTripTime: "01:50:00",
      nightHandoverLoc: "B DHO",
      nightBreak: "04:45:00",
      nightKms: 36,
      mornKms: 26,
      takeoverLocation: "Depot",
      mornTrainNo: "206",
      mornDepTime: "04:15:00",
      mornArrTime: "06:15:00",
      mornTripTime: "02:00:00",
      mornHandoverLoc: "KGWA Dn",
      signOffTime: "06:20:00",
      signOffLocation: "KGWA",
      totalKms: 62,
      dutyHrs: "08:55:00",
      drivingHrs: "03:50:00",
      breakTime: "04:45:00",
    },
    70: {
      dutyNo: "70",
      signOnTime: "21:25:00",
      signOnLocation: "KGWA DN",
      nightTrainNo: "202",
      nightDepTime: "21:42:00",
      nightArrTime: "00:00:00",
      nightTripTime: "02:18:00",
      nightHandoverLoc: "SPGD/Depot",
      nightBreak: "04:25:00",
      nightKms: 68,
      mornKms: 45,
      takeoverLocation: "SPGD DnPf",
      mornTrainNo: "201",
      mornDepTime: "04:25:00",
      mornArrTime: "06:33:12",
      mornTripTime: "02:08:12",
      mornHandoverLoc: "PYID Up",
      signOffTime: "06:40:00",
      signOffLocation: "PYID",
      totalKms: 113,
      dutyHrs: "09:15:00",
      drivingHrs: "04:26:12",
      breakTime: "04:25:00",
    },
    71: {
      dutyNo: "71",
      signOnTime: "21:30:00",
      signOnLocation: "PYID DN",
      nightTrainNo: "206",
      nightDepTime: "21:44:00",
      nightArrTime: "00:20:00",
      nightTripTime: "02:36:00",
      nightHandoverLoc: "JIDL UP PF",
      nightBreak: "04:25:00",
      nightKms: 60,
      mornKms: 55,
      takeoverLocation: "JIDL UpPf",
      mornTrainNo: "205",
      mornDepTime: "04:45:00",
      mornArrTime: "07:13:00",
      mornTripTime: "02:28:00",
      mornHandoverLoc: "KGWA Up",
      signOffTime: "07:20:00",
      signOffLocation: "KGWA",
      totalKms: 115,
      dutyHrs: "09:50:00",
      drivingHrs: "05:04:00",
      breakTime: "04:25:00",
    },
    72: {
      dutyNo: "72",
      signOnTime: "21:35:00",
      signOnLocation: "PYID DN",
      nightTrainNo: "207",
      nightDepTime: "21:54:00",
      nightArrTime: "00:15:00",
      nightTripTime: "02:21:00",
      nightHandoverLoc: "BIET DN PF",
      nightBreak: "04:00:00",
      nightKms: 62,
      mornKms: 51,
      takeoverLocation: "BIET DnPf",
      mornTrainNo: "203",
      mornDepTime: "04:15:00",
      mornArrTime: "06:43:00",
      mornTripTime: "02:28:00",
      mornHandoverLoc: "KGWA Up",
      signOffTime: "06:50:00",
      signOffLocation: "KGWA",
      totalKms: 113,
      dutyHrs: "09:15:00",
      drivingHrs: "04:49:00",
      breakTime: "04:00:00",
    },
  },
};

// ─── Set up transition pairs & aliases ───────────────────────────
if (!CHANGEOVER_TABLE["MONDAY__WEEKDAY"] && CHANGEOVER_TABLE["MONDAY_GH__WEEKDAY"]) {
  CHANGEOVER_TABLE["MONDAY__WEEKDAY"] = CHANGEOVER_TABLE["MONDAY_GH__WEEKDAY"];
}
if (!CHANGEOVER_TABLE["WEEKDAY__WEEKDAY"] && CHANGEOVER_TABLE["WEEKDAY__SATURDAY"]) {
  CHANGEOVER_TABLE["WEEKDAY__WEEKDAY"] = JSON.parse(JSON.stringify(CHANGEOVER_TABLE["WEEKDAY__SATURDAY"]));
}
if (!CHANGEOVER_TABLE["SATURDAY__SATURDAY"] && CHANGEOVER_TABLE["SATURDAY__SUNDAY"]) {
  CHANGEOVER_TABLE["SATURDAY__SATURDAY"] = JSON.parse(JSON.stringify(CHANGEOVER_TABLE["SATURDAY__SUNDAY"]));
}

// Standard Pre-Departure Check (PDC) requirement in minutes
export const PDC_DURATION_MINUTES = 40;

// Standard BMRCL Line 2 Stabling Locations & Terminals
export const STABLING_LOCATIONS = [
  { code: "DEPOT", name: "Peenya Depot (DEPOT)", line: "Line 2", isDepot: true },
  { code: "PYID",  name: "Peenya Industry (PYID)", line: "Line 2" },
  { code: "NGSA",  name: "Nagasandra (NGSA)", line: "Line 2" },
  { code: "BIET",  name: "Madavara / BIET", line: "Line 2" },
  { code: "KGWA",  name: "Majestic (KGWA)", line: "Line 2" },
  { code: "NLC",   name: "National College (NLC)", line: "Line 2" },
  { code: "RVR",   name: "RV Road (RVR)", line: "Line 2" },
  { code: "PUTH",  name: "Yelachenahalli (PUTH)", line: "Line 2" },
  { code: "APTS",  name: "Silk Institute / APTS", line: "Line 2" },
  { code: "YPM",   name: "Yeshwanthpur (YPM)", line: "Line 2" },
  { code: "RJNR",  name: "Rajajinagar (RJNR)", line: "Line 2" },
];

// Transit positioning minutes between Line 2 stabling points and induction stations
export const LINE2_TRANSIT_MINUTES_MAP = {
  "DEPOT__PYID": 10,
  "DEPOT__NGSA": 15,
  "DEPOT__BIET": 20,
  "DEPOT__YPM": 15,
  "DEPOT__RJNR": 20,
  "DEPOT__KGWA": 25,
  "DEPOT__NLC": 25,
  "DEPOT__RVR": 30,
  "DEPOT__PUTH": 30,
  "DEPOT__APTS": 35,

  "PYID__NGSA": 10,
  "PYID__BIET": 15,
  "PYID__KGWA": 20,
  "PYID__NLC": 25,
  "PYID__RVR": 30,
  "PYID__PUTH": 30,
  "PYID__APTS": 35,

  "NGSA__BIET": 10,
  "NGSA__KGWA": 25,
  "NGSA__PUTH": 35,
  "NGSA__APTS": 40,

  "KGWA__NLC": 10,
  "KGWA__RVR": 15,
  "KGWA__PUTH": 20,
  "KGWA__APTS": 25,
  "KGWA__NGSA": 25,
  "KGWA__PYID": 20,
  "KGWA__DEPOT": 25,

  "NLC__RVR": 10,
  "NLC__PUTH": 15,
  "NLC__APTS": 20,

  "RVR__PUTH": 10,
  "RVR__APTS": 15,

  "PUTH__APTS": 10,
};

export function cleanLocationCode(loc) {
  if (!loc) return "DEPOT";
  const s = String(loc).toUpperCase().trim().replace(/\s+(UP|DN|PF|ROAD|RD\d).*$/i, '').trim();
  if (s.includes('DEPOT') || s.includes('DPO')) return 'DEPOT';
  if (s.includes('PYID') || s.includes('PEENYA')) return 'PYID';
  if (s.includes('KGWA') || s.includes('MAJESTIC')) return 'KGWA';
  if (s.includes('PUTH') || s.includes('YELACH')) return 'PUTH';
  if (s.includes('NGSA') || s.includes('NAGA')) return 'NGSA';
  if (s.includes('APTS') || s.includes('SILK')) return 'APTS';
  if (s.includes('BIET') || s.includes('MADAV')) return 'BIET';
  if (s.includes('NLC')) return 'NLC';
  if (s.includes('RVR')) return 'RVR';
  if (s.includes('YPM')) return 'YPM';
  if (s.includes('RJNR')) return 'RJNR';
  return s;
}

export function getTransitMinutes(fromLoc, toLoc, customMap = null) {
  const f = cleanLocationCode(fromLoc);
  const t = cleanLocationCode(toLoc);
  if (!f || !t || f === t) return 0;

  const map = customMap || LINE2_TRANSIT_MINUTES_MAP;
  const k1 = `${f}__${t}`;
  const k2 = `${t}__${f}`;
  if (map[k1] !== undefined) return map[k1];
  if (map[k2] !== undefined) return map[k2];
  if (map[t] !== undefined) return map[t];
  if (map[f] !== undefined) return map[f];
  return 20; // Default Line 2 transit positioning time
}

/**
 * Searches WTT records for a morning train's first revenue service start time and induction station.
 */
export function findWttInductionForTrain(trainId, scheduleType = 'SATURDAY', wttList = null) {
  const normTrain = String(trainId || '').replace(/^T\s*/i, '').trim();
  if (!normTrain || normTrain === '--') return null;

  const registry = Array.isArray(wttList) && wttList.length > 0 ? wttList : WTT_MASTER_REGISTRY;
  const targetSched = String(scheduleType || 'SATURDAY').toUpperCase();

  const matchingRows = registry.filter(r => {
    const rTid = String(r.trainId || r.upTid || r.dnTid || '').trim();
    const rSched = String(r.scheduleType || '').toUpperCase();
    return rTid === normTrain && (rSched === targetSched || (targetSched === 'WEEKDAY' && rSched.includes('WEEK')));
  });

  if (!matchingRows.length) return null;

  let earliestSec = Infinity;
  let earliestTime = null;
  let inductionLoc = 'DEPOT';
  let loopRoute = '--';

  const timeRegex = /^([0-2]?\d):([0-5]\d)(?::([0-5]\d))?$/;

  matchingRows.forEach(row => {
    ['upTrip', 'downTrip'].forEach(tripKey => {
      const trip = row[tripKey];
      if (!trip || !trip.stations) return;
      Object.entries(trip.stations).forEach(([stn, val]) => {
        const str = String(val || '').trim();
        const m = str.match(timeRegex);
        if (m) {
          const h = parseInt(m[1], 10);
          const min = parseInt(m[2], 10);
          const s = m[3] ? parseInt(m[3], 10) : 0;
          const sec = h * 3600 + min * 60 + s;
          // Morning service induction window: 03:30 to 08:30
          if (sec >= 3.5 * 3600 && sec < 8.5 * 3600 && sec < earliestSec) {
            earliestSec = sec;
            earliestTime = str;
            inductionLoc = stn;
            loopRoute = trip.terminalLoopRoute || loopRoute;
          }
        }
      });
    });
  });

  if (!earliestTime) return null;

  return {
    trainId: normTrain,
    scheduleType: targetSched,
    revenueStartTime: earliestTime,
    inductionLocation: inductionLoc,
    terminalLoopRoute: loopRoute
  };
}

/**
 * Calculates dynamic Sign-On time based on WTT induction start time, stabling location, and 40-min PDC.
 */
export function calculateStablingAndPdcSignOn({
  trainId,
  stablingLocation,
  assignedStablingLocation,
  revenueStartTime,
  transitMinutesMap = null,
  targetScheduleType = 'SATURDAY',
  wttRegistry = null
}) {
  let revStart = revenueStartTime;
  let assignedStab = assignedStablingLocation;

  // Auto-resolve from WTT if revenueStartTime or assigned location is missing
  if ((!revStart || revStart === '--' || !assignedStab || assignedStab === '--') && trainId) {
    const wttHit = findWttInductionForTrain(trainId, targetScheduleType, wttRegistry);
    if (wttHit) {
      if (!revStart || revStart === '--') revStart = wttHit.revenueStartTime;
      if (!assignedStab || assignedStab === '--') assignedStab = wttHit.inductionLocation;
    }
  }

  if (!revStart || revStart === '--') {
    return {
      signOnTime: '--',
      pdcMinutes: PDC_DURATION_MINUTES,
      transitMinutes: 0,
      isAlternativeStabling: false,
      actualStablingLocation: stablingLocation || 'DEPOT',
      assignedStablingLocation: assignedStab || 'DEPOT',
      revenueStartTime: '--',
      calculatedByPdcEngine: false,
      calculationBreakdown: 'Missing revenue start time from WTT'
    };
  }

  const assignedCode = cleanLocationCode(assignedStab || 'DEPOT');
  const actualCode = cleanLocationCode(stablingLocation || assignedCode);
  const isAlternativeStabling = Boolean(stablingLocation && assignedCode !== actualCode);

  let transitMins = 0;
  if (isAlternativeStabling) {
    transitMins = getTransitMinutes(actualCode, assignedCode, transitMinutesMap);
  }

  const [h, m, s = 0] = String(revStart).split(':').map(Number);
  const revStartSecs = ((h || 0) * 3600) + ((m || 0) * 60) + (s || 0);

  const pdcSecs = PDC_DURATION_MINUTES * 60;
  const transitSecs = transitMins * 60;
  const totalOffsetSecs = pdcSecs + transitSecs;

  let signOnSecs = revStartSecs - totalOffsetSecs;
  if (signOnSecs < 0) signOnSecs += 86400; // Midnight boundary handling

  const hrs = Math.floor(signOnSecs / 3600) % 24;
  const mins = Math.floor((signOnSecs % 3600) / 60);
  const secs = signOnSecs % 60;
  const signOnTimeStr = [hrs, mins, secs].map(v => String(v).padStart(2, '0')).join(':');

  const breakdown = `WTT Rev Start: ${revStart} - ${PDC_DURATION_MINUTES}m PDC${isAlternativeStabling ? ` - ${transitMins}m Transit (${actualCode} ➔ ${assignedCode})` : ''} = S/ON ${signOnTimeStr}`;

  return {
    signOnTime: signOnTimeStr,
    pdcMinutes: PDC_DURATION_MINUTES,
    isAlternativeStabling,
    transitMinutes: transitMins,
    actualStablingLocation: actualCode,
    assignedStablingLocation: assignedCode,
    revenueStartTime: revStart,
    calculatedByPdcEngine: true,
    calculationBreakdown: breakdown
  };
}

/**
 * Automatically compiles changeover links across all transition pairs
 * when a new Link Roster is uploaded or modified.
 */
export function compileDynamicChangeoverLinks({
  fromDayType = 'WEEKDAY',
  toDayType = 'SATURDAY',
  linkRosterRows = [],
  stablingOverrides = {},
  wttRegistry = null
}) {
  const normFrom = String(fromDayType).toUpperCase();
  const normTo = String(toDayType).toUpperCase();
  const transitionKey = `${normFrom}__${normTo}`;

  const baseTable = CHANGEOVER_TABLE[transitionKey] || CHANGEOVER_TABLE[`${normFrom}__${normTo}`] || {};
  const compiledTable = {};

  if (Array.isArray(linkRosterRows) && linkRosterRows.length > 0) {
    const nightRows = linkRosterRows.filter(r => {
      const dNo = parseInt(String(r.dutyNo || r.dutyId || '').replace(/\D/g, ''), 10);
      return (dNo >= 50) || r.isNight || r.shift === 'N' || String(r.signOnTime || '').startsWith('21:') || String(r.signOnTime || '').startsWith('22:') || String(r.signOnTime || '').startsWith('20:');
    });

    nightRows.forEach(row => {
      const dutyId = String(row.dutyNo || row.dutyId || '').padStart(2, '0');
      const baseRow = baseTable[dutyId] || baseTable[String(Number(dutyId))] || {};

      const mornTrain = row.mornTrainNo || baseRow.mornTrainNo || (row.leg3TrainNo && row.leg3TrainNo !== '--' ? row.leg3TrainNo : row.leg2TrainNo) || row.trainId || '--';
      const assignedStab = row.takeoverLocation || baseRow.takeoverLocation || row.stablingLocation || (row.leg3DepLoc && row.leg3DepLoc !== '--' ? row.leg3DepLoc : row.leg2DepLoc) || 'DEPOT';
      const actualStab = stablingOverrides[dutyId] || stablingOverrides[mornTrain] || assignedStab;
      const revStart = row.mornDepTime || baseRow.mornDepTime || (row.leg3DepTime && row.leg3DepTime !== '--' ? row.leg3DepTime : row.leg2DepTime) || row.revStartTime || '05:30:00';
      const mornArr = row.mornArrTime || baseRow.mornArrTime || (row.leg3ArrTime && row.leg3ArrTime !== '--' ? row.leg3ArrTime : row.leg2ArrTime) || '--';
      const mornTrip = row.mornTripTime || baseRow.mornTripTime || (row.leg3TimeTo && row.leg3TimeTo !== '--' ? row.leg3TimeTo : row.leg2TimeTo) || '--';
      const mornLoc = row.mornHandoverLoc || baseRow.mornHandoverLoc || (row.leg3ArrLoc && row.leg3ArrLoc !== '--' ? row.leg3ArrLoc : row.leg2ArrLoc) || row.signOffLocation || '--';

      let computedMornKms = Number(row.mornKms || baseRow.mornKms || (Number(row.leg3Km) > 0 ? row.leg3Km : (Number(row.leg2Km) > 0 ? row.leg2Km : 0))) || 0;
      if (computedMornKms === 0 && mornTrain && mornTrain !== '--') {
        const dCalc = calculateDistance(actualStab, mornLoc || row.signOffLocation || 'PYID');
        if (dCalc > 0) computedMornKms = Math.round(dCalc);
      }
      if (dutyId === '69' || Number(dutyId) === 69) {
        computedMornKms = 7;
      }

      const pdcCalc = calculateStablingAndPdcSignOn({
        trainId: mornTrain,
        stablingLocation: actualStab,
        assignedStablingLocation: assignedStab,
        revenueStartTime: revStart,
        targetScheduleType: normTo,
        wttRegistry
      });

      compiledTable[dutyId] = {
        dutyNo: dutyId,
        fromDayType: normFrom,
        toDayType: normTo,
        signOnTime: row.signOnTime || baseRow.signOnTime || pdcCalc.signOnTime,
        signOnLocation: row.signOnLocation || baseRow.signOnLocation || actualStab,
        nightTrainNo: row.nightTrainNo || baseRow.nightTrainNo || row.leg1TrainNo || row.trainId || '--',
        nightDepTime: row.nightDepTime || baseRow.nightDepTime || row.leg1DepTime || '--',
        nightArrTime: row.nightArrTime || baseRow.nightArrTime || row.leg1ArrTime || '--',
        nightTripTime: row.nightTripTime || baseRow.nightTripTime || '--',
        nightHandoverLoc: row.nightHandoverLoc || baseRow.nightHandoverLoc || row.leg1HandoverLoc || '--',
        nightBreak: row.nightBreak || baseRow.nightBreak || '--',
        nightKms: Number(row.nightKms || baseRow.nightKms || row.leg1Km) || 0,
        mornKms: computedMornKms,
        takeoverLocation: actualStab,
        mornTrainNo: mornTrain,
        mornDepTime: pdcCalc.revenueStartTime || revStart,
        mornArrTime: mornArr,
        mornTripTime: mornTrip,
        mornHandoverLoc: mornLoc,
        signOffTime: row.signOffTime || baseRow.signOffTime || '--',
        signOffLocation: row.signOffLocation || baseRow.signOffLocation || '--',
        totalKms: (Number(row.nightKms || baseRow.nightKms) || 0) + computedMornKms,
        dutyHrs: row.dutyHrs || baseRow.dutyHrs || '--',
        drivingHrs: row.drivingHrs || baseRow.drivingHrs || '--',
        breakTime: row.breakTime || baseRow.breakTime || '--',
        isAlternativeStabling: pdcCalc.isAlternativeStabling,
        assignedStablingLocation: pdcCalc.assignedStablingLocation,
        actualStablingLocation: pdcCalc.actualStablingLocation,
        transitMinutes: pdcCalc.transitMinutes,
        pdcMinutes: pdcCalc.pdcMinutes,
        calculatedSignOnTime: pdcCalc.signOnTime,
        lastUpdated: new Date().toISOString()
      };
    });
  } else {
    Object.entries(baseTable).forEach(([dutyId, baseRow]) => {
      const mornTrain = baseRow.mornTrainNo || '--';
      const assignedStab = baseRow.takeoverLocation || 'DEPOT';
      const actualStab = stablingOverrides[dutyId] || stablingOverrides[mornTrain] || assignedStab;
      const revStart = baseRow.mornDepTime || '05:30:00';

      let computedMornKms = Number(baseRow.mornKms) || 0;
      if (computedMornKms === 0 && mornTrain && mornTrain !== '--') {
        const dCalc = calculateDistance(actualStab, baseRow.mornHandoverLoc || baseRow.signOffLocation || 'PYID');
        if (dCalc > 0) computedMornKms = Math.round(dCalc);
      }
      if (dutyId === '69' || Number(dutyId) === 69) {
        computedMornKms = 7;
      }

      const pdcCalc = calculateStablingAndPdcSignOn({
        trainId: mornTrain,
        stablingLocation: actualStab,
        assignedStablingLocation: assignedStab,
        revenueStartTime: revStart,
        targetScheduleType: normTo,
        wttRegistry
      });

      compiledTable[dutyId] = {
        ...baseRow,
        dutyNo: dutyId,
        fromDayType: normFrom,
        toDayType: normTo,
        mornKms: computedMornKms,
        totalKms: (Number(baseRow.nightKms) || 0) + computedMornKms,
        takeoverLocation: actualStab,
        isAlternativeStabling: pdcCalc.isAlternativeStabling,
        assignedStablingLocation: pdcCalc.assignedStablingLocation,
        actualStablingLocation: pdcCalc.actualStablingLocation,
        transitMinutes: pdcCalc.transitMinutes,
        pdcMinutes: pdcCalc.pdcMinutes,
        calculatedSignOnTime: pdcCalc.signOnTime,
        mornDepTime: pdcCalc.revenueStartTime || revStart,
        lastUpdated: new Date().toISOString()
      };
    });
  }

  enrichChangeoverTable({ [transitionKey]: compiledTable });

  if (!CHANGEOVER_TABLE[transitionKey]) {
    CHANGEOVER_TABLE[transitionKey] = {};
  }
  Object.assign(CHANGEOVER_TABLE[transitionKey], compiledTable);

  return compiledTable;
}

/**
 * Persists compiled changeover mappings to Firestore
 */
export async function saveCompiledChangeoverMappings(tableKey, compiledTable) {
  try {
    const docRef = doc(db, 'system_settings', 'changeover_mappings');
    await setDoc(docRef, { [tableKey]: compiledTable }, { merge: true });
    return true;
  } catch (err) {
    console.warn('Failed to persist compiled changeover mappings to Firestore:', err);
    return false;
  }
}

/**
 * Automatically syncs changeover transition matrices when a new Link Roster is uploaded.
 */
export async function syncLinkRosterWithChangeoverTransitions(uploadedScheduleType, uploadedDuties = []) {
  const normType = String(uploadedScheduleType || 'WEEKDAY').toUpperCase();
  const transitionPairsToUpdate = [];

  if (normType === 'WEEKDAY') {
    transitionPairsToUpdate.push(
      { from: 'WEEKDAY', to: 'SATURDAY' },
      { from: 'WEEKDAY', to: 'WEEKDAY' },
      { from: 'MONDAY', to: 'WEEKDAY' },
      { from: 'SATURDAY', to: 'WEEKDAY' }
    );
  } else if (normType === 'SATURDAY') {
    transitionPairsToUpdate.push(
      { from: 'WEEKDAY', to: 'SATURDAY' },
      { from: 'SATURDAY', to: 'SUNDAY' },
      { from: 'SATURDAY', to: 'SATURDAY' },
      { from: 'SATURDAY', to: 'WEEKDAY' }
    );
  } else if (normType === 'SUNDAY') {
    transitionPairsToUpdate.push(
      { from: 'SATURDAY', to: 'SUNDAY' },
      { from: 'SUNDAY', to: 'MONDAY' },
      { from: 'SUNDAY', to: 'MONDAY_GH' }
    );
  } else if (normType === 'MONDAY') {
    transitionPairsToUpdate.push(
      { from: 'SUNDAY', to: 'MONDAY' },
      { from: 'MONDAY', to: 'WEEKDAY' },
      { from: 'MONDAY_GH', to: 'WEEKDAY' }
    );
  }

  const updatedMappings = {};

  for (const pair of transitionPairsToUpdate) {
    const compiled = compileDynamicChangeoverLinks({
      fromDayType: pair.from,
      toDayType: pair.to,
      linkRosterRows: uploadedDuties
    });
    const key = `${pair.from}__${pair.to}`;
    updatedMappings[key] = compiled;
  }

  try {
    const docRef = doc(db, 'system_settings', 'changeover_mappings');
    await setDoc(docRef, updatedMappings, { merge: true });
  } catch (err) {
    console.warn('Could not save auto-synced changeover mappings to Firestore:', err);
  }

  return updatedMappings;
}

// ─── Helper: get the changeover table key ────────────────────────
export function getTableKey(currentDay, nextDay) {
  const cd = currentDay.toUpperCase();
  const nd = nextDay.toUpperCase();

  // Canonical key aliases
  if (cd === "MONDAY" && nd === "WEEKDAY") {
    if (CHANGEOVER_TABLE["MONDAY__WEEKDAY"]) return "MONDAY__WEEKDAY";
    return "MONDAY_GH__WEEKDAY";
  }

  return `${cd}__${nd}`;
}

// ─── Helper: check if trip is pure PDC (excluding Depo/No PDC) ───
export function isPdcTrip(str) {
  if (!str) return false;
  const s = String(str).toLowerCase();
  if (
    s.includes("no pdc") ||
    s.includes("nopdc") ||
    s.includes("no-pdc") ||
    s.includes("no_pdc")
  ) {
    return false; // Depo / No PDC -> RUNNING TRIP (KM Calculated!)
  }
  return s.includes("pdc");
}

// ─── Build an ACTIVE_RUN duty document from a changeover row ─────
function buildActiveRunDuty(coRow, existingCurrentDuty, operatorInfo, stablingOverride = null) {
  // Night side maps to leg1 + leg2 (existing link roster fields)
  // Morning side maps to leg3 (takeover train) fields

  let effectiveSignOnTime = coRow.signOnTime;
  let effectiveTakeoverLoc = coRow.takeoverLocation;
  let effectiveSignOnLoc = coRow.signOnLocation;
  let isAltStabling = Boolean(coRow.isAlternativeStabling);
  let transitMins = coRow.transitMinutes || 0;
  let pdcMins = PDC_DURATION_MINUTES;

  if (stablingOverride || isAltStabling) {
    const actualLoc = stablingOverride || coRow.actualStablingLocation || coRow.takeoverLocation;
    const assignedLoc = coRow.assignedStablingLocation || coRow.takeoverLocation || 'DEPOT';
    const pdcCalc = calculateStablingAndPdcSignOn({
      trainId: coRow.mornTrainNo,
      stablingLocation: actualLoc,
      assignedStablingLocation: assignedLoc,
      revenueStartTime: coRow.mornDepTime
    });

    if (pdcCalc.calculatedByPdcEngine) {
      effectiveSignOnTime = pdcCalc.signOnTime;
      effectiveTakeoverLoc = actualLoc;
      effectiveSignOnLoc = actualLoc;
      isAltStabling = pdcCalc.isAlternativeStabling;
      transitMins = pdcCalc.transitMinutes;
      pdcMins = pdcCalc.pdcMinutes;
    }
  }

  const nightDrivingSec = getLegDuration(
    coRow.nightDepTime,
    coRow.nightArrTime,
  );
  const mornDrivingSec = getLegDuration(coRow.mornDepTime, coRow.mornArrTime);
  const totalDrivingSec = nightDrivingSec + mornDrivingSec;

  const signOnSec = toSec(effectiveSignOnTime);
  const signOffSec = toSec(coRow.signOffTime);
  let workSec = signOffSec - signOnSec;
  if (workSec < 0) workSec += 86400;

  // Carry over existing formatting if present
  const baseFormatting = existingCurrentDuty?.formatting || {};

  const isMornPdc =
    isPdcTrip(coRow.mornTrainNo) || isPdcTrip(effectiveTakeoverLoc);
  const mornKmsVal = isMornPdc ? 0 : coRow.mornKms || 0;
  const totalKmsVal = coRow.totalKms || (coRow.nightKms || 0) + mornKmsVal;

  const empName =
    operatorInfo?.empName ||
    operatorInfo?.name ||
    coRow.empName ||
    coRow.name ||
    existingCurrentDuty?.empName ||
    existingCurrentDuty?.name ||
    "--";

  const empId =
    operatorInfo?.empId ||
    operatorInfo?.empNo ||
    coRow.empId ||
    coRow.empNo ||
    existingCurrentDuty?.empId ||
    existingCurrentDuty?.empNo ||
    "--";

  const status =
    operatorInfo?.status ||
    coRow.status ||
    existingCurrentDuty?.status ||
    "ACTIVE";

  return {
    // Identity
    scheduleType: "ACTIVE_RUN",
    dutyId: coRow.dutyNo,

    // Active On-Duty Night Shift Train Operator from DISPATCH GATEWAY CORE
    empName,
    name: empName,
    operatorName: empName,
    empId,
    empNo: empId,
    status,
    isSwapped: Boolean(
      operatorInfo?.isSwapped ||
      existingCurrentDuty?.isSwapped ||
      status === "SWAPPED_BY_CC" ||
      status === "SWAPPED"
    ),
    isExchanged: Boolean(
      operatorInfo?.isExchanged ||
      existingCurrentDuty?.isExchanged ||
      status === "EXCHANGED"
    ),
    swappedWith:
      operatorInfo?.swappedWith ||
      existingCurrentDuty?.swappedWith ||
      null,
    swappedDutyId:
      operatorInfo?.swappedDutyId ||
      existingCurrentDuty?.swappedDutyId ||
      null,
    shift: "N",
    isNight: true,

    // Sign On (from changeover night side or dynamic PDC calculation)
    signOnTime: effectiveSignOnTime,
    signOnLocation: effectiveSignOnLoc,
    trainId: String(coRow.nightTrainNo),

    // Leg 1 = night drive leg
    leg1TimeFrom: coRow.nightDepTime,
    leg1TimeTo: coRow.nightArrTime,
    leg1TripTime: coRow.nightTripTime || toTimeStr(nightDrivingSec),
    leg1HandoverLoc: coRow.nightHandoverLoc,

    // Leg 2 = break / idle (night handover → morning takeover)
    leg2DepLoc: coRow.nightHandoverLoc,
    leg2TrainNo: "--",
    leg2DepTime: coRow.nightArrTime,
    leg2ArrTime: coRow.mornDepTime,
    leg2TimeTo: coRow.nightBreak || "--",
    leg2ArrLoc: effectiveTakeoverLoc,

    // Leg 3 = morning takeover train
    leg3DepLoc: effectiveTakeoverLoc,
    leg3TrainNo: String(coRow.mornTrainNo),
    leg3DepTime: coRow.mornDepTime,
    leg3ArrTime: coRow.mornArrTime,
    leg3TimeTo: coRow.mornTripTime || toTimeStr(mornDrivingSec),
    leg3ArrLoc: coRow.mornHandoverLoc || coRow.signOffLocation,

    // Leg 4 (not applicable for standard changeover)
    leg4FinalDepLoc: "--",
    leg4TrainNo: "--",
    leg4FinalDepTime: "--",
    leg4FinalArrTime: "--",
    leg4TimeTo: "--",
    leg4FinalArrLoc: "--",

    // Sign Off
    signOffTime: coRow.signOffTime,
    signOffLocation: coRow.signOffLocation,

    // KMs (Dynamically computed from WTT & Changeover table)
    nightKms: coRow.nightKms || 0,
    mornKms: mornKmsVal,
    totalKms: totalKmsVal,
    leg1Km: coRow.nightKms || 0,
    leg2Km: 0,
    leg3Km: mornKmsVal,
    leg4Km: 0,
    totalKm: totalKmsVal,

    // PDC and Stabling metadata
    isAlternativeStabling: isAltStabling,
    transitMinutes: transitMins,
    pdcMinutes: pdcMins,
    stablingLocation: effectiveTakeoverLoc,
    assignedStablingLocation: coRow.assignedStablingLocation || coRow.takeoverLocation || 'DEPOT',

    // Calculated hours & swap/exchange remarks
    remarks:
      operatorInfo?.remarks ||
      existingCurrentDuty?.remarks ||
      (totalDrivingSec > 0
        ? toTimeStr(totalDrivingSec)
        : coRow.drivingHrs || "--"),
    totalHours: workSec > 0 ? toTimeStr(workSec) : coRow.dutyHrs || "--",

    // Preserve existing cell formatting from the base link roster
    formatting: baseFormatting,

    lastModified: new Date().toISOString(),
  };
}

// ─── Auto-Enrichment Helper for Changeover Metrics ─────────────
export function enrichChangeoverTable(tableObj) {
  if (!tableObj || typeof tableObj !== "object") return tableObj;
  Object.keys(tableObj).forEach((key) => {
    const subObj = tableObj[key];
    if (subObj && typeof subObj === "object") {
      if (subObj.signOnTime || subObj.nightDepTime) {
        enrichRow(subObj);
      } else {
        Object.keys(subObj).forEach((dNo) => {
          if (subObj[dNo] && typeof subObj[dNo] === "object") {
            enrichRow(subObj[dNo]);
          }
        });
      }
    }
  });
  return tableObj;
}

function enrichRow(row) {
  let nK = Number(row.nightKms) || 0;
  let mK = Number(row.mornKms) || 0;

  // Station Integrity Protocol for Duty 69 Leg 3: Morning Run
  // Train #217 from BIET_BE (Buffer End SRMB) (-9.560 KM) to PYID (-3.020 KM)
  // Precise: 6.540 KM -> Round off: 7 KM
  if (String(row.dutyNo) === '69') {
    mK = 7;
    row.mornKms = 7;
    row.takeoverLocation = (row.takeoverLocation && row.takeoverLocation !== '--') ? row.takeoverLocation : 'BIET DnBE';
    row.mornTrainNo = (row.mornTrainNo && row.mornTrainNo !== '--') ? row.mornTrainNo : '217';
    row.mornDepTime = (row.mornDepTime && row.mornDepTime !== '--') ? row.mornDepTime : '06:30:00';
    row.mornArrTime = (row.mornArrTime && row.mornArrTime !== '--') ? row.mornArrTime : '07:27:00';
    row.mornTripTime = (row.mornTripTime && row.mornTripTime !== '--') ? row.mornTripTime : '00:57:00';
    row.mornHandoverLoc = (row.mornHandoverLoc && row.mornHandoverLoc !== '--') ? row.mornHandoverLoc : 'PYID Dn';
    row.signOffTime = (row.signOffTime && row.signOffTime !== '--') ? row.signOffTime : '07:30:00';
    row.signOffLocation = (row.signOffLocation && row.signOffLocation !== '--') ? row.signOffLocation : 'PYID';
  } else if (mK === 0 && row.mornTrainNo && row.mornTrainNo !== '--') {
    const fromLoc = row.takeoverLocation;
    const toLoc = row.mornHandoverLoc || row.signOffLocation || 'PYID';
    if (fromLoc && toLoc) {
      const d = calculateDistance(fromLoc, toLoc);
      if (d > 0) {
        mK = Math.round(d);
        row.mornKms = mK;
      }
    }
  }

  row.totalKms = nK + mK;

  const nDep = toSec(row.nightDepTime);
  const nArr = toSec(row.nightArrTime);
  let nTrip = -1;
  if (nDep >= 0 && nArr >= 0) {
    nTrip = nArr < nDep ? nArr + 86400 - nDep : nArr - nDep;
  }
  if (!row.nightTripTime || row.nightTripTime === "--") {
    row.nightTripTime = toTimeStr(nTrip);
  }

  const mDep = toSec(row.mornDepTime);
  const mArr = toSec(row.mornArrTime);
  let mTrip = -1;
  if (mDep >= 0 && mArr >= 0) {
    mTrip = mArr < mDep ? mArr + 86400 - mDep : mArr - mDep;
  }
  if (!row.mornTripTime || row.mornTripTime === "--") {
    row.mornTripTime = toTimeStr(mTrip);
  }

  if (!row.nightBreak || row.nightBreak === "--") {
    if (nArr >= 0 && mDep >= 0) {
      let rBreak = mDep < nArr ? mDep + 86400 - nArr : mDep - nArr;
      row.nightBreak = toTimeStr(rBreak);
    }
  }

  const sOn = toSec(row.signOnTime);
  const sOff = toSec(row.signOffTime);
  let dHrs = -1;
  if (sOn >= 0 && sOff >= 0) {
    dHrs = sOff < sOn ? sOff + 86400 - sOn : sOff - sOn;
  }
  if (!row.dutyHrs || row.dutyHrs === "--") {
    row.dutyHrs = toTimeStr(dHrs);
  }

  let drSecs = -1;
  if (nTrip >= 0 || mTrip >= 0) {
    drSecs = (nTrip > 0 ? nTrip : 0) + (mTrip > 0 ? mTrip : 0);
  }
  if (!row.drivingHrs || row.drivingHrs === "--") {
    row.drivingHrs = toTimeStr(drSecs);
  }

  if (!row.breakTime || row.breakTime === "--") {
    if (dHrs >= 0 && drSecs >= 0) {
      row.breakTime = toTimeStr(Math.max(0, dHrs - drSecs));
    }
  }
}

// Auto-run enrichment on default CHANGEOVER_TABLE
enrichChangeoverTable(CHANGEOVER_TABLE);

export function getChangeoverMappings() {
  return enrichChangeoverTable(CHANGEOVER_TABLE);
}

// ─── Main export ─────────────────────────────────────────────────
export const triggerChangeover = async (currentDay, nextDay, operatorAssignments = {}, stablingOverrides = {}) => {
  const tableKey = getTableKey(currentDay, nextDay);
  const coTable = CHANGEOVER_TABLE[tableKey];

  if (!coTable) {
    const allKeys = [
      ...Object.keys(CHANGEOVER_TABLE).map((k) => k.replace("__", "→")),
      "MONDAY→WEEKDAY (alias → MONDAY_GH→WEEKDAY)",
    ].join(", ");
    throw new Error(
      `No changeover table found for: ${currentDay} → ${nextDay} (resolved key: ${tableKey}).\n` +
        `Supported combinations: ${allKeys}`,
    );
  }

  // ── 1. Fetch the current-day base roster (to carry over formatting / day duties) ──
  const currentSnap = await getDocs(
    query(
      collection(db, "crew_final_links"),
      where("scheduleType", "==", currentDay),
    ),
  );
  const currentDutyMap = {};
  currentSnap.docs.forEach((d) => {
    const data = d.data();
    currentDutyMap[String(data.dutyId).padStart(2, "0")] = {
      id: d.id,
      ...data,
    };
  });

  // ── 2. Delete all existing ACTIVE_RUN duties ──
  const activeSnap = await getDocs(
    query(
      collection(db, "crew_final_links"),
      where("scheduleType", "==", "ACTIVE_RUN"),
    ),
  );
  const deleteBatch = writeBatch(db);
  activeSnap.docs.forEach((d) => deleteBatch.delete(d.ref));

  // Also clean up any prior ACTIVE_RUN deployments in crew_daily_deployment
  try {
    const priorDeploySnap = await getDocs(
      query(
        collection(db, "crew_daily_deployment"),
        where("scheduleType", "==", "ACTIVE_RUN"),
      ),
    );
    priorDeploySnap.docs.forEach((d) => deleteBatch.delete(d.ref));
  } catch (e) {
    console.warn("Could not query prior ACTIVE_RUN deployments:", e);
  }
  await deleteBatch.commit();

  // ── 3. Build new ACTIVE_RUN duties ──
  const writeBatchInst = writeBatch(db);

  // (a) Night changeover duties — built from the Excel table with active Night Train Operator and 40-min PDC calculation
  const changeoverDutyIds = new Set();
  Object.entries(coTable).forEach(([dutyNo, coRow]) => {
    changeoverDutyIds.add(dutyNo);
    const existingCurrentDuty = currentDutyMap[dutyNo];
    const op =
      operatorAssignments[dutyNo] ||
      operatorAssignments[String(Number(dutyNo))] ||
      operatorAssignments[String(dutyNo).padStart(2, "0")] ||
      {};

    const stablingOverride = stablingOverrides[dutyNo] || stablingOverrides[String(Number(dutyNo))] || null;

    const finalDuty = buildActiveRunDuty(
      { ...coRow, dutyNo },
      existingCurrentDuty,
      op,
      stablingOverride
    );
    const docId = `link_active_run_duty_${dutyNo}`;
    writeBatchInst.set(doc(db, "crew_final_links", docId), finalDuty);

    // Sync ACTIVE_RUN with Night Shift Train Operator into crew_daily_deployment
    const depPayload = {
      dutyId: String(dutyNo).padStart(2, "0"),
      scheduleType: "ACTIVE_RUN",
      dutyType: `NIGHT_CHANGEOVER_${dutyNo}`,
      signOnTime: finalDuty.signOnTime || coRow.signOnTime,
      signOffTime: finalDuty.signOffTime || coRow.signOffTime,
      signOnLocation: finalDuty.signOnLocation || coRow.signOnLocation,
      signOffLocation: finalDuty.signOffLocation || coRow.signOffLocation,
      trainId: String(coRow.nightTrainNo),
      empName: finalDuty.empName || "--",
      name: finalDuty.empName || "--",
      empId: finalDuty.empId || "--",
      empNo: finalDuty.empId || "--",
      status: finalDuty.status || "ACTIVE",
      isSwapped: Boolean(finalDuty.isSwapped),
      isExchanged: Boolean(finalDuty.isExchanged),
      swappedWith: finalDuty.swappedWith || null,
      swappedDutyId: finalDuty.swappedDutyId || null,
      remarks: finalDuty.remarks || null,
      shift: "N",
      isNight: true,
      autoDeployed: true,
      isLocked: true,
      isAlternativeStabling: Boolean(finalDuty.isAlternativeStabling),
      transitMinutes: finalDuty.transitMinutes || 0,
      pdcMinutes: finalDuty.pdcMinutes || PDC_DURATION_MINUTES,
      lastUpdated: serverTimestamp(),
    };

    const depDocId = `gcc_deploy_active_run_duty_${String(dutyNo).padStart(2, "0")}`;
    writeBatchInst.set(
      doc(db, "crew_daily_deployment", depDocId),
      depPayload,
      { merge: true },
    );

    const unpaddedDepDocId = `gcc_deploy_active_run_duty_${String(Number(dutyNo))}`;
    if (unpaddedDepDocId !== depDocId) {
      writeBatchInst.set(
        doc(db, "crew_daily_deployment", unpaddedDepDocId),
        depPayload,
        { merge: true },
      );
    }
  });

  // (b) Day duties from current-day roster (not in the changeover table) — kept as-is
  Object.entries(currentDutyMap).forEach(([dutyNo, dutyData]) => {
    if (changeoverDutyIds.has(dutyNo)) return; // already handled above
    const finalDuty = {
      ...dutyData,
      scheduleType: "ACTIVE_RUN",
      lastModified: new Date().toISOString(),
    };
    const docId = `link_active_run_duty_${dutyNo}`;
    writeBatchInst.set(doc(db, "crew_final_links", docId), finalDuty);
  });

  await writeBatchInst.commit();

  // ── 4. Update system settings ──
  const nowOperationalDate = new Date().toLocaleDateString("en-CA", {
    timeZone: "Asia/Kolkata",
  });
  await setDoc(
    doc(db, "system_settings", "active_roster_config"),
    {
      activeDeploymentId: `${nowOperationalDate}_${currentDay}`,
      activeDeploymentDate: nowOperationalDate,
      activeDayType: "ACTIVE_RUN",
      currentDay: currentDay,
      nextDay: nextDay,
      lastChangeover: serverTimestamp(),
      updatedAt: new Date().toISOString(),
    },
    { merge: true },
  );

  // ── 5. Write audit log ──
  await addDoc(collection(db, "auditLogs"), {
    action: "SCHEDULE_CHANGEOVER",
    from: `${currentDay} Night`,
    to: `${nextDay} Morning`,
    tableKey: tableKey,
    nightDuties: Object.keys(coTable).length,
    timestamp: serverTimestamp(),
    performedBy: "System Admin",
  });

  return `ACTIVE_RUN (${currentDay} ➔ ${nextDay}) — ${Object.keys(coTable).length} night duties merged with DISPATCH GATEWAY CORE active operators and 40-min PDC validation`;
};

export const revertToNormalRoster = async () => {
  // Delete all ACTIVE_RUN duties
  const activeSnap = await getDocs(
    query(
      collection(db, "crew_final_links"),
      where("scheduleType", "==", "ACTIVE_RUN"),
    ),
  );
  const deleteBatch = writeBatch(db);
  activeSnap.docs.forEach((d) => deleteBatch.delete(d.ref));

  // Also delete ACTIVE_RUN from crew_daily_deployment
  try {
    const activeDeploySnap = await getDocs(
      query(
        collection(db, "crew_daily_deployment"),
        where("scheduleType", "==", "ACTIVE_RUN"),
      ),
    );
    activeDeploySnap.docs.forEach((d) => deleteBatch.delete(d.ref));
  } catch (err) {
    console.warn("Could not delete ACTIVE_RUN from crew_daily_deployment:", err);
  }

  await deleteBatch.commit();

  // Reset active_roster_config
  const revertOperationalDate = new Date().toLocaleDateString("en-CA", {
    timeZone: "Asia/Kolkata",
  });
  await setDoc(
    doc(db, "system_settings", "active_roster_config"),
    {
      activeDeploymentId: `${revertOperationalDate}_WEEKDAY`,
      activeDeploymentDate: revertOperationalDate,
      activeDayType: "WEEKDAY",
      currentDay: "WEEKDAY",
      nextDay: "SATURDAY",
      lastRevert: serverTimestamp(),
      updatedAt: new Date().toISOString(),
    },
    { merge: true },
  );

  await addDoc(collection(db, "auditLogs"), {
    action: "REVERT_CHANGEOVER",
    timestamp: serverTimestamp(),
    performedBy: "System Admin",
  });

  return "Roster successfully reverted back to standard timetable schedule.";
};
