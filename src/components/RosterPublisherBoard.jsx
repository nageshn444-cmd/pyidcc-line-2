import React, { Suspense, lazy, useState } from "react";
import { FileSpreadsheet, Maximize2, Table, LayoutList } from "lucide-react";
import OfficialGccRosterSheetView from "./common/OfficialGccRosterSheetView";

const ExcelWorkspace = lazy(() => import("../pages/ExcelWorkspace"));

export default function RosterPublisherBoard({ userRole = "CONTROLLER", currentOperatorId = null }) {
  // Train operators default to the official GCC 1:1 view
  const [boardMode, setBoardMode] = useState(userRole === "TRAIN_OPERATOR" ? "OFFICIAL_SHEET" : "OFFICIAL_SHEET");

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-2 sm:p-4 space-y-3 font-sans select-none">
      {/* View Switcher Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 shadow-xl flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-emerald-500/20 border border-emerald-500/40 rounded-lg text-emerald-400 shadow-inner">
            <FileSpreadsheet className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-black text-white uppercase tracking-wider">
                {boardMode === "OFFICIAL_SHEET" ? "Official GCC Daily Roster Sheet" : "Enterprise Excel Workspace"}
              </h2>
              <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono font-bold">
                {boardMode === "OFFICIAL_SHEET" ? "1:1 BMRCL FORMAT • LIVE SYNC" : "REAL EXCEL ENGINE"}
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              {boardMode === "OFFICIAL_SHEET" 
                ? "Exact published GCC roster sheet with Duties 1–85, CC Desk, 1Stbk, OR, Weekly Offs, Leaves & CRRC Training."
                : "Full spreadsheet editor with formula calculations (=SUM, =AVERAGE), XLSX import/export, and grid manipulation."
              }
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Mode Switcher Buttons */}
          <div className="flex items-center bg-slate-950 p-1 rounded-lg border border-slate-800 font-mono text-xs">
            <button
              onClick={() => setBoardMode("OFFICIAL_SHEET")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded font-bold transition ${
                boardMode === "OFFICIAL_SHEET" 
                  ? "bg-emerald-600 text-white shadow" 
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <LayoutList className="w-3.5 h-3.5" />
              <span>Official GCC Sheet</span>
            </button>
            <button
              onClick={() => setBoardMode("EXCEL_GRID")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded font-bold transition ${
                boardMode === "EXCEL_GRID" 
                  ? "bg-emerald-600 text-white shadow" 
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <Table className="w-3.5 h-3.5" />
              <span>Raw Excel Engine</span>
            </button>
          </div>

          {boardMode === "EXCEL_GRID" && (
            <a
              href="/excel-workspace"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs uppercase transition shadow"
              title="Open Excel Workspace in Fullscreen Window"
            >
              <Maximize2 className="w-3.5 h-3.5" /> Fullscreen
            </a>
          )}
        </div>
      </div>

      {/* Board Content Area */}
      {boardMode === "OFFICIAL_SHEET" ? (
        <div className="rounded-xl border border-slate-800 overflow-hidden shadow-2xl bg-slate-950">
          <OfficialGccRosterSheetView 
            userRole={userRole} 
            currentOperatorId={currentOperatorId} 
          />
        </div>
      ) : (
        <div className="rounded-xl border border-slate-800 overflow-hidden shadow-2xl bg-slate-950 h-[820px]">
          <Suspense fallback={
            <div className="flex items-center justify-center min-h-[400px] text-slate-400 font-mono text-xs">
              Loading Real Excel Sheet Workspace...
            </div>
          }>
            <ExcelWorkspace />
          </Suspense>
        </div>
      )}
    </div>
  );
}
