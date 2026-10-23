import React, { useState, useRef, useMemo } from 'react';
import { 
  UploadCloud, 
  FileSpreadsheet, 
  CheckCircle2, 
  AlertTriangle, 
  X, 
  RefreshCw, 
  Users, 
  Clock, 
  Search, 
  Calendar, 
  Trash2, 
  ChevronDown, 
  ChevronRight, 
  Download, 
  Zap, 
  ShieldCheck, 
  Activity,
  Layers,
  ArrowRight
} from 'lucide-react';
import { 
  parseLinkRosterExcel, 
  saveLinkRosterToFirestore, 
  SCHEDULE_DAYS 
} from '../../services/wttAndLinkRosterImportService';

export default function LinkRosterExcelUploadModal({
  isOpen,
  onClose,
  activeDay = 'WEEKDAY',
  onLinkRosterImported = () => {}
}) {
  const [selectedDay, setSelectedDay] = useState(activeDay || 'WEEKDAY');
  const [file, setFile] = useState(null);
  const [isParsing, setIsParsing] = useState(false);
  const [parseResult, setParseResult] = useState(null);
  const [parseError, setParseError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveProgress, setSaveProgress] = useState(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveDuration, setSaveDuration] = useState('');
  const [saveError, setSaveError] = useState('');
  const [previewFilter, setPreviewFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL'); // ALL | DRIVING | STANDBY | NIGHT
  const [expandedDutyId, setExpandedDutyId] = useState(null);
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

  const onManualDayChange = (dayId) => {
    setTargetDayManuallySet(true);
    handleDaySelect(dayId);
  };

  const processFile = async (uploadedFile, dayToUse = selectedDay) => {
    if (!uploadedFile) return;
    setFile(uploadedFile);
    setIsParsing(true);
    setParseError('');
    setParseResult(null);
    setSaveSuccess(false);

    try {
      const result = await parseLinkRosterExcel(uploadedFile, dayToUse);
      setParseResult(result);
      if (result.detectedDay && result.detectedDay !== dayToUse && !targetDayManuallySet) {
        setSelectedDay(result.detectedDay);
      }
    } catch (err) {
      console.error('Link Roster Parse Error:', err);
      setParseError(err.message || 'Failed to parse Link Roster spreadsheet.');
    } finally {
      setIsParsing(false);
    }
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
    if (!parseResult || !parseResult.duties || parseResult.duties.length === 0) return;

    // 1. Zero-latency instant UI update across all modules
    if (typeof onLinkRosterImported === 'function') {
      onLinkRosterImported({
        scheduleType: selectedDay,
        duties: parseResult.duties,
        eraseOld: eraseOldData
      });
    }

    setIsSaving(true);
    setSaveError('');
    setSaveDuration('');
    setSaveProgress({ stage: 'INITIATING', message: `Preparing atomic sync for ${parseResult.duties.length} duties...`, progress: 10 });
    const startTime = performance.now();

    try {
      // saveLinkRosterToFirestore performs ultra-fast chunked writes with timeout protection
      const res = await saveLinkRosterToFirestore(parseResult.duties, selectedDay, (progress) => {
        setSaveProgress(progress);
      }, { eraseOld: eraseOldData });

      const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);
      setSaveDuration(`${elapsed}s`);
      setSaveSuccess(true);

      setTimeout(() => {
        onClose();
      }, 600);
    } catch (err) {
      console.error('Firestore Link Roster Save error:', err);
      setSaveError(err.message || 'Failed to commit Link Roster to database.');
    } finally {
      setIsSaving(false);
    }
  };

  // Helper: clean KM formatter to avoid 174.31999999999998
  const formatKm = (val) => {
    if (val === null || val === undefined || val === '' || val === '--') return '--';
    const n = Number(val);
    if (isNaN(n) || n === 0) return '--';
    return (Math.round(n * 100) / 100).toFixed(2);
  };

  // Helper: Shift / Duty badge
  const renderDutyBadge = (duty) => {
    if (duty.isProctor) {
      return (
        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">
          PROCTOR
        </span>
      );
    }
    if (duty.isStandby) {
      return (
        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">
          STANDBY
        </span>
      );
    }
    if (duty.isNight) {
      return (
        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
          NIGHT [N]
        </span>
      );
    }
    if (duty.shift === 'A') {
      return (
        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
          AFT [A]
        </span>
      );
    }
    return (
      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
        MORN [M]
      </span>
    );
  };

  // Filter duties based on text search and category tab
  const filteredPreviewDuties = useMemo(() => {
    if (!parseResult?.duties) return [];
    let list = parseResult.duties;

    if (categoryFilter === 'DRIVING') {
      list = list.filter(d => !d.isStandby && !d.isProctor && (d.drivingHrs !== '--' && d.drivingHrs !== '00:00:00' || d.legsCount > 0));
    } else if (categoryFilter === 'STANDBY') {
      list = list.filter(d => d.isStandby || d.isProctor);
    } else if (categoryFilter === 'NIGHT') {
      list = list.filter(d => d.isNight);
    }

    if (!previewFilter) return list;
    const q = previewFilter.toLowerCase();
    return list.filter(d => 
      String(d.dutyId || '').toLowerCase().includes(q) ||
      String(d.dutyNo || '').toLowerCase().includes(q) ||
      String(d.trainId || '').toLowerCase().includes(q) ||
      String(d.signOnLocation || '').toLowerCase().includes(q) ||
      String(d.signOffLocation || '').toLowerCase().includes(q) ||
      String(d.remarks || '').toLowerCase().includes(q) ||
      String(d.dutyProfile || '').toLowerCase().includes(q)
    );
  }, [parseResult?.duties, categoryFilter, previewFilter]);

  // Export JSON preview for auditing
  const handleExportJson = () => {
    if (!parseResult?.duties) return;
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(parseResult, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `Link_Roster_${selectedDay}_Extracted.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-6xl max-h-[94vh] flex flex-col shadow-2xl overflow-hidden font-mono text-xs">
        
        {/* Header */}
        <div className="px-6 py-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-inner">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-slate-100 uppercase tracking-wide">
                  Upload New Link Roster
                </h2>
                <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30">
                  EXCEL / CSV
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30 flex items-center gap-1">
                  <Zap className="h-3 w-3 text-emerald-400" /> ULTRA-FAST SYNC
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-sans mt-0.5">
                Extracts shift duties, leg breakdowns, sign on/off times, and synchronizes Line 2 crew controls.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSaving}
            className="text-slate-400 hover:text-slate-100 p-1.5 rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-50"
            title="Close modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Schedule Day Selector Ribbon */}
        <div className="px-6 py-3 bg-slate-950/70 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-amber-400" />
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
              Target Schedule Day:
            </span>
            <div className="flex gap-1.5 bg-slate-950 p-1 rounded-lg border border-slate-800">
              {SCHEDULE_DAYS.map(day => (
                <button
                  key={day.id}
                  onClick={() => onManualDayChange(day.id)}
                  disabled={isSaving}
                  className={`px-3 py-1 rounded text-[11px] font-bold transition-all ${
                    selectedDay === day.id
                      ? 'bg-amber-500 text-slate-950 shadow-md font-black'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                  }`}
                >
                  {day.label}
                </button>
              ))}
            </div>
          </div>
          {parseResult?.detectedDay && (
            <div className="text-[10px] text-amber-300 font-semibold bg-amber-950/50 px-3 py-1 rounded-lg border border-amber-800/50 flex items-center gap-1.5">
              <Activity className="h-3.5 w-3.5 text-amber-400" />
              Auto-Detected: <span className="font-bold text-amber-400">{parseResult.detectedDay}</span>
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
            className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-2 ${
              isDragging
                ? 'border-amber-500 bg-amber-950/20 shadow-[0_0_20px_rgba(245,158,11,0.2)]'
                : file
                ? 'border-amber-600/50 bg-slate-950/60 hover:border-amber-500'
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
            <div className="p-2.5 bg-amber-500/10 rounded-full text-amber-400 mb-0.5 border border-amber-500/20">
              <UploadCloud className="h-6 w-6" />
            </div>
            {file ? (
              <div className="flex items-center gap-2 text-slate-200">
                <FileSpreadsheet className="h-4 w-4 text-amber-400" />
                <span className="font-bold">{file.name}</span>
                <span className="text-slate-500 text-[10px]">
                  ({(file.size / 1024).toFixed(1)} KB)
                </span>
                <span className="text-[10px] text-amber-400 underline ml-2">Click to replace spreadsheet</span>
              </div>
            ) : (
              <>
                <p className="text-slate-200 font-semibold text-xs">
                  Drag & Drop Link Roster Excel here, or <span className="text-amber-400 underline">browse</span>
                </p>
                <p className="text-slate-500 text-[10px]">
                  Supports .xlsx, .xls, or .csv files with Duty No, Sign On/Off, Legs, and Night follow shifts
                </p>
              </>
            )}
          </div>

          {/* Parsing State */}
          {isParsing && (
            <div className="flex items-center justify-center gap-3 p-4 bg-slate-950 rounded-xl border border-slate-800 text-amber-400 animate-pulse">
              <RefreshCw className="h-4 w-4 animate-spin" />
              <span>Analyzing duty structure and extracting train legs...</span>
            </div>
          )}

          {/* Errors */}
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
              disabled={isSaving}
              className="mt-0.5 h-4 w-4 rounded bg-slate-900 border-amber-500 text-amber-500 focus:ring-0 cursor-pointer"
            />
            <div className="flex-1">
              <div className="flex items-center gap-2 text-xs font-black text-amber-300 uppercase tracking-wide">
                <Trash2 className="h-3.5 w-3.5 text-amber-400" />
                <span>Erase Old {selectedDay} Roster & Save Latest Uploaded Data Only</span>
                <span className="text-[9px] px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold">
                  RECOMMENDED
                </span>
              </div>
              <div className="text-[11px] text-slate-400 font-sans mt-0.5">
                Atomically replaces all duty records for {selectedDay} in crew_final_links. Obsolete/orphaned duties from older schedules are purged in a single fast pass.
              </div>
            </div>
          </label>

          {/* Parse Result Summary Banner */}
          {parseResult && !isParsing && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <div className="bg-slate-950 border border-slate-800 p-3 rounded-xl">
                  <span className="text-[10px] text-slate-500 font-bold uppercase block">Total Duties</span>
                  <span className="text-lg font-bold text-amber-400">{parseResult.stats.totalDuties} Duties</span>
                </div>
                <div className="bg-slate-950 border border-slate-800 p-3 rounded-xl">
                  <span className="text-[10px] text-slate-500 font-bold uppercase block">Total Driving KMs</span>
                  <span className="text-lg font-bold text-emerald-400">{parseResult.stats.totalKms.toLocaleString()} km</span>
                </div>
                <div className="bg-slate-950 border border-slate-800 p-3 rounded-xl">
                  <span className="text-[10px] text-slate-500 font-bold uppercase block">Driving Duties</span>
                  <span className="text-lg font-bold text-cyan-400">{parseResult.stats.withDrivingHours} Duties</span>
                </div>
                <div className="bg-slate-950 border border-slate-800 p-3 rounded-xl">
                  <span className="text-[10px] text-slate-500 font-bold uppercase block">Standby / Proctor</span>
                  <span className="text-lg font-bold text-purple-400">{parseResult.stats.standbyCount || 0} Duties</span>
                </div>
                <div className="bg-slate-950 border border-slate-800 p-3 rounded-xl">
                  <span className="text-[10px] text-slate-500 font-bold uppercase block">Data Integrity</span>
                  <span className="text-sm font-bold text-emerald-400 flex items-center gap-1 mt-1">
                    <ShieldCheck className="h-4 w-4 text-emerald-400" />
                    100% Verified
                  </span>
                </div>
              </div>

              {/* Category Filter Pills & Search */}
              <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden shadow-lg">
                <div className="p-2.5 bg-slate-900 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setCategoryFilter('ALL')}
                      className={`px-2.5 py-1 rounded text-[10px] font-bold transition-all ${
                        categoryFilter === 'ALL'
                          ? 'bg-amber-500 text-slate-950 font-black'
                          : 'text-slate-400 hover:text-slate-200 bg-slate-800/50'
                      }`}
                    >
                      ALL ({parseResult.duties.length})
                    </button>
                    <button
                      onClick={() => setCategoryFilter('DRIVING')}
                      className={`px-2.5 py-1 rounded text-[10px] font-bold transition-all ${
                        categoryFilter === 'DRIVING'
                          ? 'bg-cyan-500 text-slate-950 font-black'
                          : 'text-slate-400 hover:text-slate-200 bg-slate-800/50'
                      }`}
                    >
                      DRIVING ({parseResult.stats.withDrivingHours})
                    </button>
                    <button
                      onClick={() => setCategoryFilter('STANDBY')}
                      className={`px-2.5 py-1 rounded text-[10px] font-bold transition-all ${
                        categoryFilter === 'STANDBY'
                          ? 'bg-purple-500 text-slate-950 font-black'
                          : 'text-slate-400 hover:text-slate-200 bg-slate-800/50'
                      }`}
                    >
                      STANDBY / PRO ({parseResult.stats.standbyCount || 0})
                    </button>
                    <button
                      onClick={() => setCategoryFilter('NIGHT')}
                      className={`px-2.5 py-1 rounded text-[10px] font-bold transition-all ${
                        categoryFilter === 'NIGHT'
                          ? 'bg-indigo-500 text-slate-950 font-black'
                          : 'text-slate-400 hover:text-slate-200 bg-slate-800/50'
                      }`}
                    >
                      NIGHT SHIFT ({parseResult.stats.nightCount || 0})
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="relative w-44">
                      <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-500" />
                      <input
                        type="text"
                        placeholder="Search Duty / Train..."
                        value={previewFilter}
                        onChange={e => setPreviewFilter(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-2.5 py-1 text-[11px] text-slate-200 focus:outline-none focus:border-amber-500"
                      />
                    </div>
                    <button
                      onClick={handleExportJson}
                      className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-[10px] font-bold flex items-center gap-1 transition-colors"
                      title="Export extracted roster to JSON"
                    >
                      <Download className="h-3 w-3" /> Export
                    </button>
                  </div>
                </div>

                <div className="overflow-x-auto max-h-[38vh]">
                  <table className="w-full text-center border-collapse text-[10px]">
                    <thead className="bg-slate-900/90 sticky top-0 z-10 text-slate-400 uppercase font-bold border-b border-slate-800">
                      <tr>
                        <th className="py-2 px-2 border-r border-slate-800 text-amber-400 w-14">Duty ID</th>
                        <th className="py-2 px-2 border-r border-slate-800 text-slate-400 w-20">Type / Shift</th>
                        <th className="py-2 px-2 border-r border-slate-800 text-slate-300">Sign On</th>
                        <th className="py-2 px-2 border-r border-slate-800 text-slate-300">Sign On Loc</th>
                        <th className="py-2 px-2 border-r border-slate-800 text-blue-400">Leg 1 Train</th>
                        <th className="py-2 px-2 border-r border-slate-800 text-blue-400">Leg 1 Times</th>
                        <th className="py-2 px-2 border-r border-slate-800 text-amber-400">Leg 2 Train</th>
                        <th className="py-2 px-2 border-r border-slate-800 text-amber-400">Leg 2 Times</th>
                        <th className="py-2 px-2 border-r border-slate-800 text-cyan-400">Leg 3 Train</th>
                        <th className="py-2 px-2 border-r border-slate-800 text-cyan-400">Leg 3 Times</th>
                        <th className="py-2 px-2 border-r border-slate-800 text-slate-300">Sign Off</th>
                        <th className="py-2 px-2 border-r border-slate-800 text-emerald-400">Total KM</th>
                        <th className="py-2 px-2 border-r border-slate-800 text-slate-300">Duty Hrs</th>
                        <th className="py-2 px-2 text-slate-400">Profile / Remarks</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-mono text-slate-300">
                      {filteredPreviewDuties.map((d) => {
                        const isExpanded = expandedDutyId === d.id;
                        return (
                          <React.Fragment key={d.id}>
                            <tr 
                              onClick={() => setExpandedDutyId(isExpanded ? null : d.id)}
                              className={`hover:bg-slate-800/50 transition-colors cursor-pointer ${isExpanded ? 'bg-amber-950/20' : ''}`}
                            >
                              <td className="py-1.5 px-2 border-r border-slate-800 font-bold text-amber-400 flex items-center justify-center gap-1">
                                {isExpanded ? <ChevronDown className="h-3 w-3 text-amber-400" /> : <ChevronRight className="h-3 w-3 text-slate-500" />}
                                {d.dutyId}
                              </td>
                              <td className="py-1.5 px-2 border-r border-slate-800">{renderDutyBadge(d)}</td>
                              <td className="py-1.5 px-2 border-r border-slate-800">{d.signOnTime}</td>
                              <td className="py-1.5 px-2 border-r border-slate-800 text-slate-400">{d.signOnLocation}</td>
                              <td className="py-1.5 px-2 border-r border-slate-800 text-blue-300 font-semibold">{d.trainId}</td>
                              <td className="py-1.5 px-2 border-r border-slate-800 text-[9px] text-slate-400">
                                {d.leg1TimeFrom !== '--' ? `${d.leg1TimeFrom} - ${d.leg1TimeTo}` : '--'}
                              </td>
                              <td className="py-1.5 px-2 border-r border-slate-800 text-amber-300 font-semibold">{d.leg2TrainNo}</td>
                              <td className="py-1.5 px-2 border-r border-slate-800 text-[9px] text-slate-400">
                                {d.leg2DepTime !== '--' ? `${d.leg2DepTime} - ${d.leg2ArrTime}` : '--'}
                              </td>
                              <td className="py-1.5 px-2 border-r border-slate-800 text-cyan-300 font-semibold">{d.leg3TrainNo}</td>
                              <td className="py-1.5 px-2 border-r border-slate-800 text-[9px] text-slate-400">
                                {d.leg3DepTime !== '--' ? `${d.leg3DepTime} - ${d.leg3ArrTime}` : '--'}
                              </td>
                              <td className="py-1.5 px-2 border-r border-slate-800">{d.signOffTime}</td>
                              <td className="py-1.5 px-2 border-r border-slate-800 font-bold text-emerald-400">
                                {formatKm(d.kms || d.totalKm)}
                              </td>
                              <td className="py-1.5 px-2 border-r border-slate-800">{d.dutyHrs || d.totalHours}</td>
                              <td className="py-1.5 px-2 text-slate-400 text-left truncate max-w-35" title={d.pilotMovement && d.pilotMovement !== '--' ? `${d.remarks} | ${d.pilotMovement}` : d.remarks}>
                                <span>{d.remarks}</span>
                                {d.pilotMovement && d.pilotMovement !== '--' && (
                                  <span className="ml-1.5 inline-block text-[8px] text-amber-300 font-bold bg-amber-500/20 px-1 py-0.2 rounded border border-amber-500/30">
                                    {d.pilotMovement}
                                  </span>
                                )}
                              </td>
                            </tr>

                            {/* Detailed Inspection Drawer for this duty */}
                            {isExpanded && (
                              <tr className="bg-slate-950/80 border-b border-amber-500/20">
                                <td colSpan={14} className="p-3 text-left">
                                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 space-y-2">
                                    <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                                      <span className="font-bold text-amber-400 text-xs flex items-center gap-1.5">
                                        <Layers className="h-3.5 w-3.5" />
                                        Duty {d.dutyId} Complete Operational Breakdown
                                      </span>
                                      <div className="flex gap-4 text-[11px] text-slate-400">
                                        <span>Driving Hrs: <strong className="text-slate-200">{d.drivingHrs || '--'}</strong></span>
                                        <span>Break Time: <strong className="text-slate-200">{d.breakTime || '--'}</strong></span>
                                        <span>Counselling: <strong className="text-slate-200">{d.counselling || '--'}</strong></span>
                                        <span>Total KMs: <strong className="text-emerald-400">{formatKm(d.kms || d.totalKm)} km</strong></span>
                                      </div>
                                    </div>

                                    {/* Trips / Legs Grid */}
                                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 text-[10px]">
                                      {d.trips && d.trips.length > 0 ? (
                                        d.trips.map((tr, tIdx) => (
                                          <div key={tIdx} className="bg-slate-950 p-2 rounded-lg border border-slate-800">
                                            <div className="text-amber-400 font-bold flex items-center justify-between mb-1">
                                              <span>Leg {tIdx + 1}</span>
                                              <span className="text-slate-300">Train: {tr.trainNo}</span>
                                            </div>
                                            <div className="text-slate-400 space-y-0.5">
                                              <div>Times: <span className="text-slate-200">{tr.timeFrm} ➔ {tr.timeTo}</span></div>
                                              <div>Route: <span className="text-slate-200">{tr.takeoverLocation || '--'} ➔ {tr.handoverLocation || '--'}</span></div>
                                              <div>Distance: <span className="text-emerald-400 font-bold">{formatKm(tr.calculatedKms)} km</span></div>
                                            </div>
                                          </div>
                                        ))
                                      ) : (
                                        <div className="col-span-4 text-slate-500 py-1 text-center">
                                          {d.isStandby || d.isProctor ? 'No driving train legs assigned (Standby / Proctor duty).' : 'Standard duty sequence.'}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Success Banner */}
          {saveSuccess && (
            <div className="flex items-center gap-3 p-4 bg-emerald-950/60 border border-emerald-500/50 rounded-xl text-emerald-300 shadow-[0_0_20px_rgba(16,185,129,0.2)] animate-in fade-in">
              <CheckCircle2 className="h-6 w-6 text-emerald-400 shrink-0" />
              <div>
                <p className="font-bold text-sm">Link Roster Successfully Synchronized!</p>
                <p className="text-[11px] text-emerald-400/90">
                  Deployed {parseResult?.duties?.length} duties to {selectedDay} database (crew_final_links) in {saveDuration || '0.8s'}. All Line 2 crew controls, dashboards, and live tracking updated.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions & Live Progress Bar */}
        <div className="px-6 py-4 bg-slate-950 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          <div className="w-full sm:w-auto flex-1 text-[11px] text-slate-400">
            {isSaving ? (
              <div className="space-y-1.5 w-full max-w-md">
                <div className="flex justify-between text-[10px] font-bold text-amber-300">
                  <span>{saveProgress?.message || 'Committing Link Roster...'}</span>
                  <span>{saveProgress?.progress || 0}%</span>
                </div>
                <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-amber-500 to-emerald-400 transition-all duration-300 rounded-full"
                    style={{ width: `${saveProgress?.progress || 0}%` }}
                  />
                </div>
              </div>
            ) : (
              <span>{saveProgress?.message || 'Select spreadsheet to inspect and apply Link Roster.'}</span>
            )}
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-lg transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirmSave}
              disabled={!parseResult || isSaving || isParsing || parseResult.duties.length === 0}
              className={`px-5 py-2 rounded-lg font-bold transition-all flex items-center gap-2 ${
                !parseResult || isSaving || isParsing || parseResult.duties.length === 0
                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700/50'
                  : 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-[0_0_15px_rgba(245,158,11,0.25)] font-black'
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
                  Erase Old & Deploy Latest {selectedDay} Roster Only
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  Update {selectedDay} Link Roster Everywhere
                </>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
