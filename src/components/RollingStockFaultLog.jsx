import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, addDoc, query, onSnapshot, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { Wrench, AlertOctagon, CheckCircle } from 'lucide-react';

export default function RollingStockFaultLog() {
  const [faults, setFaults] = useState([]);
  const [newFault, setNewFault] = useState({ trainId: '', description: '', severity: 'MINOR' });

  useEffect(() => {
    const q = query(collection(db, 'rolling_stock_faults'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setFaults(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsubscribe();
  }, []);

  const addFault = async () => {
    if (!newFault.trainId) return;
    await addDoc(collection(db, 'rolling_stock_faults'), {
      ...newFault,
      status: 'OPEN',
      timestamp: serverTimestamp()
    });
    setNewFault({ trainId: '', description: '', severity: 'MINOR' });
  };

  const resolveFault = async (id) => {
    await updateDoc(doc(db, 'rolling_stock_faults', id), { status: 'RESOLVED' });
  };

  return (
    <div className='bg-slate-900 p-6 rounded-xl border border-slate-800 shadow-xl'>
      <h2 className='text-rose-400 font-bold mb-4 flex items-center gap-2'><Wrench /> Rolling Stock Defect Log</h2>
      <div className='grid grid-cols-1 md:grid-cols-3 gap-2 mb-4'>
        <input className='bg-slate-950 border border-slate-700 rounded p-2 text-sm text-slate-200' placeholder='Train ID' value={newFault.trainId} onChange={(e) => setNewFault({...newFault, trainId: e.target.value})} />
        <input className='bg-slate-950 border border-slate-700 rounded p-2 text-sm text-slate-200' placeholder='Description' value={newFault.description} onChange={(e) => setNewFault({...newFault, description: e.target.value})} />
        <button onClick={addFault} className='bg-rose-600 hover:bg-rose-500 text-white font-bold rounded text-sm'>LOG FAULT</button>
      </div>
      <div className='space-y-2'>
        {faults.map(f => (
          <div key={f.id} className='bg-slate-800 p-3 rounded flex justify-between items-center text-sm'>
            <div>
              <span className='font-bold text-rose-400'>{f.trainId}</span>: {f.description}
            </div>
            {f.status === 'OPEN' && (
              <button onClick={() => resolveFault(f.id)} className='text-emerald-500 flex items-center gap-1'><CheckCircle size={16}/> Resolve</button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}