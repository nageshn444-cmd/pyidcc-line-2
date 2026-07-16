import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase';
import { collection, query, onSnapshot, setDoc, doc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { CalendarDays, Plus, Train, Search, Activity, Sun, Moon, Save, XCircle } from 'lucide-react';

const getToday = () => new Date().toISOString().slice(0, 10);
const DEFAULT_TRAIN_IDS = Array.from({ length: 23 }, (_, i) => (201 + i).toString());

export default function TrainRakeRegistry() {
  const [data, setData] = useState([]);
  const [selectedDate, setSelectedDate] = useState(getToday());
  const [customTid, setCustomTid] = useState('');
  const [localData, setLocalData] = useState({});
  const [searchQuery, setSearchQuery] = useState('');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const q = query(collection(db, 'rake_registry'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setData(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsubscribe();
  }, []);

  const visibleData = data.filter(item => item.registryDate === selectedDate);
  const existingTids = visibleData.map(d => d.trainId).filter(Boolean);
  const allTrainIds = [...new Set([...DEFAULT_TRAIN_IDS, ...existingTids])].sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));

  // Initialize or reset local state from DB
  const syncFromDB = () => {
    const newLocal = {};
    allTrainIds.forEach(tid => {
      const record = visibleData.find(d => d.trainId === tid) || {};
      newLocal[tid] = {
        trainSet: record.trainSet || '',
        status: record.status || 'Active',
        morningRake: !!record.morningRake,
        eveningRake: !!record.eveningRake
      };
    });
    setLocalData(newLocal);
    setHasUnsavedChanges(false);
  };

  useEffect(() => {
    // Only auto-sync if we don't have unsaved changes, or when date changes (date change forces discard)
    if (!hasUnsavedChanges) {
      syncFromDB();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, selectedDate, allTrainIds.length]);

  const handleChange = (tid, field, val) => {
    setLocalData(prev => ({
      ...prev,
      [tid]: { ...(prev[tid] || {}), [field]: val }
    }));
    setHasUnsavedChanges(true);
  };

  const handleBulkToggle = (field, value) => {
    const newLocal = { ...localData };
    allTrainIds.forEach(tid => {
      if (!newLocal[tid]) newLocal[tid] = { trainSet: '', status: 'Active', morningRake: false, eveningRake: false };
      newLocal[tid][field] = value;
    });
    setLocalData(newLocal);
    setHasUnsavedChanges(true);
  };

  const handleAddCustom = () => {
    if (!customTid) return;
    setLocalData(prev => ({
      ...prev,
      [customTid]: { trainSet: '', status: 'Active', morningRake: false, eveningRake: false }
    }));
    setCustomTid('');
    setHasUnsavedChanges(true);
  };

  const handleSubmit = async () => {
    setIsSaving(true);
    try {
      const batch = writeBatch(db);
      
      Object.keys(localData).forEach(tid => {
        const localRecord = localData[tid];
        const dbRecord = visibleData.find(d => d.trainId === tid) || {};
        
        // Only write if something actually changed compared to DB to save writes, or if it's a new custom ID
        const isChanged = 
          localRecord.trainSet !== (dbRecord.trainSet || '') ||
          localRecord.status !== (dbRecord.status || 'Active') ||
          localRecord.morningRake !== !!dbRecord.morningRake ||
          localRecord.eveningRake !== !!dbRecord.eveningRake ||
          !dbRecord.id;

        if (isChanged) {
          const docId = dbRecord.id || `rake_${selectedDate}_${tid}`;
          const ref = doc(db, 'rake_registry', docId);
          batch.set(ref, {
            registryDate: selectedDate,
            trainId: tid,
            trainSet: localRecord.trainSet || '',
            status: localRecord.status || 'Active',
            morningRake: !!localRecord.morningRake,
            eveningRake: !!localRecord.eveningRake,
            createdAt: dbRecord.createdAt || serverTimestamp()
          }, { merge: true });
        }
      });
      
      await batch.commit();
      setHasUnsavedChanges(false);
      alert('Train registry successfully saved!');
    } catch (error) {
      console.error("Error saving registry:", error);
      alert('Error saving data. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const isAllMorning = allTrainIds.length > 0 && allTrainIds.every(tid => localData[tid]?.morningRake);
  const isAllEvening = allTrainIds.length > 0 && allTrainIds.every(tid => localData[tid]?.eveningRake);

  const filteredTrainIds = useMemo(() => {
    // Include custom IDs that might only exist in localData
    const combinedIds = [...new Set([...allTrainIds, ...Object.keys(localData)])].sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));
    
    if (!searchQuery) return combinedIds;
    return combinedIds.filter(tid => {
      const local = localData[tid] || {};
      return tid.toLowerCase().includes(searchQuery.toLowerCase()) || (local.trainSet || '').toLowerCase().includes(searchQuery.toLowerCase());
    });
  }, [allTrainIds, localData, searchQuery]);

  // Dashboard stats (based on local data to reflect unsaved changes immediately)
  const totalMorning = filteredTrainIds.filter(tid => localData[tid]?.morningRake).length;
  const totalEvening = filteredTrainIds.filter(tid => localData[tid]?.eveningRake).length;
  const activeTrains = filteredTrainIds.filter(tid => (localData[tid]?.status || 'Active') === 'Active').length;
  const maintenanceTrains = filteredTrainIds.filter(tid => localData[tid]?.status === 'Maintenance').length;

  return (
    <div className='bg-slate-900 p-6 rounded-xl border border-slate-800 shadow-xl flex flex-col gap-6'>
      <div className='flex flex-col md:flex-row justify-between items-start md:items-center gap-4'>
        <div className='flex flex-col gap-1'>
          <h2 className='text-emerald-400 font-bold flex items-center gap-2 text-xl'><Train size={24} /> Daily Train/Rake Registry</h2>
          {hasUnsavedChanges && <span className='text-xs font-bold text-amber-500 bg-amber-500/10 px-2 py-1 rounded w-fit'>Unsaved Changes Pending</span>}
        </div>
        
        <div className='flex flex-wrap items-center gap-4'>
           <div className='relative w-full md:w-64'>
             <Search className='absolute left-3 top-1/2 -translate-y-1/2 text-slate-500' size={16} />
             <input id="trainrakeregistry-i1" name="trainrakeregistry-i1" 
               className='w-full bg-slate-950 border border-slate-700 rounded-lg py-2 pl-10 pr-4 text-sm text-slate-200 focus:outline-none focus:border-emerald-500 transition-colors' 
               placeholder='Search ID or Set...' 
               value={searchQuery} 
               onChange={(e) => setSearchQuery(e.target.value)} 
             />
           </div>
           <div className='flex items-center gap-3 bg-slate-950 p-2 rounded-lg border border-slate-800'>
             <h3 className='text-slate-400 font-bold text-xs flex items-center gap-2'><CalendarDays size={16}/> DATE</h3>
             <input id="trainrakeregistry-i2" name="trainrakeregistry-i2" 
               type='date' 
               className='bg-slate-900 border border-slate-700 p-1.5 rounded text-sm text-slate-200 focus:border-emerald-500 focus:outline-none' 
               value={selectedDate} 
               onChange={e => {
                 if (hasUnsavedChanges && !window.confirm("You have unsaved changes. Change date anyway and discard changes?")) return;
                 setSelectedDate(e.target.value);
                 setHasUnsavedChanges(false);
               }} 
             />
           </div>
        </div>
      </div>
      
      {/* Dashboard Summary Cards */}
      <div className='grid grid-cols-2 md:grid-cols-4 gap-4'>
        <div className='bg-slate-950 border border-slate-800 rounded-xl p-4 flex flex-col items-center justify-center relative overflow-hidden'>
          <div className='absolute inset-0 bg-amber-500/5'></div>
          <div className='flex items-center gap-2 text-amber-500 mb-1 z-10'><Sun size={18} /> <span className='text-xs font-bold uppercase'>Morning Rakes</span></div>
          <div className='text-2xl font-black text-white z-10'>{totalMorning} <span className='text-sm text-slate-500'>/ {filteredTrainIds.length}</span></div>
        </div>
        <div className='bg-slate-950 border border-slate-800 rounded-xl p-4 flex flex-col items-center justify-center relative overflow-hidden'>
          <div className='absolute inset-0 bg-indigo-500/5'></div>
          <div className='flex items-center gap-2 text-indigo-400 mb-1 z-10'><Moon size={18} /> <span className='text-xs font-bold uppercase'>Evening Rakes</span></div>
          <div className='text-2xl font-black text-white z-10'>{totalEvening} <span className='text-sm text-slate-500'>/ {filteredTrainIds.length}</span></div>
        </div>
        <div className='bg-slate-950 border border-slate-800 rounded-xl p-4 flex flex-col items-center justify-center relative overflow-hidden'>
          <div className='absolute inset-0 bg-emerald-500/5'></div>
          <div className='flex items-center gap-2 text-emerald-400 mb-1 z-10'><Activity size={18} /> <span className='text-xs font-bold uppercase'>Active Sets</span></div>
          <div className='text-2xl font-black text-white z-10'>{activeTrains}</div>
        </div>
        <div className='bg-slate-950 border border-slate-800 rounded-xl p-4 flex flex-col items-center justify-center relative overflow-hidden'>
          <div className='absolute inset-0 bg-rose-500/5'></div>
          <div className='flex items-center gap-2 text-rose-400 mb-1 z-10'><Activity size={18} /> <span className='text-xs font-bold uppercase'>In Maintenance</span></div>
          <div className='text-2xl font-black text-white z-10'>{maintenanceTrains}</div>
        </div>
      </div>

      <div className='flex flex-wrap items-center justify-between gap-4 p-4 bg-slate-950/50 rounded-xl border border-slate-800'>
        <div className='flex items-center gap-3'>
          <span className='text-slate-400 text-sm font-semibold tracking-wider'>Add Custom Train ID:</span>
          <input placeholder='e.g., 299' className='bg-slate-900 border border-slate-700 p-2 rounded-lg text-sm text-slate-200 w-32 focus:border-emerald-500 focus:outline-none' value={customTid} onChange={e => setCustomTid(e.target.value)} />
          <button onClick={handleAddCustom} className='bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg px-3 py-2 font-bold text-sm text-slate-300 transition-colors flex items-center gap-2'>
            <Plus size={16}/> ADD
          </button>
        </div>

        <div className='flex items-center gap-3'>
          {hasUnsavedChanges && (
            <button 
              onClick={() => {
                if (window.confirm("Discard all unsaved changes?")) syncFromDB();
              }}
              className='text-slate-400 hover:text-rose-400 text-sm font-semibold transition-colors flex items-center gap-1 px-3 py-2 rounded-lg hover:bg-rose-500/10'
            >
              <XCircle size={16} /> Discard
            </button>
          )}
          <button 
            onClick={handleSubmit} 
            disabled={!hasUnsavedChanges || isSaving}
            className={`rounded-lg px-6 py-2 font-bold text-sm text-white transition-all flex items-center gap-2 shadow-lg ${
              hasUnsavedChanges 
                ? 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-900/40 hover:scale-105 cursor-pointer' 
                : 'bg-emerald-900/50 text-emerald-700 cursor-not-allowed shadow-none'
            }`}
          >
            <Save size={16} /> {isSaving ? 'SAVING...' : 'SUBMIT REGISTRY'}
          </button>
        </div>
      </div>

      <div className='overflow-x-auto max-h-[600px] overflow-y-auto border border-slate-800 rounded-xl shadow-inner'>
        <table className='w-full text-sm text-slate-300 text-center relative'>
          <thead className='text-slate-400 uppercase text-xs bg-slate-950 sticky top-0 z-10 shadow-sm'>
            <tr>
              <th className='p-4 border-b border-slate-800 font-bold text-emerald-400 w-24'>Train ID</th>
              <th className='p-4 border-b border-slate-800 w-40'>Train Set</th>
              <th className='p-4 border-b border-slate-800 w-32'>Status</th>
              <th className='p-4 border-b border-slate-800 bg-amber-950/20 w-32'>
                <div className='flex flex-col items-center gap-2'>
                  <span className='flex items-center gap-1'><Sun size={14} className='text-amber-500'/> Morning</span>
                  <label className='flex items-center gap-2 cursor-pointer text-[10px] text-amber-500 normal-case bg-amber-900/30 px-3 py-1 rounded-full transition-colors hover:bg-amber-900/50' htmlFor="trainrakeregistry-l1">
                    <input type="checkbox" className="accent-amber-500 h-3 w-3 cursor-pointer" checked={isAllMorning} onChange={e => handleBulkToggle('morningRake', e.target.checked)} />
                    Select All
                  </label>
                </div>
              </th>
              <th className='p-4 border-b border-slate-800 bg-indigo-950/20 w-32'>
                <div className='flex flex-col items-center gap-2'>
                  <span className='flex items-center gap-1'><Moon size={14} className='text-indigo-400'/> Evening</span>
                  <label className='flex items-center gap-2 cursor-pointer text-[10px] text-indigo-400 normal-case bg-indigo-900/30 px-3 py-1 rounded-full transition-colors hover:bg-indigo-900/50' htmlFor="trainrakeregistry-l2">
                    <input type="checkbox" className="accent-indigo-500 h-3 w-3 cursor-pointer" checked={isAllEvening} onChange={e => handleBulkToggle('eveningRake', e.target.checked)} />
                    Select All
                  </label>
                </div>
              </th>
            </tr>
          </thead>
          <tbody className='divide-y divide-slate-800/50'>
            {filteredTrainIds.length === 0 ? (
              <tr>
                <td colSpan="5" className="p-8 text-center text-slate-500">No trains match your search.</td>
              </tr>
            ) : filteredTrainIds.map(tid => {
              const lText = localData[tid] || { trainSet: '', status: 'Active', morningRake: false, eveningRake: false };
              const currentStatus = lText.status;
              
              return (
                <tr key={tid} className='hover:bg-slate-800/30 transition-colors bg-slate-900'>
                  <td className='p-3 font-black text-emerald-400 text-lg bg-slate-950/30 border-r border-slate-800/30'>{tid}</td>
                  <td className='p-3'>
                      <input id="trainrakeregistry-i3" name="trainrakeregistry-i3" 
                        className='bg-slate-950 border border-slate-700 p-2 rounded-lg text-sm w-full text-center focus:border-emerald-500 focus:outline-none text-white font-bold placeholder:text-slate-600 transition-colors' 
                        placeholder='Set (e.g. TS01)'
                        value={lText.trainSet} 
                        onChange={(e) => handleChange(tid, 'trainSet', e.target.value)}
                      />
                  </td>
                  <td className='p-3'>
                    <select id="trainrakeregistry-i4" name="trainrakeregistry-i4"
                      className={`bg-slate-950 border p-2 rounded-lg text-sm w-full focus:outline-none transition-colors font-semibold ${
                        currentStatus === 'Maintenance' 
                          ? 'border-rose-500/50 text-rose-400 focus:border-rose-500' 
                          : currentStatus === 'Spare'
                            ? 'border-amber-500/50 text-amber-400 focus:border-amber-500'
                            : 'border-slate-700 text-emerald-400 focus:border-emerald-500'
                      }`}
                      value={currentStatus}
                      onChange={(e) => handleChange(tid, 'status', e.target.value)}
                    >
                      <option value="Active">Active</option>
                      <option value="Maintenance">Maintenance</option>
                      <option value="Spare">Spare</option>
                    </select>
                  </td>
                  <td className='p-3 bg-amber-950/5'>
                    <input id="trainrakeregistry-i5" name="trainrakeregistry-i5" 
                      type="checkbox" 
                      className="h-5 w-5 accent-amber-500 cursor-pointer hover:scale-110 transition-transform" 
                      checked={!!lText.morningRake} 
                      onChange={(e) => handleChange(tid, 'morningRake', e.target.checked)} 
                    />
                  </td>
                  <td className='p-3 bg-indigo-950/5'>
                    <input id="trainrakeregistry-i6" name="trainrakeregistry-i6" 
                      type="checkbox" 
                      className="h-5 w-5 accent-indigo-500 cursor-pointer hover:scale-110 transition-transform" 
                      checked={!!lText.eveningRake} 
                      onChange={(e) => handleChange(tid, 'eveningRake', e.target.checked)} 
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}