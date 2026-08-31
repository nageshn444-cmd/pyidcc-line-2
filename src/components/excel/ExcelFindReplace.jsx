import React, { useState } from 'react';
import { Search, Replace, X, ChevronDown, ChevronUp } from 'lucide-react';

export default function ExcelFindReplace({
  isOpen,
  onClose,
  onFindNext,
  onFindPrev,
  onReplace,
  onReplaceAll,
  matchCount = 0,
  currentMatchIndex = 0
}) {
  const [findText, setFindText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [matchCase, setMatchCase] = useState(false);
  const [scope, setScope] = useState('SHEET'); // 'SHEET' or 'WORKBOOK'

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs select-none">
      <div className="bg-slate-900 border border-slate-750 rounded-2xl w-full max-w-md shadow-2xl p-5 text-slate-100 text-xs">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
          <div className="flex items-center gap-2">
            <Search className="w-4 h-4 text-blue-400" />
            <h3 className="font-bold text-sm text-white">Find &amp; Replace</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Inputs */}
        <div className="space-y-3">
          <div>
            <label className="block text-slate-400 mb-1 font-semibold">Find what:</label>
            <div className="relative">
              <input
                type="text"
                autoFocus
                value={findText}
                onChange={(e) => setFindText(e.target.value)}
                placeholder="Search value or formula text..."
                className="w-full bg-slate-950 border border-slate-750 rounded-xl px-3 py-2 text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              {matchCount > 0 && (
                <span className="absolute right-3 top-2 text-[10px] text-blue-400 font-mono">
                  {currentMatchIndex + 1} of {matchCount}
                </span>
              )}
            </div>
          </div>

          <div>
            <label className="block text-slate-400 mb-1 font-semibold">Replace with:</label>
            <input
              type="text"
              value={replaceText}
              onChange={(e) => setReplaceText(e.target.value)}
              placeholder="Replacement text..."
              className="w-full bg-slate-950 border border-slate-750 rounded-xl px-3 py-2 text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Options */}
          <div className="flex items-center justify-between pt-1 text-[11px] text-slate-400">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={matchCase}
                onChange={(e) => setMatchCase(e.target.checked)}
                className="rounded bg-slate-950 border-slate-700 text-blue-500 focus:ring-0"
              />
              <span>Match case</span>
            </label>

            <div className="flex items-center gap-1">
              <span>Within:</span>
              <select
                value={scope}
                onChange={(e) => setScope(e.target.value)}
                className="bg-slate-950 border border-slate-750 rounded px-2 py-0.5 text-white"
              >
                <option value="SHEET">Current Sheet</option>
                <option value="WORKBOOK">Entire Workbook</option>
              </select>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center justify-end gap-2 pt-4 mt-4 border-t border-slate-800">
          <button
            onClick={() => onFindPrev(findText, { matchCase, scope })}
            disabled={!findText}
            className="flex items-center gap-1 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 rounded-xl text-white font-medium transition"
          >
            <ChevronUp className="w-3.5 h-3.5" /> Prev
          </button>
          <button
            onClick={() => onFindNext(findText, { matchCase, scope })}
            disabled={!findText}
            className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-30 rounded-xl text-white font-bold transition shadow-sm"
          >
            <ChevronDown className="w-3.5 h-3.5" /> Find Next
          </button>
          <button
            onClick={() => onReplace(findText, replaceText, { matchCase, scope })}
            disabled={!findText}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 rounded-xl text-amber-300 font-medium transition"
          >
            Replace
          </button>
          <button
            onClick={() => onReplaceAll(findText, replaceText, { matchCase, scope })}
            disabled={!findText}
            className="px-3 py-1.5 bg-amber-600/30 hover:bg-amber-600/50 border border-amber-500/40 disabled:opacity-30 rounded-xl text-amber-200 font-bold transition"
          >
            Replace All
          </button>
        </div>
      </div>
    </div>
  );
}
