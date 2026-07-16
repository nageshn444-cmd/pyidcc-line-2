import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, addDoc, updateDoc, deleteDoc, doc, query, orderBy, onSnapshot } from 'firebase/firestore';
import { BMRCL_CREW_REGISTRY } from '../data/bmrclCrewRegistry';
import { useAuth } from '../context/AuthContext';
import { AlertTriangle, Plus, Edit2, Trash2, X, Save, Clock, Train } from 'lucide-react';

const TRAIN_IDS = Array.from({ length: 50 }, (_, i) => String(201 + i));
const REASONS = [
  "Crew Unavailability",
  "Late Arrival",
  "Signal Fluctuation",
  "Rolling Stock Defect",
  "Administrative",
  "Emergency",
  "OTHER"
];


export default function ManualOverrideForm() {
  const { currentUser, userProfile } = useAuth();
  const isTrainOperator = userProfile?.role === 'TRAIN_OPERATOR' || userProfile?.role === 'STATION_CONTROLLER' || userProfile?.role === 'VIEWER';
  const [overrides, setOverrides] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  
  // Filter states
  const [filterTrain, setFilterTrain] = useState('');
  const [filterOp, setFilterOp] = useState('');
  const [filterDate, setFilterDate] = useState(new Date().toISOString().split('T')[0]);
  const [filterReason, setFilterReason] = useState('');

  // Form states
  const [formData, setFormData] = useState({
    trainId: '',
    fromTime: '',
    toTime: '',
    operatorId: '',
    reason: '',
    otherReason: '',
    remarks: '',
    date: new Date().toISOString().split('T')[0],
    stationName: '',
    direction: '',
    boardingLocation: '',
    deboardingLocation: ''
  });

  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    const q = query(collection(db, 'manual_overrides'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setOverrides(data);
    }, (err) => {
      console.error("Error fetching overrides:", err);
    });

    return () => unsubscribe();
  }, []);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const checkOverlap = (newForm) => {
    const newStart = newForm.fromTime;
    const newEnd = newForm.toTime;
    
    return overrides.some(ov => {
      if (ov.id === editingId) return false;
      if (ov.date !== newForm.date || ov.trainId !== newForm.trainId) return false;
      return newStart < ov.toTime && newEnd > ov.fromTime;
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isTrainOperator) return;
    setErrorMsg('');
    setSuccessMsg('');

    if (!formData.trainId || !formData.fromTime || !formData.toTime || !formData.operatorId || !formData.reason || !formData.stationName || !formData.direction || !formData.boardingLocation || !formData.deboardingLocation) {
      setErrorMsg('Please fill all mandatory fields.');
      return;
    }
    
    if (formData.fromTime >= formData.toTime) {
      setErrorMsg('To Time must be after From Time.');
      return;
    }

    if (formData.reason === 'OTHER' && !formData.otherReason.trim()) {
      setErrorMsg('Please specify the other reason.');
      return;
    }

    if (checkOverlap(formData)) {
      setErrorMsg('Overlap detected! Another override exists for this Train and Time range.');
      return;
    }

    const opProfile = BMRCL_CREW_REGISTRY.find(emp => emp.id === formData.operatorId);
    
    const payload = {
      ...formData,
      operatorName: opProfile?.name || 'Unknown',
      createdBy: currentUser?.email || 'System',
      updatedAt: new Date().toISOString()
    };

    try {
      if (editingId) {
        await updateDoc(doc(db, 'manual_overrides', editingId), payload);
        setSuccessMsg('Override updated successfully.');
      } else {
        payload.createdAt = new Date().toISOString();
        await addDoc(collection(db, 'manual_overrides'), payload);
        setSuccessMsg('Override added successfully.');
      }
      setTimeout(() => {
        setShowForm(false);
        setEditingId(null);
        resetForm();
        setSuccessMsg('');
      }, 1500);
    } catch (err) {
      console.error('Save error:', err);
      setErrorMsg('Failed to save override.');
    }
  };

  const resetForm = () => {
    setFormData({
      trainId: '',
      fromTime: '',
      toTime: '',
      operatorId: '',
      reason: '',
      otherReason: '',
      remarks: '',
      date: new Date().toISOString().split('T')[0],
      stationName: '',
      direction: '',
      boardingLocation: '',
      deboardingLocation: ''
    });
    setErrorMsg('');
  };

  const handleEdit = (ov) => {
    setFormData({
      trainId: ov.trainId,
      fromTime: ov.fromTime,
      toTime: ov.toTime,
      operatorId: ov.operatorId,
      reason: ov.reason,
      otherReason: ov.otherReason || '',
      remarks: ov.remarks || '',
      date: ov.date,
      stationName: ov.stationName || '',
      direction: ov.direction || '',
      boardingLocation: ov.boardingLocation || '',
      deboardingLocation: ov.deboardingLocation || ''
    });
    setEditingId(ov.id);
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (isTrainOperator) return;
    if (!window.confirm('Are you sure you want to delete this override?')) return;
    try {
      await deleteDoc(doc(db, 'manual_overrides', id));
    } catch (err) {
      console.error('Delete error:', err);
    }
  };

  const filteredOverrides = overrides.filter(ov => {
    if (filterTrain && ov.trainId !== filterTrain) return false;
    if (filterOp && !ov.operatorName.toLowerCase().includes(filterOp.toLowerCase()) && !ov.operatorId.includes(filterOp)) return false;
    if (filterDate && ov.date !== filterDate) return false;
    if (filterReason && ov.reason !== filterReason) return false;
    return true;
  });

  return (
    <div className="w-full text-slate-200 text-sm flex flex-col max-h-[700px]">
      
      {!showForm ? (
        <div className="flex flex-col h-full space-y-4">
          <div className="flex justify-between items-center gap-2 flex-wrap">
            <h4 className="text-amber-400 font-bold text-xs uppercase tracking-widest flex items-center gap-2">
              <Train className="w-4 h-4" /> Override Registry
            </h4>
            {!isTrainOperator && (
              <button 
                onClick={() => { resetForm(); setShowForm(true); }}
                className="bg-amber-600 hover:bg-amber-500 text-slate-950 px-3 py-1.5 rounded text-xs font-bold flex items-center gap-1 transition-colors"
              >
                <Plus className="w-3 h-3" /> NEW OVERRIDE
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2 bg-slate-900/50 p-2 rounded border border-slate-800 text-xs">
            <input 
              type="date" 
              value={filterDate} 
              onChange={e => setFilterDate(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded p-1.5 text-slate-300 focus:border-amber-500 outline-none"
            />
            <select 
              value={filterTrain} 
              onChange={e => setFilterTrain(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded p-1.5 text-slate-300 focus:border-amber-500 outline-none"
            >
              <option value="">All Trains</option>
              {TRAIN_IDS.map(id => <option key={id} value={id}>Train {id}</option>)}
            </select>
            <input 
              type="text" 
              placeholder="Operator ID/Name" 
              value={filterOp} 
              onChange={e => setFilterOp(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded p-1.5 text-slate-300 focus:border-amber-500 outline-none"
            />
            <select 
              value={filterReason} 
              onChange={e => setFilterReason(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded p-1.5 text-slate-300 focus:border-amber-500 outline-none"
            >
              <option value="">All Reasons</option>
              {REASONS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>

          <div className="flex-1 overflow-auto border border-slate-800 rounded">
            <table className="w-full text-left border-collapse text-[10px] md:text-xs">
              <thead className="bg-slate-900 sticky top-0 z-10">
                <tr>
                  <th className="p-2 border-b border-slate-700 text-amber-500 font-bold uppercase">Train</th>
                  <th className="p-2 border-b border-slate-700 text-amber-500 font-bold uppercase">Location</th>
                  <th className="p-2 border-b border-slate-700 text-amber-500 font-bold uppercase">Time</th>
                  <th className="p-2 border-b border-slate-700 text-amber-500 font-bold uppercase">Operator</th>
                  <th className="p-2 border-b border-slate-700 text-amber-500 font-bold uppercase">Reason</th>
                  {!isTrainOperator && <th className="p-2 border-b border-slate-700 text-amber-500 font-bold uppercase text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {filteredOverrides.length === 0 ? (
                  <tr>
                    <td colSpan={isTrainOperator ? "5" : "6"} className="p-4 text-center text-slate-500 italic">No overrides found for selected filters.</td>
                  </tr>
                ) : (
                  filteredOverrides.map(ov => (
                    <tr key={ov.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="p-2 font-bold text-slate-300">
                        {ov.trainId}
                        <div className="text-[9px] text-slate-500">{ov.direction}</div>
                      </td>
                      <td className="p-2">
                        <div className="font-bold text-slate-300 uppercase">{ov.stationName}</div>
                        <div className="text-[9px] text-slate-500 uppercase">{ov.boardingLocation} → {ov.deboardingLocation}</div>
                      </td>
                      <td className="p-2 whitespace-nowrap text-slate-400">
                        {ov.fromTime} - {ov.toTime}
                      </td>
                      <td className="p-2">
                        <div className="font-bold">{ov.operatorName}</div>
                        <div className="text-[9px] text-slate-500">{ov.operatorId}</div>
                      </td>
                      <td className="p-2">
                        <span className="px-1.5 py-0.5 bg-amber-500/10 text-amber-400 rounded border border-amber-500/20 text-[9px] font-bold">
                          {ov.reason === 'OTHER' ? ov.otherReason : ov.reason}
                        </span>
                      </td>
                      {!isTrainOperator && (
                        <td className="p-2 text-right whitespace-nowrap">
                          <button onClick={() => handleEdit(ov)} className="p-1 text-blue-400 hover:bg-blue-400/10 rounded mr-1" title="Edit">
                            <Edit2 className="w-3 h-3" />
                          </button>
                          <button onClick={() => handleDelete(ov.id)} className="p-1 text-red-400 hover:bg-red-400/10 rounded" title="Delete">
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col h-full space-y-3 bg-slate-900/40 p-3 rounded-lg border border-amber-500/20">
          <div className="flex justify-between items-center border-b border-slate-700 pb-2">
            <h4 className="text-amber-400 font-bold text-xs uppercase tracking-widest flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              {editingId ? 'Edit Override' : 'New Manual Override'}
            </h4>
            <button type="button" onClick={() => setShowForm(false)} className="text-slate-400 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>

          {errorMsg && <div className="p-2 bg-red-500/10 border border-red-500/30 text-red-400 text-xs rounded font-bold">{errorMsg}</div>}
          {successMsg && <div className="p-2 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs rounded font-bold">{successMsg}</div>}

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-[10px] text-slate-400 uppercase tracking-wider mb-1">Date</label>
              <input 
                type="date" 
                name="date"
                value={formData.date}
                onChange={handleInputChange}
                required
                className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-xs focus:border-amber-500 outline-none"
              />
            </div>
            
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-[10px] text-slate-400 uppercase tracking-wider mb-1">Train ID</label>
              <select 
                name="trainId"
                value={formData.trainId}
                onChange={handleInputChange}
                required
                className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-xs focus:border-amber-500 outline-none"
              >
                <option value="">-- Select Train --</option>
                {TRAIN_IDS.map(id => <option key={id} value={id}>{id}</option>)}
              </select>
            </div>

            <div className="col-span-1">
              <label className="block text-[10px] text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1"><Clock className="w-3 h-3"/> From Time</label>
              <input 
                type="time"
                name="fromTime"
                value={formData.fromTime}
                onChange={handleInputChange}
                required
                className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-xs text-slate-200 focus:border-amber-500 outline-none"
              />
            </div>

            <div className="col-span-1">
              <label className="block text-[10px] text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1"><Clock className="w-3 h-3"/> To Time</label>
              <input 
                type="time"
                name="toTime"
                value={formData.toTime}
                onChange={handleInputChange}
                required
                className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-xs text-slate-200 focus:border-amber-500 outline-none"
              />
            </div>

            <div className="col-span-2">
              <label className="block text-[10px] text-slate-400 uppercase tracking-wider mb-1">Train Operator</label>
              <select 
                name="operatorId"
                value={formData.operatorId}
                onChange={handleInputChange}
                required
                className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-xs focus:border-amber-500 outline-none"
              >
                <option value="">-- Select Operator --</option>
                {BMRCL_CREW_REGISTRY.map(emp => (
                  <option key={emp.id} value={emp.id}>{emp.name} ({emp.id})</option>
                ))}
              </select>
            </div>

            <div className="col-span-1">
              <label className="block text-[10px] text-slate-400 uppercase tracking-wider mb-1">Station Name</label>
              <input 
                type="text" 
                name="stationName"
                value={formData.stationName}
                onChange={handleInputChange}
                required
                className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-xs focus:border-amber-500 outline-none uppercase"
                placeholder="e.g. BYPH"
              />
            </div>

            <div className="col-span-1">
              <label className="block text-[10px] text-slate-400 uppercase tracking-wider mb-1">Direction</label>
              <select 
                name="direction"
                value={formData.direction}
                onChange={handleInputChange}
                required
                className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-xs focus:border-amber-500 outline-none"
              >
                <option value="">-- Select --</option>
                <option value="UP">UP</option>
                <option value="DN">DN</option>
              </select>
            </div>

            <div className="col-span-1">
              <label className="block text-[10px] text-slate-400 uppercase tracking-wider mb-1">Boarding Loc</label>
              <input 
                type="text" 
                name="boardingLocation"
                value={formData.boardingLocation}
                onChange={handleInputChange}
                required
                className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-xs focus:border-amber-500 outline-none uppercase"
                placeholder="e.g. PLATFORM 1"
              />
            </div>

            <div className="col-span-1">
              <label className="block text-[10px] text-slate-400 uppercase tracking-wider mb-1">Deboard Loc</label>
              <input 
                type="text" 
                name="deboardingLocation"
                value={formData.deboardingLocation}
                onChange={handleInputChange}
                required
                className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-xs focus:border-amber-500 outline-none uppercase"
                placeholder="e.g. PLATFORM 2"
              />
            </div>

            <div className="col-span-2">
              <label className="block text-[10px] text-slate-400 uppercase tracking-wider mb-1">Override Reason</label>
              <select 
                name="reason"
                value={formData.reason}
                onChange={handleInputChange}
                required
                className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-xs focus:border-amber-500 outline-none"
              >
                <option value="">-- Select Reason --</option>
                {REASONS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>

            {formData.reason === 'OTHER' && (
              <div className="col-span-2">
                <label className="block text-[10px] text-slate-400 uppercase tracking-wider mb-1">Specify Other Reason</label>
                <input 
                  type="text" 
                  name="otherReason"
                  value={formData.otherReason}
                  onChange={handleInputChange}
                  required={formData.reason === 'OTHER'}
                  className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-xs focus:border-amber-500 outline-none"
                  placeholder="Enter reason..."
                />
              </div>
            )}

            <div className="col-span-2">
              <label className="block text-[10px] text-slate-400 uppercase tracking-wider mb-1">Remarks</label>
              <textarea 
                name="remarks"
                value={formData.remarks}
                onChange={handleInputChange}
                rows="2"
                className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-xs focus:border-amber-500 outline-none resize-none"
                placeholder="Optional remarks..."
              ></textarea>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 mt-auto">
            <button 
              type="button" 
              onClick={() => setShowForm(false)} 
              className="px-3 py-2 text-slate-400 hover:bg-slate-800 rounded text-xs font-bold transition-colors"
            >
              CANCEL
            </button>
            <button 
              type="submit" 
              className="flex items-center gap-1 bg-amber-600 hover:bg-amber-500 text-slate-950 px-4 py-2 rounded text-xs font-black tracking-widest transition-colors shadow-lg shadow-amber-900/20"
            >
              <Save className="w-3 h-3" /> {editingId ? 'UPDATE OVERRIDE' : 'COMMIT OVERRIDE'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
