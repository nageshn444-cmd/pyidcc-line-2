/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Official BMRCL Line 2 Monday 04:00hrs Service Link Dataset
 * Effective 06/JAN/2025 (APTS - BIET Mainline Corridor)
 */

export const PRELOADED_DUTIES = [
  { dutyNo: "1", sOnTime: "06:00:00", signOnLocation: "PYID", sOffTime: "14:00:00", signOffLocation: "PYID", kms: 0, dutyHrs: "08:00:00", drivingHrs: "00:00:00", breakTime: "00:00:00", dutyType: "PRO1", trips: [{ trainNo: "Pro 1", timeFrm: "06:00:00", timeTo: "14:00:00", takeoverLocation: "PYID", handoverLocation: "PYID" }] },
  { dutyNo: "2", sOnTime: "06:00:00", signOnLocation: "PYID", sOffTime: "14:00:00", signOffLocation: "PYID", kms: 0, dutyHrs: "08:00:00", drivingHrs: "00:00:00", breakTime: "00:00:00", dutyType: "Rd3 Stby", trips: [{ trainNo: "Rd3 Stby", timeFrm: "06:00:00", timeTo: "14:00:00", takeoverLocation: "PYID", handoverLocation: "PYID" }] },
  { dutyNo: "3", sOnTime: "06:00:00", signOnLocation: "KGWA Dn", sOffTime: "14:00:00", signOffLocation: "PYID", kms: 180, dutyHrs: "07:40:00", drivingHrs: "05:59:00", breakTime: "01:25:00", dutyType: "3", trips: [
    { trainNo: "209", timeFrm: "06:13:00", timeTo: "07:48:00", takeoverLocation: "KGWA Dn", handoverLocation: "PYID" },
    { trainNo: "201", timeFrm: "08:18:00", timeTo: "10:28:00", takeoverLocation: "PYID", handoverLocation: "PYID" },
    { trainNo: "212", timeFrm: "11:23:00", timeTo: "13:37:00", takeoverLocation: "PYID", handoverLocation: "PYID" }
  ]},
  { dutyNo: "4", sOnTime: "06:00:00", signOnLocation: "Depo/No PDC", sOffTime: "13:45:00", signOffLocation: "PYID", kms: 110, dutyHrs: "07:15:00", drivingHrs: "05:14:00", breakTime: "02:10:00", dutyType: "4", trips: [
    { trainNo: "213", timeFrm: "06:15:00", timeTo: "08:13:00", isShortLoop: true, takeoverLocation: "Depo", handoverLocation: "PYID" },
    { trainNo: "218", timeFrm: "08:53:00", timeTo: "11:35:00", takeoverLocation: "PYID", handoverLocation: "P DHO" },
    { trainNo: "220", timeFrm: "13:05:00", timeTo: "13:39:00", takeoverLocation: "PYID UP", handoverLocation: "PYID DN" }
  ]},
  { dutyNo: "5", sOnTime: "06:00:00", signOnLocation: "Rd3 Induct", sOffTime: "13:25:00", signOffLocation: "PYID", kms: 161, dutyHrs: "07:25:00", drivingHrs: "05:46:00", breakTime: "01:25:00", dutyType: "5", trips: [
    { trainNo: "212", timeFrm: "06:10:00", timeTo: "08:03:00", isShortLoop: true, takeoverLocation: "Rd3", handoverLocation: "PYID" },
    { trainNo: "215", timeFrm: "08:33:00", timeTo: "10:13:00", takeoverLocation: "PYID", handoverLocation: "PYID" },
    { trainNo: "204", timeFrm: "11:08:00", timeTo: "13:21:00", takeoverLocation: "PYID", handoverLocation: "PYID" }
  ]},
  { dutyNo: "6", sOnTime: "06:05:00", signOnLocation: "PYID UP", sOffTime: "13:00:00", signOffLocation: "PYID", kms: 131, dutyHrs: "06:55:00", drivingHrs: "04:33:00", breakTime: "01:51:00", dutyType: "6", trips: [
    { trainNo: "202", timeFrm: "06:18:00", timeTo: "06:57:00", takeoverLocation: "PYID UP", handoverLocation: "PYID Dn" },
    { trainNo: "217", timeFrm: "07:25:00", timeTo: "09:08:00", takeoverLocation: "PYID", handoverLocation: "PYID" },
    { trainNo: "212", timeFrm: "09:43:00", timeTo: "11:23:00", takeoverLocation: "PYID", handoverLocation: "PYID" },
    { trainNo: "209", timeFrm: "12:12:00", timeTo: "12:43:00", takeoverLocation: "PYID", handoverLocation: "PYID Dn" }
  ]},
  { dutyNo: "7", sOnTime: "06:05:00", signOnLocation: "Dpo - Rd3", sOffTime: "14:00:00", signOffLocation: "PYID", kms: 163, dutyHrs: "07:55:00", drivingHrs: "06:15:00", breakTime: "01:17:00", dutyType: "7", trips: [
    { trainNo: "216", timeFrm: "06:20:00", timeTo: "08:43:00", isShortLoop: true, takeoverLocation: "Dpo - Rd3", handoverLocation: "PYID" },
    { trainNo: "220", timeFrm: "09:13:00", timeTo: "10:53:00", takeoverLocation: "PYID", handoverLocation: "PYID" },
    { trainNo: "207", timeFrm: "11:41:00", timeTo: "13:53:00", takeoverLocation: "PYID", handoverLocation: "PYID" }
  ]},
  { dutyNo: "8", sOnTime: "06:10:00", signOnLocation: "KGWA Dn", sOffTime: "12:30:00", signOffLocation: "Depot", kms: 114, dutyHrs: "06:20:00", drivingHrs: "04:27:00", breakTime: "01:20:00", dutyType: "8", trips: [
    { trainNo: "210", timeFrm: "06:28:00", timeTo: "07:58:00", takeoverLocation: "KGWA Dn", handoverLocation: "PYID" },
    { trainNo: "206", timeFrm: "08:28:00", timeTo: "10:38:00", takeoverLocation: "PYID", handoverLocation: "PYID" },
    { trainNo: "205", timeFrm: "11:28:00", timeTo: "12:15:00", takeoverLocation: "PYID", handoverLocation: "P DHO" }
  ]},
  { dutyNo: "9", sOnTime: "06:10:00", signOnLocation: "PYID Dn", sOffTime: "14:05:00", signOffLocation: "PYID", kms: 191, dutyHrs: "07:55:00", drivingHrs: "06:06:00", breakTime: "01:30:00", dutyType: "9", trips: [
    { trainNo: "211", timeFrm: "06:25:00", timeTo: "08:08:00", takeoverLocation: "PYID Dn", handoverLocation: "PYID" },
    { trainNo: "203", timeFrm: "08:48:00", timeTo: "10:58:00", takeoverLocation: "PYID", handoverLocation: "PYID" },
    { trainNo: "221", timeFrm: "11:48:00", timeTo: "14:01:00", takeoverLocation: "PYID", handoverLocation: "PYID" }
  ]},
  { dutyNo: "10", sOnTime: "06:10:00", signOnLocation: "Depo/No PDC", sOffTime: "13:50:00", signOffLocation: "PYID", kms: 163, dutyHrs: "07:40:00", drivingHrs: "05:49:00", breakTime: "01:31:00", dutyType: "10", trips: [
    { trainNo: "214", timeFrm: "06:25:00", timeTo: "08:23:00", isShortLoop: true, takeoverLocation: "Depo", handoverLocation: "PYID" },
    { trainNo: "219", timeFrm: "09:03:00", timeTo: "10:43:00", takeoverLocation: "PYID", handoverLocation: "PYID" },
    { trainNo: "213", timeFrm: "11:34:00", timeTo: "13:45:00", takeoverLocation: "PYID", handoverLocation: "PYID" }
  ]},
  { dutyNo: "11", sOnTime: "06:15:00", signOnLocation: "KGWA Dn", sOffTime: "14:15:00", signOffLocation: "PYID", kms: 160, dutyHrs: "08:00:00", drivingHrs: "06:27:00", breakTime: "01:14:00", dutyType: "11", trips: [
    { trainNo: "204", timeFrm: "06:28:00", timeTo: "08:58:00", takeoverLocation: "KGWA Dn", handoverLocation: "PYID" },
    { trainNo: "207", timeFrm: "09:28:00", timeTo: "11:41:00", takeoverLocation: "PYID", handoverLocation: "PYID" },
    { trainNo: "215", timeFrm: "12:25:00", timeTo: "12:59:00", takeoverLocation: "PYID", handoverLocation: "PYID" }
  ]},
  { dutyNo: "12", sOnTime: "06:15:00", signOnLocation: "Dpo - Rd3", sOffTime: "14:10:00", signOffLocation: "PYID", kms: 110, dutyHrs: "07:55:00", drivingHrs: "05:28:00", breakTime: "02:04:00", dutyType: "12", trips: [
    { trainNo: "218", timeFrm: "06:30:00", timeTo: "08:53:00", isShortLoop: true, takeoverLocation: "Dpo - Rd3", handoverLocation: "PYID" },
    { trainNo: "222", timeFrm: "09:23:00", timeTo: "11:55:00", takeoverLocation: "PYID", handoverLocation: "P DHO" },
    { trainNo: "217", timeFrm: "13:29:00", timeTo: "14:03:00", takeoverLocation: "PYID", handoverLocation: "PYID" }
  ]},
  { dutyNo: "13", sOnTime: "06:15:00", signOnLocation: "PYID UP", sOffTime: "14:00:00", signOffLocation: "PYID", kms: 162, dutyHrs: "07:45:00", drivingHrs: "05:33:00", breakTime: "01:50:00", dutyType: "13", trips: [
    { trainNo: "203", timeFrm: "06:31:00", timeTo: "08:48:00", takeoverLocation: "PYID UP", handoverLocation: "PYID" },
    { trainNo: "205", timeFrm: "09:18:00", timeTo: "11:28:00", takeoverLocation: "PYID", handoverLocation: "PYID" },
    { trainNo: "210", timeFrm: "12:18:00", timeTo: "12:51:00", takeoverLocation: "PYID", handoverLocation: "PYID" },
    { trainNo: "204", timeFrm: "13:21:00", timeTo: "13:55:00", takeoverLocation: "PYID", handoverLocation: "PYID" }
  ]},
  { dutyNo: "14", sOnTime: "06:20:00", signOnLocation: "PYID DN", sOffTime: "14:20:00", signOffLocation: "PYID", kms: 191, dutyHrs: "08:00:00", drivingHrs: "06:06:00", breakTime: "01:36:00", dutyType: "14", trips: [
    { trainNo: "201", timeFrm: "06:35:00", timeTo: "08:18:00", takeoverLocation: "PYID DN", handoverLocation: "PYID" },
    { trainNo: "204", timeFrm: "08:58:00", timeTo: "11:08:00", takeoverLocation: "PYID", handoverLocation: "PYID" },
    { trainNo: "214", timeFrm: "12:04:00", timeTo: "14:17:00", takeoverLocation: "PYID", handoverLocation: "PYID" }
  ]},
  { dutyNo: "15", sOnTime: "06:20:00", signOnLocation: "Depo/No PDC", sOffTime: "14:15:00", signOffLocation: "PYID", kms: 181, dutyHrs: "07:55:00", drivingHrs: "06:19:00", breakTime: "01:15:00", dutyType: "15", trips: [
    { trainNo: "215", timeFrm: "06:35:00", timeTo: "08:33:00", isShortLoop: true, takeoverLocation: "Depo", handoverLocation: "PYID" },
    { trainNo: "217", timeFrm: "09:08:00", timeTo: "11:18:00", takeoverLocation: "PYID", handoverLocation: "PYID" },
    { trainNo: "208", timeFrm: "11:58:00", timeTo: "14:09:00", takeoverLocation: "PYID", handoverLocation: "PYID" }
  ]},
  { dutyNo: "16", sOnTime: "06:25:00", signOnLocation: "PUTH UP", sOffTime: "14:00:00", signOffLocation: "PYID", kms: 157, dutyHrs: "07:35:00", drivingHrs: "05:37:00", breakTime: "01:00:00", dutyType: "16", trips: [
    { trainNo: "207", timeFrm: "06:38:00", timeTo: "07:47:00", takeoverLocation: "PUTH UP", handoverLocation: "PYID Dn" },
    { trainNo: "208", timeFrm: "08:07:00", timeTo: "09:48:00", takeoverLocation: "PYID Dn", handoverLocation: "PYID" },
    { trainNo: "201", timeFrm: "10:28:00", timeTo: "12:41:00", takeoverLocation: "PYID", handoverLocation: "PYID" }
  ]},
  { dutyNo: "17", sOnTime: "06:25:00", signOnLocation: "KGWA Up", sOffTime: "14:25:00", signOffLocation: "PYID", kms: 160, dutyHrs: "08:00:00", drivingHrs: "05:25:00", breakTime: "02:13:00", dutyType: "17", trips: [
    { trainNo: "205", timeFrm: "06:41:00", timeTo: "07:37:00", takeoverLocation: "KGWA Up", handoverLocation: "PYID Dn" },
    { trainNo: "221", timeFrm: "07:55:00", timeTo: "09:38:00", takeoverLocation: "PYID Dn", handoverLocation: "PYID" },
    { trainNo: "215", timeFrm: "10:13:00", timeTo: "12:25:00", takeoverLocation: "PYID", handoverLocation: "PYID" },
    { trainNo: "213", timeFrm: "13:45:00", timeTo: "14:19:00", takeoverLocation: "PYID", handoverLocation: "PYID" }
  ]},
  { dutyNo: "18", sOnTime: "06:25:00", signOnLocation: "Dpo - Rd3", sOffTime: "14:25:00", signOffLocation: "PYID", kms: 97, dutyHrs: "08:00:00", drivingHrs: "04:50:00", breakTime: "01:30:00", dutyType: "18", trips: [
    { trainNo: "219", timeFrm: "06:40:00", timeTo: "09:03:00", isShortLoop: true, takeoverLocation: "Dpo - Rd3", handoverLocation: "PYID" },
    { trainNo: "223", timeFrm: "09:33:00", timeTo: "12:00:00", takeoverLocation: "PYID", handoverLocation: "P DHO" }
  ]},
  { dutyNo: "19", sOnTime: "06:30:00", signOnLocation: "PYID Dn", sOffTime: "13:55:00", signOffLocation: "PYID", kms: 125, dutyHrs: "07:25:00", drivingHrs: "04:50:00", breakTime: "02:11:00", dutyType: "19", trips: [
    { trainNo: "206", timeFrm: "06:45:00", timeTo: "08:28:00", takeoverLocation: "PYID Dn", handoverLocation: "PYID Dn" },
    { trainNo: "202", timeFrm: "09:07:00", timeTo: "11:40:00", takeoverLocation: "PYID Dn", handoverLocation: "P DHO" },
    { trainNo: "203", timeFrm: "13:13:00", timeTo: "13:47:00", takeoverLocation: "PYID", handoverLocation: "PYID" }
  ]},
  { dutyNo: "20", sOnTime: "06:35:00", signOnLocation: "Dpo - Rd3", sOffTime: "14:40:00", signOffLocation: "PYID", kms: 168, dutyHrs: "08:05:00", drivingHrs: "05:07:00", breakTime: "01:25:00", dutyType: "20", trips: [
    { trainNo: "220", timeFrm: "06:50:00", timeTo: "09:13:00", isShortLoop: true, takeoverLocation: "Dpo - Rd3", handoverLocation: "PYID" },
    { trainNo: "208", timeFrm: "09:48:00", timeTo: "11:58:00", takeoverLocation: "PYID", handoverLocation: "PYID" },
    { trainNo: "210", timeFrm: "12:49:00", timeTo: "14:33:00", takeoverLocation: "PYID", handoverLocation: "PYID" }
  ]},
  { dutyNo: "21", sOnTime: "06:40:00", signOnLocation: "PUTH Up", sOffTime: "14:45:00", signOffLocation: "PYID", kms: 141, dutyHrs: "08:05:00", drivingHrs: "05:40:00", breakTime: "02:08:00", dutyType: "21", trips: [
    { trainNo: "208", timeFrm: "06:53:00", timeTo: "08:07:00", takeoverLocation: "PUTH Up", handoverLocation: "PYID Dn" },
    { trainNo: "216", timeFrm: "08:43:00", timeTo: "11:25:00", takeoverLocation: "PYID Dn", handoverLocation: "PYID" },
    { trainNo: "215", timeFrm: "12:57:00", timeTo: "14:41:00", takeoverLocation: "PYID", handoverLocation: "PYID" }
  ]},
  { dutyNo: "22", sOnTime: "06:40:00", signOnLocation: "PYID Dn", sOffTime: "14:40:00", signOffLocation: "PYID", kms: 191, dutyHrs: "08:00:00", drivingHrs: "06:04:00", breakTime: "01:24:00", dutyType: "22", trips: [
    { trainNo: "202", timeFrm: "06:57:00", timeTo: "09:07:00", takeoverLocation: "PYID Dn", handoverLocation: "PYID Dn" },
    { trainNo: "221", timeFrm: "09:38:00", timeTo: "11:48:00", takeoverLocation: "PYID", handoverLocation: "PYID" },
    { trainNo: "209", timeFrm: "12:41:00", timeTo: "14:25:00", takeoverLocation: "PYID", handoverLocation: "PYID" }
  ]},
  { dutyNo: "23", sOnTime: "06:40:00", signOnLocation: "N PKT", sOffTime: "14:45:00", signOffLocation: "PYID", kms: 122, dutyHrs: "08:05:00", drivingHrs: "04:49:00", breakTime: "01:16:00", dutyType: "23", trips: [
    { trainNo: "221", timeFrm: "07:00:00", timeTo: "07:57:00", takeoverLocation: "N PKT", handoverLocation: "PYID Dn" },
    { trainNo: "214", timeFrm: "08:23:00", timeTo: "10:03:00", takeoverLocation: "PYID Dn", handoverLocation: "PYID" },
    { trainNo: "210", timeFrm: "10:53:00", timeTo: "13:05:00", takeoverLocation: "PYID", handoverLocation: "PYID" }
  ]},
  { dutyNo: "24", sOnTime: "06:45:00", signOnLocation: "Dpo - Rd3", sOffTime: "14:45:00", signOffLocation: "PYID", kms: 139, dutyHrs: "08:00:00", drivingHrs: "05:11:00", breakTime: "00:55:00", dutyType: "24", trips: [
    { trainNo: "222", timeFrm: "07:00:00", timeTo: "09:23:00", isShortLoop: true, takeoverLocation: "Dpo - Rd3", handoverLocation: "PYID" },
    { trainNo: "209", timeFrm: "09:58:00", timeTo: "12:12:00", takeoverLocation: "PYID", handoverLocation: "PYID" },
    { trainNo: "211", timeFrm: "12:33:00", timeTo: "13:07:00", takeoverLocation: "PYID", handoverLocation: "PYID" },
    { trainNo: "221", timeFrm: "14:01:00", timeTo: "14:35:00", takeoverLocation: "PYID", handoverLocation: "PYID" }
  ]},
  { dutyNo: "25", sOnTime: "06:50:00", signOnLocation: "Depo - Rd3", sOffTime: "13:55:00", signOffLocation: "KGWA", kms: 137, dutyHrs: "07:05:00", drivingHrs: "05:25:00", breakTime: "01:14:00", dutyType: "25", trips: [
    { trainNo: "223", timeFrm: "07:10:00", timeTo: "09:33:00", isShortLoop: true, takeoverLocation: "Depo - Rd3", handoverLocation: "PYID" },
    { trainNo: "210", timeFrm: "10:08:00", timeTo: "12:18:00", takeoverLocation: "PYID", handoverLocation: "PYID" },
    { trainNo: "219", timeFrm: "12:57:00", timeTo: "13:49:00", takeoverLocation: "PYID", handoverLocation: "KGWA Dn" }
  ]},
  { dutyNo: "26", sOnTime: "07:20:00", signOnLocation: "PYID", sOffTime: "15:05:00", signOffLocation: "PYID", kms: 173, dutyHrs: "07:45:00", drivingHrs: "05:40:00", breakTime: "01:42:00", dutyType: "26", trips: [
    { trainNo: "205", timeFrm: "07:35:00", timeTo: "09:18:00", takeoverLocation: "PYID", handoverLocation: "PYID" },
    { trainNo: "213", timeFrm: "09:53:00", timeTo: "11:34:00", takeoverLocation: "PYID", handoverLocation: "PYID" },
    { trainNo: "201", timeFrm: "12:41:00", timeTo: "14:57:00", takeoverLocation: "PYID", handoverLocation: "PYID" }
  ]},
  { dutyNo: "27", sOnTime: "07:30:00", signOnLocation: "PYID", sOffTime: "14:55:00", signOffLocation: "PYID", kms: 167, dutyHrs: "07:25:00", drivingHrs: "05:28:00", breakTime: "01:55:00", dutyType: "27", trips: [
    { trainNo: "207", timeFrm: "07:45:00", timeTo: "09:28:00", takeoverLocation: "PYID", handoverLocation: "PYID" },
    { trainNo: "214", timeFrm: "10:03:00", timeTo: "12:04:00", takeoverLocation: "PYID", handoverLocation: "PYID" },
    { trainNo: "211", timeFrm: "13:07:00", timeTo: "14:49:00", takeoverLocation: "PYID", handoverLocation: "PYID" }
  ]},
  { dutyNo: "28", sOnTime: "07:35:00", signOnLocation: "PYID", sOffTime: "15:35:00", signOffLocation: "PYID", kms: 191, dutyHrs: "08:00:00", drivingHrs: "06:08:00", breakTime: "01:12:00", dutyType: "28", trips: [
    { trainNo: "209", timeFrm: "07:48:00", timeTo: "09:58:00", takeoverLocation: "PYID", handoverLocation: "PYID" },
    { trainNo: "219", timeFrm: "10:43:00", timeTo: "12:57:00", takeoverLocation: "PYID", handoverLocation: "PYID" },
    { trainNo: "203", timeFrm: "13:47:00", timeTo: "15:29:00", takeoverLocation: "PYID", handoverLocation: "PYID" }
  ]},
  { dutyNo: "29", sOnTime: "07:45:00", signOnLocation: "PYID", sOffTime: "15:45:00", signOffLocation: "PYID", kms: 191, dutyHrs: "08:00:00", drivingHrs: "06:09:00", breakTime: "01:29:00", dutyType: "29", trips: [
    { trainNo: "210", timeFrm: "07:58:00", timeTo: "10:08:00", takeoverLocation: "PYID", handoverLocation: "PYID" },
    { trainNo: "203", timeFrm: "10:58:00", timeTo: "13:13:00", takeoverLocation: "PYID", handoverLocation: "PYID" },
    { trainNo: "204", timeFrm: "13:53:00", timeTo: "15:37:00", takeoverLocation: "PYID", handoverLocation: "PYID" }
  ]},
  { dutyNo: "30", sOnTime: "07:50:00", signOnLocation: "PYID", sOffTime: "15:30:00", signOffLocation: "PYID", kms: 173, dutyHrs: "07:40:00", drivingHrs: "05:39:00", breakTime: "01:38:00", dutyType: "30", trips: [
    { trainNo: "211", timeFrm: "08:03:00", timeTo: "09:43:00", takeoverLocation: "PYID", handoverLocation: "PYID" },
    { trainNo: "211", timeFrm: "10:18:00", timeTo: "12:33:00", takeoverLocation: "PYID", handoverLocation: "PYID" },
    { trainNo: "220", timeFrm: "13:37:00", timeTo: "15:21:00", takeoverLocation: "PYID", handoverLocation: "PYID" }
  ]},
  { dutyNo: "31", sOnTime: "07:55:00", signOnLocation: "PYID", sOffTime: "15:50:00", signOffLocation: "PYID", kms: 191, dutyHrs: "07:55:00", drivingHrs: "06:05:00", breakTime: "01:31:00", dutyType: "31", trips: [
    { trainNo: "212", timeFrm: "08:08:00", timeTo: "10:18:00", takeoverLocation: "PYID", handoverLocation: "PYID" },
    { trainNo: "217", timeFrm: "11:18:00", timeTo: "13:29:00", takeoverLocation: "PYID", handoverLocation: "PYID" },
    { trainNo: "217", timeFrm: "14:01:00", timeTo: "15:45:00", takeoverLocation: "PYID", handoverLocation: "PYID" }
  ]},
  { dutyNo: "32", sOnTime: "08:00:00", signOnLocation: "PYID", sOffTime: "16:00:00", signOffLocation: "PYID", kms: 186, dutyHrs: "08:00:00", drivingHrs: "06:07:00", breakTime: "01:33:00", dutyType: "32", trips: [
    { trainNo: "213", timeFrm: "08:13:00", timeTo: "09:53:00", takeoverLocation: "PYID", handoverLocation: "PYID" },
    { trainNo: "206", timeFrm: "10:38:00", timeTo: "12:49:00", takeoverLocation: "PYID", handoverLocation: "PYID" },
    { trainNo: "213", timeFrm: "13:37:00", timeTo: "15:53:00", takeoverLocation: "PYID", handoverLocation: "PYID" }
  ]},
  { dutyNo: "33", sOnTime: "12:15:00", signOnLocation: "PYID", sOffTime: "20:15:00", signOffLocation: "Depot", kms: 151, dutyHrs: "08:00:00", drivingHrs: "05:51:00", breakTime: "01:19:00", dutyType: "33", trips: [
    { trainNo: "206", timeFrm: "12:49:00", timeTo: "13:23:00", takeoverLocation: "PYID", handoverLocation: "PYID" },
    { trainNo: "207", timeFrm: "13:53:00", timeTo: "16:08:00", takeoverLocation: "PYID", handoverLocation: "PYID" },
    { trainNo: "215", timeFrm: "16:57:00", timeTo: "19:07:00", takeoverLocation: "PYID", handoverLocation: "P DHO" }
  ]},
  { dutyNo: "34", sOnTime: "13:10:00", signOnLocation: "KGWA Dn", sOffTime: "20:30:00", signOffLocation: "Depot", kms: 152, dutyHrs: "07:20:00", drivingHrs: "05:49:00", breakTime: "01:03:00", dutyType: "34", trips: [
    { trainNo: "219", timeFrm: "13:47:00", timeTo: "15:13:00", takeoverLocation: "KGWA Dn", handoverLocation: "PYID" },
    { trainNo: "217", timeFrm: "15:45:00", timeTo: "17:41:00", takeoverLocation: "PYID", handoverLocation: "P DHO" },
    { trainNo: "219", timeFrm: "19:37:00", timeTo: "20:30:00", takeoverLocation: "P DHO", handoverLocation: "P DHO" }
  ]},
  { dutyNo: "35", sOnTime: "13:10:00", signOnLocation: "PYID Dn", sOffTime: "20:50:00", signOffLocation: "Depot", kms: 157, dutyHrs: "07:40:00", drivingHrs: "05:40:00", breakTime: "01:00:00", dutyType: "35", trips: [
    { trainNo: "206", timeFrm: "13:25:00", timeTo: "15:03:00", takeoverLocation: "PYID Dn", handoverLocation: "PYID" },
    { trainNo: "212", timeFrm: "15:33:00", timeTo: "18:07:00", takeoverLocation: "PYID", handoverLocation: "PYID" },
    { trainNo: "222", timeFrm: "18:17:00", timeTo: "20:10:00", takeoverLocation: "P DHO", handoverLocation: "P DHO" }
  ]},
  { dutyNo: "36", sOnTime: "13:20:00", signOnLocation: "PYID", sOffTime: "21:05:00", signOffLocation: "Depot", kms: 108, dutyHrs: "07:45:00", drivingHrs: "04:24:00", breakTime: "01:00:00", dutyType: "36", trips: [
    { trainNo: "Couns", timeFrm: "13:35:00", timeTo: "15:11:00", isCounselling: true },
    { trainNo: "213", timeFrm: "16:01:00", timeTo: "17:51:00", takeoverLocation: "PYID", handoverLocation: "PYID" },
    { trainNo: "208", timeFrm: "18:37:00", timeTo: "20:47:00", takeoverLocation: "PYID", handoverLocation: "PYID" }
  ]},
  { dutyNo: "37", sOnTime: "13:20:00", signOnLocation: "PYID", sOffTime: "21:05:00", signOffLocation: "Depot", kms: 136, dutyHrs: "07:45:00", drivingHrs: "04:28:00", breakTime: "01:00:00", dutyType: "37", trips: [
    { trainNo: "Couns", timeFrm: "13:35:00", timeTo: "15:38:00", isCounselling: true },
    { trainNo: "207", timeFrm: "16:08:00", timeTo: "18:17:00", takeoverLocation: "PYID", handoverLocation: "PYID" },
    { trainNo: "214", timeFrm: "18:22:00", timeTo: "21:00:00", takeoverLocation: "P DHO", handoverLocation: "P DHO" }
  ]},
  { dutyNo: "38", sOnTime: "13:20:00", signOnLocation: "PYID", sOffTime: "21:10:00", signOffLocation: "PYID", kms: 136, dutyHrs: "07:50:00", drivingHrs: "04:22:00", breakTime: "01:00:00", dutyType: "38", trips: [
    { trainNo: "Couns", timeFrm: "13:35:00", timeTo: "15:47:00", isCounselling: true },
    { trainNo: "221", timeFrm: "16:17:00", timeTo: "18:27:00", takeoverLocation: "PYID", handoverLocation: "PYID" },
    { trainNo: "205", timeFrm: "18:47:00", timeTo: "21:00:00", takeoverLocation: "PYID", handoverLocation: "PYID" }
  ]},
  { dutyNo: "39", sOnTime: "13:20:00", signOnLocation: "PYID", sOffTime: "21:10:00", signOffLocation: "PYID", kms: 136, dutyHrs: "07:50:00", drivingHrs: "04:20:00", breakTime: "01:00:00", dutyType: "39", trips: [
    { trainNo: "Couns", timeFrm: "13:35:00", timeTo: "15:55:00", isCounselling: true },
    { trainNo: "208", timeFrm: "16:25:00", timeTo: "18:37:00", takeoverLocation: "PYID", handoverLocation: "PYID" },
    { trainNo: "210", timeFrm: "18:57:00", timeTo: "21:10:00", takeoverLocation: "PYID", handoverLocation: "PYID" }
  ]},
  { dutyNo: "40", sOnTime: "13:15:00", signOnLocation: "PYID", sOffTime: "21:20:00", signOffLocation: "KGWA", kms: 108, dutyHrs: "08:05:00", drivingHrs: "04:23:00", breakTime: "01:00:00", dutyType: "40", trips: [
    { trainNo: "Couns", timeFrm: "13:50:00", timeTo: "16:11:00", isCounselling: true },
    { trainNo: "209", timeFrm: "16:11:00", timeTo: "18:12:00", takeoverLocation: "PYID", handoverLocation: "PYID" },
    { trainNo: "201", timeFrm: "19:07:00", timeTo: "21:15:00", takeoverLocation: "PYID", handoverLocation: "KGWA" }
  ]},
  { dutyNo: "41", sOnTime: "13:54:00", signOnLocation: "PYID Dn", sOffTime: "21:40:00", signOffLocation: "PYID", kms: 191, dutyHrs: "07:45:00", drivingHrs: "06:13:00", breakTime: "01:08:00", dutyType: "41", trips: [
    { trainNo: "208", timeFrm: "14:09:00", timeTo: "16:25:00", takeoverLocation: "PYID Dn", handoverLocation: "PYID" },
    { trainNo: "205", timeFrm: "17:04:00", timeTo: "18:47:00", takeoverLocation: "PYID", handoverLocation: "PYID" },
    { trainNo: "211", timeFrm: "19:17:00", timeTo: "21:31:00", takeoverLocation: "PYID", handoverLocation: "PYID" }
  ]},
  { dutyNo: "42", sOnTime: "13:45:00", signOnLocation: "PYID", sOffTime: "21:45:00", signOffLocation: "PYID", kms: 0, dutyHrs: "08:00:00", drivingHrs: "00:00:00", breakTime: "00:00:00", dutyType: "Rd3 Stby", trips: [{ trainNo: "Rd3 Stby", timeFrm: "13:45:00", timeTo: "21:45:00", takeoverLocation: "PYID", handoverLocation: "PYID" }] },
  { dutyNo: "43", sOnTime: "14:00:00", signOnLocation: "PYID", sOffTime: "22:00:00", signOffLocation: "PYID", kms: 0, dutyHrs: "08:00:00", drivingHrs: "00:00:00", breakTime: "00:00:00", dutyType: "Pro 2", trips: [{ trainNo: "Pro 2", timeFrm: "14:00:00", timeTo: "22:00:00", takeoverLocation: "PYID", handoverLocation: "PYID" }] },
  { dutyNo: "44", sOnTime: "14:00:00", signOnLocation: "PYID", sOffTime: "21:45:00", signOffLocation: "PYID", kms: 191, dutyHrs: "07:45:00", drivingHrs: "06:03:00", breakTime: "01:17:00", dutyType: "44", trips: [
    { trainNo: "213", timeFrm: "14:17:00", timeTo: "16:01:00", takeoverLocation: "PYID", handoverLocation: "PYID" },
    { trainNo: "210", timeFrm: "16:48:00", timeTo: "18:57:00", takeoverLocation: "PYID", handoverLocation: "PYID" },
    { trainNo: "202", timeFrm: "19:27:00", timeTo: "21:37:00", takeoverLocation: "PYID", handoverLocation: "PYID" }
  ]},
  { dutyNo: "45", sOnTime: "14:00:00", signOnLocation: "PYID", sOffTime: "21:50:00", signOffLocation: "PYID", kms: 191, dutyHrs: "07:50:00", drivingHrs: "06:10:00", breakTime: "01:10:00", dutyType: "45", trips: [
    { trainNo: "214", timeFrm: "14:17:00", timeTo: "16:33:00", takeoverLocation: "PYID", handoverLocation: "PYID" },
    { trainNo: "201", timeFrm: "17:13:00", timeTo: "19:02:00", takeoverLocation: "PYID", handoverLocation: "PYID" },
    { trainNo: "213", timeFrm: "19:12:00", timeTo: "21:16:00", takeoverLocation: "PYID", handoverLocation: "PYID" }
  ]},
  { dutyNo: "46", sOnTime: "14:10:00", signOnLocation: "PYID", sOffTime: "21:55:00", signOffLocation: "PYID", kms: 191, dutyHrs: "07:45:00", drivingHrs: "06:20:00", breakTime: "01:09:00", dutyType: "46", trips: [
    { trainNo: "209", timeFrm: "14:25:00", timeTo: "16:41:00", takeoverLocation: "PYID", handoverLocation: "PYID" },
    { trainNo: "206", timeFrm: "17:20:00", timeTo: "19:12:00", takeoverLocation: "PYID", handoverLocation: "PYID" },
    { trainNo: "223", timeFrm: "19:42:00", timeTo: "21:54:00", takeoverLocation: "PYID", handoverLocation: "PYID" }
  ]},
  { dutyNo: "47", sOnTime: "14:15:00", signOnLocation: "PYID", sOffTime: "21:50:00", signOffLocation: "KGWA", kms: 180, dutyHrs: "07:35:00", drivingHrs: "05:52:00", breakTime: "01:17:00", dutyType: "47", trips: [
    { trainNo: "221", timeFrm: "14:33:00", timeTo: "16:17:00", takeoverLocation: "PYID", handoverLocation: "PYID" },
    { trainNo: "211", timeFrm: "17:01:00", timeTo: "19:17:00", takeoverLocation: "PYID", handoverLocation: "PYID" },
    { trainNo: "220", timeFrm: "19:47:00", timeTo: "21:42:00", takeoverLocation: "KGWA Up", handoverLocation: "KGWA" }
  ]},
  { dutyNo: "48", sOnTime: "14:20:00", signOnLocation: "PYID", sOffTime: "21:40:00", signOffLocation: "PUTH", kms: 170, dutyHrs: "07:20:00", drivingHrs: "05:30:00", breakTime: "01:30:00", dutyType: "48", trips: [
    { trainNo: "210", timeFrm: "14:33:00", timeTo: "16:48:00", takeoverLocation: "PYID", handoverLocation: "PYID" },
    { trainNo: "219", timeFrm: "17:28:00", timeTo: "19:37:00", takeoverLocation: "PYID", handoverLocation: "PUTH Dn" },
    { trainNo: "207", timeFrm: "20:27:00", timeTo: "21:34:00", takeoverLocation: "PUTH Dn", handoverLocation: "PUTH" }
  ]},
  { dutyNo: "49", sOnTime: "14:25:00", signOnLocation: "PYID", sOffTime: "21:30:00", signOffLocation: "KGWA", kms: 160, dutyHrs: "07:05:00", drivingHrs: "05:13:00", breakTime: "01:29:00", dutyType: "49", trips: [
    { trainNo: "215", timeFrm: "14:41:00", timeTo: "16:57:00", takeoverLocation: "PYID", handoverLocation: "PYID" },
    { trainNo: "220", timeFrm: "17:30:00", timeTo: "19:37:00", takeoverLocation: "PYID", handoverLocation: "KGWA Dn" },
    { trainNo: "221", timeFrm: "20:37:00", timeTo: "21:24:00", takeoverLocation: "KGWA Dn", handoverLocation: "KGWA" }
  ]},
  { dutyNo: "50", sOnTime: "14:35:00", signOnLocation: "PYID", sOffTime: "21:40:00", signOffLocation: "KGWA", kms: 160, dutyHrs: "07:05:00", drivingHrs: "05:17:00", breakTime: "01:32:00", dutyType: "50", trips: [
    { trainNo: "211", timeFrm: "14:49:00", timeTo: "17:04:00", takeoverLocation: "PYID", handoverLocation: "PYID" },
    { trainNo: "203", timeFrm: "17:46:00", timeTo: "19:57:00", takeoverLocation: "PYID", handoverLocation: "KGWA Dn" },
    { trainNo: "208", timeFrm: "20:47:00", timeTo: "21:34:00", takeoverLocation: "KGWA Dn", handoverLocation: "KGWA" }
  ]},
  { dutyNo: "51", sOnTime: "14:40:00", signOnLocation: "PYID", sOffTime: "21:55:00", signOffLocation: "PUTH", kms: 165, dutyHrs: "07:15:00", drivingHrs: "05:28:00", breakTime: "01:24:00", dutyType: "51", trips: [
    { trainNo: "201", timeFrm: "14:57:00", timeTo: "17:13:00", takeoverLocation: "PYID", handoverLocation: "PYID" },
    { trainNo: "213", timeFrm: "17:52:00", timeTo: "19:32:00", takeoverLocation: "PYID", handoverLocation: "PUTH Up" },
    { trainNo: "212", timeFrm: "20:17:00", timeTo: "21:50:00", takeoverLocation: "PUTH Up", handoverLocation: "PUTH" }
  ]},
  { dutyNo: "52", sOnTime: "14:50:00", signOnLocation: "PYID", sOffTime: "21:50:00", signOffLocation: "PUTH", kms: 160, dutyHrs: "06:59:00", drivingHrs: "05:16:00", breakTime: "01:22:00", dutyType: "52", trips: [
    { trainNo: "206", timeFrm: "15:05:00", timeTo: "17:20:00", takeoverLocation: "PYID", handoverLocation: "PYID" },
    { trainNo: "204", timeFrm: "17:57:00", timeTo: "20:07:00", takeoverLocation: "PYID", handoverLocation: "PUTH Dn" },
    { trainNo: "206", timeFrm: "20:52:00", timeTo: "21:44:00", takeoverLocation: "PUTH Dn", handoverLocation: "PUTH" }
  ]},
  { dutyNo: "53", sOnTime: "15:00:00", signOnLocation: "PYID", sOffTime: "21:30:00", signOffLocation: "Depot", kms: 120, dutyHrs: "06:30:00", drivingHrs: "04:47:00", breakTime: "01:24:00", dutyType: "53", trips: [
    { trainNo: "219", timeFrm: "15:15:00", timeTo: "17:28:00", takeoverLocation: "PYID", handoverLocation: "PYID" },
    { trainNo: "223", timeFrm: "18:02:00", timeTo: "19:42:00", takeoverLocation: "PYID", handoverLocation: "P DHO" },
    { trainNo: "218", timeFrm: "20:32:00", timeTo: "21:25:00", takeoverLocation: "P DHO", handoverLocation: "Depot" }
  ]},
  { dutyNo: "54", sOnTime: "15:05:00", signOnLocation: "PYID", sOffTime: "21:40:00", signOffLocation: "PYID", kms: 149, dutyHrs: "06:35:00", drivingHrs: "04:53:00", breakTime: "01:21:00", dutyType: "54", trips: [
    { trainNo: "220", timeFrm: "15:21:00", timeTo: "17:36:00", takeoverLocation: "PYID", handoverLocation: "PYID" },
    { trainNo: "212", timeFrm: "18:07:00", timeTo: "20:17:00", takeoverLocation: "PYID", handoverLocation: "PYID" },
    { trainNo: "210", timeFrm: "21:07:00", timeTo: "21:36:00", takeoverLocation: "PYID", handoverLocation: "PYID" }
  ]},
  { dutyNo: "55", sOnTime: "15:15:00", signOnLocation: "PYID", sOffTime: "21:50:00", signOffLocation: "PYID", kms: 149, dutyHrs: "06:35:00", drivingHrs: "04:55:00", breakTime: "01:21:00", dutyType: "55", trips: [
    { trainNo: "203", timeFrm: "15:29:00", timeTo: "17:46:00", takeoverLocation: "PYID", handoverLocation: "PYID" },
    { trainNo: "207", timeFrm: "18:17:00", timeTo: "20:27:00", takeoverLocation: "PYID", handoverLocation: "PYID" },
    { trainNo: "215", timeFrm: "21:17:00", timeTo: "21:46:00", takeoverLocation: "PYID", handoverLocation: "PYID" }
  ]},
  { dutyNo: "56", sOnTime: "15:20:00", signOnLocation: "PYID", sOffTime: "20:40:00", signOffLocation: "PYID", kms: 119, dutyHrs: "05:20:00", drivingHrs: "04:03:00", breakTime: "00:51:00", dutyType: "56", trips: [
    { trainNo: "204", timeFrm: "15:37:00", timeTo: "16:12:00", takeoverLocation: "PYID", handoverLocation: "PYID" },
    { trainNo: "214", timeFrm: "16:33:00", timeTo: "18:22:00", takeoverLocation: "PYID", handoverLocation: "PYID" },
    { trainNo: "218", timeFrm: "18:52:00", timeTo: "20:32:00", takeoverLocation: "PYID", handoverLocation: "PYID" }
  ]},
  { dutyNo: "57", sOnTime: "15:35:00", signOnLocation: "Dpo - Rd3", sOffTime: "21:30:00", signOffLocation: "Depot", kms: 119, dutyHrs: "05:55:00", drivingHrs: "04:55:00", breakTime: "00:30:00", dutyType: "57", trips: [
    { trainNo: "222", timeFrm: "15:50:00", timeTo: "18:12:00", isShortLoop: true, takeoverLocation: "Dpo - Rd3", handoverLocation: "P DHO" },
    { trainNo: "216", timeFrm: "18:42:00", timeTo: "21:15:00", takeoverLocation: "P DHO", handoverLocation: "Depot" }
  ]},
  { dutyNo: "58", sOnTime: "15:35:00", signOnLocation: "Dpo - Rd3", sOffTime: "21:30:00", signOffLocation: "Depot", kms: 97, dutyHrs: "05:55:00", drivingHrs: "04:50:00", breakTime: "00:30:00", dutyType: "58", trips: [
    { trainNo: "223", timeFrm: "15:45:00", timeTo: "18:02:00", isShortLoop: true, takeoverLocation: "Dpo - Rd3", handoverLocation: "P DHO" },
    { trainNo: "209", timeFrm: "18:32:00", timeTo: "21:05:00", takeoverLocation: "P DHO", handoverLocation: "Depot" }
  ]},
  { dutyNo: "59", sOnTime: "15:55:00", signOnLocation: "Dpo - Rd3", sOffTime: "21:55:00", signOffLocation: "Rd3 Stbl", kms: 136, dutyHrs: "06:00:00", drivingHrs: "04:28:00", breakTime: "00:52:00", dutyType: "59", trips: [
    { trainNo: "204", timeFrm: "16:10:00", timeTo: "17:57:00", isShortLoop: true, takeoverLocation: "Dpo - Rd3", handoverLocation: "PYID" },
    { trainNo: "221", timeFrm: "18:27:00", timeTo: "20:37:00", takeoverLocation: "PYID", handoverLocation: "PYID" },
    { trainNo: "205", timeFrm: "21:00:00", timeTo: "21:50:00", takeoverLocation: "PYID", handoverLocation: "Rd3 Stbl" }
  ]},
  { dutyNo: "60", sOnTime: "16:05:00", signOnLocation: "Dpo - Rd3", sOffTime: "22:05:00", signOffLocation: "KGWA Up", kms: 109, dutyHrs: "06:00:00", drivingHrs: "04:29:00", breakTime: "01:10:00", dutyType: "60", trips: [
    { trainNo: "205", timeFrm: "16:10:00", timeTo: "17:06:00", isShortLoop: true, takeoverLocation: "Dpo - Rd3", handoverLocation: "PYID" },
    { trainNo: "217", timeFrm: "17:41:00", timeTo: "19:22:00", takeoverLocation: "PYID", handoverLocation: "PYID" },
    { trainNo: "203", timeFrm: "19:57:00", timeTo: "21:50:00", takeoverLocation: "PYID", handoverLocation: "KGWA Up" }
  ]},
  { dutyNo: "61", sOnTime: "16:05:00", signOnLocation: "Dpo - Rd3", sOffTime: "22:00:00", signOffLocation: "KGWA", kms: 108, dutyHrs: "05:55:00", drivingHrs: "04:33:00", breakTime: "01:02:00", dutyType: "61", trips: [
    { trainNo: "216", timeFrm: "16:20:00", timeTo: "18:42:00", isShortLoop: true, takeoverLocation: "Dpo - Rd3", handoverLocation: "PYID" },
    { trainNo: "206", timeFrm: "19:12:00", timeTo: "20:52:00", takeoverLocation: "PYID", handoverLocation: "PYID" },
    { trainNo: "217", timeFrm: "21:25:00", timeTo: "21:56:00", takeoverLocation: "PYID", handoverLocation: "KGWA" }
  ]},
  { dutyNo: "62", sOnTime: "16:15:00", signOnLocation: "Dpo - Rd3", sOffTime: "22:05:00", signOffLocation: "Depot", kms: 102, dutyHrs: "05:50:00", drivingHrs: "04:53:00", breakTime: "00:36:00", dutyType: "62", trips: [
    { trainNo: "218", timeFrm: "16:30:00", timeTo: "18:52:00", isShortLoop: true, takeoverLocation: "Dpo - Rd3", handoverLocation: "PYID" },
    { trainNo: "217", timeFrm: "19:22:00", timeTo: "21:25:00", takeoverLocation: "PYID", handoverLocation: "Depot" },
    { trainNo: "211", timeFrm: "21:31:00", timeTo: "22:00:00", takeoverLocation: "Depot", handoverLocation: "Depot" }
  ]},
  { dutyNo: "63", sOnTime: "16:35:00", signOnLocation: "Dpo - Rd3", sOffTime: "22:00:00", signOffLocation: "KGWA", kms: 114, dutyHrs: "05:25:00", drivingHrs: "04:28:00", breakTime: "00:40:00", dutyType: "63", trips: [
    { trainNo: "220", timeFrm: "16:50:00", timeTo: "19:27:00", isShortLoop: true, takeoverLocation: "Dpo - Rd3", handoverLocation: "PYID" },
    { trainNo: "204", timeFrm: "20:07:00", timeTo: "21:58:00", takeoverLocation: "KGWA Up", handoverLocation: "KGWA" }
  ]},
  { dutyNo: "64", sOnTime: "21:15:00", signOnLocation: "PUTH Dn", sOffTime: "06:35:00", signOffLocation: "KGWA", kms: 127, dutyHrs: "09:20:00", drivingHrs: "05:08:00", breakTime: "03:50:00", dutyType: "NIGHT64", trips: [
    { trainNo: "207", timeFrm: "21:32:00", timeTo: "00:15:00", takeoverLocation: "PUTH Dn", handoverLocation: "APTS Dn" },
    { trainNo: "210", timeFrm: "04:05:00", timeTo: "06:30:00", takeoverLocation: "APTS Dn", handoverLocation: "KGWA Dn" }
  ]},
  { dutyNo: "65", sOnTime: "21:30:00", signOnLocation: "PYID Up", sOffTime: "06:45:00", signOffLocation: "PUTH", kms: 120, dutyHrs: "09:15:00", drivingHrs: "05:13:00", breakTime: "03:40:00", dutyType: "NIGHT65", trips: [
    { trainNo: "213", timeFrm: "21:46:00", timeTo: "23:55:00", takeoverLocation: "PYID Up", handoverLocation: "NLC Up" },
    { trainNo: "207", timeFrm: "03:35:00", timeTo: "06:40:00", takeoverLocation: "NLC Up", handoverLocation: "PUTH" }
  ]},
  { dutyNo: "66", sOnTime: "21:30:00", signOnLocation: "KGWA Up", sOffTime: "06:30:00", signOffLocation: "PYID", kms: 105, dutyHrs: "09:00:00", drivingHrs: "04:34:00", breakTime: "04:05:00", dutyType: "NIGHT66", trips: [
    { trainNo: "203", timeFrm: "21:48:00", timeTo: "00:10:00", takeoverLocation: "KGWA Up", handoverLocation: "PUTH Dn" },
    { trainNo: "211", timeFrm: "04:15:00", timeTo: "06:27:00", takeoverLocation: "PUTH Dn", handoverLocation: "PYID Dn" }
  ]},
  { dutyNo: "67", sOnTime: "21:30:00", signOnLocation: "PYID Dn", sOffTime: "06:20:00", signOffLocation: "KGWA", kms: 113, dutyHrs: "08:50:00", drivingHrs: "04:57:00", breakTime: "03:30:00", dutyType: "NIGHT67", trips: [
    { trainNo: "212", timeFrm: "21:48:00", timeTo: "00:15:00", takeoverLocation: "PYID Dn", handoverLocation: "APTS Up" },
    { trainNo: "209", timeFrm: "03:45:00", timeTo: "06:15:00", takeoverLocation: "APTS Up", handoverLocation: "KGWA Up" }
  ]},
  { dutyNo: "68", sOnTime: "21:30:00", signOnLocation: "KGWA Up", sOffTime: "06:00:00", signOffLocation: "PYID", kms: 92, dutyHrs: "08:30:00", drivingHrs: "04:10:00", breakTime: "03:50:00", dutyType: "NIGHT68", trips: [
    { trainNo: "220", timeFrm: "21:42:00", timeTo: "23:50:00", takeoverLocation: "KGWA Up", handoverLocation: "PUTH Dn" },
    { trainNo: "208", timeFrm: "03:40:00", timeTo: "05:42:00", takeoverLocation: "PUTH Dn", handoverLocation: "PYID Dn" }
  ]},
  { dutyNo: "69", sOnTime: "21:05:00", signOnLocation: "KGWA Dn", sOffTime: "07:30:00", signOffLocation: "PYID", kms: 51, dutyHrs: "10:25:00", drivingHrs: "02:45:00", breakTime: "07:20:00", dutyType: "NIGHT69", trips: [
    { trainNo: "221", timeFrm: "21:22:00", timeTo: "23:10:00", takeoverLocation: "KGWA Dn", handoverLocation: "Bt DHO" },
    { trainNo: "217", timeFrm: "06:30:00", timeTo: "07:27:00", takeoverLocation: "BIET DnBE", handoverLocation: "PYID" }
  ]},
  { dutyNo: "70", sOnTime: "21:15:00", signOnLocation: "KGWA Dn", sOffTime: "07:00:00", signOffLocation: "PUTH", kms: 81, dutyHrs: "09:45:00", drivingHrs: "02:38:00", breakTime: "05:35:00", dutyType: "NIGHT70", trips: [
    { trainNo: "208", timeFrm: "21:32:00", timeTo: "00:10:00", takeoverLocation: "KGWA Dn", handoverLocation: "B DHO" },
    { trainNo: "208", timeFrm: "05:40:00", timeTo: "06:55:00", takeoverLocation: "PYID Dn", handoverLocation: "PUTH" }
  ]},
  { dutyNo: "71", sOnTime: "21:20:00", signOnLocation: "KGWA Dn", sOffTime: "06:25:00", signOffLocation: "KGWA", kms: 123, dutyHrs: "09:05:00", drivingHrs: "05:09:00", breakTime: "03:35:00", dutyType: "NIGHT71", trips: [
    { trainNo: "210", timeFrm: "21:34:00", timeTo: "23:55:00", takeoverLocation: "KGWA Dn", handoverLocation: "NGSA DnPF" },
    { trainNo: "202", timeFrm: "03:30:00", timeTo: "06:18:00", takeoverLocation: "NGSA DnPF", handoverLocation: "KGWA Up" }
  ]},
  { dutyNo: "72", sOnTime: "21:20:00", signOnLocation: "PYID Up", sOffTime: "06:35:00", signOffLocation: "KGWA", kms: 126, dutyHrs: "09:15:00", drivingHrs: "05:00:00", breakTime: "03:50:00", dutyType: "NIGHT72", trips: [
    { trainNo: "202", timeFrm: "21:37:00", timeTo: "00:20:00", takeoverLocation: "PYID Up", handoverLocation: "BEIT UpPF" },
    { trainNo: "204", timeFrm: "04:10:00", timeTo: "06:28:00", takeoverLocation: "BEIT UpPF", handoverLocation: "KGWA Up" }
  ]},
  { dutyNo: "73", sOnTime: "21:25:00", signOnLocation: "PYID Dn", sOffTime: "06:40:00", signOffLocation: "PYID", kms: 124, dutyHrs: "09:15:00", drivingHrs: "05:30:00", breakTime: "03:25:00", dutyType: "NIGHT73", trips: [
    { trainNo: "206", timeFrm: "21:42:00", timeTo: "00:15:00", takeoverLocation: "PYID Dn", handoverLocation: "SPGD DnPF" },
    { trainNo: "201", timeFrm: "03:40:00", timeTo: "06:37:00", takeoverLocation: "SPGD DnPF", handoverLocation: "PYID Dn" }
  ]},
  { dutyNo: "74", sOnTime: "21:30:00", signOnLocation: "PYID Dn", sOffTime: "06:45:00", signOffLocation: "KGWA", kms: 119, dutyHrs: "09:15:00", drivingHrs: "05:12:00", breakTime: "03:45:00", dutyType: "NIGHT74", trips: [
    { trainNo: "215", timeFrm: "21:44:00", timeTo: "00:15:00", takeoverLocation: "PYID Dn", handoverLocation: "JIDL UpPF" },
    { trainNo: "205", timeFrm: "04:00:00", timeTo: "06:41:00", takeoverLocation: "JIDL UpPF", handoverLocation: "KGWA Up" }
  ]},
  { dutyNo: "75", sOnTime: "21:40:00", signOnLocation: "PYID Dn", sOffTime: "06:30:00", signOffLocation: "KGWA", kms: 124, dutyHrs: "08:50:00", drivingHrs: "04:39:00", breakTime: "03:40:00", dutyType: "NIGHT75", trips: [
    { trainNo: "217", timeFrm: "21:54:00", timeTo: "00:05:00", takeoverLocation: "PYID Dn", handoverLocation: "BIET DnPF" },
    { trainNo: "203", timeFrm: "03:45:00", timeTo: "06:33:00", takeoverLocation: "BIET DnPF", handoverLocation: "KGWA Up" }
  ]},
  { dutyNo: "76", sOnTime: "21:40:00", signOnLocation: "PYID Dn", sOffTime: "06:50:00", signOffLocation: "PYID", kms: 18, dutyHrs: "09:10:00", drivingHrs: "02:22:00", breakTime: "06:30:00", dutyType: "NIGHT76", trips: [
    { trainNo: "223", timeFrm: "21:54:00", timeTo: "22:40:00", takeoverLocation: "PYID Dn", handoverLocation: "N PKT" },
    { trainNo: "206", timeFrm: "05:10:00", timeTo: "06:47:00", takeoverLocation: "Depo - JHLI Trn Bk", handoverLocation: "PYID" }
  ]},
  { dutyNo: "77", sOnTime: "21:40:00", signOnLocation: "KGWA Up", sOffTime: "07:05:00", signOffLocation: "PYID", kms: 15, dutyHrs: "09:25:00", drivingHrs: "03:04:00", breakTime: "06:00:00", dutyType: "NIGHT77", trips: [
    { trainNo: "204", timeFrm: "21:56:00", timeTo: "23:30:00", takeoverLocation: "KGWA Up", handoverLocation: "B DHO" },
    { trainNo: "PDC", timeFrm: "05:30:00", timeTo: "07:00:00", takeoverLocation: "213; 214; 215", handoverLocation: "DEPOT" }
  ]},
  { dutyNo: "78", sOnTime: "21:30:00", signOnLocation: "PYID", sOffTime: "06:30:00", signOffLocation: "PYID", kms: 0, dutyHrs: "09:00:00", drivingHrs: "00:00:00", breakTime: "00:00:00", dutyType: "Pro 3", trips: [{ trainNo: "Pro 3", timeFrm: "21:30:00", timeTo: "06:30:00", takeoverLocation: "PYID", handoverLocation: "PYID" }] },
  { dutyNo: "79", sOnTime: "21:30:00", signOnLocation: "PYID", sOffTime: "06:30:00", signOffLocation: "PYID", kms: 0, dutyHrs: "09:00:00", drivingHrs: "00:00:00", breakTime: "00:00:00", dutyType: "CC3", trips: [{ trainNo: "CC3", timeFrm: "21:30:00", timeTo: "06:30:00", takeoverLocation: "PYID", handoverLocation: "PYID" }] }
];
