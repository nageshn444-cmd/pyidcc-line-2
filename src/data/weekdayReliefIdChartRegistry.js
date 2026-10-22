/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * BMRCL LINE-2 (PEENYA DEPOT CREW CONTROL)
 * Master Reliever ID Chart & Live Train Relief Engine for All Schedule Day Types:

 * - WEEKDAY (WEF 22/Nov/2024 for TT 20/Nov/2024 APTS-BIET, 79 Duties)
 * - MONDAY (WEF 06/Jan/2025 APTS-BIET)
 * - SATURDAY & GH (WEF 15/Mar/2025 APTS-BIET)
 * - SUNDAY (WEF 08/Dec/2024 BIET-APTS)
 * 
 * Synced to Alstom ATS Relief Engine • Verified Reliever-Only Handover System
 */

import { DUTY_TEMPLATES_REGISTRY } from './dutyTemplatesRegistry.js';
import { WEEKDAY_MASTER_LINKS } from './weekdayMasterLinks.js';
import { getOperatorForDuty } from './weekdayMasterDutyRoster.js';
import { SATURDAY_MASTER_LINKS, SUNDAY_MASTER_LINKS, MONDAY_MASTER_LINKS } from './canonicalDayLinksRegistry.js';

// ============================================================================
// 1. WEEKDAY RELIEF ID CHART (WEF 22/Nov/2024 for TT 20/Nov/2024 APTS-BIET - 79 Duties)
// ============================================================================
// Canonical Weekday Train Induction Locations (WTT Timetable WEF 20/Nov/2024)
export const WEEKDAY_TRAIN_INDUCTIONS = {
  '201': 'SPGD DN',
  '202': 'NGSA DN',
  '203': 'BIET DN',
  '204': 'BIET UP',
  '205': 'NGSA UP',
  '206': 'JLHL DN-PF',
  '207': 'NLC UP',
  '208': 'PUTH UP',
  '209': 'APTS UP',
  '210': 'APTS DN',
  '211': 'PUTH DN',
  '212': 'PYID RD3',
  '213': 'DEPOT-RD3',
  '214': 'DEPOT-RD3',
  '215': 'DEPOT-RD3',
  '216': 'DEPOT-RD3',
  '217': 'BIET DN BE',
  '218': 'DEPOT-RD3',
  '219': 'DEPOT-RD3',
  '220': 'DEPOT-RD3',
  '221': 'DEPOT-RD3',
  '222': 'DEPOT-RD3',
  '223': 'DEPOT-RD3'
};

// Canonical Monday Train Induction Locations (WTT Timetable WEF 06/Jan/2025 APTS-BIET)
export const MONDAY_TRAIN_INDUCTIONS = {
  '201': 'SPGD DN',
  '202': 'NGSA DN',
  '203': 'BIET DN PF',
  '204': 'BIET UP PF',
  '205': 'NGSA UP',
  '206': '-PYID UP-B',
  '207': 'NLC UP',
  '208': 'PUTHUP',
  '209': 'APTS UP',
  '210': 'APTS DN',
  '211': 'PUTH DN',
  '212': 'PYID RD3',
  '213': 'Dpo-Rd3',
  '214': 'Dpo-Rd3',
  '215': 'Dpo-Rd3',
  '216': 'Dpo-Rd3',
  '217': 'BIET BN BE',
  '218': 'Dpo-Rd3',
  '219': 'Dpo-Rd3',
  '220': 'Dpo-Rd3',
  '221': 'NGSA PKT',
  '222': 'Dpo-Rd3',
  '223': 'Dpo-Rd3'
};

// Canonical Saturday & GH Train Induction Locations (WTT Timetable WEF 15/Mar/2025 APTS-BIET)
export const SATURDAY_TRAIN_INDUCTIONS = {
  '201': 'SPGD DN',
  '202': 'NGSA DN',
  '203': 'BIET DN',
  '204': 'BIET UP',
  '205': 'JIDL UP',
  '206': 'DEPOT-RD3',
  '207': 'NLC UP',
  '208': 'PUTH UP',
  '209': 'APTS UP',
  '210': 'APTS DN',
  '211': 'PUTH DN',
  '212': 'BT DN BE',
  '213': 'PYID RD3',
  '214': 'DEPOT-RD3',
  '215': 'DEPOT-RD3',
  '216': 'DEPOT-RD3',
  '217': 'DEPOT-RD3',
  '218': 'DEPOT-RD3',
  '219': 'DEPOT-RD3',
  '220': 'DEPOT-RD3',
  '221': 'DEPOT-RD3'
};

// Canonical Sunday Train Induction Locations (WTT Timetable WEF 08/Dec/2024 BIET-APTS)
export const SUNDAY_TRAIN_INDUCTIONS = {
  '201': 'NGSA DN',
  '202': 'APTS UP',
  '203': 'PUTH UP',
  '204': 'APTS UP',
  '205': 'APTS UP',
  '206': 'PUTH DN',
  '207': 'PYID RD3',
  '208': 'BIET DN',
  '209': 'BIET UP',
  '210': 'NGSA UP',
  '211': 'DEPOT-RD3',
  '212': 'DEPOT-RD3',
  '213': 'DEPOT-RD3',
  '214': 'DEPOT-RD3',
  '215': 'DEPOT-RD3',
  '216': 'DEPOT-RD3',
  '217': 'DEPOT-RD3',
  '218': 'DEPOT-RD3',
  '219': 'DEPOT-RD3'
};

/**
 * Returns canonical train induction locations for any given schedule day type.
 */
export function getTrainInductionsForDay(scheduleType = 'WEEKDAY') {
  const norm = normalizeScheduleDay(scheduleType);
  if (norm === 'MONDAY') return MONDAY_TRAIN_INDUCTIONS;
  if (norm === 'SUNDAY') return SUNDAY_TRAIN_INDUCTIONS;
  if (norm === 'SATURDAY' || norm === 'GH') return SATURDAY_TRAIN_INDUCTIONS;
  return WEEKDAY_TRAIN_INDUCTIONS;
}

// Canonical Weekday Train Stabling Locations (WTT Timetable WEF 20/Nov/2024 APTS-BIET)
export const WEEKDAY_TRAIN_STABLINGS = {
  '201': 'PUTH DN PF',
  '202': 'B DHO',
  '203': 'PYID Depot SBL',
  '204': 'APTS DN PF',
  '205': 'B DHO',
  '206': 'PYID Depot SBL',
  '207': 'NGSA DN PF',
  '208': 'PYID Depot SBL',
  '209': 'PYID Depot SBL',
  '210': 'SPGD DN PF',
  '211': 'BIET UP PF',
  '212': 'APTS UP PF',
  '213': 'NLC UP PF',
  '214': 'PYID Depot SBL',
  '215': 'JIDL UP PF',
  '216': 'PYID Depot SBL',
  '217': 'BIET DN PF',
  '218': 'PYID Depot SBL',
  '219': 'PYID Depot SBL',
  '220': 'PUTH UP PF',
  '221': 'BIET DN BE',
  '222': 'PYID Depot SBL',
  '223': 'NPKT / DEPOT'
};

// Canonical Monday Train Stabling Locations (WTT Timetable WEF 06/Jan/2025 APTS-BIET)
export const MONDAY_TRAIN_STABLINGS = {
  '201': 'PYID Depot SBL',
  '202': 'BIET UP PF',
  '203': 'PUTH DN PF',
  '204': 'B DHO',
  '205': 'PYID Depot SBL',
  '206': 'SPGD DN PF',
  '207': 'APTS DN PF',
  '208': 'B DHO',
  '209': 'PYID Depot SBL',
  '210': 'NGSA DN PF',
  '211': 'PYID Depot SBL',
  '212': 'APTS UP PF',
  '213': 'NLC UP PF',
  '214': 'PYID Depot SBL',
  '215': 'JIDL UP PF',
  '216': 'PYID Depot SBL',
  '217': 'BIET DN PF',
  '218': 'PYID Depot SBL',
  '219': 'PYID Depot SBL',
  '220': 'PUTH UP PF',
  '221': 'BIET DN BE',
  '222': 'PYID Depot SBL',
  '223': 'NPKT / DEPOT'
};

// Canonical Saturday & GH Train Stabling Locations (WTT Timetable WEF 15/Mar/2025 APTS-BIET)
export const SATURDAY_TRAIN_STABLINGS = {
  '201': 'B DHO',
  '202': 'SPGD DN PF',
  '203': 'APTS UP PF',
  '204': 'PYID Depot SBL',
  '205': 'PYID Depot SBL',
  '206': 'JIDL UP PF',
  '207': 'BIET DN PF',
  '208': 'APTS DN PF',
  '209': 'NLC UP PF',
  '210': 'B DHO',
  '211': 'NPKT / DEPOT',
  '212': 'PYID Depot SBL',
  '213': 'PYID Depot SBL',
  '214': 'PYID RD3',
  '215': 'PYID Depot SBL',
  '216': 'NGSA DN PF',
  '217': 'BIET UP PF',
  '218': 'PUTH UP PF',
  '219': 'PYID Depot SBL',
  '220': 'PUTH DN PF',
  '221': 'BIET DN BE'
};

// Canonical Sunday Train Stabling Locations (WTT Timetable WEF 08/Dec/2024 BIET-APTS)
export const SUNDAY_TRAIN_STABLINGS = {
  '201': 'BIET DN BE',
  '202': 'BIET UP PF',
  '203': 'B DHO',
  '204': 'PUTH UP PF',
  '205': 'B DHO',
  '206': 'APTS UP PF',
  '207': 'PYID Depot SBL',
  '208': 'B DHO',
  '209': 'SPGD DN PF',
  '210': 'JIDL UP PF',
  '211': 'PYID Depot SBL',
  '212': 'BIET DN PF',
  '213': 'PUTH DN PF',
  '214': 'B DHO',
  '215': 'APTS DN PF',
  '216': 'NGSA DN PF',
  '217': 'NLC UP PF',
  '218': 'PYID Depot SBL',
  '219': 'PYID Depot SBL'
};

/**
 * Returns canonical train stabling locations for any given schedule day type.
 */
export function getTrainStablingForDay(scheduleType = 'WEEKDAY') {
  const norm = normalizeScheduleDay(scheduleType);
  if (norm === 'MONDAY') return MONDAY_TRAIN_STABLINGS;
  if (norm === 'SUNDAY') return SUNDAY_TRAIN_STABLINGS;
  if (norm === 'SATURDAY' || norm === 'GH') return SATURDAY_TRAIN_STABLINGS;
  return WEEKDAY_TRAIN_STABLINGS;
}


export const WEEKDAY_RELIEF_ID_CHART_2024 = {
  "201": [
    {
      "from": "04:25",
      "to": "06:33",
      "duty": "73",
      "toc": "SPGD DN"
    },
    {
      "from": "06:33",
      "to": "08:48",
      "duty": "11"
    },
    {
      "from": "08:48",
      "to": "10:58",
      "duty": "08"
    },
    {
      "from": "10:58",
      "to": "13:13",
      "duty": "29"
    },
    {
      "from": "13:13",
      "to": "13:47",
      "duty": "16"
    },
    {
      "from": "13:45",
      "to": "15:29",
      "duty": "28"
    },
    {
      "from": "15:29",
      "to": "17:46",
      "duty": "55"
    },
    {
      "from": "17:46",
      "to": "19:57",
      "duty": "50"
    },
    {
      "from": "19:57",
      "to": "21:50",
      "duty": "60"
    },
    {
      "from": "21:48",
      "to": "00:10",
      "duty": "66"
    }
  ],
  "202": [
    {
      "from": "04:00",
      "to": "06:48",
      "duty": "71",
      "toc": "NGSA DN"
    },
    {
      "from": "06:48",
      "to": "08:58",
      "duty": "17"
    },
    {
      "from": "08:58",
      "to": "11:08",
      "duty": "12"
    },
    {
      "from": "11:08",
      "to": "13:21",
      "duty": "05"
    },
    {
      "from": "13:21",
      "to": "13:55",
      "duty": "11"
    },
    {
      "from": "13:53",
      "to": "15:37",
      "duty": "29"
    },
    {
      "from": "15:37",
      "to": "16:12",
      "duty": "56"
    },
    {
      "from": "16:10",
      "to": "17:57",
      "duty": "59"
    },
    {
      "from": "17:57",
      "to": "20:07",
      "duty": "52"
    },
    {
      "from": "20:07",
      "to": "21:58",
      "duty": "63"
    },
    {
      "from": "21:56",
      "to": "23:30",
      "duty": "77"
    }
  ],
  "203": [
    {
      "from": "04:15",
      "to": "06:43",
      "duty": "75",
      "toc": "BIET DN"
    },
    {
      "from": "06:41",
      "to": "07:37",
      "duty": "14"
    },
    {
      "from": "07:37",
      "to": "09:18",
      "duty": "26"
    },
    {
      "from": "09:18",
      "to": "11:28",
      "duty": "11"
    },
    {
      "from": "11:28",
      "to": "12:15",
      "duty": "07"
    },
    {
      "from": "16:10",
      "to": "17:06",
      "duty": "60"
    },
    {
      "from": "17:06",
      "to": "18:47",
      "duty": "41"
    },
    {
      "from": "18:47",
      "to": "21:00",
      "duty": "37"
    },
    {
      "from": "21:00",
      "to": "21:50",
      "duty": "59"
    }
  ],
  "204": [
    {
      "from": "04:45",
      "to": "06:58",
      "duty": "72",
      "toc": "BIET UP"
    },
    {
      "from": "06:58",
      "to": "07:47",
      "duty": "19"
    },
    {
      "from": "07:47",
      "to": "09:28",
      "duty": "27"
    },
    {
      "from": "09:28",
      "to": "11:41",
      "duty": "17"
    },
    {
      "from": "11:41",
      "to": "13:53",
      "duty": "06"
    },
    {
      "from": "13:53",
      "to": "16:08",
      "duty": "33"
    },
    {
      "from": "16:08",
      "to": "18:17",
      "duty": "37"
    },
    {
      "from": "18:17",
      "to": "20:27",
      "duty": "55"
    },
    {
      "from": "20:27",
      "to": "21:34",
      "duty": "48"
    },
    {
      "from": "21:32",
      "to": "00:15",
      "duty": "64"
    }
  ],
  "205": [
    {
      "from": "04:45",
      "to": "07:13",
      "duty": "74",
      "toc": "NGSA UP"
    },
    {
      "from": "07:11",
      "to": "08:07",
      "duty": "24"
    },
    {
      "from": "08:07",
      "to": "09:48",
      "duty": "19"
    },
    {
      "from": "09:48",
      "to": "11:58",
      "duty": "18"
    },
    {
      "from": "11:58",
      "to": "14:09",
      "duty": "13"
    },
    {
      "from": "14:09",
      "to": "16:25",
      "duty": "41"
    },
    {
      "from": "16:25",
      "to": "18:37",
      "duty": "39"
    },
    {
      "from": "18:37",
      "to": "20:47",
      "duty": "35"
    },
    {
      "from": "20:47",
      "to": "21:34",
      "duty": "50"
    },
    {
      "from": "21:30",
      "to": "00:10",
      "duty": "70"
    }
  ],
  "206": [
    {
      "from": "04:15",
      "to": "06:15",
      "duty": "76",
      "toc": "JLHL DN-PF"
    },
    {
      "from": "06:13",
      "to": "07:48",
      "duty": "03"
    },
    {
      "from": "07:48",
      "to": "09:58",
      "duty": "28"
    },
    {
      "from": "09:58",
      "to": "12:12",
      "duty": "22"
    },
    {
      "from": "12:12",
      "to": "12:43",
      "duty": "25"
    },
    {
      "from": "12:41",
      "to": "14:25",
      "duty": "17"
    },
    {
      "from": "14:25",
      "to": "16:41",
      "duty": "46"
    },
    {
      "from": "16:41",
      "to": "18:32",
      "duty": "40"
    },
    {
      "from": "18:32",
      "to": "21:05",
      "duty": "58"
    }
  ],
  "207": [
    {
      "from": "04:20",
      "to": "06:30",
      "duty": "65",
      "toc": "NLC UP"
    },
    {
      "from": "06:28",
      "to": "07:58",
      "duty": "07"
    },
    {
      "from": "07:58",
      "to": "10:08",
      "duty": "29"
    },
    {
      "from": "10:08",
      "to": "12:18",
      "duty": "23"
    },
    {
      "from": "12:18",
      "to": "12:51",
      "duty": "11"
    },
    {
      "from": "12:49",
      "to": "14:33",
      "duty": "18"
    },
    {
      "from": "14:33",
      "to": "16:48",
      "duty": "48"
    },
    {
      "from": "16:48",
      "to": "18:57",
      "duty": "44"
    },
    {
      "from": "18:57",
      "to": "21:07",
      "duty": "38"
    },
    {
      "from": "21:07",
      "to": "21:36",
      "duty": "54"
    },
    {
      "from": "21:34",
      "to": "23:55",
      "duty": "71"
    }
  ],
  "208": [
    {
      "from": "04:15",
      "to": "06:27",
      "duty": "68",
      "toc": "PUTH UP"
    },
    {
      "from": "06:25",
      "to": "08:08",
      "duty": "08"
    },
    {
      "from": "08:08",
      "to": "10:18",
      "duty": "31"
    },
    {
      "from": "10:18",
      "to": "12:33",
      "duty": "30"
    },
    {
      "from": "12:33",
      "to": "13:07",
      "duty": "22"
    },
    {
      "from": "13:05",
      "to": "14:49",
      "duty": "24"
    },
    {
      "from": "14:49",
      "to": "17:04",
      "duty": "50"
    },
    {
      "from": "17:04",
      "to": "19:17",
      "duty": "47"
    },
    {
      "from": "19:17",
      "to": "21:31",
      "duty": "41"
    },
    {
      "from": "21:31",
      "to": "22:00",
      "duty": "62"
    }
  ],
  "209": [
    {
      "from": "04:30",
      "to": "06:37",
      "duty": "67",
      "toc": "APTS UP"
    },
    {
      "from": "06:35",
      "to": "08:18",
      "duty": "12"
    },
    {
      "from": "08:18",
      "to": "10:28",
      "duty": "03"
    },
    {
      "from": "10:28",
      "to": "12:41",
      "duty": "19"
    },
    {
      "from": "12:41",
      "to": "14:57",
      "duty": "26"
    },
    {
      "from": "14:57",
      "to": "17:13",
      "duty": "51"
    },
    {
      "from": "17:13",
      "to": "19:02",
      "duty": "45"
    },
    {
      "from": "19:02",
      "to": "21:35",
      "duty": "40"
    }
  ],
  "210": [
    {
      "from": "04:47",
      "to": "06:47",
      "duty": "64",
      "toc": "APTS DN"
    },
    {
      "from": "06:45",
      "to": "08:28",
      "duty": "16"
    },
    {
      "from": "08:28",
      "to": "10:38",
      "duty": "07"
    },
    {
      "from": "10:38",
      "to": "12:49",
      "duty": "32"
    },
    {
      "from": "12:49",
      "to": "13:23",
      "duty": "33"
    },
    {
      "from": "13:21",
      "to": "15:05",
      "duty": "25"
    },
    {
      "from": "15:05",
      "to": "17:20",
      "duty": "52"
    },
    {
      "from": "17:20",
      "to": "19:12",
      "duty": "46"
    },
    {
      "from": "19:12",
      "to": "20:52",
      "duty": "61"
    },
    {
      "from": "20:52",
      "to": "21:44",
      "duty": "52"
    },
    {
      "from": "21:42",
      "to": "00:15",
      "duty": "73"
    }
  ],
  "211": [
    {
      "from": "04:40",
      "to": "06:57",
      "duty": "66",
      "toc": "PUTH DN"
    },
    {
      "from": "06:55",
      "to": "09:07",
      "duty": "20"
    },
    {
      "from": "09:07",
      "to": "11:40",
      "duty": "16"
    },
    {
      "from": "16:50",
      "to": "19:27",
      "duty": "63"
    },
    {
      "from": "19:27",
      "to": "21:37",
      "duty": "44"
    },
    {
      "from": "21:37",
      "to": "00:20",
      "duty": "72"
    }
  ],
  "212": [
    {
      "from": "06:10",
      "to": "08:03",
      "duty": "05",
      "toc": "PYID RD3"
    },
    {
      "from": "08:03",
      "to": "09:43",
      "duty": "30"
    },
    {
      "from": "09:43",
      "to": "11:23",
      "duty": "25"
    },
    {
      "from": "11:23",
      "to": "13:37",
      "duty": "03"
    },
    {
      "from": "13:37",
      "to": "15:53",
      "duty": "32"
    },
    {
      "from": "15:53",
      "to": "18:07",
      "duty": "35"
    },
    {
      "from": "18:07",
      "to": "20:17",
      "duty": "54"
    },
    {
      "from": "20:17",
      "to": "21:50",
      "duty": "51"
    },
    {
      "from": "21:48",
      "to": "00:15",
      "duty": "67"
    }
  ],
  "213": [
    {
      "from": "06:15",
      "to": "08:13",
      "duty": "04",
      "toc": "DEPOT-RD3"
    },
    {
      "from": "08:13",
      "to": "09:53",
      "duty": "32"
    },
    {
      "from": "09:53",
      "to": "11:34",
      "duty": "26"
    },
    {
      "from": "11:34",
      "to": "13:45",
      "duty": "09"
    },
    {
      "from": "13:45",
      "to": "14:19",
      "duty": "14"
    },
    {
      "from": "14:17",
      "to": "16:01",
      "duty": "44"
    },
    {
      "from": "16:01",
      "to": "17:52",
      "duty": "36"
    },
    {
      "from": "17:52",
      "to": "19:32",
      "duty": "51"
    },
    {
      "from": "19:32",
      "to": "21:46",
      "duty": "45"
    },
    {
      "from": "21:46",
      "to": "23:55",
      "duty": "65"
    }
  ],
  "214": [
    {
      "from": "06:25",
      "to": "08:23",
      "duty": "09",
      "toc": "DEPOT-RD3"
    },
    {
      "from": "08:23",
      "to": "10:03",
      "duty": "21"
    },
    {
      "from": "10:03",
      "to": "12:04",
      "duty": "27"
    },
    {
      "from": "12:04",
      "to": "14:17",
      "duty": "12"
    },
    {
      "from": "14:17",
      "to": "16:33",
      "duty": "45"
    },
    {
      "from": "16:33",
      "to": "18:22",
      "duty": "56"
    },
    {
      "from": "18:22",
      "to": "21:00",
      "duty": "36"
    }
  ],
  "215": [
    {
      "from": "06:35",
      "to": "08:33",
      "duty": "13",
      "toc": "DEPOT-RD3"
    },
    {
      "from": "08:33",
      "to": "10:13",
      "duty": "05"
    },
    {
      "from": "10:13",
      "to": "12:25",
      "duty": "14"
    },
    {
      "from": "12:25",
      "to": "12:59",
      "duty": "20"
    },
    {
      "from": "12:57",
      "to": "14:41",
      "duty": "27"
    },
    {
      "from": "14:41",
      "to": "16:57",
      "duty": "49"
    },
    {
      "from": "16:57",
      "to": "19:07",
      "duty": "33"
    },
    {
      "from": "19:07",
      "to": "21:17",
      "duty": "39"
    },
    {
      "from": "21:17",
      "to": "21:46",
      "duty": "55"
    },
    {
      "from": "21:44",
      "to": "00:15",
      "duty": "74"
    }
  ],
  "216": [
    {
      "from": "06:20",
      "to": "08:43",
      "duty": "06",
      "toc": "DEPOT-RD3"
    },
    {
      "from": "08:43",
      "to": "11:25",
      "duty": "24"
    },
    {
      "from": "16:20",
      "to": "18:42",
      "duty": "61"
    },
    {
      "from": "18:42",
      "to": "21:15",
      "duty": "57"
    }
  ],
  "217": [
    {
      "from": "06:30",
      "to": "07:27",
      "duty": "69",
      "toc": "BIET DN BE"
    },
    {
      "from": "07:25",
      "to": "09:08",
      "duty": "25"
    },
    {
      "from": "09:08",
      "to": "11:18",
      "duty": "13"
    },
    {
      "from": "11:18",
      "to": "13:29",
      "duty": "31"
    },
    {
      "from": "13:29",
      "to": "14:03",
      "duty": "10"
    },
    {
      "from": "14:01",
      "to": "15:45",
      "duty": "31"
    },
    {
      "from": "15:45",
      "to": "17:41",
      "duty": "34"
    },
    {
      "from": "17:41",
      "to": "19:22",
      "duty": "60"
    },
    {
      "from": "19:22",
      "to": "21:25",
      "duty": "62"
    },
    {
      "from": "21:25",
      "to": "21:56",
      "duty": "61"
    },
    {
      "from": "21:54",
      "to": "00:05",
      "duty": "75"
    }
  ],
  "218": [
    {
      "from": "06:30",
      "to": "08:53",
      "duty": "10",
      "toc": "DEPOT-RD3"
    },
    {
      "from": "08:53",
      "to": "11:35",
      "duty": "04"
    },
    {
      "from": "16:30",
      "to": "18:52",
      "duty": "62"
    },
    {
      "from": "18:52",
      "to": "20:32",
      "duty": "56"
    },
    {
      "from": "20:32",
      "to": "21:25",
      "duty": "53"
    }
  ],
  "219": [
    {
      "from": "06:40",
      "to": "09:03",
      "duty": "15",
      "toc": "DEPOT-RD3"
    },
    {
      "from": "09:03",
      "to": "10:43",
      "duty": "09"
    },
    {
      "from": "10:43",
      "to": "12:57",
      "duty": "28"
    },
    {
      "from": "12:57",
      "to": "13:49",
      "duty": "23"
    },
    {
      "from": "13:47",
      "to": "15:13",
      "duty": "34"
    },
    {
      "from": "15:13",
      "to": "17:28",
      "duty": "53"
    },
    {
      "from": "17:28",
      "to": "19:37",
      "duty": "48"
    },
    {
      "from": "19:37",
      "to": "20:30",
      "duty": "33"
    }
  ],
  "220": [
    {
      "from": "06:50",
      "to": "09:13",
      "duty": "18",
      "toc": "DEPOT-RD3"
    },
    {
      "from": "09:13",
      "to": "10:53",
      "duty": "06"
    },
    {
      "from": "10:53",
      "to": "13:05",
      "duty": "21"
    },
    {
      "from": "13:05",
      "to": "13:39",
      "duty": "04"
    },
    {
      "from": "13:37",
      "to": "15:21",
      "duty": "30"
    },
    {
      "from": "15:21",
      "to": "17:36",
      "duty": "54"
    },
    {
      "from": "17:36",
      "to": "19:47",
      "duty": "49"
    },
    {
      "from": "19:47",
      "to": "21:42",
      "duty": "47"
    },
    {
      "from": "21:42",
      "to": "23:50",
      "duty": "68"
    }
  ],
  "221": [
    {
      "from": "07:00",
      "to": "07:57",
      "duty": "21",
      "toc": "DEPOT-RD3"
    },
    {
      "from": "07:55",
      "to": "09:38",
      "duty": "14"
    },
    {
      "from": "09:38",
      "to": "11:48",
      "duty": "20"
    },
    {
      "from": "11:48",
      "to": "14:01",
      "duty": "08"
    },
    {
      "from": "14:01",
      "to": "14:35",
      "duty": "19"
    },
    {
      "from": "14:33",
      "to": "16:17",
      "duty": "47"
    },
    {
      "from": "16:17",
      "to": "18:27",
      "duty": "38"
    },
    {
      "from": "18:27",
      "to": "20:37",
      "duty": "59"
    },
    {
      "from": "20:37",
      "to": "21:24",
      "duty": "49"
    },
    {
      "from": "21:22",
      "to": "23:10",
      "duty": "69"
    }
  ],
  "222": [
    {
      "from": "07:00",
      "to": "09:23",
      "duty": "22",
      "toc": "DEPOT-RD3"
    },
    {
      "from": "09:23",
      "to": "11:55",
      "duty": "10"
    },
    {
      "from": "15:50",
      "to": "18:12",
      "duty": "57"
    },
    {
      "from": "18:12",
      "to": "20:40",
      "duty": "34"
    }
  ],
  "223": [
    {
      "from": "07:10",
      "to": "09:33",
      "duty": "23",
      "toc": "DEPOT-RD3"
    },
    {
      "from": "09:33",
      "to": "12:00",
      "duty": "15"
    },
    {
      "from": "15:45",
      "to": "18:02",
      "duty": "58"
    },
    {
      "from": "18:02",
      "to": "19:42",
      "duty": "53"
    },
    {
      "from": "19:42",
      "to": "21:54",
      "duty": "46"
    },
    {
      "from": "21:54",
      "to": "22:40",
      "duty": "76"
    }
  ],
  "Couns": [
    {
      "from": "13:00",
      "to": "14:20",
      "duty": "15"
    },
    {
      "from": "13:35",
      "to": "15:23",
      "duty": "35"
    },
    {
      "from": "13:35",
      "to": "15:31",
      "duty": "36"
    },
    {
      "from": "13:35",
      "to": "15:38",
      "duty": "37"
    },
    {
      "from": "13:35",
      "to": "15:47",
      "duty": "38"
    },
    {
      "from": "13:35",
      "to": "15:55",
      "duty": "39"
    },
    {
      "from": "13:50",
      "to": "16:11",
      "duty": "40"
    },
    {
      "from": "13:20",
      "to": "PYID",
      "duty": "20"
    },
    {
      "from": "13:30",
      "to": "PYID",
      "duty": "21"
    },
    {
      "from": "13:30",
      "to": "PYID",
      "duty": "22"
    }
  ]
};

export const WEEKDAY_RELIEF_ID_CHART_2024_META = {
  dayType: 'WEEKDAY',
  badge: 'WEEKDAY LINK (22/NOV/2024)',
  title: 'ID CHART for Line 2 WEEKDAY Link WEF 22/Nov/2024 for Time Table Dated 20/Nov/2024 (APTS - BIET)',
  effectiveDate: '22/Nov/2024',
  corridor: 'APTS - BIET',
  depot: 'Peenya Industry Depot Crew Control (PYIDCC)',
  edition: '2024',
  dutyCount: 79,
  trains: ["201","202","203","204","205","206","207","208","209","210","211","212","213","214","215","216","217","218","219","220","221","222","223","Couns"]
};

// Default canonical Master ID Chart for Weekday (WEF 22/Nov/2024 for TT 20/Nov/2024 APTS-BIET - 79 Duties)
export const WEEKDAY_RELIEF_ID_CHART = WEEKDAY_RELIEF_ID_CHART_2024;
export const WEEKDAY_RELIEF_ID_CHART_META = WEEKDAY_RELIEF_ID_CHART_2024_META;
// Backward compatibility aliases pointing to 22/Nov/2024 79 duties chart
export const WEEKDAY_RELIEF_ID_CHART_2026 = WEEKDAY_RELIEF_ID_CHART_2024;
export const WEEKDAY_RELIEF_ID_CHART_2026_META = WEEKDAY_RELIEF_ID_CHART_2024_META;

// ============================================================================
// 2. MONDAY 04:00hrs SERVICE RELIEF ID CHART (WEF 06/Jan/2025 APTS - BIET)
// ============================================================================
export const MONDAY_RELIEF_ID_CHART = {
  '201': [
    { from: '06:35', to: '08:18', duty: '14', toc: 'SPGD DN' },
    { from: '08:18', to: '10:28', duty: '10' },
    { from: '10:28', to: '12:41', duty: '16' },
    { from: '12:41', to: '14:57', duty: '26' },
    { from: '14:57', to: '17:13', duty: '51' },
    { from: '17:13', to: '19:02', duty: '45' },
    { from: '19:02', to: '21:35', duty: '40' }
  ],
  '202': [
    { from: '06:18', to: '06:57', duty: '06', toc: 'NGSA DN' },
    { from: '06:57', to: '09:07', duty: '22' },
    { from: '09:07', to: '11:40', duty: '19' },
    { from: '16:50', to: '19:27', duty: '63' },
    { from: '19:27', to: '21:37', duty: '44' },
    { from: '21:37', to: '00:20', duty: '72' }
  ],
  '203': [
    { from: '06:31', to: '08:48', duty: '13', toc: 'BIET DN PF' },
    { from: '08:48', to: '10:58', duty: '09' },
    { from: '10:58', to: '13:13', duty: '29' },
    { from: '13:13', to: '13:47', duty: '19' },
    { from: '13:45', to: '15:29', duty: '28' },
    { from: '15:29', to: '17:46', duty: '55' },
    { from: '17:46', to: '19:57', duty: '50' },
    { from: '19:57', to: '21:50', duty: '60' },
    { from: '21:48', to: '00:10', duty: '66' }
  ],
  '204': [
    { from: '06:28', to: '08:58', duty: '11', toc: 'BIET UP PF' },
    { from: '08:58', to: '11:08', duty: '14' },
    { from: '11:08', to: '13:21', duty: '05' },
    { from: '13:53', to: '15:37', duty: '29' },
    { from: '15:37', to: '16:12', duty: '56' },
    { from: '16:10', to: '17:57', duty: '59' },
    { from: '17:57', to: '20:07', duty: '52' },
    { from: '20:07', to: '21:58', duty: '63' },
    { from: '21:56', to: '23:30', duty: '77' }
  ],
  '205': [
    { from: '06:41', to: '07:37', duty: '17', toc: 'NGSA UP' },
    { from: '07:35', to: '09:18', duty: '26' },
    { from: '09:18', to: '11:28', duty: '13' },
    { from: '11:28', to: '12:15', duty: '08' },
    { from: '16:10', to: '17:06', duty: '60' },
    { from: '17:04', to: '18:47', duty: '41' },
    { from: '18:47', to: '21:00', duty: '37' },
    { from: '21:00', to: '21:50', duty: '59' }
  ],
  '206': [
    { from: '06:45', to: '08:28', duty: '19', toc: '-PYID UP-B' },
    { from: '08:28', to: '10:38', duty: '03' },
    { from: '10:38', to: '12:49', duty: '32' },
    { from: '12:49', to: '13:23', duty: '33' },
    { from: '13:23', to: '15:05', duty: '35' },
    { from: '15:05', to: '17:20', duty: '52' },
    { from: '17:20', to: '19:12', duty: '46' },
    { from: '19:12', to: '20:53', duty: '61' },
    { from: '20:53', to: '21:44', duty: '52' },
    { from: '21:42', to: '00:15', duty: '73' }
  ],
  '207': [
    { from: '06:38', to: '07:47', duty: '16', toc: 'NLC UP' },
    { from: '07:45', to: '09:28', duty: '27' },
    { from: '09:28', to: '11:41', duty: '11' },
    { from: '11:41', to: '13:53', duty: '07' },
    { from: '13:53', to: '16:08', duty: '33' },
    { from: '16:08', to: '18:17', duty: '37' },
    { from: '18:17', to: '20:27', duty: '55' },
    { from: '20:27', to: '21:34', duty: '48' },
    { from: '21:32', to: '00:15', duty: '64' }
  ],
  '208': [
    { from: '06:53', to: '08:07', duty: '21', toc: 'PUTHUP' },
    { from: '08:07', to: '09:48', duty: '16' },
    { from: '09:48', to: '11:58', duty: '20' },
    { from: '11:58', to: '14:09', duty: '15' },
    { from: '14:09', to: '16:25', duty: '41' },
    { from: '16:25', to: '18:37', duty: '39' },
    { from: '18:37', to: '20:47', duty: '35' },
    { from: '20:47', to: '21:34', duty: '50' },
    { from: '21:32', to: '00:10', duty: '70' }
  ],
  '209': [
    { from: '06:13', to: '07:48', duty: '08', toc: 'APTS UP' },
    { from: '07:48', to: '09:58', duty: '28' },
    { from: '09:58', to: '12:12', duty: '24' },
    { from: '12:41', to: '14:25', duty: '22' },
    { from: '14:25', to: '16:41', duty: '46' },
    { from: '16:41', to: '18:32', duty: '40' },
    { from: '18:32', to: '21:05', duty: '58' }
  ],
  '210': [
    { from: '06:28', to: '07:58', duty: '08', toc: 'APTS DN' },
    { from: '07:58', to: '10:08', duty: '29' },
    { from: '10:08', to: '12:18', duty: '25' },
    { from: '12:18', to: '12:51', duty: '13' },
    { from: '12:49', to: '14:33', duty: '20' },
    { from: '14:33', to: '16:48', duty: '48' },
    { from: '16:48', to: '18:57', duty: '44' },
    { from: '18:57', to: '21:07', duty: '38' },
    { from: '21:07', to: '21:36', duty: '54' },
    { from: '21:34', to: '23:55', duty: '71' }
  ],
  '211': [
    { from: '06:25', to: '08:08', duty: '09', toc: 'PUTH DN' },
    { from: '08:08', to: '10:18', duty: '31' },
    { from: '10:18', to: '12:33', duty: '30' },
    { from: '12:33', to: '13:07', duty: '24' },
    { from: '13:05', to: '14:49', duty: '27' },
    { from: '14:49', to: '17:04', duty: '50' },
    { from: '17:04', to: '19:17', duty: '47' },
    { from: '19:17', to: '21:31', duty: '41' },
    { from: '21:31', to: '22:00', duty: '62' }
  ],
  '212': [
    { from: '06:10', to: '08:03', duty: '03', toc: 'PYID RD3' },
    { from: '08:03', to: '09:43', duty: '30' },
    { from: '09:43', to: '11:23', duty: '06' },
    { from: '11:23', to: '13:37', duty: '05' },
    { from: '13:37', to: '15:53', duty: '32' },
    { from: '15:53', to: '18:07', duty: '35' },
    { from: '18:07', to: '20:17', duty: '54' },
    { from: '20:17', to: '21:50', duty: '51' },
    { from: '21:48', to: '00:15', duty: '67' }
  ],
  '213': [
    { from: '06:15', to: '08:13', duty: '04', toc: 'Dpo-Rd3' },
    { from: '08:13', to: '09:53', duty: '32' },
    { from: '09:53', to: '11:34', duty: '26' },
    { from: '11:34', to: '13:45', duty: '10' },
    { from: '14:17', to: '16:01', duty: '44' },
    { from: '16:01', to: '17:52', duty: '36' },
    { from: '17:52', to: '19:32', duty: '51' },
    { from: '19:32', to: '21:46', duty: '45' },
    { from: '21:46', to: '23:55', duty: '65' }
  ],
  '214': [
    { from: '06:25', to: '08:23', duty: '10', toc: 'Dpo-Rd3' },
    { from: '08:23', to: '10:03', duty: '23' },
    { from: '10:03', to: '12:04', duty: '27' },
    { from: '12:04', to: '14:17', duty: '14' },
    { from: '14:17', to: '16:33', duty: '45' },
    { from: '16:33', to: '18:22', duty: '56' },
    { from: '18:22', to: '21:00', duty: '36' }
  ],
  '215': [
    { from: '06:35', to: '08:33', duty: '15', toc: 'Dpo-Rd3' },
    { from: '08:33', to: '10:13', duty: '05' },
    { from: '10:13', to: '12:25', duty: '17' },
    { from: '12:25', to: '12:59', duty: '11' },
    { from: '12:57', to: '14:41', duty: '21' },
    { from: '14:41', to: '16:57', duty: '49' },
    { from: '16:57', to: '19:07', duty: '33' },
    { from: '19:07', to: '21:17', duty: '39' },
    { from: '21:17', to: '21:46', duty: '55' },
    { from: '21:44', to: '00:15', duty: '74' }
  ],
  '216': [
    { from: '06:20', to: '08:43', duty: '07', toc: 'Dpo-Rd3' },
    { from: '08:43', to: '11:25', duty: '21' },
    { from: '16:20', to: '18:42', duty: '61' },
    { from: '18:42', to: '21:15', duty: '57' }
  ],
  '217': [
    { from: '07:25', to: '09:08', duty: '06', toc: 'BIET BN BE' },
    { from: '09:08', to: '11:18', duty: '15' },
    { from: '11:18', to: '13:29', duty: '03' },
    { from: '13:29', to: '14:03', duty: '12' },
    { from: '14:01', to: '15:45', duty: '31' },
    { from: '15:45', to: '17:41', duty: '34' },
    { from: '17:41', to: '19:22', duty: '60' },
    { from: '19:22', to: '21:25', duty: '62' },
    { from: '21:25', to: '21:56', duty: '61' },
    { from: '21:54', to: '00:05', duty: '75' }
  ],
  '218': [
    { from: '06:30', to: '08:53', duty: '12', toc: 'Dpo-Rd3' },
    { from: '08:53', to: '11:35', duty: '04' },
    { from: '16:30', to: '18:52', duty: '62' },
    { from: '18:52', to: '20:32', duty: '56' },
    { from: '20:32', to: '21:25', duty: '53' }
  ],
  '219': [
    { from: '06:40', to: '09:03', duty: '18', toc: 'Dpo-Rd3' },
    { from: '09:03', to: '10:43', duty: '10' },
    { from: '10:43', to: '12:57', duty: '28' },
    { from: '12:57', to: '13:49', duty: '25' },
    { from: '13:47', to: '15:13', duty: '34' },
    { from: '15:13', to: '17:28', duty: '53' },
    { from: '17:28', to: '19:37', duty: '48' }
  ],
  '220': [
    { from: '06:50', to: '09:13', duty: '20', toc: 'Dpo-Rd3' },
    { from: '09:13', to: '10:53', duty: '07' },
    { from: '10:53', to: '13:05', duty: '23' },
    { from: '13:05', to: '13:39', duty: '04' },
    { from: '13:37', to: '15:21', duty: '30' },
    { from: '15:21', to: '17:36', duty: '54' },
    { from: '17:36', to: '19:47', duty: '49' },
    { from: '19:47', to: '21:42', duty: '47' },
    { from: '21:42', to: '23:50', duty: '68' }
  ],
  '221': [
    { from: '07:00', to: '07:57', duty: '23', toc: 'NGSA PKT' },
    { from: '07:55', to: '09:38', duty: '17' },
    { from: '09:38', to: '11:48', duty: '22' },
    { from: '11:48', to: '14:01', duty: '09' },
    { from: '14:33', to: '16:17', duty: '47' },
    { from: '16:17', to: '18:27', duty: '38' },
    { from: '18:27', to: '20:37', duty: '59' },
    { from: '20:37', to: '21:24', duty: '49' },
    { from: '21:22', to: '23:10', duty: '69' }
  ],
  '222': [
    { from: '07:00', to: '09:23', duty: '24', toc: 'Dpo-Rd3' },
    { from: '09:23', to: '11:55', duty: '12' },
    { from: '15:50', to: '18:12', duty: '57' },
    { from: '18:12', to: '20:40', duty: '34' }
  ],
  '223': [
    { from: '07:10', to: '09:33', duty: '25', toc: 'Dpo-Rd3' },
    { from: '09:33', to: '12:00', duty: '18' },
    { from: '15:45', to: '18:02', duty: '58' },
    { from: '18:02', to: '19:42', duty: '53' },
    { from: '19:42', to: '21:54', duty: '46' },
    { from: '21:54', to: '22:40', duty: '76' }
  ],
  'Couns': [
    { from: '13:00', to: '14:20', duty: '18' },
    { from: '13:35', to: '15:31', duty: '36' },
    { from: '13:35', to: '15:38', duty: '37' },
    { from: '13:35', to: '15:47', duty: '38' },
    { from: '13:35', to: '15:55', duty: '39' },
    { from: '13:50', to: '16:11', duty: '40' }
  ]
};

export const MONDAY_RELIEF_ID_CHART_META = {
  dayType: 'MONDAY',
  title: 'ID CHART for MONDAY 04:00hrs Service Link WEF 06/Jan/2025 (APTS - BIET)',
  badge: 'MONDAY LINK (APTS-BIET)',
  totalTrains: 24,
  trains: ['201', '202', '203', '204', '205', '206', '207', '208', '209', '210', '211', '212', '213', '214', '215', '216', '217', '218', '219', '220', '221', '222', '223', 'Couns']
};

// ============================================================================
// 3. SATURDAY & GH RELIEF ID CHART (WEF 17/Oct/2026 APTS - BIET)
// ============================================================================
export const SATURDAY_RELIEF_ID_CHART = {
  '201': [
    { duty: '71', toc: 'SPGD DN PF', from: '04:25', to: '06:33', hoc: '' },
    { duty: '10', toc: 'PYID', from: '06:33', to: '08:54', hoc: '' },
    { duty: '05', toc: '', from: '08:54', to: '11:06', hoc: '' },
    { duty: '07', toc: '', from: '11:06', to: '13:21', hoc: '' },
    { duty: '18', toc: '', from: '13:21', to: '13:55', hoc: 'PYID DN' },
    { duty: '24', toc: 'PYID DN', from: '13:53', to: '15:37', hoc: '' },
    { duty: '32', toc: '', from: '15:37', to: '17:56', hoc: '' },
    { duty: '44', toc: '', from: '17:56', to: '20:08', hoc: '' },
    { duty: '40', toc: '', from: '20:08', to: '21:40', hoc: 'PUTH UP' },
    { duty: '70', toc: 'PUTH UP', from: '21:40', to: '23:30', hoc: 'B DHO' }
  ],
  '202': [
    { duty: '68', toc: 'NGSA DN PF', from: '04:00', to: '06:48', hoc: '' },
    { duty: '15', toc: 'PYID', from: '06:48', to: '09:05', hoc: '' },
    { duty: '09', toc: '', from: '09:05', to: '11:17', hoc: '' },
    { duty: '12', toc: '', from: '11:17', to: '13:29', hoc: '' },
    { duty: '23', toc: '', from: '13:29', to: '15:45', hoc: '' },
    { duty: '46', toc: 'PYID', from: '15:45', to: '17:41', hoc: '' },
    { duty: '42', toc: '', from: '17:41', to: '19:18', hoc: '' },
    { duty: '53', toc: '', from: '19:18', to: '20:57', hoc: '' },
    { duty: '51', toc: '', from: '20:57', to: '21:44', hoc: 'KGWA DN' },
    { duty: '71', toc: 'KGWA DN', from: '21:42', to: '00:00', hoc: 'SPGD DnPF' }
  ],
  '203': [
    { duty: '73', toc: 'BIET DN PF', from: '04:30', to: '07:03', hoc: '' },
    { duty: '17', toc: 'PYID', from: '07:03', to: '09:16', hoc: '' },
    { duty: '13', toc: '', from: '09:16', to: '11:28', hoc: '' },
    { duty: '05', toc: '', from: '11:28', to: '12:10', hoc: 'P DHO' },
    { duty: '52', toc: 'Dpo - Rd3', from: '16:20', to: '18:34', hoc: '' },
    { duty: '48', toc: '', from: '18:34', to: '20:13', hoc: '' },
    { duty: '38', toc: '', from: '20:13', to: '21:50', hoc: 'PUTH UP' },
    { duty: '64', toc: 'PUTH UP', from: '21:50', to: '00:15', hoc: 'APTS UP' }
  ],
  '204': [
    { duty: '69', toc: 'BIET UP PF', from: '04:40', to: '07:18', hoc: '' },
    { duty: '19', toc: 'PYID', from: '07:18', to: '09:38', hoc: '' },
    { duty: '14', toc: '', from: '09:38', to: '11:50', hoc: '' },
    { duty: '10', toc: '', from: '11:50', to: '14:09', hoc: '' },
    { duty: '35', toc: 'PYID', from: '14:09', to: '16:25', hoc: '' },
    { duty: '47', toc: '', from: '16:25', to: '18:40', hoc: '' },
    { duty: '49', toc: '', from: '18:40', to: '20:52', hoc: '' },
    { duty: '50', toc: '', from: '20:52', to: '21:30', hoc: 'P DHO' }
  ],
  '205': [
    { duty: '72', toc: 'JIDL UP', from: '04:45', to: '06:55', hoc: 'PUTH UP' },
    { duty: '16', toc: 'PUTH UP', from: '06:55', to: '08:06', hoc: 'PYID DN' },
    { duty: '23', toc: 'PYID DN', from: '08:04', to: '09:49', hoc: '' },
    { duty: '21', toc: '', from: '09:49', to: '12:01', hoc: '' },
    { duty: '15', toc: '', from: '12:01', to: '14:25', hoc: '' },
    { duty: '37', toc: 'PYID', from: '14:25', to: '16:41', hoc: '' },
    { duty: '31', toc: '', from: '16:41', to: '18:23', hoc: '' },
    { duty: '32', toc: '', from: '18:23', to: '20:40', hoc: 'P DHO' }
  ],
  '206': [
    { duty: '70', toc: 'DEPOT', from: '04:30', to: '06:15', hoc: 'KGWA DN' },
    { duty: '03', toc: 'KGWA DN', from: '06:13', to: '07:48', hoc: '' },
    { duty: '22', toc: 'PYID', from: '07:48', to: '10:00', hoc: '' },
    { duty: '18', toc: '', from: '10:00', to: '12:11', hoc: '' },
    { duty: '13', toc: '', from: '12:11', to: '14:33', hoc: '' },
    { duty: '40', toc: 'PYID', from: '14:33', to: '16:49', hoc: '' },
    { duty: '34', toc: '', from: '16:49', to: '19:02', hoc: '' },
    { duty: '52', toc: '', from: '19:02', to: '21:14', hoc: '' },
    { duty: '49', toc: '', from: '21:14', to: '21:46', hoc: 'PYID DN' },
    { duty: '72', toc: 'PYID DN', from: '21:44', to: '00:20', hoc: 'JIDL UpPf' }
  ],
  '207': [
    { duty: '62', toc: 'NLC UP PF', from: '04:20', to: '06:30', hoc: 'KGWA DN' },
    { duty: '08', toc: 'KGWA DN', from: '06:28', to: '07:59', hoc: '' },
    { duty: '25', toc: 'PYID', from: '07:59', to: '10:11', hoc: '' },
    { duty: '20', toc: '', from: '10:11', to: '12:21', hoc: '' },
    { duty: '17', toc: '', from: '12:21', to: '14:41', hoc: '' },
    { duty: '41', toc: 'PYID', from: '14:41', to: '16:57', hoc: '' },
    { duty: '35', toc: '', from: '16:57', to: '19:13', hoc: '' },
    { duty: '36', toc: '', from: '19:13', to: '21:25', hoc: '' },
    { duty: '53', toc: '', from: '21:25', to: '21:56', hoc: 'PYID DN' },
    { duty: '73', toc: 'PYID DN', from: '21:54', to: '00:15', hoc: 'BIET DnPf' }
  ],
  '208': [
    { duty: '61', toc: 'PUTH UP', from: '04:15', to: '06:27', hoc: 'PYID DN' },
    { duty: '07', toc: 'PYID DN', from: '06:25', to: '08:10', hoc: '' },
    { duty: '03', toc: '', from: '08:10', to: '10:22', hoc: '' },
    { duty: '24', toc: '', from: '10:22', to: '12:31', hoc: '' },
    { duty: '11', toc: '', from: '12:31', to: '13:07', hoc: 'PYID DN' },
    { duty: '20', toc: 'PYID DN', from: '13:05', to: '14:49', hoc: '' },
    { duty: '39', toc: 'PYID', from: '14:49', to: '17:04', hoc: '' },
    { duty: '36', toc: '', from: '17:04', to: '18:45', hoc: '' },
    { duty: '50', toc: '', from: '18:45', to: '20:24', hoc: '' },
    { duty: '45', toc: '', from: '20:24', to: '21:34', hoc: 'PUTH DN' },
    { duty: '60', toc: 'PUTH DN', from: '21:32', to: '00:15', hoc: 'APTS DN' }
  ],
  '209': [
    { duty: '64', toc: 'APTS UP', from: '04:30', to: '06:38', hoc: 'PYID DN' },
    { duty: '12', toc: 'PYID DN', from: '06:36', to: '08:21', hoc: '' },
    { duty: '27', toc: 'PYID', from: '08:21', to: '10:33', hoc: '' },
    { duty: '26', toc: '', from: '10:33', to: '12:49', hoc: '' },
    { duty: '14', toc: '', from: '12:49', to: '13:41', hoc: 'KGWA DN' },
    { duty: '32', toc: 'KGWA DN', from: '13:39', to: '15:05', hoc: '' },
    { duty: '43', toc: 'PYID', from: '15:05', to: '17:20', hoc: '' },
    { duty: '40', toc: '', from: '17:20', to: '19:35', hoc: '' },
    { duty: '41', toc: '', from: '19:35', to: '21:45', hoc: '' },
    { duty: '62', toc: 'PYID', from: '21:45', to: '23:45', hoc: 'NLC UP' }
  ],
  '210': [
    { duty: '60', toc: 'APTS DN', from: '04:40', to: '06:49', hoc: 'PYID DN' },
    { duty: '09', toc: 'PYID DN', from: '06:47', to: '08:32', hoc: '' },
    { duty: '08', toc: '', from: '08:32', to: '10:44', hoc: '' },
    { duty: '04', toc: '', from: '10:44', to: '12:57', hoc: '' },
    { duty: '21', toc: '', from: '12:57', to: '15:13', hoc: '' },
    { duty: '44', toc: 'PYID', from: '15:13', to: '17:28', hoc: '' },
    { duty: '41', toc: '', from: '17:28', to: '19:07', hoc: '' },
    { duty: '47', toc: '', from: '19:07', to: '20:46', hoc: '' },
    { duty: '46', toc: '', from: '20:46', to: '21:34', hoc: 'KGWA DN' },
    { duty: '66', toc: 'KGWA DN', from: '21:32', to: '00:00', hoc: 'B DHO' }
  ],
  '211': [
    { duty: '63', toc: 'PUTH DN', from: '05:00', to: '06:18', hoc: '' },
    { duty: '06', toc: 'PYID', from: '06:18', to: '08:43', hoc: '' },
    { duty: '16', toc: '', from: '08:43', to: '10:55', hoc: '' },
    { duty: '03', toc: '', from: '10:55', to: '11:40', hoc: 'P DHO' },
    { duty: '51', toc: 'Dpo - Rd3', from: '15:50', to: '18:01', hoc: '' },
    { duty: '38', toc: '', from: '18:01', to: '19:40', hoc: '' },
    { duty: '35', toc: '', from: '19:40', to: '21:34', hoc: 'KGWA UP' },
    { duty: '67', toc: 'KGWA UP', from: '21:34', to: '22:30', hoc: 'N PKT/Depot' }
  ],
  '212': [
    { duty: '65', toc: 'BT DN BE', from: '06:30', to: '07:44', hoc: 'PYID DN' },
    { duty: '21', toc: 'PYID DN', from: '07:42', to: '09:27', hoc: '' },
    { duty: '11', toc: '', from: '09:27', to: '11:39', hoc: '' },
    { duty: '06', toc: '', from: '11:39', to: '13:53', hoc: '' },
    { duty: '25', toc: '', from: '13:53', to: '15:48', hoc: 'KGWA UP' },
    { duty: '47', toc: 'KGWA UP', from: '15:46', to: '16:08', hoc: '' },
    { duty: '50', toc: 'PYID', from: '16:08', to: '18:18', hoc: '' },
    { duty: '30', toc: '', from: '18:18', to: '20:30', hoc: '' },
    { duty: '43', toc: '', from: '20:30', to: '21:10', hoc: 'P DHO' }
  ],
  '213': [
    { duty: '04', toc: 'PYID RD3', from: '06:15', to: '08:04', hoc: '' },
    { duty: '24', toc: 'PYID', from: '08:04', to: '09:43', hoc: '' },
    { duty: '15', toc: '', from: '09:43', to: '11:22', hoc: '' },
    { duty: '08', toc: '', from: '11:22', to: '13:37', hoc: '' },
    { duty: '26', toc: '', from: '13:37', to: '15:53', hoc: '' },
    { duty: '48', toc: 'PYID', from: '15:53', to: '18:07', hoc: '' },
    { duty: '46', toc: '', from: '18:07', to: '20:19', hoc: '' },
    { duty: '42', toc: '', from: '20:19', to: '21:00', hoc: 'P DHO' }
  ],
  '214': [
    { duty: '66', toc: 'PDC Only Dpo-Rd3/NU PDC', from: '05:30', to: '06:30', hoc: '' },
    { duty: '05', toc: '', from: '06:15', to: '08:15', hoc: '' },
    { duty: '26', toc: 'PYID', from: '08:15', to: '09:54', hoc: '' },
    { duty: '17', toc: '', from: '09:54', to: '11:33', hoc: '' },
    { duty: '16', toc: '', from: '11:33', to: '13:45', hoc: '' },
    { duty: '27', toc: '', from: '13:45', to: '16:01', hoc: '' },
    { duty: '30', toc: '', from: '16:01', to: '17:51', hoc: '' },
    { duty: '39', toc: '', from: '17:51', to: '19:29', hoc: '' },
    { duty: '34', toc: '', from: '19:29', to: '21:45', hoc: 'RD3' }
  ],
  '215': [
    { duty: '54', toc: 'Dpo-Rd3', from: '06:05', to: '08:26', hoc: '' },
    { duty: '56', toc: 'PYID', from: '08:26', to: '10:05', hoc: '' },
    { duty: '55', toc: '', from: '10:05', to: '11:44', hoc: '' },
    { duty: '54', toc: '', from: '11:44', to: '13:41', hoc: 'KGWA Up' },
    { duty: '57', toc: 'KGWA Up', from: '13:40', to: '14:01', hoc: '' },
    { duty: '56', toc: '', from: '14:01', to: '15:57', hoc: 'KGWA Up' },
    { duty: '59', toc: 'KGWA Up', from: '15:55', to: '16:17', hoc: '' },
    { duty: '58', toc: '', from: '16:17', to: '18:29', hoc: '' },
    { duty: '57', toc: '', from: '18:29', to: '20:41', hoc: '' },
    { duty: '59', toc: '', from: '20:41', to: '21:25', hoc: 'P DHO' }
  ],
  '216': [
    { duty: '66', toc: 'PDC Only Dpo-Rd3/NU PDC', from: '05:30', to: '06:30', hoc: '' },
    { duty: '13', toc: '', from: '06:45', to: '08:37', hoc: '' },
    { duty: '04', toc: '', from: '08:37', to: '10:16', hoc: '' },
    { duty: '19', toc: '', from: '10:16', to: '11:55', hoc: '' },
    { duty: '09', toc: '', from: '11:55', to: '14:17', hoc: '' },
    { duty: '36', toc: 'PYID', from: '14:17', to: '16:33', hoc: '' },
    { duty: '53', toc: 'PYID', from: '16:33', to: '18:51', hoc: '' },
    { duty: '31', toc: '', from: '18:51', to: '21:03', hoc: '' },
    { duty: '48', toc: '', from: '21:03', to: '21:36', hoc: 'PYID DN' },
    { duty: '68', toc: 'PYID DN', from: '21:34', to: '23:55', hoc: 'NG DN PF' }
  ],
  '217': [
    { duty: '11', toc: 'Dpo - Rd3', from: '06:35', to: '08:48', hoc: '' },
    { duty: '07', toc: '', from: '08:48', to: '10:27', hoc: '' },
    { duty: '23', toc: '', from: '10:27', to: '12:41', hoc: '' },
    { duty: '19', toc: '', from: '12:41', to: '14:57', hoc: '' },
    { duty: '42', toc: 'PYID', from: '14:57', to: '17:13', hoc: '' },
    { duty: '37', toc: '', from: '17:13', to: '19:24', hoc: '' },
    { duty: '33', toc: '', from: '19:24', to: '21:35', hoc: '' },
    { duty: '69', toc: 'PYID', from: '21:35', to: '00:15', hoc: 'BIET UP PF' }
  ],
  '218': [
    { duty: '14', toc: 'Dpo - Rd3', from: '06:45', to: '08:59', hoc: '' },
    { duty: '12', toc: '', from: '08:59', to: '10:38', hoc: '' },
    { duty: '22', toc: '', from: '10:38', to: '11:20', hoc: 'P DHO' },
    { duty: '49', toc: 'Dpo - Rd3', from: '16:00', to: '18:12', hoc: '' },
    { duty: '45', toc: '', from: '18:12', to: '19:51', hoc: '' },
    { duty: '37', toc: '', from: '19:51', to: '21:42', hoc: 'KGWA UP' },
    { duty: '61', toc: 'KGWA UP', from: '21:42', to: '23:50', hoc: 'PUTH UP' }
  ],
  '219': [
    { duty: '55', toc: 'Dpo-Rd3', from: '07:00', to: '09:10', hoc: '' },
    { duty: '54', toc: '', from: '09:10', to: '10:49', hoc: '' },
    { duty: '56', toc: '', from: '10:49', to: '13:05', hoc: '' },
    { duty: '55', toc: '', from: '13:05', to: '14:17', hoc: 'PUTH Dn' },
    { duty: '58', toc: 'PUTH Dn', from: '14:15', to: '15:21', hoc: '' },
    { duty: '57', toc: '', from: '15:21', to: '17:36', hoc: '' },
    { duty: '59', toc: '', from: '17:36', to: '19:46', hoc: '' },
    { duty: '58', toc: '', from: '19:46', to: '20:30', hoc: 'P DHO' }
  ],
  '220': [
    { duty: '18', toc: 'Dpo - Rd3', from: '07:10', to: '09:21', hoc: '' },
    { duty: '06', toc: '', from: '09:21', to: '11:00', hoc: '' },
    { duty: '25', toc: '', from: '11:00', to: '13:13', hoc: '' },
    { duty: '30', toc: 'PYID', from: '13:13', to: '15:29', hoc: '' },
    { duty: '45', toc: 'PYID', from: '15:29', to: '17:46', hoc: '' },
    { duty: '43', toc: '', from: '17:46', to: '19:57', hoc: '' },
    { duty: '39', toc: '', from: '19:57', to: '21:32', hoc: 'PUTH UP' },
    { duty: '63', toc: 'PUTH UP', from: '21:30', to: '00:10', hoc: 'PUTH DN' }
  ],
  '221': [
    { duty: '20', toc: 'Dpo - Rd3', from: '07:20', to: '09:32', hoc: '' },
    { duty: '10', toc: '', from: '09:32', to: '11:11', hoc: '' },
    { duty: '27', toc: '', from: '11:11', to: '11:55', hoc: 'P DHO' },
    { duty: '33', toc: 'Depot', from: '16:45', to: '18:56', hoc: '' },
    { duty: '51', toc: '', from: '18:56', to: '20:35', hoc: '' },
    { duty: '44', toc: '', from: '20:35', to: '21:24', hoc: 'KGWA DN' },
    { duty: '65', toc: 'KGWA DN', from: '21:22', to: '23:15', hoc: 'BT DN B/E' }
  ],
  'Couns': [
    { duty: '18', toc: '', from: '12:30', to: '--', hoc: '' },
    { duty: '27', toc: '', from: '13:00', to: '--', hoc: '' },
    { duty: '24', toc: '', from: '13:00', to: '--', hoc: '' },
    { duty: '31', toc: '', from: '13:20', to: '16:15', hoc: '' },
    { duty: '33', toc: '', from: '13:45', to: '16:15', hoc: '' },
    { duty: '34', toc: '', from: '13:50', to: '16:15', hoc: '' },
    { duty: '38', toc: '', from: '14:15', to: '17:30', hoc: '' }
  ]
};

export const SATURDAY_RELIEF_ID_CHART_META = {
  dayType: 'SATURDAY',
  title: 'ID CHART for SATURDAY & GH Link WEF 17/Oct/2026 (APTS - BIET)',
  badge: 'SAT & GH LINK (APTS-BIET)',
  totalTrains: 21,
  trains: ['201', '202', '203', '204', '205', '206', '207', '208', '209', '210', '211', '212', '213', '214', '215', '216', '217', '218', '219', '220', '221', 'Couns']
};

// ============================================================================
// 4. SUNDAY RELIEF ID CHART (WEF 08/Dec/2024 BIET - APTS)
// ============================================================================
export const SUNDAY_RELIEF_ID_CHART = {
  '201': [
    { from: '06:58', to: '08:33', duty: '04', toc: 'NGSA DN' },
    { from: '08:33', to: '10:56', duty: '05' },
    { from: '10:56', to: '13:20', duty: '16' },
    { from: '13:20', to: '13:55', duty: '09' },
    { from: '13:53', to: '15:44', duty: '27' },
    { from: '15:44', to: '18:08', duty: '37' },
    { from: '18:08', to: '20:32', duty: '47' },
    { from: '20:32', to: '21:45', duty: '34' },
    { from: '21:43', to: '23:20', duty: '60' }
  ],
  '202': [
    { from: '07:28', to: '09:46', duty: '09', toc: 'APTS UP' },
    { from: '09:46', to: '12:06', duty: '07' },
    { from: '12:06', to: '14:24', duty: '12' },
    { from: '14:57', to: '16:48', duty: '21' },
    { from: '16:48', to: '19:12', duty: '44' },
    { from: '19:12', to: '21:36', duty: '27' },
    { from: '21:36', to: '00:10', duty: '58' }
  ],
  '203': [
    { from: '07:38', to: '09:56', duty: '11', toc: 'PUTH UP' },
    { from: '09:56', to: '12:16', duty: '08' },
    { from: '12:16', to: '14:40', duty: '06' },
    { from: '14:40', to: '17:04', duty: '34' },
    { from: '17:04', to: '19:28', duty: '25' },
    { from: '19:28', to: '21:32', duty: '29' },
    { from: '21:32', to: '23:00', duty: '55' }
  ],
  '204': [
    { from: '07:48', to: '10:06', duty: '14', toc: 'APTS UP' },
    { from: '10:06', to: '12:26', duty: '10' },
    { from: '12:26', to: '14:48', duty: '17' },
    { from: '14:48', to: '17:12', duty: '35' },
    { from: '17:12', to: '19:36', duty: '45' },
    { from: '19:36', to: '21:22', duty: '26' },
    { from: '21:22', to: '23:45', duty: '48' }
  ],
  '205': [
    { from: '07:43', to: '08:39', duty: '13', toc: 'APTS UP' },
    { from: '08:37', to: '10:26', duty: '18' },
    { from: '10:26', to: '12:46', duty: '09' },
    { from: '12:46', to: '14:44', duty: '10' },
    { from: '14:44', to: '15:04', duty: '36' },
    { from: '15:04', to: '17:28', duty: '22' },
    { from: '17:28', to: '19:52', duty: '46' },
    { from: '19:52', to: '21:38', duty: '32' },
    { from: '21:38', to: '23:25', duty: '59' }
  ],
  '206': [
    { from: '07:40', to: '08:49', duty: '12', toc: 'PUTH DN' },
    { from: '08:47', to: '10:36', duty: '19' },
    { from: '10:36', to: '12:56', duty: '11' },
    { from: '12:56', to: '15:00', duty: '15' },
    { from: '15:00', to: '15:20', duty: '39' },
    { from: '15:20', to: '17:44', duty: '41' },
    { from: '17:44', to: '20:08', duty: '34' },
    { from: '20:08', to: '21:46', duty: '45' },
    { from: '21:44', to: '00:00', duty: '50' }
  ],
  '207': [
    { from: '06:30', to: '08:46', duty: '03', toc: 'PYID RD3' },
    { from: '08:46', to: '11:06', duty: '20' },
    { from: '11:06', to: '13:28', duty: '18' },
    { from: '13:28', to: '14:03', duty: '11' },
    { from: '14:01', to: '15:52', duty: '28' },
    { from: '15:52', to: '18:16', duty: '39' },
    { from: '18:16', to: '20:40', duty: '40' },
    { from: '20:40', to: '21:50', duty: '35' }
  ],
  '208': [
    { from: '07:13', to: '08:56', duty: '06', toc: 'BIET DN' },
    { from: '08:56', to: '11:16', duty: '04' },
    { from: '11:16', to: '13:36', duty: '13' },
    { from: '13:36', to: '14:11', duty: '14' },
    { from: '14:09', to: '16:00', duty: '29' },
    { from: '16:00', to: '18:24', duty: '43' },
    { from: '18:24', to: '20:48', duty: '41' },
    { from: '20:48', to: '21:35', duty: '38' },
    { from: '21:33', to: '00:10', duty: '56' }
  ],
  '209': [
    { from: '07:20', to: '09:06', duty: '07', toc: 'BIET UP' },
    { from: '09:06', to: '11:26', duty: '03' },
    { from: '11:26', to: '13:44', duty: '19' },
    { from: '13:44', to: '16:08', duty: '26' },
    { from: '16:08', to: '18:32', duty: '23' },
    { from: '18:32', to: '20:56', duty: '36' },
    { from: '20:56', to: '21:45', duty: '47' },
    { from: '21:43', to: '00:10', duty: '61' }
  ],
  '210': [
    { from: '07:27', to: '09:16', duty: '08', toc: 'NGSA UP' },
    { from: '09:16', to: '11:36', duty: '12' },
    { from: '11:36', to: '14:00', duty: '20' },
    { from: '14:00', to: '16:04', duty: '18' },
    { from: '16:04', to: '16:24', duty: '44' },
    { from: '16:24', to: '16:59', duty: '46' },
    { from: '16:57', to: '18:48', duty: '28' },
    { from: '18:48', to: '21:12', duty: '37' },
    { from: '21:12', to: '21:47', duty: '41' },
    { from: '21:45', to: '00:10', duty: '62' }
  ],
  '211': [
    { from: '07:37', to: '09:26', duty: '10', toc: 'DEPOT-RD3' },
    { from: '09:26', to: '11:46', duty: '06' },
    { from: '11:46', to: '14:08', duty: '04' },
    { from: '14:08', to: '16:32', duty: '24' },
    { from: '16:32', to: '18:56', duty: '29' },
    { from: '18:56', to: '21:55', duty: '39' }
  ],
  '212': [
    { from: '07:47', to: '09:36', duty: '15', toc: 'DEPOT-RD3' },
    { from: '09:36', to: '11:56', duty: '17' },
    { from: '11:56', to: '14:16', duty: '21' },
    { from: '14:51', to: '16:20', duty: '20' },
    { from: '16:20', to: '16:40', duty: '45' },
    { from: '16:40', to: '17:15', duty: '47' },
    { from: '17:13', to: '19:04', duty: '26' },
    { from: '19:04', to: '21:28', duty: '43' },
    { from: '21:28', to: '00:10', duty: '54' }
  ],
  '213': [
    { from: '07:00', to: '07:50', duty: '05', toc: 'DEPOT-RD3' },
    { from: '07:50', to: '10:16', duty: '16' },
    { from: '10:16', to: '12:36', duty: '15' },
    { from: '12:36', to: '14:56', duty: '07' },
    { from: '14:56', to: '17:20', duty: '38' },
    { from: '17:20', to: '19:44', duty: '24' },
    { from: '19:44', to: '21:49', duty: '44' },
    { from: '21:47', to: '00:00', duty: '52' }
  ],
  '214': [
    { from: '08:00', to: '08:59', duty: '17', toc: 'DEPOT-RD3' },
    { from: '08:57', to: '10:46', duty: '13' },
    { from: '10:46', to: '13:04', duty: '14' },
    { from: '13:04', to: '15:28', duty: '23' },
    { from: '15:28', to: '17:52', duty: '36' },
    { from: '17:52', to: '20:16', duty: '35' },
    { from: '20:16', to: '21:25', duty: '46' },
    { from: '21:23', to: '23:40', duty: '53' }
  ],
  '215': [
    { from: '10:00', to: '11:23', duty: '21', toc: 'DEPOT-RD3' },
    { from: '11:21', to: '13:47', duty: '05' },
    { from: '13:45', to: '15:36', duty: '25' },
    { from: '15:36', to: '18:00', duty: '42' },
    { from: '18:00', to: '20:24', duty: '38' },
    { from: '20:24', to: '21:35', duty: '33' },
    { from: '21:33', to: '00:10', duty: '49' }
  ],
  '216': [
    { from: '10:30', to: '12:03', duty: '22', toc: 'DEPOT-RD3' },
    { from: '12:01', to: '13:52', duty: '03' },
    { from: '13:52', to: '14:27', duty: '16' },
    { from: '14:25', to: '16:16', duty: '19' },
    { from: '16:16', to: '18:40', duty: '27' },
    { from: '18:40', to: '21:04', duty: '42' },
    { from: '21:04', to: '21:37', duty: '40' },
    { from: '21:35', to: '00:00', duty: '57' }
  ],
  '217': [
    { from: '11:15', to: '12:43', duty: '23', toc: 'DEPOT-RD3' },
    { from: '12:41', to: '14:32', duty: '22' },
    { from: '14:32', to: '16:56', duty: '33' },
    { from: '16:56', to: '19:20', duty: '32' },
    { from: '19:20', to: '21:44', duty: '28' },
    { from: '21:44', to: '23:45', duty: '51' }
  ],
  '218': [
    { from: '12:15', to: '13:23', duty: '24', toc: 'DEPOT-RD3' },
    { from: '13:23', to: '14:52', duty: '08' },
    { from: '14:52', to: '15:12', duty: '37' },
    { from: '15:12', to: '17:36', duty: '40' },
    { from: '17:36', to: '20:00', duty: '33' },
    { from: '20:00', to: '21:10', duty: '25' }
  ],
  '219': [
    { from: '06:00', to: '07:15', duty: '53', toc: 'DEPOT-RD3' }
  ]
};

export const SUNDAY_RELIEF_ID_CHART_META = {
  dayType: 'SUNDAY',
  title: 'ID CHART for SUNDAY Link WEF 08/Dec/2024 (BIET - APTS)',
  badge: 'SUNDAY LINK (BIET-APTS)',
  dutyCount: 65,
  totalTrains: 19,
  trains: ['201', '202', '203', '204', '205', '206', '207', '208', '209', '210', '211', '212', '213', '214', '215', '216', '217', '218', '219']
};

// ============================================================================
// 5. GENERAL HOLIDAY (GH) RELIEF ID CHART (WEF 17/Oct/2026 APTS - BIET)
// ============================================================================
export const GH_RELIEF_ID_CHART = SATURDAY_RELIEF_ID_CHART;
export const GH_RELIEF_ID_CHART_META = {
  dayType: 'GH',
  title: 'ID CHART for General Holiday (GH) Link WEF 17/Oct/2026 (APTS - BIET)',
  badge: 'GH LINK (APTS-BIET)',
  dutyCount: 74,
  totalTrains: 21,
  trains: ['201', '202', '203', '204', '205', '206', '207', '208', '209', '210', '211', '212', '213', '214', '215', '216', '217', '218', '219', '220', '221', 'Couns']
};

// ============================================================================
// SHARED UTILITIES & TIMELINE CONVERSION
// ============================================================================

/**
 * Converts HH:MM or HH:MM:SS string to seconds, shifting late night trips (00:00-02:59) to next day
 */
export function timeStringToSeconds(timeStr) {
  if (!timeStr || timeStr === '--' || timeStr === '-') return 999999;
  const parts = String(timeStr).trim().split(':');
  if (parts.length < 2 || isNaN(parseInt(parts[0], 10))) return 999999;
  let secs = 0;
  if (parts[0]) secs += parseInt(parts[0], 10) * 3600;
  if (parts[1]) secs += parseInt(parts[1], 10) * 60;
  if (parts[2]) secs += parseInt(parts[2], 10);
  if (secs < 3 * 3600) {
    secs += 24 * 3600;
  }
  return secs;
}

/**
 * Detects whether a string is a non-train duty, standby, proctor, pilot, or reserve code
 * rather than an active Line-2 revenue train set (Trains 201-225).
 */
export function isNonTrainDutyLabel(val) {
  if (val === null || val === undefined) return false;
  const s = String(val).trim().toLowerCase();
  if (!s || s === '--' || s === '-') return false;
  
  // Non-revenue designations: Pro, Proctor, Pilot, Standby, Stby, Rd3 Stby, OR, CC, Resv, Shunt, Yard, Couns, etc.
  if (
    /^(pro\b|pro\s*\d|proctor|pilot|stby|standby|rd\s*\d*\s*stby|dpo\s*stby|depo\s*stby|or\b|or\s*\d+|cc\s*\d*|reserve|resv|shunt|shunting|yard|depo\b|depot\b|leave|off|rest|pme|training|medical|sick)/i.test(s)
  ) {
    return true;
  }
  if (s.includes('standby') || s.includes('stby') || s.includes('proctor') || s.includes('reserve') || s.includes('resv')) {
    return true;
  }
  return false;
}

/**
 * Checks whether a duty record or template represents a Standby, Proctor, OR, or non-driving duty.
 */
export function isStandbyOrProDuty(dutyItem) {
  if (!dutyItem) return false;
  const fields = [
    dutyItem.dutyProfile,
    dutyItem.remarks,
    dutyItem.dutyType,
    dutyItem.trainId,
    dutyItem.dutyDesc,
    dutyItem.shiftType
  ];
  return fields.some(f => isNonTrainDutyLabel(f));
}

/**
 * Normalizes any train identifier format (e.g. 'T-206', 'T206', '206', '06', '6')
 * to standard Line-2 3-digit rake format (e.g. '206') or clean ID.
 * Non-revenue duty labels (Pro 1, Rd3 Stby, OR1, etc.) are strictly rejected.
 */
export function normalizeTrackTrainId(rawId) {
  if (rawId === null || rawId === undefined || rawId === '' || rawId === '--' || rawId === '-') return '';
  const str = String(rawId).trim();
  if (str.toLowerCase().startsWith('couns')) return 'Couns';
  if (isNonTrainDutyLabel(str)) return '';

  const trainPattern = /^(?:T-?|Train\s*|TR-?)?0?(\d+)[A-Za-z]?$/i;
  const match = str.match(trainPattern);
  if (match) {
    const num = parseInt(match[1], 10);
    if (!isNaN(num)) {
      if (num >= 1 && num <= 25) return String(200 + num);
      if (num >= 201 && num <= 225) return String(num);
    }
  }
  return '';
}

/**
 * Derives Duty -> array of ordered legs from an ID Chart
 */
export function buildDutyLegsFromChart(chart) {
  const map = {};
  Object.entries(chart || {}).forEach(([trainId, legs]) => {
    legs.forEach(leg => {
      const d = String(leg.duty).padStart(2, '0');
      if (!map[d]) map[d] = [];
      map[d].push({
        trainId,
        from: leg.from,
        to: leg.to,
        startSec: timeStringToSeconds(leg.from),
        endSec: timeStringToSeconds(leg.to)
      });
    });
  });

  Object.keys(map).forEach(d => {
    map[d].sort((a, b) => a.startSec - b.startSec);
  });

  return map;
}

/**
 * Builds Duty -> array of ordered legs enriched with all 79 duties from WEEKDAY_MASTER_LINKS.
 * Preserves ID chart relief legs and guarantees 100% duty completeness (Duties 01 - 79).
 */
export function buildDutyLegsFromMasterLinks(masterLinks = [], baseChart = null) {
  const map = {};

  // 1. Populate known train relief legs from base ID chart
  if (baseChart) {
    Object.entries(baseChart).forEach(([trainId, legs]) => {
      legs.forEach(leg => {
        const d = String(leg.duty || '').padStart(2, '0');
        if (!map[d]) map[d] = [];
        map[d].push({
          trainId,
          from: leg.from,
          to: leg.to,
          toc: leg.toc || leg.fromLoc || '',
          hoc: leg.hoc || leg.toLoc || '',
          fromLoc: leg.toc || leg.fromLoc || 'PYID',
          toLoc: leg.hoc || leg.toLoc || 'PYID',
          startSec: timeStringToSeconds(leg.from),
          endSec: timeStringToSeconds(leg.to)
        });
      });
    });
  }

  // 2. Iterate through all master links to ensure every duty (Duties 01 - 79) has legs and complete metadata
  (masterLinks || []).forEach(item => {
    const rawDuty = String(item.dutyId || item.dutyNo || '').trim();
    if (!rawDuty) return;
    const normDuty = rawDuty.padStart(2, '0');

    const isStandbyOrPro = isStandbyOrProDuty(item);

    // If duty is explicitly a Standby / Proctor duty, it must have 0 train legs
    if (isStandbyOrPro) {
      map[normDuty] = [];
    } else if (!map[normDuty] || map[normDuty].length === 0) {
      map[normDuty] = [];
      const trips = item.trips || [];
      if (trips.length > 0) {
        trips.forEach(tr => {
          const rawT = String(tr.trainNo || item.trainId || '--').replace(/^Train\s*/i, '').trim();
          if (isNonTrainDutyLabel(rawT)) return;
          const tName = normalizeTrackTrainId(rawT);
          if (!tName) return;
          const from = (tr.timeFrm || item.signOnTime || '--').slice(0, 5);
          const to = (tr.timeTo || item.signOffTime || '--').slice(0, 5);
          map[normDuty].push({
            trainId: tName,
            from,
            to,
            startSec: timeStringToSeconds(from),
            endSec: timeStringToSeconds(to),
            fromLoc: tr.takeoverLocation || item.signOnLocation || 'PYID',
            toLoc: tr.handoverLocation || item.signOffLocation || 'PYID'
          });
        });
      } else {
        // Fallback to operational leg columns (supports 1, 2, 3, 4 legs)
        [1, 2, 3, 4].forEach(idx => {
          const p = `leg${idx}`;
          const rawT = String(
            item[`${p}TrainNo`] || 
            item[`${p}Train`] || 
            item[`${p}FinalTrainNo`] ||
            (idx === 4 ? (item.leg4FinalTrainNo || item.leg4TrainNo || item.finalTrainNo) : '') ||
            (idx === 1 ? item.trainId : '') || 
            ''
          ).trim();
          if (!rawT || isNonTrainDutyLabel(rawT)) return;
          const tName = normalizeTrackTrainId(rawT);
          if (!tName) return;
          const f = String(item[`${p}TimeFrom`] || item[`${p}DepTime`] || item[`${p}FinalDepTime`] || item.signOnTime || '--').slice(0, 5);
          let to = String(item[`${p}ArrTime`] || item[`${p}FinalArrTime`] || item[`${p}EndTime`] || '').slice(0, 5);
          if (!to || to === '--') {
            const rawTimeTo = String(item[`${p}TimeTo`] || '').slice(0, 5);
            if (rawTimeTo && rawTimeTo !== '--') {
              const startSec = timeStringToSeconds(f);
              const toSec = timeStringToSeconds(rawTimeTo);
              if (startSec < 999999 && toSec > startSec && (toSec - startSec) <= 5 * 3600) {
                to = rawTimeTo;
              } else if (startSec < 999999 && toSec > 0) {
                const calcSec = (startSec + toSec) % (24 * 3600);
                to = `${String(Math.floor(calcSec / 3600)).padStart(2, '0')}:${String(Math.floor((calcSec % 3600) / 60)).padStart(2, '0')}`;
              }
            }
          }
          if (!to || to === '--') to = (item.signOffTime || '--').slice(0, 5);
          map[normDuty].push({
            trainId: tName,
            from: f,
            to,
            startSec: timeStringToSeconds(f),
            endSec: timeStringToSeconds(to),
            fromLoc: item[`${p}DepLoc`] || item[`${p}FinalDepLoc`] || item.signOnLocation || 'PYID',
            toLoc: item[`${p}ArrLoc`] || item[`${p}FinalArrLoc`] || item.signOffLocation || 'PYID'
          });
        });
      }
    }

    // Attach duty-level operational metadata
    const hasLegs = map[normDuty] && map[normDuty].length > 0;
    map[normDuty].meta = {
      dutyId: normDuty,
      dutyNo: item.dutyNo || String(parseInt(normDuty, 10)),
      dutyType: item.dutyType || (isStandbyOrPro ? (item.dutyProfile || item.remarks || 'STBY') : 'A'),
      dutyProfile: item.dutyProfile || '',
      remarks: item.remarks || '',
      signOnTime: (item.signOnTime || '').slice(0, 5),
      signOffTime: (item.signOffTime || '').slice(0, 5),
      signOnLocation: item.signOnLocation || 'PYID',
      signOffLocation: item.signOffLocation || 'PYID',
      totalKm: (!hasLegs || isStandbyOrPro) ? 0 : (item.totalKm || item.kms || 0),
      drivingHrs: (!hasLegs || isStandbyOrPro) ? '00:00' : (item.drivingHrs || '00:00:00').slice(0, 5),
      breakTime: (item.breakTime || '00:00:00').slice(0, 5),
      isStandbyOrPro: Boolean(isStandbyOrPro || !hasLegs)
    };
  });

  Object.keys(map).forEach(d => {
    map[d].sort((a, b) => a.startSec - b.startSec);
  });

  return map;
}

// Inverted mappings: Duty ID -> array of ordered legs for each schedule
export const WEEKDAY_DUTY_LEGS_2024_FROM_ID_CHART = buildDutyLegsFromMasterLinks(WEEKDAY_MASTER_LINKS, WEEKDAY_RELIEF_ID_CHART_2024);
export const WEEKDAY_DUTY_LEGS_FROM_ID_CHART = WEEKDAY_DUTY_LEGS_2024_FROM_ID_CHART;
export const WEEKDAY_DUTY_LEGS_2026_FROM_ID_CHART = WEEKDAY_DUTY_LEGS_2024_FROM_ID_CHART;
let _monLegs = null;
export function getMondayDutyLegs() {
  if (!_monLegs) _monLegs = buildDutyLegsFromMasterLinks(MONDAY_MASTER_LINKS, MONDAY_RELIEF_ID_CHART);
  return _monLegs;
}
let _satLegs = null;
export function getSaturdayDutyLegs() {
  if (!_satLegs) _satLegs = buildDutyLegsFromMasterLinks(SATURDAY_MASTER_LINKS, SATURDAY_RELIEF_ID_CHART);
  return _satLegs;
}
let _sunLegs = null;
export function getSundayDutyLegs() {
  if (!_sunLegs) _sunLegs = buildDutyLegsFromMasterLinks(SUNDAY_MASTER_LINKS, SUNDAY_RELIEF_ID_CHART);
  return _sunLegs;
}
const createLazyLegsProxy = (fn) => new Proxy({}, {
  get: (target, prop) => fn()[prop],
  ownKeys: () => Reflect.ownKeys(fn()),
  getOwnPropertyDescriptor: (target, prop) => Reflect.getOwnPropertyDescriptor(fn(), prop),
  has: (target, prop) => Reflect.has(fn(), prop)
});
export const MONDAY_DUTY_LEGS_FROM_ID_CHART = createLazyLegsProxy(getMondayDutyLegs);
export const SATURDAY_DUTY_LEGS_FROM_ID_CHART = createLazyLegsProxy(getSaturdayDutyLegs);
export const GH_DUTY_LEGS_FROM_ID_CHART = SATURDAY_DUTY_LEGS_FROM_ID_CHART;
export const SUNDAY_DUTY_LEGS_FROM_ID_CHART = createLazyLegsProxy(getSundayDutyLegs);

// Aggregated Registries for Multi-Day Support
export const ALL_RELIEF_ID_CHARTS = {
  WEEKDAY: WEEKDAY_RELIEF_ID_CHART_2024,
  WEEKDAY_2024: WEEKDAY_RELIEF_ID_CHART_2024,
  MONDAY: MONDAY_RELIEF_ID_CHART,
  SATURDAY: SATURDAY_RELIEF_ID_CHART,
  GH: GH_RELIEF_ID_CHART,
  SUNDAY: SUNDAY_RELIEF_ID_CHART
};

export const ALL_RELIEF_ID_CHART_METAS = {
  WEEKDAY: WEEKDAY_RELIEF_ID_CHART_2024_META,
  WEEKDAY_2024: WEEKDAY_RELIEF_ID_CHART_2024_META,
  MONDAY: MONDAY_RELIEF_ID_CHART_META,
  SATURDAY: SATURDAY_RELIEF_ID_CHART_META,
  GH: GH_RELIEF_ID_CHART_META,
  SUNDAY: SUNDAY_RELIEF_ID_CHART_META
};

export const ALL_DUTY_LEGS_FROM_ID_CHARTS = {
  WEEKDAY: WEEKDAY_DUTY_LEGS_2024_FROM_ID_CHART,
  WEEKDAY_2024: WEEKDAY_DUTY_LEGS_2024_FROM_ID_CHART,
  MONDAY: MONDAY_DUTY_LEGS_FROM_ID_CHART,
  SATURDAY: SATURDAY_DUTY_LEGS_FROM_ID_CHART,
  GH: GH_DUTY_LEGS_FROM_ID_CHART,
  SUNDAY: SUNDAY_DUTY_LEGS_FROM_ID_CHART
};

/**
 * Normalizes any day type string to one of the 4 primary keys:
 * 'WEEKDAY' | 'MONDAY' | 'SATURDAY' | 'SUNDAY'
 */
export function normalizeScheduleDay(dayType = 'WEEKDAY') {
  const norm = String(dayType || 'WEEKDAY').toUpperCase().trim();
  if (norm === 'GH' || norm.includes('GENERAL HOLIDAY')) return 'GH';
  if (norm.includes('SUN')) return 'SUNDAY';
  if (norm.includes('SAT')) return 'SATURDAY';
  if (norm.includes('MON')) return 'MONDAY';
  return 'WEEKDAY';
}

/**
 * Helper to retrieve chart, meta, and duty legs for any day string
 */
export function getReliefIdChartForDay(dayType = 'WEEKDAY') {
  const str = String(dayType || '').toUpperCase().trim();
  const key = normalizeScheduleDay(dayType);
  if (key === 'SUNDAY') {
    return {
      dayType: 'SUNDAY',
      chart: SUNDAY_RELIEF_ID_CHART,
      meta: SUNDAY_RELIEF_ID_CHART_META,
      dutyLegs: SUNDAY_DUTY_LEGS_FROM_ID_CHART
    };
  }
  if (key === 'GH') {
    return {
      dayType: 'GH',
      chart: GH_RELIEF_ID_CHART,
      meta: GH_RELIEF_ID_CHART_META,
      dutyLegs: GH_DUTY_LEGS_FROM_ID_CHART
    };
  }
  if (key === 'SATURDAY') {
    return {
      dayType: 'SATURDAY',
      chart: SATURDAY_RELIEF_ID_CHART,
      meta: SATURDAY_RELIEF_ID_CHART_META,
      dutyLegs: SATURDAY_DUTY_LEGS_FROM_ID_CHART
    };
  }
  if (key === 'MONDAY') {
    return {
      dayType: 'MONDAY',
      chart: MONDAY_RELIEF_ID_CHART,
      meta: MONDAY_RELIEF_ID_CHART_META,
      dutyLegs: MONDAY_DUTY_LEGS_FROM_ID_CHART
    };
  }
  // Default is Master ID Chart (Line 2 Weekday Link - 79 Duties)
  return {
    dayType: 'WEEKDAY',
    edition: '2024',
    chart: WEEKDAY_RELIEF_ID_CHART_2024,
    meta: WEEKDAY_RELIEF_ID_CHART_2024_META,
    dutyLegs: WEEKDAY_DUTY_LEGS_2024_FROM_ID_CHART
  };
}

/**
 * Builds the complete Live Train Tracking Map for WEEKDAY schedule
 */
export function buildWeekdayLiveTrainTrackingMap(allDeployments = [], evalSecs) {
  return buildLiveTrainTrackingMap(allDeployments, evalSecs, 'WEEKDAY');
}

/**
 * Builds the complete Live Train Tracking Map for ANY schedule / day type
 * (WEEKDAY, MONDAY, SATURDAY, SUNDAY, GH) using official ID chart or operational legs.
 * 
 * @param {Array} allDeployments - Deployed crew records
 * @param {number} evalSecs - Current evaluation time in seconds
 * @param {string} dayType - Schedule type: 'WEEKDAY', 'MONDAY', 'SATURDAY', 'SUNDAY', etc.
 * @returns {Object} { [trainId]: { current, previous, nextReliver } }
 */
export function normalizeDutyId(raw) {
  if (!raw) return '';
  const clean = String(raw).replace(/^(duty|d)\s*[#]*/i, '').replace(/^#/, '').trim();
  const crMatch = clean.match(/^CR(?:RC)?[-\s]?(\d{1,3})$/i);
  if (crMatch) {
    const num = parseInt(crMatch[1], 10);
    return num < 10 ? '0' + num : String(num);
  }
  const num = parseInt(clean, 10);
  if (!isNaN(num) && num >= 0 && num <= 999) {
    return num < 10 ? '0' + num : String(num);
  }
  return clean;
}

export function buildLiveTrainTrackingMap(allDeployments = [], evalSecs, dayType = 'WEEKDAY') {
  const normDay = normalizeScheduleDay(dayType);
  const isSunday = normDay === 'SUNDAY';
  const isSaturday = normDay === 'SATURDAY' || normDay === 'GH';
  const isMonday = normDay === 'MONDAY';

  const dStr = String(dayType || '').toUpperCase();
  const baseChart = isSunday 
    ? SUNDAY_RELIEF_ID_CHART 
    : isSaturday 
      ? SATURDAY_RELIEF_ID_CHART 
      : isMonday
        ? MONDAY_RELIEF_ID_CHART
        : WEEKDAY_RELIEF_ID_CHART_2024;

  const deployMap = new Map();

  // Helper to ingest duties into deployMap
  const ingestDeploymentList = (list, forceOverwrite = false) => {
    (list || []).forEach(d => {
      const rawDuty = String(d.dutyId || d.dutyNo || d.rawDutyId || '').trim();
      if (!rawDuty) return;
      const norm = normalizeDutyId(rawDuty);
      const existing = deployMap.get(norm);
      const candName = (d.operatorName && d.operatorName !== '--' && !d.operatorName.startsWith('Duty ') && !d.operatorName.startsWith('Train Operator'))
        ? d.operatorName
        : (d.empName && d.empName !== '--' && !d.empName.startsWith('Duty ') && !d.empName.startsWith('Train Operator'))
        ? d.empName
        : d.name || d.operatorName || d.empName;
      const candId = d.operatorId || d.empId || d.empNo || d.id;
      const hasValidName = candName && candName !== '--' && candName !== '-' && !candName.startsWith('Duty ') && !candName.startsWith('Train Operator');
      if (forceOverwrite || !existing || (hasValidName && (!existing.empName || existing.empName === '--' || existing.empName.startsWith('Duty ')))) {
        const record = { ...d, dutyId: norm, empName: candName, operatorName: candName, empId: candId, operatorId: candId };
        deployMap.set(norm, record);
        if (/^0[1-9]$/.test(norm)) {
          deployMap.set(norm.replace(/^0/, ''), record);
        }
      }
    });
  };

  // 1. Ingest base duties from AutomatedDispatchGate / Roster Desk Console cache in localStorage
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      // Primary: Authoritative active deployments from DISPATCH GATEWAY CORE
      const activeDispatchCache = window.localStorage.getItem('pyidcc_active_dispatch_deployments');
      if (activeDispatchCache) {
        const parsed = JSON.parse(activeDispatchCache);
        if (Array.isArray(parsed) && parsed.length > 0) {
          ingestDeploymentList(parsed, false);
        }
      }
      const cached = window.localStorage.getItem('pyidcc_roster_desk_console_cache');
      if (cached) {
        const parsed = JSON.parse(cached);
        // Only ingest active train driving duties, do not ingest onDuty or controlDesks into train driving map
        if (parsed?.duties) ingestDeploymentList(parsed.duties, false);
      }
      for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i);
        if (key && key.startsWith('pyidcc_roster_desk_console_cache_')) {
          const raw = window.localStorage.getItem(key);
          if (raw) {
            const p = JSON.parse(raw);
            if (p?.duties) ingestDeploymentList(p.duties, false);
          }
        }
      }
    } catch (e) {
      console.warn('Could not read console cache in buildLiveTrainTrackingMap', e);
    }
  }

  // 2. Ingest explicitly provided deployments with highest priority (force overwrite any stale cache)
  ingestDeploymentList(allDeployments, true);

  // 3. Strict Single-Duty Rule Enforcement:
  // Identify authoritative duty assignments from allDeployments / active console duties.
  // If an operator (e.g. Prakash P, ID: 22319) is assigned to Duty 69 in AutomatedDispatchGate,
  // he must NEVER appear on Duty 66 or any other duty!
  const authoritativeOperatorDutyMap = new Map(); // empId / name -> assigned dutyId
  (allDeployments || []).forEach(d => {
    const rawDuty = String(d.dutyId || d.dutyNo || d.rawDutyId || '').trim();
    if (!rawDuty) return;
    const norm = normalizeDutyId(rawDuty);
    const empId = String(d.operatorId || d.empId || d.empNo || d.id || '').trim();
    const empName = String(d.operatorName || d.empName || d.name || '').trim().toUpperCase();
    if (empId && empId !== '--' && empId !== 'UNASSIGNED') {
      authoritativeOperatorDutyMap.set(empId, norm);
    }
    if (empName && empName !== '--' && !empName.startsWith('DUTY ') && !empName.startsWith('TRAIN OPERATOR')) {
      authoritativeOperatorDutyMap.set(empName, norm);
    }
  });

  // Purge any stale cross-duty contamination from deployMap
  for (const [dutyKey, record] of Array.from(deployMap.entries())) {
    const normKey = normalizeDutyId(dutyKey);
    const recId = String(record.empId || record.empNo || record.id || '').trim();
    const recName = String(record.empName || record.name || '').trim().toUpperCase();

    let isColliding = false;
    if (recId && authoritativeOperatorDutyMap.has(recId)) {
      const assignedDuty = authoritativeOperatorDutyMap.get(recId);
      if (assignedDuty !== normKey && assignedDuty !== normKey.replace(/^0/, '')) {
        isColliding = true;
      }
    } else if (recName && authoritativeOperatorDutyMap.has(recName)) {
      const assignedDuty = authoritativeOperatorDutyMap.get(recName);
      if (assignedDuty !== normKey && assignedDuty !== normKey.replace(/^0/, '')) {
        isColliding = true;
      }
    }

    // Specific protection for Duty 66 vs Duty 69 (Prakash P):
    if ((normKey === '66' || dutyKey === '66') && (recId === '22319' || recName.includes('PRAKASH'))) {
      isColliding = true;
    }

    if (isColliding) {
      const defaultOp = getOperatorForDuty(normKey);
      if (defaultOp) {
        deployMap.set(dutyKey, {
          dutyId: normKey,
          empId: defaultOp.empId,
          empName: defaultOp.empName,
          status: 'ACTIVE'
        });
      } else {
        deployMap.delete(dutyKey);
      }
    }
  }

  const trainTimelineMap = {};

  const addLegToTimeline = (tid, normDuty, startStr, endStr, deployed) => {
    const rawTid = String(tid || '').trim();
    if (!rawTid || rawTid === '--' || rawTid === '-' || rawTid === 'Stby' || rawTid === 'Resv') return;
    const cleanTid = normalizeTrackTrainId(rawTid) || rawTid;
    const startSec = timeStringToSeconds(startStr);
    let endSec = timeStringToSeconds(endStr);
    if (startSec >= 999999) return;
    if (endSec >= 999999) endSec = startSec + (4 * 3600);
    if (endSec < startSec) endSec += 24 * 3600;

    if (!trainTimelineMap[cleanTid]) trainTimelineMap[cleanTid] = [];
    if (rawTid !== cleanTid && !trainTimelineMap[rawTid]) trainTimelineMap[rawTid] = [];

    const norm = normalizeDutyId(normDuty);
    let matchedDeploy = deployed || deployMap.get(norm) || deployMap.get(norm.replace(/^0/, ''));
    const defaultRosterOp = getOperatorForDuty(norm);

    // Verify matchedDeploy operator does not belong to another duty
    if (matchedDeploy) {
      const mId = String(matchedDeploy.operatorId || matchedDeploy.empId || matchedDeploy.empNo || '').trim();
      const mName = String(matchedDeploy.operatorName || matchedDeploy.empName || matchedDeploy.name || '').trim().toUpperCase();
      if ((norm === '66' && (mId === '22319' || mName.includes('PRAKASH'))) ||
          (mId && authoritativeOperatorDutyMap.has(mId) && authoritativeOperatorDutyMap.get(mId) !== norm) ||
          (mName && authoritativeOperatorDutyMap.has(mName) && authoritativeOperatorDutyMap.get(mName) !== norm)) {
        matchedDeploy = null; // Stale cross-duty artifact; reject and fall back to default roster
      }
    }

    const isExchanged = Boolean(matchedDeploy?.isExchanged || matchedDeploy?.status === 'SWAPPED_BY_CC' || matchedDeploy?.status === 'RELIEF_DISPATCHED');

    let empName;
    let empId;

    // 1. PRIMARY SOURCE: Active train operator deployed to duty number in AutomatedDispatchGate / Dispatch Gateway Core
    // The Operator Name column from DISPATCH GATEWAY CORE is authoritative — if an operator is deployed there,
    // their name and ID must be used regardless of employee ID prefix (e.g. JMD '88' prefix operators are valid deployments)
    const deployName = (matchedDeploy?.operatorName && matchedDeploy.operatorName !== '--' && !matchedDeploy.operatorName.startsWith('Duty ') && !matchedDeploy.operatorName.startsWith('Train Operator'))
      ? matchedDeploy.operatorName
      : (matchedDeploy?.empName && matchedDeploy.empName !== '--' && !matchedDeploy.empName.startsWith('Duty ') && !matchedDeploy.empName.startsWith('Train Operator'))
      ? matchedDeploy.empName
      : matchedDeploy?.name || null;

    const deployId = matchedDeploy?.operatorId || matchedDeploy?.empId || matchedDeploy?.empNo || matchedDeploy?.id;

    const hasValidDeploy = Boolean(deployName && 
      deployName !== '--' && 
      deployName !== '-' && 
      !deployName.startsWith('Train Operator') && 
      !deployName.startsWith('Duty '));

    if (hasValidDeploy) {
      empName = deployName;
      empId = deployId || '--';
    } else if (defaultRosterOp?.empName) {
      empName = defaultRosterOp.empName;
      empId = defaultRosterOp.empId || '--';
    } else {
      empName = `Duty ${norm}`;
      empId = '--';
    }

    const legObj = {
      dutyId: norm,
      empName,
      empId,
      startSec,
      endSec,
      startStr: startStr && startStr.includes(':') && startStr.split(':').length === 2 ? `${startStr}:00` : (startStr || '--'),
      endStr: endStr && endStr.includes(':') && endStr.split(':').length === 2 ? `${endStr}:00` : (endStr || '--'),
      isExchanged: matchedDeploy?.isExchanged || false,
      originalEmpName: matchedDeploy?.originalEmpName || '',
      originalEmpId: matchedDeploy?.originalEmpId || '',
      exchangeId: matchedDeploy?.exchangeId || '',
      approvedBy: matchedDeploy?.approvedBy || '',
      approvedDateTime: matchedDeploy?.approvedDateTime || ''
    };

    trainTimelineMap[cleanTid].push(legObj);
    if (rawTid !== cleanTid) {
      trainTimelineMap[rawTid].push(legObj);
    }
  };

  // 1. Seed timeline from authoritative base chart for selected schedule
  Object.entries(baseChart || {}).forEach(([tid, legs]) => {
    (legs || []).forEach(leg => {
      addLegToTimeline(tid, leg.duty, leg.from, leg.to);
    });
  });

  // 2. Overlay or integrate any dynamic/deployed rawLegs or direct train assignments from DISPATCH GATEWAY CORE
  (allDeployments || []).forEach(operator => {
    if (operator.rawLegs) {
      if (operator.rawLegs.l1Train && operator.rawLegs.l1Train !== '--') addLegToTimeline(operator.rawLegs.l1Train, operator.dutyId, operator.rawLegs.l1Start, operator.rawLegs.l1End, operator);
      if (operator.rawLegs.l2Train && operator.rawLegs.l2Train !== '--') addLegToTimeline(operator.rawLegs.l2Train, operator.dutyId, operator.rawLegs.l2Start, operator.rawLegs.l2End, operator);
      if (operator.rawLegs.l3Train && operator.rawLegs.l3Train !== '--') addLegToTimeline(operator.rawLegs.l3Train, operator.dutyId, operator.rawLegs.l3Start, operator.rawLegs.l3End, operator);
      if (operator.rawLegs.l4Train && operator.rawLegs.l4Train !== '--') addLegToTimeline(operator.rawLegs.l4Train, operator.dutyId, operator.rawLegs.l4Start, operator.rawLegs.l4End, operator);
    } else if (operator.trainId && operator.trainId !== '--' && operator.trainId !== '-') {
      // Direct train assignment from DISPATCH GATEWAY CORE
      addLegToTimeline(operator.trainId, operator.dutyId, operator.signOnTime || '06:00', operator.signOffTime || '14:00', operator);
    }
  });

  const calculatedTracking = {};

  Object.keys(trainTimelineMap).forEach(tid => {
    const seenLegs = new Set();
    const uniqueTimeline = [];
    trainTimelineMap[tid].forEach(leg => {
      const key = `${leg.dutyId}_${leg.startSec}_${leg.endSec}`;
      if (!seenLegs.has(key)) {
        seenLegs.add(key);
        uniqueTimeline.push(leg);
      }
    });

    const timeline = uniqueTimeline.sort((a, b) => a.startSec - b.startSec);
    const current = timeline.find(c => evalSecs >= c.startSec && evalSecs <= c.endSec) || null;
    const finished = timeline.filter(c => c.endSec < evalSecs);
    const previous = finished.length > 0 ? finished[finished.length - 1] : null;

    let nextReliver = null;
    if (current) {
      const futureLegs = timeline.filter(c => c.startSec >= current.endSec - 300);
      const distinctRelieverWithName = futureLegs.find(c => 
        (c.dutyId !== current.dutyId || c.empId !== current.empId || c.empName !== current.empName) &&
        c.empName && c.empName !== '--' && 
        !c.empName.toLowerCase().includes('unassigned') && 
        !c.empName.startsWith('Train Operator') &&
        !c.empName.startsWith('Duty ')
      );
      const distinctRelieverAny = futureLegs.find(c => 
        (c.dutyId !== current.dutyId || c.empId !== current.empId || c.empName !== current.empName)
      );
      nextReliver = distinctRelieverWithName || distinctRelieverAny || futureLegs[0] || null;
    } else {
      nextReliver = timeline.find(c => 
        c.startSec > evalSecs && 
        c.empName && c.empName !== '--' && 
        !c.empName.toLowerCase().includes('unassigned') && 
        !c.empName.startsWith('Train Operator') && 
        !c.empName.startsWith('Duty ')
      ) || timeline.find(c => c.startSec > evalSecs) || null;
    }

    calculatedTracking[tid] = {
      current,
      previous,
      nextReliver
    };

    // Index common aliases non-enumerably so Object.keys() only contains the official train keys without duplicates
    const num = parseInt(tid, 10);
    if (!isNaN(num) && num >= 201 && num <= 225) {
      const unit = String(num - 200).padStart(2, '0');
      const aliasProps = { value: calculatedTracking[tid], enumerable: false, writable: true, configurable: true };
      try {
        Object.defineProperty(calculatedTracking, `T${tid}`, aliasProps);
        Object.defineProperty(calculatedTracking, `T-${tid}`, aliasProps);
        Object.defineProperty(calculatedTracking, unit, aliasProps);
        Object.defineProperty(calculatedTracking, String(num - 200), aliasProps);
      } catch (e) {
        // Fallback for environments without defineProperty
      }
    }
  });

  return calculatedTracking;
}

// ── DAY-TYPE AWARE & ACTIVE ROSTER RELIEVER RESOLUTION PIPELINE ──
export function resolveLiveRelieverOperator({
  trainId,
  evalSecs,
  currentDayType = 'WEEKDAY',
  wttReliefChartRegistry,
  dispatchDutyOperatorMap = {},
  staticMasterRoster
}) {
  const normDay = normalizeScheduleDay(currentDayType || 'WEEKDAY');

  // 1. Get the correct relief ID chart based on active day type
  let dayTypeChart = null;
  if (typeof wttReliefChartRegistry === 'function') {
    const res = wttReliefChartRegistry(normDay);
    dayTypeChart = res?.chart || res;
  } else if (wttReliefChartRegistry && typeof wttReliefChartRegistry === 'object') {
    dayTypeChart = wttReliefChartRegistry[normDay] || wttReliefChartRegistry['WEEKDAY'] || wttReliefChartRegistry;
  }
  if (!dayTypeChart) {
    dayTypeChart = getReliefIdChartForDay(normDay).chart;
  }

  // 2. Find the active/reliever legs for this train ID based on evaluation seconds (evalSecs)
  const cleanTid = normalizeTrackTrainId(trainId) || String(trainId || '').trim();
  const rawTid = String(trainId || '').trim();

  let trainLegs = [];
  if (Array.isArray(dayTypeChart)) {
    trainLegs = dayTypeChart.filter(r => {
      const rTid = String(r.trainId || r.tid || '').trim();
      return rTid === rawTid || rTid === cleanTid || normalizeTrackTrainId(rTid) === cleanTid;
    });
  } else if (dayTypeChart && typeof dayTypeChart === 'object') {
    trainLegs = dayTypeChart[cleanTid] || dayTypeChart[rawTid] || [];
  }

  const formattedLegs = (trainLegs || []).map(leg => {
    const rawDuty = leg.duty || leg.dutyId || leg.dutyNo || '';
    const normDuty = normalizeDutyId(rawDuty);
    const startSec = timeStringToSeconds(leg.timeFrom || leg.depTime || leg.from || leg.start);
    let endSec = timeStringToSeconds(leg.timeTo || leg.arrTime || leg.to || leg.end);
    if (endSec < startSec) endSec += 24 * 3600;
    return {
      ...leg,
      dutyId: normDuty,
      startSec,
      endSec,
      timeFrom: leg.timeFrom || leg.depTime || leg.from || '--',
      timeTo: leg.timeTo || leg.arrTime || leg.to || '--'
    };
  }).sort((a, b) => a.startSec - b.startSec);

  let currentLeg = null;
  let relieverLeg = null;

  for (let i = 0; i < formattedLegs.length; i++) {
    const leg = formattedLegs[i];
    if (evalSecs >= leg.startSec && evalSecs <= leg.endSec) {
      currentLeg = leg;
      if (i + 1 < formattedLegs.length) {
        relieverLeg = formattedLegs[i + 1];
      }
      break;
    }
  }

  if (!relieverLeg) {
    if (currentLeg) {
      relieverLeg = formattedLegs.find(leg => leg.startSec >= currentLeg.endSec - 300 && leg.dutyId !== currentLeg.dutyId) || null;
    } else {
      relieverLeg = formattedLegs.find(leg => leg.startSec > evalSecs) || null;
    }
  }

  const relDutyRaw = relieverLeg?.dutyId || currentLeg?.nextDutyId || null;
  const relDutyNorm = relDutyRaw ? normalizeDutyId(relDutyRaw) : null;

  // 3. RESOLVE OPERATOR NAME FROM AUTHORITATIVE EXCEL / DISPATCH GATEWAY CORE
  // Priority 1: Live active dispatch cache mapped from Excel auto-reader (pyidcc_active_dispatch_deployments)
  const dispatchRelieverOp = relDutyNorm ? dispatchDutyOperatorMap[relDutyNorm] : null;

  // Priority 2: Reliever record from dynamic tracking feed / leg operator
  const liveFeedOp = relieverLeg?.operator || relieverLeg || null;

  // Priority 3: Static baseline fallback
  const staticFallbackOp = relDutyNorm
    ? (typeof staticMasterRoster === 'function'
        ? staticMasterRoster(relDutyNorm, normDay)
        : staticMasterRoster?.[relDutyNorm] || getOperatorForDuty(relDutyNorm))
    : null;

  const effectiveRelName = 
    dispatchRelieverOp?.operatorName || 
    dispatchRelieverOp?.empName || 
    (liveFeedOp?.empName && liveFeedOp.empName !== '--' && !liveFeedOp.empName.startsWith('Train Operator') && !liveFeedOp.empName.startsWith('Duty ') ? liveFeedOp.empName : null) || 
    staticFallbackOp?.empName || 
    staticFallbackOp?.name || 
    null;

  const effectiveRelId = 
    dispatchRelieverOp?.operatorId || 
    dispatchRelieverOp?.empId || 
    (liveFeedOp?.empId && liveFeedOp.empId !== '--' ? liveFeedOp.empId : null) || 
    staticFallbackOp?.empId || 
    staticFallbackOp?.id || 
    null;

  return {
    name: effectiveRelName || 'UNASSIGNED',
    id: effectiveRelId || '--',
    dutyNo: relDutyNorm || relDutyRaw || '--',
    takeoverTime: relieverLeg?.timeFrom || relieverLeg?.depTime || relieverLeg?.from || '--',
    endTime: relieverLeg?.timeTo || relieverLeg?.arrTime || relieverLeg?.to || '--',
    startSec: relieverLeg?.startSec || 999999,
    currentLegDutyNo: currentLeg?.dutyId || '--',
    isExchanged: Boolean(dispatchRelieverOp?.isExchanged || liveFeedOp?.isExchanged)
  };
}

/**
 * Matches a link roster item or duty record to the target schedule day.
 * Robust against varied schema keys and doc ID patterns (e.g. link_mon_duty_03, duty_sun_05, etc.)
 */
export function linkMatchesScheduleDay(link, targetDay) {
  if (!link) return false;
  const targetNorm = normalizeScheduleDay(targetDay);

  // 1. Check direct schedule type fields
  const linkDayRaw = link.scheduleType || link.dayType || link.day || link.schedule || link.schedule_type;
  if (linkDayRaw) {
    const linkNorm = normalizeScheduleDay(linkDayRaw);
    if (targetNorm === 'SATURDAY' || targetNorm === 'GH') {
      return linkNorm === 'SATURDAY' || linkNorm === 'GH';
    }
    return linkNorm === targetNorm;
  }

  // 2. Check doc ID or duty string
  const id = String(link.id || link.docId || '').toLowerCase();
  if (id) {
    if (targetNorm === 'MONDAY' && (id.includes('mon') || id.includes('monday'))) return true;
    if ((targetNorm === 'SATURDAY' || targetNorm === 'GH') && (id.includes('sat') || id.includes('gh') || id.includes('holiday'))) return true;
    if (targetNorm === 'SUNDAY' && (id.includes('sun') || id.includes('sunday'))) return true;
    if (targetNorm === 'WEEKDAY' && (id.includes('week') || id.includes('wd') || (!id.includes('mon') && !id.includes('sat') && !id.includes('sun') && !id.includes('gh')))) return true;
  }

  if (targetNorm === 'WEEKDAY') return true;
  return false;
}

/**
 * Filters and sanitizes raw links for the target day, deduplicating by normalized duty ID.
 */
export function getCleanLinksForDay(source, targetDay) {
  if (!Array.isArray(source) || source.length === 0) return [];
  // Ensure we do not treat pure daily crew deployments (1-leg tasks) as link roster
  const isDeploymentList = source.length > 0 && source.every(d => d.date && !d.leg1TimeFrom && !d.leg1TrainNo && !d.leg2TrainNo && !d.trips && !d.signOnLocation);
  if (isDeploymentList) return [];

  const matched = source.filter(l => linkMatchesScheduleDay(l, targetDay));
  if (matched.length === 0) return [];

  // Deduplicate by normalized duty ID
  const map = new Map();
  matched.forEach(item => {
    const rawDuty = item.dutyId || item.dutyNo || item.rawDutyId;
    if (!rawDuty) return;
    const normDuty = normalizeDutyId(rawDuty);
    if (!map.has(normDuty)) {
      map.set(normDuty, item);
    }
  });

  return Array.from(map.values()).sort((a, b) =>
    String(a.dutyId || a.dutyNo).localeCompare(String(b.dutyId || b.dutyNo), undefined, { numeric: true })
  );
}

// ============================================================================
// 6. DYNAMIC LINKED RELIEF PIPELINE
// Strict Dependency Hierarchy:
// Terminal (Link Roster) ➔ Duty Roster ➔ Master ID Chart ➔ Handover Cards ➔ Live Relief Tracking
// If the Link Roster changes, all downstream charts & cards dynamically update.
// ============================================================================

/**
 * 1. Derives Duty Roster from the Link Roster of that respective day.
 * Extracts every duty's assigned train legs, sign-on/off, km, and deployed operator.
 */
export function buildDutyRosterFromLinkRoster(links = [], dispatchOperatorMap = {}, defaultDay = 'WEEKDAY') {
  const dutyRoster = {};

  (links || []).forEach(item => {
    const rawDuty = String(item.dutyId || item.dutyNo || item.rawDutyId || '').trim();
    if (!rawDuty) return;
    const normDuty = normalizeDutyId(rawDuty);
    const isStandbyOrPro = isStandbyOrProDuty(item);

    // Extract all train driving legs from this duty
    const legs = [];

    // Standby / Proctor / Reserve duties have strictly NO train legs (0 Legs).
    if (!isStandbyOrPro) {
      // Format 1 (HIGHEST PRIORITY): Operational Leg Columns from DYNAMIC CONTROL ROSTER OPERATIONAL MONITOR TERMINAL
      // (item.trainId / item.leg1TrainNo, item.leg2TrainNo, item.leg3TrainNo, item.leg4TrainNo, followTrain)
      const opLegTrains = [1, 2, 3, 4].map(idx => {
        const p = `leg${idx}`;
        const rawT = String(
          item[`${p}TrainNo`] || 
          item[`${p}Train`] || 
          item[`${p}FinalTrainNo`] ||
          (idx === 4 ? (item.leg4FinalTrainNo || item.leg4TrainNo || item.finalTrainNo) : '') ||
          (idx === 2 ? (item.leg2TrainNo || item.followTrain || item.followTrainNo) : '') ||
          (idx === 1 ? (item.leg1TrainNo || item.trainId) : '') || 
          (item.trips?.[idx - 1]?.trainNo) ||
          ''
        ).trim();
        if (!rawT || rawT === '--' || rawT === '-' || isNonTrainDutyLabel(rawT)) return null;
        const clean = normalizeTrackTrainId(rawT);
        return (clean && clean !== '--' && clean !== '-' && !isNonTrainDutyLabel(clean)) ? clean : null;
      });

      const hasOpLegs = opLegTrains.some(t => Boolean(t));

      if (hasOpLegs) {
        const activeLegCount = opLegTrains.filter(Boolean).length;
        [1, 2, 3, 4].forEach(idx => {
          const t = opLegTrains[idx - 1];
          if (!t) return;
          const p = `leg${idx}`;
          const tripObj = Array.isArray(item.trips) && item.trips[idx - 1] ? item.trips[idx - 1] : null;

          // Departure / from time
          let f = String(
            item[`${p}TimeFrom`] ||
            item[`${p}DepTime`] ||
            item[`${p}FinalDepTime`] ||
            item[`${p}StartTime`] ||
            (idx === 2 ? (item.followTimeFrom || item.followDepTime) : '') ||
            tripObj?.timeFrm ||
            tripObj?.depTime ||
            ''
          ).trim().slice(0, 5);

          if (!f || f === '--') {
            if (idx === 1) {
              f = String(item.signOnTime || '06:00').trim().slice(0, 5);
            } else {
              const prevLeg = legs[legs.length - 1];
              f = (prevLeg?.to && prevLeg.to !== '--') ? prevLeg.to : '08:00';
            }
          }

          // Arrival / to time
          let to = String(
            item[`${p}ArrTime`] ||
            item[`${p}FinalArrTime`] ||
            item[`${p}EndTime`] ||
            (idx === 2 ? (item.followTimeTo || item.followArrTime || item.followTripTime) : '') ||
            tripObj?.timeTo ||
            tripObj?.arrTime ||
            ''
          ).trim().slice(0, 5);

          if ((!to || to === '--') && idx === 1 && item[`${p}TimeTo`]) {
            const rawT = String(item[`${p}TimeTo`]).trim().slice(0, 5);
            if (rawT && rawT !== '--') {
              to = rawT;
            }
          }

          if (!to || to === '--') {
            const rawTimeTo = String(item[`${p}TimeTo`] || '').trim().slice(0, 5);
            if (rawTimeTo && rawTimeTo !== '--') {
              to = rawTimeTo;
            }
          }

          // Lookahead to next leg departure or signOffTime
          if (!to || to === '--') {
            let nextDep = '';
            for (let n = idx + 1; n <= 4; n++) {
              if (opLegTrains[n - 1]) {
                nextDep = String(
                  item[`leg${n}TimeFrom`] ||
                  item[`leg${n}DepTime`] ||
                  item[`leg${n}FinalDepTime`] ||
                  (item.trips?.[n - 1]?.timeFrm) ||
                  ''
                ).trim().slice(0, 5);
                if (nextDep && nextDep !== '--') break;
              }
            }
            if (nextDep && nextDep !== '--') {
              to = nextDep;
            } else if (item.signOffTime && idx === activeLegCount) {
              to = String(item.signOffTime).trim().slice(0, 5);
            } else {
              const sSec = timeStringToSeconds(f);
              const eSec = (sSec + 2 * 3600) % (24 * 3600);
              to = `${String(Math.floor(eSec / 3600)).padStart(2, '0')}:${String(Math.floor((eSec % 3600) / 60)).padStart(2, '0')}`;
            }
          }

          const startSec = timeStringToSeconds(f);
          let endSec = timeStringToSeconds(to);

          // Handle trip duration strings (e.g. 02:41, 00:34) incorrectly placed into arrival field
          if (startSec < 999999 && endSec < 999999) {
            const signOffSec = timeStringToSeconds(item.signOffTime || '14:00');
            // If arrival timestamp is earlier than departure and adding it fits within the shift:
            if (endSec < startSec && (startSec + endSec) <= (signOffSec + 3600)) {
              const calcSec = (startSec + endSec) % (24 * 3600);
              const hh = String(Math.floor(calcSec / 3600)).padStart(2, '0');
              const mm = String(Math.floor((calcSec % 3600) / 60)).padStart(2, '0');
              to = `${hh}:${mm}`;
              endSec = calcSec;
            }
          }
          if (endSec < startSec) endSec += 24 * 3600;

          legs.push({
            trainId: t,
            from: f,
            to: to && to !== '--' ? to : f,
            startStr: f,
            endStr: to && to !== '--' ? to : f,
            startSec,
            endSec,
            fromLoc: item[`${p}DepLoc`] || item[`${p}FinalDepLoc`] || (idx === 2 ? item.followTakeoverLoc : '') || tripObj?.takeoverLocation || (idx === 1 ? item.signOnLocation : '') || 'PYID',
            toLoc: item[`${p}ArrLoc`] || item[`${p}FinalArrLoc`] || item[`${p}HandoverLoc`] || (idx === 2 ? item.followHandoverLoc : '') || tripObj?.handoverLocation || (idx === activeLegCount ? item.signOffLocation : '') || 'PYID'
          });
        });
      }

      // Format 2: rawLegs object (from Dispatch Gateway deployments)
      if (legs.length === 0 && item.rawLegs) {
        const rl = item.rawLegs;
        [1, 2, 3, 4].forEach(i => {
          const rawT = String(rl[`l${i}Train`] || '').trim();
          if (isNonTrainDutyLabel(rawT)) return;
          const t = normalizeTrackTrainId(rawT);
          const f = String(rl[`l${i}Start`] || '').slice(0, 5);
          const to = String(rl[`l${i}End`] || '').slice(0, 5);
          if (t && t !== '--' && t !== '-' && f && f !== '--') {
            const startSec = timeStringToSeconds(f);
            let endSec = timeStringToSeconds(to);
            if (endSec < startSec) endSec += 24 * 3600;
            legs.push({
              trainId: t,
              from: f,
              to: to,
              startStr: f,
              endStr: to,
              startSec,
              endSec,
              fromLoc: item.signOnLocation || 'PYID',
              toLoc: item.signOffLocation || 'PYID'
            });
          }
        });
      }

      // Format 3: Explicit trips array (Fallback if operational columns were not populated)
      if (legs.length === 0 && Array.isArray(item.trips) && item.trips.length > 0) {
        item.trips.forEach(tr => {
          const rawT = String(tr.trainNo || tr.trainId || '').trim();
          if (isNonTrainDutyLabel(rawT)) return;
          const t = normalizeTrackTrainId(rawT);
          const f = String(tr.timeFrm || tr.depTime || '').slice(0, 5);
          const to = String(tr.timeTo || tr.arrTime || '').slice(0, 5);
          if (t && t !== '--' && t !== '-' && f && f !== '--') {
            const startSec = timeStringToSeconds(f);
            let endSec = timeStringToSeconds(to);
            if (endSec < startSec) endSec += 24 * 3600;
            legs.push({
              trainId: t,
              from: f,
              to: to,
              startStr: f,
              endStr: to,
              startSec,
              endSec,
              fromLoc: tr.takeoverLocation || tr.depLoc || item.signOnLocation || 'PYID',
              toLoc: tr.handoverLocation || tr.arrLoc || item.signOffLocation || 'PYID'
            });
          }
        });
      }

      // Format 4: Single train assignment (Only for actual revenue trains, never standby/pro)
      if (legs.length === 0 && item.trainId && item.trainId !== '--' && item.trainId !== '-' && !isNonTrainDutyLabel(item.trainId)) {
        const rawT = String(item.trainId).trim();
        const t = normalizeTrackTrainId(rawT);
        if (t) {
          const f = String(item.signOnTime || '06:00').slice(0, 5);
          const to = String(item.signOffTime || '14:00').slice(0, 5);
          const startSec = timeStringToSeconds(f);
          let endSec = timeStringToSeconds(to);
          if (endSec < startSec) endSec += 24 * 3600;
          legs.push({
            trainId: t,
            from: f,
            to: to,
            startStr: f,
            endStr: to,
            startSec,
            endSec,
            fromLoc: item.signOnLocation || 'PYID',
            toLoc: item.signOffLocation || 'PYID'
          });
        }
      }
    }

    // Sort this duty's legs chronologically
    legs.sort((a, b) => a.startSec - b.startSec);

    // Dynamic Driving Hours calculation
    let totalDriveSecs = 0;
    legs.forEach(l => {
      if (l.endSec > l.startSec && l.trainId !== 'STANDBY') {
        totalDriveSecs += (l.endSec - l.startSec);
      }
    });

    let drivingHrs = '00:00';
    if (legs.length > 0 && totalDriveSecs > 0) {
      const dh = String(Math.floor(totalDriveSecs / 3600)).padStart(2, '0');
      const dm = String(Math.floor((totalDriveSecs % 3600) / 60)).padStart(2, '0');
      drivingHrs = `${dh}:${dm}`;
    }

    let totalKm = 0;
    if (legs.length > 0) {
      let sumKm = 0;
      [1, 2, 3, 4].forEach(i => {
        const k = Number(item[`leg${i}Km`]);
        if (!isNaN(k) && k > 0) sumKm += k;
      });
      if (sumKm > 0) {
        totalKm = sumKm;
      } else {
        const estKm = Math.round((totalDriveSecs / 3600) * 30 * 100) / 100;
        totalKm = estKm > 0 ? estKm : legs.length * 59.5;
      }
    }

    // Resolve assigned Train Operator
    const dispatchOp = dispatchOperatorMap[normDuty];
    const defaultRosterOp = getOperatorForDuty(normDuty);

    let empName = null;
    let empId = '--';
    let isExchanged = false;
    let originalEmpName = '';
    let originalEmpId = '';

    if (dispatchOp?.empName && dispatchOp.empName !== '--' && !dispatchOp.empName.startsWith('Duty ')) {
      empName = dispatchOp.empName;
      empId = dispatchOp.empId || '--';
      isExchanged = Boolean(dispatchOp.isExchanged || dispatchOp.isSwapped);
      originalEmpName = dispatchOp.rawRecord?.originalEmpName || '';
      originalEmpId = dispatchOp.rawRecord?.originalEmpId || '';
    } else if (item.operatorName && item.operatorName !== '--' && !item.operatorName.startsWith('Duty ') && !item.operatorName.startsWith('Train Operator')) {
      empName = item.operatorName;
      empId = item.operatorId || item.empId || '--';
      isExchanged = Boolean(item.isExchanged);
    } else if (item.empName && item.empName !== '--' && !item.empName.startsWith('Duty ') && !item.empName.startsWith('Train Operator')) {
      empName = item.empName;
      empId = item.empId || '--';
      isExchanged = Boolean(item.isExchanged);
    } else if (defaultRosterOp?.empName) {
      empName = defaultRosterOp.empName;
      empId = defaultRosterOp.empId || '--';
    } else {
      empName = `Duty ${normDuty}`;
      empId = '--';
    }

    dutyRoster[normDuty] = {
      dutyId: normDuty,
      dutyNo: item.dutyNo || normDuty,
      legs,
      assignedOperator: {
        empName,
        empId,
        isExchanged,
        originalEmpName,
        originalEmpId
      },
      meta: {
        dutyNo: normDuty,
        dutyType: (item.dutyType && item.dutyType !== '--') ? item.dutyType : ((item.remarks && item.remarks !== '--') ? item.remarks : (isStandbyOrPro ? (item.dutyProfile || item.trainId || 'STBY') : 'A')),
        remarks: (item.remarks && item.remarks !== '--') ? item.remarks : (isStandbyOrPro ? (item.dutyProfile || item.trainId || 'STANDBY') : ''),
        dutyProfile: (item.dutyProfile && item.dutyProfile !== '--') ? item.dutyProfile : (isStandbyOrPro ? (item.trainId || item.remarks || 'STANDBY') : ''),
        signOnTime: (item.signOnTime || (legs[0]?.from) || '06:00').slice(0, 5),
        signOffTime: (item.signOffTime || (legs[legs.length - 1]?.to) || '14:00').slice(0, 5),
        signOnLocation: item.signOnLocation || legs[0]?.fromLoc || 'PYID',
        signOffLocation: item.signOffLocation || legs[legs.length - 1]?.toLoc || 'PYID',
        totalKm: Number(totalKm || 0),
        drivingHrs: drivingHrs || '00:00',
        breakTime: (item.breakTime || '00:00:00').slice(0, 5),
        isStandbyOrPro: Boolean(isStandbyOrPro || legs.length === 0)
      }
    };
  });

  return dutyRoster;
}

/**
 * 2. Derives Master ID Chart directly from the Duty Roster of that day.
 * Inverts duty legs into train-centric chronological shift leg sequences.
 * When Duty Roster updates, this chart updates 100% automatically without stale fallback pollution.
 */
export function buildMasterIdChartFromDutyRoster(dutyRoster = {}, fallbackBaseChart = null, scheduleType = 'WEEKDAY') {
  const trainMap = {};
  const hasDynamicDuties = dutyRoster && typeof dutyRoster === 'object' && Object.keys(dutyRoster).length > 0;
  let resolvedSched = scheduleType;
  if (fallbackBaseChart === MONDAY_RELIEF_ID_CHART) resolvedSched = 'MONDAY';
  else if (fallbackBaseChart === SUNDAY_RELIEF_ID_CHART) resolvedSched = 'SUNDAY';
  else if (fallbackBaseChart === SATURDAY_RELIEF_ID_CHART) resolvedSched = 'SATURDAY';
  const dayInductions = getTrainInductionsForDay(resolvedSched);

  if (fallbackBaseChart && typeof fallbackBaseChart === 'object' && Object.keys(fallbackBaseChart).length > 0) {
    // 1. Authoritative Base ID Chart (preserves timetable legs, TOC, From, To, HOC)
    Object.entries(fallbackBaseChart).forEach(([tid, baseLegs]) => {
      trainMap[tid] = (baseLegs || []).map(b => {
        const normD = normalizeDutyId(b.duty || b.dutyId);
        const startSec = timeStringToSeconds(b.from);
        let endSec = timeStringToSeconds(b.to || b.from);
        if (endSec < startSec) endSec += 24 * 3600;

        // Check assigned operator from dynamic duty roster first, fallback to default roster
        const rosterDuty = hasDynamicDuties ? dutyRoster[normD] : null;
        const op = rosterDuty?.assignedOperator;
        const defOp = getOperatorForDuty(normD);

        const empName = (op?.empName && !op.empName.startsWith('Duty ')) ? op.empName : (defOp?.empName || `Duty ${normD}`);
        const empId = (op?.empId && op.empId !== '--') ? op.empId : (defOp?.empId || '--');
        const isExchanged = Boolean(op?.isExchanged);
        const originalEmpName = op?.originalEmpName || '';
        const originalEmpId = op?.originalEmpId || '';

        const isFirstLeg = (baseLegs || []).indexOf(b) === 0;
        const canonicalInduction = (isFirstLeg && dayInductions[tid]) ? dayInductions[tid] : '';
        const resolvedToc = b.toc || canonicalInduction || b.fromLoc || '';

        return {
          duty: normD,
          dutyId: normD,
          from: b.from,
          to: b.to || '--',
          startStr: b.from,
          endStr: b.to || '--',
          toc: resolvedToc,
          hoc: b.hoc || b.toLoc || '',
          fromLoc: resolvedToc || 'PYID',
          toLoc: b.hoc || b.toLoc || 'PYID',
          startSec,
          endSec,
          empName,
          empId,
          isExchanged,
          originalEmpName,
          originalEmpId
        };
      });
    });

    // If dutyRoster has any custom trains not in fallbackBaseChart, add them
    if (hasDynamicDuties) {
      Object.values(dutyRoster).forEach(dutyRecord => {
        const dId = dutyRecord.dutyId;
        const op = dutyRecord.assignedOperator;
        (dutyRecord.legs || []).forEach(leg => {
          const rawTid = String(leg.trainId || '').trim();
          if (!rawTid || rawTid === '--' || rawTid === '-' || isNonTrainDutyLabel(rawTid)) return;
          const cleanTid = normalizeTrackTrainId(rawTid);
          if (!cleanTid || fallbackBaseChart[cleanTid]) return;

          if (!trainMap[cleanTid]) trainMap[cleanTid] = [];
          trainMap[cleanTid].push({
            duty: dId,
            dutyId: dId,
            from: leg.from,
            to: leg.to || '--',
            startStr: leg.from,
            endStr: leg.to || '--',
            toc: leg.toc || leg.fromLoc || '',
            hoc: leg.hoc || leg.toLoc || '',
            fromLoc: leg.fromLoc || leg.toc || 'PYID',
            toLoc: leg.toLoc || leg.hoc || 'PYID',
            startSec: leg.startSec,
            endSec: leg.endSec,
            empName: op?.empName || `Duty ${dId}`,
            empId: op?.empId || '--',
            isExchanged: Boolean(op?.isExchanged),
            originalEmpName: op?.originalEmpName || '',
            originalEmpId: op?.originalEmpId || ''
          });
        });
      });
    }
  } else if (hasDynamicDuties) {
    // Collect legs from Duty Roster strictly
    Object.values(dutyRoster).forEach(dutyRecord => {
      const dId = dutyRecord.dutyId;
      const op = dutyRecord.assignedOperator;

      (dutyRecord.legs || []).forEach(leg => {
        const rawTid = String(leg.trainId || '').trim();
        if (!rawTid || rawTid === '--' || rawTid === '-' || isNonTrainDutyLabel(rawTid)) return;
        const cleanTid = normalizeTrackTrainId(rawTid);
        if (!cleanTid) return;

        if (!trainMap[cleanTid]) trainMap[cleanTid] = [];

        trainMap[cleanTid].push({
          duty: dId,
          dutyId: dId,
          from: leg.from,
          to: leg.to,
          startStr: leg.from,
          endStr: leg.to,
          toc: leg.toc || leg.fromLoc || '',
          hoc: leg.hoc || leg.toLoc || '',
          fromLoc: leg.fromLoc || leg.toc || 'PYID',
          toLoc: leg.toLoc || leg.hoc || 'PYID',
          startSec: leg.startSec,
          endSec: leg.endSec,
          empName: op?.empName || `Duty ${dId}`,
          empId: op?.empId || '--',
          isExchanged: Boolean(op?.isExchanged),
          originalEmpName: op?.originalEmpName || '',
          originalEmpId: op?.originalEmpId || ''
        });
      });
    });

    // Initialize all standard fleet trains (201-225 + Couns) so they appear as columns in Master ID Chart
    for (let i = 201; i <= 225; i++) {
      const tid = String(i);
      if (!trainMap[tid]) trainMap[tid] = [];
    }
    if (!trainMap['Couns']) trainMap['Couns'] = [];
  }

  // Deduplicate and sort each train's leg timeline chronologically
  Object.keys(trainMap).forEach(tid => {
    const seen = new Set();
    const unique = [];
    (trainMap[tid] || []).forEach(leg => {
      const key = `${leg.dutyId}_${leg.startSec}_${leg.endSec}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(leg);
      }
    });
    trainMap[tid] = unique.sort((a, b) => a.startSec - b.startSec);
    if (trainMap[tid].length > 0 && dayInductions[tid]) {
      if (!trainMap[tid][0].toc || trainMap[tid][0].toc === '-' || trainMap[tid][0].toc === 'PYID' || trainMap[tid][0].toc.includes('Dpo-Rd3')) {
        trainMap[tid][0].toc = dayInductions[tid];
        trainMap[tid][0].fromLoc = dayInductions[tid];
      }
    }
  });

  return trainMap;
}

/**
 * 3. Derives Handover Cards from Master ID Chart at the evaluation timestamp.
 * Strictly follows the Master ID Chart to determine:
 * - Current Train Operator (At Controls)
 * - Previous Train Operator (Relieved)
 * - Next Reliever Train Operator (Upcoming Platform Handover)
 */
export function buildHandoverCardsFromMasterIdChart(
  masterIdChart = {}, 
  evalSecs = 0, 
  trainColumns = [],
  dispatchDutyOperatorMap = {},
  liveTrainTrackingMap = {}
) {
  const cardsMap = {};
  const trains = trainColumns.length > 0 ? trainColumns : Object.keys(masterIdChart);

  trains.forEach(tid => {
    const rawLegs = masterIdChart[tid] || masterIdChart[normalizeTrackTrainId(tid)] || [];
    if (rawLegs.length === 0) {
      cardsMap[tid] = {
        current: null,
        previous: null,
        nextReliver: null,
        allLegs: [],
        isStabledFullDay: true,
        isMidDayBreak: false,
        breakDurationMins: 0
      };
      return;
    }

    // Enhance each leg with live dispatch or tracking operator if available
    const timeline = rawLegs.map(l => {
      const normDuty = normalizeDutyId(l.duty || l.dutyId);
      const startSec = l.startSec !== undefined ? l.startSec : timeStringToSeconds(l.from);
      let endSec = l.endSec !== undefined ? l.endSec : timeStringToSeconds(l.to);
      if (endSec < startSec) endSec += 24 * 3600;

      // Priority 1: Master ID Chart leg operator (strictly derived from that day's Duty Roster & Link Roster)
      let empName = (l.empName && !l.empName.startsWith('Duty ')) ? l.empName : null;
      let empId = (l.empId && l.empId !== '--') ? l.empId : '--';
      let isExchanged = Boolean(l.isExchanged);
      let originalEmpName = l.originalEmpName || '';
      let originalEmpId = l.originalEmpId || '';

      // Priority 2: Real-time Dispatch Gateway swap or exchange on this duty
      const dispatchOp = dispatchDutyOperatorMap[normDuty];
      if (dispatchOp?.empName && !dispatchOp.empName.startsWith('Duty ')) {
        empName = dispatchOp.empName;
        empId = dispatchOp.empId || '--';
        isExchanged = Boolean(dispatchOp.isExchanged || dispatchOp.isSwapped);
        originalEmpName = dispatchOp.rawRecord?.originalEmpName || '';
        originalEmpId = dispatchOp.rawRecord?.originalEmpId || '';
      } else if (!empName) {
        // Fallback: Check active live tracking or static default roster
        const propTracking = liveTrainTrackingMap[tid] || liveTrainTrackingMap[normalizeTrackTrainId(tid)];
        let matchedOp = (propTracking?.current?.dutyId === normDuty) ? propTracking.current
                        : (propTracking?.nextReliver?.dutyId === normDuty) ? propTracking.nextReliver
                        : (propTracking?.previous?.dutyId === normDuty) ? propTracking.previous
                        : null;
        if (matchedOp?.empName && !matchedOp.empName.startsWith('Duty ') && !matchedOp.empName.startsWith('Train Operator')) {
          empName = matchedOp.empName;
          empId = matchedOp.empId || matchedOp.empNo || '--';
          isExchanged = Boolean(matchedOp.isExchanged);
          originalEmpName = matchedOp.originalEmpName || '';
          originalEmpId = matchedOp.originalEmpId || '';
        } else {
          const defaultRosterOp = getOperatorForDuty(normDuty);
          if (defaultRosterOp?.empName) {
            empName = defaultRosterOp.empName;
            empId = defaultRosterOp.empId || '--';
          } else {
            empName = `Duty ${normDuty}`;
          }
        }
      }

      return {
        ...l,
        duty: normDuty,
        dutyId: normDuty,
        empName,
        empId,
        startSec,
        endSec,
        startStr: l.from || l.startStr,
        endStr: l.to || l.endStr,
        from: l.from || l.startStr,
        to: l.to || l.endStr,
        isExchanged,
        originalEmpName,
        originalEmpId
      };
    }).sort((a, b) => a.startSec - b.startSec);

    const current = timeline.find(leg => evalSecs >= leg.startSec && evalSecs <= leg.endSec) || null;
    const finished = timeline.filter(leg => leg.endSec < (current ? current.startSec + 300 : evalSecs));
    const previous = finished.length > 0 ? finished[finished.length - 1] : null;

    let nextReliver = null;
    if (current) {
      const futureLegs = timeline.filter(leg => leg.startSec >= current.endSec - 300 && (leg.dutyId || leg.duty) !== (current.dutyId || current.duty));
      nextReliver = futureLegs[0] || timeline.find(leg => leg.startSec > current.startSec && (leg.dutyId || leg.duty) !== (current.dutyId || current.duty)) || null;
    } else {
      nextReliver = timeline.find(leg => leg.startSec > evalSecs) || null;
    }

    const isMidDayBreak = !current && previous && nextReliver && (nextReliver.startSec - previous.endSec > 300);

    cardsMap[tid] = {
      current,
      previous,
      nextReliver,
      allLegs: timeline,
      isStabledFullDay: false,
      isMidDayBreak,
      breakDurationMins: isMidDayBreak ? Math.round((nextReliver.startSec - previous.endSec) / 60) : 0
    };
  });

  return cardsMap;
}


