import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, addDoc, query, orderBy, getDocs, serverTimestamp } from 'firebase/firestore';
import { MessageSquare, Send, RefreshCcw, AlertTriangle, AlertCircle, FileText, UserCheck, Repeat } from 'lucide-react';

export default function ShiftHandoverNotes() {
  const [notes, setNotes] = useState([]);
  const [formData, setFormData] = useState({
    generalNotes: '',
    dutySwap: '',
    trainIdSwap: '',
    incidentDetails: '',
    eventDetails: '',
    dutyRequest: '',
    exchangeRequest: ''
  });

  const fetchNotes = async () => {
    const q = query(collection(db, 'shift_handover_notes'), orderBy('timestamp', 'desc'));
    const snapshot = await getDocs(q);
    setNotes(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
  };

  const handleInputChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const addNote = async () => {
    // Check if at least one field is filled
    if (!Object.values(formData).some(val => val.trim() !== '')) return;
    
    await addDoc(collection(db, 'shift_handover_notes'), {
      ...formData,
      author: 'Superintendent',
      timestamp: serverTimestamp()
    });
    
    setFormData({
      generalNotes: '',
      dutySwap: '',
      trainIdSwap: '',
      incidentDetails: '',
      eventDetails: '',
      dutyRequest: '',
      exchangeRequest: ''
    });
    fetchNotes();
  };

  useEffect(() => { fetchNotes(); }, []);

  return (
    <div className='bg-slate-900 p-6 rounded-xl border border-slate-800 shadow-xl max-w-[100vw] font-mono'>
      <h2 className='text-emerald-400 font-bold mb-6 flex items-center gap-2 text-lg'><MessageSquare /> Comprehensive Shift Handover Log</h2>
      
      {/* Handover Form */}
      <div className='bg-slate-950 p-4 rounded-lg border border-slate-800 mb-6 space-y-4 shadow-inner'>
        <h3 className='text-slate-300 font-bold border-b border-slate-800 pb-2 mb-2'>Log New Handover Details</h3>
        
        <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
          <div className='space-y-1'>
            <label className='text-xs text-amber-400 font-semibold flex items-center gap-1'><RefreshCcw size={12}/> Train Operator Duty Swap</label>
            <input name="dutySwap" value={formData.dutySwap} onChange={handleInputChange} className='w-full bg-slate-900 border border-slate-700 rounded p-2 text-xs text-slate-200 focus:border-amber-500 focus:outline-none transition-colors' placeholder='e.g. D-201 swapped with D-205' />
          </div>
          
          <div className='space-y-1'>
            <label className='text-xs text-cyan-400 font-semibold flex items-center gap-1'><Repeat size={12}/> Train ID Swap</label>
            <input name="trainIdSwap" value={formData.trainIdSwap} onChange={handleInputChange} className='w-full bg-slate-900 border border-slate-700 rounded p-2 text-xs text-slate-200 focus:border-cyan-500 focus:outline-none transition-colors' placeholder='e.g. T-12 swapped with T-18' />
          </div>

          <div className='space-y-1'>
            <label className='text-xs text-rose-400 font-semibold flex items-center gap-1'><AlertTriangle size={12}/> Incident Details</label>
            <textarea name="incidentDetails" value={formData.incidentDetails} onChange={handleInputChange} className='w-full bg-slate-900 border border-slate-700 rounded p-2 text-xs text-slate-200 focus:border-rose-500 focus:outline-none transition-colors h-16 resize-y' placeholder='Describe any incidents...' />
          </div>

          <div className='space-y-1'>
            <label className='text-xs text-orange-400 font-semibold flex items-center gap-1'><AlertCircle size={12}/> Event Details</label>
            <textarea name="eventDetails" value={formData.eventDetails} onChange={handleInputChange} className='w-full bg-slate-900 border border-slate-700 rounded p-2 text-xs text-slate-200 focus:border-orange-500 focus:outline-none transition-colors h-16 resize-y' placeholder='Describe significant events...' />
          </div>

          <div className='space-y-1'>
            <label className='text-xs text-blue-400 font-semibold flex items-center gap-1'><UserCheck size={12}/> Train Operator Duty Request</label>
            <input name="dutyRequest" value={formData.dutyRequest} onChange={handleInputChange} className='w-full bg-slate-900 border border-slate-700 rounded p-2 text-xs text-slate-200 focus:border-blue-500 focus:outline-none transition-colors' placeholder='e.g. Leave requested by Emp 21430' />
          </div>

          <div className='space-y-1'>
            <label className='text-xs text-purple-400 font-semibold flex items-center gap-1'><FileText size={12}/> Shift Exchange Request</label>
            <input name="exchangeRequest" value={formData.exchangeRequest} onChange={handleInputChange} className='w-full bg-slate-900 border border-slate-700 rounded p-2 text-xs text-slate-200 focus:border-purple-500 focus:outline-none transition-colors' placeholder='e.g. Shift exchange for tomorrow' />
          </div>
        </div>

        <div className='space-y-1 pt-2'>
          <label className='text-xs text-slate-300 font-semibold'>General Notes / Remarks</label>
          <textarea name="generalNotes" value={formData.generalNotes} onChange={handleInputChange} className='w-full bg-slate-900 border border-slate-700 rounded p-2 text-xs text-slate-200 focus:border-emerald-500 focus:outline-none transition-colors h-16 resize-y' placeholder='Any additional handover notes...' />
        </div>

        <div className='flex justify-end pt-2'>
          <button onClick={addNote} className='bg-emerald-600 hover:bg-emerald-500 transition-colors px-6 py-2 rounded text-white font-bold flex items-center gap-2 text-sm shadow-md'>
             SUBMIT HANDOVER <Send size={16}/>
          </button>
        </div>
      </div>

      {/* Handover History Log */}
      <h3 className='text-slate-300 font-bold border-b border-slate-800 pb-2 mb-4'>Recent Handover Records</h3>
      <div className='space-y-3 max-h-[500px] overflow-y-auto pr-2'>
        {notes.length === 0 && <p className='text-slate-500 text-sm italic'>No handover notes logged yet.</p>}
        {notes.map(note => (
          <div key={note.id} className='bg-slate-950 border border-slate-800 p-4 rounded-lg text-xs space-y-2 shadow-sm'>
            <div className='flex justify-between items-center border-b border-slate-800 pb-2 mb-2'>
              <span className='text-emerald-400 font-bold uppercase tracking-wider'>{note.author || 'Superintendent'}</span>
              <span className='text-[10px] text-slate-500 font-semibold'>{note.timestamp?.toDate().toLocaleString()}</span>
            </div>
            
            <div className='grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-2'>
              {note.dutySwap && <div><span className='text-amber-400 font-semibold'>Duty Swap:</span> <span className='text-slate-300 ml-1'>{note.dutySwap}</span></div>}
              {note.trainIdSwap && <div><span className='text-cyan-400 font-semibold'>Train ID Swap:</span> <span className='text-slate-300 ml-1'>{note.trainIdSwap}</span></div>}
              {note.dutyRequest && <div><span className='text-blue-400 font-semibold'>Duty Request:</span> <span className='text-slate-300 ml-1'>{note.dutyRequest}</span></div>}
              {note.exchangeRequest && <div><span className='text-purple-400 font-semibold'>Shift Exchange:</span> <span className='text-slate-300 ml-1'>{note.exchangeRequest}</span></div>}
              
              {note.incidentDetails && <div className='md:col-span-2'><span className='text-rose-400 font-semibold'>Incidents:</span> <p className='text-slate-300 bg-slate-900/50 p-2 border border-slate-800 rounded mt-1'>{note.incidentDetails}</p></div>}
              {note.eventDetails && <div className='md:col-span-2'><span className='text-orange-400 font-semibold'>Events:</span> <p className='text-slate-300 bg-slate-900/50 p-2 border border-slate-800 rounded mt-1'>{note.eventDetails}</p></div>}
              {note.generalNotes && <div className='md:col-span-2'><span className='text-slate-400 font-semibold'>General Notes:</span> <p className='text-slate-300 bg-slate-900/50 p-2 border border-slate-800 rounded mt-1'>{note.generalNotes}</p></div>}
              {note.content && <div className='md:col-span-2'><span className='text-slate-400 font-semibold'>Legacy Note:</span> <p className='text-slate-300 bg-slate-900/50 p-2 border border-slate-800 rounded mt-1'>{note.content}</p></div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
