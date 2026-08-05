import React, { useState, useEffect } from "react";
import { shiftReportService } from "../services/ShiftReportService";
import { FileText, Download, RefreshCcw } from "lucide-react";
import * as XLSX from "xlsx";

export default function ShiftHandoverReportView() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchEvents = async () => {
    setLoading(true);
    const data = await shiftReportService.getTodayReportEvents();
    setEvents(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchEvents();
  }, []);

  const exportReportToExcel = () => {
    const exportRows = events.map((e, idx) => ({
      "Sl No": idx + 1,
      "Action Type": e.actionType,
      "Duty ID": e.dutyId,
      "Operator Name": e.operatorName,
      "Emp ID": e.empId,
      "Details": e.details || "--",
      "Timestamp": e.timestamp?.toDate ? e.timestamp.toDate().toLocaleString() : "--"
    }));

    const ws = XLSX.utils.json_to_sheet(exportRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Shift_Handover_Report");
    XLSX.writeFile(wb, `BMRCL_Shift_Handover_Report_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-2xl font-mono space-y-4">
      <div className="flex justify-between items-center border-b border-slate-800 pb-3">
        <h3 className="text-sm font-black text-emerald-400 uppercase tracking-wider flex items-center gap-2">
          <FileText className="h-4 w-4" /> Shift Handover & Event Audit Report
        </h3>
        <div className="flex gap-2">
          <button
            onClick={fetchEvents}
            className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded text-xs flex items-center gap-1 transition-colors"
          >
            <RefreshCcw className="h-3.5 w-3.5" /> Refresh
          </button>
          <button
            onClick={exportReportToExcel}
            className="bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-black px-3 py-1.5 rounded text-xs flex items-center gap-1 transition-colors shadow-md"
          >
            <Download className="h-3.5 w-3.5" /> Export Report Excel
          </button>
        </div>
      </div>

      <div className="bg-slate-950 border border-slate-800 rounded-lg overflow-hidden max-h-96 overflow-y-auto">
        <table className="w-full text-left text-xs whitespace-nowrap">
          <thead className="bg-slate-900 text-slate-400 uppercase text-[10px] sticky top-0 border-b border-slate-800">
            <tr>
              <th className="p-2.5">Action</th>
              <th className="p-2.5">Duty</th>
              <th className="p-2.5">Operator Name</th>
              <th className="p-2.5">Emp ID</th>
              <th className="p-2.5">Details</th>
              <th className="p-2.5">Timestamp</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-850">
            {loading ? (
              <tr>
                <td colSpan="6" className="p-6 text-center text-slate-500 animate-pulse">Loading audit events...</td>
              </tr>
            ) : events.length === 0 ? (
              <tr>
                <td colSpan="6" className="p-6 text-center text-slate-500">No shift events logged yet today.</td>
              </tr>
            ) : (
              events.map((e) => (
                <tr key={e.id} className="hover:bg-slate-900/40">
                  <td className="p-2.5 font-bold text-amber-400">{e.actionType}</td>
                  <td className="p-2.5 font-bold text-white">{e.dutyId}</td>
                  <td className="p-2.5 text-slate-200">{e.operatorName}</td>
                  <td className="p-2.5 text-cyan-400 font-mono">#{e.empId}</td>
                  <td className="p-2.5 text-slate-400">{e.details || "--"}</td>
                  <td className="p-2.5 text-slate-500 text-[11px]">
                    {e.timestamp?.toDate ? e.timestamp.toDate().toLocaleTimeString() : "--"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
