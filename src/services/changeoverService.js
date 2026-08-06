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
  doc, setDoc, collection, addDoc, getDocs,
  writeBatch, query, where, serverTimestamp
} from 'firebase/firestore';
import { db } from '../firebase';

// ─── Time helpers ────────────────────────────────────────────────
const toSec = (tStr) => {
  if (!tStr || tStr === '--' || tStr === '-' || tStr === '') return -1;
  const parts = String(tStr).split(':').map(Number);
  if (parts.some(isNaN)) return -1;
  return parts[0] * 3600 + parts[1] * 60 + (parts[2] || 0);
};

const toTimeStr = (sec) => {
  if (sec < 0) return '--';
  const hrs = Math.floor(sec / 3600);
  const mins = Math.floor((sec % 3600) / 60);
  const secs = sec % 60;
  return [hrs, mins, secs].map(v => String(v).padStart(2, '0')).join(':');
};

const getLegDuration = (dep, arr) => {
  const d = toSec(dep), a = toSec(arr);
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
  // (Row 2 left section of Excel)
  // ══════════════════════════════════════════════════════════════
  "WEEKDAY__SATURDAY": {
    "64": { signOnTime:"21:08:00", signOnLocation:"PUTH Dn", nightTrainNo:"204", nightDepTime:"21:17:00", nightArrTime:"00:10:00", nightTripTime:"02:53:00", nightHandoverLoc:"APTS Dn", nightBreak:"04:25:00", nightKms:75, mornKms:41, takeoverLocation:"APTS DN", mornTrainNo:"210", mornDepTime:"04:35:00", mornArrTime:"06:47:00", mornTripTime:"02:12:00", mornHandoverLoc:"PYID DN", signOffTime:"06:53:00", signOffLocation:"PYID", totalKms:116, dutyHrs:"09:41:00", drivingHrs:"05:05:00", breakTime:"04:25:00" },
    "65": { signOnTime:"21:30:00", signOnLocation:"PYID Up", nightTrainNo:"213", nightDepTime:"21:43:00", nightArrTime:"23:58:00", nightTripTime:"02:15:00", nightHandoverLoc:"NLC Up", nightBreak:"04:22:00", nightKms:55, mornKms:38, takeoverLocation:"NLC UP PF", mornTrainNo:"207", mornDepTime:"04:20:00", mornArrTime:"06:30:00", mornTripTime:"02:10:00", mornHandoverLoc:"KGWA DN", signOffTime:"06:35:00", signOffLocation:"KGWA", totalKms:93, dutyHrs:"09:05:00", drivingHrs:"04:25:00", breakTime:"04:22:00" },
    "66": { signOnTime:"21:20:00", signOnLocation:"PYID Dn", nightTrainNo:"211", nightDepTime:"21:34:00", nightArrTime:"23:57:00", nightTripTime:"02:23:00", nightHandoverLoc:"PUTH Dn", nightBreak:"04:43:00", nightKms:61, mornKms:47, takeoverLocation:"PUTH Dn", mornTrainNo:"211", mornDepTime:"04:40:00", mornArrTime:"06:57:00", mornTripTime:"02:17:00", mornHandoverLoc:"PYID Dn", signOffTime:"07:00:00", signOffLocation:"PYID", totalKms:108, dutyHrs:"09:40:00", drivingHrs:"04:40:00", breakTime:"04:43:00" },
    "67": { signOnTime:"21:10:00", signOnLocation:"PYID Up", nightTrainNo:"217", nightDepTime:"21:26:00", nightArrTime:"23:40:00", nightTripTime:"02:14:00", nightHandoverLoc:"APTS Up", nightBreak:"04:50:00", nightKms:54, mornKms:38, takeoverLocation:"APTS UP", mornTrainNo:"209", mornDepTime:"04:30:00", mornArrTime:"06:37:00", mornTripTime:"02:07:00", mornHandoverLoc:"PYID Dn", signOffTime:"06:45:00", signOffLocation:"PYID", totalKms:92, dutyHrs:"09:35:00", drivingHrs:"04:21:00", breakTime:"04:50:00" },
    "68": { signOnTime:"21:25:00", signOnLocation:"PUTH Up", nightTrainNo:"208", nightDepTime:"21:40:00", nightArrTime:"23:45:00", nightTripTime:"02:05:00", nightHandoverLoc:"PUTH Up", nightBreak:"04:30:00", nightKms:50, mornKms:34, takeoverLocation:"PUTH Up", mornTrainNo:"208", mornDepTime:"04:15:00", mornArrTime:"06:27:00", mornTripTime:"02:12:00", mornHandoverLoc:"PYID Dn", signOffTime:"06:30:00", signOffLocation:"PYID", totalKms:84, dutyHrs:"09:05:00", drivingHrs:"04:17:00", breakTime:"04:30:00" },
    "69": { signOnTime:"21:15:00", signOnLocation:"PUTH Dn", nightTrainNo:"201", nightDepTime:"21:28:00", nightArrTime:"23:30:00", nightTripTime:"02:02:00", nightHandoverLoc:"B DHO", nightBreak:"06:00:00", nightKms:48, mornKms:0, takeoverLocation:"Depot/CC", mornTrainNo:"Ntest", mornDepTime:"00:40:00", mornArrTime:"06:00:00", mornTripTime:"05:20:00", mornHandoverLoc:"Depot", signOffTime:"06:05:00", signOffLocation:"Depot", totalKms:48, dutyHrs:"08:50:00", drivingHrs:"07:22:00", breakTime:"00:06:00" },
    "70": { signOnTime:"21:05:00", signOnLocation:"KGWA Dn", nightTrainNo:"205", nightDepTime:"21:14:00", nightArrTime:"00:07:00", nightTripTime:"02:53:00", nightHandoverLoc:"B DHO", nightBreak:"00:18:00", nightKms:61, mornKms:0, takeoverLocation:"Depot/CC", mornTrainNo:"Ntest", mornDepTime:"00:27:00", mornArrTime:"06:00:00", mornTripTime:"05:33:00", mornHandoverLoc:"Depot", signOffTime:"06:05:00", signOffLocation:"Depot", totalKms:61, dutyHrs:"09:00:00", drivingHrs:"08:26:00", breakTime:"00:18:00" },
    "71": { signOnTime:"21:20:00", signOnLocation:"PYID Dn", nightTrainNo:"202", nightDepTime:"21:37:00", nightArrTime:"00:02:00", nightTripTime:"02:25:00", nightHandoverLoc:"BIET-NGSA Pilot", nightBreak:"04:13:00", nightKms:75, mornKms:10, takeoverLocation:"After Stebling go to Depot", mornTrainNo:"206", mornDepTime:"--", mornArrTime:"--", mornTripTime:"--", mornHandoverLoc:"--", signOffTime:"--", signOffLocation:"--", totalKms:75, dutyHrs:"--", drivingHrs:"--", breakTime:"04:13:00" },
    "72": { signOnTime:"21:30:00", signOnLocation:"KGWA Dn", nightTrainNo:"203", nightDepTime:"21:47:00", nightArrTime:"00:05:00", nightTripTime:"02:18:00", nightHandoverLoc:"B DHO", nightBreak:"04:00:00", nightKms:65, mornKms:0, takeoverLocation:"PDC 214; 215; 216", mornTrainNo:"--", mornDepTime:"05:30:00", mornArrTime:"07:00:00", mornTripTime:"01:30:00", mornHandoverLoc:"PYID", signOffTime:"07:05:00", signOffLocation:"PYID", totalKms:65, dutyHrs:"09:35:00", drivingHrs:"03:48:00", breakTime:"04:00:00" },
    "73": { signOnTime:"21:20:00", signOnLocation:"KGWA Up", nightTrainNo:"206", nightDepTime:"21:32:00", nightArrTime:"23:47:00", nightTripTime:"02:15:00", nightHandoverLoc:"APTS Up", nightBreak:"04:43:00", nightKms:54, mornKms:40, takeoverLocation:"APTS Up", mornTrainNo:"209", mornDepTime:"04:30:00", mornArrTime:"06:37:00", mornTripTime:"02:07:00", mornHandoverLoc:"PYID Dn", signOffTime:"06:40:00", signOffLocation:"PYID", totalKms:94, dutyHrs:"09:20:00", drivingHrs:"04:22:00", breakTime:"04:43:00" },
    "74": { signOnTime:"21:30:00", signOnLocation:"PYID Dn", nightTrainNo:"219", nightDepTime:"21:44:00", nightArrTime:"23:45:00", nightTripTime:"02:01:00", nightHandoverLoc:"JIDL Up", nightBreak:"04:25:00", nightKms:64, mornKms:55, takeoverLocation:"JIDL Up", mornTrainNo:"205", mornDepTime:"04:45:00", mornArrTime:"07:13:00", mornTripTime:"02:28:00", mornHandoverLoc:"KGWA Up", signOffTime:"07:20:00", signOffLocation:"KGWA", totalKms:119, dutyHrs:"09:50:00", drivingHrs:"04:29:00", breakTime:"04:25:00" },
    "75": { signOnTime:"21:40:00", signOnLocation:"KGWA Up", nightTrainNo:"216", nightDepTime:"21:56:00", nightArrTime:"23:57:00", nightTripTime:"02:01:00", nightHandoverLoc:"BIET Dn NF", nightBreak:"04:18:00", nightKms:62, mornKms:51, takeoverLocation:"BIET DnPf", mornTrainNo:"203", mornDepTime:"04:15:00", mornArrTime:"06:43:00", mornTripTime:"02:28:00", mornHandoverLoc:"KGWA Up", signOffTime:"06:50:00", signOffLocation:"KGWA", totalKms:113, dutyHrs:"09:10:00", drivingHrs:"04:29:00", breakTime:"04:18:00" },
    "76": { signOnTime:"21:40:00", signOnLocation:"KGWA Up", nightTrainNo:"209", nightDepTime:"21:56:00", nightArrTime:"23:30:00", nightTripTime:"01:34:00", nightHandoverLoc:"B DHO", nightBreak:"00:30:00", nightKms:15, mornKms:7, takeoverLocation:"BIET DnBE", mornTrainNo:"217", mornDepTime:"06:30:00", mornArrTime:"07:27:00", mornTripTime:"00:57:00", mornHandoverLoc:"PYID Dn", signOffTime:"07:30:00", signOffLocation:"PYID", totalKms:22, dutyHrs:"09:50:00", drivingHrs:"02:31:00", breakTime:"06:30:00" },
    "77": { signOnTime:"21:40:00", signOnLocation:"KGWA Up", nightTrainNo:"212", nightDepTime:"21:56:00", nightArrTime:"23:30:00", nightTripTime:"01:34:00", nightHandoverLoc:"B DHO/Depot", nightBreak:"04:45:00", nightKms:15, mornKms:26, takeoverLocation:"Depo - JHLI Trn Bk", mornTrainNo:"206", mornDepTime:"04:15:00", mornArrTime:"06:15:00", mornTripTime:"02:00:00", mornHandoverLoc:"KGWA Dn", signOffTime:"06:20:00", signOffLocation:"KGWA", totalKms:41, dutyHrs:"08:40:00", drivingHrs:"03:34:00", breakTime:"04:45:00" },
  },

  // ══════════════════════════════════════════════════════════════
  // SATURDAY Night  ➔  SUNDAY Morning
  // ══════════════════════════════════════════════════════════════
  "SATURDAY__SUNDAY": {
    "59": { signOnTime:"21:15:00", signOnLocation:"KGWA Dn", nightTrainNo:"208", nightDepTime:"21:32:00", nightArrTime:"00:15:00", nightHandoverLoc:"APTS Dn", nightKms:74, mornKms:41, takeoverLocation:"APTS Dn", mornTrainNo:"210", mornDepTime:"04:47:00", mornArrTime:"06:47:00", signOffTime:"06:50:00", signOffLocation:"PYID" },
    "60": { signOnTime:"21:25:00", signOnLocation:"KGWA Up", nightTrainNo:"218", nightDepTime:"21:42:00", nightArrTime:"23:50:00", nightHandoverLoc:"PUTH Up", nightKms:58, mornKms:34, takeoverLocation:"PUTH Up", mornTrainNo:"208", mornDepTime:"04:15:00", mornArrTime:"06:27:00", signOffTime:"06:30:00", signOffLocation:"PYID" },
    "61": { signOnTime:"21:30:00", signOnLocation:"PYID", nightTrainNo:"209", nightDepTime:"21:45:00", nightArrTime:"23:45:00", nightHandoverLoc:"NLC Up", nightKms:54, mornKms:38, takeoverLocation:"NLC Up", mornTrainNo:"207", mornDepTime:"04:20:00", mornArrTime:"06:30:00", signOffTime:"06:35:00", signOffLocation:"KGWA" },
    "62": { signOnTime:"21:15:00", signOnLocation:"PUTH Up", nightTrainNo:"220", nightDepTime:"21:30:00", nightArrTime:"00:10:00", nightHandoverLoc:"PUTH Dn", nightKms:69, mornKms:47, takeoverLocation:"PUTH Dn", mornTrainNo:"211", mornDepTime:"04:40:00", mornArrTime:"06:57:00", signOffTime:"07:00:00", signOffLocation:"PYID" },
    "63": { signOnTime:"21:35:00", signOnLocation:"PUTH Up", nightTrainNo:"203", nightDepTime:"21:50:00", nightArrTime:"00:15:00", nightHandoverLoc:"APTS Up", nightKms:62, mornKms:40, takeoverLocation:"APTS Up", mornTrainNo:"209", mornDepTime:"04:30:00", mornArrTime:"06:37:00", signOffTime:"06:40:00", signOffLocation:"PYID" },
    "64": { signOnTime:"21:05:00", signOnLocation:"KGWA Dn", nightTrainNo:"221", nightDepTime:"21:22:00", nightArrTime:"23:15:00", nightHandoverLoc:"BT Dn B/E", nightKms:51, mornKms:7, takeoverLocation:"BIET DnBE", mornTrainNo:"217", mornDepTime:"06:30:00", mornArrTime:"07:27:00", signOffTime:"07:30:00", signOffLocation:"PYID" },
    "65": { signOnTime:"21:15:00", signOnLocation:"KGWA Dn", nightTrainNo:"210", nightDepTime:"21:32:00", nightArrTime:"00:00:00", nightHandoverLoc:"B DHO", nightKms:59, mornKms:0, takeoverLocation:"Depot/CC", mornTrainNo:"Ntest", mornDepTime:"00:40:00", mornArrTime:"06:00:00", signOffTime:"06:05:00", signOffLocation:"Depot" },
    "66": { signOnTime:"21:15:00", signOnLocation:"KGWA Up", nightTrainNo:"211", nightDepTime:"21:34:00", nightArrTime:"22:30:00", nightHandoverLoc:"N PKT", nightKms:15, mornKms:0, takeoverLocation:"PDC 213;214;215", mornTrainNo:"--", mornDepTime:"05:30:00", mornArrTime:"07:00:00", signOffTime:"07:05:00", signOffLocation:"PYID" },
    "67": { signOnTime:"21:20:00", signOnLocation:"PYID Dn", nightTrainNo:"216", nightDepTime:"21:34:00", nightArrTime:"23:55:00", nightHandoverLoc:"NG Dn PF", nightKms:65, mornKms:59, takeoverLocation:"NGSA DnPf", mornTrainNo:"202", mornDepTime:"04:00:00", mornArrTime:"06:48:00", signOffTime:"06:55:00", signOffLocation:"PYID" },
    "68": { signOnTime:"21:20:00", signOnLocation:"PYID", nightTrainNo:"217", nightDepTime:"21:35:00", nightArrTime:"00:15:00", nightHandoverLoc:"BIET Up PF", nightKms:74, mornKms:51, takeoverLocation:"BIET UpPf", mornTrainNo:"204", mornDepTime:"04:45:00", mornArrTime:"06:58:00", signOffTime:"07:05:00", signOffLocation:"KGWA" },
    "69": { signOnTime:"21:25:00", signOnLocation:"PUTH Up", nightTrainNo:"201", nightDepTime:"21:40:00", nightArrTime:"23:30:00", nightHandoverLoc:"B DHO", nightKms:36, mornKms:26, takeoverLocation:"Depot", mornTrainNo:"206", mornDepTime:"04:15:00", mornArrTime:"06:15:00", signOffTime:"06:20:00", signOffLocation:"KGWA" },
    "70": { signOnTime:"21:25:00", signOnLocation:"KGWA Dn", nightTrainNo:"202", nightDepTime:"21:42:00", nightArrTime:"00:00:00", nightHandoverLoc:"SPGD/Depot", nightKms:68, mornKms:45, takeoverLocation:"SPGD DnPf", mornTrainNo:"201", mornDepTime:"04:25:00", mornArrTime:"06:33:00", signOffTime:"06:40:00", signOffLocation:"PYID" },
    "71": { signOnTime:"21:30:00", signOnLocation:"PYID Dn", nightTrainNo:"206", nightDepTime:"21:44:00", nightArrTime:"00:20:00", nightHandoverLoc:"JIDL Up PF", nightKms:60, mornKms:55, takeoverLocation:"JIDL UpPf", mornTrainNo:"205", mornDepTime:"04:45:00", mornArrTime:"07:13:00", signOffTime:"07:20:00", signOffLocation:"KGWA" },
    "72": { signOnTime:"21:35:00", signOnLocation:"PYID Dn", nightTrainNo:"207", nightDepTime:"21:54:00", nightArrTime:"00:15:00", nightHandoverLoc:"BIET Dn PF", nightKms:62, mornKms:51, takeoverLocation:"BIET DnPf", mornTrainNo:"203", mornDepTime:"04:15:00", mornArrTime:"06:43:00", signOffTime:"06:50:00", signOffLocation:"KGWA" },
  },

  // ══════════════════════════════════════════════════════════════
  // SUNDAY Night  ➔  MONDAY (Regular) Morning
  // ══════════════════════════════════════════════════════════════
  "SUNDAY__MONDAY": {
    "48": { signOnTime:"21:15:00", signOnLocation:"PUTH Dn", nightTrainNo:"215", nightDepTime:"21:33:00", nightArrTime:"00:10:00", nightHandoverLoc:"APTS Dn", nightKms:75, mornKms:30, takeoverLocation:"APTS Dn", mornTrainNo:"209", mornDepTime:"04:05:00", mornArrTime:"06:30:00", signOffTime:"06:35:00", signOffLocation:"KGWA" },
    "49": { signOnTime:"21:15:00", signOnLocation:"PUTH Dn", nightTrainNo:"215", nightDepTime:"21:33:00", nightArrTime:"00:10:00", nightHandoverLoc:"APTS Dn", nightKms:75, mornKms:30, takeoverLocation:"APTS Dn", mornTrainNo:"209", mornDepTime:"04:05:00", mornArrTime:"06:30:00", signOffTime:"06:35:00", signOffLocation:"KGWA" },
    "50": { signOnTime:"21:30:00", signOnLocation:"PYID", nightTrainNo:"217", nightDepTime:"21:44:00", nightArrTime:"00:00:00", nightHandoverLoc:"APTS Up", nightKms:61, mornKms:40, takeoverLocation:"APTS Up", mornTrainNo:"209", mornDepTime:"04:30:00", mornArrTime:"06:37:00", signOffTime:"06:40:00", signOffLocation:"PYID" },
    "51": { signOnTime:"21:15:00", signOnLocation:"PUTH Dn", nightTrainNo:"202", nightDepTime:"21:33:00", nightArrTime:"00:10:00", nightHandoverLoc:"APTS Dn", nightKms:75, mornKms:41, takeoverLocation:"APTS Dn", mornTrainNo:"210", mornDepTime:"04:47:00", mornArrTime:"06:47:00", signOffTime:"06:50:00", signOffLocation:"PYID" },
    "52": { signOnTime:"21:30:00", signOnLocation:"PUTH Up", nightTrainNo:"210", nightDepTime:"21:44:00", nightArrTime:"00:00:00", nightHandoverLoc:"APTS Up", nightKms:61, mornKms:40, takeoverLocation:"APTS Up", mornTrainNo:"209", mornDepTime:"04:30:00", mornArrTime:"06:37:00", signOffTime:"06:40:00", signOffLocation:"PYID" },
    "53": { signOnTime:"21:35:00", signOnLocation:"KGWA Up", nightTrainNo:"208", nightDepTime:"21:49:00", nightArrTime:"00:10:00", nightHandoverLoc:"PUTH Dn", nightKms:58, mornKms:47, takeoverLocation:"PUTH Dn", mornTrainNo:"211", mornDepTime:"04:40:00", mornArrTime:"06:57:00", signOffTime:"07:00:00", signOffLocation:"PYID" },
    "54": { signOnTime:"21:30:00", signOnLocation:"PYID", nightTrainNo:"214", nightDepTime:"21:44:00", nightArrTime:"23:40:00", nightHandoverLoc:"NLC Up", nightKms:55, mornKms:38, takeoverLocation:"NLC Up", mornTrainNo:"207", mornDepTime:"04:20:00", mornArrTime:"06:30:00", signOffTime:"06:35:00", signOffLocation:"KGWA" },
    "55": { signOnTime:"21:25:00", signOnLocation:"KGWA Up", nightTrainNo:"215", nightDepTime:"21:40:00", nightArrTime:"23:40:00", nightHandoverLoc:"PUTH Up", nightKms:58, mornKms:34, takeoverLocation:"PUTH Up", mornTrainNo:"208", mornDepTime:"04:15:00", mornArrTime:"06:27:00", signOffTime:"06:30:00", signOffLocation:"PYID" },
    "56": { signOnTime:"21:10:00", signOnLocation:"PUTH Dn", nightTrainNo:"201", nightDepTime:"21:23:00", nightArrTime:"23:45:00", nightHandoverLoc:"Bt DHO", nightKms:48, mornKms:0, takeoverLocation:"213; 214; 215", mornTrainNo:"--", mornDepTime:"05:30:00", mornArrTime:"07:00:00", signOffTime:"07:05:00", signOffLocation:"PYID" },
    "57": { signOnTime:"21:10:00", signOnLocation:"KGWA Dn", nightTrainNo:"211", nightDepTime:"21:23:00", nightArrTime:"00:00:00", nightHandoverLoc:"Bt DHO", nightKms:59, mornKms:0, takeoverLocation:"Depot/CC", mornTrainNo:"Ntest", mornDepTime:"00:40:00", mornArrTime:"06:00:00", signOffTime:"06:05:00", signOffLocation:"Depot" },
    "58": { signOnTime:"21:15:00", signOnLocation:"PYID", nightTrainNo:"213", nightDepTime:"21:28:00", nightArrTime:"23:55:00", nightHandoverLoc:"BEIT Dn", nightKms:74, mornKms:51, takeoverLocation:"BEIT Dn", mornTrainNo:"203", mornDepTime:"04:15:00", mornArrTime:"06:43:00", signOffTime:"06:50:00", signOffLocation:"KGWA" },
    "59": { signOnTime:"21:15:00", signOnLocation:"KGWA Dn", nightTrainNo:"203", nightDepTime:"21:33:00", nightArrTime:"00:10:00", nightHandoverLoc:"Bt DHO", nightKms:59, mornKms:0, takeoverLocation:"CC/Depot", mornTrainNo:"N test", mornDepTime:"00:40:00", mornArrTime:"06:30:00", signOffTime:"06:30:00", signOffLocation:"Depot" },
    "60": { signOnTime:"21:20:00", signOnLocation:"PYID Dn", nightTrainNo:"204", nightDepTime:"21:35:00", nightArrTime:"23:55:00", nightHandoverLoc:"NGSA Dn", nightKms:64, mornKms:59, takeoverLocation:"NGSA DnPf", mornTrainNo:"202", mornDepTime:"04:00:00", mornArrTime:"06:48:00", signOffTime:"06:55:00", signOffLocation:"PYID" },
    "61": { signOnTime:"21:20:00", signOnLocation:"PYID", nightTrainNo:"206", nightDepTime:"21:36:00", nightArrTime:"00:10:00", nightHandoverLoc:"BEIT Up", nightKms:74, mornKms:51, takeoverLocation:"BIET UpPf", mornTrainNo:"204", mornDepTime:"04:45:00", mornArrTime:"06:58:00", signOffTime:"07:05:00", signOffLocation:"KGWA" },
    "62": { signOnTime:"21:30:00", signOnLocation:"KGWA Dn", nightTrainNo:"212", nightDepTime:"21:43:00", nightArrTime:"00:05:00", nightHandoverLoc:"SPGD Dn", nightKms:66, mornKms:45, takeoverLocation:"SPGD DnPf", mornTrainNo:"201", mornDepTime:"04:25:00", mornArrTime:"06:33:00", signOffTime:"06:40:00", signOffLocation:"PYID" },
  },

  // ══════════════════════════════════════════════════════════════
  // SUNDAY Night  ➔  MONDAY GH Morning
  // ══════════════════════════════════════════════════════════════
  "SUNDAY__MONDAY_GH": {
    "48": { signOnTime:"21:15:00", signOnLocation:"PUTH Dn", nightTrainNo:"215", nightDepTime:"21:33:00", nightArrTime:"00:10:00", nightHandoverLoc:"APTS Dn", nightKms:75, mornKms:41, takeoverLocation:"APTS Dn", mornTrainNo:"210", mornDepTime:"04:47:00", mornArrTime:"06:47:00", signOffTime:"06:50:00", signOffLocation:"PYID" },
    "49": { signOnTime:"21:15:00", signOnLocation:"PUTH Dn", nightTrainNo:"206", nightDepTime:"21:33:00", nightArrTime:"00:10:00", nightHandoverLoc:"APTS Dn", nightKms:75, mornKms:41, takeoverLocation:"APTS Dn", mornTrainNo:"210", mornDepTime:"04:47:00", mornArrTime:"06:47:00", signOffTime:"06:50:00", signOffLocation:"PYID" },
    "50": { signOnTime:"21:15:00", signOnLocation:"PUTH Up", nightTrainNo:"210", nightDepTime:"21:29:00", nightArrTime:"23:50:00", nightHandoverLoc:"APTS Up", nightKms:57, mornKms:40, takeoverLocation:"APTS Up", mornTrainNo:"209", mornDepTime:"04:30:00", mornArrTime:"06:37:00", signOffTime:"06:40:00", signOffLocation:"PYID" },
    "51": { signOnTime:"21:15:00", signOnLocation:"PUTH Dn", nightTrainNo:"202", nightDepTime:"21:33:00", nightArrTime:"00:10:00", nightHandoverLoc:"APTS Dn", nightKms:75, mornKms:41, takeoverLocation:"APTS Dn", mornTrainNo:"210", mornDepTime:"04:47:00", mornArrTime:"06:47:00", signOffTime:"06:50:00", signOffLocation:"PYID" },
    "52": { signOnTime:"21:30:00", signOnLocation:"PUTH Up", nightTrainNo:"210", nightDepTime:"21:44:00", nightArrTime:"00:00:00", nightHandoverLoc:"APTS Up", nightKms:61, mornKms:40, takeoverLocation:"APTS Up", mornTrainNo:"209", mornDepTime:"04:30:00", mornArrTime:"06:37:00", signOffTime:"06:40:00", signOffLocation:"PYID" },
    "53": { signOnTime:"21:35:00", signOnLocation:"KGWA Up", nightTrainNo:"208", nightDepTime:"21:49:00", nightArrTime:"00:10:00", nightHandoverLoc:"PUTH Dn", nightKms:58, mornKms:47, takeoverLocation:"PUTH Dn", mornTrainNo:"211", mornDepTime:"04:40:00", mornArrTime:"06:57:00", signOffTime:"07:00:00", signOffLocation:"PYID" },
    "54": { signOnTime:"21:30:00", signOnLocation:"PYID", nightTrainNo:"214", nightDepTime:"21:44:00", nightArrTime:"23:40:00", nightHandoverLoc:"NLC Up", nightKms:55, mornKms:38, takeoverLocation:"NLC Up", mornTrainNo:"207", mornDepTime:"04:20:00", mornArrTime:"06:30:00", signOffTime:"06:35:00", signOffLocation:"KGWA" },
    "55": { signOnTime:"21:25:00", signOnLocation:"KGWA Up", nightTrainNo:"215", nightDepTime:"21:40:00", nightArrTime:"23:40:00", nightHandoverLoc:"PUTH Up", nightKms:58, mornKms:34, takeoverLocation:"PUTH Up", mornTrainNo:"208", mornDepTime:"04:15:00", mornArrTime:"06:27:00", signOffTime:"06:30:00", signOffLocation:"PYID" },
    "56": { signOnTime:"21:10:00", signOnLocation:"PUTH Dn", nightTrainNo:"201", nightDepTime:"21:23:00", nightArrTime:"23:45:00", nightHandoverLoc:"Bt DHO", nightKms:48, mornKms:0, takeoverLocation:"213; 214; 215", mornTrainNo:"--", mornDepTime:"05:30:00", mornArrTime:"07:00:00", signOffTime:"07:05:00", signOffLocation:"PYID" },
    "57": { signOnTime:"21:10:00", signOnLocation:"KGWA Dn", nightTrainNo:"211", nightDepTime:"21:23:00", nightArrTime:"00:00:00", nightHandoverLoc:"Bt DHO", nightKms:59, mornKms:0, takeoverLocation:"Depot/CC", mornTrainNo:"Ntest", mornDepTime:"00:40:00", mornArrTime:"06:00:00", signOffTime:"06:05:00", signOffLocation:"Depot" },
    "58": { signOnTime:"21:15:00", signOnLocation:"PYID", nightTrainNo:"213", nightDepTime:"21:28:00", nightArrTime:"23:55:00", nightHandoverLoc:"BEIT Dn", nightKms:74, mornKms:51, takeoverLocation:"BEIT Dn", mornTrainNo:"203", mornDepTime:"04:15:00", mornArrTime:"06:43:00", signOffTime:"06:50:00", signOffLocation:"KGWA" },
    "59": { signOnTime:"21:15:00", signOnLocation:"KGWA Dn", nightTrainNo:"203", nightDepTime:"21:33:00", nightArrTime:"00:10:00", nightHandoverLoc:"Bt DHO", nightKms:59, mornKms:0, takeoverLocation:"CC/Depot", mornTrainNo:"N test", mornDepTime:"00:40:00", mornArrTime:"06:30:00", signOffTime:"06:30:00", signOffLocation:"Depot" },
    "60": { signOnTime:"21:20:00", signOnLocation:"PYID Dn", nightTrainNo:"204", nightDepTime:"21:35:00", nightArrTime:"23:55:00", nightHandoverLoc:"NGSA Dn", nightKms:64, mornKms:59, takeoverLocation:"NGSA DnPf", mornTrainNo:"202", mornDepTime:"04:00:00", mornArrTime:"06:48:00", signOffTime:"06:55:00", signOffLocation:"PYID" },
    "61": { signOnTime:"21:20:00", signOnLocation:"PYID", nightTrainNo:"206", nightDepTime:"21:36:00", nightArrTime:"00:10:00", nightHandoverLoc:"BEIT Up", nightKms:74, mornKms:51, takeoverLocation:"BIET UpPf", mornTrainNo:"204", mornDepTime:"04:45:00", mornArrTime:"06:58:00", signOffTime:"07:05:00", signOffLocation:"KGWA" },
    "62": { signOnTime:"21:30:00", signOnLocation:"KGWA Dn", nightTrainNo:"212", nightDepTime:"21:43:00", nightArrTime:"00:05:00", nightHandoverLoc:"SPGD Dn", nightKms:66, mornKms:45, takeoverLocation:"SPGD DnPf", mornTrainNo:"201", mornDepTime:"04:25:00", mornArrTime:"06:33:00", signOffTime:"06:40:00", signOffLocation:"PYID" },
  },

  // ══════════════════════════════════════════════════════════════
  // MONDAY_GH Night  ➔  WEEKDAY Morning
  // ══════════════════════════════════════════════════════════════
  "MONDAY_GH__WEEKDAY": {
    "51": { signOnTime:"21:15:00", signOnLocation:"PUTH Dn", nightTrainNo:"202", nightDepTime:"21:33:00", nightArrTime:"00:10:00", nightHandoverLoc:"APTS Dn", nightKms:75, mornKms:41, takeoverLocation:"APTS Dn", mornTrainNo:"210", mornDepTime:"04:47:00", mornArrTime:"06:47:00", signOffTime:"06:50:00", signOffLocation:"PYID" },
    "52": { signOnTime:"21:30:00", signOnLocation:"PUTH Up", nightTrainNo:"210", nightDepTime:"21:44:00", nightArrTime:"00:00:00", nightHandoverLoc:"APTS Up", nightKms:61, mornKms:40, takeoverLocation:"APTS Up", mornTrainNo:"209", mornDepTime:"04:30:00", mornArrTime:"06:37:00", signOffTime:"06:40:00", signOffLocation:"PYID" },
    "53": { signOnTime:"21:35:00", signOnLocation:"KGWA Up", nightTrainNo:"208", nightDepTime:"21:49:00", nightArrTime:"00:10:00", nightHandoverLoc:"PUTH Dn", nightKms:58, mornKms:47, takeoverLocation:"PUTH Dn", mornTrainNo:"211", mornDepTime:"04:40:00", mornArrTime:"06:57:00", signOffTime:"07:00:00", signOffLocation:"PYID" },
    "54": { signOnTime:"21:30:00", signOnLocation:"PYID", nightTrainNo:"214", nightDepTime:"21:44:00", nightArrTime:"23:40:00", nightHandoverLoc:"NLC Up", nightKms:55, mornKms:38, takeoverLocation:"NLC Up", mornTrainNo:"207", mornDepTime:"04:20:00", mornArrTime:"06:30:00", signOffTime:"06:35:00", signOffLocation:"KGWA" },
    "55": { signOnTime:"21:25:00", signOnLocation:"KGWA Up", nightTrainNo:"215", nightDepTime:"21:40:00", nightArrTime:"23:40:00", nightHandoverLoc:"PUTH Up", nightKms:58, mornKms:34, takeoverLocation:"PUTH Up", mornTrainNo:"208", mornDepTime:"04:15:00", mornArrTime:"06:27:00", signOffTime:"06:30:00", signOffLocation:"PYID" },
    "56": { signOnTime:"21:10:00", signOnLocation:"PUTH Dn", nightTrainNo:"201", nightDepTime:"21:23:00", nightArrTime:"23:45:00", nightHandoverLoc:"Bt DHO", nightKms:48, mornKms:0, takeoverLocation:"213; 214; 215", mornTrainNo:"--", mornDepTime:"05:30:00", mornArrTime:"07:00:00", signOffTime:"07:05:00", signOffLocation:"PYID" },
    "57": { signOnTime:"21:10:00", signOnLocation:"KGWA Dn", nightTrainNo:"211", nightDepTime:"21:23:00", nightArrTime:"00:00:00", nightHandoverLoc:"Bt DHO", nightKms:59, mornKms:0, takeoverLocation:"Depot/CC", mornTrainNo:"Ntest", mornDepTime:"00:40:00", mornArrTime:"06:00:00", signOffTime:"06:05:00", signOffLocation:"Depot" },
    "58": { signOnTime:"21:15:00", signOnLocation:"PYID", nightTrainNo:"213", nightDepTime:"21:28:00", nightArrTime:"23:55:00", nightHandoverLoc:"BEIT Dn", nightKms:74, mornKms:51, takeoverLocation:"BEIT Dn", mornTrainNo:"203", mornDepTime:"04:15:00", mornArrTime:"06:43:00", signOffTime:"06:50:00", signOffLocation:"KGWA" },
    "59": { signOnTime:"21:15:00", signOnLocation:"KGWA Dn", nightTrainNo:"203", nightDepTime:"21:33:00", nightArrTime:"00:10:00", nightHandoverLoc:"Bt DHO", nightKms:59, mornKms:0, takeoverLocation:"CC/Depot", mornTrainNo:"N test", mornDepTime:"00:40:00", mornArrTime:"06:30:00", signOffTime:"06:30:00", signOffLocation:"Depot" },
    "60": { signOnTime:"21:20:00", signOnLocation:"PYID Dn", nightTrainNo:"204", nightDepTime:"21:35:00", nightArrTime:"23:55:00", nightHandoverLoc:"NGSA Dn", nightKms:64, mornKms:59, takeoverLocation:"NGSA DnPf", mornTrainNo:"202", mornDepTime:"04:00:00", mornArrTime:"06:48:00", signOffTime:"06:55:00", signOffLocation:"PYID" },
    "61": { signOnTime:"21:20:00", signOnLocation:"PYID", nightTrainNo:"206", nightDepTime:"21:36:00", nightArrTime:"00:10:00", nightHandoverLoc:"BEIT Up", nightKms:74, mornKms:51, takeoverLocation:"BIET UpPf", mornTrainNo:"204", mornDepTime:"04:45:00", mornArrTime:"06:58:00", signOffTime:"07:05:00", signOffLocation:"KGWA" },
    "62": { signOnTime:"21:30:00", signOnLocation:"KGWA Dn", nightTrainNo:"212", nightDepTime:"21:43:00", nightArrTime:"00:05:00", nightHandoverLoc:"SPGD Dn", nightKms:66, mornKms:45, takeoverLocation:"SPGD DnPf", mornTrainNo:"201", mornDepTime:"04:25:00", mornArrTime:"06:33:00", signOffTime:"06:40:00", signOffLocation:"PYID" },
    "63": { signOnTime:"21:30:00", signOnLocation:"PYID Dn", nightTrainNo:"205", nightDepTime:"21:45:00", nightArrTime:"00:10:00", nightHandoverLoc:"JIDL Up", nightKms:64, mornKms:55, takeoverLocation:"JIDL UpPf", mornTrainNo:"205", mornDepTime:"04:45:00", mornArrTime:"07:13:00", signOffTime:"07:20:00", signOffLocation:"KGWA" },
    "64": { signOnTime:"21:15:00", signOnLocation:"KGWA Up", nightTrainNo:"207", nightDepTime:"21:32:00", nightArrTime:"23:00:00", nightHandoverLoc:"Bt DHO", nightKms:25, mornKms:7, takeoverLocation:"BIET DnBE", mornTrainNo:"217", mornDepTime:"06:30:00", mornArrTime:"07:27:00", signOffTime:"07:30:00", signOffLocation:"PYID" },
    "65": { signOnTime:"21:20:00", signOnLocation:"PUTH Up", nightTrainNo:"209", nightDepTime:"21:38:00", nightArrTime:"23:25:00", nightHandoverLoc:"Bt DHO", nightKms:36, mornKms:26, takeoverLocation:"Depo - JHLI Trn Bk", mornTrainNo:"206", mornDepTime:"04:15:00", mornArrTime:"06:15:00", signOffTime:"06:20:00", signOffLocation:"KGWA" },
  },

  // ══════════════════════════════════════════════════════════════
  // SATURDAY Night  ➔  WEEKDAY Morning (Saturday→Weekday)
  // ══════════════════════════════════════════════════════════════
  "SATURDAY__WEEKDAY": {
    "59": { signOnTime:"21:15:00", signOnLocation:"KGWA Dn", nightTrainNo:"208", nightDepTime:"21:32:00", nightArrTime:"00:15:00", nightHandoverLoc:"APTS Dn", nightKms:74, mornKms:41, takeoverLocation:"APTS Dn", mornTrainNo:"210", mornDepTime:"04:47:00", mornArrTime:"06:47:00", signOffTime:"06:50:00", signOffLocation:"PYID" },
    "60": { signOnTime:"21:25:00", signOnLocation:"KGWA Up", nightTrainNo:"218", nightDepTime:"21:42:00", nightArrTime:"23:50:00", nightHandoverLoc:"PUTH Up", nightKms:58, mornKms:34, takeoverLocation:"PUTH Up", mornTrainNo:"208", mornDepTime:"04:15:00", mornArrTime:"06:27:00", signOffTime:"06:30:00", signOffLocation:"PYID" },
    "61": { signOnTime:"21:30:00", signOnLocation:"PYID", nightTrainNo:"209", nightDepTime:"21:45:00", nightArrTime:"23:45:00", nightHandoverLoc:"NLC Up", nightKms:54, mornKms:38, takeoverLocation:"NLC Up", mornTrainNo:"207", mornDepTime:"04:20:00", mornArrTime:"06:30:00", signOffTime:"06:35:00", signOffLocation:"KGWA" },
    "62": { signOnTime:"21:15:00", signOnLocation:"PUTH Up", nightTrainNo:"220", nightDepTime:"21:30:00", nightArrTime:"00:10:00", nightHandoverLoc:"PUTH Dn", nightKms:69, mornKms:47, takeoverLocation:"PUTH Dn", mornTrainNo:"211", mornDepTime:"04:40:00", mornArrTime:"06:57:00", signOffTime:"07:00:00", signOffLocation:"PYID" },
    "63": { signOnTime:"21:35:00", signOnLocation:"PUTH Up", nightTrainNo:"203", nightDepTime:"21:50:00", nightArrTime:"00:15:00", nightHandoverLoc:"APTS Up", nightKms:62, mornKms:40, takeoverLocation:"APTS Up", mornTrainNo:"209", mornDepTime:"04:30:00", mornArrTime:"06:37:00", signOffTime:"06:40:00", signOffLocation:"PYID" },
    "64": { signOnTime:"21:05:00", signOnLocation:"KGWA Dn", nightTrainNo:"221", nightDepTime:"21:22:00", nightArrTime:"23:15:00", nightHandoverLoc:"BT Dn B/E", nightKms:51, mornKms:7, takeoverLocation:"BIET DnBE", mornTrainNo:"217", mornDepTime:"06:30:00", mornArrTime:"07:27:00", signOffTime:"07:30:00", signOffLocation:"PYID" },
    "65": { signOnTime:"21:15:00", signOnLocation:"KGWA Dn", nightTrainNo:"210", nightDepTime:"21:32:00", nightArrTime:"00:00:00", nightHandoverLoc:"B DHO", nightKms:59, mornKms:0, takeoverLocation:"Depot/CC", mornTrainNo:"Ntest", mornDepTime:"00:40:00", mornArrTime:"06:00:00", signOffTime:"06:05:00", signOffLocation:"Depot" },
    "66": { signOnTime:"21:15:00", signOnLocation:"KGWA Up", nightTrainNo:"211", nightDepTime:"21:34:00", nightArrTime:"22:30:00", nightHandoverLoc:"N PKT", nightKms:15, mornKms:0, takeoverLocation:"PDC 213;214;215", mornTrainNo:"--", mornDepTime:"05:30:00", mornArrTime:"07:00:00", signOffTime:"07:05:00", signOffLocation:"PYID" },
    "67": { signOnTime:"21:20:00", signOnLocation:"PYID Dn", nightTrainNo:"216", nightDepTime:"21:34:00", nightArrTime:"23:55:00", nightHandoverLoc:"NG Dn PF", nightKms:65, mornKms:59, takeoverLocation:"NGSA DnPf", mornTrainNo:"202", mornDepTime:"04:00:00", mornArrTime:"06:48:00", signOffTime:"06:55:00", signOffLocation:"PYID" },
    "68": { signOnTime:"21:20:00", signOnLocation:"PYID", nightTrainNo:"217", nightDepTime:"21:35:00", nightArrTime:"00:15:00", nightHandoverLoc:"BIET Up PF", nightKms:74, mornKms:51, takeoverLocation:"BIET UpPf", mornTrainNo:"204", mornDepTime:"04:45:00", mornArrTime:"06:58:00", signOffTime:"07:05:00", signOffLocation:"KGWA" },
    "69": { signOnTime:"21:25:00", signOnLocation:"PUTH Up", nightTrainNo:"201", nightDepTime:"21:40:00", nightArrTime:"23:30:00", nightHandoverLoc:"B DHO", nightKms:36, mornKms:26, takeoverLocation:"Depot", mornTrainNo:"206", mornDepTime:"04:15:00", mornArrTime:"06:15:00", signOffTime:"06:20:00", signOffLocation:"KGWA" },
    "70": { signOnTime:"21:25:00", signOnLocation:"KGWA Dn", nightTrainNo:"202", nightDepTime:"21:42:00", nightArrTime:"00:00:00", nightHandoverLoc:"SPGD/Depot", nightKms:68, mornKms:45, takeoverLocation:"SPGD DnPf", mornTrainNo:"201", mornDepTime:"04:25:00", mornArrTime:"06:33:00", signOffTime:"06:40:00", signOffLocation:"PYID" },
    "71": { signOnTime:"21:30:00", signOnLocation:"PYID Dn", nightTrainNo:"206", nightDepTime:"21:44:00", nightArrTime:"00:20:00", nightHandoverLoc:"JIDL Up PF", nightKms:60, mornKms:55, takeoverLocation:"JIDL UpPf", mornTrainNo:"205", mornDepTime:"04:45:00", mornArrTime:"07:13:00", signOffTime:"07:20:00", signOffLocation:"KGWA" },
    "72": { signOnTime:"21:35:00", signOnLocation:"PYID Dn", nightTrainNo:"207", nightDepTime:"21:54:00", nightArrTime:"00:15:00", nightHandoverLoc:"BIET Dn PF", nightKms:62, mornKms:51, takeoverLocation:"BIET DnPf", mornTrainNo:"203", mornDepTime:"04:15:00", mornArrTime:"06:43:00", signOffTime:"06:50:00", signOffLocation:"KGWA" },
  },
};

// ─── Helper: get the changeover table key ────────────────────────
function getTableKey(currentDay, nextDay) {
  // Normalise nextDay alias: MONDAY maps to MONDAY
  const cd = currentDay.toUpperCase();
  const nd = nextDay.toUpperCase();
  return `${cd}__${nd}`;
}

// ─── Build an ACTIVE_RUN duty document from a changeover row ─────
function buildActiveRunDuty(coRow, existingCurrentDuty) {
  // Night side maps to leg1 + leg2 (existing link roster fields)
  // Morning side maps to leg3 (takeover train) fields

  const nightDrivingSec = getLegDuration(coRow.nightDepTime, coRow.nightArrTime);
  const mornDrivingSec  = getLegDuration(coRow.mornDepTime,  coRow.mornArrTime);
  const totalDrivingSec = nightDrivingSec + mornDrivingSec;

  const signOnSec  = toSec(coRow.signOnTime);
  const signOffSec = toSec(coRow.signOffTime);
  let workSec = signOffSec - signOnSec;
  if (workSec < 0) workSec += 86400;

  // Carry over existing formatting if present
  const baseFormatting = existingCurrentDuty?.formatting || {};

  return {
    // Identity
    scheduleType:    'ACTIVE_RUN',
    dutyId:          coRow.dutyNo,

    // Sign On (from changeover night side)
    signOnTime:      coRow.signOnTime,
    signOnLocation:  coRow.signOnLocation,
    trainId:         String(coRow.nightTrainNo),

    // Leg 1 = night drive leg
    leg1TimeFrom:    coRow.nightDepTime,
    leg1TimeTo:      coRow.nightArrTime,
    leg1TripTime:    coRow.nightTripTime   || toTimeStr(nightDrivingSec),
    leg1HandoverLoc: coRow.nightHandoverLoc,

    // Leg 2 = break / idle (night handover → morning takeover)
    leg2DepLoc:   coRow.nightHandoverLoc,
    leg2TrainNo:  '--',
    leg2DepTime:  coRow.nightArrTime,
    leg2ArrTime:  coRow.mornDepTime,
    leg2TimeTo:   coRow.nightBreak || '--',
    leg2ArrLoc:   coRow.takeoverLocation,

    // Leg 3 = morning takeover train
    leg3DepLoc:   coRow.takeoverLocation,
    leg3TrainNo:  String(coRow.mornTrainNo),
    leg3DepTime:  coRow.mornDepTime,
    leg3ArrTime:  coRow.mornArrTime,
    leg3TimeTo:   coRow.mornTripTime || toTimeStr(mornDrivingSec),
    leg3ArrLoc:   coRow.mornHandoverLoc || coRow.signOffLocation,

    // Leg 4 (not applicable for standard changeover)
    leg4FinalDepLoc:  '--',
    leg4TrainNo:      '--',
    leg4FinalDepTime: '--',
    leg4FinalArrTime: '--',
    leg4TimeTo:       '--',
    leg4FinalArrLoc:  '--',

    // Sign Off
    signOffTime:     coRow.signOffTime,
    signOffLocation: coRow.signOffLocation,

    // KMs
    nightKms: coRow.nightKms || 0,
    mornKms:  coRow.mornKms  || 0,
    totalKms: coRow.totalKms || (coRow.nightKms || 0) + (coRow.mornKms || 0),

    // Calculated hours
    remarks:     totalDrivingSec > 0 ? toTimeStr(totalDrivingSec) : (coRow.drivingHrs || '--'),
    totalHours:  workSec > 0 ? toTimeStr(workSec) : (coRow.dutyHrs || '--'),

    // Preserve existing cell formatting from the base link roster
    formatting: baseFormatting,

    lastModified: new Date().toISOString(),
  };
}

export function getChangeoverMappings() {
  return CHANGEOVER_TABLE;
}

// ─── Main export ─────────────────────────────────────────────────
export const triggerChangeover = async (currentDay, nextDay) => {
  const tableKey = getTableKey(currentDay, nextDay);
  const coTable  = CHANGEOVER_TABLE[tableKey];

  if (!coTable) {
    throw new Error(
      `No changeover table found for: ${currentDay} → ${nextDay}.\n` +
      `Supported combinations: ${Object.keys(CHANGEOVER_TABLE).map(k=>k.replace('__','→')).join(', ')}`
    );
  }

  // ── 1. Fetch the current-day base roster (to carry over formatting / day duties) ──
  const currentSnap = await getDocs(
    query(collection(db, 'crew_final_links'), where('scheduleType', '==', currentDay))
  );
  const currentDutyMap = {};
  currentSnap.docs.forEach(d => {
    const data = d.data();
    currentDutyMap[String(data.dutyId).padStart(2,'0')] = { id: d.id, ...data };
  });

  // ── 2. Delete all existing ACTIVE_RUN duties ──
  const activeSnap = await getDocs(
    query(collection(db, 'crew_final_links'), where('scheduleType', '==', 'ACTIVE_RUN'))
  );
  const deleteBatch = writeBatch(db);
  activeSnap.docs.forEach(d => deleteBatch.delete(d.ref));
  await deleteBatch.commit();

  // ── 3. Build new ACTIVE_RUN duties ──
  const writeBatchInst = writeBatch(db);

  // (a) Night changeover duties — built from the Excel table
  const changeoverDutyIds = new Set();
  Object.entries(coTable).forEach(([dutyNo, coRow]) => {
    changeoverDutyIds.add(dutyNo);
    const existingCurrentDuty = currentDutyMap[dutyNo];
    const finalDuty = buildActiveRunDuty({ ...coRow, dutyNo }, existingCurrentDuty);
    const docId  = `link_active_run_duty_${dutyNo}`;
    writeBatchInst.set(doc(db, 'crew_final_links', docId), finalDuty);
  });

  // (b) Day duties from current-day roster (not in the changeover table) — kept as-is
  Object.entries(currentDutyMap).forEach(([dutyNo, dutyData]) => {
    if (changeoverDutyIds.has(dutyNo)) return; // already handled above
    const finalDuty = {
      ...dutyData,
      scheduleType: 'ACTIVE_RUN',
      lastModified: new Date().toISOString(),
    };
    const docId = `link_active_run_duty_${dutyNo}`;
    writeBatchInst.set(doc(db, 'crew_final_links', docId), finalDuty);
  });

  await writeBatchInst.commit();

  // ── 4. Update system settings ──
  await setDoc(
    doc(db, 'system_settings', 'active_roster_config'),
    {
      activeDayType:  'ACTIVE_RUN',
      currentDay:     currentDay,
      nextDay:        nextDay,
      lastChangeover: serverTimestamp(),
    },
    { merge: true }
  );

  // ── 5. Write audit log ──
  await addDoc(collection(db, 'auditLogs'), {
    action:      'SCHEDULE_CHANGEOVER',
    from:        `${currentDay} Night`,
    to:          `${nextDay} Morning`,
    tableKey:    tableKey,
    nightDuties: Object.keys(coTable).length,
    timestamp:   serverTimestamp(),
    performedBy: 'System Admin',
  });

  return `ACTIVE_RUN (${currentDay} ➔ ${nextDay}) — ${Object.keys(coTable).length} night duties merged`;
};

export const revertToNormalRoster = async () => {
  // Delete all ACTIVE_RUN duties
  const activeSnap = await getDocs(
    query(collection(db, 'crew_final_links'), where('scheduleType', '==', 'ACTIVE_RUN'))
  );
  const deleteBatch = writeBatch(db);
  activeSnap.docs.forEach(d => deleteBatch.delete(d.ref));
  await deleteBatch.commit();

  // Reset active_roster_config
  await setDoc(
    doc(db, 'system_settings', 'active_roster_config'),
    {
      activeDayType:  'WEEKDAY',
      currentDay:     'WEEKDAY',
      nextDay:        'SATURDAY',
      lastRevert:     serverTimestamp(),
    },
    { merge: true }
  );

  await addDoc(collection(db, 'auditLogs'), {
    action:      'REVERT_CHANGEOVER',
    timestamp:   serverTimestamp(),
    performedBy: 'System Admin',
  });

  return "Roster successfully reverted back to standard timetable schedule.";
};
