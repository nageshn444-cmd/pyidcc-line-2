import React, { useState } from 'react';
import { Phone, Mail, UserPlus, Trash2, AlertCircle, Search, Users } from 'lucide-react';

export default function CrewDirectory({ crewData = [], isAdmin = false, onDelete, onAdd }) {
  const [searchTerm, setSearchTerm] = useState('');

  // Robust filtering: Search by Name OR Employee ID
  const filteredCrew = crewData.filter(staff => 
    staff["TO NAME"]?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    staff["Employ id"]?.includes(searchTerm)
  );

  const handleDelete = (staffId) => {
    if (window.confirm('CRITICAL: Are you sure you want to delete this staff member? This action is permanent.')) {
      onDelete?.(staffId);
    }
  };

  return (
    <div className="bg-slate-900 rounded-xl border border-slate-800 shadow-2xl overflow-hidden font-mono">
      {/* Header Area */}
      <div className="p-4 bg-slate-950 border-b border-slate-800 flex flex-col md:flex-row justify-between items-center gap-4">
        <h2 className="text-emerald-400 font-black text-sm uppercase tracking-wider flex items-center gap-2">
          <Users size={16} /> CREW DIRECTORY ({filteredCrew.length} Records)
        </h2>
        
        <div className="flex gap-3 w-full md:w-auto">
          <div className="relative w-full md:w-64">
            <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-500" />
            <input 
              type="text" 
              placeholder="Filter by Name or ID..." 
              className="w-full bg-slate-900 border border-slate-800 rounded pl-8 pr-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          {isAdmin && (
            <button onClick={onAdd} className="flex items-center gap-2 bg-blue-600/20 border border-blue-500/30 text-blue-400 px-3 py-1.5 rounded text-xs hover:bg-blue-600/30 transition">
              <UserPlus size={14} /> ADD
            </button>
          )}
        </div>
      </div>

      {/* Directory Table */}
      <div className="max-h-[600px] overflow-y-auto">
        <table className="w-full text-left border-collapse text-[11px] text-slate-300">
          <thead className="bg-slate-900/50 sticky top-0 z-10 border-b border-slate-800">
            <tr>
              <th className="p-3 text-slate-400">EMP ID</th>
              <th className="p-3 text-slate-400">NAME</th>
              <th className="p-3 text-slate-400">DESIGNATION</th>
              <th className="p-3 text-slate-400 text-center">COMMUNICATION</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {filteredCrew.length > 0 ? filteredCrew.map((staff) => (
              <tr key={staff["Employ id"]} className="hover:bg-slate-800/40 transition-colors">
                <td className="p-3 font-bold text-cyan-400">{staff["Employ id"]}</td>
                <td className="p-3 font-bold text-slate-100">{staff["TO NAME"]}</td>
                <td className="p-3 text-slate-400">{staff.Designation}</td>
                <td className="p-3 flex justify-center gap-4">
                  {staff.Mobile && (
                    <a href={`tel:${String(staff.Mobile).replace('.0','')}`} className="text-emerald-400 hover:text-emerald-300 transition" title={`Call: ${staff.Mobile}`}>
                      <Phone size={16} />
                    </a>
                  )}
                  {staff.Email && (
                    <a href={`mailto:${staff.Email}`} className="text-blue-400 hover:text-blue-300 transition" title={`Email: ${staff.Email}`}>
                      <Mail size={16} />
                    </a>
                  )}
                  {isAdmin && (
                    <button onClick={() => handleDelete(staff["Employ id"])} className="text-rose-500 hover:text-rose-400 transition" title="Delete staff">
                      <Trash2 size={16} />
                    </button>
                  )}
                </td>
              </tr>
            )) : (
              <tr>
                <td colSpan="4" className="py-12 text-center text-slate-600 italic">
                  <AlertCircle size={20} className="mx-auto mb-2" />
                  No crew members found matching filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}