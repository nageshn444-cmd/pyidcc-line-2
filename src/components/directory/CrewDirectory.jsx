import React, { useState, useMemo } from 'react';
import { BMRCL_CREW_REGISTRY } from '../../data/bmrclCrewRegistry';
import { Search, Phone, Mail, Users } from 'lucide-react';

export default function CrewDirectory() {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredCrew = useMemo(() => {
    return BMRCL_CREW_REGISTRY.filter(member => 
      member.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      member.id.toString().includes(searchTerm) ||
      member.designation.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [searchTerm]);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden font-mono text-xs shadow-2xl">
      <div className="p-4 bg-slate-950 border-b border-slate-800 flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="flex items-center gap-2 text-emerald-400 font-bold tracking-widest uppercase">
          <Users size={16} /> BMRCL OFFICIAL CREW REGISTRY
        </div>
      </div>
      <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
        <table className="w-full text-left border-collapse">
          <thead className="bg-slate-900 sticky top-0 z-10 text-slate-400 uppercase">
            <tr>
              <th className="p-3 border-b border-slate-800">ID</th>
              <th className="p-3 border-b border-slate-800">Name</th>
              <th className="p-3 border-b border-slate-800">Designation</th>
              <th className="p-3 border-b border-slate-800">Contact</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800 text-slate-300">
            {filteredCrew.map((member) => (
              <tr key={member.id} className="hover:bg-slate-800/40 transition-colors">
                <td className="p-3 font-bold text-cyan-400">{member.id}</td>
                <td className="p-3 font-medium text-slate-100">{member.name}</td>
                <td className="p-3 text-slate-400">{member.designation}</td>
                <td className="p-3 font-semibold text-amber-400">{member.contact}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
