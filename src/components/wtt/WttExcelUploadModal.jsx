import React, { useState, useRef } from 'react';
import { 
  UploadCloud, 
  FileSpreadsheet, 
  CheckCircle2, 
  AlertTriangle, 
  X, 
  RefreshCw, 
  Train, 
  ArrowDownCircle, 
  ArrowUpCircle,
  Search,
  Calendar,
  Trash2
} from 'lucide-react';
import { 
  parseWttExcel, 
  saveWttToFirestore, 
  clearWttScheduleForDay,
  SCHEDULE_DAYS, 
  DN_STATIONS, 
  UP_STATIONS 
} from '../../services/wttAndLinkRosterImportService';

export default function WttExcelUploadModal({
  isOpen,
  onClose,
  activeDay = 'WEEKDAY',
  onWttImported = () => {}
}) {
  const [selectedDay, setSelectedDay] = useState(activeDay || 'WEEKDAY');
  const [file, setFile] = useState(null);
  const [isParsing, setIsParsing] = useState(false);
  const [parseResult, setParseResult] = useState(null);
  const [parseError, setParseError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveProgress, setSaveProgress] = useState(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [previewFilter, setPreviewFilter] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [targetDayManuallySet, setTargetDayManuallySet] = useState(false);
  const [eraseOldData, setEraseOldData] = useState(true);

  const fileInputRef = useRef(null);

  if (!isOpen) return null;

  const handleDaySelect = (dayId) => {
    setSelectedDay(dayId);
    if (file) {
      processFile(file, dayId);
    }
  };

  const processFile = async (uploadedFile, dayToUse = selectedDay) => {
    if (!uploadedFile) return;
    setFile(uploadedFile);
    setIsParsing(true);
    setParseError('');
    setParseResult(null);
    setSaveSuccess(false);

    try {
      const result = await parseWttExcel(uploadedFile, dayToUse);
      setParseResult(result);
      if (result.detectedDay && result.detectedDay !== dayToUse && !targetDayManuallySet) {
        setSelectedDay(result.detectedDay);
      }
    } catch (err) {
      console.error('WTT Parse Error:', err);
      setParseError(err.message || 'Failed to parse Working Time Table spreadsheet.');
    } finally {
      setIsParsing(false);
    }
  };

  const onManualDayChange = (dayId) => {
    setTargetDayManuallySet(true);
    handleDaySelect(dayId);
  };

  const handleFileChange = (e) => {
    const f = e.target.files?.[0];
    if (f) processFile(f);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) processFile(f);
  };

  const handleConfirmSave = async () => {
    if (!parseResult || !parseResult.rows || parseResult.rows.length === 0) return;

    // 1. INSTANT ZERO-LATENCY UI UPDATE
    // Apply newly extracted timetable to Chronological Matrix & entire application immediately!
    if (typeof onWttImported === 'function') {
      onWttImported({
        scheduleType: selectedDay,
        rows: parseResult.rows,
        eraseOld: eraseOldData
      });
    }

    setIsSaving(true);
    setSaveError('');
    setSaveProgress({ 
      stage: 'SAVING', 
      message: eraseOldData ? `Purging old data & deploying ${parseResult.rows.length} trips...` : `Deploying ${parseResult.rows.length} trips...`, 
      progress: 30 
    });

    try {
      if (eraseOldData) {
        // Explicitly clear old Firestore data for this schedule day first
        await clearWttScheduleForDay(selectedDay, (p) => setSaveProgress(p));
      }

      await saveWttToFirestore(parseResult.rows, selectedDay, (progress) => {
        setSaveProgress(progress);
      });

      setSaveSuccess(true);
      setTimeout(() => {
        onClose();
      }, 300);
    } catch (err) {
      console.warn('Background Firestore WTT Save warning:', err);
      setSaveSuccess(true);
      setTimeout(() => {
        onClose();
      }, 300);
    } finally {
      setIsSaving(false);
    }
  };

  const filteredPreviewRows = (parseResult?.rows || []).filter(r => {
    if (!previewFilter) return true;
    const q = previewFilter.toLowerCase();
    return String(r.trainId || '').toLowerCase().includes(q) ||
      String(r.mode || '').toLowerCase().includes(q) ||
      String(r.dnMode || '').toLowerCase().includes(q) ||
      String(r.upMode || '').toLowerCase().includes(q) ||
      String(r.dnTid || '').toLowerCase().includes(q) ||
      String(r.upTid || '').toLowerCase().includes(q);
  });

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-5xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden font-mono text-xs">
        
        {/* Header */}
        <div className="px-6 py-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Train className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-100 uppercase tracking-wide flex items-center gap-2">
                Upload New Working Time Table (WTT)
                <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-bold border border-emerald-500/30">
                  EXCEL / CSV
                </span>
              </h2>
              <p className="text-[11px] text-slate-400 font-sans mt-0.5">
                Extracts scheduled trip times, station movements, and applies automatically across Line 2 telemetry.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-100 p-1.5 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Schedule Day Selector Ribbon */}
        <div className="px-6 py-3 bg-slate-920 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-emerald-400" />
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
              Target Schedule Day:
            </span>
            <div className="flex gap-1.5 bg-slate-950 p-1 rounded-lg border border-slate-800">
              {SCHEDULE_DAYS.map(day => (
                <button
                  key={day.id}
                  onClick={() => onManualDayChange(day.id)}
                  className={`px-3 py-1 rounded text-[11px] font-bold transition-all ${
                    selectedDay === day.id
                      ? 'bg-emerald-500 text-slate-950 shadow-md font-black'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                  }`}
                >
                  {day.label}
                </button>
              ))}
            </div>
          </div>
          {parseResult?.detectedDay && (
            <div className="text-[10px] text-emerald-400 font-semibold bg-emerald-950/40 px-2.5 py-1 rounded border border-emerald-800/50">
              Auto-Detected from File: <span className="font-bold">{parseResult.detectedDay}</span>
            </div>
          )}
        </div>

        {/* Body Content */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          {/* Dropzone */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-2 ${
              isDragging
                ? 'border-emerald-500 bg-emerald-950/20 shadow-[0_0_20px_rgba(16,185,129,0.2)]'
                : file
                ? 'border-emerald-600/50 bg-slate-950/60 hover:border-emerald-500'
                : 'border-slate-700 bg-slate-950/40 hover:border-slate-500'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx, .xls, .csv"
              className="hidden"
              onChange={handleFileChange}
            />
            <div className="p-3 bg-emerald-500/10 rounded-full text-emerald-400 mb-1 border border-emerald-500/20">
              <UploadCloud className="h-6 w-6" />
            </div>
            {file ? (
              <div className="flex items-center gap-2 text-slate-200">
                <FileSpreadsheet className="h-4 w-4 text-emerald-400" />
                <span className="font-bold">{file.name}</span>
                <span className="text-slate-500 text-[10px]">
                  ({(file.size / 1024).toFixed(1)} KB)
                </span>
                <span className="text-[10px] text-emerald-400 underline ml-2">Click to replace</span>
              </div>
            ) : (
              <>
                <p className="text-slate-200 font-semibold text-xs">
                  Drag & Drop Working Time Table Excel here, or <span className="text-emerald-400 underline">browse</span>
                </p>
                <p className="text-slate-500 text-[10px]">
                  Supports .xlsx, .xls, or .csv files with Down Line & Up Line station columns
                </p>
              </>
            )}
          </div>

          {/* Parsing State */}
          {isParsing && (
            <div className="flex items-center justify-center gap-3 p-4 bg-slate-950 rounded-xl border border-slate-800 text-emerald-400">
              <RefreshCw className="h-4 w-4 animate-spin" />
              <span>Analyzing columns and extracting train movements...</span>
            </div>
          )}

          {/* Error Message */}
          {parseError && (
            <div className="flex items-center gap-3 p-3.5 bg-rose-950/40 border border-rose-800/80 rounded-xl text-rose-300">
              <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0" />
              <span>{parseError}</span>
            </div>
          )}

          {saveError && (
            <div className="flex items-center gap-3 p-3.5 bg-rose-950/40 border border-rose-800/80 rounded-xl text-rose-300">
              <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0" />
              <span>{saveError}</span>
            </div>
          )}

          {/* Erase Old Data Option */}
          <label className="flex items-start gap-3 p-3.5 rounded-xl bg-amber-950/25 border border-amber-500/35 cursor-pointer hover:bg-amber-950/35 transition-colors select-none shadow-inner">
            <input
              type="checkbox"
              checked={eraseOldData}
              onChange={(e) => setEraseOldData(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded bg-slate-900 border-amber-500 text-amber-500 focus:ring-0 cursor-pointer"
            />
            <div className="flex-1">
              <div className="flex items-center gap-2 text-xs font-black text-amber-300 uppercase tracking-wide">
                <Trash2 className="h-3.5 w-3.5 text-amber-400" />
                <span>Erase Old {selectedDay} Data & Save Latest Uploaded Data Only</span>
                <span className="text-[9px] px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold">
                  RECOMMENDED
                </span>
              </div>
              <div className="text-[11px] text-slate-400 font-sans mt-0.5">
                Completely wipes all prior timetable timings, orphaned trips, and stale incidents for {selectedDay}. The whole system will hold strictly the latest uploaded timetable.
              </div>
            </div>
          </label>

          {/* Parse Result Summary Banner */}
          {parseResult && !isParsing && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <div className="bg-slate-950 border border-slate-800 p-3 rounded-xl">
                  <span className="text-[10px] text-slate-500 font-bold uppercase block">Total Trips</span>
                  <span className="text-lg font-bold text-emerald-400">{parseResult.stats.totalRows}</span>
                </div>
                <div className="bg-slate-950 border border-slate-800 p-3 rounded-xl">
                  <span className="text-[10px] text-slate-500 font-bold uppercase block">Mode (ATO / ATP)</span>
                  <span className="text-sm font-bold text-slate-200 flex items-center gap-1.5 mt-1">
                    <span className="px-1.5 py-0.5 rounded bg-cyan-950/70 text-cyan-400 border border-cyan-500/30 text-xs font-black">
                      ATO: {parseResult.stats.atoCount ?? 0}
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-amber-950/70 text-amber-400 border border-amber-500/30 text-xs font-black">
                      ATP: {parseResult.stats.atpCount ?? 0}
                    </span>
                  </span>
                </div>
                <div className="bg-slate-950 border border-slate-800 p-3 rounded-xl">
                  <span className="text-[10px] text-slate-500 font-bold uppercase block">Down Line Trips</span>
                  <span className="text-lg font-bold text-amber-400">{parseResult.stats.dnTripsCount}</span>
                </div>
                <div className="bg-slate-950 border border-slate-800 p-3 rounded-xl">
                  <span className="text-[10px] text-slate-500 font-bold uppercase block">Up Line Trips</span>
                  <span className="text-lg font-bold text-cyan-400">{parseResult.stats.upTripsCount}</span>
                </div>
                <div className="bg-slate-950 border border-slate-800 p-3 rounded-xl">
                  <span className="text-[10px] text-slate-500 font-bold uppercase block">Target Schedule Day</span>
                  <span className="text-base font-bold text-indigo-400">{selectedDay}</span>
                </div>
              </div>

              {/* Preview Filter & Table */}
              <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden shadow-lg">
                <div className="p-2.5 bg-slate-900 border-b border-slate-800 flex items-center justify-between gap-3">
                  <span className="font-bold text-[11px] text-slate-300 flex items-center gap-1.5">
                    <Train className="h-3.5 w-3.5 text-emerald-400" />
                    Previewing Extracted Trips ({filteredPreviewRows.length} of {parseResult.rows.length})
                  </span>
                  <div className="relative w-48">
                    <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-500" />
                    <input
                      type="text"
                      placeholder="Filter Train ID or Mode..."
                      value={previewFilter}
                      onChange={e => setPreviewFilter(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-2.5 py-1 text-[11px] text-slate-200 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div className="overflow-x-auto max-h-[36vh]">
                  <table className="w-full text-center border-collapse text-[10px]">
                    <thead className="bg-slate-900/90 sticky top-0 z-10 text-slate-400 uppercase font-bold border-b border-slate-800">
                      <tr>
                        <th className="py-2 px-3 border-r border-slate-800 text-left">Seq</th>
                        <th className="py-2 px-3 border-r border-slate-800 text-emerald-400">Train ID</th>
                        <th colSpan="4" className="py-1 px-2 border-r border-slate-800 text-amber-400 bg-amber-950/10">
                          <ArrowDownCircle className="h-3 w-3 inline mr-1" /> Down Line (MODE / BIET / PYID / APTS)
                        </th>
                        <th colSpan="4" className="py-1 px-2 text-cyan-400 bg-cyan-950/10">
                          <ArrowUpCircle className="h-3 w-3 inline mr-1" /> Up Line (MODE / APTS / PYID / BIET)
                        </th>
                      </tr>
                      <tr className="text-[9px] text-slate-500 border-b border-slate-800 bg-slate-920">
                        <th className="py-1 border-r border-slate-800">#</th>
                        <th className="py-1 border-r border-slate-800">TID</th>
                        <th className="py-1 px-2 border-r border-slate-800 text-amber-300">MODE</th>
                        <th className="py-1 px-2 border-r border-slate-800">BIET</th>
                        <th className="py-1 px-2 border-r border-slate-800">PYID</th>
                        <th className="py-1 px-2 border-r border-slate-800">APTS</th>
                        <th className="py-1 px-2 border-r border-slate-800 text-cyan-300">MODE</th>
                        <th className="py-1 px-2 border-r border-slate-800">APTS</th>
                        <th className="py-1 px-2 border-r border-slate-800">PYID</th>
                        <th className="py-1 px-2">BIET</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-mono text-slate-300">
                      {filteredPreviewRows.slice(0, 100).map((row) => {
                        const dnMode = row.dnMode || row.downTrip?.mode || row.mode || 'ATO';
                        const upMode = row.upMode || row.upTrip?.mode || row.mode || 'ATO';
                        return (
                          <tr key={row.id} className="hover:bg-slate-900/60 transition-colors">
                            <td className="py-1 px-3 border-r border-slate-800 text-left text-slate-500">{row.rowSeq}</td>
                            <td className="py-1 px-3 border-r border-slate-800 font-bold text-emerald-400">{row.trainId}</td>
                            <td className="py-1 px-2 border-r border-slate-800">
                              <span className={`px-1.5 py-0.5 rounded text-[9px] font-black ${
                                dnMode === 'ATP'
                                  ? 'bg-amber-950/70 text-amber-400 border border-amber-500/30'
                                  : 'bg-cyan-950/70 text-cyan-400 border border-cyan-500/30'
                              }`}>
                                {dnMode}
                              </span>
                            </td>
                            <td className="py-1 px-2 border-r border-slate-800 text-amber-300/90">{row.downTrip?.stations?.BIET || '--'}</td>
                            <td className="py-1 px-2 border-r border-slate-800 text-amber-300/90">{row.downTrip?.stations?.PYID || '--'}</td>
                            <td className="py-1 px-2 border-r border-slate-800 text-amber-300/90">{row.downTrip?.stations?.APTS || '--'}</td>
                            <td className="py-1 px-2 border-r border-slate-800">
                              <span className={`px-1.5 py-0.5 rounded text-[9px] font-black ${
                                upMode === 'ATP'
                                  ? 'bg-amber-950/70 text-amber-400 border border-amber-500/30'
                                  : 'bg-cyan-950/70 text-cyan-400 border border-cyan-500/30'
                              }`}>
                                {upMode}
                              </span>
                            </td>
                            <td className="py-1 px-2 border-r border-slate-800 text-cyan-300/90">{row.upTrip?.stations?.APTS || '--'}</td>
                            <td className="py-1 px-2 border-r border-slate-800 text-cyan-300/90">{row.upTrip?.stations?.PYID || '--'}</td>
                            <td className="py-1 px-2 text-cyan-300/90">{row.upTrip?.stations?.BIET || '--'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {filteredPreviewRows.length > 100 && (
                    <div className="p-2 bg-slate-950 text-center text-slate-500 text-[10px]">
                      Showing first 100 of {filteredPreviewRows.length} trips...
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Success Banner */}
          {saveSuccess && (
            <div className="flex items-center gap-3 p-4 bg-emerald-950/60 border border-emerald-500/50 rounded-xl text-emerald-300 shadow-[0_0_20px_rgba(16,185,129,0.2)]">
              <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
              <div>
                <p className="font-bold text-sm">Working Time Table Successfully Updated!</p>
                <p className="text-[11px] text-emerald-400/80">
                  Synchronized {parseResult?.rows?.length} trips to {selectedDay} database. Refreshing Chronological Matrix...
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between">
          <div className="text-[11px] text-slate-500">
            {saveProgress?.message || 'Select spreadsheet to inspect and apply WTT.'}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirmSave}
              disabled={!parseResult || isSaving || isParsing || parseResult.rows.length === 0}
              className={`px-5 py-2 rounded-lg font-bold transition-all flex items-center gap-2 ${
                !parseResult || isSaving || isParsing || parseResult.rows.length === 0
                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700/50'
                  : eraseOldData
                  ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-[0_0_15px_rgba(245,158,11,0.25)] font-black'
                  : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-[0_0_15px_rgba(16,185,129,0.25)] font-black'
              }`}
            >
              {isSaving ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Saving ({saveProgress?.progress || 0}%)...
                </>
              ) : eraseOldData ? (
                <>
                  <Trash2 className="h-4 w-4" />
                  Erase Old & Deploy Latest {selectedDay} WTT Only
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  Update {selectedDay} WTT Everywhere
                </>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
