import React, { Suspense, lazy } from "react";
import { FileSpreadsheet, Maximize2 } from "lucide-react";

const ExcelWorkspace = lazy(() => import("../pages/ExcelWorkspace"));

export default function RosterPublisherBoard({ userRole = "CONTROLLER", currentOperatorId = null }) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-2 sm:p-4 space-y-3 font-sans select-none">
      {/* Real Excel Mode Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 shadow-xl flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-emerald-500/20 border border-emerald-500/40 rounded-lg text-emerald-400 shadow-inner">
            <FileSpreadsheet className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-black text-white uppercase tracking-wider">Enterprise Excel Workspace</h2>
              <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono font-bold">
                REAL EXCEL ENGINE ACTIVE
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Formula calculations (=SUM, =AVERAGE, =IF), multi-sheet tabs, XLSX/CSV import/export, and IndexedDB auto-save.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <a
            href="/excel-workspace"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs uppercase transition shadow"
            title="Open Excel Workspace in Fullscreen Window"
          >
            <Maximize2 className="w-3.5 h-3.5" /> Fullscreen Tab
          </a>
        </div>
      </div>

      <div className="rounded-xl border border-slate-800 overflow-hidden shadow-2xl bg-slate-950 h-[820px]">
        <Suspense fallback={
          <div className="flex items-center justify-center min-h-[400px] text-slate-400 font-mono text-xs">
            Loading Real Excel Sheet Workspace...
          </div>
        }>
          <ExcelWorkspace />
        </Suspense>
      </div>
    </div>
  );
}
