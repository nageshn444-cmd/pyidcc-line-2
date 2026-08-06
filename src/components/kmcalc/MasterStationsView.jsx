/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Plus, Edit2, Trash2, MapPin, Landmark, Search, HelpCircle } from 'lucide-react';

export default function MasterStationsView({ stations, onUpdateStations }) {
  const [search, setSearch] = useState('');
  const [editingStation, setEditingStation] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newCode, setNewCode] = useState('');
  const [newName, setNewName] = useState('');
  const [newChainage, setNewChainage] = useState('');
  const [isBuffer, setIsBuffer] = useState(false);

  // Sorting stations by chainage (from BIET at negative chainage to APTS at positive chainage)
  const sortedStations = [...stations].sort((a, b) => a.chainage - b.chainage);

  const filteredStations = sortedStations.filter(
    s =>
      s.code.toLowerCase().includes(search.toLowerCase()) ||
      s.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleAdd = (e) => {
    e.preventDefault();
    if (!newCode || !newName || isNaN(parseFloat(newChainage))) return;

    const newStn = {
      id: Date.now().toString(),
      code: newCode.toUpperCase().trim(),
      name: newName.trim(),
      chainage: parseFloat(newChainage),
      isBufferOrSpecial: isBuffer,
    };

    onUpdateStations([...stations, newStn]);
    setNewCode('');
    setNewName('');
    setNewChainage('');
    setIsBuffer(false);
    setShowAddForm(false);
  };

  const handleEditSave = (e) => {
    e.preventDefault();
    if (!editingStation) return;

    const updated = stations.map(s => (s.id === editingStation.id ? editingStation : s));
    onUpdateStations(updated);
    setEditingStation(null);
  };

  const handleDelete = (id) => {
    if (confirm('Are you sure you want to delete this station from the chainage engine? This may break existing distance routes.')) {
      onUpdateStations(stations.filter(s => s.id !== id));
    }
  };

  return (
    <div className="space-y-3.5" id="master-stations-container">
      {/* Header Panel */}
      <div className="bg-slate-900 border border-slate-800 rounded p-3 px-4 shadow-md flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-tight text-emerald-400 flex items-center gap-2">
            <Landmark className="w-4 h-4 text-emerald-500" />
            BMRCL Green Line Chainage Database
          </h2>
          <p className="text-slate-400 text-[10px] mt-0.5">
            Master reference table of stations and cumulative chainages in Kilometers. Used to drive the distance engine.
          </p>
        </div>
        <button
          id="btn-add-station-toggle"
          onClick={() => setShowAddForm(!showAddForm)}
          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-mono font-bold rounded shadow transition flex items-center gap-1.5 text-[11px] self-start md:self-auto"
        >
          <Plus className="w-3.5 h-3.5" />
          ADD MASTER POINT
        </button>
      </div>

      {/* Add / Edit Form Modal/Drawer */}
      {(showAddForm || editingStation) && (
        <div className="bg-slate-900 border border-slate-800 rounded p-4 shadow-lg animate-fadeIn">
          <h3 className="text-xs font-bold text-slate-200 mb-3 uppercase tracking-wider font-mono">
            {editingStation ? 'Edit Chainage Coordinate' : 'Add New Chainage Point'}
          </h3>
          <form onSubmit={editingStation ? handleEditSave : handleAdd} className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1" htmlFor="input-station-code">Station Code (e.g. PYID)</label>
              <input name="masterstationsview-i1"
                id="input-station-code"
                type="text"
                required
                placeholder="STNCODE"
                value={editingStation ? editingStation.code : newCode}
                onChange={e =>
                  editingStation
                    ? setEditingStation({ ...editingStation, code: e.target.value.toUpperCase() })
                    : setNewCode(e.target.value)
                }
                className="w-full px-2 py-1.5 bg-slate-950 border border-slate-800 rounded text-slate-100 text-[11px] font-mono focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1" htmlFor="input-station-name">Station Name</label>
              <input name="masterstationsview-i2"
                id="input-station-name"
                type="text"
                required
                placeholder="Full Station Name"
                value={editingStation ? editingStation.name : newName}
                onChange={e =>
                  editingStation
                    ? setEditingStation({ ...editingStation, name: e.target.value })
                    : setNewName(e.target.value)
                }
                className="w-full px-2 py-1.5 bg-slate-950 border border-slate-800 rounded text-slate-100 text-[11px] font-mono focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1" htmlFor="input-station-chainage">Chainage in KM (e.g. -3.02)</label>
              <input name="masterstationsview-i3"
                id="input-station-chainage"
                type="number"
                step="0.001"
                required
                placeholder="0.000"
                value={editingStation ? editingStation.chainage : newChainage}
                onChange={e =>
                  editingStation
                    ? setEditingStation({ ...editingStation, chainage: parseFloat(e.target.value) || 0 })
                    : setNewChainage(e.target.value)
                }
                className="w-full px-2 py-1.5 bg-slate-950 border border-slate-800 rounded text-slate-100 text-[11px] font-mono focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div className="flex flex-col justify-end">
              <label className="flex items-center gap-2 cursor-pointer py-1 text-[11px] text-slate-300 font-mono" htmlFor="checkbox-is-buffer">
                <input name="masterstationsview-i4"
                  id="checkbox-is-buffer"
                  type="checkbox"
                  checked={editingStation ? !!editingStation.isBufferOrSpecial : isBuffer}
                  onChange={e =>
                    editingStation
                      ? setEditingStation({ ...editingStation, isBufferOrSpecial: e.target.checked })
                      : setIsBuffer(e.target.checked)
                  }
                  className="rounded border-slate-800 text-emerald-500 focus:ring-emerald-500/30 bg-slate-950 w-3.5 h-3.5"
                />
                BUFFER POINT
              </label>
            </div>
            <div className="md:col-span-4 flex justify-end gap-2 pt-2.5 border-t border-slate-800/60">
              <button
                type="button"
                id="btn-cancel-station"
                onClick={() => {
                  setShowAddForm(false);
                  setEditingStation(null);
                }}
                className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[11px] font-mono transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                id="btn-save-station"
                className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-[11px] font-mono font-bold transition-colors"
              >
                {editingStation ? 'Save Changes' : 'Add Station'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Main Content Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3.5">
        {/* Interactive Railway Line Graphic */}
        <div className="bg-slate-900 border border-slate-800 rounded p-4 shadow-md flex flex-col h-[520px] overflow-hidden">
          <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-1.5 font-mono">
            <MapPin className="w-3.5 h-3.5 text-emerald-500" />
            Green Line Route Map
          </h3>
          <div className="flex-1 overflow-y-auto pr-1.5 custom-scrollbar">
            <div className="relative pl-6 space-y-3.5">
              {/* Vertical line connector */}
              <div className="absolute left-[10px] top-2.5 bottom-2.5 w-1 bg-emerald-600 rounded shadow-inner opacity-70" />
              
              {sortedStations.map((stn, idx) => {
                const prev = idx > 0 ? sortedStations[idx - 1] : null;
                const distFromPrev = prev ? Math.abs(stn.chainage - prev.chainage) : 0;

                return (
                  <div key={stn.id} className="relative group flex items-start justify-between">
                    {/* Ring Node */}
                    <div className={`absolute left-[-20px] top-1 w-3.5 h-3.5 rounded-full border-2 ${
                      stn.isBufferOrSpecial 
                        ? 'bg-slate-900 border-amber-500' 
                        : 'bg-emerald-500 border-slate-900'
                    } flex items-center justify-center z-10 transition-transform group-hover:scale-125`}>
                      {stn.isBufferOrSpecial && <div className="w-1 h-1 bg-amber-500 rounded-full" />}
                    </div>

                    <div>
                      <div className="font-bold text-[11px] text-slate-200 flex items-center gap-1 font-mono">
                        {stn.code}
                        {stn.isBufferOrSpecial && (
                          <span className="px-1 text-[8px] bg-amber-500/10 text-amber-500 border border-amber-500/20 rounded font-mono">
                            BUFFER
                          </span>
                        )}
                      </div>
                      <div className="text-slate-400 text-[10px] leading-tight">{stn.name}</div>
                    </div>

                    <div className="text-right">
                      <div className="font-mono text-[11px] text-emerald-400 font-bold">{stn.chainage.toFixed(3)} KM</div>
                      {prev && (
                        <div className="text-[9px] text-slate-600 font-mono italic mt-0.5">
                          +{distFromPrev.toFixed(3)} KM segment
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Stations Table */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded p-4 shadow-md flex flex-col h-[520px]">
          {/* Controls */}
          <div className="flex flex-col sm:flex-row gap-3 mb-3 justify-between items-center">
            <div className="relative w-full sm:w-64">
              <span className="absolute inset-y-0 left-0 flex items-center pl-2.5 pointer-events-none text-slate-400">
                <Search className="w-3.5 h-3.5" />
              </span>
              <input name="masterstationsview-i5"
                id="search-stations"
                type="text"
                placeholder="Search station name or code..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1 bg-slate-950 border border-slate-800 rounded text-slate-200 text-[11px] font-mono focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div className="text-[10px] text-slate-400 flex items-center gap-1 font-mono">
              <HelpCircle className="w-3.5 h-3.5 text-slate-500" />
              <span>Yeshwantpura is the datum point (0.000 KM)</span>
            </div>
          </div>

          {/* Grid Container */}
          <div className="flex-1 overflow-y-auto border border-slate-800 rounded custom-scrollbar">
            <table className="w-full text-left text-[11px] border-collapse font-mono">
              <thead className="bg-slate-950 text-slate-400 uppercase tracking-wider sticky top-0 z-10 text-[10px] border-b border-slate-800">
                <tr>
                  <th className="px-3 py-2">No.</th>
                  <th className="px-3 py-2">Code</th>
                  <th className="px-3 py-2">Station Name</th>
                  <th className="px-3 py-2 text-right">Cumulative Chainage</th>
                  <th className="px-3 py-2 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-850">
                {filteredStations.map((stn, index) => (
                  <tr key={stn.id} className="hover:bg-slate-850/40 transition-colors">
                    <td className="px-3 py-1.5 text-slate-500 font-mono">{index + 1}</td>
                    <td className="px-3 py-1.5 font-bold text-slate-200">{stn.code}</td>
                    <td className="px-3 py-1.5 text-slate-300 font-sans">
                      {stn.name}
                      {stn.isBufferOrSpecial && (
                        <span className="ml-1.5 inline-block px-1 py-0.2 text-[8px] bg-amber-600/10 text-amber-500 rounded border border-amber-500/20 font-mono">
                          BUFFER END
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-right font-bold text-emerald-400">
                      {stn.chainage >= 0 ? `+${stn.chainage.toFixed(3)}` : stn.chainage.toFixed(3)} KM
                    </td>
                    <td className="px-3 py-1.5 text-center">
                      <div className="flex justify-center items-center gap-1.5" onClick={e => e.stopPropagation()}>
                        <button
                          id={`btn-edit-station-${stn.code}`}
                          onClick={() => setEditingStation(stn)}
                          className="p-0.5 hover:bg-slate-850 rounded text-slate-400 hover:text-emerald-400 transition"
                          title="Edit chainage coordinate"
                        >
                          <Edit2 className="w-3 h-3" />
                        </button>
                        <button
                          id={`btn-delete-station-${stn.code}`}
                          onClick={() => handleDelete(stn.id)}
                          className="p-0.5 hover:bg-slate-850 rounded text-slate-400 hover:text-red-400 transition"
                          title="Delete point"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredStations.length === 0 && (
                  <tr>
                    <td colSpan={5} className="text-center py-6 text-slate-500 italic">
                      No matching stations found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
