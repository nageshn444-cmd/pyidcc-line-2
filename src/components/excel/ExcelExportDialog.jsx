import React, { useState } from 'react';
import { Download, FileSpreadsheet, FileText, Printer, X } from 'lucide-react';

export default function ExcelExportDialog({
  isOpen,
  onClose,
  activeSheetName = 'Sheet1',
  workbookName = 'PYIDCC_Spreadsheet',
  onExportExcel,
  onExportCsv,
  onPrint
}) {
  const [fileName, setFileName] = useState(workbookName);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs select-none">
      <div className="bg-slate-900 border border-slate-750 rounded-3xl w-full max-w-md shadow-2xl p-6 text-slate-100 text-xs">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-xl">
              <Download className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-black text-sm text-white">Export Spreadsheet</h3>
              <p className="text-[11px] text-slate-400">Download Excel files or generate printable sheets</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Filename Input */}
        <div className="mb-4">
          <label className="block text-slate-400 mb-1 font-semibold">File Name:</label>
          <input
            type="text"
            value={fileName}
            onChange={(e) => setFileName(e.target.value)}
            placeholder="Workbook name..."
            className="w-full bg-slate-950 border border-slate-750 rounded-xl px-3 py-2 text-white focus:outline-none focus:ring-1 focus:ring-emerald-500 font-medium"
          />
        </div>

        {/* Export Options */}
        <div className="space-y-2.5">
          {/* Excel XLSX */}
          <div
            onClick={() => {
              onExportExcel(fileName);
              onClose();
            }}
            className="p-3 bg-slate-950 hover:bg-slate-850 border border-slate-800 hover:border-emerald-500/50 rounded-2xl cursor-pointer transition flex items-center justify-between group"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-xl group-hover:scale-105 transition">
                <FileSpreadsheet className="w-5 h-5" />
              </div>
              <div>
                <div className="font-bold text-white text-xs">Microsoft Excel (.xlsx)</div>
                <div className="text-[10px] text-slate-400">Exports all worksheets, formulas, merges, and styles</div>
              </div>
            </div>
            <span className="px-2.5 py-1 bg-emerald-600/20 text-emerald-300 font-bold rounded-lg text-[10px]">
              Download
            </span>
          </div>

          {/* CSV */}
          <div
            onClick={() => {
              onExportCsv(fileName);
              onClose();
            }}
            className="p-3 bg-slate-950 hover:bg-slate-850 border border-slate-800 hover:border-blue-500/50 rounded-2xl cursor-pointer transition flex items-center justify-between group"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500/10 text-blue-400 rounded-xl group-hover:scale-105 transition">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <div className="font-bold text-white text-xs">Comma-Separated Values (.csv)</div>
                <div className="text-[10px] text-slate-400">Exports active sheet: <strong>{activeSheetName}</strong></div>
              </div>
            </div>
            <span className="px-2.5 py-1 bg-blue-600/20 text-blue-300 font-bold rounded-lg text-[10px]">
              Download
            </span>
          </div>

          {/* Print */}
          <div
            onClick={() => {
              onPrint();
              onClose();
            }}
            className="p-3 bg-slate-950 hover:bg-slate-850 border border-slate-800 hover:border-indigo-500/50 rounded-2xl cursor-pointer transition flex items-center justify-between group"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-500/10 text-indigo-400 rounded-xl group-hover:scale-105 transition">
                <Printer className="w-5 h-5" />
              </div>
              <div>
                <div className="font-bold text-white text-xs">Print Sheet</div>
                <div className="text-[10px] text-slate-400">Sends active sheet to printer or saves as PDF</div>
              </div>
            </div>
            <span className="px-2.5 py-1 bg-indigo-600/20 text-indigo-300 font-bold rounded-lg text-[10px]">
              Print
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
