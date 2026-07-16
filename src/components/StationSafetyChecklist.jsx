import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, onSnapshot, setDoc, doc, serverTimestamp } from 'firebase/firestore';
import { ShieldCheck, AlertCircle } from 'lucide-react';

export default function StationSafetyChecklist() {
  const [report, setReport] = useState({ fireSafety: false, cctv: false, platformEdge: false });
  const [history, setHistory] = useState([]);

  useEffect(() => {
    return onSnapshot(collection(db, 'daily_safety_checklists'), (snap) => {
      setHistory(snap.docs.map(d => ({id: d.id, ...d.data()})));
    });
  }, []);

  const submitChecklist = async () => {
    try {
      const id = new Date().toISOString().split('T')[0];
      await setDoc(doc(db, 'daily_safety_checklists', id), { ...report, timestamp: serverTimestamp() });
      alert("Safety Checklist Logged!");
    } catch (e) { alert("Access Denied: " + e.message); }
  };

  return (
    <div className='bg-slate-900 p-6 rounded-xl border border-slate-800'>
      <h2 className='text-emerald-400 font-bold mb-6 flex items-center gap-2'><ShieldCheck /> Daily Station Safety</h2>
      <div className='space-y-4 mb-6'>
        {['fireSafety', 'cctv', 'platformEdge'].map(item => (
          <label key={item} className='flex items-center gap-3 text-slate-300' htmlFor="stationsafetycheckli-l1">
            <input type="checkbox" className='w-4 h-4' checked={report[item]} onChange={e => setReport({...report, [item]: e.target.checked})} />
            {item.toUpperCase()} Verified
          </label>
        ))}
        <button onClick={submitChecklist} className='bg-emerald-600 text-white p-2 rounded w-full font-bold'>SUBMIT DAILY COMPLIANCE</button>
      </div>
    </div>
  );
}