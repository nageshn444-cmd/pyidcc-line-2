import React, { useState } from 'react';
import ReliefTracking from '../components/ReliefTracking';
import ChronologicalMatrix from '../components/ChronologicalMatrix';
import { Activity, Table, Search, Clock, MapPin } from 'lucide-react';

export default function WTTPage(props) {
  const [activeTab, setActiveTab] = useState('RELIEF');

  // Matrix Search States
  const [matrixTidSearch, setMatrixTidSearch] = useState('');
  const [matrixTimeSearch, setMatrixTimeSearch] = useState('');
  const [matrixStationSearch, setMatrixStationSearch] = useState('');

  // Sort rows preserving Excel row sequence primary order, then safe time order
  const sortedRows = [...(props.filteredUnifiedRows || [])].sort((a, b) => {
    if (a.rowSeq !== undefined && b.rowSeq !== undefined && a.rowSeq !== b.rowSeq) {
      return a.rowSeq - b.rowSeq;
    }

    const getTimeInSecs = (row) => {
      let minSecs = 999999;
      const timeToSeconds = (timeStr) => {
        if (!timeStr || timeStr === '--' || timeStr === '-') return 999999;
        const match = String(timeStr).trim().match(/^([0-2]?\d):([0-5]\d)(:([0-5]\d))?/);
        if (!match) return 999999;
        let secs = parseInt(match[1], 10) * 3600 + parseInt(match[2], 10) * 60;
        if (match[4]) secs += parseInt(match[4], 10);
        if (secs < 3 * 3600) secs += 24 * 3600;
        return secs;
      };

      const dnTimes = row.downTrip?.stations ? Object.values(row.downTrip.stations) : [];
      const upTimes = row.upTrip?.stations ? Object.values(row.upTrip.stations) : [];

      for (const t of dnTimes) {
        const s = timeToSeconds(t);
        if (s < 999999) { minSecs = Math.min(minSecs, s); break; }
      }
      if (minSecs === 999999) {
        for (const t of upTimes) {
          const s = timeToSeconds(t);
          if (s < 999999) { minSecs = Math.min(minSecs, s); break; }
        }
      }
      return minSecs;
    };

    const timeA = getTimeInSecs(a);
    const timeB = getTimeInSecs(b);
    if (timeA !== timeB) return timeA - timeB;

    return String(a.trainId || '').localeCompare(String(b.trainId || ''), undefined, { numeric: true });
  });

  // Filter sortedRows based on search criteria
  const finalMatrixRows = sortedRows.filter(row => {
    let match = true;
    
    // Train ID Filter
    if (matrixTidSearch) {
      match = match && String(row.trainId).toLowerCase().includes(matrixTidSearch.toLowerCase());
    }
    
    // Time & Station Filters
    if (matrixStationSearch && matrixTimeSearch) {
      const dnTime = row.downTrip?.stations?.[matrixStationSearch] || '';
      const upTime = row.upTrip?.stations?.[matrixStationSearch] || '';
      match = match && (dnTime.includes(matrixTimeSearch) || upTime.includes(matrixTimeSearch));
    } else if (matrixTimeSearch) {
      const times = { ...row.downTrip?.stations, ...row.upTrip?.stations };
      const hasTimeMatch = Object.values(times).some(t => t && t.includes(matrixTimeSearch));
      match = match && hasTimeMatch;
    } else if (matrixStationSearch) {
      const dnTime = row.downTrip?.stations?.[matrixStationSearch] || '';
      const upTime = row.upTrip?.stations?.[matrixStationSearch] || '';
      match = match && ((dnTime && dnTime !== '--' && dnTime !== '-') || (upTime && upTime !== '--' && upTime !== '-'));
    }
    
    return match;
  });

  // Get unique list of stations for dropdown
  const allStations = [...new Set([...(props.dnStationOrder || []), ...(props.upStationOrder || [])])];

  return (
    <div className="p-6">
      {/* Sub-Navigation Tabs */}
      <div className="flex gap-2 mb-6 border-b border-slate-800 pb-4">
        <button
          onClick={() => setActiveTab('RELIEF')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-sm transition-all ${
            activeTab === 'RELIEF' 
              ? 'bg-cyan-900/50 text-cyan-400 border border-cyan-500/30' 
              : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
          }`}
        >
          <Activity className="h-4 w-4" /> LIVE RELIEF TRACKING
        </button>
        <button
          onClick={() => setActiveTab('MATRIX')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-sm transition-all ${
            activeTab === 'MATRIX' 
              ? 'bg-emerald-900/50 text-emerald-400 border border-emerald-500/30' 
              : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
          }`}
        >
          <Table className="h-4 w-4" /> CHRONOLOGICAL MATRIX
        </button>
      </div>

      {/* View Switcher */}
      <div className="mt-4">
        {activeTab === 'RELIEF' && (
          <ReliefTracking 
            trackerSearchTerm={props.trackerSearchTerm}
            setTrackerSearchTerm={props.setTrackerSearchTerm}
            filteredTrackingKeys={props.filteredTrackingKeys}
            liveTrainTrackingMap={props.liveTrainTrackingMap}
          />
        )}
        
        {activeTab === 'MATRIX' && (
          <div className="space-y-4">
            {/* Matrix Search Filters */}
            <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl shadow-lg flex flex-wrap items-end gap-4">
              <div className="flex-1 min-w-[150px] lg:min-w-[200px]">
                <label className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-1 block" htmlFor="wttpage-i1">Train ID</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 h-4 w-4" />
                  <input id="wttpage-i1" name="wttpage-i1" 
                    type="text" 
                    placeholder="Search TID..." 
                    value={matrixTidSearch} 
                    onChange={e => setMatrixTidSearch(e.target.value)} 
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg py-2 pl-9 pr-3 text-sm text-slate-200 focus:border-emerald-500 focus:outline-none transition-colors"
                  />
                </div>
              </div>
              <div className="flex-1 min-w-[150px] lg:min-w-[200px]">
                <label className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-1 block" htmlFor="wttpage-i2">Scheduled Time</label>
                <div className="relative">
                  <Clock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 h-4 w-4" />
                  <input id="wttpage-i2" name="wttpage-i2" 
                    type="text" 
                    placeholder="e.g. 05:30" 
                    value={matrixTimeSearch} 
                    onChange={e => setMatrixTimeSearch(e.target.value)} 
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg py-2 pl-9 pr-3 text-sm text-slate-200 focus:border-emerald-500 focus:outline-none transition-colors"
                  />
                </div>
              </div>
              <div className="flex-1 min-w-[150px] lg:min-w-[200px]">
                <label className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-1 block" htmlFor="wttpage-i3">Station Filter</label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 h-4 w-4" />
                  <select id="wttpage-i3" name="wttpage-i3" 
                    value={matrixStationSearch} 
                    onChange={e => setMatrixStationSearch(e.target.value)} 
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg py-2 pl-9 pr-3 text-sm text-slate-200 focus:border-emerald-500 focus:outline-none transition-colors appearance-none"
                  >
                    <option value="">All Stations</option>
                    {allStations.map(st => (
                      <option key={st} value={st}>{st}</option>
                    ))}
                  </select>
                </div>
              </div>
              <button 
                onClick={() => { setMatrixTidSearch(''); setMatrixTimeSearch(''); setMatrixStationSearch(''); }}
                className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-4 py-2 rounded-lg text-sm font-bold transition-colors border border-slate-700 h-[38px]"
              >
                CLEAR
              </button>
            </div>

            <ChronologicalMatrix 
              targetTid={props.targetTid}
              setTargetTid={props.setTargetTid}
              delayMinutes={props.delayMinutes}
              setDelayMinutes={props.setDelayMinutes}
              incidentReason={props.incidentReason}
              setIncidentReason={props.setIncidentReason}
              handleIncidentLogSubmit={props.handleIncidentLogSubmit}
              liveIncidents={props.liveIncidents}
              filteredUnifiedRows={finalMatrixRows}
              dnStationOrder={props.dnStationOrder}
              upStationOrder={props.upStationOrder}
              editingCell={props.editingCell}
              setEditingCell={props.setEditingCell}
              editValue={props.editValue}
              setEditValue={props.setEditValue}
              handleWttCellSave={props.handleWttCellSave}
              handleWttBulkSave={props.handleWttBulkSave}
              handleDeleteTripRow={props.handleDeleteTripRow}
              addDelayToTime={props.addDelayToTime}
              activeDay={props.activeDay}
            />
          </div>
        )}
      </div>
    </div>
  );
}
