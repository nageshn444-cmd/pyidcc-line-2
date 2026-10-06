import React, { useState, useRef } from 'react';
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
  Compass,
  ArrowRight,
  Trash2
} from 'lucide-react';
import { 
  parseLinkRosterExcel, 
  saveLinkRosterToFirestore, 
  clearLinkRosterForDay,
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

    setIsSaving(true);
    setSaveError('');
    setSaveProgress({ stage: 'SAVING', message: eraseOldData ? `Purging old ${selectedDay} roster & committing ${parseResult.duties.length} duties...` : `Committing ${parseResult.duties.length} duties...`, progress: 20 });
    try {
      if (eraseOldData) {
        // Explicitly clear old Firestore duties for this schedule day first
        await clearLinkRosterForDay(selectedDay, (p) => setSaveProgress(p));
      }

      await saveLinkRosterToFirestore(parseResult.duties, selectedDay, (progress) => {
        setSaveProgress(progress);
      }, { eraseOld: eraseOldData });

      setSaveSuccess(true);
      if (typeof onLinkRosterImported === 'function') {
        onLinkRosterImported({
          scheduleType: selectedDay,
          duties: parseResult.duties,
          eraseOld: eraseOldData
        });
      }
      setTimeout(() => {
        onClose();
      }, 1000);
    } catch (err) {
      console.error('Firestore Link Roster Save error:', err);
      setSaveError(err.message || 'Failed to commit Link Roster to database.');
    } finally {
      setIsSaving(false);
    }
  };

  const filteredPreviewDuties = (parseResult?.duties || []).filter(d => {
    if (!previewFilter) return true;
    const q = previewFilter.toLowerCase();
    return String(d.dutyId || '').toLowerCase().includes(q) ||
      String(d.dutyNo || '').toLowerCase().includes(q) ||
      String(d.trainId || '').toLowerCase().includes(q) ||
      String(d.signOnLocation || '').toLowerCase().includes(q) ||
      String(d.remarks || '').toLowerCase().includes(q);
  });

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-5xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden font-mono text-xs">
        
        {/* Header */}
        <div className="px-6 py-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-100 uppercase tracking-wide flex items-center gap-2">
                Upload New Link Roster
                <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 font-bold border border-amber-500/30">
                  EXCEL / CSV
                </span>
              </h2>
              <p className="text-[11px] text-slate-400 font-sans mt-0.5">
                Extracts shift duties, leg breakdowns, sign on/off times, and synchronizes to Line 2 crew controls.
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
            <Calendar className="h-4 w-4 text-amber-400" />
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
            <div className="text-[10px] text-amber-400 font-semibold bg-amber-950/40 px-2.5 py-1 rounded border border-amber-800/50">
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
            <div className="p-3 bg-amber-500/10 rounded-full text-amber-400 mb-1 border border-amber-500/20">
              <UploadCloud className="h-6 w-6" />
            </div>
            {file ? (
              <div className="flex items-center gap-2 text-slate-200">
                <FileSpreadsheet className="h-4 w-4 text-amber-400" />
                <span className="font-bold">{file.name}</span>
                <span className="text-slate-500 text-[10px]">
                  ({(file.size / 1024).toFixed(1)} KB)
                </span>
                <span className="text-[10px] text-amber-400 underline ml-2">Click to replace</span>
              </div>
            ) : (
              <>
                <p className="text-slate-200 font-semibold text-xs">
                  Drag & Drop Link Roster Excel here, or <span className="text-amber-400 underline">browse</span>
                </p>
                <p className="text-slate-500 text-[10px]">
                  Supports .xlsx, .xls, or .csv files with Duty No, Sign On/Off, and Legs
                </p>
              </>
            )}
          </div>

          {/* Parsing State */}
          {isParsing && (
            <div className="flex items-center justify-center gap-3 p-4 bg-slate-950 rounded-xl border border-slate-800 text-amber-400">
              <RefreshCw className="h-4 w-4 animate-spin" />
              <span>Analyzing duty structure and extracting link legs...</span>
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
                Completely wipes prior duty records for {selectedDay} in crew_final_links. The roster desk will hold strictly the latest uploaded duties.
              </div>
            </div>
          </label>

          {/* Parse Result Summary Banner */}
          {parseResult && !isParsing && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-slate-950 border border-slate-800 p-3 rounded-xl">
                  <span className="text-[10px] text-slate-500 font-bold uppercase block">Total Duties Extracted</span>
                  <span className="text-lg font-bold text-amber-400">{parseResult.stats.totalDuties} Duties</span>
                </div>
                <div className="bg-slate-950 border border-slate-800 p-3 rounded-xl">
                  <span className="text-[10px] text-slate-500 font-bold uppercase block">Total Driving KMs</span>
                  <span className="text-lg font-bold text-emerald-400">{parseResult.stats.totalKms.toLocaleString()} km</span>
                </div>
                <div className="bg-slate-950 border border-slate-800 p-3 rounded-xl">
                  <span className="text-[10px] text-slate-500 font-bold uppercase block">Driving Duties Count</span>
                  <span className="text-lg font-bold text-cyan-400">{parseResult.stats.withDrivingHours} Duties</span>
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
                    <Users className="h-3.5 w-3.5 text-amber-400" />
                    Previewing Duties ({filteredPreviewDuties.length} of {parseResult.duties.length})
                  </span>
                  <div className="relative w-48">
                    <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-500" />
                    <input
                      type="text"
                      placeholder="Filter Duty ID..."
                      value={previewFilter}
                      onChange={e => setPreviewFilter(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-2.5 py-1 text-[11px] text-slate-200 focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>

                <div className="overflow-x-auto max-h-[36vh]">
                  <table className="w-full text-center border-collapse text-[10px]">
                    <thead className="bg-slate-900/90 sticky top-0 z-10 text-slate-400 uppercase font-bold border-b border-slate-800">
                      <tr>
                        <th className="py-2 px-2 border-r border-slate-800 text-amber-400 w-16">Duty ID</th>
                        <th className="py-2 px-2 border-r border-slate-800 text-slate-300">Sign On</th>
                        <th className="py-2 px-2 border-r border-slate-800 text-slate-300">Sign On Loc</th>
                        <th className="py-2 px-2 border-r border-slate-800 text-blue-400">Leg 1 Train</th>
                        <th className="py-2 px-2 border-r border-slate-800 text-blue-400">Leg 1 Times</th>
                        <th className="py-2 px-2 border-r border-slate-800 text-amber-400">Leg 2 Train</th>
                        <th className="py-2 px-2 border-r border-slate-800 text-amber-400">Leg 2 Times</th>
                        <th className="py-2 px-2 border-r border-slate-800 text-cyan-400">Leg 3 Train</th>
                        <th className="py-2 px-2 border-r border-slate-800 text-slate-300">Sign Off</th>
                        <th className="py-2 px-2 border-r border-slate-800 text-emerald-400">Total KM</th>
                        <th className="py-2 px-2 border-r border-slate-800 text-slate-300">Total Hrs</th>
                        <th className="py-2 px-2 text-slate-400">Type / Remarks</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-mono text-slate-300">
                      {filteredPreviewDuties.map((d) => (
                        <tr key={d.id} className="hover:bg-slate-900/60 transition-colors">
                          <td className="py-1.5 px-2 border-r border-slate-800 font-bold text-amber-400">{d.dutyId}</td>
                          <td className="py-1.5 px-2 border-r border-slate-800">{d.signOnTime}</td>
                          <td className="py-1.5 px-2 border-r border-slate-800 text-slate-400">{d.signOnLocation}</td>
                          <td className="py-1.5 px-2 border-r border-slate-800 text-blue-300">{d.trainId}</td>
                          <td className="py-1.5 px-2 border-r border-slate-800 text-[9px] text-slate-400">
                            {d.leg1TimeFrom !== '--' ? `${d.leg1TimeFrom} - ${d.leg1TimeTo}` : '--'}
                          </td>
                          <td className="py-1.5 px-2 border-r border-slate-800 text-amber-300">{d.leg2TrainNo}</td>
                          <td className="py-1.5 px-2 border-r border-slate-800 text-[9px] text-slate-400">
                            {d.leg2DepTime !== '--' ? `${d.leg2DepTime} - ${d.leg2ArrTime}` : '--'}
                          </td>
                          <td className="py-1.5 px-2 border-r border-slate-800 text-cyan-300">{d.leg3TrainNo}</td>
                          <td className="py-1.5 px-2 border-r border-slate-800">{d.signOffTime}</td>
                          <td className="py-1.5 px-2 border-r border-slate-800 font-bold text-emerald-400">{d.totalKm || d.kms || '--'}</td>
                          <td className="py-1.5 px-2 border-r border-slate-800">{d.totalHours}</td>
                          <td className="py-1.5 px-2 text-slate-400 text-left truncate max-w-[140px]" title={d.pilotMovement && d.pilotMovement !== '--' ? `${d.remarks} | ${d.pilotMovement}` : d.remarks}>
                            <span>{d.remarks}</span>
                            {d.pilotMovement && d.pilotMovement !== '--' && (
                              <span className="ml-1.5 inline-block text-[8px] text-amber-300 font-bold bg-amber-500/20 px-1 py-0.2 rounded border border-amber-500/30">
                                {d.pilotMovement}
                              </span>
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

          {/* Success Banner */}
          {saveSuccess && (
            <div className="flex items-center gap-3 p-4 bg-emerald-950/60 border border-emerald-500/50 rounded-xl text-emerald-300 shadow-[0_0_20px_rgba(16,185,129,0.2)]">
              <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
              <div>
                <p className="font-bold text-sm">Link Roster Successfully Updated!</p>
                <p className="text-[11px] text-emerald-400/80">
                  Synchronized {parseResult?.duties?.length} duties to {selectedDay} database (crew_final_links). Refreshing operational systems...
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between">
          <div className="text-[11px] text-slate-500">
            {saveProgress?.message || 'Select spreadsheet to inspect and apply Link Roster.'}
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
