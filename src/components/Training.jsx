import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase';
import { collection, query, onSnapshot, addDoc, deleteDoc, doc, orderBy } from 'firebase/firestore';
import { GraduationCap, Users, Clock, Trash2, Search, User } from 'lucide-react';
import { BMRCL_CREW_REGISTRY } from '../data/bmrclCrewRegistry';

export default function Training() {
  const [sessions, setSessions] = useState([]);
  const [newSession, setNewSession] = useState({ title: '', date: '', instructor: '', duration: '', maxAttendees: '', operatorId: '', operatorName: '' });
  const [searchQuery, setSearchQuery] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const q = query(collection(db, 'training_sessions'), orderBy('date', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setSessions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsubscribe();
  }, []);

  const addSession = async () => {
    if (!newSession.title || !newSession.date || !newSession.instructor) return;
    setIsSubmitting(true);
    try {
      await addDoc(collection(db, 'training_sessions'), newSession);
      setNewSession({ title: '', date: '', instructor: '', duration: '', maxAttendees: '', operatorId: '', operatorName: '' });
    } catch (error) {
      console.error("Error adding session:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const deleteSession = async (id) => {
    if (window.confirm('Are you sure you want to delete this session?')) {
      try {
        await deleteDoc(doc(db, 'training_sessions', id));
      } catch (error) {
        console.error("Error deleting session:", error);
      }
    }
  };

  const filteredSessions = useMemo(() => {
    if (!searchQuery) return sessions;
    return sessions.filter(s => 
      s.title?.toLowerCase().includes(searchQuery.toLowerCase()) || 
      s.instructor?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.operatorName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.operatorId?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [sessions, searchQuery]);

  return (
    <div className='bg-slate-900 p-6 rounded-xl border border-slate-800 shadow-xl flex flex-col gap-6'>
      <div className='flex flex-col md:flex-row justify-between items-start md:items-center gap-4'>
        <h2 className='text-cyan-400 font-bold flex items-center gap-2 text-xl'>
          <GraduationCap size={24} /> Competency & Training Schedule
        </h2>
        <div className='relative w-full md:w-64'>
          <Search className='absolute left-3 top-1/2 -translate-y-1/2 text-slate-500' size={16} />
          <input 
            className='w-full bg-slate-950 border border-slate-700 rounded-lg py-2 pl-10 pr-4 text-sm text-slate-200 focus:outline-none focus:border-cyan-500 transition-colors' 
            placeholder='Search sessions or operator...' 
            value={searchQuery} 
            onChange={(e) => setSearchQuery(e.target.value)} 
          />
        </div>
      </div>

      <div className='bg-slate-950/50 p-4 rounded-xl border border-slate-800/50'>
        <h3 className='text-slate-400 text-sm font-semibold mb-3 uppercase tracking-wider'>Schedule New Session</h3>
        <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3'>
          <input className='lg:col-span-2 bg-slate-900 border border-slate-700 rounded-lg p-2 text-sm text-slate-200 focus:border-cyan-500 focus:outline-none transition-colors' placeholder='Session Title *' value={newSession.title} onChange={(e) => setNewSession({...newSession, title: e.target.value})} />
          
          <select 
            className='lg:col-span-2 bg-slate-900 border border-slate-700 rounded-lg p-2 text-sm text-slate-200 focus:border-cyan-500 focus:outline-none transition-colors'
            value={newSession.operatorId}
            onChange={(e) => {
              const op = BMRCL_CREW_REGISTRY.find(crew => crew.id === e.target.value);
              setNewSession({...newSession, operatorId: e.target.value, operatorName: op ? op.name : ''});
            }}
          >
            <option value="">Select Train Operator (Optional)...</option>
            {BMRCL_CREW_REGISTRY.map(crew => (
              <option key={crew.id} value={crew.id}>{crew.name} ({crew.id})</option>
            ))}
          </select>

          <input type="date" className='bg-slate-900 border border-slate-700 rounded-lg p-2 text-sm text-slate-200 focus:border-cyan-500 focus:outline-none transition-colors' value={newSession.date} onChange={(e) => setNewSession({...newSession, date: e.target.value})} />
          <input className='bg-slate-900 border border-slate-700 rounded-lg p-2 text-sm text-slate-200 focus:border-cyan-500 focus:outline-none transition-colors' placeholder='Instructor *' value={newSession.instructor} onChange={(e) => setNewSession({...newSession, instructor: e.target.value})} />
          <input className='bg-slate-900 border border-slate-700 rounded-lg p-2 text-sm text-slate-200 focus:border-cyan-500 focus:outline-none transition-colors' placeholder='Duration (e.g. 2h)' value={newSession.duration} onChange={(e) => setNewSession({...newSession, duration: e.target.value})} />
          <input type="number" className='bg-slate-900 border border-slate-700 rounded-lg p-2 text-sm text-slate-200 focus:border-cyan-500 focus:outline-none transition-colors' placeholder='Max Attendees' value={newSession.maxAttendees} onChange={(e) => setNewSession({...newSession, maxAttendees: e.target.value})} />
        </div>
        <div className='mt-4 flex justify-end'>
          <button 
            onClick={addSession} 
            disabled={!newSession.title || !newSession.date || !newSession.instructor || isSubmitting}
            className='bg-cyan-600 hover:bg-cyan-500 disabled:bg-cyan-800 disabled:text-cyan-400 disabled:cursor-not-allowed text-white font-bold py-2 px-6 rounded-lg transition-all shadow-lg hover:shadow-cyan-900/50'
          >
            {isSubmitting ? 'SCHEDULING...' : 'SCHEDULE SESSION'}
          </button>
        </div>
      </div>

      <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4'>
        {filteredSessions.length === 0 ? (
          <div className="col-span-full flex justify-center py-8 text-slate-500">
            {searchQuery ? "No sessions match your search." : "No training sessions scheduled."}
          </div>
        ) : filteredSessions.map(s => (
          <div key={s.id} className='group bg-slate-800 p-5 rounded-xl border border-slate-700 hover:border-cyan-500/50 transition-all hover:shadow-lg hover:shadow-cyan-900/20 relative'>
            <button 
              onClick={() => deleteSession(s.id)}
              className='absolute top-3 right-3 text-slate-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity'
              title='Delete Session'
            >
              <Trash2 size={16} />
            </button>
            <div className='font-bold text-slate-100 text-lg mb-3 pr-6'>{s.title}</div>
            <div className='space-y-2'>
              {s.operatorName && (
                <div className='flex items-center gap-2 text-sm text-slate-400 mb-2 border-b border-slate-700/50 pb-2'>
                  <div className='bg-slate-900 p-1.5 rounded-md'><User size={14} className="text-emerald-400" /></div>
                  <div className='flex flex-col'>
                    <span className='text-xs text-slate-500'>Target Operator</span>
                    <span className='font-semibold text-emerald-400'>{s.operatorName} <span className='text-xs opacity-70'>({s.operatorId})</span></span>
                  </div>
                </div>
              )}
              <div className='flex items-center gap-2 text-sm text-slate-400'>
                <div className='bg-slate-900 p-1.5 rounded-md'><GraduationCap size={14} className="text-cyan-400" /></div>
                <span className='font-medium text-slate-300'>Date: {new Date(s.date).toLocaleDateString()}</span>
              </div>
              <div className='flex items-center gap-2 text-sm text-slate-400'>
                <div className='bg-slate-900 p-1.5 rounded-md'><Users size={14} className="text-purple-400" /></div>
                <span>Inst: <span className='text-slate-300'>{s.instructor}</span></span>
                {s.maxAttendees && <span className='ml-auto text-xs bg-slate-900 px-2 py-1 rounded-full'>Max {s.maxAttendees}</span>}
              </div>
              {s.duration && (
                <div className='flex items-center gap-2 text-sm text-slate-400'>
                  <div className='bg-slate-900 p-1.5 rounded-md'><Clock size={14} className="text-amber-400" /></div>
                  <span>Duration: <span className='text-slate-300'>{s.duration}</span></span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}