import React, { useState, useEffect, useMemo } from 'react';
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
  ExternalLink, FileText, ChevronRight, Filter, Eye, ArrowLeft
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

const FAULT_CATEGORIES = [
  'Rolling Stock (Train Defect / TCMS / Door / Brake)',
  'Signaling / ATP / ATO Failure / Emergency Brake Trip',
  'Traction Power / OHE / Third Rail / Voltage Dip',
  'Track / Point Failure / P-Way Obstruction',
  'Station / Platform / Door Interlock Obstruction',
  'Passenger Incident / Medical / Alarm Device (PAD)',
  'Crew Operational Event / Reliever Request',
  'Other Mainline Operational Disruption'
];

const SAMPLE_TRAIN_IDS = [
  '201', '202', '203', '204', '205', '206', '207', '208',
  '209', '210', '211', '212', '213', '214', '215', '216',
  '217', '218', '219', '220', '221', '222'
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
  const [direction, setDirection] = useState('UP'); // 'UP' or 'DN'
  const [stationLocation, setStationLocation] = useState('KVPR');
  const [specificLocation, setSpecificLocation] = useState('Platform 1 (UP Track ➔ Madavara)');
  const [faultType, setFaultType] = useState(FAULT_CATEGORIES[0]);
  const [severity, setSeverity] = useState('MAJOR'); // 'CRITICAL', 'MAJOR', 'MINOR'
  const [rawDescription, setRawDescription] = useState(
    'Traction motor 2 high temperature alarm on TCMS. Train automatically held at platform with emergency brake interlock. Speed restricted to 25 km/h. Standby relief requested at YPM.'
  );

  // AI Output states
  const [aiEmailSummary, setAiEmailSummary] = useState('');
  const [aiEmailSubject, setAiEmailSubject] = useState('');
  const [aiShortMessage, setAiShortMessage] = useState('');
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [aiStatusMsg, setAiStatusMsg] = useState('');
  const [activeOutputTab, setActiveOutputTab] = useState('email'); // 'email' or 'short'

  // Clipboard & UI feedback
  const [copiedEmail, setCopiedEmail] = useState(false);
  const [copiedShort, setCopiedShort] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  // Live Faults History
  const [faultReports, setFaultReports] = useState([]);
  const [filterRole, setFilterRole] = useState('ALL');
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

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

  // Quick preset narrative helpers
  const handleApplyPreset = (text, category, sev) => {
    setRawDescription(text);
    if (category) setFaultType(category);
    if (sev) setSeverity(sev);
  };

  // Generate deterministic local fallback summary in case API is offline
  const generateDeterministicSummary = () => {
    const fullLocation = `${specificLocation} [${direction} Line]`;
    const timestamp = new Date().toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });

    const subject = `[BMRCL INCIDENT ALERT] ${severity} | Train ${trainId} (${direction} Line @ ${stationLocation}) | ${faultType.split('(')[0].trim()}`;

    const email = `======================================================================
BMRCL PEENYA INDUSTRY DEPOT (LINE 2) • OFFICIAL INCIDENT ALERT
======================================================================
REPORTED AT   : ${timestamp}
INCIDENT REF  : BMRCL-L2-${Date.now().toString().slice(-6)}
SEVERITY      : ${severity}
----------------------------------------------------------------------
TRAIN IDENTIFICATION & LOCATION:
• Train ID        : Train ${trainId}
• Track Direction : ${direction === 'UP' ? 'UP LINE (Northbound ➔ Madavara/BIET)' : 'DN LINE (Southbound ➔ Silk Institute/APTS)'}
• Exact Location  : ${fullLocation}
• Station Code    : ${stationLocation}
----------------------------------------------------------------------
REPORTING OFFICER DETAILS:
• Role            : ${reporterRole}
• Officer Name    : ${reporterName}
• Employee / ID   : ${reporterId}
----------------------------------------------------------------------
FAULT CLASSIFICATION & DESCRIPTION:
• Fault Category  : ${faultType}
• Technical Summary & Symptoms:
  ${rawDescription}
----------------------------------------------------------------------
OPERATIONAL ACTIONS & DIRECTIVES:
1. OCC / CC notified for immediate timetable regulation and gap management.
2. Trailing trains advised of cautious approach speed.
3. Standby relief crew & rolling stock maintenance notified.
======================================================================
Peenya Industry Depot Crew Control System (PYIDCC)`;

    const shortMsg = `🚨 BMRCL FAULT FLASH | Tr:${trainId} | Loc:${stationLocation} [${direction}] | Type:${faultType.split('(')[0].trim()} | Sev:${severity} | RepBy:${reporterRole} (${reporterId}) | Desc:${rawDescription.length > 110 ? rawDescription.slice(0, 110) + '...' : rawDescription} | Act:Relief/OCC Notified`;

    return { subject, email, shortMsg };
  };

  // AI Summarization invocation
  const handleGenerateAISummary = async () => {
    if (!trainId.trim() || !rawDescription.trim()) {
      alert('Please provide Train ID and a description of the fault.');
      return;
    }

    setIsSummarizing(true);
    setAiStatusMsg('Initializing AI Railway Incident Engine…');

    const effectiveKey = (localStorage.getItem('custom_gemini_api_key') || import.meta.env.VITE_GEMINI_API_KEY || '').trim();

    const promptText = `
You are the Chief Railway Incident Classifier & Operational Dispatcher for Bangalore Metro Rail Corporation Limited (BMRCL) Line 2 (Green Line).
Your job is to synthesize an emergency operational fault report submitted by: ${reporterRole} (${reporterName}, ID: ${reporterId}).

MANDATORY INPUT PARAMETERS:
- Train ID: ${trainId}
- Track Direction: ${direction === 'UP' ? 'UP Line (Northbound towards Madavara/BIET)' : 'DN Line (Southbound towards Silk Institute/APTS)'}
- Location: ${specificLocation} (${stationLocation} Station)
- Fault Category: ${faultType}
- Severity Level: ${severity}
- Raw Fault Message: "${rawDescription}"

OUTPUT REQUIREMENTS:
You must generate TWO formats strictly formatted as JSON:
{
  "emailSubject": "[BMRCL FAULT ALERT] <Severity> | Train <TrainId> (<Direction> Line @ <Location>) | <ConciseFaultType>",
  "emailBody": "<A professional, highly structured formal incident report email with clear sections: INCIDENT SUMMARY, OPERATIONAL IMPACT, REPORTED BY, DETAILED FAULT ANALYSIS, and IMMEDIATE ACTIONS REQUIRED>",
  "shortMessage": "🚨 BMRCL FLASH | Tr:<TrainId> | Loc:<Station> [<UP/DN>] | Type:<FaultType> | RepBy:<Role> | Desc:<Clear 1-sentence description> | Act:<Action Taken>"
}

Ensure the shortMessage is under 190 characters suitable for SMS / radio broadcast / WhatsApp dispatch.
Respond ONLY with the JSON object.
`;

    let generated = null;

    if (effectiveKey) {
      for (const modelName of MODEL_CHAIN) {
        try {
          setAiStatusMsg(`Generating AI Summary via ${modelName}…`);
          const genAI = new GoogleGenerativeAI(effectiveKey);
          const model = genAI.getGenerativeModel({ model: modelName });
          const result = await model.generateContent(promptText);
          const text = result.response.text();
          
          // Extract JSON
          const jsonMatch = text.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            if (parsed.emailBody && parsed.shortMessage) {
              generated = parsed;
              break;
            }
          }
        } catch (err) {
          console.warn(`Model ${modelName} failed, attempting next model:`, err);
        }
      }
    }

    // Fallback if AI key is missing or failed
    if (!generated) {
      setAiStatusMsg('Generated using BMRCL Standard Railway Protocol Engine.');
      const local = generateDeterministicSummary();
      setAiEmailSubject(local.subject);
      setAiEmailSummary(local.email);
      setAiShortMessage(local.shortMsg);
    } else {
      setAiEmailSubject(generated.emailSubject);
      setAiEmailSummary(generated.emailBody);
      setAiShortMessage(generated.shortMessage);
      setAiStatusMsg('AI Summary Generated Successfully.');
    }

    setIsSummarizing(false);
  };

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
    const defaultRecipient = 'occ.line2@bmrcl.co.in, cc.peenya@bmrcl.co.in';
    const mailtoUrl = `mailto:${encodeURIComponent(defaultRecipient)}?subject=${encodeURIComponent(aiEmailSubject)}&body=${encodeURIComponent(aiEmailSummary)}`;
    window.open(mailtoUrl, '_blank');
  };

  // Share to WhatsApp
  const handleShareWhatsApp = () => {
    const whatsappUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(aiShortMessage)}`;
    window.open(whatsappUrl, '_blank');
  };

  // Save to Firestore and Log
  const handleSaveAndBroadcast = async () => {
    if (!aiEmailSummary || !aiShortMessage) {
      alert('Please click "GENERATE AI FAULT SUMMARY" first before logging.');
      return;
    }

    setIsSubmitting(true);
    try {
      const record = {
        trainId: trainId.trim(),
        direction: direction,
        stationLocation: stationLocation,
        specificLocation: specificLocation,
        faultType: faultType,
        severity: severity,
        rawDescription: rawDescription,
        reporterRole: reporterRole,
        reporterName: reporterName,
        reporterId: reporterId,
        emailSubject: aiEmailSubject,
        emailSummary: aiEmailSummary,
        shortMessage: aiShortMessage,
        status: 'OPEN', // OPEN, IN_PROGRESS, RESOLVED
        createdAt: serverTimestamp(),
        timestampStr: new Date().toISOString()
      };

      // Add to fault_reports
      await addDoc(collection(db, 'fault_reports'), record);

      // Also register in live_incidents for OCC integration
      await addDoc(collection(db, 'live_incidents'), {
        trainId: trainId.trim(),
        stationLocation: stationLocation,
        direction: direction,
        reason: `${faultType} (${severity}) - Reported by ${reporterRole}`,
        description: aiShortMessage,
        delayMins: severity === 'CRITICAL' ? 15 : severity === 'MAJOR' ? 8 : 3,
        status: 'OPEN',
        reportedBy: `${reporterRole} - ${reporterName}`,
        createdAt: serverTimestamp()
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
      if (filterRole !== 'ALL' && r.reporterRole !== filterRole) return false;
      if (filterStatus !== 'ALL' && r.status !== filterStatus) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesTrain = String(r.trainId || '').toLowerCase().includes(q);
        const matchesLoc = String(r.stationLocation || '').toLowerCase().includes(q);
        const matchesType = String(r.faultType || '').toLowerCase().includes(q);
        const matchesDesc = String(r.rawDescription || '').toLowerCase().includes(q);
        return matchesTrain || matchesLoc || matchesType || matchesDesc;
      }
      return true;
    });
  }, [faultReports, filterRole, filterStatus, searchQuery]);

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
                  ACTIVE DISPATCH
                </span>
              </h1>
              <p className="text-[11px] text-slate-400">
                Multi-Role Incident Intake (ALS, CC, Train Operator) with Dual AI Email & Short Message Synthesizer
              </p>
            </div>
          </div>
        </div>

        {/* Global Stats Counter */}
        <div className="flex items-center gap-2 text-xs">
          <div className="bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-rose-500 animate-pulse"></span>
            <span className="text-slate-400">Open Incidents:</span>
            <span className="font-bold text-rose-400">{faultReports.filter(r => r.status === 'OPEN').length}</span>
          </div>
          <div className="bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
            <span className="text-slate-400">Resolved:</span>
            <span className="font-bold text-emerald-400">{faultReports.filter(r => r.status === 'RESOLVED').length}</span>
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
                { id: 'CC', label: 'CC (Crew Controller)', color: 'border-amber-500 text-amber-300 bg-amber-950/40' },
                { id: 'TRAIN OPERATOR', label: 'TRAIN OPERATOR (Driver)', color: 'border-cyan-500 text-cyan-300 bg-cyan-950/40' }
              ].map(role => (
                <button
                  key={role.id}
                  type="button"
                  onClick={() => setReporterRole(role.id)}
                  className={`px-3 py-1.5 rounded text-xs font-bold transition flex items-center gap-1.5 ${
                    reporterRole === role.id
                      ? `${role.color} border shadow-lg ring-1 ring-white/20`
                      : 'text-slate-400 hover:text-slate-200 bg-transparent'
                  }`}
                >
                  <UserCheck className="h-3.5 w-3.5" />
                  <span>{role.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Reporter Identification Fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-xs">
            <div>
              <label className="block text-[10px] text-slate-400 uppercase mb-1">Reporter Name</label>
              <input
                type="text"
                value={reporterName}
                onChange={(e) => setReporterName(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-white font-mono focus:border-emerald-500 focus:outline-none"
                placeholder="Enter officer name"
              />
            </div>
            <div>
              <label className="block text-[10px] text-slate-400 uppercase mb-1">Employee ID / Designation</label>
              <input
                type="text"
                value={reporterId}
                onChange={(e) => setReporterId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-white font-mono focus:border-emerald-500 focus:outline-none"
                placeholder="e.g. 21953 / ALS-02"
              />
            </div>
            <div>
              <label className="block text-[10px] text-slate-400 uppercase mb-1">Shift Operational Desk</label>
              <div className="p-2 bg-slate-950 border border-slate-800 rounded text-slate-300 flex items-center justify-between">
                <span>Peenya Depot Line 2 OCC</span>
                <span className="text-[10px] text-emerald-400 font-bold">ONLINE</span>
              </div>
            </div>
          </div>
        </div>

        {/* STEP 2: INCIDENT & FAULT MANDATORY PARAMETERS */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* Left Column: Form Intake */}
          <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-2xl space-y-4">
            <div className="border-b border-slate-800 pb-2 flex justify-between items-center">
              <div>
                <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-widest">
                  STEP 2: MANDATORY FAULT PARAMETERS
                </span>
                <h3 className="text-sm font-bold text-slate-200">Incident Telemetry & Technical Details</h3>
              </div>
              <span className="text-[10px] text-rose-400 border border-rose-500/40 bg-rose-500/10 px-2 py-0.5 rounded font-bold uppercase">
                Required for OCC & SMS
              </span>
            </div>

            {/* Row 1: Train ID & Direction */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] text-slate-300 font-bold mb-1 flex items-center gap-1">
                  <Train className="h-3.5 w-3.5 text-cyan-400" />
                  <span>Train ID (Required)</span>
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={trainId}
                    onChange={(e) => setTrainId(e.target.value)}
                    placeholder="e.g. 204 or R-12"
                    className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-sm text-cyan-300 font-bold font-mono focus:border-cyan-500 focus:outline-none"
                  />
                  <select
                    value={trainId}
                    onChange={(e) => setTrainId(e.target.value)}
                    className="bg-slate-950 border border-slate-700 rounded px-2 text-xs text-slate-400 font-mono cursor-pointer"
                    title="Quick pick Green Line train"
                  >
                    <option value="">Quick Pick</option>
                    {SAMPLE_TRAIN_IDS.map(id => (
                      <option key={id} value={id}>Train #{id}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] text-slate-300 font-bold mb-1 flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5 text-amber-400" />
                  <span>Track Direction (UP / DN)</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setDirection('UP')}
                    className={`py-2 px-3 rounded font-bold text-xs transition border flex items-center justify-center gap-1.5 ${
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
                    className={`py-2 px-3 rounded font-bold text-xs transition border flex items-center justify-center gap-1.5 ${
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
                <label className="block text-[11px] text-slate-300 font-bold mb-1">
                  Primary Station Location
                </label>
                <select
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
                <label className="block text-[11px] text-slate-300 font-bold mb-1">
                  Specific Location (Section / Platform / Chainage)
                </label>
                <input
                  type="text"
                  value={specificLocation}
                  onChange={(e) => setSpecificLocation(e.target.value)}
                  placeholder="e.g. Platform 2 or Between KVPR and SPRU"
                  className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-xs text-slate-200 font-mono focus:border-emerald-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Row 3: Fault Category & Severity */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-[11px] text-slate-300 font-bold mb-1">
                  Type of Faults / Incident / Events
                </label>
                <select
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
                <label className="block text-[11px] text-slate-300 font-bold mb-1">
                  Severity Rating
                </label>
                <select
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
                  <option value="CRITICAL">CRITICAL (Service Halted)</option>
                  <option value="MAJOR">MAJOR (Caution / Delay)</option>
                  <option value="MINOR">MINOR (Advisory / Normal)</option>
                </select>
              </div>
            </div>

            {/* Row 4: Raw Description Text Area */}
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="block text-[11px] text-slate-300 font-bold">
                  Describing Faults (Raw Message / Narrative)
                </label>
                <span className="text-[10px] text-slate-500">
                  {rawDescription.length} characters entered
                </span>
              </div>
              <textarea
                rows={4}
                value={rawDescription}
                onChange={(e) => setRawDescription(e.target.value)}
                placeholder="Enter complete technical description, timeline of fault, alarms displayed on TCMS/DDU, speed restrictions, and immediate actions taken..."
                className="w-full bg-slate-950 border border-slate-700 rounded p-2.5 text-xs text-slate-200 font-mono focus:border-emerald-500 focus:outline-none resize-y"
              />
            </div>

            {/* Quick Presets for Rapid Reporting */}
            <div>
              <span className="block text-[10px] text-slate-500 uppercase tracking-widest mb-1.5 font-bold">
                Quick Preset Templates (1-Click Fill):
              </span>
              <div className="flex flex-wrap gap-1.5">
                {[
                  {
                    label: 'Door Obstruction',
                    text: 'Door 3 in Car 2 failed to interlock due to obstruction. 3 attempts made. Train delayed by 4 minutes.',
                    cat: FAULT_CATEGORIES[4],
                    sev: 'MAJOR'
                  },
                  {
                    label: 'Traction Loss',
                    text: 'Traction converter 1 tripping on overcurrent. Train operating at reduced acceleration (50% power). Requesting depot inspection.',
                    cat: FAULT_CATEGORIES[0],
                    sev: 'MAJOR'
                  },
                  {
                    label: 'Cab Signal Loss',
                    text: 'Loss of ATP target speed codes at crossover signal. Emergency brakes applied. Manual mode authorized by OCC.',
                    cat: FAULT_CATEGORIES[1],
                    sev: 'CRITICAL'
                  },
                  {
                    label: 'OHE Voltage Dip',
                    text: 'Sudden OHE voltage fluctuation below 550V DC. Auxiliary inverter restarted. HVAC reset in progress.',
                    cat: FAULT_CATEGORIES[2],
                    sev: 'MINOR'
                  },
                  {
                    label: 'Medical Emergency',
                    text: 'Passenger collapsed inside Car 3. Station controller and medical team notified for stretcher assistance at platform.',
                    cat: FAULT_CATEGORIES[5],
                    sev: 'CRITICAL'
                  }
                ].map((p, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleApplyPreset(p.text, p.cat, p.sev)}
                    className="bg-slate-950 hover:bg-slate-800 border border-slate-800 text-[10px] text-slate-300 px-2 py-1 rounded transition"
                  >
                    + {p.label}
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
                className="w-full bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white font-black py-2.5 px-4 rounded-lg shadow-lg flex items-center justify-center gap-2 text-xs uppercase tracking-wider transition disabled:opacity-50 cursor-pointer"
              >
                {isSummarizing ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    <span>{aiStatusMsg || 'Analyzing & Formatting via AI…'}</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 text-amber-300 animate-pulse" />
                    <span>GENERATE AI FAULT SUMMARY (EMAIL & SHORT MESSAGE)</span>
                  </>
                )}
              </button>
              {aiStatusMsg && !isSummarizing && (
                <p className="text-[10px] text-emerald-400 font-mono text-center mt-1.5">
                  ✓ {aiStatusMsg}
                </p>
              )}
            </div>
          </div>

          {/* Right Column: Dual AI Output Viewer (Email & Short Message) */}
          <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-2xl flex flex-col justify-between space-y-4">
            <div>
              <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-3">
                <div>
                  <span className="text-[10px] text-cyan-400 font-bold uppercase tracking-widest">
                    STEP 3: AI DUAL FORMAT OUTPUT
                  </span>
                  <h3 className="text-sm font-bold text-slate-200">Summarized Incident Packages</h3>
                </div>

                {/* Tabs */}
                <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-800">
                  <button
                    type="button"
                    onClick={() => setActiveOutputTab('email')}
                    className={`px-3 py-1 rounded text-xs font-bold transition flex items-center gap-1 ${
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
                    className={`px-3 py-1 rounded text-xs font-bold transition flex items-center gap-1 ${
                      activeOutputTab === 'short'
                        ? 'bg-emerald-600 text-white shadow-md'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <MessageSquare className="h-3 w-3" />
                    <span>Short Msg</span>
                  </button>
                </div>
              </div>

              {/* Output Content Area */}
              {activeOutputTab === 'email' ? (
                <div className="space-y-3">
                  {/* Subject preview */}
                  <div>
                    <span className="block text-[10px] text-slate-500 uppercase font-bold mb-1">
                      Email Subject Line:
                    </span>
                    <div className="bg-slate-950 p-2 rounded border border-slate-800 text-xs text-amber-300 font-bold font-mono">
                      {aiEmailSubject || '[Click "GENERATE AI FAULT SUMMARY" to compile subject line]'}
                    </div>
                  </div>

                  {/* Body preview */}
                  <div>
                    <span className="block text-[10px] text-slate-500 uppercase font-bold mb-1">
                      Email Body Content:
                    </span>
                    <pre className="bg-slate-950 p-3 rounded border border-slate-800 text-[11px] text-slate-200 font-mono whitespace-pre-wrap max-h-72 overflow-y-auto leading-relaxed">
                      {aiEmailSummary || 'Click "GENERATE AI FAULT SUMMARY" to compile formal incident report email with train ID, UP/DN location, fault type, and technical summary.'}
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
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-[10px] text-slate-500 uppercase font-bold">
                        Short Broadcast Message (SMS / WhatsApp / Radio Flash):
                      </span>
                      <span className={`text-[10px] font-mono font-bold ${
                        aiShortMessage.length > 160 ? 'text-amber-400' : 'text-emerald-400'
                      }`}>
                        {aiShortMessage.length} chars {aiShortMessage.length > 160 ? '(2 SMS segments)' : '(1 SMS segment)'}
                      </span>
                    </div>
                    <div className="bg-slate-950 p-3.5 rounded border border-slate-800 text-xs text-emerald-300 font-mono whitespace-pre-wrap leading-relaxed min-h-[120px]">
                      {aiShortMessage || '[Click "GENERATE AI FAULT SUMMARY" to compile short message]'}
                    </div>
                  </div>

                  {/* Highlights Grid */}
                  <div className="grid grid-cols-2 gap-2 text-[10px] bg-slate-950/60 p-2 rounded border border-slate-850">
                    <div>
                      <span className="text-slate-500">Train ID:</span> <span className="font-bold text-white">{trainId}</span>
                    </div>
                    <div>
                      <span className="text-slate-500">Track:</span> <span className="font-bold text-white">{direction} Line</span>
                    </div>
                    <div>
                      <span className="text-slate-500">Location:</span> <span className="font-bold text-white">{stationLocation}</span>
                    </div>
                    <div>
                      <span className="text-slate-500">Reported By:</span> <span className="font-bold text-white">{reporterRole}</span>
                    </div>
                  </div>

                  {/* Short Message Actions */}
                  <div className="flex flex-wrap gap-2 pt-1">
                    <button
                      type="button"
                      onClick={handleCopyShortMessage}
                      disabled={!aiShortMessage}
                      className="bg-slate-800 hover:bg-slate-700 text-white px-3 py-1.5 rounded text-xs font-bold flex items-center gap-1.5 transition disabled:opacity-50 cursor-pointer"
                    >
                      {copiedShort ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                      <span>{copiedShort ? 'Copied to Clipboard!' : 'Copy Short Msg'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleShareWhatsApp}
                      disabled={!aiShortMessage}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded text-xs font-bold flex items-center gap-1.5 transition disabled:opacity-50 cursor-pointer"
                    >
                      <Share2 className="h-3.5 w-3.5" />
                      <span>Send to WhatsApp</span>
                    </button>
                  </div>
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
                <span>LOG TO OCC INCIDENT STREAM & PERSIST IN FIRESTORE</span>
              </button>
              {submitSuccess && (
                <p className="text-xs text-emerald-400 font-bold text-center mt-2 flex items-center justify-center gap-1">
                  <CheckCircle className="h-4 w-4" />
                  <span>Fault successfully broadcast & recorded in OCC Incident Stream!</span>
                </p>
              )}
            </div>
          </div>
        </div>

        {/* STEP 4: LIVE FAULT LOGS & RECENT INCIDENTS TABLE */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-2xl">
          <div className="p-4 bg-slate-950 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-widest">
                LIVE FAULT LEDGER
              </span>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <span>Recent Mainline Fault Reports ({filteredReports.length})</span>
              </h3>
            </div>

            {/* Table Filters */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter by Train, Location, Type..."
                className="bg-slate-900 border border-slate-700 rounded px-2.5 py-1 text-xs text-slate-200 focus:border-emerald-500 focus:outline-none"
              />

              <select
                value={filterRole}
                onChange={(e) => setFilterRole(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-300 focus:outline-none"
              >
                <option value="ALL">All Roles</option>
                <option value="ALS">ALS</option>
                <option value="CC">CC</option>
                <option value="TRAIN OPERATOR">Train Operator</option>
              </select>

              <select
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
                  <th className="p-3 w-28">Train & Line</th>
                  <th className="p-3 w-40">Location</th>
                  <th className="p-3">Fault Classification & Summary</th>
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
                          <span className="font-bold text-rose-300 flex items-center gap-1">
                            <AlertOctagon className="h-3.5 w-3.5 text-rose-400 shrink-0" />
                            <span>{report.faultType}</span>
                          </span>
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
    </div>
  );
}
