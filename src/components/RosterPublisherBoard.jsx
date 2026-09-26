import React, { Suspense, lazy, useState } from "react";
import { FileSpreadsheet, Maximize2, Table, LayoutList, Globe } from "lucide-react";
import OfficialGccRosterSheetView from "./common/OfficialGccRosterSheetView";

const GoogleSheetsWorkspace = lazy(() => import("./googleSheets/GoogleSheetsWorkspace"));

export default function RosterPublisherBoard({ userRole = "CONTROLLER", currentOperatorId = null }) {
  // Default to Official Sheet or Google Sheets Workspace
  const [boardMode, setBoardMode] = useState("OFFICIAL_SHEET");

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
                {boardMode === "OFFICIAL_SHEET" ? "Official GCC Daily Roster Sheet" : "Google Sheets Enterprise Workspace"}
              </h2>
              <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono font-bold">
                {boardMode === "OFFICIAL_SHEET" ? "1:1 BMRCL FORMAT • LIVE SYNC" : "REAL GOOGLE SHEETS SUITE • ADVANCED TOOLS"}
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              {boardMode === "OFFICIAL_SHEET" 
                ? "Exact published GCC roster sheet with Duties 1–85, CC Desk, 1Stbk, OR, Weekly Offs, Leaves & CRRC Training."
                : "Full Google Sheets editor with live formula calculations (=SUM, =AVERAGE, =COUNT), live Google Sheets URL embed, XLSX/CSV export, and multi-sheet tabs."
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
              onClick={() => setBoardMode("GOOGLE_SHEETS")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded font-bold transition ${
                boardMode === "GOOGLE_SHEETS" 
                  ? "bg-[#0F9D58] text-white shadow" 
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <Table className="w-3.5 h-3.5 text-emerald-400" />
              <span>Google Sheets Workspace</span>
            </button>
          </div>
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
        <div className="rounded-xl border border-slate-800 overflow-hidden shadow-2xl bg-slate-950 min-h-[860px]">
          <Suspense fallback={
            <div className="flex items-center justify-center min-h-[400px] text-slate-400 font-mono text-xs gap-2">
              <FileSpreadsheet className="w-5 h-5 text-emerald-400 animate-pulse" />
              <span>Loading Google Sheets Workspace with all functions & tools...</span>
            </div>
          }>
            <GoogleSheetsWorkspace userRole={userRole} />
          </Suspense>
        </div>
      )}
    </div>
  );
}
