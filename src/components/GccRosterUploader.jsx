import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { app, db } from '../firebase';
import { writeBatch, doc, collection, getDocs, query, where, serverTimestamp } from 'firebase/firestore';
import { getAI, getGenerativeModel, GoogleAIBackend } from 'firebase/ai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import {
  UploadCloud, FileSpreadsheet, FileText, Image as ImageIcon,
  AlertCircle, CheckCircle2, Loader2, Play, Trash2, Calendar, ShieldAlert, Settings, HelpCircle, Cpu
} from 'lucide-react';


export default function GccRosterUploader() {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [scheduleType, setScheduleType] = useState('WEEKDAY');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [extractedData, setExtractedData] = useState([]);
  const [dragActive, setDragActive] = useState(false);
  const [fileDetails, setFileDetails] = useState(null);
  const [customApiKey, setCustomApiKey] = useState(
    localStorage.getItem('custom_gemini_api_key') ||
    import.meta.env.VITE_GEMINI_API_KEY ||
    ''
  );
  const [showConfig, setShowConfig] = useState(false);
  const [activeInputTab, setActiveInputTab] = useState('FILE'); // FILE or JSON_PASTE
  const [pastedJson, setPastedJson] = useState('');

  const handleDateChange = (dateVal) => {
    setSelectedDate(dateVal);
    const day = new Date(dateVal).getDay();
    if (day === 0) setScheduleType('SUNDAY');
    else if (day === 1) setScheduleType('MONDAY');
    else if (day === 6) setScheduleType('SATURDAY');
    else setScheduleType('WEEKDAY');
  };

  const handleApiKeyChange = (val) => {
    setCustomApiKey(val);
    if (val.trim()) {
      localStorage.setItem('custom_gemini_api_key', val.trim());
    } else {
      localStorage.removeItem('custom_gemini_api_key');
    }
  };

  // Convert file to Base64 part for Gemini
  const fileToGenerativePart = async (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        resolve({
          inlineData: {
            data: reader.result.split(',')[1],
            mimeType: file.type || "image/jpeg" // Fallback type
          }
        });
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
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
      console.error("JSON extraction helper failed:", e);
    }
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```[a-zA-Z]*\n/, '');
      cleaned = cleaned.replace(/\n```$/, '');
    }
    return cleaned.trim();
  };

  // Extract data from file (Excel/CSV or Image/PDF or General Document)
  const processFile = async (file) => {
    setLoading(true);
    setStatus('Initializing file analysis...');
    setError('');
    setExtractedData([]);
    setFileDetails({ name: file.name, size: (file.size / 1024).toFixed(1) + ' KB', type: file.type });

    // Robust extension/type checking
    const fileExt = file.name.split('.').pop().toLowerCase();
    const isSpreadsheet = file.type.includes('spreadsheet') || file.type.includes('csv') || file.type.includes('excel') || ['xlsx', 'xls', 'csv'].includes(fileExt);

    try {
      if (isSpreadsheet) {
        setStatus('Parsing spreadsheet locally...');
        const reader = new FileReader();
        reader.onload = async (evt) => {
          try {
            const bstr = evt.target.result;
            const wb = XLSX.read(bstr, { type: 'binary' });
            const sheet = wb.Sheets[wb.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

            let headerRowIdx = -1;
            let dutyColIdx = 0;
            let nameColIdx = 3; // 4th column by default
            let empColIdx = 4;  // 5th column by default
            let patternColIdx = -1;
            let trainColIdx = -1;

            // 1. Scan the first 10 rows to find the header row
            for (let i = 0; i < Math.min(rows.length, 10); i++) {
              const row = rows[i];
              if (!Array.isArray(row)) continue;
              
              const hasDuty = row.some(cell => cell && String(cell).toLowerCase().includes('duty'));
              const hasSignOn = row.some(cell => cell && String(cell).toLowerCase().includes('sign') || String(cell).toLowerCase().includes('s on'));
              
              if (hasDuty || hasSignOn) {
                headerRowIdx = i;
                row.forEach((cell, colIdx) => {
                  if (!cell) return;
                  const cellStr = String(cell).toLowerCase();
                  if (cellStr.includes('duty')) dutyColIdx = colIdx;
                  else if (cellStr.includes('name') || cellStr.includes('operator') || cellStr === 'to') nameColIdx = colIdx;
                  else if (cellStr.includes('emp') || cellStr.includes('employ') || cellStr.includes('id')) empColIdx = colIdx;
                  else if (cellStr.includes('pattern') || cellStr.includes('trip')) patternColIdx = colIdx;
                  else if (cellStr.includes('train')) trainColIdx = colIdx;
                });
                break;
              }
            }

            // 2. Extract data from the remaining rows
            const startRowIdx = headerRowIdx !== -1 ? headerRowIdx + 1 : 0;
            const parsed = [];

            for (let i = startRowIdx; i < rows.length; i++) {
              const row = rows[i];
              if (!row || row.length === 0) continue;

              const dutyNoVal = row[dutyColIdx];
              if (dutyNoVal === undefined || dutyNoVal === null || String(dutyNoVal).trim() === '') continue;

              const rawTrainId = trainColIdx !== -1 && row[trainColIdx] !== undefined ? parseInt(row[trainColIdx]) : NaN;

              parsed.push({
                trainId: isNaN(rawTrainId) ? null : rawTrainId,
                dutyNo: String(dutyNoVal).trim(),
                employeeId: row[empColIdx] !== undefined && row[empColIdx] !== null ? String(row[empColIdx]).trim() : '',
                name: row[nameColIdx] !== undefined && row[nameColIdx] !== null ? String(row[nameColIdx]).trim() : '',
                isShortLoop: patternColIdx !== -1 && row[patternColIdx] !== undefined ? String(row[patternColIdx]).toUpperCase().includes('SHORT') : false
              });
            }

            if (parsed.length === 0) {
              throw new Error('No valid roster rows found in spreadsheet. Ensure a Duty column exists.');
            }

            setExtractedData(parsed);
            setStatus(`Successfully parsed ${parsed.length} rows locally.`);
          } catch (e) {
            setError(e.message);
            setStatus('');
          } finally {
            setLoading(false);
          }
        };
        reader.readAsBinaryString(file);
      } else {
        // Universal Ingest / OCR / File conversion
        setStatus('Analyzing document layout...');
        let filePart = null;
        const promptText = `Analyze this roster document. Extract all the rows of the crew roster assignment table. 
Note: In this roster layout, the 4th column contains the Train Operator Name and the 5th column contains the Employee Number (Emp No).
For each row, extract the following columns:
1. "Duty No" (the duty number, e.g. 1, 2, 3...)
2. "NAME" (the operator's name, extracted from the 4th column of the table, e.g. Mahesh Kumar, Jeeva S...)
3. "Emp No" (the operator's employee number, extracted from the 5th column of the table, e.g. 21553, 21969...)
4. "Trip Pattern" (determine if it contains 'SHORT' loop or 'LONG' loop based on the duty type/route if possible, default to 'LONG' if unknown)

Also attempt to extract the document's date (e.g. "21 February 2026") and day of week from the header.
Return the output as a JSON object with keys:
- "rosterDate": string in YYYY-MM-DD format (if found, otherwise null)
- "dayOfWeek": string (e.g. "SATURDAY", "SUNDAY", "MONDAY", "WEEKDAY", matching BMRCL schedule types)
- "duties": array of objects, where each object has keys: "Duty No", "NAME", "Emp No", "Trip Pattern"

Format the response strictly as a single JSON object.`;

        let finalPrompt = promptText;

        // If it is a text-based file, read it client-side to pass as prompt context
        const textExtensions = ['txt', 'json', 'xml', 'md', 'html', 'css', 'js', 'jsx', 'ts', 'tsx', 'csv'];
        if (textExtensions.includes(fileExt) || file.type.startsWith('text/')) {
          setStatus('Reading text document content...');
          const textContent = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsText(file);
          });
          finalPrompt = `Here is the roster file contents:\n\`\`\`\n${textContent}\n\`\`\`\n\n${promptText}`;
        } else {
          // Send file binary
          filePart = await fileToGenerativePart(file);
        }

        let responseText = '';
        const apiKeyToUse = customApiKey.trim() ||
          import.meta.env.VITE_GEMINI_API_KEY ||
          "";
        if (apiKeyToUse) {
          const genAI = new GoogleGenerativeAI(apiKeyToUse);
          const model = genAI.getGenerativeModel({
            model: "gemini-2.5-flash",
            generationConfig: { responseMimeType: "application/json" }
          });
          const contentParts = filePart ? [finalPrompt, filePart] : [finalPrompt];
          const result = await model.generateContent(contentParts);
          responseText = result.response.text();
        } else {
          // 2. Try using the Firebase AI SDK proxy
          try {
            const ai = getAI(app, { backend: new GoogleAIBackend() });
            const model = getGenerativeModel(ai, {
              model: "gemini-2.5-flash",
              generationConfig: { responseMimeType: "application/json" }
            });
            const contentParts = filePart ? [finalPrompt, filePart] : [finalPrompt];
            const result = await model.generateContent(contentParts);
            responseText = result.response.text();
          } catch (firebaseErr) {
            console.error("Firebase AI failed, attempting fallback API key:", firebaseErr);
            // 3. Fallback to direct client-side SDK with env key
            const defaultKey = import.meta.env.VITE_GEMINI_API_KEY || "";
            const genAI = new GoogleGenerativeAI(defaultKey);
            const model = genAI.getGenerativeModel({
              model: "gemini-2.5-flash",
              generationConfig: { responseMimeType: "application/json" }
            });
            const contentParts = filePart ? [finalPrompt, filePart] : [finalPrompt];
            const result = await model.generateContent(contentParts);
            responseText = result.response.text();
          }
        }

        const cleanedText = cleanJsonString(responseText);
        const responseJson = JSON.parse(cleanedText);

        if (responseJson.rosterDate) {
          setSelectedDate(responseJson.rosterDate);
          if (responseJson.dayOfWeek) {
            const normalizedDay = responseJson.dayOfWeek.toUpperCase();
            if (['WEEKDAY', 'MONDAY', 'SATURDAY', 'SUNDAY'].includes(normalizedDay)) {
              setScheduleType(normalizedDay);
            }
          }
        }

        const formattedDuties = (responseJson.duties || []).map(d => ({
          trainId: null,
          dutyNo: String(d["Duty No"] || d["DutyNo"] || ""),
          employeeId: String(d["Emp No"] || d["EmpNo"] || d["Employee ID"] || ""),
          name: String(d["NAME"] || d["Name"] || ""),
          isShortLoop: String(d["Trip Pattern"] || "").toUpperCase().includes("SHORT")
        })).filter(d => d.dutyNo || d.employeeId);

        if (formattedDuties.length === 0) {
          throw new Error('Gemini OCR returned an empty list. Could not identify columns like "Duty No", "NAME", or "Emp No".');
        }

        setExtractedData(formattedDuties);
        setStatus(`Successfully parsed ${formattedDuties.length} roster duties.`);
      }
    } catch (e) {
      console.error(e);
      let errMsg = e.message;
      if (errMsg.includes('blocked') || errMsg.includes('API_KEY_SERVICE_BLOCKED') || errMsg.includes('PERMISSION_DENIED')) {
        errMsg = `${e.message}. \nTip: Requests to Google APIs using the default Firebase key might be restricted. Click the settings icon above and paste a free Gemini API Key from Google AI Studio to proceed.`;
      }
      setError(`Extraction failed: ${errMsg}`);
      setStatus('');
    } finally {
      setLoading(false);
    }
  };


  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (file) processFile(file);
  };

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleDeploy = async () => {
    if (extractedData.length === 0) return;
    setLoading(true);
    setStatus('Deploying roster to live tracks database...');
    setError('');

    try {
      // Step 1: Query static crew links to map Duty ID to Train IDs
      setStatus('Fetching master crew links for mapping...');
      const linksQuery = query(collection(db, 'crew_final_links'), where('scheduleType', '==', scheduleType));
      const linksSnapshot = await getDocs(linksQuery);
      const linksMap = {};
      linksSnapshot.docs.forEach(docSnap => {
        const data = docSnap.data();
        const dId = String(data.dutyId).trim();
        linksMap[dId] = [
          data.trainId,
          data.leg2TrainNo,
          data.leg3TrainNo,
          data.leg4TrainNo
        ].map(t => parseInt(t)).filter(t => !isNaN(t) && t >= 201 && t <= 223);
      });

      // Step 2: Ingest into daily_crew_tracks & crew_daily_deployment
      setStatus('Deploying operators to live tracks and deployments database...');
      const batch = writeBatch(db);
      let deployedTracksCount = 0;
      let deployedDeploymentsCount = 0;

      extractedData.forEach((row) => {
        // 2a. Update crew_daily_deployment for the automated dispatch gate
        if (row.dutyNo) {
          const deployDocId = `gcc_deploy_${scheduleType.toLowerCase()}_duty_${row.dutyNo}`;
          const deployDocRef = doc(db, 'crew_daily_deployment', deployDocId);
          batch.set(deployDocRef, {
            scheduleType: scheduleType,
            dutyId: String(row.dutyNo),
            empId: String(row.employeeId),
            empName: String(row.name),
            remarks: "GCC Multimodal Ingest",
            lastUpdated: serverTimestamp()
          }, { merge: true });
          deployedDeploymentsCount++;
        }

        // 2b. Update daily_crew_tracks based on matched trains
        let targetTrains = [];
        if (row.trainId && row.trainId >= 201 && row.trainId <= 223) {
          targetTrains = [row.trainId];
        } else if (row.dutyNo) {
          const matchedDuty = String(row.dutyNo).trim();
          targetTrains = linksMap[matchedDuty] || [];
        }

        targetTrains.forEach(trainId => {
          const docRef = doc(db, 'daily_crew_tracks', `${selectedDate}_${trainId}`);
          batch.set(docRef, {
            date: selectedDate,
            trainId: trainId,
            isShortLoopActive: row.isShortLoop,
            currentOperator: {
              employeeId: row.employeeId,
              name: row.name,
              dutyNumber: row.dutyNo
            }
          }, { merge: true });
          deployedTracksCount++;
        });
      });

      if (deployedTracksCount === 0 && deployedDeploymentsCount === 0) {
        throw new Error('No tracks or deployments were updated. Ensure that the Duty IDs in the uploaded file correspond to valid train schedules.');
      }

      await batch.commit();
      setStatus(`✅ Successfully deployed roster! Ingested ${extractedData.length} duties across ${deployedDeploymentsCount} deployments and ${deployedTracksCount} live train runs.`);
      setExtractedData([]);
      setFileDetails(null);
    } catch (e) {
      console.error(e);
      setError(`Deployment failed: ${e.message}`);
      setStatus('');
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setExtractedData([]);
    setFileDetails(null);
    setError('');
    setStatus('');
    setPastedJson('');
  };

  const handleJsonPaste = (jsonStr) => {
    try {
      const parsed = JSON.parse(jsonStr);
      let rowsToImport = [];

      // Case 1: BMRCL tables structure (from user's example)
      if (parsed.tables && Array.isArray(parsed.tables)) {
        parsed.tables.forEach(table => {
          if (table.rows && Array.isArray(table.rows)) {
            rowsToImport = rowsToImport.concat(table.rows);
          }
        });
      }
      // Case 2: standard duties array
      else if (parsed.duties && Array.isArray(parsed.duties)) {
        rowsToImport = parsed.duties;
      }
      // Case 3: Flat array
      else if (Array.isArray(parsed)) {
        rowsToImport = parsed;
      }
      // Case 4: Single object
      else if (typeof parsed === 'object' && parsed !== null) {
        rowsToImport = [parsed];
      }

      // Map rows to target structure
      const formatted = rowsToImport.map(row => {
        const dutyKey = Object.keys(row).find(k => k.toLowerCase().replace(/[^a-z]/g, '') === 'dutyno');
        const nameKey = Object.keys(row).find(k => k.toLowerCase() === 'name' || k.toLowerCase().includes('operator') || k.toLowerCase() === 'to');
        const empKey = Object.keys(row).find(k => k.toLowerCase().replace(/[^a-z]/g, '') === 'empno' || k.toLowerCase().includes('employee') || k.toLowerCase() === 'id');
        const patternKey = Object.keys(row).find(k => k.toLowerCase().includes('pattern') || k.toLowerCase().includes('type'));
        const trainKey = Object.keys(row).find(k => k.toLowerCase().includes('train'));

        const rawTrainId = trainKey && row[trainKey] !== undefined && row[trainKey] !== null ? parseInt(row[trainKey]) : NaN;

        return {
          trainId: isNaN(rawTrainId) ? null : rawTrainId,
          dutyNo: dutyKey && row[dutyKey] !== undefined && row[dutyKey] !== null ? String(row[dutyKey]).trim() : '',
          employeeId: empKey && row[empKey] !== undefined && row[empKey] !== null ? String(row[empKey]).trim() : '',
          name: nameKey && row[nameKey] !== undefined && row[nameKey] !== null ? String(row[nameKey]).trim() : '',
          isShortLoop: patternKey && row[patternKey] !== undefined && row[patternKey] !== null ? String(row[patternKey]).toUpperCase().includes('SHORT') : false
        };
      }).filter(r => r.dutyNo || r.employeeId || r.name);

      if (formatted.length === 0) {
        throw new Error('No valid roster records identified in the pasted JSON structure.');
      }

      setFileDetails({ name: 'Manual JSON Paste', size: (jsonStr.length / 1024).toFixed(1) + ' KB', type: 'application/json' });
      setExtractedData(formatted);
      setStatus(`Successfully loaded ${formatted.length} roster duties from pasted JSON.`);
      setError('');
    } catch (e) {
      setError(`JSON Import Failed: ${e.message}`);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-2xl">
      <div className="px-5 py-4 bg-slate-950 border-b border-slate-800 flex justify-between items-center text-emerald-400 font-mono text-sm font-bold tracking-wide">
        <span className="flex items-center gap-2">
          <UploadCloud className="h-4 w-4 text-emerald-500 animate-pulse" />
          MULTIMODAL GCC ROSTER INGESTION FRAMEWORK
        </span>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowConfig(!showConfig)}
            className={`p-1.5 rounded-lg border transition-colors ${showConfig
                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
              }`}
            title="Gemini API settings"
          >
            <Settings className="h-4 w-4" />
          </button>
          <span className="bg-emerald-500/10 text-emerald-400 text-[10px] px-2.5 py-1 rounded-full border border-emerald-500/20 font-mono">
            V2.0 AI-OCR READY
          </span>
        </div>
      </div>

      <div className="p-6 space-y-6">

        {/* Config / Custom API Key Block */}
        {showConfig && (
          <div className="bg-slate-950/60 p-4 rounded-lg border border-emerald-500/20 space-y-3 font-mono text-xs text-slate-350">
            <h4 className="text-emerald-400 font-bold text-xs uppercase tracking-wider flex items-center gap-1.5">
              <Settings className="h-3.5 w-3.5 text-emerald-400" /> Gemini API Key Config
            </h4>
            <p className="text-[10px] text-slate-400 leading-normal">
              If the default Firebase backend key fails with a block restriction, you can supply your own Google AI Studio Gemini API Key below. This key will be saved securely in your browser's local storage.
            </p>
            <div className="flex gap-2">
              <input
                type="password"
                placeholder="Paste Gemini API Key here (starts with AIzaSy...)"
                value={customApiKey}
                onChange={(e) => handleApiKeyChange(e.target.value)}
                className="flex-1 bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-slate-200 focus:border-emerald-500 focus:outline-none"
              />
              {customApiKey && (
                <button
                  onClick={() => handleApiKeyChange('')}
                  className="bg-slate-900 border border-slate-800 text-xs px-2.5 py-1 rounded hover:bg-slate-800 text-slate-400"
                >
                  Clear Key
                </button>
              )}
            </div>
            <div className="text-[9px] text-slate-500 flex items-center gap-1.5">
              <HelpCircle className="h-3 w-3" />
              <span>Need a key?
                <a
                  href="https://aistudio.google.com/"
                  target="_blank"
                  rel="noreferrer"
                  className="text-emerald-400 hover:underline font-bold ml-1"
                >
                  Get a free Gemini API Key from Google AI Studio
                </a>
              </span>
            </div>
          </div>
        )}

        {/* Controls Configuration */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-950/40 p-4 rounded-lg border border-slate-800/80">
          <div className="space-y-1.5">
            <label className="text-[10px] text-slate-500 font-bold uppercase tracking-widest flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5 text-slate-400" /> Target Ingestion Date
            </label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => handleDateChange(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs text-slate-200 focus:border-emerald-500 focus:outline-none transition-colors"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] text-slate-500 font-bold uppercase tracking-widest flex items-center gap-1.5">
              <ShieldAlert className="h-3.5 w-3.5 text-slate-400" /> Schedule Roster Profile
            </label>
            <select
              value={scheduleType}
              onChange={(e) => setScheduleType(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs text-slate-200 focus:border-emerald-500 focus:outline-none transition-colors appearance-none"
            >
              <option value="WEEKDAY">WEEKDAY SCHEDULE</option>
              <option value="MONDAY">MONDAY SCHEDULE</option>
              <option value="SATURDAY">SATURDAY & GH ROSTER</option>
              <option value="SUNDAY">SUNDAY SCHEDULE</option>
            </select>
          </div>
        </div>

        {/* Input Methods Tab & Zones */}
        {extractedData.length === 0 && (
          <div className="space-y-4">
            <div className="flex bg-slate-950 border border-slate-800 rounded-lg p-1 max-w-[280px] font-mono text-[10px]">
              <button
                type="button"
                onClick={() => setActiveInputTab('FILE')}
                className={`flex-1 py-1.5 rounded transition-all font-bold uppercase ${activeInputTab === 'FILE'
                    ? 'bg-emerald-600 text-slate-950 font-black shadow-md'
                    : 'text-slate-400 hover:text-slate-200'
                  }`}
              >
                File Ingest (AI OCR)
              </button>
              <button
                type="button"
                onClick={() => setActiveInputTab('JSON_PASTE')}
                className={`flex-1 py-1.5 rounded transition-all font-bold uppercase ${activeInputTab === 'JSON_PASTE'
                    ? 'bg-emerald-600 text-slate-950 font-black shadow-md'
                    : 'text-slate-400 hover:text-slate-200'
                  }`}
              >
                Paste JSON
              </button>
            </div>

            {activeInputTab === 'FILE' ? (
              <div
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-300 relative group ${dragActive
                    ? 'border-emerald-500 bg-emerald-950/10 shadow-[0_0_20px_rgba(16,185,129,0.05)]'
                    : 'border-slate-800 bg-slate-950/20 hover:border-slate-700 hover:bg-slate-950/40'
                  }`}
              >
                <input
                  type="file"
                  id="file-upload-input"
                  multiple={false}
                  onChange={handleFileUpload}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  accept="*"
                />

                <div className="flex flex-col items-center justify-center space-y-4">
                  <div className="h-16 w-16 bg-slate-900 border border-slate-800 rounded-full flex items-center justify-center group-hover:scale-105 transition-transform duration-300">
                    <UploadCloud className="h-8 w-8 text-slate-400 group-hover:text-emerald-400 transition-colors" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-slate-200 font-bold uppercase tracking-wider">Drag & Drop Roster File here</p>
                    <p className="text-[10px] text-slate-500">or click to browse local storage (Any file type supported)</p>
                  </div>

                  <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
                    <span className="flex items-center gap-1 text-[8px] font-mono bg-slate-900 border border-slate-800 px-2 py-1 rounded text-slate-400">
                      <FileSpreadsheet className="h-3 w-3 text-emerald-500" /> Excel / CSV
                    </span>
                    <span className="flex items-center gap-1 text-[8px] font-mono bg-slate-900 border border-slate-800 px-2 py-1 rounded text-slate-400">
                      <FileText className="h-3 w-3 text-cyan-500" /> PDF & Docs
                    </span>
                    <span className="flex items-center gap-1 text-[8px] font-mono bg-slate-900 border border-slate-800 px-2 py-1 rounded text-slate-400">
                      <ImageIcon className="h-3 w-3 text-amber-500" /> Images (OCR)
                    </span>
                    <span className="flex items-center gap-1 text-[8px] font-mono bg-slate-900 border border-slate-800 px-2 py-1 rounded text-slate-400">
                      <Cpu className="h-3 w-3 text-purple-500" /> AI OCR Fallback
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-3 font-mono">
                <div className="flex justify-between items-center text-[10px] text-slate-400">
                  <span>PASTE RAW OR BMRCL ROSTER JSON DATA:</span>
                  <button
                    type="button"
                    onClick={() => setPastedJson(JSON.stringify({
                      clean_text: "Example Duty Schedule",
                      tables: [{
                        table_name: "Main Schedule",
                        rows: [
                          { "Duty No": "1", "NAME": "Harshith D", "Emp No": "22527", "Trip Pattern": "LONG" },
                          { "Duty No": "2", "NAME": "Vijaya Kumar HT", "Emp No": "22521", "Trip Pattern": "SHORT" }
                        ]
                      }]
                    }, null, 2))}
                    className="text-emerald-500 hover:underline"
                  >
                    Insert Example
                  </button>
                </div>
                <textarea
                  rows={8}
                  placeholder={`Paste Roster JSON data here, e.g.:\n{\n  "tables": [\n    {\n      "rows": [\n        { "Duty No": "1", "NAME": "Harshith D", "Emp No": "22527" }\n      ]\n    }\n  ]\n}`}
                  value={pastedJson}
                  onChange={(e) => setPastedJson(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-emerald-400 focus:border-emerald-500 focus:outline-none placeholder-slate-700 font-mono shadow-inner"
                />
                <button
                  type="button"
                  onClick={() => handleJsonPaste(pastedJson)}
                  disabled={!pastedJson.trim()}
                  className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-slate-950 font-black px-4 py-2 rounded text-[10px] tracking-wider uppercase transition shadow-lg shadow-emerald-500/10"
                >
                  PARSE JSON ROSTER
                </button>
              </div>
            )}
          </div>
        )}

        {/* Loading Spinner */}
        {loading && (
          <div className="flex flex-col items-center justify-center p-8 bg-slate-950/40 rounded-xl border border-slate-800 space-y-3">
            <Loader2 className="h-8 w-8 text-emerald-400 animate-spin" />
            <p className="text-xs font-mono text-slate-300 animate-pulse tracking-wide uppercase">{status}</p>
          </div>
        )}

        {/* Status Messages */}
        {status && !loading && (
          <div className="p-3.5 bg-emerald-950/20 border border-emerald-500/20 rounded-lg flex items-center gap-2.5 text-emerald-400 text-xs font-mono">
            <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
            <span>{status}</span>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="p-3.5 bg-rose-950/20 border border-rose-500/20 rounded-lg flex items-start gap-2.5 text-rose-400 text-xs font-mono">
            <AlertCircle className="h-4 w-4 text-rose-500 shrink-0 mt-0.5" />
            <span className="leading-relaxed whitespace-pre-wrap">{error}</span>
          </div>
        )}

        {/* Data Preview Table */}
        {extractedData.length > 0 && !loading && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-[10px] text-slate-400 font-mono uppercase tracking-wider flex items-center gap-2">
                <span>Roster File: <strong className="text-slate-200">{fileDetails?.name}</strong> ({fileDetails?.size})</span>
                <span className="bg-slate-800 text-slate-300 px-2 py-0.5 rounded-full">{extractedData.length} records parsed</span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleClear}
                  className="bg-slate-900 border border-slate-800 text-xs px-3 py-1.5 rounded hover:bg-slate-800 text-slate-400 flex items-center gap-1 transition font-mono uppercase"
                >
                  <Trash2 size={13} /> Reset
                </button>
                <button
                  onClick={handleDeploy}
                  className="bg-emerald-600 text-slate-950 text-xs px-4 py-1.5 rounded font-black hover:bg-emerald-500 flex items-center gap-1 transition shadow-lg shadow-emerald-500/10 font-mono uppercase"
                >
                  <Play size={13} /> Deploy to Live
                </button>
              </div>
            </div>

            <div className="overflow-hidden border border-slate-800 rounded-lg bg-slate-950/50">
              <div className="max-h-60 overflow-y-auto">
                <table className="w-full text-left border-collapse font-mono text-[10px]">
                  <thead className="bg-slate-950 text-slate-500 uppercase tracking-widest text-[8px] sticky top-0 border-b border-slate-800 z-10">
                    <tr>
                      <th className="p-3 w-16">Row</th>
                      <th className="p-3">Duty No</th>
                      <th className="p-3">Operator Name</th>
                      <th className="p-3">Employee ID</th>
                      <th className="p-3">Loop Pattern</th>
                      <th className="p-3">Train ID</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/40 text-slate-300">
                    {extractedData.map((row, idx) => (
                      <tr key={idx} className="hover:bg-slate-900/30 transition-colors">
                        <td className="p-3 text-slate-500">{idx + 1}</td>
                        <td className="p-3 font-bold text-amber-400">{row.dutyNo || '--'}</td>
                        <td className="p-3 text-slate-200">{row.name || '--'}</td>
                        <td className="p-3 font-semibold text-slate-400">{row.employeeId || '--'}</td>
                        <td className="p-3">
                          <span className={`px-1.5 py-0.5 rounded text-[8px] font-black tracking-wide ${row.isShortLoop
                              ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                              : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                            }`}>
                            {row.isShortLoop ? 'SHORT' : 'LONG'}
                          </span>
                        </td>
                        <td className="p-3">
                          {row.trainId ? (
                            <span className="text-emerald-400 font-bold">{row.trainId}</span>
                          ) : (
                            <span className="text-slate-500 italic">Resolved from Links</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
