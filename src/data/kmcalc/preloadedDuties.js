/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export const PRELOADED_DUTIES = [
  {
    dutyNo: "1",
    sOnTime: "06:00:00",
    signOnLocation: "PYID",
    sOffTime: "14:00:00",
    signOffLocation: "PYID",
    kms: 0,
    dutyHrs: "08:00:00",
    drivingHrs: "00:00:00",
    breakTime: "00:00:00",
    counselling: "",
    dutyType: "PRO1",
    isNightShift: false,
    trips: [
      {
        trainNo: "Pro 1",
        timeFrm: "06:00:00",
        timeTo: "14:00:00",
        tripTime: "08:00:00",
        takeoverLocation: "PYID",
        handoverLocation: "PYID",
        breakTime: ""
      }
    ]
  },
  {
    dutyNo: "2",
    sOnTime: "06:00:00",
    signOnLocation: "PYID",
    sOffTime: "14:00:00",
    signOffLocation: "PYID",
    kms: 0,
    dutyHrs: "08:00:00",
    drivingHrs: "00:00:00",
    breakTime: "00:00:00",
    counselling: "",
    dutyType: "R3-S.BY",
    isNightShift: false,
    trips: [
      {
        trainNo: "Rd3 Stby",
        timeFrm: "06:00:00",
        timeTo: "14:00:00",
        tripTime: "08:00:00",
        takeoverLocation: "PYID",
        handoverLocation: "PYID",
        breakTime: ""
      }
    ]
  },
  {
    dutyNo: "3",
    sOnTime: "06:00:00",
    signOnLocation: "KGWA Dn",
    sOffTime: "13:40:00",
    signOffLocation: "PYID",
    kms: 180,
    dutyHrs: "07:40:00",
    drivingHrs: "05:59:12",
    breakTime: "01:25:00",
    counselling: "",
    dutyType: "3T3",
    isNightShift: false,
    trips: [
      {
        trainNo: "209",
        timeFrm: "06:13:00",
        timeTo: "07:48:12",
        tripTime: "01:35:12",
        takeoverLocation: "KGWA Dn",
        handoverLocation: "PYID",
        breakTime: "00:30:00",
        segments: [
          { fromStationCode: "KGWA", toStationCode: "PUTH_BE", calculatedKms: 10.68 }
        ]
      },
      {
        trainNo: "201",
        timeFrm: "08:18:12",
        timeTo: "10:28:12",
        tripTime: "02:10:00",
        takeoverLocation: "PYID",
        handoverLocation: "PYID",
        breakTime: "00:55:00"
      },
      {
        trainNo: "212",
        timeFrm: "11:23:12",
        timeTo: "13:37:12",
        tripTime: "02:14:00",
        takeoverLocation: "PYID",
        handoverLocation: "PYID",
        breakTime: ""
      }
    ]
  },
  {
    dutyNo: "4",
    sOnTime: "06:00:00",
    signOnLocation: "Depo/No PDC",
    sOffTime: "13:45:00",
    signOffLocation: "PYID",
    kms: 110,
    dutyHrs: "07:45:00",
    drivingHrs: "05:14:00",
    breakTime: "02:10:00",
    counselling: "",
    dutyType: "4",
    isNightShift: false,
    trips: [
      {
        trainNo: "213",
        timeFrm: "06:15:00",
        timeTo: "08:13:12",
        tripTime: "01:58:12",
        takeoverLocation: "Depo",
        handoverLocation: "PYID",
        breakTime: "00:40:00"
      },
      {
        trainNo: "218",
        timeFrm: "08:53:12",
        timeTo: "11:35:00",
        tripTime: "02:41:48",
        takeoverLocation: "PYID",
        handoverLocation: "P DHO",
        breakTime: "01:30:00"
      },
      {
        trainNo: "220",
        timeFrm: "13:05:00",
        timeTo: "13:39:00",
        tripTime: "00:34:00",
        takeoverLocation: "PYID",
        handoverLocation: "PYID",
        breakTime: ""
      }
    ]
  },
  {
    dutyNo: "5",
    sOnTime: "06:00:00",
    signOnLocation: "Rd3 Induct",
    sOffTime: "13:25:00",
    signOffLocation: "PYID",
    kms: 161,
    dutyHrs: "07:25:00",
    drivingHrs: "05:46:12",
    breakTime: "01:25:00",
    counselling: "",
    dutyType: "5T3",
    isNightShift: false,
    trips: [
      { trainNo: "212", timeFrm: "06:10:00", timeTo: "08:03:12", tripTime: "01:53:12", takeoverLocation: "Rd3", handoverLocation: "PYID", breakTime: "00:30:00" },
      { trainNo: "215", timeFrm: "08:33:12", timeTo: "10:13:12", tripTime: "01:40:00", takeoverLocation: "PYID", handoverLocation: "PYID", breakTime: "00:55:00" },
      { trainNo: "204", timeFrm: "11:08:12", timeTo: "13:21:12", tripTime: "02:13:00", takeoverLocation: "PYID", handoverLocation: "PYID", breakTime: "" }
    ]
  },
  {
    dutyNo: "6",
    sOnTime: "06:05:00",
    signOnLocation: "PYID UP",
    sOffTime: "13:00:00",
    signOffLocation: "PYID",
    kms: 131,
    dutyHrs: "06:55:00",
    drivingHrs: "04:33:12",
    breakTime: "01:51:48",
    counselling: "",
    dutyType: "6",
    isNightShift: false,
    trips: [
      { trainNo: "202", timeFrm: "06:18:00", timeTo: "06:57:00", tripTime: "00:39:00", takeoverLocation: "PYID UP", handoverLocation: "PYID", breakTime: "00:28:00" },
      { trainNo: "217", timeFrm: "07:25:00", timeTo: "09:08:12", tripTime: "01:43:12", takeoverLocation: "PYID", handoverLocation: "PYID", breakTime: "00:35:00" },
      { trainNo: "212", timeFrm: "09:43:12", timeTo: "11:23:12", tripTime: "01:40:00", takeoverLocation: "PYID", handoverLocation: "PYID", breakTime: "00:48:48" },
      { trainNo: "209", timeFrm: "12:12:00", timeTo: "12:43:00", tripTime: "00:31:00", takeoverLocation: "PYID", handoverLocation: "PYID", breakTime: "" }
    ]
  },
  {
    dutyNo: "7",
    sOnTime: "06:05:00",
    signOnLocation: "Dpo - Rd3",
    sOffTime: "14:00:00",
    signOffLocation: "PYID",
    kms: 163,
    dutyHrs: "07:55:00",
    drivingHrs: "06:15:24",
    breakTime: "01:17:48",
    counselling: "",
    dutyType: "7T",
    isNightShift: false,
    trips: [
      { trainNo: "216", timeFrm: "06:20:00", timeTo: "08:43:12", tripTime: "02:23:12", takeoverLocation: "Dpo", handoverLocation: "PYID", breakTime: "00:30:00" },
      { trainNo: "220", timeFrm: "09:13:12", timeTo: "10:53:12", tripTime: "01:40:00", takeoverLocation: "PYID", handoverLocation: "PYID", breakTime: "00:47:48" },
      { trainNo: "207", timeFrm: "11:41:00", timeTo: "13:53:12", tripTime: "02:12:12", takeoverLocation: "PYID", handoverLocation: "PYID", breakTime: "" }
    ]
  },
  {
    dutyNo: "8",
    sOnTime: "06:10:00",
    signOnLocation: "KGWA Dn",
    sOffTime: "12:30:00",
    signOffLocation: "Depot",
    kms: 114,
    dutyHrs: "06:20:00",
    drivingHrs: "04:27:00",
    breakTime: "01:20:00",
    counselling: "",
    dutyType: "8",
    isNightShift: false,
    trips: [
      { trainNo: "210", timeFrm: "06:28:00", timeTo: "07:58:12", tripTime: "01:30:12", takeoverLocation: "KGWA Dn", handoverLocation: "PYID", breakTime: "00:30:00" },
      { trainNo: "206", timeFrm: "08:28:12", timeTo: "10:38:12", tripTime: "02:10:00", takeoverLocation: "PYID", handoverLocation: "PYID", breakTime: "00:50:00" },
      { trainNo: "205", timeFrm: "11:28:12", timeTo: "12:15:00", tripTime: "00:46:48", takeoverLocation: "PYID", handoverLocation: "P DHO", breakTime: "" }
    ]
  },
  {
    dutyNo: "9",
    sOnTime: "06:10:00",
    signOnLocation: "PYID Dn",
    sOffTime: "14:05:00",
    signOffLocation: "PYID",
    kms: 191,
    dutyHrs: "07:55:00",
    drivingHrs: "06:06:12",
    breakTime: "01:30:00",
    counselling: "",
    dutyType: "9T3",
    isNightShift: false,
    trips: [
      { trainNo: "211", timeFrm: "06:25:00", timeTo: "08:08:12", tripTime: "01:43:12", takeoverLocation: "PYID Dn", handoverLocation: "PYID", breakTime: "00:40:00" },
      { trainNo: "203", timeFrm: "08:48:12", timeTo: "10:58:12", tripTime: "02:10:00", takeoverLocation: "PYID", handoverLocation: "PYID", breakTime: "00:50:00" },
      { trainNo: "221", timeFrm: "11:48:12", timeTo: "14:01:12", tripTime: "02:13:00", takeoverLocation: "PYID", handoverLocation: "PYID", breakTime: "" }
    ]
  },
  {
    dutyNo: "10",
    sOnTime: "06:10:00",
    signOnLocation: "Depo/No PDC",
    sOffTime: "13:50:00",
    signOffLocation: "PYID",
    kms: 163,
    dutyHrs: "07:40:00",
    drivingHrs: "05:49:12",
    breakTime: "01:31:00",
    counselling: "",
    dutyType: "10T",
    isNightShift: false,
    trips: [
      { trainNo: "214", timeFrm: "06:25:00", timeTo: "08:23:12", tripTime: "01:58:12", takeoverLocation: "Depo", handoverLocation: "PYID", breakTime: "00:40:00" },
      { trainNo: "219", timeFrm: "09:03:12", timeTo: "10:43:12", tripTime: "01:40:00", takeoverLocation: "PYID", handoverLocation: "PYID", breakTime: "00:51:00" },
      { trainNo: "213", timeFrm: "11:34:12", timeTo: "13:45:12", tripTime: "02:11:00", takeoverLocation: "PYID", handoverLocation: "PYID", breakTime: "" }
    ]
  },
  {
    dutyNo: "11",
    sOnTime: "06:15:00",
    signOnLocation: "KGWA UP",
    sOffTime: "14:15:00",
    signOffLocation: "PYID",
    kms: 160,
    dutyHrs: "08:00:00",
    drivingHrs: "06:27:00",
    breakTime: "01:14:12",
    counselling: "",
    dutyType: "11T",
    isNightShift: false,
    trips: [
      { trainNo: "204", timeFrm: "06:28:00", timeTo: "08:58:12", tripTime: "02:30:12", takeoverLocation: "KGWA UP", handoverLocation: "PYID", breakTime: "00:30:00" },
      { trainNo: "207", timeFrm: "09:28:12", timeTo: "11:41:00", tripTime: "02:12:48", takeoverLocation: "PYID", handoverLocation: "PYID", breakTime: "00:44:12" },
      { trainNo: "215", timeFrm: "12:25:12", timeTo: "12:59:00", tripTime: "00:33:48", takeoverLocation: "PYID", handoverLocation: "PYID", breakTime: "" }
    ]
  },
  {
    dutyNo: "12",
    sOnTime: "06:15:00",
    signOnLocation: "Dpo - Rd3",
    sOffTime: "14:10:00",
    signOffLocation: "PYID",
    kms: 110,
    dutyHrs: "07:55:00",
    drivingHrs: "05:28:48",
    breakTime: "02:04:12",
    counselling: "",
    dutyType: "12",
    isNightShift: false,
    trips: [
      { trainNo: "218", timeFrm: "06:30:00", timeTo: "08:53:12", tripTime: "02:23:12", takeoverLocation: "Dpo", handoverLocation: "PYID", breakTime: "00:30:00" },
      { trainNo: "222", timeFrm: "09:23:12", timeTo: "11:55:00", tripTime: "02:31:48", takeoverLocation: "PYID", handoverLocation: "P DHO", breakTime: "01:34:12" },
      { trainNo: "217", timeFrm: "13:29:12", timeTo: "14:03:00", tripTime: "00:33:48", takeoverLocation: "PYID", handoverLocation: "PYID", breakTime: "" }
    ]
  },
  {
    dutyNo: "13",
    sOnTime: "06:15:00",
    signOnLocation: "PYID UP",
    sOffTime: "14:00:00",
    signOffLocation: "PYID",
    kms: 162,
    dutyHrs: "07:45:00",
    drivingHrs: "05:33:48",
    breakTime: "01:50:12",
    counselling: "",
    dutyType: "13T3",
    isNightShift: false,
    trips: [
      { trainNo: "203", timeFrm: "06:31:00", timeTo: "08:48:12", tripTime: "02:17:12", takeoverLocation: "PYID UP", handoverLocation: "PYID", breakTime: "00:30:00" },
      { trainNo: "205", timeFrm: "09:18:12", timeTo: "11:28:12", tripTime: "02:10:00", takeoverLocation: "PYID", handoverLocation: "PYID", breakTime: "00:50:00" },
      { trainNo: "210", timeFrm: "12:18:12", timeTo: "12:51:00", tripTime: "00:32:48", takeoverLocation: "PYID", handoverLocation: "PYID", breakTime: "00:30:12" },
      { trainNo: "204", timeFrm: "13:21:12", timeTo: "13:55:00", tripTime: "00:33:48", takeoverLocation: "PYID", handoverLocation: "PYID", breakTime: "" }
    ]
  },
  {
    dutyNo: "14",
    sOnTime: "06:20:00",
    signOnLocation: "PYID DN",
    sOffTime: "14:20:00",
    signOffLocation: "PYID",
    kms: 191,
    dutyHrs: "08:00:00",
    drivingHrs: "06:06:12",
    breakTime: "01:36:00",
    counselling: "",
    dutyType: "14T3",
    isNightShift: false,
    trips: [
      { trainNo: "201", timeFrm: "06:35:00", timeTo: "08:18:12", tripTime: "01:43:12", takeoverLocation: "PYID DN", handoverLocation: "PYID", breakTime: "00:40:00" },
      { trainNo: "204", timeFrm: "08:58:12", timeTo: "11:08:12", tripTime: "02:10:00", takeoverLocation: "PYID", handoverLocation: "PYID", breakTime: "00:56:00" },
      { trainNo: "214", timeFrm: "12:04:12", timeTo: "14:17:12", tripTime: "02:13:00", takeoverLocation: "PYID", handoverLocation: "PYID", breakTime: "" }
    ]
  },
  {
    dutyNo: "18",
    sOnTime: "06:25:00",
    signOnLocation: "Dpo - Rd3",
    sOffTime: "14:25:00",
    signOffLocation: "PYID",
    kms: 97,
    dutyHrs: "08:00:00",
    drivingHrs: "04:50:00",
    breakTime: "01:30:00",
    counselling: "01:20:00",
    dutyType: "18",
    isNightShift: false,
    trips: [
      { trainNo: "219", timeFrm: "06:40:00", timeTo: "09:03:12", tripTime: "02:23:12", takeoverLocation: "Dpo", handoverLocation: "PYID", breakTime: "00:30:00" },
      { trainNo: "223", timeFrm: "09:33:12", timeTo: "12:00:00", tripTime: "02:26:48", takeoverLocation: "PYID", handoverLocation: "P DHO", breakTime: "01:00:00" },
      { trainNo: "Couns", timeFrm: "13:00:00", timeTo: "14:20:00", tripTime: "01:20:00", takeoverLocation: "PYID", handoverLocation: "PYID", breakTime: "", counsellingTime: "01:20:00" }
    ]
  },
  {
    dutyNo: "33",
    sOnTime: "12:35:00",
    signOnLocation: "PYID",
    sOffTime: "20:35:00",
    signOffLocation: "Depot",
    kms: 151,
    dutyHrs: "08:00:00",
    drivingHrs: "05:51:36",
    breakTime: "01:49:12",
    counselling: "",
    dutyType: "33",
    isNightShift: false,
    trips: [
      { trainNo: "206", timeFrm: "12:49:12", timeTo: "13:23:00", tripTime: "00:33:48", takeoverLocation: "PYID", handoverLocation: "PYID", breakTime: "00:30:12" },
      { trainNo: "207", timeFrm: "13:53:12", timeTo: "16:08:12", tripTime: "02:15:00", takeoverLocation: "PYID", handoverLocation: "PYID", breakTime: "00:49:00" },
      { trainNo: "215", timeFrm: "16:57:12", timeTo: "19:07:12", tripTime: "02:10:00", takeoverLocation: "PYID", handoverLocation: "PYID", breakTime: "00:30:00" },
      { trainNo: "219", timeFrm: "19:37:12", timeTo: "20:30:00", tripTime: "00:52:48", takeoverLocation: "PYID", handoverLocation: "P DHO", breakTime: "" }
    ]
  },
  {
    dutyNo: "35",
    sOnTime: "13:10:00",
    signOnLocation: "PYID Dn",
    sOffTime: "20:55:00",
    signOffLocation: "PYID",
    kms: 191,
    dutyHrs: "07:45:00",
    drivingHrs: "04:24:00",
    breakTime: "01:00:00",
    counselling: "01:48:12",
    dutyType: "35T3",
    isNightShift: false,
    trips: [
      { trainNo: "206", timeFrm: "13:23:00", timeTo: "15:05:00", tripTime: "01:48:12", takeoverLocation: "PYID Dn", handoverLocation: "PYID", breakTime: "00:30:00", counsellingTime: "01:48:12" },
      { trainNo: "212", timeFrm: "15:53:12", timeTo: "18:07:12", tripTime: "02:14:00", takeoverLocation: "PYID", handoverLocation: "PYID", breakTime: "00:30:00" },
      { trainNo: "208", timeFrm: "18:37:12", timeTo: "20:47:12", tripTime: "02:10:00", takeoverLocation: "PYID", handoverLocation: "PYID", breakTime: "" }
    ]
  },
  {
    dutyNo: "47",
    sOnTime: "14:15:00",
    signOnLocation: "PYID Dn",
    sOffTime: "21:50:00",
    signOffLocation: "KGWA",
    kms: 180,
    dutyHrs: "07:35:00",
    drivingHrs: "05:52:00",
    breakTime: "01:17:00",
    counselling: "",
    dutyType: "47T3",
    isNightShift: false,
    trips: [
      { trainNo: "221", timeFrm: "14:33:00", timeTo: "16:17:12", tripTime: "01:44:12", takeoverLocation: "PYID Dn", handoverLocation: "PYID", breakTime: "00:47:00" },
      { trainNo: "211", timeFrm: "17:04:12", timeTo: "19:17:12", tripTime: "02:13:00", takeoverLocation: "PYID", handoverLocation: "PYID", breakTime: "00:30:00" },
      { trainNo: "220", timeFrm: "19:47:12", timeTo: "21:42:00", tripTime: "01:54:48", takeoverLocation: "PYID", handoverLocation: "KGWA Up", breakTime: "" }
    ]
  },
  {
    dutyNo: "64",
    sOnTime: "21:15:00",
    signOnLocation: "PUTH Dn",
    sOffTime: "06:35:00",
    signOffLocation: "KGWA",
    kms: 127,
    dutyHrs: "09:20:00",
    drivingHrs: "05:08:00",
    breakTime: "03:50:00",
    counselling: "",
    dutyType: "Night Shift",
    isNightShift: true,
    nightKms: 75,
    mornKms: 52,
    trips: [
      { trainNo: "207", timeFrm: "21:32:00", timeTo: "00:15:00", tripTime: "02:43:00", takeoverLocation: "PUTH Dn", handoverLocation: "APTS Dn", breakTime: "03:50:00" },
      { trainNo: "210", timeFrm: "04:05:00", timeTo: "06:30:00", tripTime: "02:25:00", takeoverLocation: "APTS Dn", handoverLocation: "KGWA Dn", breakTime: "" }
    ]
  },
  {
    dutyNo: "65",
    sOnTime: "21:30:00",
    signOnLocation: "PYID Up",
    sOffTime: "06:45:00",
    signOffLocation: "PUTH",
    kms: 120,
    dutyHrs: "09:15:00",
    drivingHrs: "05:13:48",
    breakTime: "03:40:00",
    counselling: "",
    dutyType: "Night Shift",
    isNightShift: true,
    nightKms: 55,
    mornKms: 65,
    pilotInfo: "Pilot",
    trips: [
      { trainNo: "213", timeFrm: "21:46:12", timeTo: "23:55:00", tripTime: "02:08:48", takeoverLocation: "PYID Up", handoverLocation: "NLC Up", breakTime: "03:40:00" },
      { trainNo: "207", timeFrm: "03:35:00", timeTo: "06:40:00", tripTime: "03:05:00", takeoverLocation: "NLC Up", handoverLocation: "PUTH UP", breakTime: "" }
    ]
  },
  {
    dutyNo: "66",
    sOnTime: "21:30:00",
    signOnLocation: "KGWA Up",
    sOffTime: "06:30:00",
    signOffLocation: "PYID",
    kms: 105,
    dutyHrs: "09:00:00",
    drivingHrs: "04:34:00",
    breakTime: "04:05:00",
    counselling: "",
    dutyType: "Night Shift",
    isNightShift: true,
    nightKms: 58,
    mornKms: 47,
    trips: [
      { trainNo: "203", timeFrm: "21:48:00", timeTo: "00:10:00", tripTime: "02:22:00", takeoverLocation: "KGWA Up", handoverLocation: "PUTH Dn", breakTime: "04:05:00" },
      { trainNo: "211", timeFrm: "04:15:00", timeTo: "06:27:00", tripTime: "02:12:00", takeoverLocation: "PUTH Dn", handoverLocation: "PYID Dn", breakTime: "" }
    ]
  },
  {
    dutyNo: "67",
    sOnTime: "21:30:00",
    signOnLocation: "PUTH Up",
    sOffTime: "06:20:00",
    signOffLocation: "KGWA",
    kms: 113,
    dutyHrs: "08:50:00",
    drivingHrs: "04:57:00",
    breakTime: "03:30:00",
    counselling: "",
    dutyType: "Night Shift",
    isNightShift: true,
    nightKms: 62,
    mornKms: 51,
    pilotInfo: "APTS-PUTH Pilot",
    trips: [
      { trainNo: "212", timeFrm: "21:48:00", timeTo: "00:15:00", tripTime: "02:27:00", takeoverLocation: "PUTH Up", handoverLocation: "APTS Up", breakTime: "03:30:00" },
      { trainNo: "209", timeFrm: "03:45:00", timeTo: "06:15:00", tripTime: "02:30:00", takeoverLocation: "APTS Up", handoverLocation: "KGWA DN", breakTime: "" }
    ]
  },
  {
    dutyNo: "77",
    sOnTime: "21:40:00",
    signOnLocation: "KGWA Up",
    sOffTime: "07:05:00",
    signOffLocation: "PYID",
    kms: 15,
    dutyHrs: "09:25:00",
    drivingHrs: "03:04:00",
    breakTime: "06:00:00",
    counselling: "",
    dutyType: "Night Shift (PDC)",
    isNightShift: true,
    nightKms: 15,
    mornKms: 0,
    pilotInfo: "PDC",
    trips: [
      { trainNo: "204", timeFrm: "21:56:00", timeTo: "23:30:00", tripTime: "01:34:00", takeoverLocation: "KGWA Up", handoverLocation: "B DHO", breakTime: "06:00:00" },
      { trainNo: "213; 214; 215", timeFrm: "05:30:00", timeTo: "07:00:00", tripTime: "01:30:00", takeoverLocation: "DEPOT", handoverLocation: "DEPOT", breakTime: "" }
    ]
  }
];
