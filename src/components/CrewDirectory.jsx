import React, { useState, useMemo } from 'react';
import { BMRCL_CREW_REGISTRY } from '../data/bmrclCrewRegistry';
import { Search, Phone, Mail, Users, Edit2, Trash2, Check, X, Plus, Download, Filter, AlertTriangle, ArrowUp, ArrowDown, ChevronsUpDown } from 'lucide-react';

export default function CrewDirectory() {
  const [searchTerm, setSearchTerm] = useState('');
  const [designationFilter, setDesignationFilter] = useState('ALL');
  const [competencyFilter, setCompetencyFilter] = useState('ALL');
  const [sortConfig, setSortConfig] = useState({ key: 'id', direction: 'asc' });
  
  const [crewData, setCrewData] = useState(BMRCL_CREW_REGISTRY);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [isAdding, setIsAdding] = useState(false);
  const [addForm, setAddForm] = useState({ id: '', name: '', designation: '', contact: '', email: '', competencyExpiry: '' });

  // Filter Logic
  const filteredCrew = useMemo(() => {
    let result = crewData;

    // Search filter
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      result = result.filter(member => 
        member.name.toLowerCase().includes(q) ||
        member.id.toString().includes(q) ||
        member.designation.toLowerCase().includes(q)
      );
    }

    // Designation filter
    if (designationFilter !== 'ALL') {
      result = result.filter(member => member.designation === designationFilter);
    }

    // Competency filter
    if (competencyFilter !== 'ALL') {
      const today = new Date();
      result = result.filter(member => {
        if (!member.competencyExpiry) return competencyFilter === 'NO_DATA';
        const isExpired = new Date(member.competencyExpiry) < today;
        if (competencyFilter === 'EXPIRED') return isExpired;
        if (competencyFilter === 'VALID') return !isExpired;
        return true;
      });
    }

    return result;
  }, [searchTerm, crewData, designationFilter, competencyFilter]);

  // Sorting Logic
  const sortedCrew = useMemo(() => {
    let sortableItems = [...filteredCrew];
    if (sortConfig !== null) {
      sortableItems.sort((a, b) => {
        let aValue = a[sortConfig.key];
        let bValue = b[sortConfig.key];
        
        if (sortConfig.key === 'competencyExpiry') {
          const timeA = aValue ? new Date(aValue).getTime() : 0;
          const timeB = bValue ? new Date(bValue).getTime() : 0;
          return sortConfig.direction === 'asc' ? timeA - timeB : timeB - timeA;
        } else {
          const strA = (aValue || '').toString();
          const strB = (bValue || '').toString();
          const result = strA.localeCompare(strB, undefined, { numeric: true });
          return sortConfig.direction === 'asc' ? result : -result;
        }
      });
    }
    return sortableItems;
  }, [filteredCrew, sortConfig]);

  const requestSort = (key) => {
    let direction = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  // Derived Stats
  const stats = useMemo(() => {
    const today = new Date();
    let valid = 0, expired = 0, noData = 0;
    crewData.forEach(m => {
      if (!m.competencyExpiry) noData++;
      else if (new Date(m.competencyExpiry) < today) expired++;
      else valid++;
    });
    return { total: crewData.length, valid, expired, noData };
  }, [crewData]);

  const uniqueDesignations = ['ALL', ...Array.from(new Set(crewData.map(m => m.designation).filter(Boolean)))];

  const handleEditClick = (member) => {
    setEditingId(member.id);
    setEditForm({ ...member });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditForm({});
  };

  const handleSaveEdit = () => {
    setCrewData(prev => prev.map(m => m.id === editingId ? editForm : m));
    setEditingId(null);
    setEditForm({});
  };

  const handleDelete = (id) => {
    if (window.confirm('Are you sure you want to delete this crew member?')) {
      setCrewData(prev => prev.filter(m => m.id !== id));
    }
  };

  const handleAddSubmit = (e) => {
    e.preventDefault();
    if (!addForm.id || !addForm.name) {
      alert('ID and Name are required.');
      return;
    }
    if (crewData.some(m => m.id === addForm.id)) {
      alert('A crew member with this ID already exists.');
      return;
    }
    setCrewData(prev => [{ ...addForm }, ...prev]);
    setIsAdding(false);
    setAddForm({ id: '', name: '', designation: '', contact: '', email: '', competencyExpiry: '' });
  };

  const handleExportCSV = () => {
    const headers = ['Emp ID', 'Name', 'Designation', 'Contact', 'Email ID', 'Competency Validity'];
    const csvRows = [headers.join(',')];
    
    sortedCrew.forEach(member => {
      const row = [
        member.id || '--',
        `"${(member.name || '--').replace(/"/g, '""')}"`,
        `"${(member.designation || '--').replace(/"/g, '""')}"`,
        member.contact || '--',
        member.email || '--',
        member.competencyExpiry || '--'
      ];
      csvRows.push(row.join(','));
    });
    
    const csvString = csvRows.join('\n');
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Crew_Registry_Export_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const SortableHeader = ({ label, sortKey, className = "" }) => {
    const isActive = sortConfig?.key === sortKey;
    return (
      <th 
        className={`p-4 font-black cursor-pointer hover:bg-slate-900 transition-colors select-none group sticky top-0 bg-slate-950 z-10 shadow-sm ${className}`}
        onClick={() => requestSort(sortKey)}
      >
        <div className="flex items-center gap-1.5">
          {label}
          <span className={`flex flex-col items-center justify-center ${isActive ? 'text-emerald-500' : 'text-slate-600 group-hover:text-slate-400'}`}>
            {isActive ? (
              sortConfig.direction === 'asc' ? <ArrowUp size={12} strokeWidth={3} /> : <ArrowDown size={12} strokeWidth={3} />
            ) : (
              <ChevronsUpDown size={12} />
            )}
          </span>
        </div>
      </th>
    );
  };

  return (
    <div className="space-y-6 font-mono h-full flex flex-col">
      {/* Top Metrics Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 flex-shrink-0">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-lg flex flex-col items-center justify-center">
          <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-1">Total Crew</span>
          <span className="text-3xl font-black text-cyan-400">{stats.total}</span>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-lg flex flex-col items-center justify-center">
          <span className="text-[10px] text-emerald-500/70 font-bold uppercase tracking-widest mb-1">Valid Competency</span>
          <span className="text-3xl font-black text-emerald-400">{stats.valid}</span>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-lg flex flex-col items-center justify-center relative overflow-hidden">
          {stats.expired > 0 && <div className="absolute top-0 w-full h-1 bg-rose-500 animate-pulse"></div>}
          <span className="text-[10px] text-rose-500/70 font-bold uppercase tracking-widest mb-1 flex items-center gap-1">
            {stats.expired > 0 && <AlertTriangle className="h-3 w-3" />} Expired
          </span>
          <span className="text-3xl font-black text-rose-500">{stats.expired}</span>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-lg flex flex-col items-center justify-center">
          <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-1">No Data</span>
          <span className="text-3xl font-black text-amber-500">{stats.noData}</span>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-2xl flex flex-col flex-grow">
        <div className="p-4 bg-slate-950 border-b border-slate-800 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 flex-shrink-0">
          <div className="flex items-center gap-2 text-emerald-400 font-black tracking-widest uppercase text-sm">
            <Users size={18} /> CREW DIRECTORY ENGINE
          </div>
          
          <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto text-xs">
            <div className="relative flex-grow lg:flex-grow-0">
              <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-500" />
              <input 
                type="text" 
                placeholder="Search ID, Name..." 
                className="w-full lg:w-48 bg-slate-900 border border-slate-700 rounded pl-8 pr-3 py-1.5 text-slate-200 focus:outline-none focus:border-emerald-500 transition-colors"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            
            <div className="flex items-center gap-1 bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-slate-300">
              <Filter className="h-3.5 w-3.5 text-slate-500" />
              <select value={designationFilter} onChange={(e) => setDesignationFilter(e.target.value)} className="bg-transparent outline-none border-none cursor-pointer uppercase font-bold tracking-wider max-w-[100px]">
                {uniqueDesignations.map(d => <option key={d} value={d} className="bg-slate-900">{d}</option>)}
              </select>
            </div>

            <div className="flex items-center gap-1 bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-slate-300">
              <AlertTriangle className="h-3.5 w-3.5 text-slate-500" />
              <select value={competencyFilter} onChange={(e) => setCompetencyFilter(e.target.value)} className="bg-transparent outline-none border-none cursor-pointer uppercase font-bold tracking-wider">
                <option value="ALL" className="bg-slate-900">ALL STATUS</option>
                <option value="VALID" className="bg-slate-900 text-emerald-400">VALID</option>
                <option value="EXPIRED" className="bg-slate-900 text-rose-400">EXPIRED</option>
                <option value="NO_DATA" className="bg-slate-900 text-amber-400">NO DATA</option>
              </select>
            </div>

            <button 
              onClick={handleExportCSV}
              className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-200 px-3 py-1.5 rounded transition-colors font-bold uppercase tracking-widest"
              title="Export CSV"
            >
              <Download size={14} /> EXPORT
            </button>

            <button 
              onClick={() => setIsAdding(!isAdding)}
              className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-slate-950 px-3 py-1.5 rounded transition-colors font-black uppercase tracking-widest"
            >
              {isAdding ? <X size={14} /> : <Plus size={14} />}
              {isAdding ? 'CLOSE' : 'ADD NEW'}
            </button>
          </div>
        </div>

        {isAdding && (
          <div className="p-4 bg-slate-900 border-b border-slate-800 animate-in fade-in slide-in-from-top-2 flex-shrink-0">
            <h3 className="text-emerald-400 font-bold mb-3 uppercase tracking-wider text-xs">Register New Personnel</h3>
            <form onSubmit={handleAddSubmit} className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-7 gap-3 items-end text-xs">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase tracking-widest">Emp ID</label>
                <input type="text" required value={addForm.id} onChange={e => setAddForm({...addForm, id: e.target.value})} className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-slate-200 focus:border-emerald-500 outline-none" placeholder="1045" />
              </div>
              <div className="md:col-span-2">
                <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase tracking-widest">Full Name</label>
                <input type="text" required value={addForm.name} onChange={e => setAddForm({...addForm, name: e.target.value})} className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-slate-200 focus:border-emerald-500 outline-none" placeholder="John Doe" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase tracking-widest">Designation</label>
                <input type="text" value={addForm.designation} onChange={e => setAddForm({...addForm, designation: e.target.value})} className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-slate-200 focus:border-emerald-500 outline-none" placeholder="Train Operator" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase tracking-widest">Contact</label>
                <input type="text" value={addForm.contact} onChange={e => setAddForm({...addForm, contact: e.target.value})} className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-slate-200 focus:border-emerald-500 outline-none" placeholder="Phone" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase tracking-widest">Validity</label>
                <input type="date" value={addForm.competencyExpiry || ''} onChange={e => setAddForm({...addForm, competencyExpiry: e.target.value})} className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-slate-200 focus:border-emerald-500 outline-none" />
              </div>
              <div>
                <button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-500 text-slate-950 p-2 rounded font-black transition-colors tracking-widest uppercase">SAVE ENTRY</button>
              </div>
            </form>
          </div>
        )}

        <div className="overflow-x-auto overflow-y-auto max-h-[65vh] relative custom-scrollbar flex-grow">
          <table className="w-full text-left text-xs whitespace-nowrap">
            <thead className="text-slate-500 uppercase tracking-widest text-[10px]">
              <tr>
                <SortableHeader label="Emp ID" sortKey="id" />
                <SortableHeader label="Name" sortKey="name" />
                <SortableHeader label="Role" sortKey="designation" />
                <SortableHeader label="Contact Info" sortKey="contact" />
                <SortableHeader label="Competency Status" sortKey="competencyExpiry" />
                <th className="p-4 font-black text-center border-l border-slate-800 sticky top-0 bg-slate-950 z-10 shadow-sm">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50 text-slate-300">
              {sortedCrew.map((member) => {
                const isExpired = member.competencyExpiry ? new Date(member.competencyExpiry) < new Date() : false;
                
                return (
                  <tr key={member.id} className={`hover:bg-slate-800/30 transition-colors ${isExpired ? 'bg-rose-950/5' : ''}`}>
                    {editingId === member.id ? (
                      <>
                        <td className="p-2"><input type="text" value={editForm.id} onChange={e => setEditForm({...editForm, id: e.target.value})} className="w-full bg-slate-950 border border-emerald-500 rounded px-2 py-1 text-slate-200 outline-none" /></td>
                        <td className="p-2"><input type="text" value={editForm.name} onChange={e => setEditForm({...editForm, name: e.target.value})} className="w-full bg-slate-950 border border-emerald-500 rounded px-2 py-1 text-slate-200 outline-none" /></td>
                        <td className="p-2"><input type="text" value={editForm.designation} onChange={e => setEditForm({...editForm, designation: e.target.value})} className="w-full bg-slate-950 border border-emerald-500 rounded px-2 py-1 text-slate-200 outline-none" /></td>
                        <td className="p-2">
                          <input type="text" value={editForm.contact} onChange={e => setEditForm({...editForm, contact: e.target.value})} className="w-full bg-slate-950 border border-emerald-500 rounded px-2 py-1 text-slate-200 outline-none mb-1" placeholder="Phone" />
                          <input type="text" value={editForm.email || ''} onChange={e => setEditForm({...editForm, email: e.target.value})} className="w-full bg-slate-950 border border-emerald-500 rounded px-2 py-1 text-slate-200 outline-none" placeholder="Email" />
                        </td>
                        <td className="p-2"><input type="date" value={editForm.competencyExpiry || ''} onChange={e => setEditForm({...editForm, competencyExpiry: e.target.value})} className="w-full bg-slate-950 border border-emerald-500 rounded px-2 py-1 text-slate-200 outline-none" /></td>
                        <td className="p-2 flex justify-center gap-2 border-l border-slate-800 h-full items-center mt-3">
                          <button onClick={handleSaveEdit} className="text-emerald-400 hover:text-emerald-300 p-1.5 bg-emerald-400/10 hover:bg-emerald-400/20 rounded transition-colors" title="Save"><Check size={16} /></button>
                          <button onClick={handleCancelEdit} className="text-slate-400 hover:text-slate-300 p-1.5 bg-slate-800 hover:bg-slate-700 rounded transition-colors" title="Cancel"><X size={16} /></button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="p-4 font-black text-cyan-400">#{member.id}</td>
                        <td className="p-4 font-bold text-slate-100">{member.name}</td>
                        <td className="p-4 text-slate-400"><span className="bg-slate-800 px-2 py-1 rounded text-[10px] uppercase font-bold tracking-widest">{member.designation || 'UNASSIGNED'}</span></td>
                        <td className="p-4">
                          <div className="flex flex-col gap-1">
                            <span className="flex items-center gap-2 text-slate-300"><Phone size={12} className="text-slate-500"/> {member.contact || '--'}</span>
                            <span className="flex items-center gap-2 text-slate-400 text-[10px]"><Mail size={12} className="text-slate-500"/> {member.email || '--'}</span>
                          </div>
                        </td>
                        <td className="p-4">
                          {member.competencyExpiry ? (
                            isExpired 
                              ? <span className="text-rose-400 font-bold bg-rose-950/40 border border-rose-500/30 px-2 py-1 rounded text-[10px] uppercase tracking-widest flex items-center gap-1 w-max"><AlertTriangle size={12} /> EXPIRED: {member.competencyExpiry}</span>
                              : <span className="text-emerald-400 font-bold bg-emerald-950/40 border border-emerald-500/30 px-2 py-1 rounded text-[10px] uppercase tracking-widest">VALID: {member.competencyExpiry}</span>
                          ) : <span className="text-slate-500 font-bold bg-slate-900 border border-slate-800 px-2 py-1 rounded text-[10px] uppercase tracking-widest">NO DATA</span>}
                        </td>
                        <td className="p-4 flex justify-center gap-2 border-l border-slate-800 bg-slate-900/20">
                          <button onClick={() => handleEditClick(member)} className="text-slate-400 hover:text-cyan-400 p-1.5 hover:bg-slate-800 rounded transition-colors" title="Edit"><Edit2 size={16} /></button>
                          <button onClick={() => handleDelete(member.id)} className="text-slate-400 hover:text-rose-400 p-1.5 hover:bg-slate-800 rounded transition-colors" title="Delete"><Trash2 size={16} /></button>
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
              {sortedCrew.length === 0 && (
                <tr>
                  <td colSpan="6" className="p-12 text-center text-slate-500 font-bold uppercase tracking-widest text-xs">No crew members match the current filters.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        
        {/* Footer info (Replaces old pagination) */}
        <div className="bg-slate-950 border-t border-slate-800 p-3 text-center text-[10px] text-slate-500 font-bold tracking-widest uppercase flex-shrink-0">
          Viewing {sortedCrew.length} of {crewData.length} Registry Entries
        </div>

      </div>
    </div>
  );
}