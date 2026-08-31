import React from 'react';
import { Check, X } from 'lucide-react';

export default function ExcelFormulaBar({
  selectedCellKey = 'A1',
  formulaValue = '',
  onChange,
  onCommit,
  onCancel,
  isEditing = false
}) {
  return (
    <div className="flex items-center gap-1.5 bg-slate-900 border-b border-slate-800 px-3 py-1.5 text-xs font-mono select-none">
      {/* Name Box (Current Active Cell Coordinates) */}
      <div className="min-w-[64px] px-2 py-1 bg-slate-950 border border-slate-750 rounded text-center font-bold text-slate-200 shadow-inner">
        {selectedCellKey}
      </div>

      {/* Formula Commit / Cancel Buttons */}
      <div className="flex items-center gap-0.5 text-slate-400">
        <button
          onClick={onCancel}
          disabled={!isEditing}
          title="Cancel (Esc)"
          className="p-1 rounded hover:bg-slate-800 hover:text-rose-400 disabled:opacity-30 disabled:hover:bg-transparent transition"
        >
          <X className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={onCommit}
          disabled={!isEditing}
          title="Enter formula (Enter)"
          className="p-1 rounded hover:bg-slate-800 hover:text-emerald-400 disabled:opacity-30 disabled:hover:bg-transparent transition"
        >
          <Check className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Function fx Icon */}
      <span className="font-serif italic font-bold text-slate-400 px-1 select-none">
        fx
      </span>

      {/* Formula Input Bar */}
      <input
        type="text"
        value={formulaValue}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            onCommit();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            onCancel();
          }
        }}
        placeholder="Enter value or formula starting with = (e.g. =SUM(A1:A10), =IF(B2>50, 'PASS', 'FAIL'))"
        className="flex-1 bg-slate-950 border border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded px-2.5 py-1 text-slate-100 placeholder:text-slate-600 focus:outline-none transition"
      />
    </div>
  );
}
