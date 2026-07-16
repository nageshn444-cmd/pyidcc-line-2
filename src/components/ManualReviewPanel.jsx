import React from 'react';
import { db } from '../firebase';
import { doc, setDoc, deleteDoc } from 'firebase/firestore';
import { AlertTriangle, Calendar, Award, UserCheck, Trash2 } from 'lucide-react';

export default function ManualReviewPanel({ pendingItems = [] }) {
  const handleFix = async (item, correctCategory) => {
    try {
      // 1. Move to correct collection
      await setDoc(doc(db, correctCategory, item.id), {
        ...item,
        status: 'MANUALLY_RESOLVED',
        resolvedAt: new Date().toISOString()
      });
      // 2. Remove from manual review
      await deleteDoc(doc(db, 'manual_review_roster', item.id));
    } catch (err) {
      console.error(`Failed to resolve manual review item ${item.id}:`, err);
      alert(`Failed to resolve item: ${err.message}`);
    }
  };

  const handleDelete = async (item) => {
    try {
      if (confirm('Are you sure you want to dismiss and delete this review item?')) {
        await deleteDoc(doc(db, 'manual_review_roster', item.id));
      }
    } catch (err) {
      console.error(`Failed to delete manual review item ${item.id}:`, err);
    }
  };

  if (!pendingItems || pendingItems.length === 0) return null;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-2xl">
      <div className="px-5 py-4 bg-slate-950 border-b border-slate-800 flex justify-between items-center text-rose-400 font-mono text-sm font-bold tracking-wide">
        <span className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-rose-500 animate-pulse" />
          MANUAL CORRECTION REQUIRED ({pendingItems.length})
        </span>
        <span className="bg-rose-500/10 text-rose-400 text-[10px] px-2.5 py-1 rounded-full border border-rose-500/20 font-mono uppercase">
          Requires Review
        </span>
      </div>

      <div className="p-5 space-y-4 max-h-[400px] overflow-y-auto">
        {pendingItems.map(item => (
          <div 
            key={item.id} 
            className="flex flex-col md:flex-row md:items-center justify-between p-3.5 bg-slate-950/40 border border-slate-800/80 rounded-lg hover:border-slate-700 transition-colors gap-3"
          >
            <div className="space-y-1 font-mono">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-200 uppercase">Operator ID:</span>
                <span className="text-xs font-black text-rose-400">{item.empId || 'Unknown'}</span>
              </div>
              <div className="flex items-center gap-2 text-[10px] text-slate-400">
                <span>Roster Value:</span>
                <span className="bg-slate-800 px-1.5 py-0.5 rounded text-amber-400 font-bold">{item.dutyType || 'None'}</span>
                <span className="text-slate-600">|</span>
                <span>Date:</span>
                <span>{item.date ? new Date(item.date).toLocaleDateString() : 'N/A'}</span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button 
                onClick={() => handleFix(item, 'leave_requests')}
                className="bg-sky-500/10 text-sky-400 hover:bg-sky-500/20 border border-sky-500/20 text-[10px] font-bold py-1.5 px-3 rounded-lg transition-colors flex items-center gap-1 font-mono uppercase"
              >
                <Calendar size={12} /> Leave
              </button>
              
              <button 
                onClick={() => handleFix(item, 'weekly_off_planner')}
                className="bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 border border-indigo-500/20 text-[10px] font-bold py-1.5 px-3 rounded-lg transition-colors flex items-center gap-1 font-mono uppercase"
              >
                <UserCheck size={12} /> WO
              </button>

              <button 
                onClick={() => handleFix(item, 'extra_duty_roster')}
                className="bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/20 text-[10px] font-bold py-1.5 px-3 rounded-lg transition-colors flex items-center gap-1 font-mono uppercase"
              >
                <Award size={12} /> Extra Duty
              </button>

              <button 
                onClick={() => handleDelete(item)}
                className="bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 border border-rose-500/20 text-[10px] font-bold py-1.5 px-2 rounded-lg transition-colors flex items-center justify-center font-mono"
                title="Dismiss and delete review item"
              >
                <Trash2 size={12} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
