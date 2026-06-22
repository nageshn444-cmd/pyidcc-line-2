/* eslint-disable react/prop-types */
import React, { useState } from 'react';
import { db } from '../firebase';
import { writeBatch, doc, collection, getDocs, query, where, serverTimestamp } from 'firebase/firestore';
import { GoogleGenerativeAI } from '@google/generative-ai';
import * as XLSX from 'xlsx';
import { BMRCL_CREW_REGISTRY } from '../data/bmrclCrewRegistry';
import {
  UploadCloud, Loader2, FileSpreadsheet, FileText, Image as ImageIcon,
  CheckCircle2, AlertTriangle, Sparkles, Check, X, Cpu, RefreshCw, Edit2
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────
const STATION_CODES = ["BIET", "NGSA", "PYID", "YPM", "RJNR", "KGWA", "NLC", "RVR", "PUTH", "APTS"];

// Model fallback chain – tries each in order until one succeeds
// Using only stable, currently available v1beta models (Jun 2026)
const MODEL_CHAIN = [
  "gemini-2.5-flash",      // Primary: best quality, fast thinking
  "gemini-2.0-flash",      // Fallback 1: stable & widely available
  "gemini-2.0-flash-lite", // Fallback 2: lightweight, high availability
];

// ─────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────
const fileToGenerativePart = async (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      resolve({
        inlineData: {
          data: reader.result.split(',')[1],
          mimeType: file.type || 'image/jpeg'
        }
      });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Calls Gemini with retry + model-chain fallback.
 * Handles 503/429 overload AND 404 model-not-found errors gracefully.
 */
const callGeminiWithFallback = async (contentParts, apiKey, onStatus, maxRetries = 3) => {
  const lastModelIdx = MODEL_CHAIN.length - 1;

  for (let mIdx = 0; mIdx < MODEL_CHAIN.length; mIdx++) {
    const modelName = MODEL_CHAIN[mIdx];
    const isLastModel = mIdx === lastModelIdx;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        onStatus(`Querying ${modelName} (attempt ${attempt}/${maxRetries})...`);
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({
          model: modelName,
          generationConfig: { responseMimeType: 'application/json' }
        });
        const result = await model.generateContent(contentParts);
        return result.response.text();
      } catch (err) {
        const msg = err.message || '';
        const isOverload = msg.includes('503') || msg.includes('overload') ||
          msg.includes('high demand') || msg.includes('429');
        // 404 = model deprecated/removed; skip to next model immediately
        const isNotFound = msg.includes('404') || msg.includes('not found') ||
          msg.includes('not supported') || msg.includes('ListModels');
        const isLastAttempt = attempt === maxRetries;

        if (isNotFound) {
          // Model unavailable – no point retrying, switch immediately
          onStatus(`${modelName} not available – switching to next model...`);
          break;
        }
        if (isOverload && !isLastAttempt) {
          const delay = attempt * 4000; // 4s, 8s, 12s
          onStatus(`${modelName} overloaded – retrying in ${delay / 1000}s...`);
          await sleep(delay);
          continue;
        }
        if ((isOverload || isLastAttempt) && !isLastModel) {
          onStatus(`${modelName} unavailable – switching to fallback model...`);
          break; // break retry loop → try next model
        }
        if (isLastModel) {
          throw new Error(`All Gemini models failed. Last error: ${msg}`);
        }
        throw err;
      }
    }
  }
  throw new Error('All Gemini models are currently unavailable. Please check your API key or try again later.');
};

const cleanJsonString = (str) => {
  let cleaned = str.trim();
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    return cleaned.substring(firstBrace, lastBrace + 1);
  }
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```[a-zA-Z]*\n/, '').replace(/\n```$/, '');
  }
  return cleaned.trim();
};

const validateRecord = (record) => {
  const errors = [];
  const empId = String(record.empNo || '').trim();
  const empName = String(record.name || '').trim();
  const signOnLoc = String(record.signOnLocation || '').toUpperCase().trim();
  const signOffLoc = String(record.signOffLocation || '').toUpperCase().trim();
  const trainId = record.trainId ? String(record.trainId).trim() : null;

  // 1. Crew registry check
  if (empId && empId !== '--') {
    const match = BMRCL_CREW_REGISTRY.find((c) => String(c.id) === empId);
    if (!match) {
      errors.push(`Emp ID "${empId}" not found in BMRCL registry.`);
    } else if (empName && empName !== '--') {
      const cleanMatch = match.name.toLowerCase().replace(/[^a-z]/g, '');
      const cleanInput = empName.toLowerCase().replace(/[^a-z]/g, '');
      // Allow partial name match (first name match is sufficient)
      const firstWordInput = empName.split(' ')[0].toLowerCase();
      if (!cleanMatch.includes(cleanInput) && !cleanInput.includes(cleanMatch) &&
        !cleanMatch.startsWith(firstWordInput)) {
        errors.push(`Name mismatch: registry has "${match.name}", got "${empName}".`);
      }
    }
  }

  // 2. Station code check (only check if it looks like a station code, not "Depot")
  const stationLookups = [signOnLoc, signOffLoc].filter((s) =>
    s && s !== '--' && s !== 'DEPOT' && s.length <= 6
  );
  stationLookups.forEach((st) => {
    if (!STATION_CODES.includes(st)) {
      errors.push(`Station code "${st}" not in official Line 2 station list.`);
    }
  });

  // 3. Train ID range check (only if a numeric train ID is given)
  if (trainId && trainId !== '--' && trainId !== 'UNASSIGNED') {
    const tNum = parseInt(trainId, 10);
    if (!isNaN(tNum) && (tNum < 201 || tNum > 223)) {
      errors.push(`Train ID "${trainId}" is outside Line 2 range (201-223).`);
    }
  }

  return errors;
};

// ─────────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────────
export default function AiDataExtractorEngine({ activeDay = 'WEEKDAY', onImportComplete }) {
  const [file, setFile] = useState(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState('IDLE'); // IDLE | PROCESSING | REVIEW | COMPLETE
  const [progressVal, setProgressVal] = useState(0);
  const [statusMsg, setStatusMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Review data
  const [docType, setDocType] = useState('');
  const [confidence, setConfidence] = useState(0);
  const [extractedRecords, setExtractedRecords] = useState([]);
  const [validationErrorsCount, setValidationErrorsCount] = useState(0);

  // Editing states
  const [editingIndex, setEditingIndex] = useState(null);
  const [editForm, setEditForm] = useState({
    dutyNo: '',
    name: '',
    empNo: '',
    signOnTime: '',
    signOnLocation: '',
    trainId: ''
  });

  // ── Drag & Drop ──────────────────────────────────────────────
  const handleDrag = (e) => {
    e.preventDefault(); e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true);
    else if (e.type === 'dragleave') setDragActive(false);
  };
  const handleDrop = (e) => {
    e.preventDefault(); e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files?.[0]) processUpload(e.dataTransfer.files[0]);
  };
  const handleFileChange = (e) => {
    if (e.target.files?.[0]) processUpload(e.target.files[0]);
  };

  // ── Main Upload & Extraction Pipeline ────────────────────────
  const processUpload = async (uploadedFile) => {
    setFile(uploadedFile);
    setStep('PROCESSING');
    setProgressVal(10);
    setStatusMsg('Reading uploaded file...');
    setErrorMsg('');

    if (uploadedFile.type.startsWith('image/')) {
      setFilePreviewUrl(URL.createObjectURL(uploadedFile));
    } else {
      setFilePreviewUrl('');
    }

    try {
      const fileExt = uploadedFile.name.split('.').pop().toLowerCase();
      const isSpreadsheet = uploadedFile.type.includes('spreadsheet') ||
        uploadedFile.type.includes('csv') || uploadedFile.type.includes('excel') ||
        ['xlsx', 'xls', 'csv'].includes(fileExt);
      const isTextFile = uploadedFile.type.startsWith('text/') ||
        ['txt', 'json', 'xml', 'md', 'csv'].includes(fileExt);

      let textContext = '';
      let filePart = null;

      // ── Parse locally where possible ──────────────────────────
      if (isSpreadsheet) {
        setProgressVal(25);
        setStatusMsg('Parsing spreadsheet locally...');
        const binaryData = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (evt) => resolve(evt.target.result);
          reader.onerror = reject;
          reader.readAsBinaryString(uploadedFile);
        });
        const wb = XLSX.read(binaryData, { type: 'binary' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        textContext = XLSX.utils.sheet_to_csv(sheet);
      } else if (isTextFile) {
        setProgressVal(25);
        setStatusMsg('Reading text file...');
        textContext = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsText(uploadedFile);
        });
      } else {
        setProgressVal(35);
        setStatusMsg('Encoding binary document for AI...');
        filePart = await fileToGenerativePart(uploadedFile);
      }

      setProgressVal(45);

      // ── Build the Gemini prompt ────────────────────────────────
      // BMRCL PYID roster prompt – aligned to actual document layout
      const promptText = `You are an AI Operational Data Extraction Engine for BMRCL (Bangalore Metro Rail Corporation Limited) Line 2 - Peenya Industry Depot (PYID).

Analyze the provided roster/operational document and extract ALL structured crew duty records.

IMPORTANT COLUMN LAYOUT NOTE (for BMRCL daily roster sheets):
- Column 1: Duty No (e.g. 1, 2, 3, Stdby, Rd3 Induct, PYID UP, Dpo-Rd3, etc.)
- Column 2: Sign On Time (HH:MM format, e.g. 06:00, 07:00, 06:05)
- Column 3: Sign On Location / Station Code (e.g. PYID, KGWA, Depot, TGTP)
- Column 4: Operator NAME (the person's name, e.g. Sooraj, Sunil PN, Mohammed Rafiq)
- Column 5: Emp No (Employee Number, e.g. 22296, 22240, 22297)
- Column 6: Sign Off Time
- Column 7: Sign Off Location
- Some rows may have a separate CC (Crew Controller) sub-column on the same row.

*** CRITICAL DUPLICATION RULES ***:
1. Each physical roster row = EXACTLY ONE duty record in the output. Do NOT split a row into multiple records.
2. If a row has both a primary operator AND a CC controller side-by-side, extract ONLY the PRIMARY OPERATOR (Columns 4 & 5) as the duty record. Ignore the CC side-column data.
3. Do NOT produce two records with the same Duty No unless they are truly different physical rows with different duty numbers.
4. Do NOT repeat the same employee name more than once unless they genuinely appear on different duty rows with a different Duty No.
5. Numbered duties (1, 2, 3, 4 ... 25 etc.) should appear ONCE each.

Also detect:
- Document date (look for date in header like "22 June 2026", "22.6", "22/6/2026")
- Day of week (WEEKDAY, MONDAY, SATURDAY, SUNDAY)

For each duty row found, extract:
{
  "dutyNo": "string (the duty number or duty type, e.g. '1', '2', 'Stdby', 'No PDC', 'KGWA Dn', 'PYID UP', 'Dpo-Rd3')",
  "name": "string (operator full name as written)",
  "empNo": "string (employee number, digits only, e.g. '22296')",
  "signOnTime": "string (HH:MM format, e.g. '06:00')",
  "signOnLocation": "string (station code, e.g. 'PYID', 'KGWA', 'Depot', 'TGTP')",
  "signOffTime": "string (HH:MM or '--' if not available)",
  "signOffLocation": "string (station code or '--')",
  "trainId": "string or null (train number if visible, e.g. '201', null if not applicable)"
}

Return a SINGLE JSON object:
{
  "documentType": "DailyRoster",
  "rosterDate": "YYYY-MM-DD or null",
  "dayOfWeek": "WEEKDAY | MONDAY | SATURDAY | SUNDAY or null",
  "confidence": <number 0-100>,
  "duties": [ ... array of duty objects as described above ... ]
}

Extract EVERY unique duty row. If a field is missing, use "--". REMEMBER: one physical row = one JSON object. No duplicates.`;

      let contentParts = [];
      if (textContext) {
        contentParts = [`Here is the document content:\n\`\`\`\n${textContext}\n\`\`\`\n\n${promptText}`];
      } else {
        contentParts = [promptText, filePart];
      }

      // ── Gemini API call with retry + model fallback ────────────
      setProgressVal(50);
      const apiKey = localStorage.getItem('custom_gemini_api_key') ||
        import.meta.env.VITE_GEMINI_API_KEY ||
        '';

      const responseText = await callGeminiWithFallback(
        contentParts,
        apiKey,
        (msg) => setStatusMsg(msg),
        3
      );

      setProgressVal(78);
      setStatusMsg('Parsing AI response...');

      const responseJson = JSON.parse(cleanJsonString(responseText));
      const rawDuties = responseJson.duties || [];

      setProgressVal(83);
      setStatusMsg('Deduplicating records...');

      // ── Client-side deduplication ──────────────────────────────
      // Key: dutyNo (trim + lowercase). If same dutyNo appears twice,
      // flag the SECOND+ occurrences as duplicates so user can review.
      const seenDutyKeys = new Map(); // key → first-seen index
      const deduped = rawDuties.map((d, i) => {
        const dutyKey = String(d.dutyNo || '').trim().toLowerCase();
        // Empty / '--' duty numbers are allowed to repeat (free duties)
        if (!dutyKey || dutyKey === '--') return { ...d, _dupKey: `noduty_${i}`, _isDuplicate: false };
        if (seenDutyKeys.has(dutyKey)) {
          return { ...d, _dupKey: dutyKey, _isDuplicate: true };
        }
        seenDutyKeys.set(dutyKey, i);
        return { ...d, _dupKey: dutyKey, _isDuplicate: false };
      });

      setProgressVal(88);
      setStatusMsg('Validating against BMRCL master registries...');

      // ── Validation against BMRCL registry ─────────────────────
      const validated = deduped.map((d) => {
        const empId = String(d.empNo || '').trim();
        const errors = validateRecord({ ...d, empNo: empId });
        // Duplicate rows always get a validation warning too
        if (d._isDuplicate) errors.unshift(`Duplicate Duty No "${d.dutyNo}" detected – verify or delete this row.`);
        return { ...d, empNo: empId, validationErrors: errors };
      });

      const totalErrors = validated.reduce((acc, r) => acc + r.validationErrors.length, 0);

      // Store detected date/schedule info for use at import time
      setDocType(responseJson.documentType || 'DailyRoster');
      setConfidence(responseJson.confidence || 80);
      setExtractedRecords(validated.map((r) => ({ ...r, _rosterDate: responseJson.rosterDate, _dayOfWeek: responseJson.dayOfWeek })));
      setValidationErrorsCount(totalErrors);

      setProgressVal(100);
      setTimeout(() => setStep('REVIEW'), 400);

    } catch (err) {
      console.error('AI Extraction Error:', err);
      setErrorMsg(err.message || 'Unknown error during extraction.');
      setStep('IDLE');
      setProgressVal(0);
    }
  };

  // ── Approve Import → Write to Firestore with EXACT schema ────
  const handleApproveImport = async () => {
    setLoading(true);
    setStatusMsg('Resolving crew links from master roster...');
    setStep('PROCESSING');
    setProgressVal(20);

    try {
      // Determine effective schedule type (use detected day or prop)
      const firstRec = extractedRecords[0];
      let scheduleType = activeDay;
      if (firstRec?._dayOfWeek) {
        const d = firstRec._dayOfWeek.toUpperCase();
        if (['WEEKDAY', 'MONDAY', 'SATURDAY', 'SUNDAY'].includes(d)) scheduleType = d;
      }
      const rosterDate = firstRec?._rosterDate || new Date().toISOString().split('T')[0];

      // ── Step 1: Fetch crew_final_links to resolve train IDs per duty ──
      setStatusMsg('Fetching master crew links for train ID mapping...');
      const linksQuery = query(collection(db, 'crew_final_links'), where('scheduleType', '==', scheduleType));
      const linksSnapshot = await getDocs(linksQuery);
      const linksMap = {}; // dutyId → link doc data
      linksSnapshot.docs.forEach((docSnap) => {
        const data = docSnap.data();
        const dId = String(data.dutyId).trim();
        linksMap[dId] = data;
      });

      setProgressVal(45);
      setStatusMsg('Writing deployment records to Firestore...');

      const batch = writeBatch(db);
      let deployCount = 0;
      let trackCount = 0;

      extractedRecords.forEach((rec) => {
        const dutyNo = String(rec.dutyNo || '').trim();
        const empId = String(rec.empNo || '').trim();
        const empName = String(rec.name || '').trim().toUpperCase();
        const signOnTime = rec.signOnTime && rec.signOnTime !== '--' ? rec.signOnTime : '06:00';

        if (!dutyNo) return; // skip rows with no duty number

        // ── crew_daily_deployment (exact schema matching GccRosterUploader) ──
        // Document ID follows the same pattern as GccRosterUploader and AutomatedDispatchGate
        const deployDocId = dutyNo === 'UNASSIGNED' || !dutyNo
          ? `gcc_deploy_${scheduleType.toLowerCase()}_extra_${empId}`
          : `gcc_deploy_${scheduleType.toLowerCase()}_duty_${dutyNo}`;

        // Resolve train IDs from crew_final_links
        const linkData = linksMap[dutyNo] || {};
        const trainId = rec.trainId && rec.trainId !== '--'
          ? String(rec.trainId)
          : (linkData.trainId || '--');

        const l1Train = trainId;
        const l1Start = signOnTime;
        const l1End = linkData.leg2ArrTime || '--';
        const l2Train = linkData.leg2TrainNo || '--';
        const l2Start = linkData.leg2DepTime || '--';
        const l2End = linkData.leg3HandoverTime || '--';
        const l3Train = linkData.leg3TrainNo || '--';
        const l3Start = linkData.leg3TakeoverTime || '--';
        const l3End = linkData.leg4FinalArrTime || '--';
        const l4Train = linkData.leg4TrainNo || '--';
        const l4Start = linkData.leg4FinalArrTime || '--';
        const l4End = linkData.signOffTime || '--';

        batch.set(doc(db, 'crew_daily_deployment', deployDocId), {
          scheduleType: scheduleType,
          dutyId: dutyNo,
          empId: empId,
          empName: empName,
          trainId: trainId,
          signOnTime: signOnTime,
          remarks: 'GCC AI Ingest – OCR Engine',
          lastUpdated: serverTimestamp(),
          rawLegs: {
            l1Train,
            l1Start,
            l1End,
            l2Train,
            l2Start,
            l2End,
            l3Train,
            l3Start,
            l3End,
            l4Train,
            l4Start,
            l4End
          }
        }, { merge: true });
        deployCount++;

        // ── daily_crew_tracks (exact schema matching GccRosterUploader) ──
        // Write for each valid train ID in the duty legs
        const trainLegs = [l1Train, l2Train, l3Train, l4Train]
          .map((t) => parseInt(t, 10))
          .filter((t) => !isNaN(t) && t >= 201 && t <= 223);

        trainLegs.forEach((tid) => {
          const trackDocRef = doc(db, 'daily_crew_tracks', `${rosterDate}_${tid}`);
          batch.set(trackDocRef, {
            date: rosterDate,
            trainId: tid,
            isShortLoopActive: false,
            currentOperator: {
              employeeId: empId,
              name: empName,
              dutyNumber: dutyNo
            }
          }, { merge: true });
          trackCount++;
        });
      });

      setProgressVal(80);
      setStatusMsg(`Committing batch with ${deployCount} deployments and ${trackCount} tracks to database...`);
      await batch.commit();

      setProgressVal(100);
      setStep('COMPLETE');

      if (onImportComplete) onImportComplete();

    } catch (err) {
      console.error('Import Error:', err);
      setErrorMsg(`Import Failed: ${err.message}`);
      setStep('REVIEW');
    } finally {
      setLoading(false);
    }
  };

  const resetState = () => {
    setFile(null);
    setFilePreviewUrl('');
    setStep('IDLE');
    setProgressVal(0);
    setStatusMsg('');
    setErrorMsg('');
    setDocType('');
    setConfidence(0);
    setExtractedRecords([]);
    setValidationErrorsCount(0);
    setEditingIndex(null);
  };

  const startEditing = (idx, record) => {
    setEditingIndex(idx);
    setEditForm({
      dutyNo: record.dutyNo || '',
      name: record.name || '',
      empNo: record.empNo || '',
      signOnTime: record.signOnTime || '',
      signOnLocation: record.signOnLocation || '',
      trainId: record.trainId || ''
    });
  };

  const cancelEdit = () => {
    setEditingIndex(null);
  };

  const deleteRow = (idx) => {
    const updated = extractedRecords.filter((_, i) => i !== idx);
    setExtractedRecords(updated);
    if (editingIndex === idx) setEditingIndex(null);
    const totalErrors = updated.reduce((acc, r) => acc + (r.validationErrors?.length || 0), 0);
    setValidationErrorsCount(totalErrors);
  };

  const saveEdit = (idx) => {
    const updated = [...extractedRecords];
    const originalRecord = updated[idx];
    const editedRecord = {
      ...originalRecord,
      dutyNo: editForm.dutyNo,
      name: editForm.name,
      empNo: editForm.empNo,
      signOnTime: editForm.signOnTime,
      signOnLocation: editForm.signOnLocation,
      trainId: editForm.trainId === '' ? null : editForm.trainId
    };

    // Re-evaluate duplication after edit
    const seenDutyKeys = new Set();
    const reChecked = updated.map((r, i) => {
      const record = i === idx ? editedRecord : r;
      const dutyKey = String(record.dutyNo || '').trim().toLowerCase();
      let isDup = false;
      if (dutyKey && dutyKey !== '--') {
        if (seenDutyKeys.has(dutyKey)) isDup = true;
        else seenDutyKeys.add(dutyKey);
      }
      const errs = validateRecord(record);
      if (isDup) errs.unshift(`Duplicate Duty No "${record.dutyNo}" detected – verify or delete this row.`);
      return { ...record, _isDuplicate: isDup, validationErrors: errs };
    });

    setExtractedRecords(reChecked);
    setEditingIndex(null);

    const totalErrors = reChecked.reduce((acc, r) => acc + (r.validationErrors?.length || 0), 0);
    setValidationErrorsCount(totalErrors);
  };

  // ─────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-2xl font-mono text-xs">
      {/* Header */}
      <div className="px-4 py-3 bg-slate-950/80 border-b border-slate-800 flex justify-between items-center">
        <span className="flex items-center gap-1.5 text-emerald-400 font-bold tracking-wide">
          <Cpu className="h-4 w-4 text-emerald-500 animate-pulse" />
          AI-POWERED DATA EXTRACTION ENGINE
        </span>
        <div className="flex items-center gap-2">
          <span className="bg-emerald-500/10 text-emerald-400 text-[9px] px-2.5 py-0.5 rounded border border-emerald-500/20 font-black">
            MULTIMODAL OCR
          </span>
          <span className="bg-cyan-500/10 text-cyan-400 text-[9px] px-2.5 py-0.5 rounded border border-cyan-499/20 font-black">
            AUTO-RETRY
          </span>
        </div>
      </div>

      <div className="p-5 space-y-4">
        {/* ─── IDLE: Dropzone ─── */}
        {step === 'IDLE' && (
          <div
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all duration-300 relative group ${dragActive
                ? 'border-emerald-500 bg-emerald-950/10 shadow-[0_0_20px_rgba(16,185,129,0.07)]'
                : 'border-slate-800 bg-slate-950/10 hover:border-slate-700 hover:bg-slate-950/20'
              }`}
          >
            <input
              type="file"
              onChange={handleFileChange}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              accept=".csv,.txt,.xlsx,.xls,.pdf,.docx,image/*"
            />
            <div className="flex flex-col items-center justify-center space-y-3 pointer-events-none">
              <div className="h-12 w-12 bg-slate-950 border border-slate-800 rounded-full flex items-center justify-center group-hover:scale-105 transition-transform duration-300">
                <UploadCloud className="h-6 w-6 text-slate-400 group-hover:text-emerald-400 transition-colors" />
              </div>
              <div className="space-y-1">
                <p className="text-slate-200 font-bold uppercase tracking-wider">
                  Drag &amp; Drop Roster / Timetable Document
                </p>
                <p className="text-slate-500 text-[10px]">
                  PDF · JPG / PNG (scanned images) · Excel (.xlsx / .xls) · CSV · Word (.docx) · TXT
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-1.5 pt-2">
                {[
                  { icon: FileSpreadsheet, label: 'Excel / CSV', color: 'text-emerald-500' },
                  { icon: FileText, label: 'PDF & Docs', color: 'text-cyan-500' },
                  { icon: ImageIcon, label: 'Images', color: 'text-amber-500' }
                ].map(({ icon: Icon, label, color }) => (
                  <span key={label} className="flex items-center gap-1 text-[8px] bg-slate-950 border border-slate-800 px-2 py-0.5 rounded text-slate-400">
                    <Icon className={`h-3 w-3 ${color}`} /> {label}
                  </span>
                ))}
              </div>
              <p className="text-[9px] text-slate-600 mt-1">
                ⚡ Auto-retry on API overload · Model fallback chain enabled
              </p>
            </div>
          </div>
        )}

        {/* ─── PROCESSING ─── */}
        {step === 'PROCESSING' && (
          <div className="border border-slate-800 bg-slate-950/20 rounded-lg p-6 flex flex-col items-center justify-center space-y-4">
            <Loader2 className="h-8 w-8 text-emerald-400 animate-spin" />
            <div className="w-full max-w-sm space-y-1.5 text-center">
              <div className="flex justify-between text-[10px] text-slate-400 uppercase tracking-widest font-bold">
                <span>{statusMsg}</span>
                <span className="text-emerald-400">{progressVal}%</span>
              </div>
              <div className="h-1.5 w-full bg-slate-950 border border-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-emerald-600 to-cyan-500 transition-all duration-500"
                  style={{ width: `${progressVal}%` }}
                />
              </div>
              <p className="text-[9px] text-slate-600 mt-1">
                Auto-retrying on 503 · Switching models if needed
              </p>
            </div>
          </div>
        )}

        {/* Error Banner (shown above IDLE after failure) */}
        {errorMsg && step === 'IDLE' && (
          <div className="bg-rose-950/30 border border-rose-500/30 rounded-lg p-4 flex gap-3 items-start">
            <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-rose-300 font-bold uppercase tracking-wide text-[10px]">Extraction Failed</p>
              <p className="text-rose-400/80 text-[10px] mt-0.5 leading-relaxed">{errorMsg}</p>
              <button
                onClick={resetState}
                className="mt-2 flex items-center gap-1 text-[9px] text-rose-400 hover:text-rose-300 font-bold uppercase tracking-wide"
              >
                <RefreshCw size={10} /> Try Again
              </button>
            </div>
          </div>
        )}

        {/* ─── REVIEW ─── */}
        {step === 'REVIEW' && (
          <div className="space-y-5">
            {/* Summary Banner */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                {
                  icon: <Cpu className="h-6 w-6 text-emerald-500 shrink-0" />,
                  label: 'Document Type',
                  value: docType.replace(/([A-Z])/g, ' $1').trim()
                },
                {
                  icon: <Sparkles className="h-6 w-6 text-amber-500 shrink-0" />,
                  label: 'AI Confidence',
                  value: <span className={confidence > 85 ? 'text-emerald-400' : confidence > 60 ? 'text-amber-400' : 'text-rose-400'}>{confidence.toFixed(0)}%</span>
                },
                {
                  icon: <AlertTriangle className={`h-6 w-6 shrink-0 ${validationErrorsCount > 0 ? 'text-rose-400 animate-pulse' : 'text-emerald-400'}`} />,
                  label: 'Validation Warnings',
                  value: <span className={validationErrorsCount > 0 ? 'text-rose-400' : 'text-emerald-400'}>{validationErrorsCount} Warnings</span>
                },
                {
                  icon: <FileText className="h-6 w-6 text-cyan-500 shrink-0" />,
                  label: 'Records Extracted',
                  value: <span className="text-slate-200">{extractedRecords.length} Duties</span>
                }
              ].map(({ icon, label, value }) => (
                <div key={label} className="bg-slate-950/40 border border-slate-800 p-3 rounded-lg flex items-center gap-3">
                  {icon}
                  <div>
                    <label className="block text-[8px] text-slate-500 uppercase tracking-wider">{label}</label>
                    <span className="font-bold text-sm text-slate-100">{value}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Validation Warning Banner */}
            {validationErrorsCount > 0 && (
              <div className="bg-rose-950/20 border border-rose-500/20 p-3.5 rounded-lg flex gap-3 text-rose-400">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-bold uppercase tracking-wider">Registry Inconsistencies Detected</p>
                  <p className="text-[10px] text-rose-300 leading-normal">
                    Some records have validation issues, unregistered employee IDs, name mismatches, or <span className="text-amber-400 font-bold">duplicate duty numbers</span> (amber rows).
                    Use the <span className="text-emerald-400">✏ Edit</span> button to fix data or the <span className="text-rose-400">✕ Delete</span> button to remove duplicates before approving.
                  </p>
                </div>
              </div>
            )}

            {/* Two-column layout: preview + table */}
            <div className="grid grid-cols-1 xl:grid-cols-5 gap-5">
              {/* Document Preview */}
              <div className="xl:col-span-2 space-y-2">
                <label className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Document Preview</label>
                <div className="bg-slate-950/80 border border-slate-800 rounded-lg h-72 flex items-center justify-center overflow-hidden">
                  {filePreviewUrl ? (
                    <img src={filePreviewUrl} alt="Roster preview" className="max-h-full max-w-full object-contain p-2" />
                  ) : (
                    <div className="text-center p-6 space-y-3">
                      {file?.name.toLowerCase().endsWith('.pdf')
                        ? <FileText className="h-12 w-12 text-cyan-500 mx-auto animate-pulse" />
                        : <FileSpreadsheet className="h-12 w-12 text-emerald-500 mx-auto animate-pulse" />}
                      <p className="text-slate-300 font-bold uppercase tracking-wide truncate max-w-[240px]" title={file?.name}>{file?.name}</p>
                      <p className="text-slate-500 text-[10px]">AI-processed · Binary Ingestion Pipeline</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Extracted Records Table */}
              <div className="xl:col-span-3 space-y-2">
                <label className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Extracted Duty Records</label>
                <div className="border border-slate-800 rounded-lg overflow-hidden bg-slate-950/40 h-72 overflow-y-auto">
                  <table className="w-full text-left border-collapse text-[10px]">
                    <thead className="bg-slate-950 text-slate-500 uppercase tracking-widest text-[8px] sticky top-0 border-b border-slate-800 z-10">
                      <tr>
                        <th className="p-2 w-8">#</th>
                        <th className="p-2">Duty</th>
                        <th className="p-2">Operator (Emp ID)</th>
                        <th className="p-2">Sign On</th>
                        <th className="p-2">Loc</th>
                        <th className="p-2">Train</th>
                        <th className="p-2 text-right w-24">Status/Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/40 text-slate-300">
                      {extractedRecords.map((row, idx) => {
                        const hasErrors = row.validationErrors?.length > 0;
                        const isDup = row._isDuplicate === true;
                        const isEditing = editingIndex === idx;

                        // Row highlight: amber for pure duplicates, rose for validation errors, none for clean
                        const rowBg = isDup
                          ? 'bg-amber-950/20'
                          : hasErrors
                            ? 'bg-rose-950/10'
                            : '';

                        return (
                          <tr
                            key={idx}
                            className={`hover:bg-slate-900/30 transition-colors ${rowBg}`}
                          >
                            <td className="p-2 text-slate-500 font-semibold">{idx + 1}</td>

                            {/* Duty No */}
                            <td className="p-2 font-bold text-amber-400">
                              {isEditing ? (
                                <input
                                  type="text"
                                  className="bg-slate-950 border border-slate-800 text-amber-400 font-bold px-1.5 py-0.5 rounded w-16"
                                  value={editForm.dutyNo}
                                  onChange={(e) => setEditForm({ ...editForm, dutyNo: e.target.value })}
                                />
                              ) : (
                                row.dutyNo || '--'
                              )}
                            </td>

                            {/* Operator Name & Emp ID */}
                            <td className="p-2">
                              {isEditing ? (
                                <div className="space-y-1 w-32">
                                  <input
                                    type="text"
                                    className="bg-slate-950 border border-slate-800 text-slate-200 font-semibold px-1.5 py-0.5 rounded w-full"
                                    value={editForm.name}
                                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                                    placeholder="Name"
                                  />
                                  <input
                                    type="text"
                                    className="bg-slate-950 border border-slate-800 text-slate-400 text-[9px] px-1.5 py-0.5 rounded w-full"
                                    value={editForm.empNo}
                                    onChange={(e) => setEditForm({ ...editForm, empNo: e.target.value })}
                                    placeholder="Emp ID"
                                  />
                                </div>
                              ) : (
                                <>
                                  <span className="font-semibold block text-slate-200">{row.name || '--'}</span>
                                  <span className="text-[8px] text-slate-500">ID: {row.empNo || '--'}</span>
                                </>
                              )}
                            </td>

                            {/* Sign On Time */}
                            <td className="p-2 text-emerald-400 font-bold">
                              {isEditing ? (
                                <input
                                  type="text"
                                  className="bg-slate-950 border border-slate-800 text-emerald-400 font-bold px-1.5 py-0.5 rounded w-14"
                                  value={editForm.signOnTime}
                                  onChange={(e) => setEditForm({ ...editForm, signOnTime: e.target.value })}
                                />
                              ) : (
                                row.signOnTime || '--'
                              )}
                            </td>

                            {/* Sign On Location */}
                            <td className="p-2 text-slate-400">
                              {isEditing ? (
                                <input
                                  type="text"
                                  className="bg-slate-950 border border-slate-800 text-slate-400 px-1.5 py-0.5 rounded w-16"
                                  value={editForm.signOnLocation}
                                  onChange={(e) => setEditForm({ ...editForm, signOnLocation: e.target.value })}
                                />
                              ) : (
                                row.signOnLocation || '--'
                              )}
                            </td>

                            {/* Train ID */}
                            <td className="p-2 text-cyan-400 font-bold">
                              {isEditing ? (
                                <input
                                  type="text"
                                  className="bg-slate-950 border border-slate-800 text-cyan-400 font-bold px-1.5 py-0.5 rounded w-14"
                                  value={editForm.trainId || ''}
                                  onChange={(e) => setEditForm({ ...editForm, trainId: e.target.value })}
                                  placeholder="Train"
                                />
                              ) : (
                                row.trainId || '--'
                              )}
                            </td>

                            {/* Actions / Status */}
                            <td className="p-2 text-right">
                              {isEditing ? (
                                <div className="flex items-center justify-end gap-1.5">
                                  <button
                                    onClick={() => saveEdit(idx)}
                                    className="p-1 bg-emerald-600 hover:bg-emerald-500 rounded text-slate-950 transition"
                                    title="Save Edit"
                                  >
                                    <Check size={11} />
                                  </button>
                                  <button
                                    onClick={cancelEdit}
                                    className="p-1 bg-slate-800 hover:bg-slate-700 rounded text-slate-300 transition"
                                    title="Cancel"
                                  >
                                    <X size={11} />
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center justify-end gap-1">
                                  {/* Status badge */}
                                  {isDup ? (
                                    <span
                                      className="text-amber-400 flex items-center gap-1 cursor-help"
                                      title={`Duplicate: ${row.validationErrors?.[0] || ''}`}
                                    >
                                      <AlertTriangle size={11} /> DUP
                                    </span>
                                  ) : hasErrors ? (
                                    <span
                                      className="text-rose-400 flex items-center gap-1 cursor-help"
                                      title={row.validationErrors.join('\n')}
                                    >
                                      <AlertTriangle size={11} /> WARN
                                    </span>
                                  ) : (
                                    <span className="text-emerald-500 flex items-center gap-1">
                                      <Check size={11} /> OK
                                    </span>
                                  )}
                                  {/* Edit button */}
                                  <button
                                    onClick={() => startEditing(idx, row)}
                                    className="p-1 bg-slate-800 hover:bg-slate-700 rounded text-slate-400 hover:text-emerald-400 transition"
                                    title="Edit Row"
                                  >
                                    <Edit2 size={11} />
                                  </button>
                                  {/* Delete button */}
                                  <button
                                    onClick={() => deleteRow(idx)}
                                    className="p-1 bg-slate-800 hover:bg-rose-900 rounded text-slate-400 hover:text-rose-400 transition"
                                    title="Delete Row"
                                  >
                                    <X size={11} />
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Action Bar */}
            <div className="flex justify-end gap-3 border-t border-slate-800/80 pt-4">
              <button
                onClick={resetState}
                className="bg-slate-950 border border-slate-800 hover:bg-slate-900 text-slate-400 text-xs px-4 py-2 rounded-lg font-bold flex items-center gap-1.5 transition uppercase tracking-wide"
              >
                <X size={13} /> Reject
              </button>
              <button
                onClick={handleApproveImport}
                disabled={loading}
                className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-slate-950 text-xs px-5 py-2 rounded-lg font-black flex items-center gap-1.5 transition uppercase tracking-wider shadow-lg shadow-emerald-500/10"
              >
                <Check size={13} /> Approve &amp; Import ({extractedRecords.length} duties)
              </button>
            </div>
          </div>
        )}

        {/* ─── COMPLETE ─── */}
        {step === 'COMPLETE' && (
          <div className="border border-emerald-500/20 bg-emerald-950/5 rounded-lg p-6 flex flex-col items-center justify-center space-y-4 animate-in fade-in zoom-in duration-300">
            <div className="h-12 w-12 bg-emerald-500/15 border border-emerald-500/30 rounded-full flex items-center justify-center">
              <CheckCircle2 className="h-6 w-6 text-emerald-400" />
            </div>
            <div className="text-center space-y-1">
              <p className="text-slate-200 font-bold uppercase tracking-wider text-sm">AI Data Ingestion Successful</p>
              <p className="text-slate-500 text-[10px]">
                Crew deployment records written to <span className="text-emerald-400">crew_daily_deployment</span> and <span className="text-cyan-400">daily_crew_tracks</span> collections.
              </p>
            </div>
            <button
              onClick={resetState}
              className="bg-emerald-600 hover:bg-emerald-500 text-slate-950 text-[10px] px-5 py-2 rounded-lg font-black transition uppercase tracking-wide mt-2"
            >
              Upload Another Document
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
