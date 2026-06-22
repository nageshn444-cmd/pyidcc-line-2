import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase';
import { collection, query, onSnapshot, addDoc, deleteDoc, doc } from 'firebase/firestore';
import { ShieldAlert, Plus, Trash2, CalendarDays, AlertTriangle, CheckCircle, Bell } from 'lucide-react';
import { BMRCL_CREW_REGISTRY } from '../data/bmrclCrewRegistry';

const getToday = () => new Date().toISOString().slice(0, 10);

export default function CompetencyExpiryDate() {
  const [records, setRecords] = useState([]);
  const [newEntry, setNewEntry] = useState({
    empId: '',
    empName: '',
    competencyType: '',
    expiryDate: getToday()
  });

  const autoAlerts = useMemo(() => {
    const today = new Date(getToday());
    const alerts = [];
    BMRCL_CREW_REGISTRY.forEach(member => {
      if (member.competencyExpiry) {
        const exp = new Date(member.competencyExpiry);
        const diffDays = Math.ceil((exp - today) / (1000 * 60 * 60 * 24));
        if (diffDays <= 15 && diffDays >= 0) {
          let priority = 'Normal';
          let colorClass = 'text-yellow-400 bg-yellow-950/40 border-yellow-500/30';
          if (diffDays <= 3) {
            priority = 'High';
            colorClass = 'text-rose-400 bg-rose-950/40 border-rose-500/30';
          } else if (diffDays <= 7) {
            priority = 'Medium';
            colorClass = 'text-orange-400 bg-orange-950/40 border-orange-500/30';
          }
          alerts.push({ ...member, diffDays, priority, colorClass });
        } else if (diffDays < 0) {
          alerts.push({ ...member, diffDays, priority: 'Critical', colorClass: 'text-red-500 bg-red-950/60 border-red-500/50' });
        }
      }
    });
    return alerts.sort((a, b) => a.diffDays - b.diffDays);
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'competency_records'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setRecords(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsubscribe();
  }, []);

  const handleAdd = async () => {
    if (!newEntry.empId || !newEntry.empName || !newEntry.competencyType) {
      return alert("Please fill in all fields (Emp ID, Name, Competency Type).");
    }
    await addDoc(collection(db, 'competency_records'), newEntry);
    setNewEntry({ ...newEntry, empId: '', empName: '', competencyType: '' });
  };

  const handleDelete = async (id) => {
    if(window.confirm("Delete this competency record?")) {
      await deleteDoc(doc(db, 'competency_records', id));
    }
  };

  const getStatus = (expiryDate) => {
    const today = new Date(getToday());
    const exp = new Date(expiryDate);
    const diffTime = exp - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return { label: 'EXPIRED', color: 'text-rose-500', bg: 'bg-rose-950/40', icon: <AlertTriangle size={14} /> };
    if (diffDays <= 30) return { label: `${diffDays} DAYS LEFT`, color: 'text-amber-400', bg: 'bg-amber-950/40', icon: <AlertTriangle size={14} /> };
    return { label: 'VALID', color: 'text-emerald-400', bg: 'bg-emerald-950/40', icon: <CheckCircle size={14} /> };
  };

  return (
    <div className='bg-slate-900 p-6 rounded-xl border border-slate-800 shadow-xl max-w-[100vw] font-mono'>
      <h2 className='text-amber-400 font-bold mb-6 flex items-center gap-2 text-lg'><ShieldAlert /> Competency Expiry Tracking</h2>
      
      {autoAlerts.length > 0 && (
        <div className="mb-6 p-4 rounded-lg border border-slate-800 bg-slate-950/50 shadow-inner">
          <h3 className="text-sm font-bold text-slate-200 mb-4 flex items-center gap-2 uppercase tracking-widest"><Bell className="text-amber-500 animate-pulse" size={16}/> Auto Alerts: Crew Competency Timeline</h3>
          <div className="flex flex-col gap-3">
            {autoAlerts.map(alert => (
              <div key={alert.id} className={`flex flex-col sm:flex-row justify-between sm:items-center p-3 rounded-lg border ${alert.colorClass}`}>
                <div className="flex items-center gap-3 mb-2 sm:mb-0">
                  <AlertTriangle size={16} />
                  <span><strong>{alert.name}</strong> (ID: {alert.id}) - <span className="text-[11px] opacity-80">{alert.designation}</span></span>
                </div>
                <div className="flex items-center gap-4 text-xs font-bold uppercase tracking-wider">
                  <span>Priority: {alert.priority}</span>
                  <span className="bg-black/30 px-3 py-1.5 rounded">{alert.diffDays < 0 ? 'EXPIRED' : `${alert.diffDays} DAYS LEFT`}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className='grid grid-cols-1 md:grid-cols-5 gap-3 mb-6 p-4 bg-slate-950/50 rounded-lg border border-slate-800'>
        <input placeholder='Emp ID (e.g. 21430)' className='bg-slate-900 border border-slate-700 p-2 rounded text-xs text-slate-200 focus:border-amber-500 focus:outline-none' value={newEntry.empId} onChange={e => setNewEntry({...newEntry, empId: e.target.value})} />
        <input placeholder='Employee Name' className='bg-slate-900 border border-slate-700 p-2 rounded text-xs text-slate-200 focus:border-amber-500 focus:outline-none' value={newEntry.empName} onChange={e => setNewEntry({...newEntry, empName: e.target.value})} />
        <select className='bg-slate-900 border border-slate-700 p-2 rounded text-xs text-slate-200 focus:border-amber-500 focus:outline-none' value={newEntry.competencyType} onChange={e => setNewEntry({...newEntry, competencyType: e.target.value})}>
          <option value="" disabled>Select Competency Type</option>
          <option value="Route Competency">Route Competency</option>
          <option value="Rolling Stock (RS)">Rolling Stock (RS)</option>
          <option value="Periodic Medical">Periodic Medical</option>
          <option value="Refresher Training">Refresher Training</option>
          <option value="Safety Certification">Safety Certification</option>
        </select>
        <input type='date' className='bg-slate-900 border border-slate-700 p-2 rounded text-xs text-slate-200 focus:border-amber-500 focus:outline-none' value={newEntry.expiryDate} onChange={e => setNewEntry({...newEntry, expiryDate: e.target.value})} />
        
        <button onClick={handleAdd} className='bg-amber-600 hover:bg-amber-500 transition-colors rounded flex items-center justify-center gap-2 font-bold text-xs text-slate-900 shadow-md py-2 md:py-0'>
          <Plus size={16}/> ADD RECORD
        </button>
      </div>

      <div className='overflow-x-auto w-full rounded-lg border border-slate-800 shadow-inner'>
        <table className='w-full text-left border-collapse text-xs'>
          <thead>
            <tr className='bg-slate-950/80 border-b border-slate-800 text-slate-400 uppercase tracking-wider'>
              <th className='p-3 w-24'>Emp ID</th><th className='p-3'>Employee Name</th><th className='p-3'>Competency Type</th><th className='p-3 w-32'>Expiry Date</th><th className='p-3 w-36 text-center'>Status</th><th className='p-3 w-16 text-center'>Action</th>
            </tr>
          </thead>
          <tbody className='divide-y divide-slate-800/50 text-slate-300'>
            {records.sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate)).map(record => {
              const status = getStatus(record.expiryDate);
              return (
                <tr key={record.id} className='hover:bg-slate-800/30 transition-colors'>
                  <td className='p-3 font-bold text-cyan-400'>{record.empId}</td><td className='p-3 font-semibold text-slate-200'>{record.empName}</td><td className='p-3 text-slate-300'>{record.competencyType}</td><td className='p-3 font-mono text-slate-400 flex items-center gap-1.5'><CalendarDays size={14}/> {record.expiryDate}</td>
                  <td className='p-3 text-center'><span className={`px-2 py-1 rounded flex items-center justify-center gap-1.5 font-bold text-[10px] ${status.bg} ${status.color}`}>{status.icon} {status.label}</span></td>
                  <td className='p-3 text-center'><button onClick={() => handleDelete(record.id)} className='text-rose-400 hover:text-rose-300 p-1.5 hover:bg-rose-400/10 rounded transition-colors'><Trash2 size={16}/></button></td>
                </tr>
              );
            })}
            {records.length === 0 && (<tr><td colSpan="6" className="text-center py-8 text-slate-500 italic">No competency records found. Add one above.</td></tr>)}
          </tbody>
        </table>
      </div>
    </div>
  );
}