import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, onSnapshot, addDoc, serverTimestamp } from 'firebase/firestore';
import { ShieldAlert, Plus, ShieldCheck } from 'lucide-react';

export default function Safety() {
  const [incidents, setIncidents] = useState([]);
  const [newIncident, setNewIncident] = useState({ description: '', location: '' });

  useEffect(() => {
    const q = query(collection(db, 'safety_incidents'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setIncidents(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsubscribe();
  }, []);

  const addIncident = async () => {
    if (!newIncident.description) return;
    await addDoc(collection(db, 'safety_incidents'), {
      ...newIncident,
      status: 'REPORTED',
      timestamp: serverTimestamp()
    });
    setNewIncident({ description: '', location: '' });
  };

  return (
    <div className='bg-slate-900 p-6 rounded-xl border border-slate-800 shadow-xl'>
      <h2 className='text-rose-500 font-bold mb-4 flex items-center gap-2'><ShieldAlert /> Safety Incidents & Audits</h2>
      <div className='grid grid-cols-1 md:grid-cols-3 gap-2 mb-4'>
        <input className='bg-slate-950 border border-slate-700 rounded p-2 text-sm text-slate-200' placeholder='Location (e.g. PYID)' value={newIncident.location} onChange={(e) => setNewIncident({...newIncident, location: e.target.value})} />
        <input className='bg-slate-950 border border-slate-700 rounded p-2 text-sm text-slate-200' placeholder='Incident Description' value={newIncident.description} onChange={(e) => setNewIncident({...newIncident, description: e.target.value})} />
        <button onClick={addIncident} className='bg-rose-600 hover:bg-rose-500 text-white font-bold rounded flex items-center justify-center gap-2'><Plus size={16}/> REPORT</button>
      </div>
      <div className='space-y-2'>
        {incidents.map(inc => (
          <div key={inc.id} className='bg-slate-800 p-3 rounded flex justify-between items-center text-sm'>
            <div><span className='font-bold text-amber-400'>{inc.location}</span>: {inc.description}</div>
            <span className='text-xs bg-slate-900 px-2 py-1 rounded'>{inc.status}</span>
          </div>
        ))}
        {incidents.length === 0 && <div className="text-slate-500 text-sm flex items-center gap-2"><ShieldCheck size={16} /> No recent safety incidents reported.</div>}
      </div>
    </div>
  );
}