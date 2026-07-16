/* eslint-disable react/prop-types */
import React, { useState, useCallback, useEffect } from 'react';
import { db } from '../firebase';
import {
  writeBatch, doc, collection, getDocs, query, where, serverTimestamp
} from 'firebase/firestore';
import { GoogleGenerativeAI } from '@google/generative-ai';
import * as XLSX from 'xlsx';
import { BMRCL_CREW_REGISTRY } from '../data/bmrclCrewRegistry';
import { STATION_CHAINAGE, updateStationChainage } from '../utils/kpiEngine';
import {
  UploadCloud, Loader2, FileSpreadsheet, FileText, Image as ImageIcon,
  CheckCircle2, AlertTriangle, Sparkles, Check, X, Cpu, RefreshCw,
  Edit2, Shield, Eye, Info, ChevronDown, ChevronUp, Zap, XCircle, Save,
  KeyRound, Settings, ExternalLink, Copy, Trash2, CheckCircle, Play, AlertCircle, Plus
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────
// CONSTANTS & HELPERS
// ─────────────────────────────────────────────────────────────────
const VALID_DAY_TYPES = ['WEEKDAY', 'MONDAY', 'SATURDAY', 'SUNDAY'];
const MODEL_CHAIN = [
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const fileToGenerativePart = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () =>
      resolve({ inlineData: { data: reader.result.split(',')[1], mimeType: file.type || 'image/jpeg' } });
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

const levenshteinDistance = (a, b) => {
  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[b.length][a.length];
};

const findClosestRegistryEmployeeByName = (extractedName) => {
  if (!extractedName || extractedName === '--') return null;
  const cleanExtracted = extractedName.toLowerCase().replace(/[^a-z]/g, '');
  if (cleanExtracted.length < 3) return null;

  let bestMatch = null;
  let bestScore = 999;

  for (const emp of BMRCL_CREW_REGISTRY) {
    const cleanReg = emp.name.toLowerCase().replace(/[^a-z]/g, '');
    if (cleanReg === cleanExtracted) return emp;
    if (cleanReg.length >= 4 && cleanExtracted.length >= 4) {
      if (cleanReg.includes(cleanExtracted) || cleanExtracted.includes(cleanReg)) {
        return emp;
      }
    }
    const dist = levenshteinDistance(cleanReg, cleanExtracted);
    const maxAllowedDist = Math.max(2, Math.floor(cleanReg.length / 4));
    if (dist <= maxAllowedDist && dist < bestScore) {
      bestScore = dist;
      bestMatch = emp;
    }
  }
  return bestMatch;
};

const alignRecordWithRegistry = (record) => {
  let empNo = String(record.empNo || record.employeeId || '').trim();
  let name = String(record.name || '').trim();

  if (record._manuallyCorrected) {
    return { ...record, empNo, employeeId: empNo, name };
  }

  // Safeguard 1: Swap check
  const empNoIsDigits = /^\d+$/.test(empNo);
  const nameIsDigits = /^\d+$/.test(name);
  if (!empNoIsDigits && nameIsDigits) {
    const temp = empNo;
    empNo = name;
    name = temp;
  }

  // Safeguard 2: empNo has letters, name is empty or digits
  if (!/^\d+$/.test(empNo) && empNo !== '' && empNo !== '--') {
    const matchedByNameInEmpNo = findClosestRegistryEmployeeByName(empNo);
    if (matchedByNameInEmpNo) {
      if (/^\d+$/.test(name)) {
        empNo = name;
        name = matchedByNameInEmpNo.name;
      } else {
        empNo = matchedByNameInEmpNo.id;
        name = matchedByNameInEmpNo.name;
      }
    }
  }

  // Safeguard 3: empNo is digits but name is empty
  if (/^\d+$/.test(empNo) && (!name || name === '--' || name === '')) {
    const matchById = BMRCL_CREW_REGISTRY.find((c) => String(c.id) === empNo);
    if (matchById) {
      return { ...record, empNo, employeeId: empNo, name: matchById.name };
    }
  }

  // Safeguard 4: empNo is empty but name has letters
  if ((!empNo || empNo === '--' || empNo === '') && name && name !== '--') {
    const matchedByName = findClosestRegistryEmployeeByName(name);
    if (matchedByName) {
      return { ...record, empNo: matchedByName.id, employeeId: matchedByName.id, name: matchedByName.name };
    }
  }

  // General registry alignment
  if (empNo && /^\d+$/.test(empNo)) {
    const matchById = BMRCL_CREW_REGISTRY.find((c) => String(c.id) === empNo);
    if (matchById) {
      const cleanRegistryName = matchById.name.toLowerCase().replace(/[^a-z]/g, '');
      const cleanExtractedName = name.toLowerCase().replace(/[^a-z]/g, '');
      const firstWordExtracted = name.split(/[\s.]+/)[0].toLowerCase();
      const firstWordRegistry = matchById.name.split(/[\s.]+/)[0].toLowerCase();

      const isMatch = cleanRegistryName.includes(cleanExtractedName) ||
        cleanExtractedName.includes(cleanRegistryName) ||
        firstWordExtracted === firstWordRegistry ||
        levenshteinDistance(cleanRegistryName, cleanExtractedName) <= 3;

      if (isMatch) {
        return { ...record, empNo, employeeId: empNo, name: matchById.name };
      } else {
        const matchedByFuzzyName = findClosestRegistryEmployeeByName(name);
        if (matchedByFuzzyName) {
          return { ...record, empNo: matchedByFuzzyName.id, employeeId: matchedByFuzzyName.id, name: matchedByFuzzyName.name };
        }
      }
    }
  }

  return { ...record, empNo, employeeId: empNo, name };
};

const sortDuties = (duties) => {
  return [...duties].sort((a, b) => {
    const aDuty = String(a.dutyNo || a.dutyId || '').trim();
    const bDuty = String(b.dutyNo || b.dutyId || '').trim();

    if (aDuty === 'UNASSIGNED' && bDuty !== 'UNASSIGNED') return 1;
    if (bDuty === 'UNASSIGNED' && aDuty !== 'UNASSIGNED') return -1;
    if (!aDuty && bDuty) return 1;
    if (!bDuty && aDuty) return -1;

    const aNum = parseInt(aDuty.replace(/\D/g, ''), 10);
    const bNum = parseInt(bDuty.replace(/\D/g, ''), 10);

    if (!isNaN(aNum) && !isNaN(bNum)) {
      if (aNum !== bNum) return aNum - bNum;
    }
    return aDuty.localeCompare(bDuty, undefined, { numeric: true, sensitivity: 'base' });
  });
};

const validateRecord = (record, docType = 'DailyRoster') => {
  const errors = [];
  const warnings = [];

  if (docType === 'LinkRoster') {
    const dutyId = String(record.dutyId || '').trim();
    if (!dutyId) errors.push('Missing Link Duty ID.');
    const trainId = String(record.leg1TrainNo || record.trainId || '').trim();
    if (trainId && trainId !== '--' && trainId !== 'null') {
      const tidNum = parseInt(trainId, 10);
      if (isNaN(tidNum) || tidNum < 201 || tidNum > 250) {
        errors.push(`Invalid Train ID "${trainId}" (must be between 201 and 250).`);
      }
    }
    return { errors, warnings };
  }

  if (docType === 'DailyRoster') {
    const empId = String(record.empNo || '').trim();
    if (!empId || empId === '--') {
      errors.push("Missing Employee ID.");
    } else if (!/^\d{5}$/.test(empId)) {
      errors.push(`Employee ID "${empId}" is malformed (must be 5 digits).`);
    } else {
      const match = BMRCL_CREW_REGISTRY.find(c => String(c.id) === empId);
      if (!match) {
        errors.push(`Employee ID "${empId}" not found in Crew Registry.`);
      }
    }

    const dutyNo = String(record.dutyNo || '').trim();
    if (!dutyNo || dutyNo === '--') {
      errors.push("Missing Duty Number.");
    }

    const trainId = String(record.trainId || '').trim();
    if (trainId && trainId !== '--' && trainId !== 'null' && trainId !== 'UNASSIGNED') {
      const tidNum = parseInt(trainId, 10);
      if (isNaN(tidNum) || tidNum < 201 || tidNum > 250) {
        errors.push(`Invalid Train ID "${trainId}" (must be between 201 and 250).`);
      }
    }

    const onLoc = String(record.signOnLocation || '').trim().toUpperCase();
    if (onLoc && onLoc !== '--') {
      if (!STATION_CHAINAGE[onLoc] && !['DEPOT', 'TGTP', 'PUTH', 'NGSA', 'PYID'].includes(onLoc)) {
        errors.push(`Invalid Sign-on Station Code "${onLoc}".`);
      }
    }
    const offLoc = String(record.signOffLocation || '').trim().toUpperCase();
    if (offLoc && offLoc !== '--') {
      if (!STATION_CHAINAGE[offLoc] && !['DEPOT', 'TGTP', 'PUTH', 'NGSA', 'PYID'].includes(offLoc)) {
        errors.push(`Invalid Sign-off Station Code "${offLoc}".`);
      }
    }

    if (!record.signOnTime || record.signOnTime === '--') {
      errors.push("Missing Sign-on Time.");
    } else if (!/^\d{2}:\d{2}(?::\d{2})?$/.test(record.signOnTime)) {
      warnings.push(`Sign-on time "${record.signOnTime}" is malformed (expected HH:MM).`);
    }

    if (!record.signOffTime || record.signOffTime === '--') {
      warnings.push("Missing Sign-off Time.");
    } else if (record.signOffTime !== '--' && !/^\d{2}:\d{2}(?::\d{2})?$/.test(record.signOffTime)) {
      warnings.push(`Sign-off time "${record.signOffTime}" is malformed (expected HH:MM).`);
    }
  } else if (docType === 'ChainageFile') {
    const code = String(record.stationCode || '').trim().toUpperCase();
    if (!code) errors.push("Missing Station Code.");
    const chainage = parseFloat(record.chainage);
    if (isNaN(chainage)) errors.push("Invalid or missing Chainage value.");
  } else if (docType === 'TrainTimetable') {
    const trainId = String(record.trainId || '').trim();
    if (!trainId) errors.push("Missing Timetable Train ID.");
  }

  return { errors, warnings };
};

// ── Dynamic Document Classifier ──
const detectDocumentType = (text) => {
  if (!text) return 'DailyRoster';
  const clean = text.toLowerCase();
  if (clean.includes('chainage') || clean.includes('station_chainage') || clean.includes('distance master')) {
    return 'ChainageFile';
  }
  if (clean.includes('timetable') || clean.includes('time table') || clean.includes('wtt') || clean.includes('arrival time')) {
    return 'TrainTimetable';
  }
  if (clean.includes('final link') || clean.includes('link roster') || clean.includes('master link')) {
    return 'LinkRoster';
  }
  if (clean.includes('changeover') || clean.includes('relief link') || clean.includes('handover')) {
    return 'ChangeoverLink';
  }
  if (clean.includes('leave register') || clean.includes('leave approval') || clean.includes('leave request')) {
    return 'LeaveRegister';
  }
  if (clean.includes('incident') || clean.includes('accident') || clean.includes('delay report')) {
    return 'IncidentRegister';
  }
  if (clean.includes('kilometer calculation') || clean.includes('kms calculation') || clean.includes('driver kms')) {
    return 'KilometerFile';
  }
  if (clean.includes('crew registry') || clean.includes('employee registry')) {
    return 'CrewRegistry';
  }
  return 'DailyRoster'; // Default daily roster layout
};

// ── CDN-based Tesseract Loader ──
const loadTesseract = () => {
  return new Promise((resolve, reject) => {
    if (window.Tesseract) {
      resolve(window.Tesseract);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/tesseract.js@5.0.3/dist/tesseract.min.js';
    script.onload = () => resolve(window.Tesseract);
    script.onerror = () => reject(new Error('Failed to load Tesseract OCR engine.'));
    document.head.appendChild(script);
  });
};

const runTesseractOCR = async (file) => {
  const Tesseract = await loadTesseract();
  const worker = await Tesseract.createWorker('eng');
  const ret = await worker.recognize(file);
  await worker.terminate();
  return ret.data.text;
};

// ── Rule-Based Text Extractor ──
const runRuleBasedParser = (text) => {
  const lines = text.split('\n');
  const records = [];

  for (const line of lines) {
    const cleanLine = line.trim();
    if (!cleanLine) continue;

    const empIdMatch = cleanLine.match(/\b\d{5}\b/);
    const trainIdMatch = cleanLine.match(/\b(20[1-9]|2[1-4]\d|250)\b/);
    const stationMatches = cleanLine.match(/\b(BIET|NGSA|PYID|YPM|RJNR|KGWA|NLC|RVR|PUTH|APTS)\b/g);
    const dutyMatch = cleanLine.match(/\b(SB\d+|CC\d+|\d{1,3}|stdby|standby)\b/i);
    const timeMatches = cleanLine.match(/\b\d{2}:\d{2}(?::\d{2})?\b/g);

    if (empIdMatch || dutyMatch) {
      let empId = empIdMatch ? empIdMatch[0] : '';
      let name = '';

      if (empId) {
        const matchedCrew = BMRCL_CREW_REGISTRY.find(c => String(c.id) === empId);
        if (matchedCrew) name = matchedCrew.name;
      }

      if (!name) {
        const words = cleanLine.replace(/[^a-zA-Z\s]/g, '').trim().split(/\s+/);
        const potentialName = words.filter(w => w.length > 2 && w !== w.toLowerCase() && !['BIET', 'NGSA', 'PYID', 'YPM', 'RJNR', 'KGWA', 'NLC', 'RVR', 'PUTH', 'APTS', 'DUTY', 'TRAIN', 'STANDBY', 'STDBY'].includes(w.toUpperCase())).join(' ');
        if (potentialName) name = potentialName;
      }

      records.push({
        dutyNo: dutyMatch ? dutyMatch[0] : 'UNASSIGNED',
        name: name || 'UNKNOWN OPERATOR',
        empNo: empId || '--',
        signOnTime: timeMatches && timeMatches[0] ? timeMatches[0] : '06:00',
        signOnLocation: stationMatches && stationMatches[0] ? stationMatches[0] : 'PYID',
        signOffTime: timeMatches && timeMatches[1] ? timeMatches[1] : '--',
        signOffLocation: stationMatches && stationMatches[1] ? stationMatches[1] : '--',
        trainId: trainIdMatch ? trainIdMatch[0] : '--',
        extractionNote: "Rule-Based regex pattern parsed"
      });
    }
  }
  return records;
};

// ── Local Ollama Mock / Invocations ──
const extractWithLocalOllama = async (file, textContext, modelName, onStatusUpdate) => {
  let text = textContext;
  if (!text) {
    onStatusUpdate(`Local Ollama: Running Tesseract OCR first...`, 45);
    text = await runTesseractOCR(file);
  }

  const prompt = `You are a BMRCL Metro Operations Data Extractor. Extract the structured records from the text below.
Determine the document type (one of: DailyRoster, LinkRoster, TrainTimetable, ChangeoverLink, CrewRegistry, LeaveRegister, IncidentRegister, PerformanceReport, ChainageFile, KilometerFile).

Return the records as a JSON object matching this schema:
{
  "documentType": "DailyRoster | LinkRoster | TrainTimetable | ...",
  "confidence": 88,
  "records": [
    // fields matching the document type
  ]
}

Text content to extract:
${text}`;

  // Ollama fetch with 8s timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch("http://localhost:11434/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: modelName,
        prompt: prompt,
        stream: false,
        format: "json"
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    if (!response.ok) throw new Error(`Ollama returned status ${response.status}`);
    const result = await response.json();
    const data = JSON.parse(result.response);
    return {
      documentType: data.documentType || detectDocumentType(text),
      duties: data.records || data.duties || [],
      confidence: data.confidence || 85
    };
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
};

const cleanJsonString = (str) => {
  let cleaned = str.trim();
  try {
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      return cleaned.substring(firstBrace, lastBrace + 1);
    }
  } catch (e) {
    console.error("JSON clean helper failed:", e);
  }
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```[a-zA-Z]*\n/, '');
    cleaned = cleaned.replace(/\n```$/, '');
  }
  return cleaned.trim();
};

// ─────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────
export default function AiDataExtractorEngine({ activeDay = 'WEEKDAY', onImportComplete }) {
  const [files, setFiles] = useState([]);
  const [activeFileId, setActiveFileId] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const [batchLoading, setBatchLoading] = useState(false);

  // Settings & Keys
  const [apiKeyInput, setApiKeyInput] = useState(
    () => localStorage.getItem('custom_gemini_api_key') || import.meta.env.VITE_GEMINI_API_KEY || ''
  );
  const [showApiPanel, setShowApiPanel] = useState(false);
  const [apiKeySaved, setApiKeySaved] = useState(false);

  const effectiveKey = (localStorage.getItem('custom_gemini_api_key') || import.meta.env.VITE_GEMINI_API_KEY || '').trim();
  const keyIsSet = effectiveKey.length > 0;

  const saveApiKey = () => {
    localStorage.setItem('custom_gemini_api_key', apiKeyInput.trim());
    setApiKeySaved(true);
    setTimeout(() => setApiKeySaved(false), 2500);
    setShowApiPanel(false);
  };

  const clearApiKey = () => {
    localStorage.removeItem('custom_gemini_api_key');
    setApiKeyInput('');
  };

  const activeFile = files.find(f => f.id === activeFileId);

  // Edit / Preview states for human review
  const [leftTab, setLeftTab] = useState('PREVIEW');
  const [editingIndex, setEditingIndex] = useState(null);
  const [expandedRows, setExpandedRows] = useState(new Set());

  // ── Drag & Drop Handlers ──
  const handleDrag = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      queueFiles(Array.from(e.dataTransfer.files));
    }
  }, []);

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      queueFiles(Array.from(e.target.files));
    }
  };

  const queueFiles = (fileList) => {
    const newQueue = fileList.map(f => {
      const fileId = `file_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
      return {
        id: fileId,
        name: f.name,
        size: f.size,
        type: f.type,
        file: f,
        status: 'Queued',
        progress: 0,
        extractionSource: '--',
        confidence: 0,
        duties: [],
        validationErrors: [],
        validationWarnings: [],
        documentType: 'DailyRoster',
        csvText: '',
        modelNotes: 'Awaiting extraction cycle',
        filePreviewUrl: f.type.startsWith('image/') ? URL.createObjectURL(f) : ''
      };
    });
    setFiles(prev => [...prev, ...newQueue]);
    if (!activeFileId && newQueue.length > 0) {
      setActiveFileId(newQueue[0].id);
    }
  };

  // ── Batch Process Execution ──
  const triggerBatchProcessing = async () => {
    const pending = files.filter(f => f.status === 'Queued');
    if (pending.length === 0) return;

    setBatchLoading(true);
    for (const f of pending) {
      await processSingleFile(f.id);
    }
    setBatchLoading(false);
  };

  const processSingleFile = async (fileId) => {
    updateFileState(fileId, { status: 'Processing', progress: 10, modelNotes: 'Reading binary stream...' });
    const target = files.find(f => f.id === fileId);
    if (!target) return;

    try {
      const fileExt = target.name.split('.').pop().toLowerCase();
      const isSpreadsheet = target.type.includes('spreadsheet') ||
        target.type.includes('csv') || target.type.includes('excel') ||
        ['xlsx', 'xls', 'csv'].includes(fileExt);
      const isTextFile = target.type.startsWith('text/') ||
        ['txt', 'json', 'xml', 'md'].includes(fileExt);

      let textContext = '';
      let filePart = null;

      if (isSpreadsheet) {
        updateFileState(fileId, { progress: 20, modelNotes: 'Parsing sheet values client-side...' });
        const binaryData = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (evt) => resolve(evt.target.result);
          reader.onerror = reject;
          reader.readAsBinaryString(target.file);
        });
        const wb = XLSX.read(binaryData, { type: 'binary' });
        textContext = wb.SheetNames.map((name) => {
          const csv = XLSX.utils.sheet_to_csv(wb.Sheets[name]);
          return `=== Sheet: ${name} ===\n${csv}`;
        }).join('\n\n');
      } else if (isTextFile) {
        updateFileState(fileId, { progress: 20, modelNotes: 'Reading plain text data...' });
        textContext = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsText(target.file);
        });
      } else {
        updateFileState(fileId, { progress: 25, modelNotes: 'Encoding visual buffer...' });
        filePart = await fileToGenerativePart(target.file);
      }

      // LEVEL 1: Cloud Gemini OCR
      let duties = [];
      let source = '--';
      let confidence = 0;
      let modelNotes = '';
      let docType = detectDocumentType(textContext || target.name);

      const apiKey = effectiveKey;

      if (apiKey && apiKey.startsWith('AIza')) {
        try {
          updateFileState(fileId, { progress: 35, modelNotes: 'Level 1: Executing Gemini vision...' });
          const genAI = new GoogleGenerativeAI(apiKey);
          const model = genAI.getGenerativeModel({
            model: "gemini-2.5-flash",
            generationConfig: { responseMimeType: "application/json" }
          });

          const prompt = buildExtractionPrompt(docType);
          const content = textContext
            ? [`Document Context:\n\`\`\`\n${textContext.slice(0, 25000)}\n\`\`\`\n\n${prompt}`]
            : [prompt, filePart];

          const result = await model.generateContent(content);
          const textResponse = result.response.text();
          const cleanJson = JSON.parse(cleanJsonString(textResponse));

          duties = cleanJson.duties || cleanJson.records || [];
          confidence = cleanJson.confidence || 96;
          docType = cleanJson.documentType || docType;
          modelNotes = cleanJson.modelNotes || 'Gemini extraction successful';
          source = 'Gemini-2.5-Flash';
        } catch (geminiErr) {
          console.warn("Level 1 Gemini extraction failed, falling back:", geminiErr.message);
        }
      }

      // LEVEL 2: Local AI Fallback (Ollama)
      if (duties.length === 0) {
        const localModels = ['qwen2.5-coder:14b', 'gemma', 'llama3.1'];
        for (const localModel of localModels) {
          try {
            updateFileState(fileId, { progress: 50, modelNotes: `Level 2: Fallback Ollama (${localModel})...` });
            const localRes = await extractWithLocalOllama(
              target.file,
              textContext,
              localModel,
              (msg, prog) => updateFileState(fileId, { progress: prog, modelNotes: msg })
            );
            if (localRes && localRes.duties && localRes.duties.length > 0) {
              duties = localRes.duties;
              docType = localRes.documentType;
              confidence = localRes.confidence;
              source = `Ollama (${localModel})`;
              modelNotes = `Offline local fallback extraction`;
              break;
            }
          } catch (ollamaErr) {
            console.warn(`Local Ollama ${localModel} failed:`, ollamaErr.message);
          }
        }
      }

      // LEVEL 3 & 4: OCR Engine + Rule-Based Parser
      if (duties.length === 0) {
        try {
          updateFileState(fileId, { progress: 75, modelNotes: 'Level 3: Client OCR Extraction (Tesseract)...' });
          let ocrText = textContext;
          if (!ocrText) {
            ocrText = await runTesseractOCR(target.file);
          }

          if (ocrText && ocrText.trim().length > 0) {
            updateFileState(fileId, { progress: 85, modelNotes: 'Level 4: Applying Rule-Based pattern parser...' });
            duties = runRuleBasedParser(ocrText);
            docType = detectDocumentType(ocrText);
            confidence = 72;
            source = 'Tesseract OCR + Pattern Matcher';
            modelNotes = 'Client-side local regex mapping';
          }
        } catch (ocrErr) {
          console.warn("OCR fallback failed:", ocrErr.message);
        }
      }

      // LEVEL 5: Manual Entry Mode
      if (duties.length === 0) {
        duties = [];
        confidence = 10;
        source = 'Manual Entry Mode';
        modelNotes = 'All extraction layers exhausted. Enforcing manual input.';
      }

      // Run validation and alignment
      const alignedDuties = duties.map(d => alignRecordWithRegistry(d));
      const sortedDuties = sortDuties(alignedDuties);
      const deduped = sortedDuties.map((d, i) => {
        const dutyKey = String(d.dutyNo || d.dutyId || '').trim().toLowerCase();
        const empKey = String(d.empNo || d.employeeId || '').trim();
        const compositeKey = `${dutyKey}::${empKey}`;
        if (!dutyKey || dutyKey === '--') return { ...d, _dupKey: `noduty_${i}`, _isDuplicate: false };
        const isDuplicate = sortedDuties.slice(0, i).some(prev =>
          String(prev.dutyNo || prev.dutyId || '').trim().toLowerCase() === dutyKey &&
          String(prev.empNo || prev.employeeId || '').trim() === empKey
        );
        return { ...d, _dupKey: compositeKey, _isDuplicate: isDuplicate };
      });

      const validated = deduped.map(d => {
        const { errors, warnings } = validateRecord(d, docType);
        if (d._isDuplicate) errors.unshift("Duplicate duty assignment block.");

        // Field confidence mock mapping for visual feedback
        const fieldConfidence = {};
        Object.keys(d).forEach(k => {
          fieldConfidence[k] = Math.max(20, Math.min(99, confidence - Math.floor(Math.random() * 8)));
        });

        return {
          ...d,
          validationErrors: errors,
          validationWarnings: warnings,
          fieldConfidence
        };
      });

      const totalErrors = validated.reduce((a, r) => a + r.validationErrors.length, 0);
      const totalWarnings = validated.reduce((a, r) => a + r.validationWarnings.length, 0);

      const generatedCsv = convertRecordsToCsv(validated);

      updateFileState(fileId, {
        status: 'Validation Pending',
        progress: 100,
        duties: validated,
        validationErrors: validated.flatMap(v => v.validationErrors),
        validationWarnings: validated.flatMap(v => v.validationWarnings),
        documentType: docType,
        confidence,
        extractionSource: source,
        csvText: generatedCsv,
        modelNotes
      });

    } catch (err) {
      console.error(err);
      updateFileState(fileId, {
        status: 'Validation Pending',
        progress: 100,
        duties: [],
        confidence: 0,
        extractionSource: 'Failed',
        modelNotes: `Critical Pipeline Error: ${err.message}`
      });
    }
  };

  const updateFileState = (fileId, updates) => {
    setFiles(prev => prev.map(f => f.id === fileId ? { ...f, ...updates } : f));
  };

  const buildExtractionPrompt = (docType) => {
    return `You are an AI Operational Data Extraction Engine. Extract structured information from the provided document.
Document Type: ${docType}

=== TARGET SCHEMAS ===
Depending on the classified document, extract into the following schemas:

If DailyRoster:
- duties: array of objects:
  - dutyNo (string, e.g. 1, 2, SB12)
  - name (operator's full name)
  - empNo (5-digit employee ID)
  - signOnTime (HH:MM or --)
  - signOnLocation (station code, e.g. PYID, PUTH)
  - signOffTime (HH:MM or --)
  - signOffLocation (station code, e.g. NGSA)
  - trainId (train number 201-250)

If ChainageFile:
- records: array of objects:
  - stationName (string, e.g. Yelachenahalli)
  - stationCode (station code, e.g. PUTH)
  - chainage (float, e.g. 14.500)
  - distance (float, distance in KM)
  - direction (UP or DN)

If LinkRoster:
- duties: array of objects:
  - dutyId (string, e.g. "01", "02", "SB12")
  - signOnTime (HH:MM, sign-on time for duty start)
  - signOnLocation (station code, e.g. PYID, PUTH, NGSA)
  - signOffTime (HH:MM, sign-off time for duty end)
  - signOffLocation (station code)
  - leg1TrainNo (train number for leg 1, e.g. 201)
  - leg1TimeTo (HH:MM, end time of leg 1)
  - leg2TrainNo (train number for leg 2 if any, else "--")
  - leg2DepTime (HH:MM, departure of leg 2 or "--")
  - leg2ArrTime (HH:MM, arrival of leg 2 or "--")
  - leg3TrainNo (train number for leg 3 if any, else "--")
  - leg3DepTime (HH:MM or "--")
  - leg3ArrTime (HH:MM or "--")
  - leg4TrainNo (train number for leg 4 if any, else "--")
  - leg4FinalDepTime (HH:MM or "--")
  - leg4FinalArrTime (HH:MM or "--")

Return ONLY structured JSON matching:
{
  "documentType": "${docType}",
  "confidence": 98,
  "modelNotes": "string",
  "duties": [...]
}`;
  };

  const convertRecordsToCsv = (records) => {
    if (!records || records.length === 0) return '';
    const headers = Object.keys(records[0]).filter(k => !k.startsWith('_') && k !== 'validationErrors' && k !== 'validationWarnings' && k !== 'fieldConfidence');
    const headerRow = headers.join(',');
    const rows = records.map(r => headers.map(h => `"${r[h] || ''}"`).join(','));
    return [headerRow, ...rows].join('\n');
  };

  const parseCsvToRecords = (csvText) => {
    if (!csvText) return [];
    const lines = csvText.split('\n');
    const headers = (lines[0] || '').split(',').map(h => h.replace(/"/g, '').trim().toLowerCase());

    const records = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const cells = line.split(',').map(c => c.replace(/"/g, '').trim());

      const recordObj = {};
      headers.forEach((h, idx) => {
        recordObj[h] = cells[idx] || '';
      });
      records.push(recordObj);
    }
    return records;
  };

  // ── CSV Live Editing Recheck ──
  const handleCsvChange = (e) => {
    const val = e.target.value;
    updateFileState(activeFileId, { csvText: val });

    try {
      const parsed = parseCsvToRecords(val);
      const alignedDuties = parsed.map(d => alignRecordWithRegistry(d));
      const sortedDuties = sortDuties(alignedDuties);
      const deduped = sortedDuties.map((d, i) => {
        const dutyKey = String(d.dutyNo || d.dutyId || '').trim().toLowerCase();
        const empKey = String(d.empNo || d.employeeId || '').trim();
        const compositeKey = `${dutyKey}::${empKey}`;
        if (!dutyKey || dutyKey === '--') return { ...d, _dupKey: `noduty_${i}`, _isDuplicate: false };
        const isDuplicate = sortedDuties.slice(0, i).some(prev =>
          String(prev.dutyNo || prev.dutyId || '').trim().toLowerCase() === dutyKey &&
          String(prev.empNo || prev.employeeId || '').trim() === empKey
        );
        return { ...d, _dupKey: compositeKey, _isDuplicate: isDuplicate };
      });

      const validated = deduped.map(d => {
        const { errors, warnings } = validateRecord(d, activeFile.documentType);
        if (d._isDuplicate) errors.unshift("Duplicate duty assignment block.");
        return { ...d, validationErrors: errors, validationWarnings: warnings };
      });

      updateFileState(activeFileId, {
        duties: validated,
        validationErrors: validated.flatMap(v => v.validationErrors),
        validationWarnings: validated.flatMap(v => v.validationWarnings)
      });

    } catch (err) {
      console.error("CSV Parse error:", err);
    }
  };

  // ── Human verification save edits ──
  const handleSaveEdit = (idx, formData) => {
    // Ensure user is authenticated before writing to Firestore
    const { getAuth } = require('firebase/auth');
    const auth = getAuth();
    if (!auth.currentUser) {
      console.error('Cannot save edit: user not authenticated.');
      return;
    }

    // Learning engine logs correction
    const record = activeFile.duties[idx];
    const batch = writeBatch(db);

    const correctionRef = doc(collection(db, 'ai_learning_corrections'));
    batch.set(correctionRef, {
      documentType: activeFile.documentType,
      ...formData,
      timestamp: serverTimestamp()
    });

    batch.commit().catch(e => console.warn("Could not log learning correction:", e.message));

    const updated = [...activeFile.duties];
    updated[idx] = { ...record, ...formData, _manuallyCorrected: true };
    const sortedDuties = sortDuties(updated);

    const deduped = sortedDuties.map((d, i) => {
      const dutyKey = String(d.dutyNo || d.dutyId || '').trim().toLowerCase();
      const empKey = String(d.empNo || d.employeeId || '').trim();
      const compositeKey = `${dutyKey}::${empKey}`;
      if (!dutyKey || dutyKey === '--') return { ...d, _dupKey: `noduty_${i}`, _isDuplicate: false };
      const isDuplicate = sortedDuties.slice(0, i).some(prev =>
        String(prev.dutyNo || prev.dutyId || '').trim().toLowerCase() === dutyKey &&
        String(prev.empNo || prev.employeeId || '').trim() === empKey
      );
      return { ...d, _dupKey: compositeKey, _isDuplicate: isDuplicate };
    });

    const validated = deduped.map(d => {
      const { errors, warnings } = validateRecord(d, activeFile.documentType);
      if (d._isDuplicate) errors.unshift("Duplicate duty assignment block.");
      return { ...d, validationErrors: errors, validationWarnings: warnings };
    });

    updateFileState(activeFileId, {
      duties: validated,
      csvText: convertRecordsToCsv(validated),
      validationErrors: validated.flatMap(v => v.validationErrors),
      validationWarnings: validated.flatMap(v => v.validationWarnings)
    });
    setEditingIndex(null);
  };

  const openEdit = (idx) => {
    setEditingIndex(idx);
  };

  const toggleRowExpand = (idx) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(idx)) {
        next.delete(idx);
      } else {
        next.add(idx);
      }
      return next;
    });
  };


  const deleteRow = (idx) => {
    const updated = activeFile.duties.filter((_, i) => i !== idx);
    const sortedDuties = sortDuties(updated);
    const deduped = sortedDuties.map((d, i) => {
      const dutyKey = String(d.dutyNo || d.dutyId || '').trim().toLowerCase();
      const empKey = String(d.empNo || d.employeeId || '').trim();
      const compositeKey = `${dutyKey}::${empKey}`;
      if (!dutyKey || dutyKey === '--') return { ...d, _dupKey: `noduty_${i}`, _isDuplicate: false };
      const isDuplicate = sortedDuties.slice(0, i).some(prev =>
        String(prev.dutyNo || prev.dutyId || '').trim().toLowerCase() === dutyKey &&
        String(prev.empNo || prev.employeeId || '').trim() === empKey
      );
      return { ...d, _dupKey: compositeKey, _isDuplicate: isDuplicate };
    });

    const validated = deduped.map(d => {
      const { errors, warnings } = validateRecord(d, activeFile.documentType);
      if (d._isDuplicate) errors.unshift("Duplicate duty assignment.");
      return { ...d, validationErrors: errors, validationWarnings: warnings };
    });

    updateFileState(activeFileId, {
      duties: validated,
      csvText: convertRecordsToCsv(validated),
      validationErrors: validated.flatMap(v => v.validationErrors),
      validationWarnings: validated.flatMap(v => v.validationWarnings)
    });
  };

  const addNewRow = () => {
    const newRecord = {
      dutyNo: '',
      name: '',
      empNo: '',
      signOnTime: '06:00',
      signOnLocation: 'PYID',
      signOffTime: '--',
      signOffLocation: '--',
      trainId: '--',
      validationErrors: ["Missing Employee ID.", "Missing Duty Number."],
      validationWarnings: [],
      fieldConfidence: {},
      _manuallyCorrected: true
    };

    const updated = [...activeFile.duties, newRecord];
    const sorted = sortDuties(updated);

    updateFileState(activeFileId, {
      duties: sorted,
      csvText: convertRecordsToCsv(sorted),
      validationErrors: sorted.flatMap(v => v.validationErrors),
      validationWarnings: sorted.flatMap(v => v.validationWarnings)
    });

    // Automatically find index of empty row to edit it
    const newIdx = sorted.findIndex(d => !d.dutyNo && !d.name && !d.empNo);
    if (newIdx !== -1) {
      setEditingIndex(newIdx);
    }
  };

  // ── Database commit mapping on approval ──
  const handleApproveImport = async () => {
    if (!activeFile || activeFile.validationErrors.length > 0) return;

    updateFileState(activeFileId, { status: 'Processing', progress: 40, modelNotes: 'Writing approved matrix elements to db...' });
    const batch = writeBatch(db);

    try {
      const docType = activeFile.documentType;
      let count = 0;

      if (docType === 'DailyRoster') {
        let scheduleType = activeDay;
        const effectiveDate = activeFile.rosterDate || new Date().toISOString().split('T')[0];

        // Fetch crew links
        const linksQuery = query(collection(db, 'crew_final_links'), where('scheduleType', '==', scheduleType));
        const linksSnapshot = await getDocs(linksQuery);
        const linksMap = {};
        linksSnapshot.docs.forEach((d) => {
          const data = d.data();
          let key = String(data.dutyId).trim();
          if (['1', '2', '3', '4', '5', '6', '7', '8', '9'].includes(key)) {
            key = '0' + key;
          }
          linksMap[key] = data;
        });

        activeFile.duties.forEach((rec) => {
          const alignedRec = alignRecordWithRegistry(rec);
          let dutyNo = String(alignedRec.dutyNo || '').trim();
          if (['1', '2', '3', '4', '5', '6', '7', '8', '9'].includes(dutyNo)) {
            dutyNo = '0' + dutyNo;
          }
          const empId = String(alignedRec.empNo || '').trim();
          const empName = String(alignedRec.name || '').trim().toUpperCase();
          const signOnTime = alignedRec.signOnTime && alignedRec.signOnTime !== '--' ? alignedRec.signOnTime : '06:00';
          if (!dutyNo) return;

          const deployDocId = dutyNo === 'UNASSIGNED' || !dutyNo
            ? `gcc_deploy_${scheduleType.toLowerCase()}_extra_${empId}`
            : `gcc_deploy_${scheduleType.toLowerCase()}_duty_${dutyNo}`;

          const linkData = linksMap[dutyNo] || {};
          // Resolve trainId: prefer roster value, then link leg1, then link top-level trainId
          const resolvedTrainId = (alignedRec.trainId && alignedRec.trainId !== '--')
            ? String(alignedRec.trainId)
            : (linkData.leg1TrainNo || linkData.trainId || '--');

          const l1Train = resolvedTrainId;
          const l1Start = signOnTime;
          const l1End = linkData.leg1TimeTo || '--';
          const l2Train = linkData.leg2TrainNo || '--';
          const l2Start = linkData.leg2DepTime || '--';
          const l2End = linkData.leg2ArrTime || '--';
          const l3Train = linkData.leg3TrainNo || '--';
          const l3Start = linkData.leg3DepTime || '--';
          const l3End = linkData.leg3ArrTime || '--';
          const l4Train = linkData.leg4TrainNo || '--';
          const l4Start = linkData.leg4FinalDepTime || '--';
          const l4End = linkData.leg4FinalArrTime || linkData.signOffTime || alignedRec.signOffTime || '--';
          const trainId = l1Train;

          batch.set(doc(db, 'crew_daily_deployment', deployDocId), {
            scheduleType,
            dutyId: dutyNo,
            empId,
            empName,
            trainId,
            signOnTime,
            signOffTime: alignedRec.signOffTime || '--',
            signOffLocation: alignedRec.signOffLocation || '--',
            remarks: `GCC AI Ingest – ${activeFile.extractionSource}`,
            lastUpdated: serverTimestamp(),
            rawLegs: { l1Train, l1Start, l1End, l2Train, l2Start, l2End, l3Train, l3Start, l3End, l4Train, l4Start, l4End }
          }, { merge: true });
          count++;

          const trainLegs = [l1Train, l2Train, l3Train, l4Train]
            .map((t) => parseInt(t, 10))
            .filter((t) => !isNaN(t) && t >= 201 && t <= 250);

          trainLegs.forEach((tid) => {
            batch.set(doc(db, 'daily_crew_tracks', `${effectiveDate}_${tid}`), {
              date: effectiveDate,
              trainId: tid,
              isShortLoopActive: false,
              currentOperator: { employeeId: empId, name: empName, dutyNumber: dutyNo }
            }, { merge: true });
          });
        });
      } else if (docType === 'ChainageFile') {
        activeFile.duties.forEach((rec) => {
          const code = String(rec.stationCode || rec.code || '').trim().toUpperCase();
          const name = String(rec.stationName || rec.name || '').trim();
          const chainage = parseFloat(rec.chainage);
          if (code && !isNaN(chainage)) {
            batch.set(doc(db, 'station_chainage', code), { station: code, name, chainage }, { merge: true });
            batch.set(doc(db, 'stationChainageMaster', code), { stationCode: code, stationName: name, chainage, distance: parseFloat(rec.distance || 0), direction: rec.direction || 'UP' }, { merge: true });
            count++;
          }
        });
      } else if (docType === 'LinkRoster') {
        activeFile.duties.forEach((rec) => {
          let dutyId = String(rec.dutyId || rec.dutyNo || '').trim();
          if (['1', '2', '3', '4', '5', '6', '7', '8', '9'].includes(dutyId)) {
            dutyId = '0' + dutyId;
          }
          if (dutyId) {
            // Resolve leg1 train: prefer explicit leg1TrainNo, fallback to trainId
            const leg1Train = String(rec.leg1TrainNo || rec.trainId || '--').trim();
            const leg2Train = String(rec.leg2TrainNo || '--').trim();
            const leg3Train = String(rec.leg3TrainNo || '--').trim();
            const leg4Train = String(rec.leg4TrainNo || '--').trim();

            batch.set(doc(db, 'crew_final_links', `link_${activeDay.toLowerCase()}_${dutyId}`), {
              scheduleType: activeDay,
              dutyId,
              // Keep top-level trainId as the primary (leg1) train
              trainId: leg1Train,
              signOnTime: rec.signOnTime || '06:00',
              signOnLocation: rec.signOnLocation || 'PYID',
              signOffTime: rec.signOffTime || '--',
              signOffLocation: rec.signOffLocation || '--',
              // Full leg breakdown for DailyRoster import
              leg1TrainNo: leg1Train,
              leg1TimeTo: rec.leg1TimeTo || '--',
              leg2TrainNo: leg2Train,
              leg2DepTime: rec.leg2DepTime || '--',
              leg2ArrTime: rec.leg2ArrTime || '--',
              leg3TrainNo: leg3Train,
              leg3DepTime: rec.leg3DepTime || '--',
              leg3ArrTime: rec.leg3ArrTime || '--',
              leg4TrainNo: leg4Train,
              leg4FinalDepTime: rec.leg4FinalDepTime || '--',
              leg4FinalArrTime: rec.leg4FinalArrTime || rec.signOffTime || '--'
            }, { merge: true });
            count++;
          }
        });
      } else if (docType === 'TrainTimetable') {
        activeFile.duties.forEach((rec) => {
          const trainId = String(rec.trainId || '').trim();
          if (trainId) {
            batch.set(doc(db, 'wtt_final_matrix', `wtt_${activeDay.toLowerCase()}_${trainId}`), {
              scheduleType: activeDay,
              trainId,
              direction: rec.direction || 'UP',
              stationTimes: rec.stationTimes || []
            }, { merge: true });
            count++;
          }
        });
      }

      await batch.commit();
      updateFileState(activeFileId, { status: 'Approved', progress: 100, modelNotes: `Successfully committed ${count} records!` });
      if (onImportComplete) onImportComplete();

    } catch (err) {
      console.error(err);
      updateFileState(activeFileId, { status: 'Validation Pending', modelNotes: `Commit Failed: ${err.message}` });
    }
  };

  const removeFile = (id) => {
    setFiles(prev => prev.filter(f => f.id !== id));
    if (activeFileId === id) {
      const remaining = files.filter(f => f.id !== id);
      setActiveFileId(remaining.length > 0 ? remaining[0].id : null);
    }
  };

  const resetQueue = () => {
    setFiles([]);
    setActiveFileId(null);
  };

  const hasErrors = activeFile?.validationErrors?.length > 0;
  const isApproved = activeFile?.status === 'Approved';

  return (
    <>
      {editingIndex !== null && activeFile?.duties[editingIndex] && (
        <EditModal
          record={activeFile.duties[editingIndex]}
          index={editingIndex}
          onSave={handleSaveEdit}
          onCancel={() => setEditingIndex(null)}
        />
      )}

      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-2xl font-mono text-xs">
        {/* Header bar */}
        <div className="px-4 py-3 bg-slate-950/90 border-b border-slate-800 flex justify-between items-center">
          <span className="flex items-center gap-1.5 text-emerald-400 font-black tracking-wide text-[11px] uppercase">
            <Cpu className="h-4 w-4 text-emerald-500 animate-pulse" />
            BMRCL Operations Data Extraction Platform
            <span className="text-slate-600 font-normal text-[9px] ml-1">v3.0 (Enterprise Fallbacks)</span>
          </span>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setShowApiPanel((v) => !v)}
              className={`flex items-center gap-1 px-2 py-0.5 rounded border text-[8px] font-black transition ${keyIsSet
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20'
                : 'bg-rose-500/15 text-rose-400 border-rose-500/30 animate-pulse hover:bg-rose-500/25'
                }`}
            >
              <KeyRound size={10} />
              {keyIsSet ? 'GEMINI ON' : 'GEMINI OFF'}
            </button>
          </div>
        </div>

        {/* API Settings Panel */}
        {showApiPanel && (
          <div className="border-b border-slate-800 bg-slate-950/80 px-4 py-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
                <KeyRound size={11} className="text-amber-400" /> Cloud API Configuration
              </span>
            </div>
            <div className="flex gap-2">
              <input
                type="password"
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && saveApiKey()}
                placeholder="Paste your Gemini API key (AIza...)…"
                className="flex-1 bg-slate-900 border border-slate-700 focus:border-emerald-500 outline-none rounded-lg px-3 py-1.5 text-[10px] font-mono text-slate-200"
              />
              <button onClick={saveApiKey} className="bg-emerald-650 hover:bg-emerald-500 text-slate-950 font-black px-3 py-1.5 rounded-lg uppercase">
                Save
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-0 divide-y lg:divide-y-0 lg:divide-x divide-slate-800">

          {/* 1. Left Side: Queue Manager & Loaders */}
          <div className="lg:col-span-1 p-4 space-y-4 bg-slate-950/30 flex flex-col justify-between">
            <div className="space-y-3">
              <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                <span className="font-bold text-slate-400">Upload Batch Queue</span>
                {files.length > 0 && (
                  <button onClick={resetQueue} className="text-[9px] text-rose-500 hover:text-rose-400 transition font-bold">
                    Clear Queue
                  </button>
                )}
              </div>

              {/* Multi-file drag drop */}
              <div
                onDragEnter={handleDrag} onDragLeave={handleDrag} onDragOver={handleDrag} onDrop={handleDrop}
                className={`border border-dashed rounded-lg p-4 text-center cursor-pointer transition relative ${dragActive ? 'border-emerald-500 bg-emerald-950/10' : 'border-slate-800 hover:border-slate-700 bg-slate-950/40'}`}
              >
                <input type="file" multiple onChange={handleFileChange} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" accept=".csv,.txt,.xlsx,.xls,.pdf,.docx,image/*" />
                <UploadCloud className="h-6 w-6 text-slate-500 mx-auto mb-1 group-hover:text-emerald-400" />
                <span className="block text-[9px] text-slate-400 uppercase font-black">Drop files or click</span>
                <span className="block text-[7px] text-slate-600 mt-0.5">Accepts Excel, CSV, PDF, Image, Word</span>
              </div>

              {/* Queued files list */}
              {files.length > 0 ? (
                <div className="space-y-1.5 max-h-[40vh] overflow-y-auto pr-1">
                  {files.map(f => (
                    <div
                      key={f.id}
                      onClick={() => setActiveFileId(f.id)}
                      className={`p-2 border rounded-lg flex items-center justify-between gap-2 cursor-pointer transition ${f.id === activeFileId ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400' : 'bg-slate-900/60 border-slate-805 hover:bg-slate-800/40 text-slate-400'}`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-[10px] font-bold truncate uppercase">{f.name}</div>
                        <div className="flex gap-2 text-[7px] text-slate-500 font-mono mt-0.5 font-bold uppercase">
                          <span>{f.status}</span>
                          {f.confidence > 0 && <span className="text-cyan-400">Conf: {f.confidence}%</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        {f.status === 'Processing' && <Loader2 className="h-3 w-3 animate-spin text-emerald-400" />}
                        {f.status === 'Approved' && <CheckCircle className="h-3 w-3 text-emerald-400 font-bold" />}
                        {f.status === 'Validation Pending' && f.validationErrors.length > 0 && <AlertCircle className="h-3 w-3 text-rose-500" />}
                        <button
                          onClick={(e) => { e.stopPropagation(); removeFile(f.id); }}
                          className="hover:text-rose-500 p-0.5"
                        >
                          <X size={10} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6 text-slate-650 italic text-[10px]">Queue empty. Upload roster documents to begin.</div>
              )}
            </div>

            {files.filter(f => f.status === 'Queued').length > 0 && (
              <button
                onClick={triggerBatchProcessing}
                disabled={batchLoading}
                className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-slate-950 font-black py-2 rounded-lg tracking-widest uppercase transition flex items-center justify-center gap-1 shadow-lg"
              >
                <Play size={12} /> {batchLoading ? 'PROCESSING...' : 'RUN INGESTION BATCH'}
              </button>
            )}
          </div>

          {/* 2. Right Side: Human Verification Screen */}
          <div className="lg:col-span-3 p-5 space-y-4 flex flex-col justify-between min-h-[450px]">
            {activeFile ? (
              <div className="space-y-4 flex-1 flex flex-col justify-between">

                {/* File Header */}
                <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                  <div>
                    <h3 className="text-sm font-black text-slate-200 uppercase tracking-wider">{activeFile.name}</h3>
                    <div className="flex gap-3 text-[9px] text-slate-500 mt-1 uppercase font-bold tracking-widest">
                      <span>Source: <span className="text-cyan-400">{activeFile.extractionSource}</span></span>
                      <span>Confidence: <span className={activeFile.confidence > 80 ? 'text-emerald-400' : 'text-amber-400'}>{activeFile.confidence}%</span></span>
                      <span>Day: <span className="text-slate-350">{activeDay}</span></span>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <select
                      value={activeFile.documentType}
                      onChange={(e) => updateFileState(activeFile.id, { documentType: e.target.value })}
                      className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-[9px] text-slate-300 font-bold uppercase"
                    >
                      <option value="DailyRoster">Daily Roster</option>
                      <option value="LinkRoster">Link Roster</option>
                      <option value="TrainTimetable">Train Timetable</option>
                      <option value="ChangeoverLink">Changeover Link</option>
                      <option value="CrewRegistry">Crew Registry</option>
                      <option value="LeaveRegister">Leave Register</option>
                      <option value="IncidentRegister">Incident Register</option>
                      <option value="PerformanceReport">Performance Report</option>
                      <option value="ChainageFile">Chainage Master File</option>
                      <option value="KilometerFile">Kilometer File</option>
                    </select>
                  </div>
                </div>

                {/* Validation Warnings & Notes */}
                {activeFile.status === 'Validation Pending' && (
                  <div className="space-y-2">
                    {activeFile.validationErrors.length > 0 && (
                      <div className="bg-rose-950/20 border border-rose-500/25 p-3 rounded-lg flex gap-2.5 text-rose-300">
                        <Shield className="h-4.5 w-4.5 text-rose-500 shrink-0" />
                        <div>
                          <span className="font-bold block uppercase text-[9px] tracking-wider">Validation Failures Detected</span>
                          <span className="text-[9px] leading-normal">{activeFile.validationErrors.length} validation errors require manual adjustment. Use inline editing to resolve.</span>
                        </div>
                      </div>
                    )}
                    {activeFile.validationWarnings.length > 0 && activeFile.validationErrors.length === 0 && (
                      <div className="bg-blue-950/25 border border-blue-500/25 p-3 rounded-lg flex gap-2.5 text-blue-300">
                        <Info className="h-4.5 w-4.5 text-blue-400 shrink-0" />
                        <div>
                          <span className="font-bold block uppercase text-[9px] tracking-wider">Verification Advisory</span>
                          <span className="text-[9px] leading-normal">{activeFile.validationWarnings.length} operational advisories flagged. Check cell contents before approval.</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Main Review Section: Tab panels */}
                <div className="grid grid-cols-1 xl:grid-cols-5 gap-4 flex-1">

                  {/* Left sub-tab: Preview/CSV */}
                  <div className="xl:col-span-2 flex flex-col space-y-2">
                    <div className="flex border border-slate-800 bg-slate-950 p-0.5 rounded-lg text-[9px] font-bold w-fit">
                      <button onClick={() => setLeftTab('PREVIEW')} className={`px-3 py-0.5 rounded transition ${leftTab === 'PREVIEW' ? 'bg-emerald-600 text-slate-950 font-black' : 'text-slate-400'}`}>Preview</button>
                      <button onClick={() => setLeftTab('CSV')} className={`px-3 py-0.5 rounded transition ${leftTab === 'CSV' ? 'bg-emerald-600 text-slate-950 font-black' : 'text-slate-400'}`}>CSV Editor</button>
                    </div>

                    {leftTab === 'PREVIEW' ? (
                      <div className="bg-slate-950/65 border border-slate-805 rounded-xl h-72 flex items-center justify-center overflow-hidden">
                        {activeFile.filePreviewUrl ? (
                          <img src={activeFile.filePreviewUrl} alt="Preview" className="max-h-full max-w-full object-contain p-2" />
                        ) : (
                          <div className="text-center p-6 space-y-2">
                            {activeFile.name.endsWith('.pdf') ? <FileText className="h-10 w-10 text-cyan-400 mx-auto" /> : <FileSpreadsheet className="h-10 w-10 text-emerald-400 mx-auto" />}
                            <span className="block font-bold text-slate-300 truncate max-w-[200px]">{activeFile.name}</span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <textarea
                        value={activeFile.csvText}
                        onChange={handleCsvChange}
                        className="w-full h-72 bg-slate-950 border border-slate-805 rounded-xl p-3 text-[10px] text-emerald-400 focus:outline-none focus:border-emerald-500 font-mono resize-none leading-normal"
                      />
                    )}
                  </div>

                  {/* Right sub-tab: Records Table */}
                  <div className="xl:col-span-3 flex flex-col space-y-2">
                    <div className="flex justify-between items-center h-[18px]">
                      <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Digested Roster Items</span>
                      <button
                        onClick={addNewRow}
                        className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-black px-2 py-0.5 rounded text-[8px] tracking-wider uppercase transition-colors"
                      >
                        <Plus size={10} /> Add Row
                      </button>
                    </div>

                    <div className="border border-slate-805 rounded-xl bg-slate-950/30 h-72 overflow-y-auto">
                      <table className="w-full text-left border-collapse text-[10px]">
                        <thead className="bg-slate-950 text-slate-550 uppercase text-[8px] sticky top-0 border-b border-slate-800 z-10 font-bold">
                          <tr>
                            <th className="p-2 w-8">#</th>
                            <th className="p-2">Duty</th>
                            <th className="p-2">Name / ID</th>
                            <th className="p-2">Sign-On</th>
                            <th className="p-2 text-right">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-855 text-slate-350">
                          {activeFile.duties.length === 0 ? (
                            <tr>
                              <td colSpan={5} className="p-6 text-center text-slate-550 italic uppercase">No records found. Manual verification required.</td>
                            </tr>
                          ) : (
                            activeFile.duties.map((row, idx) => {
                              const errs = row.validationErrors || [];
                              const warns = row.validationWarnings || [];
                              const isDup = row._isDuplicate === true;
                              const isExpanded = expandedRows.has(idx);
                              const rowBg = isDup ? 'bg-amber-950/15' : errs.length > 0 ? 'bg-rose-950/15' : warns.length > 0 ? 'bg-blue-950/10' : '';

                              return (
                                <React.Fragment key={idx}>
                                  <tr className={`hover:bg-slate-900/35 transition-colors ${rowBg}`}>
                                    <td className="p-2 text-slate-500">{idx + 1}</td>
                                    <td className="p-2 font-black text-amber-400">{row.dutyNo || row.dutyId || '--'}</td>
                                    <td className="p-2 leading-tight">
                                      <span className="font-bold text-slate-200 block truncate max-w-[120px]">{row.name || '--'}</span>
                                      <span className="text-[8px] text-slate-500">ID: {row.empNo || row.employeeId || '--'}</span>
                                    </td>
                                    <td className="p-2 text-emerald-400 font-bold">
                                      {row.signOnTime || '06:00'} ({row.signOnLocation || 'PYID'})
                                    </td>
                                    <td className="p-2 text-right">
                                      <div className="flex items-center justify-end gap-1.5">
                                        {errs.length > 0 || isDup ? (
                                          <button onClick={() => toggleRowExpand(idx)} className="text-rose-400 hover:text-rose-300 flex items-center">
                                            <AlertTriangle size={11} />
                                          </button>
                                        ) : warns.length > 0 ? (
                                          <button onClick={() => toggleRowExpand(idx)} className="text-blue-400 hover:text-blue-300 flex items-center">
                                            <Info size={11} />
                                          </button>
                                        ) : (
                                          <CheckCircle2 size={11} className="text-emerald-500" />
                                        )}
                                        <button onClick={() => openEdit(idx)} className="p-0.5 hover:bg-slate-800 rounded text-slate-400 hover:text-amber-400">
                                          <Edit2 size={11} />
                                        </button>
                                        <button onClick={() => deleteRow(idx)} className="p-0.5 hover:bg-rose-950 rounded text-slate-500 hover:text-rose-400">
                                          <Trash2 size={11} />
                                        </button>
                                      </div>
                                    </td>
                                  </tr>

                                  {isExpanded && (
                                    <tr className={rowBg}>
                                      <td colSpan={5} className="px-3 pb-2 text-[9px]">
                                        <div className="space-y-1 pt-0.5 border-t border-slate-800/40">
                                          {errs.map((e, ei) => (
                                            <div key={ei} className="text-rose-400 flex items-center gap-1">
                                              <XCircle size={9} /> {e}
                                            </div>
                                          ))}
                                          {warns.map((w, wi) => (
                                            <div key={wi} className="text-blue-300 flex items-center gap-1">
                                              <Info size={9} /> {w}
                                            </div>
                                          ))}
                                        </div>
                                      </td>
                                    </tr>
                                  )}
                                </React.Fragment>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                </div>

                {/* Footer Actions */}
                <div className="flex justify-between items-center border-t border-slate-850 pt-4 mt-2">
                  <button
                    onClick={() => removeFile(activeFile.id)}
                    className="bg-slate-950 hover:bg-slate-900 border border-slate-805 text-rose-500 hover:text-rose-400 text-[10px] font-bold px-4 py-2 rounded-lg uppercase flex items-center gap-1.5 transition"
                  >
                    <Trash2 size={12} /> Reject File
                  </button>

                  <div className="flex items-center gap-3">
                    {hasErrors ? (
                      <span className="text-[9px] text-amber-500 font-bold flex items-center gap-1">
                        <Shield size={11} /> Unlock approval by correcting {activeFile.validationErrors.length} errors
                      </span>
                    ) : (
                      <span className="text-[9px] text-emerald-400 font-bold flex items-center gap-1">
                        <CheckCircle size={11} /> Ready to commit
                      </span>
                    )}

                    <button
                      onClick={handleApproveImport}
                      disabled={hasErrors || isApproved || activeFile.status === 'Processing'}
                      className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-slate-950 text-[10px] px-5 py-2 rounded-lg font-black uppercase flex items-center gap-1.5 transition tracking-wider shadow-lg"
                    >
                      <Check size={12} /> Approve & Commit Roster
                    </button>
                  </div>
                </div>

              </div>
            ) : (
              <div className="flex flex-col items-center justify-center text-center py-20 text-slate-500 space-y-3">
                <FileText className="h-12 w-12 text-slate-700 animate-pulse" />
                <div className="space-y-1">
                  <span className="block font-bold text-slate-350 uppercase tracking-widest text-[11px]">Human Verification Console</span>
                  <span className="block text-[9px] text-slate-550 max-w-[280px]">Select a file from the upload batch queue on the left to verify, edit, and approve mapping allocations.</span>
                </div>
              </div>
            )}
          </div>

        </div>

      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────
// INLINE EDIT FIELDS DEFINITION
// ─────────────────────────────────────────────────────────────────
const EDIT_FIELDS = [
  { key: 'dutyNo', label: 'Duty No', placeholder: '1, 2, Stdby…', color: 'text-amber-405' },
  { key: 'name', label: 'Operator Name', placeholder: 'Full name', color: 'text-slate-200' },
  { key: 'empNo', label: 'Employee ID', placeholder: '22296', color: 'text-slate-300' },
  { key: 'signOnTime', label: 'Sign On Time', placeholder: 'HH:MM', color: 'text-emerald-400' },
  { key: 'signOnLocation', label: 'Sign On Location', placeholder: 'PYID, KGWA…', color: 'text-slate-400' },
  { key: 'signOffTime', label: 'Sign Off Time', placeholder: 'HH:MM or --', color: 'text-rose-300' },
  { key: 'signOffLocation', label: 'Sign Off Location', placeholder: 'PYID, KGWA…', color: 'text-slate-400' },
  { key: 'trainId', label: 'Train ID', placeholder: '201–250 or --', color: 'text-cyan-400' },
];

function EditModal({ record, index, onSave, onCancel }) {
  const [form, setForm] = useState({
    dutyNo: record.dutyNo || record.dutyId || '',
    name: record.name || '',
    empNo: record.empNo || record.employeeId || '',
    signOnTime: record.signOnTime || '',
    signOnLocation: record.signOnLocation || '',
    signOffTime: record.signOffTime || '--',
    signOffLocation: record.signOffLocation || '--',
    trainId: record.trainId || '',
  });

  const [nameSuggestions, setNameSuggestions] = useState([]);

  const handleChange = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const handleNameChange = (val) => {
    setForm(f => ({ ...f, name: val }));
    if (val.trim().length >= 2) {
      const queryStr = val.toLowerCase();
      const matches = BMRCL_CREW_REGISTRY.filter(emp =>
        emp.name.toLowerCase().includes(queryStr)
      );
      setNameSuggestions(matches.slice(0, 5));
    } else {
      setNameSuggestions([]);
    }
  };

  const selectSuggestion = (emp) => {
    setForm(f => ({
      ...f,
      name: emp.name,
      empNo: emp.id
    }));
    setNameSuggestions([]);
  };

  const handleSave = () => onSave(index, form);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-lg font-mono">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800 bg-slate-950/60 rounded-t-2xl">
          <span className="text-slate-100 font-bold text-xs uppercase tracking-wider flex items-center gap-1.5">
            <Edit2 className="h-4.5 w-4.5 text-amber-400" /> Edit Record #{index + 1}
          </span>
          <button onClick={onCancel} className="text-slate-500 hover:text-rose-400 transition">
            <XCircle size={18} />
          </button>
        </div>

        <div className="p-5 grid grid-cols-2 gap-3 text-xs uppercase font-bold">
          {EDIT_FIELDS.map(({ key, label, placeholder, color }) => (
            <div key={key} className="col-span-1 space-y-1 relative">
              <label className="text-[8px] tracking-widest text-slate-500">{label}</label>
              {key === 'name' ? (
                <>
                  <input
                    type="text"
                    value={form.name || ''}
                    onChange={(e) => handleNameChange(e.target.value)}
                    placeholder={placeholder}
                    className={`w-full bg-slate-950 border border-slate-700 focus:border-emerald-500 outline-none rounded-lg px-2.5 py-1.5 text-xs ${color} placeholder-slate-750 transition`}
                  />
                  {nameSuggestions.length > 0 && (
                    <div className="absolute left-0 right-0 top-full mt-1 bg-slate-950 border border-slate-800 rounded-lg shadow-2xl z-50 max-h-40 overflow-y-auto divide-y divide-slate-850">
                      {nameSuggestions.map(emp => (
                        <div
                          key={emp.id}
                          onClick={() => selectSuggestion(emp)}
                          className="px-3 py-2 hover:bg-emerald-950/40 cursor-pointer text-[10px] text-slate-300 flex justify-between items-center transition normal-case font-mono"
                        >
                          <span className="font-bold text-white">{emp.name}</span>
                          <span className="text-[9px] text-emerald-400 font-mono">ID: {emp.id}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <input
                  type="text"
                  value={form[key] || ''}
                  onChange={(e) => handleChange(key, e.target.value)}
                  placeholder={placeholder}
                  className={`w-full bg-slate-950 border border-slate-700 focus:border-emerald-500 outline-none rounded-lg px-2.5 py-1.5 text-xs ${color} placeholder-slate-750 transition`}
                />
              )}
            </div>
          ))}
        </div>

        <div className="flex justify-end gap-2.5 px-5 py-3.5 border-t border-slate-800 bg-slate-950/40 rounded-b-2xl">
          <button onClick={onCancel} className="flex items-center gap-1 px-4 py-1.5 text-slate-400 hover:text-slate-200 bg-slate-805 hover:bg-slate-700 rounded-lg transition uppercase font-bold text-[10px]">
            <X size={12} /> Cancel
          </button>
          <button onClick={handleSave} className="flex items-center gap-1 px-4 py-1.5 text-slate-950 bg-emerald-500 hover:bg-emerald-400 rounded-lg transition uppercase font-black text-[10px]">
            <Save size={12} /> Save & Validate
          </button>
        </div>
      </div>
    </div>
  );
}
