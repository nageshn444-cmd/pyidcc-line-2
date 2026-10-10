import React, { useState, useEffect, useMemo, useRef } from 'react';
import { db } from '../firebase';
import { 
  collection, addDoc, query, orderBy, onSnapshot, 
  updateDoc, doc, serverTimestamp 
} from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { 
  ShieldAlert, Sparkles, Send, Mail, MessageSquare, Copy, 
  Check, AlertTriangle, Clock, MapPin, Train, RefreshCw, 
  CheckCircle, ArrowRight, UserCheck, AlertOctagon, Share2, 
  ExternalLink, FileText, ChevronRight, Filter, Eye, ArrowLeft,
  Volume2, VolumeX, Printer, Wrench, Zap, Layers, Radio, X, Cpu, ShieldCheck
} from 'lucide-react';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { Link } from 'react-router-dom';

// 32 Green Line stations in chronological line order
const GREEN_LINE_STATIONS = [
  { code: 'BIET', name: 'Madavara' },
  { code: 'JIDL', name: 'Chikkabidarakallu' },
  { code: 'MNJN', name: 'Manjunathanagar' },
  { code: 'NGSA', name: 'Nagasandra' },
  { code: 'DSH',  name: 'Dasarahalli' },
  { code: 'JLHL', name: 'Jalahalli' },
  { code: 'PYID', name: 'Peenya Industry' },
  { code: 'PEYA', name: 'Peenya' },
  { code: 'YPI',  name: 'Goraguntepalya' },
  { code: 'YPM',  name: 'Yeshwanthpur' },
  { code: 'SSFY', name: 'Sandal Soap Factory' },
  { code: 'MHLI', name: 'Mahalakshmi' },
  { code: 'RJNR', name: 'Rajajinagar' },
  { code: 'KVPR', name: 'Mahakavi Kuvempu Road' },
  { code: 'SPRU', name: 'Srirampura' },
  { code: 'SPGD', name: 'Mantri Square Sampige Road' },
  { code: 'KGWA', name: 'Nadaprabhu Kempegowda Majestic' },
  { code: 'CKPE', name: 'Chickpete' },
  { code: 'KRMT', name: 'Krishna Rajendra Market' },
  { code: 'NLC',  name: 'National College' },
  { code: 'LBGH', name: 'Lalbagh' },
  { code: 'SECE', name: 'South End Circle' },
  { code: 'JYN',  name: 'Jayanagar' },
  { code: 'RVR',  name: 'Rashtreeya Vidyalaya Road' },
  { code: 'BSNK', name: 'Banashankari' },
  { code: 'JPN',  name: 'Jaya Prakash Nagar' },
  { code: 'PUTH', name: 'Yelachenahalli' },
  { code: 'APRC', name: 'Konanakunte Cross' },
  { code: 'KLPK', name: 'Doddakallasandra' },
  { code: 'VJRH', name: 'Vajarahalli' },
  { code: 'TGTP', name: 'Thalaghattapura' },
  { code: 'APTS', name: 'Silk Institute' }
];

// BMRCL Line 2 100% 750V DC Third Rail Infrastructure Categories (NO OHE / Pantograph)
const FAULT_CATEGORIES = [
  'Rolling Stock Subsystem (TCMS / Brake / Traction / SIV / Doors)',
  'Signaling & Train Control / Cab Signalling / ATP / ATO Failure (GR Rule 7.02)',
  'Traction Power Supply (750V DC Third Rail / HSCB Trip / CCSD Shoegear / Voltage Dip)',
  'Track & Permanent Way / Point Machine Defect / Track Debris (GR Rule 9.04)',
  'Station & Platform / Door Interlock / Passenger Obstruction (GR Rule 10.05)',
  'Passenger Emergency Alarm (PAD) / Medical Incident (GR Rule 12.01)',
  'Assistance to Disabled Train / Coupled Rescue Push-Out (GR Rule 11.04)',
  'Peenya Depot Shunting / Yard Siding Operations (GR Rule 4.15)',
  'Other Mainline Operational Disruption (GR Rule 13.02)'
];

// Rolling Stock Fleet Configuration
const TRAIN_FLEET_TYPES = {
  BEMEL: {
    name: 'BEMEL 6-Car Rake',
    subsystems: [
      'Mitsubishi / BEMEL TCMS (Central Processing Unit & DDU)',
      'VVVF Traction Inverter (2-Level IGBT, Line Breakers LB1/LB2)',
      'Knorr-Bremse BECU (Brake Electronic Control Unit & Holding Brake)',
      'Static Inverter SIV 415V AC (Auxiliary Power & Saloon HVAC)',
      'Door Interlock System (Faiveley/Nabtesco Microswitch Loop)',
      '750V DC Current Collector Shoe Device (Pneumatic CCSD)',
      'Train Radio VHF & Cab PIS/PA Audio Console'
    ],
    composition: 'DMC1 - TC1 - MC1 - MC2 - TC2 - DMC2'
  },
  CRRC: {
    name: 'CRRC 6-Car Rake',
    subsystems: [
      'CRRC Zhuzhou TCMS (Ethernet Train Bus ETB / MVB Gateway & CDU)',
      'PMSM / High-Efficiency VVVF Inverter (Phase Overheat Derating)',
      'EPAC Microprocessor Electro-Pneumatic Brake Controller',
      'Electric Door System (EDS with CAN-Bus DCU & Sensitive Edge)',
      'Active Track Obstacle Detection System (ODS / Deflector Beam)',
      'High-Capacity 750V DC CCSD Shoegear with Thermal Sensors',
      'CBTC Cab Signalling Antennas & Doppler Radar Interface'
    ],
    composition: 'DMC - TC - MC - MC - TC - DMC'
  }
};

const SAMPLE_TRAIN_IDS = [
  '201', '202', '203', '204', '205', '206', '207', '208',
  '209', '210', '211', '212', '213', '214', '215', '216',
  '217', '218', '219', '220', '221', '222'
];

// Known CRRC train IDs in Line 2 revenue service
const CRRC_TRAIN_IDS = ['215', '217', '219'];

// Metro Rail 2020 General Rules Driving Modes
const DRIVING_MODES = [
  'ATO (Automatic Train Operation)',
  'ATP (Automatic Train Protection / Coded Manual)',
  'RM (Restricted Manual <= 25 km/h per GR Rule 7.02)',
  'NRM (Non-Restricted Manual / Cut-Out Mode under OCC Authority)'
];

// 750V DC Third Rail Power Telemetry Statuses
const THIRD_RAIL_STATUSES = [
  '750V DC Normal (700V - 780V DC Live)',
  '750V DC Voltage Dip (<550V DC - Auxiliary Shedding)',
  'TSS HSCB Breaker Tripped (Traction Feeder Open per GR Rule 8.08)',
  'Third Rail Gap / Expansion Section Neutral Contact',
  'CCSD Shoegear Flashover / Arc Interruption / Shoe Retracted'
];

// Metro Rail General Rules 2020 Actions Taken
const GR_ACTIONS_TAKEN = [
  'Train Held at Platform under OCC Timetable Regulation (GR Rule 9.04)',
  'Authorized Movement in RM Mode <= 25 km/h with OCC Concurrence (GR Rule 7.02)',
  'Passenger Detrainment Authorized at Platform under SC Supervision (GR Rule 12.01)',
  'Defective Passenger Door Isolated and Locked Out of Service (GR Rule 10.05)',
  'Assisting Rescue Train Push-Out Operation Ordered (GR Rule 11.04)',
  'Traction Power Block Requested with TPC (GR Rule 8.08)',
  'Train Withdrawn to Peenya Depot Reception Line (GR Rule 4.15)',
  'Standby Relief Train Operator Positioned at Next Station'
];

const CAR_OPTIONS = [
  'Full Trainset (6-Car Rake)',
  'Car 1 - DMC1 (Driving Motor Car - North)',
  'Car 2 - TC1 (Trailer Car 1)',
  'Car 3 - MC1 (Motor Car 1 with CCSD)',
  'Car 4 - MC2 (Motor Car 2 with CCSD)',
  'Car 5 - TC2 (Trailer Car 2)',
  'Car 6 - DMC2 (Driving Motor Car - South)'
];

const MODEL_CHAIN = [
  'gemini-2.5-flash',
  'gemini-2.5-pro',
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite'
];

export default function AIFaultReportingPage() {
  const { userProfile } = useAuth();

  // Role selector (ALS, CC, TRAIN OPERATOR)
  const [reporterRole, setReporterRole] = useState(() => {
    const role = userProfile?.role || '';
    if (role.includes('ALS') || role.includes('SUPERVISOR')) return 'ALS';
    if (role.includes('CONTROLLER') || role.includes('CC') || role.includes('ADMIN')) return 'CC';
    return 'TRAIN OPERATOR';
  });

  const [reporterName, setReporterName] = useState(userProfile?.employeeName || userProfile?.name || 'Authorized Crew');
  const [reporterId, setReporterId] = useState(userProfile?.employeeId || userProfile?.empId || 'PYID-TO');

  // Mandatory operational fields
  const [trainId, setTrainId] = useState('204');
  const [trainMake, setTrainMake] = useState('BEMEL'); // 'BEMEL' or 'CRRC'
  const [affectedCar, setAffectedCar] = useState(CAR_OPTIONS[0]);
  const [subsystem, setSubsystem] = useState(TRAIN_FLEET_TYPES.BEMEL.subsystems[0]);
  const [drivingMode, setDrivingMode] = useState(DRIVING_MODES[1]); // ATP Coded Manual
  const [thirdRailStatus, setThirdRailStatus] = useState(THIRD_RAIL_STATUSES[0]);
  const [operationalAction, setOperationalAction] = useState(GR_ACTIONS_TAKEN[0]);
  const [direction, setDirection] = useState('UP'); // 'UP' or 'DN'
  const [stationLocation, setStationLocation] = useState('KVPR');
  const [specificLocation, setSpecificLocation] = useState('Platform 1 (UP Track ➔ Madavara)');
  const [faultType, setFaultType] = useState(FAULT_CATEGORIES[0]);
  const [severity, setSeverity] = useState('MAJOR'); // 'CRITICAL', 'MAJOR', 'MINOR'
  const [rawDescription, setRawDescription] = useState(
    'Traction motor 2 high temperature alarm on TCMS. Train automatically held at platform with emergency brake interlock. Speed restricted to 25 km/h. Standby relief requested at YPM.'
  );

  // Preset tab selector: 'BEMEL' or 'CRRC'
  const [activePresetTab, setActivePresetTab] = useState('BEMEL');

  // AI Output states
  const [aiEmailSummary, setAiEmailSummary] = useState('');
  const [aiEmailSubject, setAiEmailSubject] = useState('');
  const [aiShortMessage, setAiShortMessage] = useState('');
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [aiStatusMsg, setAiStatusMsg] = useState('');
  const [activeOutputTab, setActiveOutputTab] = useState('email'); // 'email' or 'short' or 'depot'

  // Audio Radio Speech Synthesis Simulator (Web Speech API)
  const [isPlayingTTS, setIsPlayingTTS] = useState(false);

  // Modal: Printable Incident Docket Sheet
  const [showPrintModal, setShowPrintModal] = useState(false);

  // Clipboard & UI feedback
  const [copiedEmail, setCopiedEmail] = useState(false);
  const [copiedShort, setCopiedShort] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  // Live Faults History
  const [faultReports, setFaultReports] = useState([]);
  const [filterFleet, setFilterFleet] = useState('ALL');
  const [filterRole, setFilterRole] = useState('ALL');
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [filterSeverity, setFilterSeverity] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Auto-detect Fleet Make (BEMEL vs CRRC) when trainId changes
  useEffect(() => {
    const cleanId = trainId.trim();
    if (CRRC_TRAIN_IDS.includes(cleanId) || cleanId.toUpperCase().includes('CRRC')) {
      setTrainMake('CRRC');
      setActivePresetTab('CRRC');
    } else if (cleanId) {
      setTrainMake('BEMEL');
      setActivePresetTab('BEMEL');
    }
  }, [trainId]);

  // Adjust subsystem list when trainMake changes
  useEffect(() => {
    const available = TRAIN_FLEET_TYPES[trainMake]?.subsystems || [];
    if (available.length > 0 && !available.includes(subsystem)) {
      setSubsystem(available[0]);
    }
  }, [trainMake]);

  // Auto-fill specific location when station or direction changes
  useEffect(() => {
    const station = GREEN_LINE_STATIONS.find(s => s.code === stationLocation);
    const stationName = station ? `${station.name} (${station.code})` : stationLocation;
    const dirLabel = direction === 'UP' ? 'UP Track (Northbound ➔ Madavara)' : 'DN Track (Southbound ➔ Silk Institute)';
    setSpecificLocation(`${stationName} - ${dirLabel}`);
  }, [stationLocation, direction]);

  // Real-time Firestore listener for fault reports
  useEffect(() => {
    const q = query(collection(db, 'fault_reports'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setFaultReports(items);
    }, (err) => {
      console.warn('Firestore fault_reports subscription fallback:', err);
    });
    return () => unsubscribe();
  }, []);

  // Quick preset narrative helper
  const handleApplyPreset = (preset) => {
    setRawDescription(preset.text);
    if (preset.cat) setFaultType(preset.cat);
    if (preset.sev) setSeverity(preset.sev);
    if (preset.subsystem) setSubsystem(preset.subsystem);
    if (preset.car) setAffectedCar(preset.car);
    if (preset.mode) setDrivingMode(preset.mode);
    if (preset.action) setOperationalAction(preset.action);
    if (preset.thirdRail) setThirdRailStatus(preset.thirdRail);
  };

  // Determine applicable Metro Rail 2020 General Rules citation
  const getGRCitation = (category, desc = '', act = '') => {
    const combined = `${category} ${desc} ${act}`.toLowerCase();
    if (combined.includes('7.02') || combined.includes('cab signal') || combined.includes('atp') || combined.includes('ato') || combined.includes('restricted manual') || combined.includes('rm mode')) {
      return 'GR Rule 7.02 (Operation of Trains with Cab Signalling / ATP Inoperative in RM Mode <= 25 km/h)';
    }
    if (combined.includes('8.08') || combined.includes('third rail') || combined.includes('hscb') || combined.includes('ccsd') || combined.includes('traction power block') || combined.includes('voltage dip')) {
      return 'GR Rule 8.08 (Traction Power Supply Interruption & 750V DC Third Rail Isolation / Power Block)';
    }
    if (combined.includes('10.05') || combined.includes('door') || combined.includes('interlock') || combined.includes('sensitive edge') || combined.includes('dic')) {
      return 'GR Rule 10.05 (Passenger Train Door Defects, Isolation by By-Pass Switch & Locking)';
    }
    if (combined.includes('11.04') || combined.includes('push-out') || combined.includes('coupled') || combined.includes('rescue train') || combined.includes('disabled train')) {
      return 'GR Rule 11.04 (Assistance to Disabled Trains, Push-Out Movement & Coupling Protocol)';
    }
    if (combined.includes('12.01') || combined.includes('detrainment') || combined.includes('evacuation') || combined.includes('pad') || combined.includes('medical')) {
      return 'GR Rule 12.01 (Detrainment & Passenger Evacuation under Station Controller Supervision)';
    }
    if (combined.includes('4.15') || combined.includes('depot') || combined.includes('shunting') || combined.includes('siding') || combined.includes('peenya yard')) {
      return 'GR Rule 4.15 (Movement of Trains within Peenya Depot Limits & Siding Reception Lines)';
    }
    if (combined.includes('9.04') || combined.includes('emergency brake') || combined.includes('unscheduled stop') || combined.includes('held at platform')) {
      return 'GR Rule 9.04 (Unscheduled Train Stops, Emergency Brake (EB) Application & OCC Notification)';
    }
    return 'GR Rule 13.02 (Reporting of Mainline Operational Occurrences & Unusual Incidents)';
  };

  // Generate deterministic local fallback summary in strict compliance with Metro Rail 2020 General Rules
  const generateDeterministicSummary = () => {
    const fullLocation = `${specificLocation} [${direction} Line]`;
    const timestamp = new Date().toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
    const grCitation = getGRCitation(faultType, rawDescription, operationalAction);
    const incidentRef = `BMRCL-L2-GR2020-${Date.now().toString().slice(-6)}`;

    const subject = `[BMRCL GR-2020 INCIDENT DOCKET] ${severity} | Tr ${trainId} (${trainMake} 6-Car) | ${direction} Line @ ${stationLocation} | ${grCitation.split('(')[0].trim()}`;

    const email = `======================================================================
BANGALORE METRO RAIL CORPORATION LIMITED • PEENYA DEPOT (LINE 2)
OPERATIONAL INCIDENT DOCKET & FAULT REPORT (METRO RAIL GR-2020)
======================================================================
INCIDENT REFERENCE : ${incidentRef}
DATE & TIMESTAMP   : ${timestamp}
SEVERITY RATING    : ${severity}
STATUTORY BASE     : Metro Railways General Rules, 2020 (GR 2020)
RELEVANT GR RULE   : ${grCitation}
----------------------------------------------------------------------
1. ROLLING STOCK IDENTIFICATION & TELEMETRY
• Train ID / Rake  : Train #${trainId} (${trainMake} 6-Car Revenue Rake)
• Car Configuration: ${TRAIN_FLEET_TYPES[trainMake]?.composition || '6-Car'}
• Specific Unit    : ${affectedCar}
• Subsystem In Fault: ${subsystem}
• Driving Mode     : ${drivingMode}
----------------------------------------------------------------------
2. TRACTION POWER & TRACK INFRASTRUCTURE (BMRCL 750V DC THIRD RAIL)
• Traction System  : 750V DC Bottom-Contact Third Rail System (NO OHE)
• Third Rail State : ${thirdRailStatus}
• Current Collection: Current Collector Shoe Device (CCSD)
• Line & Direction : ${direction === 'UP' ? 'UP LINE (Northbound ➔ Madavara/BIET)' : 'DN LINE (Southbound ➔ Silk Institute/APTS)'}
• Primary Location : ${stationLocation} (${GREEN_LINE_STATIONS.find(s => s.code === stationLocation)?.name || stationLocation})
• Exact Chainage/Loc: ${fullLocation}
----------------------------------------------------------------------
3. REPORTING OFFICER & DESPATCH ORIGIN
• Reporting Channel: ${reporterRole} (Peenya Industry Depot Crew Control)
• Officer Name     : ${reporterName}
• Employee Code    : ${reporterId}
----------------------------------------------------------------------
4. FAULT CLASSIFICATION & TECHNICAL NARRATIVE
• Incident Category: ${faultType}
• Subsystem Analysis & Symptoms:
  ${rawDescription}
----------------------------------------------------------------------
5. MANDATORY OPERATIONAL ACTIONS (PER METRO RAIL GR-2020)
• Immediate Action : ${operationalAction}
• Line Directives  :
  1. OCC Train Controller (TC) instructed for headway regulation & headway buffer spacing.
  2. Traction Power Controller (TPC) monitoring 750V DC TSS feeder telemetry.
  3. Rolling Stock Traction Controller (RSTC) advised for Peenya Depot workshop reception.
  4. Station Controllers (SC) on upstream stations briefed on passenger crowd management.
======================================================================
Peenya Industry Depot Crew Control System (PYIDCC) • BMRCL Line 2`;

    // Radio Short Message <= 190 characters
    const shortRuleTag = grCitation.split('(')[0].replace('GR Rule ', 'R').trim();
    const shortDesc = rawDescription.length > 70 ? rawDescription.slice(0, 67) + '...' : rawDescription;
    const shortMsg = `🚨 BMRCL FLASH | GR-2020 | Tr:${trainId} [${trainMake}] | Loc:${stationLocation} [${direction}] | Mode:${drivingMode.split(' ')[0]} | 3rdRail:750V | ${shortDesc} | ${shortRuleTag} | Act:${operationalAction.split('(')[0].trim()}`;

    return { subject, email, shortMsg, incidentRef, grCitation };
  };

  // AI Summarization invocation with Metro Rail 2020 General Rules and 750V DC Third Rail constraints
  const handleGenerateAISummary = async () => {
    if (!trainId.trim() || !rawDescription.trim()) {
      alert('Please provide Train ID and a description of the fault.');
      return;
    }

    setIsSummarizing(true);
    setAiStatusMsg('Synthesizing report under Metro Rail 2020 General Rules…');

    const effectiveKey = (localStorage.getItem('custom_gemini_api_key') || import.meta.env.VITE_GEMINI_API_KEY || '').trim();
    const grCitation = getGRCitation(faultType, rawDescription, operationalAction);

    const promptText = `
You are the Chief Railway Safety Officer & Operational Dispatcher for Bangalore Metro Rail Corporation Limited (BMRCL) Line 2 (Green Line).
Your job is to synthesize an official operational fault docket in strict compliance with the METRO RAILWAYS GENERAL RULES, 2020 (GR 2020).

CRITICAL INFRASTRUCTURE RULES FOR BMRCL LINE 2:
1. TRACTION POWER: BMRCL Line 2 strictly uses 750V DC Bottom-Contact Third Rail and Current Collector Shoe Devices (CCSD).
2. ABSOLUTE FORBIDDEN TERMS: NEVER use "OHE", "Overhead Equipment", "Pantograph", or "25kV AC". If mentioned anywhere, replace immediately with 750V DC Third Rail, Current Collector Shoe Device (CCSD), or Traction Substation (TSS) HSCB breakers.
3. ROLLING STOCK FLEETS: BMRCL Line 2 operates BEMEL 6-Car rakes and CRRC 6-Car rakes.
   - BEMEL trains feature Mitsubishi TCMS, 2-Level IGBT VVVF, Knorr-Bremse BECU, SIV 415V AC, Faiveley door microswitches.
   - CRRC trains feature CRRC Zhuzhou ETB/MVB TCMS, Permanent Magnet Synchronous Motors (PMSM), EPAC microprocessor brake, Electric Door System (EDS) with sensitive edge, Active Obstacle Detection System (ODS).
4. METRO RAIL 2020 GENERAL RULES (GR 2020) CITATIONS:
   - Rule 7.02: Cab Signalling / ATP / ATO failure -> Train movement in RM (Restricted Manual) mode not exceeding 25 km/h on authority of OCC.
   - Rule 8.08: 750V DC Third Rail tripping / Voltage dip / Traction Power Block required.
   - Rule 9.04: Unscheduled train stop, Emergency Brake (EB) trip, Train held at platform.
   - Rule 10.05: Train door defect, isolation via by-pass switch, sealing and locking.
   - Rule 11.04: Assistance to disabled trains, push-out coupling protocol, Peenya Depot transfer.
   - Rule 12.01: Passenger detrainment / evacuation at platform under station staff supervision.
   - Rule 4.15: Peenya Depot reception siding movements and shunting.

INPUT PARAMETERS:
- Train ID: ${trainId}
- Train Make: ${trainMake} 6-Car (${TRAIN_FLEET_TYPES[trainMake]?.composition})
- Affected Car: ${affectedCar}
- Subsystem In Fault: ${subsystem}
- Driving Mode at Fault: ${drivingMode}
- 750V DC Third Rail Status: ${thirdRailStatus}
- Action Taken (GR 2020): ${operationalAction}
- Track Direction: ${direction === 'UP' ? 'UP Line (Northbound towards Madavara/BIET)' : 'DN Line (Southbound towards Silk Institute/APTS)'}
- Location: ${specificLocation} (${stationLocation} Station)
- Fault Category: ${faultType}
- Severity Level: ${severity}
- Primary GR 2020 Citation: ${grCitation}
- Raw Fault Narrative: "${rawDescription}"
- Reporting Officer: ${reporterRole} (${reporterName}, ID: ${reporterId})

OUTPUT FORMAT REQUIREMENTS:
Output strictly valid JSON with no markdown wrapping or preamble:
{
  "emailSubject": "[BMRCL GR-2020 INCIDENT DOCKET] <Severity> | Tr <TrainId> (<Make> 6-Car) | <Direction> Line @ <Station> | <GR Rule Citation>",
  "emailBody": "<A highly structured, formal operational incident report docket incorporating Metro Rail GR 2020 rule citations, 750V DC Third Rail telemetry, BEMEL/CRRC subsystem diagnostic breakdown, OCC/TPC directives, and Peenya Depot workshop reception plan>",
  "shortMessage": "🚨 BMRCL FLASH | GR-2020 | Tr:<TrainId> [<Make>] | Loc:<Station> [<UP/DN>] | Mode:<Mode> | 3rdRail:750V | <Brief Fault <=70 chars> | <GR Rule> | Act:<Action Taken>"
}

Ensure "shortMessage" is concise (under 190 characters) suitable for VHF radio broadcast and SMS dispatch.
`;

    let generated = null;

    if (effectiveKey) {
      for (const modelName of MODEL_CHAIN) {
        try {
          setAiStatusMsg(`Compiling via ${modelName}…`);
          const genAI = new GoogleGenerativeAI(effectiveKey);
          const model = genAI.getGenerativeModel({ model: modelName });
          const result = await model.generateContent(promptText);
          const text = result.response.text();
          
          // Extract JSON
          const jsonMatch = text.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            if (parsed.emailBody && parsed.shortMessage) {
              // Sanitize output in case any forbidden word slipped through
              let sanitizedEmail = parsed.emailBody.replace(/\bOHE\b/g, '750V DC Third Rail').replace(/pantograph/gi, 'CCSD Shoegear');
              let sanitizedShort = parsed.shortMessage.replace(/\bOHE\b/g, '3rdRail').replace(/pantograph/gi, 'CCSD');
              generated = {
                emailSubject: parsed.emailSubject.replace(/\bOHE\b/g, '750V DC Third Rail'),
                emailBody: sanitizedEmail,
                shortMessage: sanitizedShort
              };
              break;
            }
          }
        } catch (err) {
          console.warn(`Model ${modelName} fallback:`, err);
        }
      }
    }

    // Try Local Agent Autocomplete server if Gemini key missing or failed
    if (!generated) {
      try {
        setAiStatusMsg('Checking Local GR-2020 Autocomplete Router (http://localhost:5050)…');
        const localResp = await fetch('http://localhost:5050/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: promptText, max_tokens: 800 }),
          signal: AbortSignal.timeout(3000)
        });
        if (localResp.ok) {
          const localData = await localResp.json();
          const jsonMatch = (localData.completion || localData.text || '').match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            if (parsed.emailBody && parsed.shortMessage) {
              generated = parsed;
            }
          }
        }
      } catch (localErr) {
        // Local router not active, proceed to deterministic engine
      }
    }

    // Fallback if AI key is missing or failed: BMRCL Standard Railway Protocol Engine
    if (!generated) {
      setAiStatusMsg('Generated via BMRCL Line 2 GR-2020 Deterministic Engine.');
      const local = generateDeterministicSummary();
      setAiEmailSubject(local.subject);
      setAiEmailSummary(local.email);
      setAiShortMessage(local.shortMsg);
    } else {
      setAiEmailSubject(generated.emailSubject);
      setAiEmailSummary(generated.emailBody);
      setAiShortMessage(generated.shortMessage);
      setAiStatusMsg('AI Incident Docket Generated Successfully (Metro Rail GR 2020 Compliant).');
    }

    setIsSummarizing(false);
  };

  // VHF Radio Broadcast Audio Simulator (Web Speech API + Radio Chime)
  const handleToggleRadioTTS = () => {
    if (isPlayingTTS) {
      if (window.speechSynthesis) window.speechSynthesis.cancel();
      setIsPlayingTTS(false);
      return;
    }

    const textToSpeak = aiShortMessage || generateDeterministicSummary().shortMsg;
    if (!textToSpeak) return;

    if (!window.speechSynthesis) {
      alert('VHF Radio Voice Simulator: Speech Synthesis is not supported in this browser.');
      return;
    }

    // Play VHF Radio Alert Squelch / Chime using Web Audio API
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        const audioCtx = new AudioCtx();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, audioCtx.currentTime); // A5
        osc.frequency.setValueAtTime(1320, audioCtx.currentTime + 0.1); // E6
        gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.25);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.25);
      }
    } catch (e) {
      // AudioContext blocked or not allowed, continue with TTS
    }

    // Radio Voice Utterance
    const cleanSpeech = textToSpeak
      .replace(/🚨/g, 'Alert.')
      .replace(/Tr:/gi, 'Train ')
      .replace(/Loc:/gi, 'Location ')
      .replace(/3rdRail:/gi, 'Third rail ')
      .replace(/Act:/gi, 'Action ')
      .replace(/R7\.02/gi, 'Rule seven point zero two')
      .replace(/R8\.08/gi, 'Rule eight point zero eight')
      .replace(/R9\.04/gi, 'Rule nine point zero four')
      .replace(/R10\.05/gi, 'Rule ten point zero five')
      .replace(/R11\.04/gi, 'Rule eleven point zero four')
      .replace(/R12\.01/gi, 'Rule twelve point zero one');

    const utterance = new SpeechSynthesisUtterance(cleanSpeech);
    utterance.rate = 0.95; // Steady military/railway dispatch pace
    utterance.pitch = 0.9; // Lower radio frequency tone
    utterance.onstart = () => setIsPlayingTTS(true);
    utterance.onend = () => setIsPlayingTTS(false);
    utterance.onerror = () => setIsPlayingTTS(false);

    window.speechSynthesis.speak(utterance);
  };

  // Workshop Job Card Recommender computation for Peenya Depot
  const depotRecommendation = useMemo(() => {
    let pitLine = 'Pit Line 2 or 3 (Underfloor Lifting & Shoegear Overhaul Bay)';
    let section = 'Rolling Stock Mechanical (RSM)';
    let tag = 'YELLOW TAG - RESTRICTED (Withdraw at End of Peak)';

    const comb = `${faultType} ${subsystem} ${severity}`.toLowerCase();

    if (comb.includes('tcms') || comb.includes('signaling') || comb.includes('cbtc') || comb.includes('atp')) {
      pitLine = 'Pit Line 5 (Electronics, ETB/MVB & S&T Test Track)';
      section = 'Signaling & Telecommunications (S&T) / TCMS Wing';
    } else if (comb.includes('brake') || comb.includes('becu') || comb.includes('epac') || comb.includes('pneumatic')) {
      pitLine = 'Pit Line 4 (Pneumatic Test Bench & Brake Weigh-Well)';
      section = 'Rolling Stock Pneumatic / Brake Systems (RSP)';
    } else if (comb.includes('traction') || comb.includes('vvvf') || comb.includes('pmsm') || comb.includes('siv') || comb.includes('inverter')) {
      pitLine = 'Pit Line 6 (Heavy Inverter & Substation Shore-Supply)';
      section = 'Rolling Stock Electrical (RSE) - Power Electronics';
    } else if (comb.includes('third rail') || comb.includes('ccsd') || comb.includes('shoegear')) {
      pitLine = 'Pit Line 1 or 2 (750V DC Current Collector Shoe Inspection Pit)';
      section = 'Traction Power Distribution (TPD) & Bogie Undergear';
    }

    if (severity === 'CRITICAL') {
      tag = 'RED TAG - QUARANTINE (Immediate Mainline Withdrawal to Peenya Depot Upon Detrainment)';
    } else if (severity === 'MINOR') {
      tag = 'BLUE TAG - ADVISORY (Pit Inspection Scheduled at Night Stabling in Peenya Yard)';
    }

    return {
      depot: 'Peenya Industry Depot (PYID) - Workshop & Yard',
      pitLine,
      section,
      tag,
      inspectionProtocol: trainMake === 'CRRC' 
        ? 'CRRC Zhuzhou Telemetry Diagnostic Download & ETB Network Bus Scan'
        : 'Mitsubishi TCMS Event Memory Dump & 750V DC High-Potential Test'
    };
  }, [faultType, subsystem, severity, trainMake]);

  // Copy Email to clipboard
  const handleCopyEmail = () => {
    const fullContent = `Subject: ${aiEmailSubject}\n\n${aiEmailSummary}`;
    navigator.clipboard.writeText(fullContent);
    setCopiedEmail(true);
    setTimeout(() => setCopiedEmail(false), 2500);
  };

  // Copy Short message to clipboard
  const handleCopyShortMessage = () => {
    navigator.clipboard.writeText(aiShortMessage);
    setCopiedShort(true);
    setTimeout(() => setCopiedShort(false), 2500);
  };

  // Launch mailto client
  const handleLaunchEmail = () => {
    const defaultRecipient = 'occ.line2@bmrcl.co.in, cc.peenya@bmrcl.co.in, rstc.line2@bmrcl.co.in';
    const mailtoUrl = `mailto:${encodeURIComponent(defaultRecipient)}?subject=${encodeURIComponent(aiEmailSubject)}&body=${encodeURIComponent(aiEmailSummary)}`;
    window.open(mailtoUrl, '_blank');
  };

  // Share to WhatsApp
  const handleShareWhatsApp = () => {
    const whatsappUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(aiShortMessage)}`;
    window.open(whatsappUrl, '_blank');
  };

  // Save to Firestore and Log across system collections
  const handleSaveAndBroadcast = async () => {
    if (!aiEmailSummary || !aiShortMessage) {
      alert('Please click "GENERATE AI FAULT SUMMARY" first before logging.');
      return;
    }

    setIsSubmitting(true);
    try {
      const record = {
        trainId: trainId.trim(),
        trainMake: trainMake,
        affectedCar: affectedCar,
        subsystem: subsystem,
        drivingMode: drivingMode,
        thirdRailStatus: thirdRailStatus,
        operationalAction: operationalAction,
        direction: direction,
        stationLocation: stationLocation,
        specificLocation: specificLocation,
        faultType: faultType,
        severity: severity,
        grCitation: getGRCitation(faultType, rawDescription, operationalAction),
        rawDescription: rawDescription,
        reporterRole: reporterRole,
        reporterName: reporterName,
        reporterId: reporterId,
        emailSubject: aiEmailSubject,
        emailSummary: aiEmailSummary,
        shortMessage: aiShortMessage,
        depotRecommendation: depotRecommendation,
        status: 'OPEN', // OPEN, IN_PROGRESS, RESOLVED
        createdAt: serverTimestamp(),
        timestampStr: new Date().toISOString()
      };

      // 1. Primary ledger
      await addDoc(collection(db, 'fault_reports'), record);

      // 2. OCC Live Incident stream
      await addDoc(collection(db, 'live_incidents'), {
        trainId: trainId.trim(),
        stationLocation: stationLocation,
        direction: direction,
        reason: `${faultType} (${severity}) [${trainMake}] - Reported by ${reporterRole}`,
        description: aiShortMessage,
        delayMins: severity === 'CRITICAL' ? 15 : severity === 'MAJOR' ? 8 : 3,
        status: 'OPEN',
        reportedBy: `${reporterRole} - ${reporterName}`,
        createdAt: serverTimestamp()
      });

      // 3. WTT Line 2 Tracker integration
      await addDoc(collection(db, 'wtt_live_incidents'), {
        trainId: String(trainId.trim()),
        delayMins: severity === 'CRITICAL' ? 15 : severity === 'MAJOR' ? 8 : 3,
        reason: `${severity} | Tr #${trainId} (${trainMake}) | ${faultType.split('(')[0].trim()}`,
        scheduleType: 'NORMAL',
        timestamp: serverTimestamp()
      });

      // 4. Peenya Depot Workshop Defect Work-Order integration
      await addDoc(collection(db, 'rolling_stock_faults'), {
        trainId: trainId.trim(),
        trainMake: trainMake,
        subsystem: subsystem,
        affectedCar: affectedCar,
        description: `${severity}: ${rawDescription} | Rec: ${depotRecommendation.pitLine}`,
        severity: severity,
        status: 'OPEN',
        depotLocation: 'Peenya Industry Depot (PYID)',
        timestamp: serverTimestamp()
      });

      setSubmitSuccess(true);
      setTimeout(() => setSubmitSuccess(false), 4000);
    } catch (err) {
      console.error('Error logging fault report:', err);
      alert('Failed to log report: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Resolve fault in table
  const handleUpdateStatus = async (id, newStatus) => {
    try {
      await updateDoc(doc(db, 'fault_reports', id), {
        status: newStatus,
        updatedAt: serverTimestamp()
      });
    } catch (err) {
      console.error('Failed to update status:', err);
    }
  };

  // Filtered reports
  const filteredReports = useMemo(() => {
    return faultReports.filter(r => {
      if (filterFleet !== 'ALL' && (r.trainMake || 'BEMEL') !== filterFleet) return false;
      if (filterRole !== 'ALL' && r.reporterRole !== filterRole) return false;
      if (filterStatus !== 'ALL' && r.status !== filterStatus) return false;
      if (filterSeverity !== 'ALL' && r.severity !== filterSeverity) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesTrain = String(r.trainId || '').toLowerCase().includes(q);
        const matchesMake = String(r.trainMake || '').toLowerCase().includes(q);
        const matchesLoc = String(r.stationLocation || '').toLowerCase().includes(q);
        const matchesType = String(r.faultType || '').toLowerCase().includes(q);
        const matchesRule = String(r.grCitation || '').toLowerCase().includes(q);
        const matchesDesc = String(r.rawDescription || '').toLowerCase().includes(q);
        return matchesTrain || matchesMake || matchesLoc || matchesType || matchesRule || matchesDesc;
      }
      return true;
    });
  }, [faultReports, filterFleet, filterRole, filterStatus, filterSeverity, searchQuery]);

  // BEMEL Specific Presets
  const bemelPresets = [
    {
      label: 'BECU Holding Brake Binding',
      text: 'BEMEL 6-Car Rake: BECU reported holding brake not released alarm in Car 3 (MC1). Train held at platform with emergency brake application under GR Rule 9.04. Brake cylinder pressure vented manually; standby relief operator requested at YPM.',
      cat: FAULT_CATEGORIES[0],
      sev: 'CRITICAL',
      subsystem: 'Knorr-Bremse BECU (Brake Electronic Control Unit & Holding Brake)',
      car: 'Car 3 - MC1 (Motor Car 1 with CCSD)',
      mode: 'ATP (Automatic Train Protection / Coded Manual)',
      action: 'Train Held at Platform under OCC Timetable Regulation (GR Rule 9.04)',
      thirdRail: THIRD_RAIL_STATUSES[0]
    },
    {
      label: 'VVVF Line Breaker LB1 Trip',
      text: 'BEMEL 6-Car Rake: Line breaker LB1 tripped in DMC1 due to inverter overcurrent. Operating on 50% traction effort (MC1-MC2 only). Schedule regulation required; train authorized to proceed to Peenya Depot siding at reduced acceleration.',
      cat: FAULT_CATEGORIES[0],
      sev: 'MAJOR',
      subsystem: 'VVVF Traction Inverter (2-Level IGBT, Line Breakers LB1/LB2)',
      car: 'Car 1 - DMC1 (Driving Motor Car - North)',
      mode: 'ATP (Automatic Train Protection / Coded Manual)',
      action: 'Authorized Movement in RM Mode <= 25 km/h with OCC Concurrence (GR Rule 7.02)',
      thirdRail: THIRD_RAIL_STATUSES[0]
    },
    {
      label: 'Door Microswitch Loop Open',
      text: 'BEMEL 6-Car Rake: Door 4 in Car 4 (MC2) microswitch interlock failed to prove closed. Traction interlock not made. Door isolated using Door Isolation Cock (DIC) and locked out under GR Rule 10.05 with station controller authorization.',
      cat: FAULT_CATEGORIES[4],
      sev: 'MAJOR',
      subsystem: 'Door Interlock System (Faiveley/Nabtesco Microswitch Loop)',
      car: 'Car 4 - MC2 (Motor Car 2 with CCSD)',
      mode: 'ATO (Automatic Train Operation)',
      action: 'Defective Passenger Door Isolated and Locked Out of Service (GR Rule 10.05)',
      thirdRail: THIRD_RAIL_STATUSES[0]
    },
    {
      label: 'SIV Inverter Under-Voltage',
      text: 'BEMEL 6-Car Rake: Static Inverter (SIV) auxiliary inverter tripped on under-voltage. Saloon emergency ventilation activated. 415V AC bus-tie reset attempted. Standby inspection scheduled at Peenya Depot.',
      cat: FAULT_CATEGORIES[0],
      sev: 'MINOR',
      subsystem: 'Static Inverter SIV 415V AC (Auxiliary Power & Saloon HVAC)',
      car: 'Car 2 - TC1 (Trailer Car 1)',
      mode: 'ATO (Automatic Train Operation)',
      action: 'Train Withdrawn to Peenya Depot Reception Line (GR Rule 4.15)',
      thirdRail: THIRD_RAIL_STATUSES[1]
    },
    {
      label: '750V DC CCSD Shoe Flashover',
      text: 'BEMEL 6-Car Rake: Severe arcing and flashover at bottom-contact Current Collector Shoe Device (CCSD) on MC1 bogie. 750V DC third rail feeder HSCB tripped at TSS. TPC notified under GR Rule 8.08 for traction power verification.',
      cat: FAULT_CATEGORIES[2],
      sev: 'CRITICAL',
      subsystem: '750V DC Current Collector Shoe Device (Pneumatic CCSD)',
      car: 'Car 3 - MC1 (Motor Car 1 with CCSD)',
      mode: 'RM (Restricted Manual <= 25 km/h per GR Rule 7.02)',
      action: 'Traction Power Block Requested with TPC (GR Rule 8.08)',
      thirdRail: THIRD_RAIL_STATUSES[4]
    },
    {
      label: 'ATP Cab Signal Target Loss',
      text: 'BEMEL 6-Car Rake: Cab display unit lost ATP target speed codes at approach signal. Train automatically tripped with penalty emergency brake. Proceeding in Restricted Manual (RM) mode at <= 25 km/h under OCC authority as per GR Rule 7.02.',
      cat: FAULT_CATEGORIES[1],
      sev: 'CRITICAL',
      subsystem: 'Mitsubishi / BEMEL TCMS (Central Processing Unit & DDU)',
      car: 'Car 1 - DMC1 (Driving Motor Car - North)',
      mode: 'RM (Restricted Manual <= 25 km/h per GR Rule 7.02)',
      action: 'Authorized Movement in RM Mode <= 25 km/h with OCC Concurrence (GR Rule 7.02)',
      thirdRail: THIRD_RAIL_STATUSES[0]
    }
  ];

  // CRRC Specific Presets
  const crrcPresets = [
    {
      label: 'TCMS ETB Gateway Timeout',
      text: 'CRRC 6-Car Rake: Ethernet Train Bus (ETB) communication timeout between DMC and TC2 gateway node. CDU console flagged subsystem telemetry loss. TCMS re-boot performed at platform. Train running in ATP coded manual mode.',
      cat: FAULT_CATEGORIES[0],
      sev: 'MAJOR',
      subsystem: 'CRRC Zhuzhou TCMS (Ethernet Train Bus ETB / MVB Gateway & CDU)',
      car: 'Car 1 - DMC1 (Driving Motor Car - North)',
      mode: 'ATP (Automatic Train Protection / Coded Manual)',
      action: 'Authorized Movement in RM Mode <= 25 km/h with OCC Concurrence (GR Rule 7.02)',
      thirdRail: THIRD_RAIL_STATUSES[0]
    },
    {
      label: 'PMSM Inverter Phase Overheat',
      text: 'CRRC 6-Car Rake: Permanent Magnet Synchronous Motor (PMSM) inverter phase U sensor reported overheat warning (105°C) in MC1. Automatic thermal derating activated to 60% motor power. Timetable regulation notified to OCC.',
      cat: FAULT_CATEGORIES[0],
      sev: 'MAJOR',
      subsystem: 'PMSM / High-Efficiency VVVF Inverter (Phase Overheat Derating)',
      car: 'Car 3 - MC1 (Motor Car 1 with CCSD)',
      mode: 'ATP (Automatic Train Protection / Coded Manual)',
      action: 'Authorized Movement in RM Mode <= 25 km/h with OCC Concurrence (GR Rule 7.02)',
      thirdRail: THIRD_RAIL_STATUSES[0]
    },
    {
      label: 'EDS Sensitive Edge Re-Open Loop',
      text: 'CRRC 6-Car Rake: Electric Door System (EDS) sensitive edge obstacle detection in Car 2 (TC) triggered 3 consecutive obstacle re-cycles. Passenger clear verified by station staff; door leaf isolated via CAN-bus DCU under GR Rule 10.05.',
      cat: FAULT_CATEGORIES[4],
      sev: 'MAJOR',
      subsystem: 'Electric Door System (EDS with CAN-Bus DCU & Sensitive Edge)',
      car: 'Car 2 - TC1 (Trailer Car 1)',
      mode: 'ATO (Automatic Train Operation)',
      action: 'Defective Passenger Door Isolated and Locked Out of Service (GR Rule 10.05)',
      thirdRail: THIRD_RAIL_STATUSES[0]
    },
    {
      label: 'EPAC Pressure Transducer Drift',
      text: 'CRRC 6-Car Rake: EPAC brake controller flagged pressure transducer drift on secondary bogie. Holding brake test completed. OCC authorized movement to Madavara terminal for turnaround and Peenya Depot routing.',
      cat: FAULT_CATEGORIES[0],
      sev: 'MINOR',
      subsystem: 'EPAC Microprocessor Electro-Pneumatic Brake Controller',
      car: 'Car 4 - MC2 (Motor Car 2 with CCSD)',
      mode: 'ATP (Automatic Train Protection / Coded Manual)',
      action: 'Train Withdrawn to Peenya Depot Reception Line (GR Rule 4.15)',
      thirdRail: THIRD_RAIL_STATUSES[0]
    },
    {
      label: 'Active Track Obstacle (ODS) Trip',
      text: 'CRRC 6-Car Rake: Active Track Obstacle Detection System (ODS) deflector bar touched trackside debris on UP Line. Emergency brake tripped under GR Rule 9.04. Train Operator conducted visual cab inspection; track cleared, authorized in RM mode.',
      cat: FAULT_CATEGORIES[3],
      sev: 'CRITICAL',
      subsystem: 'Active Track Obstacle Detection System (ODS / Deflector Beam)',
      car: 'Car 1 - DMC1 (Driving Motor Car - North)',
      mode: 'RM (Restricted Manual <= 25 km/h per GR Rule 7.02)',
      action: 'Train Held at Platform under OCC Timetable Regulation (GR Rule 9.04)',
      thirdRail: THIRD_RAIL_STATUSES[0]
    },
    {
      label: '750V DC CCSD Thermal Warning',
      text: 'CRRC 6-Car Rake: High-temp sensor on 750V DC bottom-contact CCSD shoegear exceeded 85°C. Third rail voltage stabilized at 740V DC. TPC & RSTC alerted; train booked for pit road thermal camera scan at Peenya Depot.',
      cat: FAULT_CATEGORIES[2],
      sev: 'MAJOR',
      subsystem: 'High-Capacity 750V DC CCSD Shoegear with Thermal Sensors',
      car: 'Car 3 - MC1 (Motor Car 1 with CCSD)',
      mode: 'ATP (Automatic Train Protection / Coded Manual)',
      action: 'Traction Power Block Requested with TPC (GR Rule 8.08)',
      thirdRail: THIRD_RAIL_STATUSES[4]
    }
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-mono flex flex-col">
      {/* Top Header Banner */}
      <header className="bg-slate-900 border-b border-slate-800 px-4 py-3 sticky top-0 z-30 shadow-xl flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link 
            to="/" 
            className="bg-slate-800 hover:bg-slate-700 p-1.5 rounded-lg border border-slate-700 text-slate-300 hover:text-white transition flex items-center gap-1 text-xs"
            title="Return to Main Dashboard"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Dashboard</span>
          </Link>
          <div className="flex items-center gap-2">
            <span className="p-2 bg-rose-500/10 border border-rose-500/30 rounded-lg text-rose-400">
              <ShieldAlert className="h-5 w-5 animate-pulse" />
            </span>
            <div>
              <h1 className="text-base sm:text-lg font-black text-slate-100 flex items-center gap-2">
                BMRCL LINE 2 • AI FAULTS REPORTING DESK
                <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-2 py-0.5 rounded font-black tracking-wider uppercase">
                  METRO RAIL GR 2020
                </span>
                <span className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/40 px-2 py-0.5 rounded font-bold uppercase hidden md:inline">
                  750V DC THIRD RAIL ONLY
                </span>
              </h1>
              <p className="text-[11px] text-slate-400">
                Statutory General Rules 2020 Intake • CRRC & BEMEL Revenue Fleet Subsystems • 750V DC Bottom-Contact Shoegear
              </p>
            </div>
          </div>
        </div>

        {/* Global Stats Counter & Quick Actions */}
        <div className="flex items-center gap-2 text-xs">
          <button
            type="button"
            onClick={() => setShowPrintModal(true)}
            className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 px-3 py-1.5 rounded-lg flex items-center gap-1.5 text-xs font-bold transition cursor-pointer"
            title="View & Print Official Docket"
          >
            <Printer className="h-3.5 w-3.5 text-cyan-400" />
            <span className="hidden sm:inline">Official Docket Sheet</span>
          </button>

          <div className="bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-rose-500 animate-pulse"></span>
            <span className="text-slate-400">Open Incidents:</span>
            <span className="font-bold text-rose-400">{faultReports.filter(r => r.status === 'OPEN').length}</span>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 space-y-6">
        
        {/* STEP 1: REPORTER ROLE SELECTOR */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-xl">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-3 mb-4">
            <div>
              <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-widest">
                STEP 1: SELECT REPORTING DESIGNATION
              </span>
              <h2 className="text-sm font-bold text-white">Who is logging this incident?</h2>
            </div>

            {/* Role Pills */}
            <div className="flex items-center gap-2 bg-slate-950 p-1.5 rounded-lg border border-slate-800">
              {[
                { id: 'ALS', label: 'ALS (Assistant Line Supervisor)', color: 'border-purple-500 text-purple-300 bg-purple-950/40' },
                { id: 'CC', label: 'CC (Crew Controller - Peenya)', color: 'border-amber-500 text-amber-300 bg-amber-950/40' },
                { id: 'TRAIN OPERATOR', label: 'TRAIN OPERATOR (Line 2 Driver)', color: 'border-cyan-500 text-cyan-300 bg-cyan-950/40' }
              ].map(role => (
                <button
                  key={role.id}
                  type="button"
                  onClick={() => setReporterRole(role.id)}
                  className={`px-3 py-1.5 rounded text-xs font-bold transition border ${
                    reporterRole === role.id
                      ? `${role.color} shadow-lg ring-1 ring-emerald-400/30`
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {role.label}
                </button>
              ))}
            </div>
          </div>

          {/* Reporter Details Inputs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="aifaultreportingpage-fld-1" className="block text-[10px] text-slate-400 uppercase mb-1">Reporter Name</label>
              <input id="aifaultreportingpage-fld-1" name="aifaultreportingpage_fld_1"
                type="text"
                value={reporterName}
                onChange={(e) => setReporterName(e.target.value)}
                placeholder="Full Name"
                className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-xs text-white font-mono focus:border-emerald-500 focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="aifaultreportingpage-fld-3" className="block text-[10px] text-slate-400 uppercase mb-1">Employee ID / Designation</label>
              <input id="aifaultreportingpage-fld-3" name="aifaultreportingpage_fld_3"
                type="text"
                value={reporterId}
                onChange={(e) => setReporterId(e.target.value)}
                placeholder="PYID-EmpID"
                className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-xs text-white font-mono focus:border-emerald-500 focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* STEP 2 & STEP 3: MAIN DUAL-COLUMN WORKSPACE */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

          {/* Left Column: Form & Telemetry */}
          <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-2xl space-y-4">
            <div className="border-b border-slate-800 pb-2 flex justify-between items-center">
              <div>
                <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-widest">
                  STEP 2: MANDATORY FAULT PARAMETERS & ROLLING STOCK FLEET
                </span>
                <h3 className="text-sm font-bold text-slate-200">Incident Telemetry & Technical Details</h3>
              </div>
              <span className="text-[10px] text-rose-400 border border-rose-500/40 bg-rose-500/10 px-2 py-0.5 rounded font-bold uppercase flex items-center gap-1">
                <ShieldCheck className="h-3 w-3 text-emerald-400" />
                <span>Metro Rail GR-2020 Protocol</span>
              </span>
            </div>

            {/* Row 1: Train ID, Fleet Make Selector & Direction */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <div className="text-[11px] text-slate-300 font-bold mb-1 flex items-center gap-1">
                  <Train className="h-3.5 w-3.5 text-cyan-400" />
                  <span>Train ID (Required)</span>
                </div>
                <div className="flex gap-2">
                  <input id="aifaultreportingpage-input-5" name="aifaultreportingpage_input_5"
                    type="text"
                    value={trainId}
                    onChange={(e) => setTrainId(e.target.value)}
                    placeholder="e.g. 204 or 215"
                    className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-sm text-cyan-300 font-bold font-mono focus:border-cyan-500 focus:outline-none"
                  />
                  <select id="aifaultreportingpage-select-6" name="aifaultreportingpage_select_6"
                    value={trainId}
                    onChange={(e) => setTrainId(e.target.value)}
                    className="bg-slate-950 border border-slate-700 rounded px-2 text-xs text-slate-400 font-mono cursor-pointer"
                    title="Quick pick Green Line train"
                  >
                    <option value="">Quick Pick</option>
                    {SAMPLE_TRAIN_IDS.map(id => (
                      <option key={id} value={id}>
                        Train #{id} {CRRC_TRAIN_IDS.includes(id) ? '[CRRC]' : '[BEMEL]'}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Fleet Make Toggle: BEMEL vs CRRC */}
              <div>
                <div className="text-[11px] text-slate-300 font-bold mb-1 flex items-center gap-1">
                  <Layers className="h-3.5 w-3.5 text-purple-400" />
                  <span>Rolling Stock Fleet Make</span>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setTrainMake('BEMEL');
                      setActivePresetTab('BEMEL');
                    }}
                    className={`py-2 px-2 rounded font-bold text-xs transition border flex flex-col items-center justify-center ${
                      trainMake === 'BEMEL'
                        ? 'bg-purple-600/20 text-purple-300 border-purple-500 ring-1 ring-purple-400/40 shadow-sm'
                        : 'bg-slate-950 text-slate-500 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <span className="text-[11px] font-black">BEMEL 6-Car</span>
                    <span className="text-[9px] opacity-75">Standard Fleet</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setTrainMake('CRRC');
                      setActivePresetTab('CRRC');
                    }}
                    className={`py-2 px-2 rounded font-bold text-xs transition border flex flex-col items-center justify-center ${
                      trainMake === 'CRRC'
                        ? 'bg-cyan-600/20 text-cyan-300 border-cyan-500 ring-1 ring-cyan-400/40 shadow-sm'
                        : 'bg-slate-950 text-slate-500 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <span className="text-[11px] font-black">CRRC 6-Car</span>
                    <span className="text-[9px] opacity-75">CBTC Series</span>
                  </button>
                </div>
              </div>

              {/* Track Direction */}
              <div>
                <div className="text-[11px] text-slate-300 font-bold mb-1 flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5 text-amber-400" />
                  <span>Direction (UP / DN)</span>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setDirection('UP')}
                    className={`py-2 px-2 rounded font-bold text-xs transition border flex flex-col items-center justify-center ${
                      direction === 'UP'
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500 shadow-md ring-1 ring-amber-400/30'
                        : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <span>▲ UP LINE</span>
                    <span className="text-[9px] opacity-75">(Madavara)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDirection('DN')}
                    className={`py-2 px-2 rounded font-bold text-xs transition border flex flex-col items-center justify-center ${
                      direction === 'DN'
                        ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500 shadow-md ring-1 ring-cyan-400/30'
                        : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <span>▼ DN LINE</span>
                    <span className="text-[9px] opacity-75">(Silk Inst.)</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Row 2: Location Selector & Specific Section */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="aifaultreportingpage-fld-7" className="block text-[11px] text-slate-300 font-bold mb-1">
                  Primary Station Location
                </label>
                <select id="aifaultreportingpage-fld-7" name="aifaultreportingpage_fld_7"
                  value={stationLocation}
                  onChange={(e) => setStationLocation(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-xs text-white font-mono focus:border-emerald-500 focus:outline-none"
                >
                  <option value="PYID">PEENYA DEPOT (PYID Hub)</option>
                  {GREEN_LINE_STATIONS.map(st => (
                    <option key={st.code} value={st.code}>
                      {st.code} - {st.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="aifaultreportingpage-fld-9" className="block text-[11px] text-slate-300 font-bold mb-1">
                  Specific Location (Section / Platform / Chainage)
                </label>
                <input id="aifaultreportingpage-fld-9" name="aifaultreportingpage_fld_9"
                  type="text"
                  value={specificLocation}
                  onChange={(e) => setSpecificLocation(e.target.value)}
                  placeholder="e.g. Platform 2 or Between KVPR and SPRU"
                  className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-xs text-slate-200 font-mono focus:border-emerald-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Row 3: Affected Car & Subsystem Specific to Fleet */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="aifaultreportingpage-fld-car" className="block text-[11px] text-slate-300 font-bold mb-1 flex items-center gap-1">
                  <Train className="h-3 w-3 text-emerald-400" />
                  <span>Specific Affected Car Unit</span>
                </label>
                <select id="aifaultreportingpage-fld-car" name="aifaultreportingpage_fld_car"
                  value={affectedCar}
                  onChange={(e) => setAffectedCar(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-xs text-white font-mono focus:border-emerald-500 focus:outline-none"
                >
                  {CAR_OPTIONS.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="aifaultreportingpage-fld-subsystem" className="block text-[11px] text-slate-300 font-bold mb-1 flex items-center gap-1">
                  <Cpu className="h-3 w-3 text-cyan-400" />
                  <span>{trainMake} Specific Subsystem</span>
                </label>
                <select id="aifaultreportingpage-fld-subsystem" name="aifaultreportingpage_fld_subsystem"
                  value={subsystem}
                  onChange={(e) => setSubsystem(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-xs text-white font-mono focus:border-emerald-500 focus:outline-none"
                >
                  {(TRAIN_FLEET_TYPES[trainMake]?.subsystems || []).map(sub => (
                    <option key={sub} value={sub}>{sub}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Row 4: Driving Mode, 750V DC Third Rail State & Severity */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label htmlFor="aifaultreportingpage-fld-mode" className="block text-[11px] text-slate-300 font-bold mb-1">
                  Driving Mode at Fault
                </label>
                <select id="aifaultreportingpage-fld-mode" name="aifaultreportingpage_fld_mode"
                  value={drivingMode}
                  onChange={(e) => setDrivingMode(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-xs text-white font-mono focus:border-emerald-500 focus:outline-none"
                >
                  {DRIVING_MODES.map(mode => (
                    <option key={mode} value={mode}>{mode}</option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="aifaultreportingpage-fld-thirdrail" className="block text-[11px] text-slate-300 font-bold mb-1 flex items-center gap-1">
                  <Zap className="h-3 w-3 text-amber-400" />
                  <span>750V DC Third Rail Status</span>
                </label>
                <select id="aifaultreportingpage-fld-thirdrail" name="aifaultreportingpage_fld_thirdrail"
                  value={thirdRailStatus}
                  onChange={(e) => setThirdRailStatus(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-xs text-white font-mono focus:border-emerald-500 focus:outline-none"
                >
                  {THIRD_RAIL_STATUSES.map(tr => (
                    <option key={tr} value={tr}>{tr}</option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="aifaultreportingpage-fld-13" className="block text-[11px] text-slate-300 font-bold mb-1">
                  Severity Rating
                </label>
                <select id="aifaultreportingpage-fld-13" name="aifaultreportingpage_fld_13"
                  value={severity}
                  onChange={(e) => setSeverity(e.target.value)}
                  className={`w-full bg-slate-950 border rounded p-2 text-xs font-bold font-mono focus:outline-none ${
                    severity === 'CRITICAL'
                      ? 'border-rose-500 text-rose-400'
                      : severity === 'MAJOR'
                        ? 'border-amber-500 text-amber-400'
                        : 'border-emerald-500 text-emerald-400'
                  }`}
                >
                  <option value="CRITICAL">CRITICAL (Service Halted / EB Trip)</option>
                  <option value="MAJOR">MAJOR (Caution / Delay / RM 25km/h)</option>
                  <option value="MINOR">MINOR (Advisory / Normal Running)</option>
                </select>
              </div>
            </div>

            {/* Row 5: Fault Category & Metro Rail 2020 Action Taken */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="aifaultreportingpage-fld-11" className="block text-[11px] text-slate-300 font-bold mb-1">
                  Fault / Occurrence Classification
                </label>
                <select id="aifaultreportingpage-fld-11" name="aifaultreportingpage_fld_11"
                  value={faultType}
                  onChange={(e) => setFaultType(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-xs text-white font-mono focus:border-emerald-500 focus:outline-none"
                >
                  {FAULT_CATEGORIES.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="aifaultreportingpage-fld-action" className="block text-[11px] text-slate-300 font-bold mb-1 flex items-center gap-1">
                  <ShieldCheck className="h-3 w-3 text-emerald-400" />
                  <span>Metro Rail GR 2020 Action Taken</span>
                </label>
                <select id="aifaultreportingpage-fld-action" name="aifaultreportingpage_fld_action"
                  value={operationalAction}
                  onChange={(e) => setOperationalAction(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-xs text-emerald-300 font-mono focus:border-emerald-500 focus:outline-none"
                >
                  {GR_ACTIONS_TAKEN.map(act => (
                    <option key={act} value={act}>{act}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Row 6: Raw Description Text Area */}
            <div>
              <div className="flex justify-between items-center mb-1">
                <div className="text-[11px] text-slate-300 font-bold flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5 text-slate-400" />
                  <span>Technical Description & Fault Narrative</span>
                </div>
                <span className="text-[10px] text-slate-500">
                  {rawDescription.length} characters
                </span>
              </div>
              <textarea id="aifaultreportingpage-textarea-15" name="aifaultreportingpage_textarea_15"
                rows={4}
                value={rawDescription}
                onChange={(e) => setRawDescription(e.target.value)}
                placeholder="Enter technical alarms on TCMS/DDU, speed restrictions, brake status, 750V DC third rail conditions, and operational actions taken per Metro Rail GR 2020..."
                className="w-full bg-slate-950 border border-slate-700 rounded p-2.5 text-xs text-slate-200 font-mono focus:border-emerald-500 focus:outline-none resize-y"
              />
            </div>

            {/* Quick Presets by Rolling Stock Make */}
            <div className="bg-slate-950/80 p-3 rounded-lg border border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-slate-400 uppercase tracking-widest font-bold flex items-center gap-1.5">
                  <Sparkles className="h-3 w-3 text-amber-400" />
                  <span>1-Click Subsystem Presets ({activePresetTab} Fleet):</span>
                </span>
                
                {/* Presets Tab Switcher */}
                <div className="flex gap-1 text-[10px]">
                  <button
                    type="button"
                    onClick={() => setActivePresetTab('BEMEL')}
                    className={`px-2 py-0.5 rounded font-bold transition border ${
                      activePresetTab === 'BEMEL'
                        ? 'bg-purple-950 text-purple-300 border-purple-500'
                        : 'text-slate-500 border-transparent hover:text-slate-300'
                    }`}
                  >
                    BEMEL Presets
                  </button>
                  <button
                    type="button"
                    onClick={() => setActivePresetTab('CRRC')}
                    className={`px-2 py-0.5 rounded font-bold transition border ${
                      activePresetTab === 'CRRC'
                        ? 'bg-cyan-950 text-cyan-300 border-cyan-500'
                        : 'text-slate-500 border-transparent hover:text-slate-300'
                    }`}
                  >
                    CRRC Presets
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {(activePresetTab === 'BEMEL' ? bemelPresets : crrcPresets).map((p, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleApplyPreset(p)}
                    className="bg-slate-900 hover:bg-slate-800 border border-slate-700 hover:border-slate-600 text-[10px] text-slate-300 px-2 py-1 rounded transition flex items-center gap-1 cursor-pointer"
                  >
                    <span className="text-emerald-400 font-black">+</span>
                    <span>{p.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* AI Generation Button */}
            <div className="pt-2">
              <button
                type="button"
                onClick={handleGenerateAISummary}
                disabled={isSummarizing}
                className="w-full bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white font-black py-3 px-4 rounded-lg shadow-lg flex items-center justify-center gap-2 text-xs uppercase tracking-wider transition disabled:opacity-50 cursor-pointer"
              >
                {isSummarizing ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    <span>{aiStatusMsg || 'Synthesizing GR-2020 Docket via AI Engine…'}</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 text-amber-300 animate-pulse" />
                    <span>GENERATE AI FAULT SUMMARY (EMAIL & SHORT MESSAGE)</span>
                  </>
                )}
              </button>
              {aiStatusMsg && !isSummarizing && (
                <p className="text-[10px] text-emerald-400 font-mono text-center mt-1.5 flex items-center justify-center gap-1">
                  <CheckCircle className="h-3 w-3" />
                  <span>{aiStatusMsg}</span>
                </p>
              )}
            </div>
          </div>

          {/* Right Column: Dual AI Output Viewer + Future Tools */}
          <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-2xl flex flex-col justify-between space-y-4">
            <div>
              <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-3">
                <div>
                  <span className="text-[10px] text-cyan-400 font-bold uppercase tracking-widest">
                    STEP 3: AI DUAL FORMAT OUTPUT
                  </span>
                  <h3 className="text-sm font-bold text-slate-200">Incident Packages (GR-2020)</h3>
                </div>

                {/* Tabs: Email, Short Msg, Depot Card */}
                <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-800">
                  <button
                    type="button"
                    onClick={() => setActiveOutputTab('email')}
                    className={`px-2.5 py-1 rounded text-xs font-bold transition flex items-center gap-1 ${
                      activeOutputTab === 'email'
                        ? 'bg-purple-600 text-white shadow-md'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Mail className="h-3 w-3" />
                    <span>Email</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveOutputTab('short')}
                    className={`px-2.5 py-1 rounded text-xs font-bold transition flex items-center gap-1 ${
                      activeOutputTab === 'short'
                        ? 'bg-emerald-600 text-white shadow-md'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <MessageSquare className="h-3 w-3" />
                    <span>Radio / SMS</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveOutputTab('depot')}
                    className={`px-2.5 py-1 rounded text-xs font-bold transition flex items-center gap-1 ${
                      activeOutputTab === 'depot'
                        ? 'bg-amber-600 text-slate-950 shadow-md'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                    title="Peenya Depot Workshop Job Card"
                  >
                    <Wrench className="h-3 w-3" />
                    <span>Workshop</span>
                  </button>
                </div>
              </div>

              {/* Output Content Area */}
              {activeOutputTab === 'email' && (
                <div className="space-y-3">
                  {/* Subject preview */}
                  <div>
                    <span className="block text-[10px] text-slate-500 uppercase font-bold mb-1">
                      Email Subject Line (GR-2020 Compliant):
                    </span>
                    <div className="bg-slate-950 p-2 rounded border border-slate-800 text-xs text-amber-300 font-bold font-mono">
                      {aiEmailSubject || '[Click "GENERATE AI FAULT SUMMARY" to compile subject line]'}
                    </div>
                  </div>

                  {/* Body preview */}
                  <div>
                    <span className="block text-[10px] text-slate-500 uppercase font-bold mb-1">
                      Formal Email Body Content:
                    </span>
                    <pre className="bg-slate-950 p-3 rounded border border-slate-800 text-[11px] text-slate-200 font-mono whitespace-pre-wrap max-h-72 overflow-y-auto leading-relaxed">
                      {aiEmailSummary || 'Click "GENERATE AI FAULT SUMMARY" to compile formal incident report email with train ID, UP/DN location, Metro Rail GR 2020 citations, 750V DC third rail state, and technical summary.'}
                    </pre>
                  </div>

                  {/* Email Actions */}
                  <div className="flex flex-wrap gap-2 pt-1">
                    <button
                      type="button"
                      onClick={handleCopyEmail}
                      disabled={!aiEmailSummary}
                      className="bg-slate-800 hover:bg-slate-700 text-white px-3 py-1.5 rounded text-xs font-bold flex items-center gap-1.5 transition disabled:opacity-50 cursor-pointer"
                    >
                      {copiedEmail ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                      <span>{copiedEmail ? 'Copied to Clipboard!' : 'Copy Email'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleLaunchEmail}
                      disabled={!aiEmailSummary}
                      className="bg-purple-600 hover:bg-purple-500 text-white px-3 py-1.5 rounded text-xs font-bold flex items-center gap-1.5 transition disabled:opacity-50 cursor-pointer"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      <span>Open in Mail Client</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowPrintModal(true)}
                      className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 px-3 py-1.5 rounded text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                    >
                      <Printer className="h-3.5 w-3.5 text-cyan-400" />
                      <span>Print Docket</span>
                    </button>
                  </div>
                </div>
              )}

              {activeOutputTab === 'short' && (
                <div className="space-y-3">
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-[10px] text-slate-500 uppercase font-bold">
                        Short Broadcast Message (Radio Flash / SMS / WhatsApp):
                      </span>
                      <span className={`text-[10px] font-mono font-bold ${
                        aiShortMessage.length > 160 ? 'text-amber-400' : 'text-emerald-400'
                      }`}>
                        {aiShortMessage.length} chars {aiShortMessage.length > 160 ? '(2 SMS parts)' : '(1 SMS part)'}
                      </span>
                    </div>
                    <div className="bg-slate-950 p-3.5 rounded border border-slate-800 text-xs text-emerald-300 font-mono whitespace-pre-wrap leading-relaxed min-h-[120px]">
                      {aiShortMessage || '[Click "GENERATE AI FAULT SUMMARY" to compile short message]'}
                    </div>
                  </div>

                  {/* Highlights Grid */}
                  <div className="grid grid-cols-2 gap-2 text-[10px] bg-slate-950/60 p-2.5 rounded border border-slate-800">
                    <div>
                      <span className="text-slate-500">Train:</span> <span className="font-bold text-white">#{trainId} ({trainMake})</span>
                    </div>
                    <div>
                      <span className="text-slate-500">Track:</span> <span className="font-bold text-white">{direction} Line ({stationLocation})</span>
                    </div>
                    <div>
                      <span className="text-slate-500">Mode:</span> <span className="font-bold text-amber-300">{drivingMode.split(' ')[0]}</span>
                    </div>
                    <div>
                      <span className="text-slate-500">Traction:</span> <span className="font-bold text-cyan-300">750V DC 3rd Rail</span>
                    </div>
                  </div>

                  {/* Short Message Actions + VHF Radio TTS Simulator */}
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={handleCopyShortMessage}
                      disabled={!aiShortMessage}
                      className="bg-slate-800 hover:bg-slate-700 text-white px-3 py-1.5 rounded text-xs font-bold flex items-center gap-1.5 transition disabled:opacity-50 cursor-pointer"
                    >
                      {copiedShort ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                      <span>{copiedShort ? 'Copied!' : 'Copy Short Msg'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleShareWhatsApp}
                      disabled={!aiShortMessage}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded text-xs font-bold flex items-center gap-1.5 transition disabled:opacity-50 cursor-pointer"
                    >
                      <Share2 className="h-3.5 w-3.5" />
                      <span>WhatsApp</span>
                    </button>

                    {/* VHF Radio Voice Simulator */}
                    <button
                      type="button"
                      onClick={handleToggleRadioTTS}
                      className={`px-3 py-1.5 rounded text-xs font-bold flex items-center gap-1.5 transition border cursor-pointer ${
                        isPlayingTTS
                          ? 'bg-rose-600 text-white border-rose-400 animate-pulse'
                          : 'bg-indigo-600 hover:bg-indigo-500 text-white border-indigo-400'
                      }`}
                      title="Simulate OCC Radio Broadcast Speech"
                    >
                      {isPlayingTTS ? (
                        <>
                          <VolumeX className="h-3.5 w-3.5" />
                          <span>Stop Radio TTS</span>
                        </>
                      ) : (
                        <>
                          <Radio className="h-3.5 w-3.5 text-amber-300 animate-pulse" />
                          <span>VHF Radio Voice Broadcast</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {activeOutputTab === 'depot' && (
                <div className="space-y-3">
                  <div className="bg-slate-950 p-3 rounded-lg border border-amber-500/30 space-y-2.5">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                      <span className="text-[11px] font-black text-amber-300 flex items-center gap-1.5">
                        <Wrench className="h-3.5 w-3.5 text-amber-400" />
                        <span>Peenya Depot Workshop Job Card (PYID)</span>
                      </span>
                      <span className="text-[9px] bg-slate-900 border border-slate-700 text-slate-300 px-2 py-0.5 rounded font-bold">
                        {trainMake} 6-Car
                      </span>
                    </div>

                    <div className="space-y-2 text-xs">
                      <div>
                        <span className="text-slate-400 block text-[10px] uppercase font-bold">Recommended Workshop Pit Bay:</span>
                        <span className="text-white font-bold">{depotRecommendation.pitLine}</span>
                      </div>

                      <div>
                        <span className="text-slate-400 block text-[10px] uppercase font-bold">Quarantine Protocol:</span>
                        <span className={`font-black text-[11px] ${
                          severity === 'CRITICAL' ? 'text-rose-400' : severity === 'MAJOR' ? 'text-amber-400' : 'text-emerald-400'
                        }`}>
                          {depotRecommendation.tag}
                        </span>
                      </div>

                      <div>
                        <span className="text-slate-400 block text-[10px] uppercase font-bold">Maintenance Discipline:</span>
                        <span className="text-cyan-300 font-bold">{depotRecommendation.section}</span>
                      </div>

                      <div>
                        <span className="text-slate-400 block text-[10px] uppercase font-bold">Diagnostics & Testing Protocol:</span>
                        <span className="text-slate-300 text-[11px] font-mono">{depotRecommendation.inspectionProtocol}</span>
                      </div>
                    </div>
                  </div>

                  <p className="text-[10px] text-slate-400 italic">
                    ℹ️ This work-order will be automatically recorded in Peenya Depot's Rolling Stock Defect Log upon submission.
                  </p>
                </div>
              )}
            </div>

            {/* Bottom Final Broadcast Button */}
            <div className="border-t border-slate-800 pt-3">
              <button
                type="button"
                onClick={handleSaveAndBroadcast}
                disabled={isSubmitting || !aiEmailSummary}
                className="w-full bg-rose-600 hover:bg-rose-500 text-white font-black py-2.5 px-4 rounded-lg shadow-xl flex items-center justify-center gap-2 text-xs uppercase tracking-wider transition disabled:opacity-50 cursor-pointer"
              >
                {isSubmitting ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                <span>BROADCAST TO OCC STREAM & PERSIST IN FIRESTORE</span>
              </button>
              {submitSuccess && (
                <p className="text-xs text-emerald-400 font-bold text-center mt-2 flex items-center justify-center gap-1">
                  <CheckCircle className="h-4 w-4" />
                  <span>Fault logged across OCC Stream, Tracker & Peenya Depot Workshop!</span>
                </p>
              )}
            </div>
          </div>
        </div>

        {/* STEP 4: LIVE FAULT LEDGER & ADVANCED FILTERS */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-2xl">
          <div className="p-4 bg-slate-950 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-widest">
                LIVE METRO RAIL GR-2020 FAULT LEDGER
              </span>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <span>Recent Mainline Fault Reports ({filteredReports.length})</span>
              </h3>
            </div>

            {/* Table Filters */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <input id="aifaultreportingpage-input-16" name="aifaultreportingpage_input_16"
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search Train, Station, GR Rule..."
                className="bg-slate-900 border border-slate-700 rounded px-2.5 py-1 text-xs text-slate-200 focus:border-emerald-500 focus:outline-none"
              />

              <select id="aifaultreportingpage-select-fleet" name="aifaultreportingpage_select_fleet"
                value={filterFleet}
                onChange={(e) => setFilterFleet(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-300 focus:outline-none"
              >
                <option value="ALL">All Fleets</option>
                <option value="BEMEL">BEMEL (6-Car)</option>
                <option value="CRRC">CRRC (6-Car)</option>
              </select>

              <select id="aifaultreportingpage-select-17" name="aifaultreportingpage_select_17"
                value={filterRole}
                onChange={(e) => setFilterRole(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-300 focus:outline-none"
              >
                <option value="ALL">All Roles</option>
                <option value="ALS">ALS</option>
                <option value="CC">CC</option>
                <option value="TRAIN OPERATOR">Train Operator</option>
              </select>

              <select id="aifaultreportingpage-select-sev" name="aifaultreportingpage_select_sev"
                value={filterSeverity}
                onChange={(e) => setFilterSeverity(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-300 focus:outline-none"
              >
                <option value="ALL">All Severities</option>
                <option value="CRITICAL">CRITICAL</option>
                <option value="MAJOR">MAJOR</option>
                <option value="MINOR">MINOR</option>
              </select>

              <select id="aifaultreportingpage-select-18" name="aifaultreportingpage_select_18"
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-300 focus:outline-none"
              >
                <option value="ALL">All Status</option>
                <option value="OPEN">OPEN</option>
                <option value="IN_PROGRESS">IN_PROGRESS</option>
                <option value="RESOLVED">RESOLVED</option>
              </select>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/80 border-b border-slate-800 text-slate-400 uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="p-3 w-32">Train & Fleet</th>
                  <th className="p-3 w-36">Location</th>
                  <th className="p-3">Fault Classification & GR 2020 Telemetry</th>
                  <th className="p-3 w-32">Reported By</th>
                  <th className="p-3 w-24 text-center">Status</th>
                  <th className="p-3 w-32 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredReports.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="p-8 text-center text-slate-500 italic">
                      No fault reports match current filter criteria.
                    </td>
                  </tr>
                ) : (
                  filteredReports.map(report => (
                    <tr key={report.id} className="hover:bg-slate-800/30 transition bg-slate-900/40">
                      {/* Train & Direction */}
                      <td className="p-3">
                        <div className="flex flex-col gap-0.5">
                          <span className="font-bold text-cyan-300 text-sm">Train #{report.trainId}</span>
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded w-max border ${
                            report.trainMake === 'CRRC'
                              ? 'bg-cyan-950 text-cyan-300 border-cyan-500/40'
                              : 'bg-purple-950 text-purple-300 border-purple-500/40'
                          }`}>
                            {report.trainMake || 'BEMEL'} 6-Car
                          </span>
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded w-max border ${
                            report.direction === 'UP' 
                              ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' 
                              : 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                          }`}>
                            {report.direction === 'UP' ? '▲ UP LINE' : '▼ DN LINE'}
                          </span>
                        </div>
                      </td>

                      {/* Location */}
                      <td className="p-3">
                        <div className="flex flex-col gap-0.5">
                          <span className="font-bold text-white">{report.stationLocation}</span>
                          <span className="text-[10px] text-slate-400 truncate max-w-xs" title={report.specificLocation}>
                            {report.specificLocation || '--'}
                          </span>
                        </div>
                      </td>

                      {/* Fault Type & Description */}
                      <td className="p-3">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-rose-300 flex items-center gap-1">
                              <AlertOctagon className="h-3.5 w-3.5 text-rose-400 shrink-0" />
                              <span>{report.faultType}</span>
                            </span>
                            {report.grCitation && (
                              <span className="text-[9px] bg-slate-950 text-emerald-400 border border-emerald-500/30 px-1.5 py-0.5 rounded font-mono">
                                {report.grCitation.split('(')[0].trim()}
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-300 line-clamp-2">
                            {report.shortMessage || report.rawDescription}
                          </p>
                        </div>
                      </td>

                      {/* Reported By */}
                      <td className="p-3">
                        <div className="flex flex-col gap-0.5 text-[11px]">
                          <span className={`font-bold px-1.5 py-0.5 rounded w-max text-[9px] uppercase border ${
                            report.reporterRole === 'ALS'
                              ? 'bg-purple-950 text-purple-300 border-purple-600'
                              : report.reporterRole === 'CC'
                                ? 'bg-amber-950 text-amber-300 border-amber-600'
                                : 'bg-cyan-950 text-cyan-300 border-cyan-600'
                          }`}>
                            {report.reporterRole}
                          </span>
                          <span className="text-slate-300 font-bold truncate">{report.reporterName}</span>
                          <span className="text-slate-500 text-[10px] font-mono">{report.reporterId}</span>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="p-3 text-center">
                        <span className={`px-2 py-0.5 rounded font-black text-[10px] uppercase border inline-flex items-center gap-1 ${
                          report.status === 'OPEN'
                            ? 'bg-rose-950/80 text-rose-400 border-rose-500 animate-pulse'
                            : report.status === 'IN_PROGRESS'
                              ? 'bg-amber-950/80 text-amber-300 border-amber-500'
                              : 'bg-emerald-950/80 text-emerald-400 border-emerald-500'
                        }`}>
                          {report.status}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="p-3 text-center">
                        <div className="flex justify-center gap-1">
                          {report.status === 'OPEN' && (
                            <button
                              type="button"
                              onClick={() => handleUpdateStatus(report.id, 'IN_PROGRESS')}
                              className="bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold px-2 py-1 rounded text-[10px] uppercase transition cursor-pointer"
                              title="Set to In Progress"
                            >
                              In Progress
                            </button>
                          )}
                          {report.status !== 'RESOLVED' && (
                            <button
                              type="button"
                              onClick={() => handleUpdateStatus(report.id, 'RESOLVED')}
                              className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-2 py-1 rounded text-[10px] uppercase transition cursor-pointer flex items-center gap-0.5"
                              title="Mark as Resolved"
                            >
                              <Check className="h-3 w-3" />
                              <span>Resolve</span>
                            </button>
                          )}
                          {report.status === 'RESOLVED' && (
                            <span className="text-slate-500 text-[10px] flex items-center justify-center gap-1">
                              <CheckCircle className="h-3 w-3 text-emerald-400" />
                              <span>Closed</span>
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

      </main>

      {/* PRINTABLE OFFICIAL INCIDENT DOCKET MODAL */}
      {showPrintModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-950 border border-slate-700 rounded-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto shadow-2xl p-6 text-slate-100 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Printer className="h-5 w-5 text-cyan-400" />
                <h3 className="font-black text-sm text-white">BMRCL OFFICIAL INCIDENT DOCKET SHEET (METRO RAIL GR-2020)</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowPrintModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Printable Docket Content */}
            <div className="bg-white text-slate-900 p-6 rounded shadow font-sans text-xs space-y-4 print:p-0">
              <div className="text-center border-b-2 border-slate-900 pb-3">
                <h2 className="text-base font-black tracking-wider uppercase">BANGALORE METRO RAIL CORPORATION LIMITED</h2>
                <h3 className="text-xs font-bold text-slate-700">PEENYA INDUSTRY DEPOT • LINE 2 (GREEN LINE) CREW CONTROL</h3>
                <p className="text-[10px] font-mono text-slate-500 mt-1">
                  OFFICIAL INCIDENT & ROLLING STOCK DEFECT DOCKET • METRO RAILWAYS GENERAL RULES, 2020
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4 border-b border-slate-300 pb-3">
                <div>
                  <span className="block text-[10px] text-slate-500 font-bold uppercase">Incident Reference:</span>
                  <span className="font-bold font-mono">BMRCL/PYID/GR2020/{new Date().getFullYear()}/{Date.now().toString().slice(-6)}</span>
                </div>
                <div>
                  <span className="block text-[10px] text-slate-500 font-bold uppercase">Date & Time of Logging:</span>
                  <span className="font-bold">{new Date().toLocaleString('en-GB')}</span>
                </div>
                <div>
                  <span className="block text-[10px] text-slate-500 font-bold uppercase">Statutory Rule Compliance:</span>
                  <span className="font-bold text-emerald-800">{getGRCitation(faultType, rawDescription, operationalAction)}</span>
                </div>
                <div>
                  <span className="block text-[10px] text-slate-500 font-bold uppercase">Severity Rating:</span>
                  <span className="font-black text-rose-700">{severity}</span>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 border-b border-slate-300 pb-3">
                <div>
                  <span className="block text-[10px] text-slate-500 font-bold uppercase">Train & Fleet Make:</span>
                  <span className="font-bold">Train #{trainId} ({trainMake} 6-Car)</span>
                </div>
                <div>
                  <span className="block text-[10px] text-slate-500 font-bold uppercase">Affected Car & Subsystem:</span>
                  <span className="font-bold">{affectedCar} • {subsystem.split('(')[0]}</span>
                </div>
                <div>
                  <span className="block text-[10px] text-slate-500 font-bold uppercase">Driving Mode:</span>
                  <span className="font-bold">{drivingMode}</span>
                </div>
                <div>
                  <span className="block text-[10px] text-slate-500 font-bold uppercase">Location & Track:</span>
                  <span className="font-bold">{stationLocation} [{direction} Line]</span>
                </div>
                <div className="col-span-2">
                  <span className="block text-[10px] text-slate-500 font-bold uppercase">750V DC Third Rail State:</span>
                  <span className="font-bold">{thirdRailStatus} (Bottom-Contact CCSD)</span>
                </div>
              </div>

              <div>
                <span className="block text-[10px] text-slate-500 font-bold uppercase mb-1">Technical Incident Narrative:</span>
                <p className="bg-slate-100 p-2.5 rounded border border-slate-300 text-[11px] leading-relaxed">
                  {rawDescription}
                </p>
              </div>

              <div>
                <span className="block text-[10px] text-slate-500 font-bold uppercase mb-1">Operational Action Taken (GR-2020):</span>
                <p className="bg-emerald-50 text-emerald-950 p-2 rounded border border-emerald-300 font-bold text-[11px]">
                  {operationalAction}
                </p>
              </div>

              <div>
                <span className="block text-[10px] text-slate-500 font-bold uppercase mb-1">Peenya Depot Workshop Recommendation:</span>
                <div className="bg-slate-100 p-2 rounded border border-slate-300 text-[11px] space-y-1">
                  <div><strong>Target Pit Bay:</strong> {depotRecommendation.pitLine}</div>
                  <div><strong>Quarantine Status:</strong> {depotRecommendation.tag}</div>
                  <div><strong>Maintenance Discipline:</strong> {depotRecommendation.section}</div>
                </div>
              </div>

              <div className="pt-6 border-t-2 border-slate-900 grid grid-cols-3 gap-4 text-center text-[10px]">
                <div className="border-t border-slate-400 pt-2">
                  <span className="font-bold block">{reporterName} ({reporterRole})</span>
                  <span className="text-slate-500">Reporting Officer Signature</span>
                </div>
                <div className="border-t border-slate-400 pt-2">
                  <span className="font-bold block">Train Controller (TC)</span>
                  <span className="text-slate-500">OCC Line 2 Dispatch Desk</span>
                </div>
                <div className="border-t border-slate-400 pt-2">
                  <span className="font-bold block">Depot In-Charge (DCC)</span>
                  <span className="text-slate-500">Peenya Industry Workshop</span>
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowPrintModal(false)}
                className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-4 py-2 rounded text-xs font-bold transition"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded text-xs font-bold flex items-center gap-2 transition"
              >
                <Printer className="h-4 w-4" />
                <span>Print Docket Sheet</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
