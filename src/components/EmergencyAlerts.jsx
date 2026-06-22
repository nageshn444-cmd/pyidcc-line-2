import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, addDoc, query, onSnapshot, orderBy, serverTimestamp } from 'firebase/firestore';
import { Bell, AlertTriangle } from 'lucide-react';

export default function EmergencyAlerts() {
  const [alerts, setAlerts] = useState([]);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    const q = query(collection(db, 'emergency_alerts'), orderBy('timestamp', 'desc'));
    return onSnapshot(q, (snap) => setAlerts(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
  }, []);

  const sendAlert = async () => {
    if (!msg) return;
    try {
      await addDoc(collection(db, 'emergency_alerts'), { content: msg, timestamp: serverTimestamp() });
      setMsg('');
    } catch (e) { alert("Broadcast Failed: " + e.message); }
  };

  return (
    <div className='bg-rose-950/20 p-6 rounded-xl border-2 border-rose-600'>
      <h2 className='text-rose-500 font-black mb-4 flex items-center gap-2'><AlertTriangle /> EMERGENCY BROADCAST</h2>
      <div className='flex gap-2 mb-6'>
        <input className='bg-slate-950 p-2 rounded w-full border border-rose-800' placeholder='Emergency Message...' value={msg} onChange={e => setMsg(e.target.value)} />
        <button onClick={sendAlert} className='bg-rose-600 px-4 rounded text-white font-bold'>SEND</button>
      </div>
      <div className='space-y-2'>
        {alerts.map(a => (
          <div key={a.id} className='bg-rose-900/30 p-2 rounded text-xs text-rose-200'>{a.content}</div>
        ))}
      </div>
    </div>
  );
}