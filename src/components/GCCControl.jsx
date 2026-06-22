import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { doc, setDoc, onSnapshot } from 'firebase/firestore';
import { Settings, Power, PowerOff, Save } from 'lucide-react';

export default function GCCControl() {
  const [config, setConfig] = useState({
    isOpen: false,
    startDate: '',
    endDate: '',
    targetMonth: ''
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // Real-time listener to keep the UI in sync with the database
    const docRef = doc(db, 'system_config', 'leave_window');
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        setConfig(docSnap.data());
      }
    }, (err) => console.error("Sync Error:", err));
    
    return () => unsubscribe();
  }, []);

  // Universal save function (uses merge: true to avoid overwriting unrelated fields)
  const saveConfig = async (updatedFields) => {
    setSaving(true);
    try {
      const docRef = doc(db, 'system_config', 'leave_window');
      await setDoc(docRef, { 
        ...config, 
        ...updatedFields, 
        updatedAt: new Date().toISOString() 
      }, { merge: true });
      alert('Configuration updated successfully.');
    } catch (err) {
      console.error(err);
      alert('Permission Denied: Ensure you have Admin rights.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl mb-6 font-mono">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-6 border-b border-slate-800 pb-4 gap-4">
        <h3 className="text-cyan-400 font-bold flex items-center gap-2 text-lg uppercase tracking-wider">
          <Settings className="h-5 w-5" /> GCC Leave Window Controller
        </h3>
        <div className={`px-3 py-1.5 rounded-full text-[10px] font-black tracking-widest flex items-center gap-2 ${config.isOpen ? 'bg-emerald-950/50 text-emerald-400 border border-emerald-500/30' : 'bg-rose-950/50 text-rose-400 border border-rose-500/30'}`}>
          <span className={`h-2 w-2 rounded-full ${config.isOpen ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`}></span>
          {config.isOpen ? 'SYSTEM BROADCAST: WINDOW ACTIVE' : 'SYSTEM BROADCAST: WINDOW CLOSED'}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
        <div>
          <label className="block text-xs font-bold text-slate-400 mb-1 uppercase tracking-wider">Target Month</label>
          <input type="month" value={config.targetMonth || ''} onChange={(e) => setConfig({...config, targetMonth: e.target.value})} className="w-full bg-slate-950 border border-slate-700 rounded p-2.5 text-sm text-slate-200 focus:outline-none focus:border-cyan-500" />
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-400 mb-1 uppercase tracking-wider">Start Date</label>
          <input type="date" value={config.startDate || ''} onChange={(e) => setConfig({...config, startDate: e.target.value})} className="w-full bg-slate-950 border border-slate-700 rounded p-2.5 text-sm text-slate-200 focus:outline-none focus:border-cyan-500" />
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-400 mb-1 uppercase tracking-wider">End Date</label>
          <input type="date" value={config.endDate || ''} onChange={(e) => setConfig({...config, endDate: e.target.value})} className="w-full bg-slate-950 border border-slate-700 rounded p-2.5 text-sm text-slate-200 focus:outline-none focus:border-cyan-500" />
        </div>
        
        <div className="flex gap-2">
          <button 
            onClick={() => saveConfig({ isOpen: true })} 
            disabled={saving}
            className="flex-1 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-black px-4 py-2.5 rounded transition-colors uppercase text-[10px] tracking-widest flex items-center justify-center gap-1.5 shadow-md disabled:opacity-50"
          >
            {saving ? 'SAVING...' : <><Power className="h-4 w-4" /> ACTIVATE</>}
          </button>
          
          <button 
            onClick={() => saveConfig({ isOpen: false })} 
            disabled={saving || !config.isOpen}
            className="flex-1 bg-rose-950 border border-rose-900 hover:bg-rose-900 text-rose-400 font-black px-4 py-2.5 rounded transition-colors uppercase text-[10px] tracking-widest flex items-center justify-center gap-1.5 shadow-md disabled:opacity-50"
          >
            <PowerOff className="h-4 w-4" /> SUSPEND
          </button>
        </div>
      </div>
      
      <div className="mt-4 pt-4 border-t border-slate-800 text-[10px] text-slate-600 uppercase tracking-widest flex justify-between">
        <span>Last Sync: {config.updatedAt || 'Never'}</span>
        <span>Status: {config.isOpen ? 'LIVE' : 'IDLE'}</span>
      </div>
    </div>
  );
}