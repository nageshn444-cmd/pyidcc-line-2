/**
 * kmCalculator.js
 * ─────────────────────────────────────────────────────────────────────
 * Master High-Precision Distance & Kilometer Engine for BMRCL Line 2 JMD.
 *
 * Provides exact chainage-based kilometer calculations, sequence distances,
 * WTT timetable matching, and CSV link roster parsing.
 * ─────────────────────────────────────────────────────────────────────
 */

import { MASTER_STATIONS, PREDEFINED_TRIPS } from "../data/kmcalc/masterStations.js";
import { WTT_MASTER_REGISTRY } from "../data/wttMasterRegistry.js";
import { CHANGEOVER_TABLE, isPdcTrip } from "../services/changeoverService.js";
import { PRELOADED_DUTIES } from "../data/kmcalc/preloadedDuties.js";

/**
 * Normalizes any station code, name, sub-location or alias to canonical MASTER_STATIONS code.
 */
export function normalizeStationCode(rawCode) {
  if (!rawCode) return "";

  let c = String(rawCode)
    .trim()
    .toUpperCase()
    .replace(/[\s_]/g, "");

  // Strip UP/DN boarding direction suffix for normalization
  // e.g. "PYID UP" → "PYID", "PUTH DN" → "PUTH", "KGWA UP" → "KGWA"
  // But keep PYID_UP / PYID_DN as-is for distance special cases (handled in calculateDistance)
  const upDnStripped = c.replace(/(?:UP|DN|PF|PLT|PLATFORM)$/, "").trim();

  // Depot and Induction sub-locations
  if (
    c.includes("DEPOT") ||
    c.includes("DEPO") ||
    c.includes("DPO") ||
    c.includes("DHO") ||
    c === "BDHO" ||
    c === "PDHO"
  ) {
    return "DEPOT";
  }

  // Pocket tracks & Buffer Ends
  if (
    c === "BIETBE" ||
    c === "BIETBUFFEREND" ||
    c.includes("BIETBE") ||
    ((c.includes("BIET") || c.startsWith("BT") || c === "BTBE") && (c.includes("BE") || c.includes("BUFFER") || c.includes("B/E")))
  ) {
    return "BIET_BE";
  }
  if (c === "NGSABE" || c === "NGBE" || c === "NGSABUFFEREND" || c.includes("NGSABE") || (c.includes("NG") && (c.includes("BE") || c.includes("BUFFER") || c.includes("B/E")))) return "NGSA_BE";
  // NPKT / NG PKT / NGPKT / NGSA PKT / NGSAPKT → NGSA_PT (pocket track)
  if (
    c === "NGSAPT" || c === "NGSAPKT" || c === "NPKT" || c === "NGSAPOCKET" ||
    c === "NGPKT" || c === "NGPT" || c.includes("NGPKT") || c.includes("NGPT") ||
    c.includes("NGSAPT") || c.includes("NGSAPOCKET") || c.includes("NPKT") ||
    (c.includes("NG") && (c.includes("PKT") || c.includes("POCKET") || c.includes("PT")))
  ) return "NGSA_PT";
  if (c === "NLCPT" || c === "NLCPKT" || c.includes("NLCPOCKET") || (c.includes("NLC") && c.includes("PKT"))) return "NLC_PT";
  if (c === "MHLIPT" || c === "MHLIPKT" || c.includes("MHLIPOCKET") || (c.includes("MHLI") && c.includes("PKT"))) return "MHLI_PT";
  if (c === "PUTHBE" || c === "PUTHBUFFEREND" || c.includes("PUTHBE") || (c.includes("PUTH") && (c.includes("BE") || c.includes("BUFFER") || c.includes("B/E")))) return "PUTH_BE";
  if (c === "APTSBE" || c === "APTSBUFFEREND" || c.includes("APTSBE") || (c.includes("APTS") && (c.includes("BE") || c.includes("BUFFER") || c.includes("B/E")))) return "APTS_BE";

  // Road 3 (Rd-3/Rd3) at Peenya Industry -> 'PYID'
  if (c === "RD3" || c === "RD-3" || c === "RD3INDUCT" || c === "RD3STBY" || c.includes("RD3")) {
    return "PYID";
  }

  // Common station name aliases
  if (c.includes("MADAVARA") || c.includes("MADHAVARA") || c.includes("BIEC")) return "BIET";
  // JLHL and JDHL are the same station (Jalahalli)
  if (c.includes("JINDAL") || c.includes("JIDL") || upDnStripped === "JDHL") return "JDHL";
  if (c.includes("JALAHALLI") || c === "JLHL" || upDnStripped === "JLHL") return "JLHL";
  if (c.includes("MANJUNATHA")) return "MNJN";
  if (c.includes("NAGASANDRA") || c === "NGSA" || upDnStripped === "NGSA") return "NGSA";
  if (c.includes("DASARAHALLI") || c === "DSH" || upDnStripped === "DSH") return "DSH";
  if (c.includes("PEENYA") && !c.includes("INDUSTRY") && c !== "PYID" && upDnStripped !== "PYID") return "PEYA";
  if (c.includes("PEENYA") || c.includes("PYID") || upDnStripped === "PYID") return "PYID";
  if (c.includes("GORAGUNTE") || c === "YPI" || upDnStripped === "YPI") return "YPI";
  if (c.includes("YESHWANT") || c.includes("YPM") || upDnStripped === "YPM") return "YPM";
  if (c.includes("SANDAL") || c === "SSFY" || upDnStripped === "SSFY") return "SSFY";
  if (c.includes("MAHALAKSHMI") || c === "MHLI" || upDnStripped === "MHLI") return "MHLI";
  if (c.includes("RAJAJINAGAR") || c === "RJNR" || upDnStripped === "RJNR") return "RJNR";
  if (c.includes("KUVEMPU") || c === "KVPR" || upDnStripped === "KVPR") return "KVPR";
  if (c.includes("SRIRAMPURA") || c === "SPRU" || upDnStripped === "SPRU") return "SPRU";
  if (c.includes("SAMPIGE") || c.includes("SPGD") || c.includes("MANTRI")) return "SPGD";
  if (c.includes("KEMPEGOWDA") || c.includes("KGWA") || c.includes("MAJESTIC") || c === "MJST" || upDnStripped === "KGWA") return "KGWA";
  if (c.includes("CHIKKAPETE") || c === "CKPE" || upDnStripped === "CKPE") return "CKPE";
  if (c.includes("MARKET") || c === "KRMT" || upDnStripped === "KRMT") return "KRMT";
  if (c.includes("NATIONAL") || c.includes("NLC") || upDnStripped === "NLC") return "NLC";
  if (c.includes("LALBAGH") || c === "LBGH" || upDnStripped === "LBGH") return "LBGH";
  if (c.includes("SOUTHEND") || c === "SECE" || upDnStripped === "SECE") return "SECE";
  if (c.includes("JAYANAGAR") || c === "JYN" || upDnStripped === "JYN") return "JYN";
  if (c.includes("RVROAD") || c.includes("RVR") || c.includes("R.V.ROAD") || upDnStripped === "RVR") return "RVR";
  if (c.includes("BANASHANKARI") || c === "BSNK" || upDnStripped === "BSNK") return "BSNK";
  if (c.includes("JPNAGAR") || c === "JPN" || upDnStripped === "JPN") return "JPN";
  if (c.includes("YELACHENAHALLI") || c.includes("PUTH") || c.includes("PUTHANTENAHALLI") || upDnStripped === "PUTH") return "PUTH";
  if (c.includes("KONANAKUNTE") || c === "APRC" || upDnStripped === "APRC") return "APRC";
  if (c.includes("DODDAKALSANDRA") || c === "KLPK" || upDnStripped === "KLPK") return "KLPK";
  if (c.includes("VAJARAHALLI") || c === "VJRH" || upDnStripped === "VJRH") return "VJRH";
  if (c.includes("TALAGHATTAPURA") || c === "TGTP" || upDnStripped === "TGTP") return "TGTP";
  if (c.includes("ANJANAPURA") || c.includes("APTS") || c.includes("SILK") || upDnStripped === "APTS") return "APTS";

  // Counselling conducted at Peenya Industry Depot Crew Control base -> 'PYID'
  if (c.includes("COUNS")) return "PYID";

  // 6 car stopping / short loop turn back at RVR
  if (c.includes("6CAR") || c.includes("STOPPING")) {
    if (c.includes("RVR")) return "RVR";
  }

  return String(rawCode || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, "");
}


/**
 * Calculates non-revenue stabling positioning distance from the last trip arrival
 * station to the train's stabling siding/buffer end/depot track.
 * Train Operator drives the train from the revenue platform to stabling location without passenger service.
 *
 * @param {string} arrivalStation - Revenue completion station (e.g. 'APTS', 'PUTH', 'BIET', 'NGSA', 'PYID', 'SPGD', 'JIDL')
 * @param {string} stablingLocation - Stabling destination (e.g. 'APTS_BE', 'PUTH_BE', 'BIET_BE', 'NGSA_PT', 'P DHO', 'B DHO', 'DEPOT')
 * @returns {number} Distance in kilometers
 */
export function getStablingMovementKm(arrivalStation, stablingLocation) {
  if (!arrivalStation || !stablingLocation) return 0;
  const arr = String(arrivalStation).trim().toUpperCase();
  const stab = String(stablingLocation).trim().toUpperCase();

  if (arr === stab || stab === '--' || arr === '--' || stab === '-' || arr === '-') return 0;

  // Peenya Depot Handover (P DHO / PYID Depot SBL / Depot Rd-3)
  if (stab.includes('P DHO') || stab.includes('PDHO') || (stab.includes('DEPOT') && arr.includes('PYID'))) {
    return 2.00;
  }
  // BIET Depot Handover (B DHO / BIET SBL)
  if (stab.includes('B DHO') || stab.includes('BDHO') || (stab.includes('DEPOT') && arr.includes('BIET'))) {
    return 6.00;
  }
  // APTS Buffer End (APTS_BE)
  if (arr.includes('APTS') && (stab.includes('APTS_BE') || stab.includes('APTS BE') || stab.includes('BUFFER') || stab.includes('B/E'))) {
    return 0.34; // |24.170 - 23.833| = 0.337 km
  }
  // PUTH Buffer End (PUTH_BE)
  if (arr.includes('PUTH') && (stab.includes('PUTH_BE') || stab.includes('PUTH BE') || stab.includes('BUFFER') || stab.includes('B/E'))) {
    return 0.47; // |18.250 - 17.780| = 0.470 km
  }
  // BIET Buffer End (BIET_BE)
  if (arr.includes('BIET') && (stab.includes('BIET_BE') || stab.includes('BIET BE') || stab.includes('BUFFER') || stab.includes('B/E'))) {
    return 0.33; // |-9.560 - (-9.227)| = 0.333 km
  }
  // NGSA Pocket Track / Buffer End (NGSA_PT / NPKT / NGSA_BE)
  if (arr.includes('NGSA') && (stab.includes('NGSA_PT') || stab.includes('NGSA PKT') || stab.includes('NPKT') || stab.includes('PT') || stab.includes('PKT') || stab.includes('BE'))) {
    return 0.44; // |-6.528 - (-6.088)| = 0.440 km
  }
  // SPGD Siding
  if (arr.includes('SPGD') && (stab.includes('SBL') || stab.includes('SIDING') || stab.includes('DN PF'))) {
    return 0.40;
  }
  // JIDL Siding
  if ((arr.includes('JLHL') || arr.includes('JIDL') || arr.includes('JDHL')) && (stab.includes('JIDL') || stab.includes('SBL') || stab.includes('UP PF'))) {
    return 0.50;
  }
  // NLC Pocket Track
  if (arr.includes('NLC') && (stab.includes('PT') || stab.includes('PKT') || stab.includes('POCKET'))) {
    return 0.08;
  }
  // MHLI Pocket Track
  if (arr.includes('MHLI') && (stab.includes('PT') || stab.includes('PKT') || stab.includes('POCKET'))) {
    return 0.08;
  }

  // Depot handover from any other station
  if (stab.includes('DEPOT') || stab.includes('DPO')) {
    const distToPyid = calculateDistance(arr, 'PYID');
    return parseFloat((distToPyid + 2.00).toFixed(2));
  }

  const rawDist = calculateDistance(arrivalStation, stablingLocation);
  return typeof rawDist === 'number' && rawDist > 0 ? rawDist : 0;
}

/**
 * Calculates non-revenue morning induction distance from the train's stabling siding/buffer end/depot track
 * to the first revenue passenger boarding station.
 * Train Operator drives the train from the stabling point to the revenue platform before opening doors.
 *
 * @param {string} stablingLocation - Overnight stabling location (e.g. 'Depot Rd-3', 'NGSA PKT', 'BIET_BE', 'PUTH_BE', 'APTS_BE')
 * @param {string} boardingStation - First revenue passenger station (e.g. 'PYID', 'NGSA', 'BIET', 'PUTH', 'APTS')
 * @returns {number} Distance in kilometers
 */
export function getInductionMovementKm(stablingLocation, boardingStation) {
  if (!stablingLocation || !boardingStation) return 0;
  const stab = String(stablingLocation).trim().toUpperCase();
  const board = String(boardingStation).trim().toUpperCase();

  if (stab === board || stab === '--' || board === '--' || stab === '-' || board === '-') return 0;

  // Peenya Depot Induction to PYID platform
  if ((stab.includes('DEPOT') || stab.includes('DPO') || stab.includes('RD3') || stab.includes('RD-3')) && board.includes('PYID')) {
    return 2.00;
  }
  // Depot to JLHL Up
  if ((stab.includes('DEPOT') || stab.includes('DPO')) && board.includes('JLHL')) {
    return 2.70;
  }
  // Depot to BIET
  if ((stab.includes('DEPOT') || stab.includes('DPO')) && board.includes('BIET')) {
    return 7.84;
  }
  // NGSA Pocket Track to NGSA platform (Duty 55 benchmark)
  if ((stab.includes('NGSA_PT') || stab.includes('NGSA PKT') || stab.includes('NPKT')) && board.includes('NGSA')) {
    return 0.44;
  }
  // BIET Buffer End to BIET platform
  if ((stab.includes('BIET_BE') || stab.includes('BIET BE')) && board.includes('BIET')) {
    return 0.33;
  }
  // PUTH Buffer End to PUTH platform
  if ((stab.includes('PUTH_BE') || stab.includes('PUTH BE')) && board.includes('PUTH')) {
    return 0.47;
  }
  // APTS Buffer End to APTS platform
  if ((stab.includes('APTS_BE') || stab.includes('APTS BE')) && board.includes('APTS')) {
    return 0.34;
  }
  // SPGD siding to SPGD platform
  if (stab.includes('SPGD') && board.includes('SPGD')) {
    return 0.40;
  }
  // JIDL siding to JLHL platform
  if (stab.includes('JIDL') && (board.includes('JLHL') || board.includes('JDHL'))) {
    return 0.50;
  }

  // True stabling locations check (buffer ends, pocket tracks, sidings, depot)
  const isActualStablingPoint =
    stab.includes('DEPOT') || stab.includes('DPO') || stab.includes('RD3') || stab.includes('RD-3') ||
    stab.includes('BE') || stab.includes('BUFFER') || stab.includes('B/E') ||
    stab.includes('PKT') || stab.includes('PT') || stab.includes('POCKET') ||
    stab.includes('SIDING') || stab.includes('SBL');

  if (!isActualStablingPoint) {
    return 0;
  }

  const rawDist = calculateDistance(stablingLocation, boardingStation);
  return typeof rawDist === 'number' && rawDist > 0 ? rawDist : 0;
}

/**
 * Calculates absolute distance between two stations based on chainage values.
 * Returns exact distance in KM (float, rounded to 2 decimal places).
 */
export function calculateDistance(fromStationCode, toStationCode) {
  const rawFromStr = String(fromStationCode || "").trim().toUpperCase();
  const rawToStr = String(toStationCode || "").trim().toUpperCase();

  if (!rawFromStr || !rawToStr || rawFromStr === '--' || rawToStr === '--' || rawFromStr === '-' || rawToStr === '-') {
    return 0;
  }

  // CC3 Non-driving exclusion
  if (rawFromStr.includes("CC3") || rawToStr.includes("CC3") || rawFromStr.includes("CC 3") || rawToStr.includes("CC 3")) {
    return 0;
  }

  // Special P DHO (Peenya Depot Handover via Rd3 = 2 km)
  if (
    (rawToStr.includes("P DHO") || rawToStr.includes("PDHO")) ||
    (rawFromStr.includes("P DHO") || rawFromStr.includes("PDHO"))
  ) {
    if (rawFromStr.includes("PYID") || rawToStr.includes("PYID") || rawFromStr.includes("DEPOT") || rawToStr.includes("DEPOT") || rawFromStr.includes("DPO") || rawToStr.includes("DPO")) {
      return 2.00;
    }
  }

  // Special B DHO (BIET Depot Handover = 6 km)
  if (
    (rawToStr.includes("B DHO") || rawToStr.includes("BDHO") || rawToStr.includes("BT DHO")) ||
    (rawFromStr.includes("B DHO") || rawFromStr.includes("BDHO") || rawFromStr.includes("BT DHO"))
  ) {
    if (rawFromStr.includes("BIET") || rawToStr.includes("BIET") || rawFromStr.includes("DEPOT") || rawToStr.includes("DEPOT") || rawFromStr.includes("DPO") || rawToStr.includes("DPO")) {
      return 6.00;
    }
  }

  // PYID UP to PYID DN (reversing via BIET BE) operational terminal loop = 13.08 KM
  if (
    (rawFromStr.includes("PYID") && rawFromStr.includes("UP") && rawToStr.includes("PYID") && rawToStr.includes("DN")) ||
    (rawFromStr.includes("PYID") && rawFromStr.includes("DN") && rawToStr.includes("PYID") && rawToStr.includes("UP"))
  ) {
    return 13.08;
  }

  // Operational Turn Back (TB / REV / 6 CAR STOPPING / TRN) destinations e.g. "RVR TB", "RVR 6 car stopping", "KGWA TB", "PUTH TB", "PYID Trn"
  // Turn back travels from start station to the turn station, reverses, and returns to PYID crew base.
  // E.g. Dpo-Rd3 (-1.720 KM + 2.0 KM induction) to RVR TB (+14.180 KM) -> 36.400 KM
  // E.g. PYID (-3.020 KM) to RVR TB (+14.180 KM) -> PYID to RVR (17.200 KM) + RVR to PYID (17.200 KM) = 34.400 KM
  // E.g. NGSA PKT / NGSA_PT (-6.528 KM) -> NGSA (-6.088 KM) -> RVR (+14.180 KM) -> PYID (-3.020 KM) = 37.908 KM (Duty 55)
  const isTurnBackTo = /\b(TB|T\/B|T\.B|TRN|TURN|TURN\s*BACK|TURNBACK|REV|REVERSING|6\s*CAR\s*STOPPING|STOPPING)\b/i.test(rawToStr) ||
                       /[-_ ](TB|TRN)$/i.test(rawToStr.trim()) ||
                       /\(TB\)/i.test(rawToStr) ||
                       rawToStr.includes("6 CAR STOPPING") ||
                       rawToStr.includes("TURN BACK") ||
                       rawToStr.includes("TRN");

  const isTurnBackFrom = /\b(TB|T\/B|T\.B|TRN|TURN|TURN\s*BACK|TURNBACK|REV|REVERSING|6\s*CAR\s*STOPPING|STOPPING)\b/i.test(rawFromStr) ||
                         /[-_ ](TB|TRN)$/i.test(rawFromStr.trim()) ||
                         /\(TB\)/i.test(rawFromStr) ||
                         rawFromStr.includes("6 CAR STOPPING") ||
                         rawFromStr.includes("TURN BACK") ||
                         rawFromStr.includes("TRN");

  if (isTurnBackTo || isTurnBackFrom) {
    const turnTargetStr = isTurnBackTo ? rawToStr : rawFromStr;
    const baseTargetStr = isTurnBackTo ? rawFromStr : rawToStr;

    let cleanTurnStr = turnTargetStr
      .replace(/\b(TB|T\/B|T\.B|TRN|TURN\s*BACK|TURNBACK|REV|REVERSING|6\s*CAR\s*STOPPING|STOPPING)\b/gi, "")
      .replace(/[-_()]/g, " ")
      .trim();
    let turnNorm = normalizeStationCode(cleanTurnStr);
    if (!turnNorm || turnNorm === "DEPOT" || turnNorm === "PYID") {
      if (turnTargetStr.includes("RVR")) turnNorm = "RVR";
      else if (turnTargetStr.includes("KGWA")) turnNorm = "KGWA";
      else if (turnTargetStr.includes("PUTH")) turnNorm = "PUTH";
      else if (turnTargetStr.includes("SPGD")) turnNorm = "SPGD";
      else if (turnTargetStr.includes("NLC")) turnNorm = "NLC";
      else if (turnTargetStr.includes("NGSA")) turnNorm = "NGSA";
      else if (baseTargetStr.includes("NG") || baseTargetStr.includes("NPKT")) turnNorm = "RVR";
    }

    if (turnNorm === "RVR") {
      // Depot-Rd3 -> RVR Dn -> Turn Back at RVR 6 car stopping -> RVR -> PYID Up
      // Depot induction (2.0 km) + PYID Rd3 -> RVR (17.20 km) + RVR -> PYID Up (17.20 km) = 36.40 KM
      if (baseTargetStr.includes("DPO") || baseTargetStr.includes("DEPOT")) {
        return 36.40;
      }
      if (baseTargetStr.includes("NG") || baseTargetStr.includes("NPKT") || baseTargetStr.includes("NGSA")) {
        // NGSA_PT (-6.528 KM) -> NGSA (-6.088 KM) -> RVR (14.180 KM) -> PYID (-3.020 KM) = 37.908 KM
        return 37.91;
      }
      if (baseTargetStr.includes("BIET")) {
        // BIET_BE (-9.560 KM) to RVR (14.180 KM) = 23.74 KM + RVR to PYID (17.20 KM) = 40.94 KM
        return 40.94;
      }
      // PYID to RVR TB and returning to PYID = 17.20 + 17.20 = 34.40 KM
      return 34.40;
    }

    if (turnNorm) {
      let normBase = normalizeStationCode(baseTargetStr);
      if (normBase === "BIET" && !baseTargetStr.includes("BE")) normBase = "BIET_BE";
      if (normBase === "APTS" && !baseTargetStr.includes("BE")) normBase = "APTS_BE";

      const baseStn = MASTER_STATIONS.find((s) => s.code.toUpperCase() === normBase);
      const turnStn = MASTER_STATIONS.find((s) => s.code.toUpperCase() === turnNorm);
      const pyidStn = MASTER_STATIONS.find((s) => s.code.toUpperCase() === "PYID");

      if (baseStn && turnStn && pyidStn) {
        let dist1 = Math.abs(turnStn.chainage - baseStn.chainage);
        const dist2 = Math.abs(pyidStn.chainage - turnStn.chainage);
        if (normBase === "DEPOT" && (baseTargetStr.includes("RD3") || baseTargetStr.includes("RD-3"))) {
          dist1 = Math.abs(turnStn.chainage - pyidStn.chainage) + 2.0;
        }
        return parseFloat((dist1 + dist2).toFixed(3));
      }
    }
  }

  // Pure one-way RVR <-> PYID shortloops
  const isFromRvr = rawFromStr.includes("RVR") || rawFromStr.includes("R.V.") || rawFromStr.includes("RVROAD");
  const isToRvr = rawToStr.includes("RVR") || rawToStr.includes("R.V.") || rawToStr.includes("RVROAD");
  const isFromPyid = rawFromStr.includes("PYID") || rawFromStr.includes("PEENYA INDUSTRY");
  const isToPyid = rawToStr.includes("PYID") || rawToStr.includes("PEENYA INDUSTRY");
  const isFromDepot = rawFromStr.includes("DEPOT") || rawFromStr.includes("DPO") || rawFromStr.includes("RD3");
  const isToDepot = rawToStr.includes("DEPOT") || rawToStr.includes("DPO") || rawToStr.includes("RD3");

  if ((isFromRvr && isToPyid) || (isFromPyid && isToRvr)) {
    return 17.20;
  }
  if ((isFromRvr && isToDepot) || (isFromDepot && isToRvr)) {
    return 19.20; // 17.20 km mainline + 2.0 km depot delta
  }

  let normFrom = normalizeStationCode(fromStationCode);
  let normTo = normalizeStationCode(toStationCode);

  // Buffer end vs passenger platform distinction for stabling / buffer positioning
  const rawF = rawFromStr.replace(/[\s_-]/g, "");
  const rawT = rawToStr.replace(/[\s_-]/g, "");
  const isBufferF = rawF.includes("BE") || rawF.includes("BUFFER") || rawF.includes("B/E");
  const isBufferT = rawT.includes("BE") || rawT.includes("BUFFER") || rawT.includes("B/E");
  const isPktF = rawF.includes("PKT") || rawF.includes("PT") || rawF.includes("POCKET");
  const isPktT = rawT.includes("PKT") || rawT.includes("PT") || rawT.includes("POCKET");

  // Specific platform-to-buffer-end / siding positioning distances
  if (normFrom === "APTS" && normTo === "APTS_BE") return 0.34;
  if (normFrom === "APTS_BE" && normTo === "APTS") return 0.34;
  if (normFrom === "PUTH" && normTo === "PUTH_BE") return 0.47;
  if (normFrom === "PUTH_BE" && normTo === "PUTH") return 0.47;
  if (normFrom === "BIET" && normTo === "BIET_BE") return 0.33;
  if (normFrom === "BIET_BE" && normTo === "BIET") return 0.33;
  if (normFrom === "NGSA" && normTo === "NGSA_PT") return 0.44;
  if (normFrom === "NGSA_PT" && normTo === "NGSA") return 0.44;
  if (normFrom === "PYID" && normTo === "DEPOT") return 2.00;
  if (normFrom === "DEPOT" && normTo === "PYID") return 2.00;
  if (normFrom === "BIET" && normTo === "DEPOT") return 6.00;
  if (normFrom === "DEPOT" && normTo === "BIET") return 6.00;

  // Terminal stations: Trains reverse / cab change over is conducted at Buffer Ends
  // Only normalize to Buffer End when calculating full running lines between stations,
  // NOT when calculating the local movement between platform and buffer end.
  if (normFrom === "BIET" && normTo !== "BIET_BE") normFrom = "BIET_BE";
  if (normTo === "BIET" && normFrom !== "BIET_BE") normTo = "BIET_BE";
  if (normFrom === "APTS" && normTo !== "APTS_BE") normFrom = "APTS_BE";
  if (normTo === "APTS" && normFrom !== "APTS_BE") normTo = "APTS_BE";

  if (!normFrom || !normTo) {
    return 0;
  }

  if (normFrom === normTo) {
    if (normFrom === "APTS" && (isBufferF !== isBufferT)) return 0.34;
    if (normFrom === "PUTH" && (isBufferF !== isBufferT)) return 0.47;
    if (normFrom === "BIET" && (isBufferF !== isBufferT)) return 0.33;
    if (normFrom === "NGSA" && (isBufferF !== isBufferT || isPktF !== isPktT)) return isBufferF !== isBufferT ? 0.41 : 0.44;
    return 0;
  }

  const fromStn = MASTER_STATIONS.find((s) => s.code.toUpperCase() === normFrom);
  const toStn = MASTER_STATIONS.find((s) => s.code.toUpperCase() === normTo);

  if (!fromStn || !toStn) {
    return 0;
  }

  const diff = Math.abs(toStn.chainage - fromStn.chainage);
  return parseFloat(diff.toFixed(3));
}

/**
 * Calculates cumulative distance for a sequence of station codes.
 * e.g. ["PYID", "BIET_BE", "APTS_BE", "PYID"]
 */
export function calculateSequenceDistance(stationCodes) {
  if (!Array.isArray(stationCodes) || stationCodes.length < 2) {
    return { segments: [], totalExact: 0, totalRounded: 0 };
  }

  const segments = [];
  let totalExact = 0;

  for (let i = 0; i < stationCodes.length - 1; i++) {
    const fromCode = stationCodes[i];
    const toCode = stationCodes[i + 1];
    if (!fromCode || !toCode || fromCode === toCode) continue;

    const normF = normalizeStationCode(fromCode);
    const normT = normalizeStationCode(toCode);
    if (!normF || !normT || normF === normT) continue;

    const s1 = MASTER_STATIONS.find((s) => s.code.toUpperCase() === normF);
    const s2 = MASTER_STATIONS.find((s) => s.code.toUpperCase() === normT);

    let dist = 0;
    if (s1 && s2) {
      dist = Math.abs(s2.chainage - s1.chainage);
    } else {
      dist = calculateDistance(fromCode, toCode);
    }

    if (dist > 0) {
      segments.push({
        fromStationCode: fromCode,
        toStationCode: toCode,
        calculatedKms: parseFloat(dist.toFixed(3)),
      });
      totalExact += dist;
    }
  }

  const exactVal = parseFloat(totalExact.toFixed(3));
  return {
    segments,
    totalExact: exactVal,
    totalRounded: Math.round(exactVal),
  };
}

/**
 * Parses time-string "HH:MM:SS" or "HH:MM" (or Date, decimal fraction) to total seconds from midnight.
 * Returns -1 for invalid or missing times.
 */
export function timeStringToSeconds(timeStr) {
  if (timeStr === undefined || timeStr === null || timeStr === "" || timeStr === "--" || timeStr === "-") return -1;

  if (timeStr instanceof Date) {
    return timeStr.getHours() * 3600 + timeStr.getMinutes() * 60 + timeStr.getSeconds();
  }

  if (typeof timeStr === "number") {
    if (timeStr >= 0 && timeStr < 1) {
      return Math.round(timeStr * 86400);
    }
    if (timeStr >= 1) {
      const frac = timeStr - Math.floor(timeStr);
      return Math.round(frac * 86400);
    }
  }

  let str = String(timeStr).trim();

  // If it's a date string representation like "Sat Dec 30 1899 07:59:00 ..."
  const dateMatch = str.match(/\b(\d{1,2}):(\d{2})(?::(\d{2}))?\b/);
  if (dateMatch) {
    const isPm = /pm/i.test(str);
    const isAm = /am/i.test(str);
    let hrs = parseInt(dateMatch[1], 10);
    const mins = parseInt(dateMatch[2], 10);
    const secs = dateMatch[3] ? parseInt(dateMatch[3], 10) : 0;
    if (isPm && hrs < 12) hrs += 12;
    if (isAm && hrs === 12) hrs = 0;
    return hrs * 3600 + mins * 60 + secs;
  }

  if (str.includes(".") && !str.includes(":")) {
    const dotParts = str.split(".");
    if (dotParts.length === 2 && !isNaN(Number(dotParts[0])) && !isNaN(Number(dotParts[1]))) {
      const h = Number(dotParts[0]);
      const m = Number(dotParts[1]);
      return h * 3600 + m * 60;
    }
  }

  return -1;
}

/**
 * Converts seconds back to "HH:MM:SS" format.
 */
export function secondsToTimeString(totalSeconds) {
  if (totalSeconds < 0 || isNaN(totalSeconds)) return "--";
  const norm = ((totalSeconds % 86400) + 86400) % 86400;
  const hrs = Math.floor(norm / 3600);
  const mins = Math.floor((norm % 3600) / 60);
  const secs = norm % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
}

/**
 * Normalizes train IDs (stripping CR prefix, Train/Tr prefixes, whitespace, punctuation).
 */
export function cleanTrainId(raw) {
  if (raw === undefined || raw === null) return "";
  let s = String(raw).trim();
  s = s.replace(/^CR[-_\s]*/i, "");
  s = s.replace(/^(Train|Tr|No|T)\.?\s*/i, "");
  return s.replace(/[^0-9a-zA-Z]/g, "");
}

// Master Station Chainages Lookup
export const stationChainages = {};
MASTER_STATIONS.forEach((s) => {
  stationChainages[s.code] = s.chainage;
});

export function getStationChainage(rawCode) {
  if (!rawCode) return null;
  const c = String(rawCode).trim().toUpperCase().replace(/[\s_]/g, "");
  if (c === "BIETBE" || c === "BIET_BE") return stationChainages["BIET_BE"];
  if (c === "APTSBE" || c === "APTS_BE") return stationChainages["APTS_BE"];
  if (c === "PUTHBE" || c === "PUTH_BE") return stationChainages["PUTH_BE"];
  if (c === "NGSABE" || c === "NGSA_BE") return stationChainages["NGSA_BE"];
  if (c === "NGSAPT" || c === "NGSA_PT") return stationChainages["NGSA_PT"];
  if (c.includes("DEPOT") || c.includes("DPO")) return stationChainages["DEPOT"];
  if (stationChainages[rawCode] !== undefined) return stationChainages[rawCode];
  if (stationChainages[c] !== undefined) return stationChainages[c];
  const norm = normalizeStationCode(rawCode);
  if (stationChainages[norm] !== undefined) return stationChainages[norm];
  return null;
}

// In-Memory Index for WTT events by Schedule Type & Train ID
export const WTT_INDEX = {};

export function buildWttIndex(wttRows = WTT_MASTER_REGISTRY) {
  const schedules = ["WEEKDAY", "SATURDAY", "SUNDAY", "MONDAY"];
  schedules.forEach((sched) => {
    WTT_INDEX[sched] = {};
  });

  const rows = Array.isArray(wttRows) ? wttRows : [];
  rows.forEach((r) => {
    let sched = String(r.scheduleType || "WEEKDAY").toUpperCase();
    if (sched === "GH" || sched === "SATURDAY_GH" || sched === "SATURDAY & GH") sched = "SATURDAY";
    if (sched === "MONDAY_GH") sched = "MONDAY";
    if (!WTT_INDEX[sched]) WTT_INDEX[sched] = {};

    ["downTrip", "upTrip"].forEach((tripKey) => {
      const trip = r[tripKey];
      if (!trip || !trip.stations) return;
      const rawTid = trip.trainId || r.trainId || (tripKey === "upTrip" ? r.upTid : r.dnTid);
      const tid = cleanTrainId(rawTid);
      if (!tid) return;

      if (!WTT_INDEX[sched][tid]) WTT_INDEX[sched][tid] = [];

      Object.entries(trip.stations).forEach(([st, tVal]) => {
        if (!tVal || tVal === "--" || tVal === "-" || String(tVal).toLowerCase().includes("rev")) return;
        const secs = timeStringToSeconds(tVal);
        if (secs >= 0) {
          WTT_INDEX[sched][tid].push({
            trainId: tid,
            station: st,
            timeStr: String(tVal).trim(),
            secs,
            dir: tripKey === "upTrip" ? "UP" : "DN",
            rowSeq: r.rowSeq,
            tripId: trip.id,
          });
        }
      });
    });
  });

  Object.keys(WTT_INDEX).forEach((sched) => {
    Object.keys(WTT_INDEX[sched]).forEach((tid) => {
      WTT_INDEX[sched][tid].sort((a, b) => a.secs - b.secs);
    });
  });
}

// Build index immediately on module evaluation
buildWttIndex();

/**
 * Searches the selected day's WTT for matching train ID and event within approved ±2 minutes (120 seconds).
 */
export function findMatchingWttEvent(scheduleType, trainId, targetTimeStr, minIndex = 0) {
  let sched = String(scheduleType || "WEEKDAY").toUpperCase();
  if (sched === "GH" || sched === "SATURDAY_GH" || sched === "SATURDAY & GH") sched = "SATURDAY";
  if (sched === "MONDAY_GH") sched = "MONDAY";

  const tid = cleanTrainId(trainId);
  const timeline = WTT_INDEX[sched]?.[tid] || [];
  const targetSecs = timeStringToSeconds(targetTimeStr);

  if (targetSecs < 0 || !timeline.length) {
    return {
      event: null,
      index: -1,
      diff: Infinity,
      status: !timeline.length ? "TRAIN_NOT_FOUND" : "INVALID_TIME",
    };
  }

  let bestMatch = null;
  let bestDiff = Infinity;
  let bestIdx = -1;
  let isAmbiguous = false;

  for (let i = minIndex; i < timeline.length; i++) {
    const ev = timeline[i];
    let diff = Math.abs(ev.secs - targetSecs);
    if (Math.abs(ev.secs + 86400 - targetSecs) < diff) diff = Math.abs(ev.secs + 86400 - targetSecs);
    if (Math.abs(ev.secs - (targetSecs + 86400)) < diff) diff = Math.abs(ev.secs - (targetSecs + 86400));

    if (diff <= 120) {
      if (diff < bestDiff) {
        bestDiff = diff;
        bestMatch = ev;
        bestIdx = i;
        isAmbiguous = false;
      } else if (diff === bestDiff && bestMatch && bestMatch.station !== ev.station) {
        isAmbiguous = true;
      }
    }
  }

  if (!bestMatch) {
    return { event: null, index: -1, diff: Infinity, status: "UNMATCHED_TIME" };
  }

  return {
    event: bestMatch,
    index: bestIdx,
    diff: bestDiff,
    isExact: bestDiff === 0,
    isAmbiguous,
    status: isAmbiguous ? "AMBIGUOUS" : bestDiff === 0 ? "EXACT" : "TOLERANCE_MATCH",
  };
}

/**
 * Calculates actual route distance along Line 2 track sequence between matched WTT events.
 */
export function calculateTimelineRouteDistance(timeline, startIdx, endIdx) {
  if (!timeline || startIdx < 0 || endIdx < 0 || endIdx < startIdx) return 0;
  if (startIdx === endIdx) return 0;

  const slice = timeline.slice(startIdx, endIdx + 1);
  if (slice.length < 2) return 0;

  let totalKm = 0;
  let currentDir = slice[0].dir;
  let segStartStn = slice[0].station;

  for (let i = 1; i < slice.length; i++) {
    const ev = slice[i];
    const prevEv = slice[i - 1];

    if (ev.dir !== currentDir) {
      let turnBuffer = prevEv.station;
      if (currentDir === "UP") {
        if (prevEv.station === "BIET") turnBuffer = "BIET_BE";
        else if (prevEv.station === "NGSA") turnBuffer = "NGSA_BE";
      } else {
        if (prevEv.station === "APTS") turnBuffer = "APTS_BE";
        else if (prevEv.station === "PUTH") turnBuffer = "PUTH_BE";
        else if (prevEv.station === "RVR") turnBuffer = "RVR";
      }

      const c1 = getStationChainage(segStartStn);
      const c2 = getStationChainage(turnBuffer);
      if (c1 !== null && c2 !== null) {
        totalKm += Math.abs(c2 - c1);
      }

      segStartStn = turnBuffer;
      currentDir = ev.dir;
    }
  }

  const lastStn = slice[slice.length - 1].station;
  const c1 = getStationChainage(segStartStn);
  const c2 = getStationChainage(lastStn);
  if (c1 !== null && c2 !== null) {
    totalKm += Math.abs(c2 - c1);
  }

  return Number(totalKm.toFixed(2));
}

const LINE2_STATION_ORDER = [
  "BIET_BE",
  "BIET",
  "JDHL",
  "MNJN",
  "NGSA",
  "DSH",
  "JLHL",
  "PYID",
  "PEYA",
  "YPI",
  "YPM",
  "SSFY",
  "MHLI",
  "RJNR",
  "KVPR",
  "SPRU",
  "SPGD",
  "KGWA",
  "CKPE",
  "KRMT",
  "NLC",
  "LBGH",
  "SECE",
  "JYN",
  "RVR",
  "BSNK",
  "JPN",
  "PUTH",
  "APRC",
  "KLPK",
  "VJRH",
  "TGTP",
  "APTS",
  "APTS_BE",
];

export function expandStationPath(stnList) {
  if (!stnList || stnList.length < 2) return stnList || [];

  const resolveMainlineCode = (raw) => {
    const n = normalizeStationCode(raw);
    if (n === "BIET") return "BIET_BE";
    if (n === "APTS") return "APTS_BE";
    if (n === "DEPOT") return "PYID";
    if (n === "NGSA_PT" || n === "NGSA_BE") return "NGSA";
    if (n === "MHLI_PT") return "MHLI";
    if (n === "NLC_PT") return "NLC";
    if (n === "PUTH_BE") return "PUTH";
    return n;
  };

  const expanded = [stnList[0]];

  for (let i = 0; i < stnList.length - 1; i++) {
    const orig1 = stnList[i];
    const orig2 = stnList[i + 1];
    const s1 = resolveMainlineCode(orig1);
    const s2 = resolveMainlineCode(orig2);

    if (!s1 || !s2 || s1 === s2) continue;

    const idx1 = LINE2_STATION_ORDER.indexOf(s1);
    const idx2 = LINE2_STATION_ORDER.indexOf(s2);

    if (idx1 !== -1 && idx2 !== -1 && Math.abs(idx1 - idx2) > 1) {
      const step = idx2 > idx1 ? 1 : -1;
      for (let k = idx1 + step; k !== idx2; k += step) {
        expanded.push(LINE2_STATION_ORDER[k]);
      }
    }
    expanded.push(orig2);
  }
  return expanded;
}

/**
 * Calculates kilometers for a single leg by matching trainId, day type (scheduleType),
 * and board/deboard time windows against master WTT registry within approved ±2 minutes (120 seconds).
 */
export function calculateLegKmsFromWTT(
  trainId,
  takeoverLocation,
  handoverLocation,
  depTimeStr,
  arrTimeStr,
  scheduleType = "WEEKDAY"
) {
  const rawTrain = String(trainId || "").trim();
  const trainLower = rawTrain.toLowerCase();
  const takeLower = String(takeoverLocation || "").toLowerCase();
  const handLower = String(handoverLocation || "").toLowerCase();

  const isNonRunning =
    !rawTrain ||
    trainLower === "--" ||
    trainLower === "-" ||
    /^(pro|stby|standby|cc3|cc-3|cc 3|couns|counseling|ntest|protection|tgtp|rd3\s*stby)/i.test(trainLower) ||
    /^(cc3|cc-3|cc 3)/i.test(takeLower) ||
    /^(cc3|cc-3|cc 3)/i.test(handLower);

  if (isNonRunning) {
    return {
      calculatedKms: 0,
      status: "NON_RUNNING",
      matchSource: "NON_RUNNING",
      trainNo: rawTrain || "N/A",
      origin: "DESK",
      destination: "DESK",
      rosterFrom: depTimeStr || "--",
      rosterTo: arrTimeStr || "--",
      matchedFrom: "--",
      matchedTo: "--",
      validation: "Non-running / Supervisory / Standby activity",
    };
  }

  let sched = String(scheduleType || "WEEKDAY").toUpperCase();
  if (sched === "GH" || sched === "SATURDAY_GH" || sched === "SATURDAY & GH") sched = "SATURDAY";
  if (sched === "MONDAY_GH") sched = "MONDAY";

  const tid = cleanTrainId(rawTrain);
  const timeline = WTT_INDEX[sched]?.[tid] || [];

  if (!timeline.length) {
    return {
      calculatedKms: 0,
      status: "TRAIN_NOT_FOUND",
      matchSource: "UNMATCHED",
      trainNo: rawTrain,
      origin: "UNKNOWN",
      destination: "UNKNOWN",
      rosterFrom: depTimeStr || "--",
      rosterTo: arrTimeStr || "--",
      matchedFrom: "--",
      matchedTo: "--",
      validation: `Train ID "${rawTrain}" not found in ${sched} WTT`,
    };
  }

  const mFrom = findMatchingWttEvent(sched, tid, depTimeStr, 0);
  if (!mFrom || !mFrom.event) {
    return {
      calculatedKms: 0,
      status: "UNMATCHED_FROM",
      matchSource: "UNMATCHED",
      trainNo: rawTrain,
      origin: "UNMATCHED",
      destination: "UNMATCHED",
      rosterFrom: depTimeStr || "--",
      rosterTo: arrTimeStr || "--",
      matchedFrom: "--",
      matchedTo: "--",
      validation: `FROM time "${depTimeStr}" not found in WTT for Train ${rawTrain} within approved ±2 min tolerance`,
    };
  }

  const mTo = findMatchingWttEvent(sched, tid, arrTimeStr, Math.max(0, mFrom.index));
  if (!mTo || !mTo.event) {
    return {
      calculatedKms: 0,
      status: "UNMATCHED_TO",
      matchSource: "UNMATCHED",
      trainNo: rawTrain,
      origin: mFrom.event.station,
      destination: "UNMATCHED",
      rosterFrom: depTimeStr || "--",
      rosterTo: arrTimeStr || "--",
      matchedFrom: mFrom.event.timeStr,
      matchedTo: "--",
      fromDiff: mFrom.diff,
      validation: `TO time "${arrTimeStr}" not found in WTT for Train ${rawTrain} within approved ±2 min tolerance`,
    };
  }

  let dist = calculateTimelineRouteDistance(timeline, mFrom.index, mTo.index);

  // Check special handover depot movements (P DHO = 2 km, B DHO = 6 km)
  let specialKm = 0;
  const handUpper = String(handoverLocation || "").toUpperCase();
  if (handUpper.includes("P DHO") || handUpper.includes("PDHO")) {
    specialKm = 2.0;
  } else if (handUpper.includes("B DHO") || handUpper.includes("BDHO")) {
    specialKm = 6.0;
  }
  dist = Number((dist + specialKm).toFixed(2));

  const isExact = mFrom.isExact && mTo.isExact;
  const isAmbiguous = mFrom.isAmbiguous || mTo.isAmbiguous;
  const status = isAmbiguous ? "AMBIGUOUS" : isExact ? "EXACT" : "TOLERANCE_MATCH";
  const validation = isAmbiguous
    ? "Multiple plausible WTT events within tolerance"
    : isExact
    ? "Exact WTT match"
    : `Matched within tolerance (FROM: ${mFrom.diff}s, TO: ${mTo.diff}s)`;

  return {
    calculatedKms: dist,
    status,
    matchSource: "WTT",
    trainNo: rawTrain,
    origin: mFrom.event.station,
    matchedFrom: mFrom.event.timeStr,
    fromDiff: mFrom.diff,
    destination: mTo.event.station,
    matchedTo: mTo.event.timeStr,
    toDiff: mTo.diff,
    rosterFrom: depTimeStr || "--",
    rosterTo: arrTimeStr || "--",
    direction: `${mFrom.event.dir} → ${mTo.event.dir}`,
    boardingStation: mFrom.event.station,
    boardingTime: mFrom.event.timeStr,
    alightingStation: mTo.event.station,
    alightingTime: mTo.event.timeStr,
    validation,
    wttFromEvent: mFrom.event,
    wttToEvent: mTo.event,
    customPathStr: `${mFrom.event.station} → ${mTo.event.station}`,
  };
}

export function parseCSVToDuties(csvText) {
  if (!csvText) return [];

  const lines = csvText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return [];

  const matrix = lines.map((line) => {
    let delimiter = ",";
    if (line.includes("\t")) delimiter = "\t";
    else if (!line.includes(",") && line.includes(";")) delimiter = ";";

    return line.split(delimiter).map((v) => {
      let cleaned = String(v || "")
        .trim()
        .replace(/^["']|["']$/g, "");
      cleaned = cleaned.replace(/[\u0000-\u001F\u007F-\u009F]/g, "").trim();
      return cleaned;
    });
  });

  const parsedDuties = [];

  const dutyKeywords = ["duty", "duty no", "duty_no", "duty#", "duty.", "link", "sl", "sl.no", "s.no", "shift", "duty id"];
  const sOnKeywords = ["sign on", "s/on", "s on", "s-on", "s.on", "son", "on time", "report time", "start time", "sign_on"];
  const sOnLocKeywords = ["sign on loc", "s/on loc", "s on loc", "on_location", "location", "sign_on_loc", "on loc", "s.on loc"];
  const sOffKeywords = ["sign off", "s/off", "s off", "s-off", "s.off", "soff", "off time", "end time", "sign_off"];
  const sOffLocKeywords = ["sign off loc", "s/off loc", "s off loc", "off_location", "sign_off_loc", "off loc", "s.off loc"];
  const trainKeywords = ["train", "tr.no", "tr no", "train no", "train_no", "train#", "tr", "t.no"];

  const matchesKeyword = (headerStr, keywords) => {
    if (!headerStr) return false;
    const h = String(headerStr).toLowerCase().trim();
    const hClean = h.replace(/[^a-z0-9]/g, "");
    for (const kw of keywords) {
      const k = kw.toLowerCase().trim();
      const kClean = k.replace(/[^a-z0-9]/g, "");
      if (h === k || h.includes(k) || k.includes(h)) return true;
      if (hClean && kClean && (hClean.includes(kClean) || kClean.includes(hClean))) return true;
    }
    return false;
  };

  let bestHeaderIdx = -1;
  let maxScore = 0;

  for (let r = 0; r < Math.min(20, matrix.length); r++) {
    const row = matrix[r];
    let score = 0;
    row.forEach((cellVal) => {
      if (matchesKeyword(cellVal, dutyKeywords)) score += 3;
      if (matchesKeyword(cellVal, sOnKeywords)) score += 2;
      if (matchesKeyword(cellVal, sOffKeywords)) score += 2;
      if (matchesKeyword(cellVal, trainKeywords)) score += 2;
    });
    if (score > maxScore) {
      maxScore = score;
      bestHeaderIdx = r;
    }
  }

  const startRow = bestHeaderIdx !== -1 && maxScore > 0 ? bestHeaderIdx + 1 : 0;
  const headers = bestHeaderIdx !== -1 && maxScore > 0
    ? matrix[bestHeaderIdx].map((h) => String(h || "").toLowerCase().trim())
    : [];

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
  const kmsIdx = findColIndex(["kms", "distance", "km", "kilometer", "total km"]);

  let currentDutyObj = null;

  for (let r = startRow; r < matrix.length; r++) {
    const row = matrix[r];
    if (!row || row.length === 0) continue;

    let dutyNo = dutyNoIdx !== -1 ? row[dutyNoIdx] : "";
    if (!dutyNo) {
      for (let c = 0; c < Math.min(4, row.length); c++) {
        const val = String(row[c] || "").trim();
        const cleanVal = val.replace(/^duty\s*@?\s*/i, "").replace(/[^a-zA-Z0-9\s-]/g, "").trim();
        if (cleanVal && (/\d+/.test(cleanVal) || /^(pro|stby|r3|rd3|duty|sb)\d*/i.test(cleanVal))) {
          dutyNo = cleanVal;
          break;
        }
      }
    }

    const isSubRow = !dutyNo && currentDutyObj;
    if (!dutyNo && !isSubRow) continue;

    if (!isSubRow) {
      dutyNo = String(dutyNo).trim().replace(/^(duty\s*(no\.?|#|@)?)[\s:]*/i, "");
      if (
        !dutyNo ||
        dutyNo.toLowerCase().includes("total") ||
        dutyNo.toLowerCase().includes("prepared") ||
        dutyNo.toLowerCase().includes("metric") ||
        dutyNo.toLowerCase().includes("average") ||
        dutyNo.toLowerCase().includes("hrs") ||
        dutyNo.startsWith("~")
      ) {
        continue;
      }

      const sOnTimeCell = sOnTimeIdx !== -1 ? row[sOnTimeIdx] : "";
      const signOnLocCell = signOnLocIdx !== -1 ? row[signOnLocIdx] : "";
      const sOffTimeCell = sOffTimeIdx !== -1 ? row[sOffTimeIdx] : "";
      const signOffLocCell = signOffLocIdx !== -1 ? row[signOffLocIdx] : "";
      const kms = kmsIdx !== -1 ? parseFloat(row[kmsIdx]) || 0 : 0;

      const timeCells = [];
      const locationCells = [];
      const trainCells = [];

      row.forEach((cell) => {
        const val = String(cell || "").trim();
        if (!val) return;
        if (/^\d{1,2}[:.]\d{2}([:.]\d{2})?$/.test(val)) {
          timeCells.push(val.replace(/\./g, ":"));
        } else if (/(PYID|KGWA|PUTH|DEPOT|DEPO|DPO|DHO|NLC|APTS|RJNR|YPM|NGSA|BIET|RD3|RVR|MHLI|SPGD|CKPE|KRMT|LBGH|SECE|JYN|BSNK|JPN|APRC|KLPK|VJRH|TGTP|PEYA|YPI|SSFY|KVPR|SPRU|JDHL|MNJN|DSH|JLHL|TB|PKT|PT|POCKET|NG)/i.test(val)) {
          locationCells.push(val);
        } else if (/^(\d{3}|pro\s*\d*|rd3\s*stby|stby)$/i.test(val)) {
          trainCells.push(val);
        }
      });

      const sOnTime = sOnTimeCell || timeCells[0] || "06:00:00";
      const signOnLocation = signOnLocCell || locationCells[0] || "PYID";
      const sOffTime = sOffTimeCell || (timeCells.length > 1 ? timeCells[timeCells.length - 1] : "14:00:00");
      const signOffLocation = signOffLocCell || (locationCells.length > 1 ? locationCells[locationCells.length - 1] : "PYID");

      const trips = [];
      if (trainCells.length > 0 || timeCells.length >= 2) {
        const numTrips = Math.max(trainCells.length, Math.floor((timeCells.length - 2) / 2));
        for (let tIdx = 0; tIdx < Math.min(4, Math.max(1, numTrips)); tIdx++) {
          const trNo = trainCells[tIdx] || `Train ${tIdx + 1}`;
          const tFrm = timeCells[1 + tIdx * 2] || timeCells[0] || "06:00:00";
          const tTo = timeCells[2 + tIdx * 2] || timeCells[1] || "08:00:00";
          const tTake = locationCells[tIdx] || (tIdx === 0 ? signOnLocation : '');
          const tHand = locationCells[tIdx + 1] || (tIdx === numTrips - 1 ? signOffLocation : '');

          trips.push({
            legNumber: tIdx + 1,
            trainNo: trNo,
            timeFrm: tFrm,
            timeTo: tTo,
            takeoverLocation: tTake,
            handoverLocation: tHand,
            isCounselling: false,
          });
        }
      }

      currentDutyObj = {
        dutyNo,
        sOnTime,
        signOnLocation,
        sOffTime,
        signOffLocation,
        kms,
        trips,
      };
      parsedDuties.push(currentDutyObj);
    }
  }

  return parsedDuties;
}

/**
 * Enhances roster duties by matching uploaded Link Roster day type and WTT trip schedules,
 * calculating leg-by-leg distance, and compiling final cumulative kilometer summaries.
 */
export function expandChangeoverPath(fromRaw, toRaw, targetKm) {
  const s1 = normalizeStationCode(fromRaw) || "PYID";
  const s2 = normalizeStationCode(toRaw) || "PYID";

  let keyStations = [s1, s2];
  if (targetKm >= 60) {
    if (s1 === s2) {
      keyStations = [s1, "APTS", s1];
    } else {
      keyStations = [s1, "BIET", "APTS", s2];
    }
  } else if (s1 === s2 && targetKm > 0) {
    keyStations = [s1, "KGWA", s1];
  }

  const pathList = expandStationPath(keyStations);
  return pathList.length > 0 ? pathList.join(" → ") : `${s1} → ${s2}`;
}

/**
 * Calculates kilometers for each leg (Leg 1, Leg 2, Leg 3, Leg 4) independently
 * and compiles final cumulative kilometer summary using ceiling rounding:
 * Raw Duty KM = Leg 1 + Leg 2 + Leg 3 + Leg 4
 * Final Duty KM = Math.ceil(Raw Duty KM)
 */
export function computeDutyLegKms(duty, scheduleType = 'WEEKDAY') {
  if (!duty) return { leg1Km: 0, leg2Km: 0, leg3Km: 0, leg4Km: 0, rawTotalKm: 0, totalKm: 0, finalTotalKm: 0, validationResult: 'EMPTY', trips: [] };

  const dutyStr = String(
    duty.dutyNo || duty.dutyId || duty.dutyType || duty.remarks || duty.dutyProfile || duty.name || ''
  ).trim().toLowerCase();
  const cleanDutyId = String(duty.dutyId || duty.dutyNo || '').trim().toLowerCase();

  const isCC3Duty = cleanDutyId === 'cc3' ||
                    cleanDutyId === 'cc 3' ||
                    cleanDutyId === 'cc-3' ||
                    dutyStr === 'cc3' ||
                    dutyStr === 'cc 3' ||
                    dutyStr === 'cc-3' ||
                    /\bcc\s*3\b/i.test(dutyStr) ||
                    duty.isCC3 === true;

  if (isCC3Duty) {
    return {
      leg1Km: 0,
      leg2Km: 0,
      leg3Km: 0,
      leg4Km: 0,
      rawTotalKm: 0,
      totalKm: 0,
      finalTotalKm: 0,
      isNonDriving: true,
      dutyRole: 'CC3_DESK',
      validationResult: 'NON RUNNING',
      trips: []
    };
  }

  const trips = Array.isArray(duty.trips) ? duty.trips : [];
  const processedTrips = [];
  const legKms = [0, 0, 0, 0];
  let hasUnmatched = false;
  let hasRunning = false;

  for (let i = 0; i < 4; i++) {
    const t = trips[i];
    if (!t || (!t.trainNo && !t.timeFrm && !t.timeTo)) {
      processedTrips.push({
        legNumber: i + 1,
        trainNo: '--',
        calculatedKms: 0,
        status: 'EMPTY',
        validation: 'No leg scheduled'
      });
      continue;
    }

    const res = calculateLegKmsFromWTT(
      t.trainNo,
      t.takeoverLocation,
      t.handoverLocation,
      t.timeFrm,
      t.timeTo,
      scheduleType
    );

    legKms[i] = res.calculatedKms || 0;

    if (res.status === 'UNMATCHED_FROM' || res.status === 'UNMATCHED_TO' || res.status === 'TRAIN_NOT_FOUND' || res.status === 'AMBIGUOUS') {
      hasUnmatched = true;
    }
    if (res.status !== 'NON_RUNNING' && res.status !== 'EMPTY') {
      hasRunning = true;
    }

    processedTrips.push({
      ...t,
      legNumber: i + 1,
      trainNo: t.trainNo || res.trainNo,
      calculatedKms: res.calculatedKms,
      origin: res.origin,
      originStation: res.origin,
      destination: res.destination,
      destinationStation: res.destination,
      matchedFrom: res.matchedFrom,
      matchedFromTime: res.matchedFrom,
      matchedTo: res.matchedTo,
      matchedToTime: res.matchedTo,
      fromDiff: res.fromDiff,
      toDiff: res.toDiff,
      rosterFrom: res.rosterFrom || t.timeFrm,
      rosterTo: res.rosterTo || t.timeTo,
      timeFrm: t.timeFrm || res.rosterFrom,
      timeTo: t.timeTo || res.rosterTo,
      boardingStation: res.origin,
      alightingStation: res.destination,
      boardingTime: res.matchedFrom,
      alightingTime: res.matchedTo,
      status: res.status,
      matchStatus: res.status,
      wttMatchDepth: (res.status === 'EXACT_MATCH' || res.status === 'TOLERANCE_MATCH') ? 'EXACT_WTT' : (res.status === 'NON_RUNNING' ? 'NON_RUNNING' : 'UNMATCHED'),
      validation: res.validation,
      wttFromEvent: res.wttFromEvent,
      wttToEvent: res.wttToEvent,
      customPathStr: res.customPathStr || (res.origin && res.destination ? `${res.origin} → ${res.destination}` : t.customPathStr),
      direction: res.direction
    });
  }

  const rawTotalKm = Number((legKms[0] + legKms[1] + legKms[2] + legKms[3]).toFixed(2));
  const finalTotalKm = Math.ceil(Number(rawTotalKm.toFixed(4)));

  let validationResult = 'VALIDATED';
  if (!hasRunning) {
    validationResult = 'NON RUNNING';
  } else if (hasUnmatched) {
    validationResult = 'MANUAL REVIEW';
  }

  return {
    leg1Km: legKms[0],
    leg2Km: legKms[1],
    leg3Km: legKms[2],
    leg4Km: legKms[3],
    rawTotalKm,
    totalKm: finalTotalKm,
    finalTotalKm,
    validationResult,
    trips: processedTrips
  };
}

/**
 * Enhances roster duties by reading actual uploaded Link Roster data,
 * matching WTT events for every leg, calculating route distance,
 * and computing ceiling-rounded duty totals.
 */
export function enhanceRosterDuties(duties, scheduleType = 'WEEKDAY') {
  if (!duties || !Array.isArray(duties)) return [];

  const normScheduleType = String(scheduleType || 'WEEKDAY').toUpperCase();

  return duties.map((duty) => {
    const computed = computeDutyLegKms(duty, normScheduleType);

    const dutyResult = {
      ...duty,
      kms: computed.totalKm,
      totalKm: computed.totalKm,
      totalKms: computed.totalKm,
      rawTotalKm: computed.rawTotalKm,
      finalTotalKm: computed.finalTotalKm,
      leg1Km: computed.leg1Km,
      leg2Km: computed.leg2Km,
      leg3Km: computed.leg3Km,
      leg4Km: computed.leg4Km,
      trips: computed.trips,
      validationResult: computed.validationResult,
    };

    if (computed.trips[0]?.origin) {
      dutyResult.leg1DepLoc = computed.trips[0].origin;
      dutyResult.leg1ArrLoc = computed.trips[0].destination;
    }
    if (computed.trips[1]?.origin) {
      dutyResult.leg2DepLoc = computed.trips[1].origin;
      dutyResult.leg2ArrLoc = computed.trips[1].destination;
    }
    if (computed.trips[2]?.origin) {
      dutyResult.leg3DepLoc = computed.trips[2].origin;
      dutyResult.leg3ArrLoc = computed.trips[2].destination;
    }
    if (computed.trips[3]?.origin) {
      dutyResult.leg4DepLoc = computed.trips[3].origin;
      dutyResult.leg4ArrLoc = computed.trips[3].destination;
    }

    return dutyResult;
  });
}


/**
 * Calculates KM confidence score for a roster duty based on WTT match depth.
 * HIGH = all running legs matched via WTT timetable.
 * MED  = at least half of running legs matched via WTT.
 * LOW  = majority unmatched, all chainage-fallback, or manual override.
 * @param {object} duty
 * @returns {'HIGH' | 'MED' | 'LOW'}
 */
export function calculateKmConfidence(duty) {
  if (!duty) return 'LOW';
  if (duty.isManuallyEdited) return 'MED';
  if (!duty.trips || duty.trips.length === 0) return 'LOW';

  const runningTrips = duty.trips.filter(t =>
    t.status !== 'NON RUNNING' && (t.calculatedKms || 0) > 0
  );

  if (runningTrips.length === 0) return 'LOW';

  const wttMatched = runningTrips.filter(t =>
    t.wttMatchDepth === 'EXACT_WTT'
  ).length;

  const ratio = wttMatched / runningTrips.length;
  if (ratio >= 1.0) return 'HIGH';
  if (ratio >= 0.5) return 'MED';
  return 'LOW';
}

// ══════════════════════════════════════════════════════════════════════════
// CANONICAL TIME-BASED LOCATION & LOCATION-BASED TIME ENGINE (DUTY 55 & GENERAL)
// ══════════════════════════════════════════════════════════════════════════

export const DUTY_55_ROUTE_STOPS = [
  { code: 'NGSA_PT', name: 'NGSA (Pocket Track SRMB)', chainage: -6.528, isBufferOrSpecial: true },
  { code: 'NGSA', name: 'Nagasandra', chainage: -6.088 },
  { code: 'RVR', name: 'R.V.Road', chainage: 14.180 },
  { code: 'PYID', name: 'Peenya Industry', chainage: -3.020 }
];

/**
 * Builds the route segments and cumulative distance breakdown for any sequence of station stops.
 */
export function buildRouteSegments(routeStops = DUTY_55_ROUTE_STOPS) {
  if (!Array.isArray(routeStops) || routeStops.length < 2) return { segments: [], totalDistance: 0 };

  let totalDistance = 0;
  const segments = [];

  for (let i = 0; i < routeStops.length - 1; i++) {
    const fromStn = routeStops[i];
    const toStn = routeStops[i + 1];
    const dist = Math.abs((toStn.chainage ?? 0) - (fromStn.chainage ?? 0));
    const dir = (toStn.chainage ?? 0) > (fromStn.chainage ?? 0) ? 'DOWN' : 'UP';

    segments.push({
      index: i + 1,
      from: fromStn,
      to: toStn,
      distanceKm: parseFloat(dist.toFixed(3)),
      direction: dir,
      startDistKm: parseFloat(totalDistance.toFixed(3)),
      endDistKm: parseFloat((totalDistance + dist).toFixed(3))
    });
    totalDistance += dist;
  }

  return { segments, totalDistance: parseFloat(totalDistance.toFixed(3)) };
}

/**
 * Given a timestamp queryTimeStr, computes the exact location, chainage, direction, and segment.
 */
export function calculateTimeBasedLocation(
  routeStops = DUTY_55_ROUTE_STOPS,
  startTimeStr = "15:15:00",
  endTimeStr = "17:00:00",
  queryTimeStr = "15:45:00"
) {
  const { segments, totalDistance } = buildRouteSegments(routeStops);
  if (segments.length === 0 || totalDistance <= 0) return {
    queryTime: queryTimeStr,
    status: 'UNKNOWN',
    progressPct: 0,
    progressPercentage: 0,
    chainageFormatted: '0.000 KM',
    currentChainage: 0,
    direction: 'DOWN',
    distanceTraversedKm: 0,
    distanceCoveredKm: 0,
    distanceRemainingKm: 0,
    totalDistanceKm: 0,
    totalSegments: 0,
    segmentIndex: 0,
    segmentFrom: '--',
    segmentTo: '--',
    segmentProgressPct: 0,
    nearestStation: { code: '--', name: '--', distanceKm: '0.000' }
  };

  const startSec = timeStringToSeconds(startTimeStr) || (15 * 3600 + 15 * 60);
  let endSec = timeStringToSeconds(endTimeStr) || (17 * 3600);
  if (endSec < startSec) endSec += 86400;
  const totalDurationSec = Math.max(1, endSec - startSec);

  let querySec = timeStringToSeconds(queryTimeStr);
  if (querySec < startSec && (querySec + 86400) <= endSec) {
    querySec += 86400;
  }
  const clampedQuerySec = Math.max(startSec, Math.min(endSec, querySec));
  const elapsedSec = clampedQuerySec - startSec;
  const progressRatio = Math.max(0, Math.min(1, elapsedSec / totalDurationSec));

  const distanceCoveredKm = parseFloat((progressRatio * totalDistance).toFixed(3));
  const distanceRemainingKm = parseFloat(Math.max(0, totalDistance - distanceCoveredKm).toFixed(3));

  let activeSegIdx = segments.findIndex(s => distanceCoveredKm >= s.startDistKm && distanceCoveredKm <= s.endDistKm);
  if (activeSegIdx === -1) {
    activeSegIdx = segments.length - 1;
  }
  const activeSeg = segments[activeSegIdx];

  const segFraction = activeSeg.distanceKm > 0
    ? Math.max(0, Math.min(1, (distanceCoveredKm - activeSeg.startDistKm) / activeSeg.distanceKm))
    : 1;

  const currentChainage = activeSeg.direction === 'DOWN'
    ? (activeSeg.from.chainage + segFraction * activeSeg.distanceKm)
    : (activeSeg.from.chainage - segFraction * activeSeg.distanceKm);

  let closestStn = null;
  let minDiff = 999;
  MASTER_STATIONS.forEach(s => {
    const diff = Math.abs(s.chainage - currentChainage);
    if (diff < minDiff) {
      minDiff = diff;
      closestStn = s;
    }
  });

  const isAtPlatform = minDiff <= 0.150;
  const stationDisplay = isAtPlatform && closestStn
    ? `${closestStn.name} (${closestStn.code})`
    : `${activeSeg.from.code} ➔ ${activeSeg.to.code} (${closestStn ? `Near ${closestStn.name}` : ''})`;

  const status = querySec < startSec ? 'NOT STARTED' : querySec >= endSec ? 'COMPLETED' : 'RUNNING';
  const progressPct = parseFloat((progressRatio * 100).toFixed(1));
  const chainageFormatted = `${currentChainage >= 0 ? `+${currentChainage.toFixed(3)}` : currentChainage.toFixed(3)} KM`;

  return {
    queryTime: queryTimeStr,
    status,
    elapsedSeconds: elapsedSec,
    totalDurationSeconds: totalDurationSec,
    totalDurationSec,
    durationFormatted: secondsToTimeString(totalDurationSec),
    progressPercentage: progressPct,
    progressPct,
    currentChainage: parseFloat(currentChainage.toFixed(3)),
    chainageFormatted,
    currentStation: stationDisplay,
    nearestStation: {
      code: closestStn?.code || activeSeg.from.code,
      name: closestStn?.name || activeSeg.from.name,
      distanceKm: minDiff.toFixed(3)
    },
    nearestStationCode: closestStn?.code || activeSeg.from.code,
    nearestStationName: closestStn?.name || activeSeg.from.name,
    direction: activeSeg.direction,
    distanceCoveredKm,
    distanceTraversedKm: distanceCoveredKm,
    distanceRemainingKm,
    totalDistanceKm: totalDistance,
    totalSegments: segments.length,
    segmentIndex: activeSegIdx,
    segmentFrom: activeSeg.from.code,
    segmentTo: activeSeg.to.code,
    segmentProgressPct: Math.round(segFraction * 100),
    activeSegment: {
      index: activeSeg.index,
      from: activeSeg.from.code,
      to: activeSeg.to.code,
      direction: activeSeg.direction
    }
  };
}

/**
 * Given a station or location, computes the exact arrival/departure passage times along the route.
 */
export function calculateLocationBasedTime(
  routeStops = DUTY_55_ROUTE_STOPS,
  startTimeStr = "15:15:00",
  endTimeStr = "17:00:00",
  targetLocationCode = "RVR"
) {
  const { segments, totalDistance } = buildRouteSegments(routeStops);
  if (segments.length === 0 || totalDistance <= 0) return [];

  const startSec = timeStringToSeconds(startTimeStr) || (15 * 3600 + 15 * 60);
  let endSec = timeStringToSeconds(endTimeStr) || (17 * 3600);
  if (endSec < startSec) endSec += 86400;
  const totalDurationSec = Math.max(1, endSec - startSec);

  const normTarget = normalizeStationCode(targetLocationCode);
  const targetStn = MASTER_STATIONS.find(s => s.code.toUpperCase() === normTarget) ||
                    routeStops.find(s => s.code.toUpperCase() === normTarget);

  if (!targetStn) return [];

  const targetChain = targetStn.chainage;
  const passes = [];

  segments.forEach((seg, sIdx) => {
    const minC = Math.min(seg.from.chainage, seg.to.chainage);
    const maxC = Math.max(seg.from.chainage, seg.to.chainage);

    if (targetChain >= (minC - 0.001) && targetChain <= (maxC + 0.001)) {
      const distFromSegStart = Math.abs(targetChain - seg.from.chainage);
      const cumulativeDistKm = parseFloat((seg.startDistKm + distFromSegStart).toFixed(3));
      const ratio = cumulativeDistKm / totalDistance;
      const elapsedSec = Math.round(ratio * totalDurationSec);
      const passSec = Math.round(startSec + elapsedSec);

      const passTime = secondsToTimeString(passSec);
      const elapsedFormatted = secondsToTimeString(elapsedSec);

      passes.push({
        passIndex: passes.length + 1,
        stationCode: targetStn.code,
        stationName: targetStn.name,
        chainage: targetChain,
        direction: seg.direction,
        segmentIndex: sIdx,
        segmentName: `${seg.from.code} ➔ ${seg.to.code}`,
        segmentDescription: `${seg.from.code} ➔ ${seg.to.code}`,
        passTime,
        estimatedTime: passTime,
        secondsFromStart: elapsedSec,
        elapsedFormatted,
        cumulativeDistanceKm: cumulativeDistKm,
        distanceTraversedKm: cumulativeDistKm
      });
    }
  });

  return passes;
}

/**
 * Generates comprehensive station-by-station schedule with precise calculated passage times.
 */
export function generateRouteStationSchedule(
  routeStops = DUTY_55_ROUTE_STOPS,
  startTimeStr = "15:15:00",
  endTimeStr = "17:00:00"
) {
  const { segments, totalDistance } = buildRouteSegments(routeStops);
  const startSec = timeStringToSeconds(startTimeStr) || (15 * 3600 + 15 * 60);
  let endSec = timeStringToSeconds(endTimeStr) || (17 * 3600);
  if (endSec < startSec) endSec += 86400;
  const totalDurationSec = Math.max(1, endSec - startSec);

  const scheduleRows = [];

  segments.forEach(seg => {
    const isDown = seg.direction === 'DOWN';
    const minC = Math.min(seg.from.chainage, seg.to.chainage);
    const maxC = Math.max(seg.from.chainage, seg.to.chainage);

    let intermediate = MASTER_STATIONS.filter(s => s.chainage >= minC && s.chainage <= maxC);
    intermediate.sort((a, b) => isDown ? a.chainage - b.chainage : b.chainage - a.chainage);

    intermediate.forEach(stn => {
      if (scheduleRows.length > 0 && scheduleRows[scheduleRows.length - 1].stationCode === stn.code) {
        return;
      }
      const distFromSegStart = Math.abs(stn.chainage - seg.from.chainage);
      const cumDist = parseFloat((seg.startDistKm + distFromSegStart).toFixed(3));
      const ratio = cumDist / totalDistance;
      const elapsedSec = Math.round(ratio * totalDurationSec);
      const passSec = Math.round(startSec + elapsedSec);

      const passTime = secondsToTimeString(passSec);
      const elapsedFormatted = secondsToTimeString(elapsedSec);

      scheduleRows.push({
        stepIndex: scheduleRows.length + 1,
        stationCode: stn.code,
        stationName: stn.name,
        chainage: stn.chainage,
        direction: seg.direction,
        calculatedTime: passTime,
        passageTime: passTime,
        elapsedFormatted,
        distanceKm: cumDist,
        cumulativeDistanceKm: cumDist,
        segment: `${seg.from.code} ➔ ${seg.to.code}`,
        segmentName: `${seg.from.code} ➔ ${seg.to.code}`
      });
    });
  });

  return scheduleRows;
}

/**
 * Dynamic Universal Short-Loop & Turn-Back Distance Resolver
 * Calculates exact distance for ANY short loop or turn-back combination on BMRCL Green Line:
 * Takeover Station -> Turn-Back Station -> Handover Station (+ optional depot positioning delta).
 * 
 * Supports all Line 2 stations (BIET_BE, BIET, NGSA_PT, NGSA, DSH, JLHL, PYID, PEYA, YPI, YPM,
 * SSFY, MHLI, RJNR, KVPR, SPRU, SPGD, KGWA, CKPE, KRMT, NLC, LBGH, SECE, JYN, RVR, BSNK, JPN,
 * PUTH, APRC, KLPK, VJRH, TGTP, APTS, APTS_BE).
 */
export function resolveShortLoopDistance(fromLoc, turnLoc, toLoc, options = {}) {
  let effectiveTurn = turnLoc;
  let effectiveTo = toLoc;

  const rawTurnStr = String(turnLoc || "").trim();
  const isTurnBackNotation = /\b(TB|T\/B|T\.B|TRN|TURN|TURN\s*BACK|TURNBACK|REV|6\s*CAR\s*STOPPING)\b/i.test(rawTurnStr);

  if (!effectiveTo || isTurnBackNotation) {
    if (!effectiveTo) {
      effectiveTo = fromLoc; // round trip back to origin
    }
  }

  // Exact Line 2 RVR Turnback Shortloop benchmarks
  const rawFromLower = String(fromLoc || "").toLowerCase();
  const rawTurnLower = String(turnLoc || "").toLowerCase();
  const rawToLower = String(effectiveTo || "").toLowerCase();

  const isRvrTurn = rawTurnLower.includes("rvr") || rawTurnLower.includes("r.v.");
  const isFromDepot = rawFromLower.includes("dpo") || rawFromLower.includes("depot");
  const isFromNgsaPkt = rawFromLower.includes("npkt") || (rawFromLower.includes("ng") && rawFromLower.includes("pkt"));
  const isFromPyid = rawFromLower.includes("pyid") || rawFromLower.includes("peenya industry");
  const isToPyid = rawToLower.includes("pyid") || rawToLower.includes("peenya industry");

  if (isRvrTurn) {
    if (isFromDepot) return 36.40;
    if (isFromNgsaPkt) return 37.91;
    if (isFromPyid && (isToPyid || !toLoc)) return 34.40;
  }

  const normFrom = normalizeStationCode(fromLoc) || 'PYID';
  const cleanTurn = rawTurnStr.replace(/\b(TB|T\/B|T\.B|TRN|TURN\s*BACK|TURNBACK|REV|REVERSING|6\s*CAR\s*STOPPING|STOPPING)\b/gi, "").trim();
  const normTurn = normalizeStationCode(cleanTurn) || 'RVR';
  const normTo = normalizeStationCode(effectiveTo) || 'PYID';

  const chFrom = MASTER_STATIONS.find(s => s.code.toUpperCase() === normFrom)?.chainage;
  const chTurn = MASTER_STATIONS.find(s => s.code.toUpperCase() === normTurn)?.chainage;
  const chTo = MASTER_STATIONS.find(s => s.code.toUpperCase() === normTo)?.chainage;

  if (chFrom === undefined || chTurn === undefined || chTo === undefined) {
    return 0;
  }

  const outbound = Math.abs(chTurn - chFrom);
  const inbound = Math.abs(chTo - chTurn);
  let total = outbound + inbound;

  // Add depot shunting delta if starting or ending in depot
  if (normFrom === 'DEPOT' || isFromDepot) {
    total += 2.0; // Depot induction delta
  }
  if (normTo === 'DEPOT' || rawToLower.includes('dpo') || rawToLower.includes('depot') || rawToLower.includes('pdho')) {
    total += 2.0; // Depot entry delta via Road 3
  }

  return parseFloat(total.toFixed(2));
}
