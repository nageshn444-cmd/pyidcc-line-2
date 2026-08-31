import React from 'react';
import { CheckCircle2, Clock, ZoomIn, ZoomOut } from 'lucide-react';

export default function ExcelStatusBar({
  selectionStats = { count: 0, sum: 0, avg: 0, min: 0, max: 0, hasNumbers: false },
  isEditing = false,
  saveStatus = 'Saved',
  lastSavedTime = '',
  zoom = 100,
  onZoomChange
}) {
  return (
    <div className="flex items-center justify-between bg-slate-950 border-t border-slate-800 px-3 py-1 text-[11px] text-slate-400 font-mono select-none">
      {/* Left: Mode & Save Status */}
      <div className="flex items-center gap-3">
        <span className={`px-2 py-0.5 rounded font-bold uppercase text-[10px] ${
          isEditing ? 'bg-amber-500/20 text-amber-300' : 'bg-emerald-500/20 text-emerald-300'
        }`}>
          {isEditing ? 'EDIT' : 'READY'}
        </span>

        <span className="flex items-center gap-1 text-slate-400">
          <CheckCircle2 className={`w-3.5 h-3.5 ${saveStatus === 'Saved' ? 'text-emerald-400' : 'text-amber-400 animate-pulse'}`} />
          <span>{saveStatus}</span>
          {lastSavedTime && <span className="text-slate-600 text-[10px]">({lastSavedTime})</span>}
        </span>
      </div>

      {/* Middle: Selection Stats (Excel Quick Aggregate) */}
      <div className="flex items-center gap-4">
        {selectionStats.count > 1 && (
          <>
            <span>Count: <strong className="text-slate-200">{selectionStats.count}</strong></span>
            {selectionStats.hasNumbers && (
              <>
                <span>Sum: <strong className="text-slate-200">{selectionStats.sum.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</strong></span>
                <span>Average: <strong className="text-slate-200">{selectionStats.avg.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</strong></span>
                <span>Min: <strong className="text-slate-200">{selectionStats.min.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</strong></span>
                <span>Max: <strong className="text-slate-200">{selectionStats.max.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</strong></span>
              </>
            )}
          </>
        )}
      </div>

      {/* Right: Zoom Controls */}
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => onZoomChange && onZoomChange(Math.max(60, zoom - 10))}
          className="p-0.5 hover:text-white rounded transition"
          title="Zoom Out"
        >
          <ZoomOut className="w-3.5 h-3.5" />
        </button>
        <span className="text-slate-300 w-9 text-center">{zoom}%</span>
        <button
          onClick={() => onZoomChange && onZoomChange(Math.min(160, zoom + 10))}
          className="p-0.5 hover:text-white rounded transition"
          title="Zoom In"
        >
          <ZoomIn className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
