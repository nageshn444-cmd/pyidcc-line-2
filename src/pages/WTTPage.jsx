import React, { useState } from 'react';
import ReliefTracking from '../components/ReliefTracking';
import ChronologicalMatrix from '../components/ChronologicalMatrix';
import WttExcelUploadModal from '../components/wtt/WttExcelUploadModal';
import { Activity, Table, Search, Clock, MapPin, UploadCloud, FileSpreadsheet, CheckCircle2, Trash2 } from 'lucide-react';

export default function WTTPage(props) {
  const [activeTab, setActiveTab] = useState('RELIEF');
  const [isWttUploadOpen, setIsWttUploadOpen] = useState(false);
  const [isDeployingMaster, setIsDeployingMaster] = useState(false);
  const [isClearingWtt, setIsClearingWtt] = useState(false);

  // Matrix Search States
  const [matrixTidSearch, setMatrixTidSearch] = useState('');
  const [matrixTimeSearch, setMatrixTimeSearch] = useState('');
  const [matrixStationSearch, setMatrixStationSearch] = useState('');

  const handleEraseOldWttData = async () => {
    if (props.isReadOnly) {
      alert("Read-Only Mode: Train Operators cannot modify WTT data.");
      return;
    }
    const day = props.activeDay || 'WEEKDAY';
    if (!window.confirm(`⚠️ Erase all old WTT timetable records for ${day}? Only newly uploaded data should be kept.`)) {
      return;
    }
    setIsClearingWtt(true);
    try {
      const { clearWttScheduleForDay } = await import('../services/wttAndLinkRosterImportService');
      await clearWttScheduleForDay(day);
      if (typeof props.onWttImported === 'function') {
        props.onWttImported({ scheduleType: day, rows: [], eraseOld: true });
      }
      alert(`✅ Erased old ${day} WTT timetable records. Upload new WTT sheet to deploy latest data.`);
    } catch (err) {
      console.error(err);
      alert(`Failed to erase old WTT data: ${err.message}`);
    } finally {
      setIsClearingWtt(false);
    }
  };

  const handleDeployMasterWtt = async () => {
    if (props.isReadOnly) {
      alert("Read-Only Mode: Train Operators cannot deploy master WTT data.");
      return;
    }
    try {
      const { saveWttToFirestore, normalizeScheduleType } = await import('../services/wttAndLinkRosterImportService');
      const { WTT_MASTER_REGISTRY } = await import('../data/wttMasterRegistry');

      const activeSched = normalizeScheduleType(props.activeDay || 'WEEKDAY');
      const masterRows = WTT_MASTER_REGISTRY.filter(r => normalizeScheduleType(r.scheduleType, r.id) === activeSched);
      if (!masterRows || masterRows.length === 0) {
        alert(`No master rows found for ${activeSched}`);
        return;
      }
      if (!window.confirm(`Deploy verified ${activeSched} Master WTT (${masterRows.length} trips with all 10 Downline/Upline stations and ATO/ATP modes) to database? This will clear any corrupted uploads.`)) {
        return;
      }
      setIsDeployingMaster(true);

      // Instant UI update (0 latency)
      if (typeof props.onWttImported === 'function') {
        props.onWttImported({ scheduleType: activeSched, rows: masterRows });
      }

      await saveWttToFirestore(masterRows, activeSched);
      alert(`✅ Successfully deployed verified ${activeSched} Master WTT with full Downline and Upline telemetry!`);
    } catch (err) {
      console.error('Failed to deploy Master WTT:', err);
      alert(`⚠️ Deploy error: ${err.message}`);
    } finally {
      setIsDeployingMaster(false);
    }
  };

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
    
    // Train ID & Mode Filter
    if (matrixTidSearch) {
      const q = matrixTidSearch.toLowerCase();
      const tidMatch = String(row.trainId || '').toLowerCase().includes(q);
      const modeMatch = String(row.mode || '').toLowerCase().includes(q) ||
        String(row.dnMode || row.downTrip?.mode || '').toLowerCase().includes(q) ||
        String(row.upMode || row.upTrip?.mode || '').toLowerCase().includes(q);
      match = match && (tidMatch || modeMatch);
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
            activeDay={props.activeDay || 'WEEKDAY'}
            simulatedTime={props.simulatedTime}
            linkRoster={props.linkRoster || props.deployments}
          />
        )}
        
        {activeTab === 'MATRIX' && (
          <div className="space-y-4">
            {/* Matrix Search Filters */}
            <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl shadow-lg flex flex-wrap items-end gap-4">
              <div className="flex-1 min-w-[150px] lg:min-w-[200px]">
                <label className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-1 block" htmlFor="wttpage-i1">Train ID / Mode</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 h-4 w-4" />
                  <input id="wttpage-i1" name="wttpage-i1" 
                    type="text" 
                    placeholder="Search TID, ATO, ATP..." 
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
              {!props.isReadOnly && (
                <button 
                  onClick={() => setIsWttUploadOpen(true)}
                  className="bg-emerald-600 hover:bg-emerald-500 text-slate-950 px-4 py-2 rounded-lg text-sm font-black transition-all flex items-center gap-2 shadow-[0_0_15px_rgba(16,185,129,0.25)] h-[38px]"
                  title={`Upload new Working Time Table Excel sheet for ${props.activeDay || 'WEEKDAY'} or any day`}
                >
                  <UploadCloud className="h-4 w-4" /> UPLOAD WTT EXCEL
                </button>
              )}
            </div>

            {/* Quick WTT Upload Banner Above Chronological Matrix */}
            {!props.isReadOnly && (
              <div className="bg-gradient-to-r from-emerald-950/40 via-slate-900 to-slate-900 border border-emerald-500/25 p-3 rounded-xl flex flex-wrap items-center justify-between gap-3 shadow-md">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                    <FileSpreadsheet className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-200 uppercase tracking-wide flex items-center gap-2">
                      <span>Working Time Table Dynamic Importer</span>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 font-bold border border-emerald-500/30">
                        Active: {props.activeDay || 'WEEKDAY'} SCHEDULE
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400 font-sans mt-0.5">
                      Upload new WTT Excel (.xlsx, .xls, .csv). Extracted scheduled timings will update this chronological matrix and synchronize line-wide telemetry.
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={handleEraseOldWttData}
                    disabled={isClearingWtt}
                    className="bg-rose-950/70 hover:bg-rose-900 border border-rose-500/40 text-rose-300 disabled:opacity-50 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 shadow-[0_0_12px_rgba(244,63,94,0.15)]"
                    title={`Erase old ${props.activeDay || 'WEEKDAY'} WTT records`}
                  >
                    <Trash2 className="h-3.5 w-3.5" /> {isClearingWtt ? 'Erasing...' : `Erase Old ${props.activeDay || 'WEEKDAY'} Data`}
                  </button>
                  <button
                    onClick={handleDeployMasterWtt}
                    disabled={isDeployingMaster}
                    className="bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-slate-950 px-3.5 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 shadow-[0_0_12px_rgba(6,182,212,0.25)]"
                    title={`Deploy verified 10-station Master WTT for ${props.activeDay || 'WEEKDAY'} with ATO/ATP modes`}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" /> {isDeployingMaster ? 'Deploying...' : `Deploy Verified Master WTT`}
                  </button>
                  <button
                    onClick={() => setIsWttUploadOpen(true)}
                    className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 px-3.5 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 shadow-[0_0_12px_rgba(16,185,129,0.25)]"
                  >
                    <UploadCloud className="h-3.5 w-3.5" /> Upload {props.activeDay || 'WEEKDAY'} WTT
                  </button>
                </div>
              </div>
            )}

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

            {isWttUploadOpen && (
              <WttExcelUploadModal
                isOpen={isWttUploadOpen}
                onClose={() => setIsWttUploadOpen(false)}
                activeDay={props.activeDay || 'WEEKDAY'}
                onWttImported={async (data) => {
                  if (typeof props.onWttImported === 'function') {
                    await props.onWttImported(data);
                  } else if (typeof props.fetchLiveData === 'function') {
                    await props.fetchLiveData();
                  }
                }}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
