import React, { useRef, useState } from 'react';
import { Upload, FileSpreadsheet, Users, Train, X, AlertCircle } from 'lucide-react';

export default function ExcelImportDialog({
  isOpen,
  onClose,
  onImportFile,
  onImportCrewRegistry,
  onImportWttSchedule
}) {
  const fileInputRef = useRef(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileStats, setFileStats] = useState(null);
  const [wttDay, setWttDay] = useState('WEEKDAY');
  const [isProcessing, setIsProcessing] = useState(false);

  if (!isOpen) return null;

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setFileStats({
        name: file.name,
        sizeKb: Math.round(file.size / 1024),
        type: file.name.split('.').pop().toUpperCase()
      });
    }
  };

  const handleConfirmFileUpload = async () => {
    if (!selectedFile) return;
    setIsProcessing(true);
    try {
      await onImportFile(selectedFile);
      onClose();
    } catch (err) {
      alert(`Import failed: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs select-none">
      <div className="bg-slate-900 border border-slate-750 rounded-3xl w-full max-w-lg shadow-2xl p-6 text-slate-100 text-xs">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-5">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-blue-500/20 text-blue-400 rounded-xl">
              <Upload className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-black text-sm text-white">Import Spreadsheet Data</h3>
              <p className="text-[11px] text-slate-400">Load external Excel/CSV files or inject active PYIDCC operational tables</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Option 1: File Upload (.xlsx, .csv) */}
        <div className="mb-6 p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
          <span className="text-[10px] font-black uppercase tracking-wider text-blue-400 block">
            Option 1: Upload Excel or CSV File
          </span>

          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            accept=".xlsx, .xls, .csv"
            className="hidden"
          />

          {!selectedFile ? (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-750 hover:border-blue-500 rounded-xl p-6 text-center cursor-pointer hover:bg-slate-900/50 transition group"
            >
              <FileSpreadsheet className="w-8 h-8 mx-auto text-slate-500 group-hover:text-blue-400 mb-2 transition" />
              <p className="font-bold text-slate-200">Click to choose a file from your computer</p>
              <p className="text-[10px] text-slate-500 mt-1">Supports Microsoft Excel (.xlsx, .xls) and Comma-Separated Values (.csv)</p>
            </div>
          ) : (
            <div className="flex items-center justify-between p-3 bg-slate-900 border border-slate-750 rounded-xl">
              <div className="flex items-center gap-2.5">
                <FileSpreadsheet className="w-6 h-6 text-emerald-400" />
                <div>
                  <div className="font-bold text-white truncate max-w-[240px]">{fileStats?.name}</div>
                  <div className="text-[10px] text-slate-400 font-mono">
                    Format: {fileStats?.type} • Size: {fileStats?.sizeKb} KB
                  </div>
                </div>
              </div>
              <button
                onClick={() => {
                  setSelectedFile(null);
                  setFileStats(null);
                }}
                className="text-xs text-rose-400 hover:text-rose-300 font-bold px-2 py-1"
              >
                Change
              </button>
            </div>
          )}

          {selectedFile && (
            <div className="flex justify-end pt-1">
              <button
                onClick={handleConfirmFileUpload}
                disabled={isProcessing}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold rounded-xl shadow-lg shadow-blue-600/30 transition"
              >
                {isProcessing ? 'Processing...' : 'Load Workbook'}
              </button>
            </div>
          )}
        </div>

        {/* Option 2: 1-Click PYIDCC Operational Data Injection */}
        <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
          <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400 block">
            Option 2: Import PYIDCC Line 2 Datasets
          </span>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Crew Directory */}
            <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 text-cyan-400 font-bold mb-1">
                  <Users className="w-4 h-4" /> Crew Registry
                </div>
                <p className="text-[10px] text-slate-400 mb-3">
                  Import all 180 active Train Operators with ID, name, weekly off, and night quotas into a new sheet.
                </p>
              </div>
              <button
                onClick={() => {
                  onImportCrewRegistry();
                  onClose();
                }}
                className="w-full py-1.5 bg-cyan-600/20 hover:bg-cyan-600/30 border border-cyan-500/30 text-cyan-300 rounded-lg font-bold transition text-[11px]"
              >
                + Add Crew Sheet
              </button>
            </div>

            {/* WTT Master */}
            <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 text-indigo-400 font-bold mb-1">
                  <Train className="w-4 h-4" /> WTT Timetable
                </div>
                <div className="mb-2">
                  <select
                    value={wttDay}
                    onChange={(e) => setWttDay(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-750 rounded px-2 py-1 text-[11px] text-white"
                  >
                    <option value="WEEKDAY">Weekday (325 Trips)</option>
                    <option value="MONDAY">Monday (333 Trips)</option>
                    <option value="SATURDAY">Saturday &amp; GH (313 Trips)</option>
                    <option value="SUNDAY">Sunday (231 Trips)</option>
                  </select>
                </div>
              </div>
              <button
                onClick={() => {
                  onImportWttSchedule(wttDay);
                  onClose();
                }}
                className="w-full py-1.5 bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/30 text-indigo-300 rounded-lg font-bold transition text-[11px]"
              >
                + Add WTT Sheet
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
