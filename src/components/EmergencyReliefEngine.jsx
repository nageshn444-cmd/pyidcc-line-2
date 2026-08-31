import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  updateDoc
} from "firebase/firestore";
import {
  Activity,
  AlertTriangle,
  Award,
  Calendar,
  Cpu,
  Download,
  FileSpreadsheet,
  FileText,
  Printer,
  RefreshCw,
  Send,
  ShieldAlert,
  Sparkles,
  User
} from "lucide-react";
import React, { useEffect, useState } from "react";
import * as XLSX from "xlsx";
import { useAuth } from "../context/AuthContext";
import { useOperationalEngine } from "../context/OperationalEngine";
import { db } from "../firebase";
import {
  evaluateCascadingDelayRelief,
  evaluateReliefCandidates,
  extractBmrclTrainId,
  resolveMultiTrainRelief,
  STATION_INDEX
} from "../utils/EmergencyCrewAllocator";

// Available Trigger Events
const EMERGENCY_EVENTS = [
  "Train Failure",
  "Signalling Failure",
  "OCC Train Regulation",
  "Train Delay",
  "Train Swap",
  "Service Disruption",
  "Passenger Incident",
  "Medical Emergency",
  "Staff Shortage",
  "Crew Non-Reporting",
  "Crew Sick Report",
  "Crew Booking Off",
  "Emergency Short Loop Operation",
];

const STATION_DETAILS = [
  { code: "BIET", name: "Madavara" },
  { code: "JIDL", name: "Chikkabidarakallu" },
  { code: "MNJN", name: "Manjunathanagar" },
  { code: "NGSA", name: "Nagasandra" },
  { code: "DSH", name: "Dasarahalli" },
  { code: "JLHL", name: "Jalahalli" },
  { code: "PYID", name: "Peenya Industry" },
  { code: "PEYA", name: "Peenya" },
  { code: "YPI", name: "Goraguntepalya" },
  { code: "YPM", name: "Yeshwanthpur" },
  { code: "SSFY", name: "Sandal Soap Factory" },
  { code: "MHLI", name: "Mahalakshmi" },
  { code: "RJNR", name: "Rajajinagar" },
  { code: "KVPR", name: "Mahakavi Kuvempu Road" },
  { code: "SPRU", name: "Srirampura" },
  { code: "SPGD", name: "Mantri Square Sampige Road" },
  { code: "KGWA", name: "Nadaprabhu Kempegowda station" },
  { code: "CKPE", name: "Chickpete" },
  { code: "KRMT", name: "Krishna Rajendra Market" },
  { code: "NLC", name: "National College" },
  { code: "LBGH", name: "Lalbagh" },
  { code: "SECE", name: "South End Circle" },
  { code: "JYN", name: "Jayanagar" },
  { code: "RVR", name: "Rashtreeya Vidyalaya Road" },
  { code: "BSNK", name: "Banashankari" },
  { code: "JPN", name: "Jaya Prakash Nagar" },
  { code: "PUTH", name: "Yelachenahalli" },
  { code: "APRC", name: "Konanakunte Cross" },
  { code: "KLPK", name: "Doddakallasandra" },
  { code: "VJRH", name: "Vajarahalli" },
  { code: "TGTP", name: "Thalaghattapura" },
  { code: "APTS", name: "Silk Institute" },
];

const STATIONS = Object.keys(STATION_INDEX);

const TRAIN_IDS = Array.from({ length: 23 }, (_, i) => String(201 + i));

const getStationLabel = (code) => {
  const st = STATION_DETAILS.find((s) => s.code === code);
  return st ? `${st.name} (${st.code})` : code;
};

// Official BMRCL Line 2 Peenya Depot Train 201 Roster Operations
export const BMRCL_LINE2_TRAIN_201_ROSTER = [
  {
    trainId: "201",
    dutyId: "03",
    employeeName: "Manoj LG",
    employeeId: "88000087",
    signOnTime: "06:00:00",
  },
  {
    trainId: "201",
    dutyId: "03",
    employeeName: "Nandan Kumar BN",
    employeeId: "88000143",
    signOnTime: "06:15:00",
  },
  {
    trainId: "201",
    dutyId: "04",
    employeeName: "Raveen G",
    employeeId: "21953",
    signOnTime: "06:00:00",
  },
  {
    trainId: "201",
    dutyId: "04",
    employeeName: "Mallikarjun HS",
    employeeId: "88000051",
    signOnTime: "06:40:00",
  },
  {
    trainId: "201",
    dutyId: "05",
    employeeName: "Prajwal N",
    employeeId: "88000100",
    signOnTime: "06:00:00",
  },
  {
    trainId: "201",
    dutyId: "05",
    employeeName: "Mamatha D",
    employeeId: "22463",
    signOnTime: "06:45:00",
  },
  {
    trainId: "201",
    dutyId: "07",
    employeeName: "Sharath S",
    employeeId: "88000125",
    signOnTime: "06:05:00",
  },
  {
    trainId: "201",
    dutyId: "07",
    employeeName: "Mahesh S",
    employeeId: "88000110",
    signOnTime: "07:05:00",
  },
  {
    trainId: "201",
    dutyId: "08",
    employeeName: "Dayanand K",
    employeeId: "21078",
    signOnTime: "06:10:00",
  },
  {
    trainId: "201",
    dutyId: "08",
    employeeName: "Nagendra C S",
    employeeId: "21694",
    signOnTime: "07:10:00",
  },
  {
    trainId: "201",
    dutyId: "09",
    employeeName: "Yogesh GH",
    employeeId: "88000105",
    signOnTime: "06:10:00",
  },
  {
    trainId: "201",
    dutyId: "09",
    employeeName: "Ashwini Bashetti",
    employeeId: "22490",
    signOnTime: "07:10:00",
  },
  {
    trainId: "201",
    dutyId: "10",
    employeeName: "Santhosh Kumar A T",
    employeeId: "21961",
    signOnTime: "06:10:00",
  },
  {
    trainId: "201",
    dutyId: "10",
    employeeName: "Sumanth S",
    employeeId: "88000107",
    signOnTime: "07:20:00",
  },
  {
    trainId: "201",
    dutyId: "11",
    employeeName: "Priyanka K N",
    employeeId: "21714",
    signOnTime: "06:15:00",
  },
  {
    trainId: "201",
    dutyId: "11",
    employeeName: "Nithin Kumar M",
    employeeId: "21945",
    signOnTime: "07:20:00",
  },
  {
    trainId: "201",
    dutyId: "14",
    employeeName: "Shashank S",
    employeeId: "88000136",
    signOnTime: "06:20:00",
  },
  {
    trainId: "201",
    dutyId: "14",
    employeeName: "Harish Murthy",
    employeeId: "22497",
    signOnTime: "07:30:00",
  },
  {
    trainId: "201",
    dutyId: "16",
    employeeName: "Sankara Rao Achut",
    employeeId: "22258",
    signOnTime: "06:25:00",
  },
  {
    trainId: "201",
    dutyId: "16",
    employeeName: "Venkata Kiran Kumar M",
    employeeId: "21968",
    signOnTime: "07:35:00",
  },
  {
    trainId: "201",
    dutyId: "20",
    employeeName: "Chandrashekar G",
    employeeId: "21702",
    signOnTime: "06:35:00",
  },
  {
    trainId: "201",
    dutyId: "20",
    employeeName: "Ashish Kumar",
    employeeId: "21955",
    signOnTime: "08:30:00",
  },
  {
    trainId: "201",
    dutyId: "26",
    employeeName: "Aravinda Vinod Kumar",
    employeeId: "22284",
    signOnTime: "07:20:00",
  },
  {
    trainId: "201",
    dutyId: "26",
    employeeName: "Arun Kumar TR",
    employeeId: "22528",
    signOnTime: "13:30:00",
  },
  {
    trainId: "201",
    dutyId: "27",
    employeeName: "Bhavyashree K S",
    employeeId: "22500",
    signOnTime: "07:30:00",
  },
  {
    trainId: "201",
    dutyId: "27",
    employeeName: "Lokesh A",
    employeeId: "88000137",
    signOnTime: "13:40:00",
  },
  {
    trainId: "201",
    dutyId: "28",
    employeeName: "Dayanand A",
    employeeId: "88000117",
    signOnTime: "07:35:00",
  },
  {
    trainId: "201",
    dutyId: "28",
    employeeName: "Shashank S",
    employeeId: "88000136",
    signOnTime: "13:50:00",
  },
  {
    trainId: "201",
    dutyId: "29",
    employeeName: "Mahesh S",
    employeeId: "88000110",
    signOnTime: "07:45:00",
  },
  {
    trainId: "201",
    dutyId: "29",
    employeeName: "Karthik",
    employeeId: "88000102",
    signOnTime: "13:55:00",
  },
  {
    trainId: "201",
    dutyId: "34",
    employeeName: "Manjunatha K R",
    employeeId: "21436",
    signOnTime: "13:30:00",
  },
  {
    trainId: "201",
    dutyId: "34",
    employeeName: "Abhishek B",
    employeeId: "88000038",
    signOnTime: "14:25:00",
  },
  {
    trainId: "201",
    dutyId: "37",
    employeeName: "Babu Halakarni",
    employeeId: "22261",
    signOnTime: "13:20:00",
  },
  {
    trainId: "201",
    dutyId: "37",
    employeeName: "Sheela S",
    employeeId: "22458",
    signOnTime: "14:35:00",
  },
  {
    trainId: "201",
    dutyId: "40",
    employeeName: "Chikke Gowda N",
    employeeId: "21506",
    signOnTime: "13:45:00",
  },
  {
    trainId: "201",
    dutyId: "40",
    employeeName: "Ravi HR",
    employeeId: "22244",
    signOnTime: "14:55:00",
  },
  {
    trainId: "201",
    dutyId: "42",
    employeeName: "Syama Raju M",
    employeeId: "21970",
    signOnTime: "13:45:00",
  },
  {
    trainId: "201",
    dutyId: "42",
    employeeName: "G Raja",
    employeeId: "22229",
    signOnTime: "15:20:00",
  },
  {
    trainId: "201",
    dutyId: "45",
    employeeName: "Preetham S",
    employeeId: "88000131",
    signOnTime: "14:00:00",
  },
  {
    trainId: "201",
    dutyId: "45",
    employeeName: "Manjunatha KS",
    employeeId: "22239",
    signOnTime: "16:05:00",
  },
  {
    trainId: "201",
    dutyId: "47",
    employeeName: "Karan Velarasan",
    employeeId: "88000048",
    signOnTime: "14:15:00",
  },
  {
    trainId: "201",
    dutyId: "47",
    employeeName: "Harshith D",
    employeeId: "22522",
    signOnTime: "16:25:00",
  },
  {
    trainId: "201",
    dutyId: "50",
    employeeName: "Naveen kumar HS",
    employeeId: "22464",
    signOnTime: "14:35:00",
  },
  {
    trainId: "201",
    dutyId: "50",
    employeeName: "KC Abhilash N",
    employeeId: "22254",
    signOnTime: "21:30:00",
  },
  {
    trainId: "201",
    dutyId: "51",
    employeeName: "Sajeet Kumar Rai",
    employeeId: "22561",
    signOnTime: "14:40:00",
  },
  {
    trainId: "201",
    dutyId: "51",
    employeeName: "Nagalinge Gowda M",
    employeeId: "22116",
    signOnTime: "21:30:00",
  },
  {
    trainId: "201",
    dutyId: "55",
    employeeName: "K Shailaja Bashetty",
    employeeId: "21490",
    signOnTime: "15:15:00",
  },
  {
    trainId: "201",
    dutyId: "55",
    employeeName: "Mahantesh MD",
    employeeId: "22494",
    signOnTime: "21:15:00",
  },
  {
    trainId: "201",
    dutyId: "57",
    employeeName: "Satya Prakash",
    employeeId: "22260",
    signOnTime: "15:35:00",
  },
  {
    trainId: "201",
    dutyId: "57",
    employeeName: "Dayanand A",
    employeeId: "88000117",
    signOnTime: "21:20:00",
  },
  {
    trainId: "201",
    dutyId: "60",
    employeeName: "KC Abhilash N",
    employeeId: "22254",
    signOnTime: "15:55:00",
  },
  {
    trainId: "201",
    dutyId: "60",
    employeeName: "Sharanabasappa",
    employeeId: "22016",
    signOnTime: "21:25:00",
  },
  {
    trainId: "201",
    dutyId: "66",
    employeeName: "Lokesh A",
    employeeId: "88000137",
    signOnTime: "21:30:00",
  },
  {
    trainId: "201",
    dutyId: "66",
    employeeName: "Harish PK",
    employeeId: "22322",
    signOnTime: "22:00:00",
  },
  {
    trainId: "201",
    dutyId: "69",
    employeeName: "G Raja",
    employeeId: "22229",
    signOnTime: "21:05:00",
  },
  {
    trainId: "201",
    dutyId: "70",
    employeeName: "Sowmya N",
    employeeId: "21708",
    signOnTime: "21:15:00",
  },
  {
    trainId: "201",
    dutyId: "73",
    employeeName: "Harish PK",
    employeeId: "22322",
    signOnTime: "21:25:00",
  },
];

export default function EmergencyReliefEngine() {
  const { userProfile } = useAuth();
  const opEngine = useOperationalEngine();
  const isTrainOperator =
    userProfile?.role === "TRAIN_OPERATOR" ||
    userProfile?.role === "STATION_CONTROLLER" ||
    userProfile?.role === "VIEWER" ||
    String(userProfile?.role || "")
      .toLowerCase()
      .includes("operator") ||
    String(userProfile?.role || "")
      .toLowerCase()
      .includes("controller") ||
    String(userProfile?.designation || "")
      .toLowerCase()
      .includes("operator") ||
    String(userProfile?.designation || "")
      .toLowerCase()
      .includes("controller") ||
    String(userProfile?.designation || "")
      .toLowerCase()
      .includes("viewer");

  // Tab control inside relief module
  const [reliefTab, setReliefTab] = useState("DASHBOARD"); // DASHBOARD, BATCH_SWAP, REPORTS

  // Real-time Firestore States
  const [reports, setReports] = useState([]);
  const [deployments, setDeployments] = useState([]);
  const [consoleData, setConsoleData] = useState(() => {
    try {
      const cached = localStorage.getItem("pyidcc_roster_desk_console_cache");
      if (cached) return JSON.parse(cached);
    } catch (e) {}
    return {};
  });

  // Input Form States
  const [selectedTrainId, setSelectedTrainId] = useState("");
  const [selectedIncidentType, setSelectedIncidentType] =
    useState("Train Failure");
  const [selectedLocation, setSelectedLocation] = useState("PYID");
  const [recoveryTime, setRecoveryTime] = useState("");

  // Report Filtering State
  const [reportStartDate, setReportStartDate] = useState("");
  const [reportEndDate, setReportEndDate] = useState("");

  // Decision Results State
  const [evaluationResults, setEvaluationResults] = useState(null);
  const [cascadingDelayResults, setCascadingDelayResults] = useState(null);
  const [delayMinutesInput, setDelayMinutesInput] = useState("15");
  const [originalOperator, setOriginalOperator] = useState(null);
  const [activeIncidentText, setActiveIncidentText] = useState("");

  // Batch / Train-Swap Multi-Incident Resolution State (global optimizer)
  const [batchSelectedTrainIds, setBatchSelectedTrainIds] = useState([]);
  const [batchIncidentType, setBatchIncidentType] = useState("Train Swap");
  const [batchResolution, setBatchResolution] = useState(null);
  const [finalLinks, setFinalLinks] = useState([]);
  const [dailyTracks, setDailyTracks] = useState([]);

  // 1. Setup onSnapshot listeners for real-time synchronization
  useEffect(() => {
    // Sync deployments (rereads daily deployment details)
    const unsubDeployments = onSnapshot(
      collection(db, "crew_daily_deployment"),
      (snapshot) => {
        setDeployments(
          snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
        );
      },
    );

    // Sync BMRCL Line 2 Peenya Depot Roster Desk Console (current & latest)
    const unsubDeskCurrent = onSnapshot(
      doc(db, "roster_desk_console", "current"),
      (docSnap) => {
        if (docSnap.exists()) {
          const d = docSnap.data();
          setConsoleData((prev) => ({ ...prev, ...d }));
        }
      },
    );
    const unsubDeskLatest = onSnapshot(
      doc(db, "roster_desk_console", "latest"),
      (docSnap) => {
        if (docSnap.exists()) {
          const d = docSnap.data();
          setConsoleData((prev) => ({ ...prev, ...d }));
        }
      },
    );

    // Sync relief reports
    const unsubReports = onSnapshot(
      collection(db, "emergency_relief_reports"),
      (snapshot) => {
        const sortedReports = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        sortedReports.sort((a, b) => {
          const tA = a.timestamp?.seconds || 0;
          const tB = b.timestamp?.seconds || 0;
          return tB - tA; // most recent first
        });
        setReports(sortedReports);
      },
    );

    // Sync crew final links (for duty to train 201-223 resolution)
    const unsubLinks = onSnapshot(
      collection(db, "crew_final_links"),
      (snapshot) => {
        setFinalLinks(
          snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
        );
      },
    );

    // Sync daily crew tracks (trains 201-223 active operator assignments)
    const unsubTracks = onSnapshot(
      collection(db, "daily_crew_tracks"),
      (snapshot) => {
        setDailyTracks(
          snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
        );
      },
    );

    return () => {
      unsubDeployments();
      unsubDeskCurrent();
      unsubDeskLatest();
      unsubReports();
      unsubLinks();
      unsubTracks();
    };
  }, []);

  const [selectedTrainKey, setSelectedTrainKey] = useState("");
  const [batchTrainFilter, setBatchTrainFilter] = useState("ALL");

  // 2. Identify all active Train assignments (strictly 201-223) preserving all duties across shifts
  const activeTrains = React.useMemo(() => {
    const list = [];
    const seenKeys = new Set();

    const addAssignment = (
      tid,
      empId,
      empName,
      dutyId,
      signOnTime,
      rawLegs,
      source = "deploy",
    ) => {
      if (!tid || !TRAIN_IDS.includes(tid)) return;
      const cleanEmpId = String(empId || "").trim();
      if (!cleanEmpId || cleanEmpId === "--" || cleanEmpId === "-") return;
      const cleanDutyId = String(dutyId || "--").trim();

      const key = `${tid}_${cleanDutyId}_${cleanEmpId}`;
      if (seenKeys.has(key)) return;
      seenKeys.add(key);

      list.push({
        key,
        trainId: tid,
        dutyId: cleanDutyId,
        employeeId: cleanEmpId,
        employeeName: String(empName || "Active TO").trim(),
        signOnTime: signOnTime || "06:00:00",
        rawLegs: rawLegs || null,
        source,
      });
    };

    // Strategy 1: Direct matches from deployments (trainId, rawLegs, legXTrainNo matching 201-223)
    deployments.forEach((d) => {
      if (!d.empId || d.empId === "--" || d.empId === "-") return;
      const candidates = [
        d.trainId,
        d.trainNo,
        d.rakeId,
        d.rawLegs?.l1Train,
        d.rawLegs?.l2Train,
        d.rawLegs?.l3Train,
        d.rawLegs?.l4Train,
        d.leg1TrainNo,
        d.leg2TrainNo,
        d.leg3TrainNo,
        d.leg4TrainNo,
      ];
      candidates.forEach((c) => {
        const tid = extractBmrclTrainId(c);
        if (tid) {
          addAssignment(
            tid,
            d.empId,
            d.empName,
            d.dutyId,
            d.signOnTime,
            d.rawLegs,
            "deploy",
          );
        }
      });
    });

    // Strategy 2: daily_crew_tracks
    dailyTracks.forEach((track) => {
      const tid = extractBmrclTrainId(track.trainId);
      if (tid && track.currentOperator) {
        const op = track.currentOperator;
        addAssignment(
          tid,
          op.employeeId,
          op.name || op.employeeName,
          op.dutyNumber || op.dutyId,
          op.signOnTime,
          null,
          "daily_track",
        );
      }
    });

    // Strategy 3: Map dutyId via crew_final_links to trainId 201-223
    finalLinks.forEach((link) => {
      const linkTrains = [
        extractBmrclTrainId(link.trainId),
        extractBmrclTrainId(link.leg2TrainNo),
        extractBmrclTrainId(link.leg3TrainNo),
        extractBmrclTrainId(link.leg4TrainNo),
      ].filter(Boolean);

      linkTrains.forEach((tid) => {
        const matchingDeps = deployments.filter(
          (d) =>
            String(d.dutyId).trim() === String(link.dutyId).trim() &&
            d.empId &&
            d.empId !== "--",
        );
        matchingDeps.forEach((matchingDep) => {
          addAssignment(
            tid,
            matchingDep.empId,
            matchingDep.empName,
            matchingDep.dutyId,
            matchingDep.signOnTime || link.signOnTime,
            matchingDep.rawLegs,
            "links",
          );
        });
      });
    });

    // Strategy 4: Official BMRCL Line 2 Peenya Depot Train 201 Real Roster Duties
    BMRCL_LINE2_TRAIN_201_ROSTER.forEach((r) => {
      addAssignment(
        r.trainId,
        r.employeeId,
        r.employeeName,
        r.dutyId,
        r.signOnTime,
        null,
        "bmrcl_roster_201",
      );
    });

    // Strategy 5: Co-operators & Train assignments from Roster Desk Console
    (consoleData?.coOperators || []).forEach((co) => {
      const tid = extractBmrclTrainId(co.trainId);
      if (tid) {
        addAssignment(
          tid,
          co.empNo,
          co.name,
          co.dutyId,
          co.signOn || co.time?.split("-")[0]?.trim(),
          null,
          "console_co_op",
        );
      }
    });

    return list.sort((a, b) => {
      const cmp = a.trainId.localeCompare(b.trainId, undefined, {
        numeric: true,
      });
      if (cmp !== 0) return cmp;
      return a.dutyId.localeCompare(b.dutyId, undefined, { numeric: true });
    });
  }, [deployments, dailyTracks, finalLinks, consoleData]);

  // When selected Train ID or assignment key changes, find the currently running operator
  useEffect(() => {
    if (!selectedTrainId && !selectedTrainKey) {
      setOriginalOperator(null);
      setEvaluationResults(null);
      setCascadingDelayResults(null);
      return;
    }
    const matched =
      activeTrains.find((t) => t.key === selectedTrainKey) ||
      activeTrains.find((t) => t.key === selectedTrainId) ||
      activeTrains.find((t) => t.trainId === selectedTrainId);
    if (matched) {
      setOriginalOperator({
        employeeId: matched.employeeId,
        employeeName: matched.employeeName,
        dutyId: matched.dutyId,
        signOnTime: matched.signOnTime,
        rawLegs: matched.rawLegs,
      });
    } else {
      setOriginalOperator(null);
    }
  }, [selectedTrainId, selectedTrainKey, activeTrains]);

  // 3. Trigger Recommendation evaluation
  const handleGenerateRecommendation = (e) => {
    e.preventDefault();
    if (!selectedTrainId) {
      alert("Please select a Train ID needing relief.");
      return;
    }

    // Get current local time
    const now = new Date();
    const currentTimeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;

    const todayDateStr = now.toISOString().split("T")[0];

    const results = evaluateReliefCandidates({
      currentTimeStr,
      incidentType: selectedIncidentType,
      incidentLocation: selectedLocation,
      targetTrainId: selectedTrainId,
      currentOperator: originalOperator,
      deployments,
      consoleData,
      reliefReports: reports,
      crewRegistry: opEngine?.crewRegistry || [],
      leaveRequests: opEngine?.leaveRequests || [],
      todayDateStr,
    });

    const cascadeResults = evaluateCascadingDelayRelief({
      currentTimeStr,
      primaryTrainId: selectedTrainId,
      delayMinutes: parseInt(delayMinutesInput, 10) || 15,
      incidentLocation: selectedLocation,
      deployments,
      consoleData,
      reliefReports: reports,
      crewRegistry: opEngine?.crewRegistry || [],
      leaveRequests: opEngine?.leaveRequests || [],
      todayDateStr,
    });

    setEvaluationResults(results);
    setCascadingDelayResults(cascadeResults);
    setActiveIncidentText(
      `${selectedIncidentType} on Train ${selectedTrainId} at ${selectedLocation}`,
    );
  };

  // 4. Execute Relief Assignment
  const handleExecuteRelief = async (plan) => {
    if (!plan || !plan.available) return;
    const reliefOp = plan.operator;

    const confirmMsg = originalOperator
      ? `Confirm dispatcher dispatch commands: Reassign Train ID ${selectedTrainId} from ${originalOperator.employeeName} to relief operator ${reliefOp.employeeName}?`
      : `Confirm dispatcher dispatch commands: Assign relief operator ${reliefOp.employeeName} to Train ID ${selectedTrainId}?`;

    if (!window.confirm(confirmMsg)) {
      return;
    }

    try {
      const now = new Date();
      const timeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;
      const todayStr = now.toISOString().split("T")[0];

      // A. Update Daily Roster / Deployment for this original duty
      if (originalOperator) {
        const matchingDep = deployments.find(
          (d) => String(d.dutyId) === String(originalOperator.dutyId),
        );
        if (matchingDep) {
          await updateDoc(doc(db, "crew_daily_deployment", matchingDep.id), {
            empId: reliefOp.employeeId,
            empName: reliefOp.employeeName,
            remarks: `RELIEVED due to ${selectedIncidentType} by TO ${reliefOp.employeeName} (${reliefOp.employeeId})`,
          });
        }
      }

      // B. Save the relief operation details to Reports collection
      await addDoc(collection(db, "emergency_relief_reports"), {
        incidentTime: timeStr,
        incidentType: selectedIncidentType,
        originalOperator: originalOperator
          ? {
              employeeId: originalOperator.employeeId,
              employeeName: originalOperator.employeeName,
              dutyId: originalOperator.dutyId,
              signOnTime: originalOperator.signOnTime,
            }
          : {
              employeeId: "--",
              employeeName: "UNSCHEDULED",
              dutyId: "--",
              signOnTime: "--",
            },
        reliefOperator: {
          employeeId: reliefOp.employeeId,
          employeeName: reliefOp.employeeName,
          currentDuty: reliefOp.currentDuty,
          currentLocation: reliefOp.currentLocation,
        },
        reliefReason: activeIncidentText,
        dutyHours: reliefOp.dutyHours || "0h 0m",
        breakTime: reliefOp.breakTime || "Completed",
        recommendationScore: plan.score,
        recoveryTime: `${plan.recoveryTimeMinutes} mins`,
        timestamp: serverTimestamp(),
      });

      alert(`✅ Relief plan executed successfully! Dispatch system updated.`);
      setSelectedTrainId("");
      setEvaluationResults(null);
      setCascadingDelayResults(null);
    } catch (err) {
      console.error(err);
      alert("Error executing relief plan: " + err.message);
    }
  };

  const handleExecuteCascadeRelief = async (cascadeItem) => {
    if (isTrainOperator) return;
    if (
      !cascadeItem ||
      !cascadeItem.suggestedReliever ||
      cascadeItem.suggestedReliever.employeeId === "--"
    ) {
      alert("No relief operator assigned to this train.");
      return;
    }
    try {
      const now = new Date();
      const timeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;
      const reliefOp = cascadeItem.suggestedReliever;

      await addDoc(collection(db, "emergency_relief_reports"), {
        incidentTime: timeStr,
        incidentType: cascadeItem.isPrimary
          ? selectedIncidentType
          : `Cascading Delay (Train ${cascadeItem.trainId})`,
        originalOperator: {
          employeeId: cascadeItem.currentOperatorId,
          employeeName: cascadeItem.currentOperatorName,
          dutyId: cascadeItem.dutyId,
          signOnTime: "--",
        },
        reliefOperator: {
          employeeId: reliefOp.employeeId,
          employeeName: reliefOp.employeeName,
          currentDuty: reliefOp.dutyId,
          currentLocation: reliefOp.location,
        },
        reliefReason: `Cascading delay relief for Train ${cascadeItem.trainId} (+${cascadeItem.delayMinutes} mins delay)`,
        dutyHours: "0h 0m",
        breakTime: "Completed",
        recommendationScore: reliefOp.score,
        recoveryTime: `${reliefOp.travelTimeMinutes + 3} mins`,
        timestamp: serverTimestamp(),
      });

      alert(
        `✅ Reliever ${reliefOp.employeeName} (${reliefOp.employeeId}) dispatched for Train ${cascadeItem.trainId}!`,
      );
    } catch (err) {
      console.error(err);
      alert("Failed to execute cascade relief dispatch: " + err.message);
    }
  };

  // 8b. Toggle a train in/out of the batch swap / multi-incident selection
  const toggleBatchTrain = (trainId) => {
    setBatchSelectedTrainIds((prev) =>
      prev.includes(trainId)
        ? prev.filter((t) => t !== trainId)
        : [...prev, trainId],
    );
  };

  // 8c. Run the global optimizer across every selected train simultaneously (Hungarian
  // optimal assignment + hand-off dependency / cycle detection + critical-path ETA).
  const handleRunBatchResolution = () => {
    if (batchSelectedTrainIds.length < 2) {
      alert(
        "Select at least 2 trains affected by the swap / multi-incident event.",
      );
      return;
    }
    const now = new Date();
    const currentTimeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;

    const incidents = batchSelectedTrainIds.map((item, idx) => {
      const active =
        activeTrains.find((t) => t.key === item) ||
        activeTrains.find((t) => t.trainId === item);
      const trainId = active ? active.trainId : String(item).split("_")[0];
      return {
        incidentId: `inc_${trainId}_${idx}`,
        trainId: String(trainId),
        dutyId: active ? active.dutyId : "--",
        incidentType: batchIncidentType,
        location: selectedLocation || "PYID",
        currentOperator: active
          ? {
              employeeId: active.employeeId,
              employeeName: active.employeeName,
              dutyId: active.dutyId,
              rawLegs: active.rawLegs,
            }
          : null,
      };
    });

    const batchTodayDateStr = new Date().toISOString().split("T")[0];
    const result = resolveMultiTrainRelief({
      currentTimeStr,
      incidents,
      deployments,
      consoleData,
      reliefReports: reports,
      crewRegistry: opEngine?.crewRegistry || [],
      leaveRequests: opEngine?.leaveRequests || [],
      todayDateStr: batchTodayDateStr,
    });

    setBatchResolution(result);
  };

  // 8d. Execute every resolved assignment in the batch plan, in dependency order.
  const handleExecuteBatchPlan = async () => {
    if (!batchResolution) return;
    const resolvedSteps = batchResolution.executionPlan.filter(
      (step) => step.reliever,
    );
    if (resolvedSteps.length === 0) {
      alert("No resolved assignments to execute.");
      return;
    }
    if (
      !window.confirm(
        `Execute ${resolvedSteps.length} relief assignment(s) from this batch plan in dependency order?`,
      )
    ) {
      return;
    }
    try {
      const now = new Date();
      const timeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;

      for (const step of resolvedSteps) {
        const reliefOp = step.reliever;
        const matchingDep = deployments.find(
          (d) => String(d.dutyId) === String(step.dutyId),
        );
        if (matchingDep) {
          await updateDoc(doc(db, "crew_daily_deployment", matchingDep.id), {
            empId: reliefOp.employeeId,
            empName: reliefOp.employeeName,
            remarks: `RELIEVED (${batchIncidentType}) by TO ${reliefOp.employeeName} (${reliefOp.employeeId}) — batch plan step ${step.sequence}`,
          });
        }

        await addDoc(collection(db, "emergency_relief_reports"), {
          incidentTime: timeStr,
          incidentType: `${batchIncidentType} (Batch Resolution, Train ${step.trainId})`,
          originalOperator: {
            employeeId: step.currentOperatorId,
            employeeName: step.currentOperatorName,
            dutyId: step.dutyId || "--",
            signOnTime: "--",
          },
          reliefOperator: {
            employeeId: reliefOp.employeeId,
            employeeName: reliefOp.employeeName,
            currentDuty: reliefOp.pool,
            currentLocation: reliefOp.location,
          },
          reliefReason: `Global optimal batch resolution for a ${batchResolution.executionPlan.length}-train event, sequence #${step.sequence}${step.dependsOn?.length ? `, waits on Train ${step.dependsOn.join(", ")}` : ""}`,
          dutyHours: "0h 0m",
          breakTime: "Completed",
          recommendationScore: reliefOp.score,
          recoveryTime: `${step.earliestFinish} mins`,
          timestamp: serverTimestamp(),
        });
      }

      alert(
        `✅ Batch resolution executed: ${resolvedSteps.length} assignment(s) dispatched.`,
      );
      setBatchSelectedTrainIds([]);
      setBatchResolution(null);
    } catch (err) {
      console.error(err);
      alert("Failed to execute batch plan: " + err.message);
    }
  };

  // 9. Report Export Logic (Excel & CSV)
  const filteredReports = React.useMemo(() => {
    if (!reportStartDate || !reportEndDate) return reports;
    const startD = new Date(`${reportStartDate}T00:00:00`).getTime();
    const endD = new Date(`${reportEndDate}T23:59:59`).getTime();

    return reports.filter((item) => {
      const ts = item.timestamp;
      if (!ts) return true;
      const itemTime = ts.toDate
        ? ts.toDate().getTime()
        : new Date(ts).getTime();
      return itemTime >= startD && itemTime <= endD;
    });
  }, [reports, reportStartDate, reportEndDate]);

  const handleExportCSV = () => {
    if (isTrainOperator) return;
    if (filteredReports.length === 0) {
      alert("No data available to export.");
      return;
    }
    const headers = [
      "Incident Time",
      "Incident Type",
      "Original Operator",
      "Relief Operator",
      "Relief Reason",
      "Duty Hours",
      "Break Time",
      "Score",
      "Recovery Time",
    ];
    let csvRows = [headers.join(",")];

    filteredReports.forEach((item) => {
      const row = [
        `"${item.incidentTime || ""}"`,
        `"${item.incidentType || ""}"`,
        `"${item.originalOperator?.employeeName} (${item.originalOperator?.employeeId})"`,
        `"${item.reliefOperator?.employeeName} (${item.reliefOperator?.employeeId})"`,
        `"${item.reliefReason || ""}"`,
        `"${item.dutyHours || ""}"`,
        `"${item.breakTime || ""}"`,
        `"${item.recommendationScore || 0}"`,
        `"${item.recoveryTime || ""}"`,
      ];
      csvRows.push(row.join(","));
    });

    const blob = new Blob([csvRows.join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const link = document.createElement("a");
    link.setAttribute("href", URL.createObjectURL(blob));
    link.setAttribute(
      "download",
      `BMRCL_Emergency_Relief_Report_${new Date().toISOString().split("T")[0]}.csv`,
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportExcel = () => {
    if (isTrainOperator) return;
    if (filteredReports.length === 0) {
      alert("No data available to export.");
      return;
    }
    const formattedData = filteredReports.map((item) => ({
      "Incident Time": item.incidentTime,
      "Incident Type": item.incidentType,
      "Original Operator": `${item.originalOperator?.employeeName} (${item.originalOperator?.employeeId})`,
      "Original Duty ID": item.originalOperator?.dutyId,
      "Relief Operator": `${item.reliefOperator?.employeeName} (${item.reliefOperator?.employeeId})`,
      "Relief Original Location": getStationLabel(
        item.reliefOperator?.currentLocation,
      ),
      "Relief Reason": item.reliefReason,
      "Duty Hours worked": item.dutyHours,
      "Break Rest Time": item.breakTime,
      "Recommendation Score": item.recommendationScore,
      "Recovery Time Estimate": item.recoveryTime,
    }));

    const ws = XLSX.utils.json_to_sheet(formattedData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Emergency Relief");
    XLSX.writeFile(
      wb,
      `BMRCL_Emergency_Relief_Report_${new Date().toISOString().split("T")[0]}.xlsx`,
    );
  };

  const handlePrintReport = () => {
    if (isTrainOperator) return;
    window.print();
  };

  return (
    <div className="space-y-6 font-mono text-slate-200">
      {/* Tab Navigation header */}
      <div className="flex flex-wrap justify-between items-center gap-4 bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 bg-rose-500/15 border border-rose-500/30 rounded-xl flex items-center justify-center text-rose-400 shadow-inner shadow-rose-500/10">
            <ShieldAlert size={22} className="animate-pulse" />
          </div>
          <div>
            <h2 className="text-sm font-black tracking-wider text-slate-100 uppercase">
              Emergency Relief & Decision Engine
            </h2>
            <p className="text-[10px] text-slate-500 uppercase tracking-widest mt-0.5">
              Automated optimization & AI-assisted crew dispatching
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          {["DASHBOARD", "BATCH_SWAP", "REPORTS"].map((tab) => (
            <button
              key={tab}
              onClick={() => setReliefTab(tab)}
              className={`px-3 py-1.5 rounded-lg border text-xs font-black transition-all ${
                reliefTab === tab
                  ? "bg-rose-500/10 text-rose-400 border-rose-500/30"
                  : "bg-slate-950/40 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700"
              }`}
            >
              {tab.replace("_", " ")}
            </button>
          ))}
        </div>
      </div>

      {/* RENDER ACTIVE TAB */}
      {reliefTab === "DASHBOARD" && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* LEFT: Incident Trigger Input Panel */}
          <div className="xl:col-span-1 bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl space-y-6">
            <div className="border-b border-slate-800 pb-3">
              <span className="font-bold text-xs uppercase text-rose-400 tracking-wider flex items-center gap-1.5">
                <AlertTriangle size={15} /> Trigger Crew Relief incident
              </span>
            </div>
            <form
              onSubmit={handleGenerateRecommendation}
              className="space-y-4 text-xs font-bold uppercase"
            >
              <div className="space-y-2">
                <label
                  className="text-[10px] text-slate-500 tracking-wider"
                  htmlFor="emergencyreliefengin-l1"
                >
                  Select Incident Event
                </label>
                <select
                  id="emergencyreliefengin-i1"
                  name="emergencyreliefengin-i1"
                  value={selectedIncidentType}
                  onChange={(e) => setSelectedIncidentType(e.target.value)}
                  disabled={isTrainOperator}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {EMERGENCY_EVENTS.map((ev) => (
                    <option key={ev} value={ev}>
                      {ev}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label
                  className="text-[10px] text-slate-500 tracking-wider"
                  htmlFor="emergencyreliefengin-l2"
                >
                  Select Target Train & Duty
                </label>
                <select
                  id="emergencyreliefengin-i2"
                  name="emergencyreliefengin-i2"
                  value={selectedTrainKey || selectedTrainId}
                  onChange={(e) => {
                    const val = e.target.value;
                    setSelectedTrainKey(val);
                    const matched =
                      activeTrains.find((t) => t.key === val) ||
                      activeTrains.find((t) => t.trainId === val);
                    if (matched) {
                      setSelectedTrainId(matched.trainId);
                    } else {
                      setSelectedTrainId(val);
                    }
                  }}
                  disabled={isTrainOperator}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <option value="">-- SELECT TARGET TRAIN & DUTY --</option>
                  {TRAIN_IDS.map((tid) => {
                    const duties = activeTrains.filter(
                      (t) => t.trainId === tid,
                    );
                    if (duties.length === 0) {
                      return (
                        <option key={tid} value={tid}>
                          Train {tid} (No Active TO Scheduled)
                        </option>
                      );
                    }
                    return (
                      <optgroup
                        key={tid}
                        label={`Train ${tid} (${duties.length} shift duties)`}
                      >
                        {duties.map((d) => (
                          <option key={d.key} value={d.key}>
                            Train {tid} — Duty {d.dutyId} ({d.employeeName})
                          </option>
                        ))}
                      </optgroup>
                    );
                  })}
                </select>
              </div>

              <div className="space-y-2">
                <label
                  className="text-[10px] text-slate-500 tracking-wider"
                  htmlFor="emergencyreliefengin-l3"
                >
                  Incident Station / Location
                </label>
                <select
                  id="emergencyreliefengin-i3"
                  name="emergencyreliefengin-i3"
                  value={selectedLocation}
                  onChange={(e) => setSelectedLocation(e.target.value)}
                  disabled={isTrainOperator}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {STATION_DETAILS.map((st) => (
                    <option key={st.code} value={st.code}>
                      {st.name} ({st.code})
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] text-slate-500 tracking-wider">
                  Technical Delay Duration (Minutes)
                </label>
                <input
                  type="number"
                  min="5"
                  max="120"
                  value={delayMinutesInput}
                  onChange={(e) => setDelayMinutesInput(e.target.value)}
                  disabled={isTrainOperator}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-amber-400 font-bold focus:outline-none disabled:opacity-50"
                  placeholder="e.g. 15"
                />
              </div>

              {originalOperator ? (
                <div className="p-3 bg-slate-950/60 border border-slate-850 rounded-lg space-y-1.5 text-[11px] font-medium lowercase">
                  <div className="text-[9px] uppercase tracking-wider text-slate-500 font-bold">
                    Active Operator Info
                  </div>
                  <div>
                    Name:{" "}
                    <span className="text-slate-200 font-bold uppercase">
                      {originalOperator.employeeName}
                    </span>
                  </div>
                  <div>
                    ID:{" "}
                    <span className="text-slate-200 font-bold uppercase">
                      {originalOperator.employeeId}
                    </span>
                  </div>
                  <div>
                    Duty ID:{" "}
                    <span className="text-rose-400 font-bold uppercase">
                      {originalOperator.dutyId}
                    </span>
                  </div>
                  <div>
                    Sign On:{" "}
                    <span className="text-slate-200">
                      {originalOperator.signOnTime}
                    </span>
                  </div>
                </div>
              ) : selectedTrainId ? (
                <div className="p-3 bg-slate-950/60 border border-rose-500/20 rounded-lg space-y-1.5 text-[11px] font-medium text-amber-400">
                  <div className="text-[9px] uppercase tracking-wider text-amber-500 font-bold">
                    Train Status
                  </div>
                  <div>
                    No operator is currently scheduled for Train{" "}
                    {selectedTrainId}. Relief recommendations will find standby
                    operators for dispatch.
                  </div>
                </div>
              ) : null}

              <button
                type="submit"
                disabled={!selectedTrainId || isTrainOperator}
                className="w-full bg-rose-600 hover:bg-rose-500 disabled:opacity-30 disabled:cursor-not-allowed text-slate-950 font-black py-3.5 rounded-lg tracking-widest uppercase transition-all shadow-lg shadow-rose-600/10 flex items-center justify-center gap-2"
              >
                <Sparkles size={16} />{" "}
                {isTrainOperator
                  ? "VIEW-ONLY CONSOLE"
                  : "Generate Relief Recommendation"}
              </button>
            </form>
          </div>

          {/* RIGHT: Decision recommendation details (2 Columns) */}
          <div className="xl:col-span-2 space-y-6">
            {evaluationResults ? (
              <>
                {/* CASCADING DELAY RELIEVER OPTIMIZATION MATRIX CARD */}
                {cascadingDelayResults &&
                  cascadingDelayResults.cascadePlans?.length > 0 && (
                    <div className="bg-slate-900 border border-amber-500/50 rounded-xl p-5 shadow-2xl space-y-4 font-mono">
                      <div className="flex flex-wrap items-center justify-between border-b border-slate-800 pb-3 gap-2">
                        <div className="flex items-center gap-2">
                          <Cpu className="h-5 w-5 text-amber-400" />
                          <div>
                            <h3 className="text-amber-400 font-bold text-sm tracking-wider uppercase">
                              Cascading Delay & Multi-Train Relief Optimization
                            </h3>
                            <p className="text-[10px] text-slate-400">
                              Primary Delay: Train{" "}
                              {cascadingDelayResults.primaryTrainId} (
                              {cascadingDelayResults.primaryDelayMinutes} mins
                              delay) →{" "}
                              {cascadingDelayResults.totalImpactedTrains}{" "}
                              Downstream Trains Impacted
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="bg-emerald-955 text-emerald-300 border border-emerald-800 text-[10px] px-2.5 py-1 rounded font-bold">
                            Estimated Service Normalization:{" "}
                            {cascadingDelayResults.normalizationTimeStr} (
                            {
                              cascadingDelayResults.estimatedNormalizationMinutes
                            }{" "}
                            mins)
                          </span>
                        </div>
                      </div>

                      {/* AI Advice Callout */}
                      <div className="bg-amber-955/30 border border-amber-800/60 p-3 rounded-lg flex items-start gap-2.5">
                        <Sparkles className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                        <div className="text-xs text-amber-200">
                          <strong>AI Optimization Advice:</strong> System
                          evaluated roster standby pools (
                          <strong className="text-cyan-300">
                            Standby / OR
                          </strong>
                          , <strong className="text-purple-300">STBK</strong>,{" "}
                          <strong className="text-amber-300">PRO</strong>,{" "}
                          <strong className="text-emerald-300">TGTP</strong>,{" "}
                          <strong className="text-indigo-300">RD3</strong>).
                          Relievers have been allocated for Train{" "}
                          {cascadingDelayResults.primaryTrainId} and all
                          following delayed trains until service normalizes.
                        </div>
                      </div>

                      {/* Cascade Plans Table */}
                      <div className="overflow-x-auto custom-scrollbar border border-slate-800 rounded-lg">
                        <table className="w-full text-left text-xs whitespace-nowrap">
                          <thead className="bg-slate-955 text-slate-400 uppercase text-[10px] border-b border-slate-800">
                            <tr>
                              <th className="p-3">Seq / Train ID</th>
                              <th className="p-3">Current Operator</th>
                              <th className="p-3 text-rose-400">Delay</th>
                              <th className="p-3">Scheduled ➔ Takeover</th>
                              <th className="p-3 text-cyan-400">
                                Suggested Reliever
                              </th>
                              <th className="p-3">Relief Pool</th>
                              <th className="p-3">Location & Travel</th>
                              <th className="p-3 text-right">Action</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-850 bg-slate-900/60">
                            {cascadingDelayResults.cascadePlans.map(
                              (plan, idx) => (
                                <tr
                                  key={idx}
                                  className="hover:bg-slate-850/50 transition"
                                >
                                  <td className="p-3 font-bold text-white">
                                    <span className="text-slate-500 text-[10px] mr-1 font-mono">
                                      #{plan.sequence}
                                    </span>
                                    Train {plan.trainId}
                                    {plan.isPrimary && (
                                      <span className="ml-2 bg-rose-955 text-rose-300 border border-rose-800 text-[9px] px-1.5 py-0.5 rounded font-black">
                                        PRIMARY DELAY
                                      </span>
                                    )}
                                  </td>
                                  <td className="p-3 text-slate-300">
                                    {plan.currentOperatorName}{" "}
                                    <span className="text-[10px] text-slate-500">
                                      ({plan.currentOperatorId})
                                    </span>
                                  </td>
                                  <td className="p-3 font-bold text-rose-400">
                                    +{plan.delayMinutes} mins
                                  </td>
                                  <td className="p-3 text-slate-400 font-mono text-[11px]">
                                    {plan.scheduledTime} ➔{" "}
                                    <strong className="text-amber-300">
                                      {plan.projectedTakeoverTime}
                                    </strong>
                                  </td>
                                  <td className="p-3 font-bold text-cyan-300">
                                    {plan.suggestedReliever.employeeName}
                                    {plan.suggestedReliever.employeeId !==
                                      "--" && (
                                      <span className="text-[10px] text-slate-400 block font-normal">
                                        #{plan.suggestedReliever.employeeId}
                                      </span>
                                    )}
                                  </td>
                                  <td className="p-3">
                                    <span
                                      className={`text-[9px] px-2 py-0.5 rounded font-black uppercase ${
                                        plan.suggestedReliever.pool ===
                                        "STANDBY"
                                          ? "bg-cyan-955 text-cyan-300 border border-cyan-700"
                                          : plan.suggestedReliever.pool ===
                                              "STBK"
                                            ? "bg-purple-955 text-purple-300 border border-purple-800"
                                            : plan.suggestedReliever.pool ===
                                                "PRO"
                                              ? "bg-amber-955 text-amber-300 border border-amber-800"
                                              : plan.suggestedReliever.pool ===
                                                  "TGTP"
                                                ? "bg-emerald-955 text-emerald-300 border border-emerald-800"
                                                : plan.suggestedReliever
                                                      .pool === "RD3"
                                                  ? "bg-indigo-955 text-indigo-300 border border-indigo-800"
                                                  : "bg-slate-800 text-slate-400 border border-slate-700"
                                      }`}
                                    >
                                      {plan.suggestedReliever.pool === "STANDBY"
                                        ? "STANDBY / OR"
                                        : plan.suggestedReliever.pool === "STBK"
                                          ? "STBK / STEPBACK"
                                          : plan.suggestedReliever.pool ===
                                              "PRO"
                                            ? "PRO STANDBY"
                                            : plan.suggestedReliever.pool ===
                                                "TGTP"
                                              ? "TGTP STANDBY"
                                              : plan.suggestedReliever.pool ===
                                                  "RD3"
                                                ? "RD3 STANDBY"
                                                : "UNASSIGNED"}
                                    </span>
                                  </td>
                                  <td className="p-3 text-slate-400 text-[11px]">
                                    {plan.location} (
                                    {plan.suggestedReliever.travelTimeMinutes}{" "}
                                    min travel)
                                  </td>
                                  <td className="p-3 text-right">
                                    <button
                                      onClick={() =>
                                        handleExecuteCascadeRelief(plan)
                                      }
                                      disabled={
                                        isTrainOperator ||
                                        plan.suggestedReliever.employeeId ===
                                          "--"
                                      }
                                      className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-30 disabled:cursor-not-allowed text-slate-955 px-2.5 py-1 rounded text-[10px] font-black uppercase transition shadow inline-flex items-center gap-1"
                                    >
                                      <Send size={11} /> Dispatch
                                    </button>
                                  </td>
                                </tr>
                              ),
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                {/* 1. Recommended relief Operator Panel */}
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl relative overflow-hidden">
                  <div className="absolute top-0 right-0 bg-emerald-500/15 border-b border-l border-emerald-500/30 text-[9px] font-bold text-emerald-400 px-4 py-1.5 rounded-bl-lg uppercase tracking-wider flex items-center gap-1">
                    <Award size={12} /> Best Candidate Match
                  </div>

                  <h3 className="font-bold text-xs uppercase text-emerald-400 tracking-wider mb-4 pb-2 border-b border-slate-800">
                    Recommended Relief Operator
                  </h3>

                  {evaluationResults.bestPlan.available ? (
                    <div className="space-y-6">
                      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-950/60 p-4 rounded-xl border border-slate-850">
                        <div className="flex items-center gap-3">
                          <div className="h-12 w-12 bg-slate-900 border border-slate-700 rounded-lg flex items-center justify-center text-slate-400 shadow-inner">
                            <User size={24} />
                          </div>
                          <div>
                            <h4 className="text-sm font-black text-slate-200">
                              {evaluationResults.bestPlan.operator.employeeName}
                            </h4>
                            <p className="text-[10px] text-slate-550 mt-0.5">
                              ID:{" "}
                              <span className="text-emerald-400 font-bold">
                                {evaluationResults.bestPlan.operator.employeeId}
                              </span>{" "}
                              | Location:{" "}
                              {getStationLabel(
                                evaluationResults.bestPlan.operator
                                  .currentLocation,
                              )}
                            </p>
                          </div>
                        </div>

                        <div className="text-right">
                          <div className="text-xs text-slate-500 font-bold uppercase">
                            Recommendation Score
                          </div>
                          <div className="text-xl font-black text-emerald-400 tracking-wider">
                            +{evaluationResults.bestPlan.score}
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-[11px]">
                        <div className="bg-slate-950/30 border border-slate-850 rounded-lg p-2.5 space-y-1">
                          <span className="text-[9px] text-slate-500 block uppercase tracking-wider">
                            Current Duty
                          </span>
                          <span className="text-slate-200 font-bold">
                            {evaluationResults.bestPlan.operator.currentDuty}
                          </span>
                        </div>
                        <div className="bg-slate-950/30 border border-slate-850 rounded-lg p-2.5 space-y-1">
                          <span className="text-[9px] text-slate-500 block uppercase tracking-wider">
                            Duty Hours
                          </span>
                          <span className="text-emerald-400 font-bold">
                            {evaluationResults.bestPlan.operator.dutyHours}
                          </span>
                        </div>
                        <div className="bg-slate-950/30 border border-slate-850 rounded-lg p-2.5 space-y-1">
                          <span className="text-[9px] text-slate-500 block uppercase tracking-wider">
                            Break Time
                          </span>
                          <span className="text-slate-300 font-bold">
                            {evaluationResults.bestPlan.operator.breakTime}
                          </span>
                        </div>
                      </div>

                      {/* Scoring breakdown tags */}
                      <div className="space-y-2">
                        <span className="text-[9px] text-slate-500 block uppercase tracking-wider">
                          AI Decision Breakdown
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {evaluationResults.bestPlan.operator.scoreBreakdown.map(
                            (b, i) => (
                              <span
                                key={i}
                                className={`text-[9px] font-bold px-2 py-0.5 rounded border ${
                                  b.points > 0
                                    ? "bg-emerald-500/5 text-emerald-400 border-emerald-500/20"
                                    : "bg-rose-500/5 text-rose-400 border-rose-500/20"
                                }`}
                              >
                                {b.label}:{" "}
                                {b.points > 0 ? `+${b.points}` : b.points}
                              </span>
                            ),
                          )}
                        </div>
                      </div>

                      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-t border-slate-800 pt-4">
                        <div className="text-[11px] font-medium text-slate-400 lowercase leading-relaxed max-w-md">
                          {evaluationResults.bestPlan.description}
                        </div>
                        {!isTrainOperator && (
                          <button
                            onClick={() =>
                              handleExecuteRelief(evaluationResults.bestPlan)
                            }
                            className="bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-black px-5 py-2.5 rounded-lg text-xs tracking-wider uppercase transition shadow-md flex items-center gap-1.5 shrink-0"
                          >
                            <Send size={14} /> Execute Relief Plan
                          </button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-8 text-slate-500 text-xs italic">
                      No eligible relief operator available.
                    </div>
                  )}
                </div>

                {/* 2. Normalization Engine plans (Best, Alt A, Alt B) */}
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl space-y-4">
                  <div className="border-b border-slate-800 pb-2 flex justify-between items-center">
                    <span className="font-bold text-xs uppercase text-indigo-400 tracking-wider flex items-center gap-1.5">
                      <Activity size={15} /> Crew Normalization Plans
                    </span>
                    {evaluationResults.shortLoopPossible && (
                      <span className="bg-amber-500/15 border border-amber-500/30 text-amber-400 text-[9px] font-bold px-2 py-0.5 rounded uppercase tracking-wider animate-pulse">
                        Short Loop Optimized
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Plan Best */}
                    <div className="bg-slate-950/40 border border-emerald-500/20 rounded-xl p-4 space-y-2 flex flex-col justify-between hover:border-emerald-500/40 transition-all">
                      <div>
                        <div className="flex justify-between items-center text-[10px] font-bold text-emerald-400 uppercase tracking-widest border-b border-slate-850 pb-1.5">
                          <span>Best Relief Plan</span>
                          <span className="text-xs">
                            +{evaluationResults.bestPlan.score || 0}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-400 mt-2 lowercase leading-relaxed">
                          {evaluationResults.bestPlan.available
                            ? `${evaluationResults.bestPlan.operator.employeeName} (${evaluationResults.bestPlan.operator.employeeId})`
                            : "No operator found."}
                        </p>
                      </div>
                      <div className="pt-2 border-t border-slate-900 flex justify-between items-center text-[10px] font-bold uppercase">
                        <span className="text-slate-500">Recovery Est:</span>
                        <span className="text-emerald-400">
                          {evaluationResults.bestPlan.available
                            ? `${evaluationResults.bestPlan.recoveryTimeMinutes} mins`
                            : "--"}
                        </span>
                      </div>
                    </div>

                    {/* Plan A */}
                    <div className="bg-slate-950/40 border border-slate-850 rounded-xl p-4 space-y-2 flex flex-col justify-between hover:border-slate-800 transition-all">
                      <div>
                        <div className="flex justify-between items-center text-[10px] font-bold text-slate-300 uppercase tracking-widest border-b border-slate-850 pb-1.5">
                          <span>Alternative Plan A</span>
                          <span className="text-xs">
                            +{evaluationResults.alternativePlanA.score || 0}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-400 mt-2 lowercase leading-relaxed">
                          {evaluationResults.alternativePlanA.available
                            ? `${evaluationResults.alternativePlanA.operator.employeeName} (${evaluationResults.alternativePlanA.operator.employeeId})`
                            : "No alternative found."}
                        </p>
                      </div>
                      <div className="pt-2 border-t border-slate-900 flex justify-between items-center text-[10px] font-bold uppercase">
                        <span className="text-slate-500">Recovery Est:</span>
                        <span className="text-slate-300">
                          {evaluationResults.alternativePlanA.available
                            ? `${evaluationResults.alternativePlanA.recoveryTimeMinutes} mins`
                            : "--"}
                        </span>
                      </div>
                    </div>

                    {/* Plan B */}
                    <div className="bg-slate-950/40 border border-slate-850 rounded-xl p-4 space-y-2 flex flex-col justify-between hover:border-slate-800 transition-all">
                      <div>
                        <div className="flex justify-between items-center text-[10px] font-bold text-slate-300 uppercase tracking-widest border-b border-slate-850 pb-1.5">
                          <span>Alternative Plan B</span>
                          <span className="text-xs">
                            +{evaluationResults.alternativePlanB.score || 0}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-400 mt-2 lowercase leading-relaxed">
                          {evaluationResults.alternativePlanB.available
                            ? `${evaluationResults.alternativePlanB.operator.employeeName} (${evaluationResults.alternativePlanB.operator.employeeId})`
                            : "No alternative found."}
                        </p>
                      </div>
                      <div className="pt-2 border-t border-slate-900 flex justify-between items-center text-[10px] font-bold uppercase">
                        <span className="text-slate-500">Recovery Est:</span>
                        <span className="text-slate-300">
                          {evaluationResults.alternativePlanB.available
                            ? `${evaluationResults.alternativePlanB.recoveryTimeMinutes} mins`
                            : "--"}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 3. Candidates comparison table */}
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl space-y-3">
                  <span className="font-bold text-xs uppercase text-slate-400 tracking-wider">
                    All Eligible relief pool rankings
                  </span>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-[10px] font-mono">
                      <thead>
                        <tr className="bg-slate-950 border-b border-slate-850 text-slate-500 font-bold uppercase">
                          <th className="p-2 text-center">Rank</th>
                          <th className="p-2">Name / ID</th>
                          <th className="p-2">Duty ID</th>
                          <th className="p-2">Location</th>
                          <th className="p-2 text-center">Score</th>
                          {!isTrainOperator && (
                            <th className="p-2 text-right">Action</th>
                          )}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-850">
                        {evaluationResults.allEligible.map((candidate, idx) => (
                          <tr
                            key={candidate.employeeId}
                            className="hover:bg-slate-950/40"
                          >
                            <td className="p-2 text-center text-slate-500">
                              {idx + 1}
                            </td>
                            <td className="p-2">
                              <div className="font-bold text-slate-200">
                                {candidate.employeeName}
                              </div>
                              <div className="text-[9px] text-slate-500">
                                {candidate.employeeId}
                              </div>
                            </td>
                            <td className="p-2 text-slate-400 font-bold">
                              {candidate.currentDuty}
                            </td>
                            <td className="p-2 text-slate-400">
                              {getStationLabel(candidate.currentLocation)}
                            </td>
                            <td className="p-2 text-center text-emerald-400 font-black">
                              +{candidate.recommendationScore}
                            </td>
                            {!isTrainOperator && (
                              <td className="p-2 text-right">
                                <button
                                  onClick={() =>
                                    handleExecuteRelief({
                                      available: true,
                                      operator: candidate,
                                      score: candidate.recommendationScore,
                                      recoveryTimeMinutes:
                                        candidate.travelTimeMinutes + 3,
                                    })
                                  }
                                  className="bg-slate-950 border border-slate-800 hover:bg-slate-800 text-slate-200 px-2 py-1 rounded font-bold uppercase"
                                >
                                  Assign
                                </button>
                              </td>
                            )}
                          </tr>
                        ))}

                        {evaluationResults.allRejected.map((candidate) => (
                          <tr
                            key={candidate.employeeId}
                            className="opacity-40 bg-slate-950/20"
                          >
                            <td className="p-2 text-center text-slate-650">
                              -
                            </td>
                            <td className="p-2">
                              <div className="font-bold text-slate-400">
                                {candidate.employeeName}
                              </div>
                              <div className="text-[9px] text-slate-600">
                                {candidate.employeeId}
                              </div>
                            </td>
                            <td className="p-2 text-slate-600">
                              {candidate.currentDuty}
                            </td>
                            <td className="p-2 text-slate-600">
                              {getStationLabel(candidate.currentLocation)}
                            </td>
                            <td className="p-2 text-center text-rose-500/80 font-bold">
                              REJ
                            </td>
                            <td className="p-2 text-right text-rose-500 text-[9px] font-bold">
                              {candidate.rejectionReason}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            ) : (
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-20 shadow-xl text-center space-y-3">
                <ShieldAlert size={48} className="text-slate-700 mx-auto" />
                <h3 className="text-slate-400 font-bold text-xs uppercase tracking-wider">
                  No Incident Selected
                </h3>
                <p className="text-[10px] text-slate-600 max-w-sm mx-auto uppercase">
                  Select a Train ID and click recommendation button in incident
                  panel to run decision algorithms.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {reliefTab === "BATCH_SWAP" && (
        <div className="space-y-6">
          <div className="bg-slate-900 border border-indigo-500/40 rounded-xl p-5 shadow-2xl space-y-4">
            <div className="border-b border-slate-800 pb-3 flex items-start gap-2">
              <RefreshCw size={16} className="text-indigo-400 mt-0.5" />
              <div>
                <h3 className="text-indigo-400 font-bold text-xs uppercase tracking-wider">
                  Train Swap / Multi-Incident Batch Resolution
                </h3>
                <p className="text-[10px] text-slate-500 mt-1 normal-case leading-relaxed max-w-2xl">
                  When OCC swaps operators between trains, or several trains
                  need relief at once, select every affected train below. The
                  engine solves them together — a single global optimal
                  assignment, not one train at a time — so no reliever is wasted
                  on the wrong train, detects hand-off chains between the
                  selected trains (including direct swaps and longer deadlocks),
                  and estimates how fast every pending manual assignment in this
                  event can be cleared.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <select
                value={batchIncidentType}
                onChange={(e) => setBatchIncidentType(e.target.value)}
                disabled={isTrainOperator}
                className="bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs font-bold uppercase focus:outline-none disabled:opacity-50"
              >
                {EMERGENCY_EVENTS.map((ev) => (
                  <option key={ev} value={ev}>
                    {ev}
                  </option>
                ))}
              </select>

              <select
                value={selectedLocation}
                onChange={(e) => setSelectedLocation(e.target.value)}
                disabled={isTrainOperator}
                className="bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs font-bold uppercase focus:outline-none disabled:opacity-50"
                title="Incident / swap location used for travel-time scoring"
              >
                {STATION_DETAILS.map((st) => (
                  <option key={st.code} value={st.code}>
                    {st.name} ({st.code})
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={handleRunBatchResolution}
                disabled={isTrainOperator || batchSelectedTrainIds.length < 2}
                className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 disabled:cursor-not-allowed text-slate-950 font-black px-4 py-2.5 rounded-lg text-xs tracking-widest uppercase transition shadow flex items-center gap-1.5"
              >
                <Cpu size={14} /> Resolve {batchSelectedTrainIds.length || ""}{" "}
                Trains (Optimal)
              </button>

              {batchSelectedTrainIds.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setBatchSelectedTrainIds([]);
                    setBatchResolution(null);
                  }}
                  className="text-[10px] text-slate-500 hover:text-slate-300 uppercase font-bold underline"
                >
                  Clear selection
                </button>
              )}
            </div>

            {/* Quick Train ID Filter & Duty Count Bar */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[10px] uppercase font-bold text-slate-400">
                <span>
                  Filter By Train ID ({activeTrains.length} total duties
                  scheduled across rakes 201–223):
                </span>
                {batchSelectedTrainIds.length > 0 && (
                  <span className="text-indigo-400">
                    {batchSelectedTrainIds.length} duty assignment(s) selected
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5 overflow-x-auto pb-2 scrollbar-thin">
                <button
                  type="button"
                  onClick={() => setBatchTrainFilter("ALL")}
                  className={`px-2.5 py-1 rounded text-[10px] font-bold uppercase transition shrink-0 ${
                    batchTrainFilter === "ALL"
                      ? "bg-indigo-600 text-white shadow"
                      : "bg-slate-950 border border-slate-800 text-slate-400 hover:text-white"
                  }`}
                >
                  All Trains ({activeTrains.length})
                </button>
                {TRAIN_IDS.map((tid) => {
                  const count = activeTrains.filter(
                    (t) => t.trainId === tid,
                  ).length;
                  const isFiltered = batchTrainFilter === tid;
                  const selectedInTrain = activeTrains.filter(
                    (t) =>
                      t.trainId === tid &&
                      batchSelectedTrainIds.includes(t.key),
                  ).length;
                  return (
                    <button
                      type="button"
                      key={tid}
                      onClick={() => setBatchTrainFilter(tid)}
                      className={`px-2 py-1 rounded text-[10px] font-bold uppercase transition shrink-0 flex items-center gap-1.5 border ${
                        isFiltered
                          ? "bg-indigo-500/25 border-indigo-500 text-indigo-200 ring-1 ring-indigo-500"
                          : selectedInTrain > 0
                            ? "bg-indigo-955/50 border-indigo-700 text-indigo-300"
                            : "bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700"
                      }`}
                    >
                      <span>T{tid}</span>
                      <span
                        className={`text-[9px] px-1 py-0.2 rounded font-mono font-bold ${
                          count > 0
                            ? "bg-slate-800 text-slate-200"
                            : "bg-slate-900 text-slate-600"
                        }`}
                      >
                        {count}
                      </span>
                      {selectedInTrain > 0 && (
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-400"></span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Individual Duty Cards for Selected Train / All Trains */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2 max-h-[360px] overflow-y-auto p-1.5 border border-slate-800/80 rounded-xl bg-slate-950/40">
              {(batchTrainFilter === "ALL"
                ? activeTrains
                : activeTrains.filter((t) => t.trainId === batchTrainFilter)
              ).map((a) => {
                const checked = batchSelectedTrainIds.includes(a.key);
                return (
                  <button
                    type="button"
                    key={a.key}
                    onClick={() => toggleBatchTrain(a.key)}
                    disabled={isTrainOperator}
                    className={`text-left p-2.5 rounded-lg border transition flex flex-col justify-between gap-1.5 ${
                      checked
                        ? "bg-indigo-500/20 border-indigo-500 text-indigo-100 shadow-md shadow-indigo-500/20 ring-1 ring-indigo-500"
                        : "bg-slate-950/60 border-slate-800 text-slate-300 hover:border-indigo-500/50 hover:bg-slate-900"
                    } disabled:opacity-50`}
                    title={`Train ${a.trainId} — Duty ${a.dutyId}: ${a.employeeName} (#${a.employeeId})`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className="font-black text-xs text-white">
                        Train {a.trainId}
                      </span>
                      <span
                        className={`text-[9px] px-1.5 py-0.5 rounded font-mono font-bold ${
                          checked
                            ? "bg-indigo-600 text-white"
                            : "bg-emerald-955 text-emerald-300 border border-emerald-800/40"
                        }`}
                      >
                        Duty {a.dutyId}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-300 truncate font-semibold">
                      {a.employeeName}
                    </div>
                    <div className="text-[9px] text-slate-500 font-mono flex items-center justify-between">
                      <span>#{a.employeeId}</span>
                      <span>{a.signOnTime}</span>
                    </div>
                  </button>
                );
              })}
              {activeTrains.length === 0 && (
                <div className="col-span-full py-8 text-center text-xs text-slate-500 uppercase italic">
                  No active train duties found in current deployment records.
                </div>
              )}
            </div>
          </div>

          {batchResolution && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
                <span className="font-bold text-xs uppercase text-emerald-400 tracking-wider flex items-center gap-1.5">
                  <Award size={14} /> Global Optimal Resolution Plan
                </span>
                <div className="flex items-center gap-2">
                  <span className="bg-emerald-955 text-emerald-300 border border-emerald-800 text-[10px] px-2.5 py-1 rounded font-bold">
                    Full Resolution ETA:{" "}
                    {batchResolution.totalResolutionMinutes} mins
                  </span>
                  <span className="bg-slate-950 border border-slate-800 text-slate-300 text-[10px] px-2.5 py-1 rounded font-bold">
                    {batchResolution.resolvedCount}/{batchResolution.totalCount}{" "}
                    Resolved
                  </span>
                </div>
              </div>

              {batchResolution.cycles?.length > 0 && (
                <div className="bg-amber-955/30 border border-amber-800/60 p-3 rounded-lg space-y-1.5">
                  <span className="text-[10px] font-bold text-amber-300 uppercase tracking-wider flex items-center gap-1.5">
                    <AlertTriangle size={12} /> Hand-off Dependencies Detected
                  </span>
                  {batchResolution.cycles.map((c, i) => (
                    <p
                      key={i}
                      className="text-[10px] text-amber-200 normal-case"
                    >
                      {c.type === "PARALLEL_SWAP"
                        ? `Direct swap between Train ${c.trains.join(" & Train ")} — both hand-offs can run at the same time.`
                        : `${c.trains.length}-train hand-off loop (Train ${c.trains.join(" → Train ")} → back to Train ${c.trains[0]}). ${c.suggestion}`}
                    </p>
                  ))}
                </div>
              )}

              <div className="overflow-x-auto border border-slate-800 rounded-lg">
                <table className="w-full text-left text-xs whitespace-nowrap">
                  <thead className="bg-slate-955 text-slate-400 uppercase text-[10px] border-b border-slate-800">
                    <tr>
                      <th className="p-3">Step / Train</th>
                      <th className="p-3">Current Operator</th>
                      <th className="p-3 text-cyan-400">Reliever</th>
                      <th className="p-3">Pool</th>
                      <th className="p-3">Waits On</th>
                      <th className="p-3">Window</th>
                      <th className="p-3">Score</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-850 bg-slate-900/60">
                    {batchResolution.executionPlan.map((step) => (
                      <tr
                        key={`${step.trainId}_${step.sequence}`}
                        className="hover:bg-slate-850/50 transition"
                      >
                        <td className="p-3 font-bold text-white">
                          <span className="text-slate-500 text-[10px] mr-1 font-mono">
                            #{step.sequence}
                          </span>
                          <span>Train {step.trainId}</span>
                          {step.dutyId && step.dutyId !== "--" && (
                            <span className="ml-1.5 text-[9px] px-1.5 py-0.5 rounded font-mono font-bold bg-emerald-955 text-emerald-300 border border-emerald-800/40">
                              Duty {step.dutyId}
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-slate-300">
                          {step.currentOperatorName}{" "}
                          <span className="text-[10px] text-slate-500">
                            ({step.currentOperatorId})
                          </span>
                        </td>
                        <td className="p-3 font-bold text-cyan-300">
                          {step.reliever ? (
                            <>
                              {step.reliever.employeeName}
                              <span className="text-[10px] text-slate-400 block font-normal">
                                #{step.reliever.employeeId}
                              </span>
                            </>
                          ) : (
                            <span className="text-rose-400">UNRESOLVED</span>
                          )}
                        </td>
                        <td className="p-3">
                          {step.reliever ? (
                            <span
                              className={`text-[9px] px-2 py-0.5 rounded font-black uppercase border ${
                                step.reliever.pool === "STANDBY"
                                  ? "bg-cyan-955 text-cyan-300 border-cyan-700"
                                  : step.reliever.pool === "STBK"
                                    ? "bg-purple-955 text-purple-300 border-purple-800"
                                    : step.reliever.pool === "PRO"
                                      ? "bg-amber-955 text-amber-300 border-amber-800"
                                      : step.reliever.pool === "TGTP"
                                        ? "bg-emerald-955 text-emerald-300 border-emerald-800"
                                        : step.reliever.pool === "RD3"
                                          ? "bg-indigo-955 text-indigo-300 border-indigo-800"
                                          : "bg-slate-800 text-slate-300 border-slate-700"
                              }`}
                            >
                              {step.reliever.pool === "STANDBY"
                                ? "STANDBY / OR"
                                : step.reliever.pool === "STBK"
                                  ? "STBK"
                                  : step.reliever.pool === "PRO"
                                    ? "PRO STBY"
                                    : step.reliever.pool === "TGTP"
                                      ? "TGTP STBY"
                                      : step.reliever.pool === "RD3"
                                        ? "RD3 STBY"
                                        : "ACTIVE"}
                              {step.overrideRequired ? " · OVERRIDE" : ""}
                            </span>
                          ) : (
                            "--"
                          )}
                        </td>
                        <td className="p-3 text-slate-400 text-[10px]">
                          {step.dependsOn?.length
                            ? `Train ${step.dependsOn.join(", ")}`
                            : "—"}
                        </td>
                        <td className="p-3 text-slate-400 font-mono text-[11px]">
                          {step.earliestStart}–{step.earliestFinish} mins
                        </td>
                        <td className="p-3 font-bold text-emerald-400">
                          {step.reliever ? `+${step.reliever.score}` : "--"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {batchResolution.assignments.some((a) => a.vacatesTrainId) && (
                <div className="bg-rose-955/20 border border-rose-800/50 p-3 rounded-lg text-[10px] text-rose-200 normal-case leading-relaxed">
                  <strong className="text-rose-300 uppercase">Note:</strong>{" "}
                  Some relievers are being pulled off active trains outside this
                  batch (Train{" "}
                  {batchResolution.assignments
                    .filter((a) => a.vacatesTrainId)
                    .map((a) => a.vacatesTrainId)
                    .join(", ")}
                  ). Those trains will need a follow-up relief of their own.
                </div>
              )}

              {batchResolution.unresolvedTrainIds.length > 0 && (
                <div className="bg-slate-950/60 border border-rose-500/20 p-3 rounded-lg text-[10px] text-rose-300 normal-case leading-relaxed">
                  Still unresolved: Train{" "}
                  {batchResolution.unresolvedTrainIds.join(", ")}. No compliant
                  or override-eligible reliever was found — free up a Standby
                  duty and re-run.
                </div>
              )}

              {!isTrainOperator && (
                <div className="flex justify-end">
                  <button
                    onClick={handleExecuteBatchPlan}
                    className="bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-black px-5 py-2.5 rounded-lg text-xs tracking-wider uppercase transition shadow-md flex items-center gap-1.5"
                  >
                    <Send size={14} /> Execute Full Batch Plan
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {reliefTab === "REPORTS" && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl space-y-6">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-800 pb-4">
            <div>
              <span className="font-bold text-xs uppercase text-rose-400 tracking-wider flex items-center gap-1.5">
                <FileText size={16} /> Emergency Crew Relief Reports Center
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs font-bold uppercase">
              <Calendar size={14} className="text-slate-500" />
              <input
                id="emergencyreliefengin-i12"
                name="emergencyreliefengin-i12"
                type="date"
                value={reportStartDate}
                onChange={(e) => setReportStartDate(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-200"
              />
              <span className="text-slate-650">to</span>
              <input
                id="emergencyreliefengin-i13"
                name="emergencyreliefengin-i13"
                type="date"
                value={reportEndDate}
                onChange={(e) => setReportEndDate(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-200"
              />

              {!isTrainOperator && (
                <div className="flex gap-1.5 ml-2">
                  <button
                    onClick={handleExportExcel}
                    className="bg-emerald-600 hover:bg-emerald-500 text-slate-950 px-3 py-1.5 rounded font-black text-xs flex items-center gap-1 transition shadow"
                    title="Export to Excel Spreadsheet"
                  >
                    <FileSpreadsheet size={14} /> XLSX
                  </button>
                  <button
                    onClick={handleExportCSV}
                    className="bg-slate-950 border border-slate-850 hover:bg-slate-800 text-slate-200 px-3 py-1.5 rounded font-black text-xs flex items-center gap-1 transition"
                    title="Export to CSV Format"
                  >
                    <Download size={14} /> CSV
                  </button>
                  <button
                    onClick={handlePrintReport}
                    className="bg-slate-950 border border-slate-850 hover:bg-slate-800 text-slate-200 px-3 py-1.5 rounded font-black text-xs flex items-center gap-1 transition"
                    title="Print Reports Matrix"
                  >
                    <Printer size={14} /> Print
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="overflow-x-auto print:overflow-visible">
            <table className="w-full text-left border-collapse text-[11px] font-mono">
              <thead>
                <tr className="bg-slate-950 border-b border-slate-850 text-slate-500 font-bold uppercase">
                  <th className="p-3">Incident Time</th>
                  <th className="p-3">Incident Type</th>
                  <th className="p-3">Original Operator</th>
                  <th className="p-3">Relief Operator</th>
                  <th className="p-3">Relief Reason</th>
                  <th className="p-3">Duty Hours</th>
                  <th className="p-3">Break Time</th>
                  <th className="p-3 text-center">Score</th>
                  <th className="p-3 text-right">Recovery Est</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-850 text-slate-350">
                {filteredReports.length === 0 ? (
                  <tr>
                    <td
                      colSpan="9"
                      className="p-8 text-center text-slate-500 italic uppercase"
                    >
                      No relief operations records found for this period.
                    </td>
                  </tr>
                ) : (
                  filteredReports.map((item, idx) => (
                    <tr key={item.id || idx} className="hover:bg-slate-950/40">
                      <td className="p-3 font-mono font-bold text-slate-400">
                        {item.incidentTime}
                      </td>
                      <td className="p-3 font-bold text-rose-400">
                        {item.incidentType}
                      </td>
                      <td className="p-3">
                        <div className="font-bold text-slate-300">
                          {item.originalOperator?.employeeName}
                        </div>
                        <div className="text-[9px] text-slate-500">
                          ID: {item.originalOperator?.employeeId} | Duty:{" "}
                          {item.originalOperator?.dutyId}
                        </div>
                      </td>
                      <td className="p-3">
                        <div className="font-bold text-emerald-400">
                          {item.reliefOperator?.employeeName}
                        </div>
                        <div className="text-[9px] text-slate-550">
                          ID: {item.reliefOperator?.employeeId} | Duty:{" "}
                          {item.reliefOperator?.currentDuty} | Loc:{" "}
                          {getStationLabel(
                            item.reliefOperator?.currentLocation,
                          )}
                        </div>
                      </td>
                      <td
                        className="p-3 text-slate-400 italic lowercase max-w-xs truncate"
                        title={item.reliefReason}
                      >
                        {item.reliefReason}
                      </td>
                      <td className="p-3 font-mono">{item.dutyHours}</td>
                      <td className="p-3 font-mono">{item.breakTime}</td>
                      <td className="p-3 text-center text-emerald-400 font-bold">
                        +{item.recommendationScore}
                      </td>
                      <td className="p-3 text-right font-mono text-slate-300 font-bold">
                        {item.recoveryTime}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
