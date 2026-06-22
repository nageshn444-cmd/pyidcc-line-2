import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase';
import { collection, query, onSnapshot, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { GraduationCap, Plus, Trash2, Search, AlertCircle, CheckCircle, Clock } from 'lucide-react';

export default function TrainingCertificationTracker() {
  const [trainings, setTrainings] = useState([]);
  const [newTraining, setNewTraining] = useState({ staffName: '', certName: '', status: 'Pending', expiryDate: '' });
  const [searchQuery, setSearchQuery] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: 'staffName', direction: 'asc' });
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const q = query(collection(db, 'staff_training'));
    return onSnapshot(q, (snapshot) => {
      setTrainings(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
  }, []);

  const addTraining = async () => {
    if (!newTraining.staffName || !newTraining.certName) return alert("Please fill staff name and certification details");
    setIsSubmitting(true);
    try {
      await addDoc(collection(db, 'staff_training'), newTraining);
      setNewTraining({ staffName: '', certName: '', status: 'Pending', expiryDate: '' });
    } catch (e) { 
      alert("Save Failed: " + e.message); 
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleStatus = async (id, currentStatus) => {
    const newStatus = currentStatus === 'Certified' ? 'Pending' : 'Certified';
    await updateDoc(doc(db, 'staff_training', id), { status: newStatus });
  };

  const deleteTraining = async (id) => {
    if (window.confirm('Are you sure you want to remove this certification record?')) {
      await deleteDoc(doc(db, 'staff_training', id));
    }
  };

  const handleSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const getExpiryStatus = (expiryDate) => {
    if (!expiryDate) return { text: 'N/A', color: 'text-slate-500', icon: null };
    const today = new Date();
    const expiry = new Date(expiryDate);
    const diffTime = expiry - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return { text: 'Expired', color: 'text-red-400 bg-red-900/30', icon: <AlertCircle size={14} className="text-red-400" /> };
    if (diffDays <= 30) return { text: `Expiring in ${diffDays}d`, color: 'text-amber-400 bg-amber-900/30', icon: <Clock size={14} className="text-amber-400" /> };
    return { text: 'Valid', color: 'text-emerald-400', icon: <CheckCircle size={14} className="text-emerald-400" /> };
  };

  const processedTrainings = useMemo(() => {
    let filtered = trainings;
    if (searchQuery) {
      filtered = trainings.filter(t => 
        t.staffName?.toLowerCase().includes(searchQuery.toLowerCase()) || 
        t.certName?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    return filtered.sort((a, b) => {
      const aVal = a[sortConfig.key] || '';
      const bVal = b[sortConfig.key] || '';
      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [trainings, searchQuery, sortConfig]);

  return (
    <div className='bg-slate-900 p-6 rounded-xl border border-slate-800 shadow-xl flex flex-col gap-6'>
      <div className='flex flex-col md:flex-row justify-between items-start md:items-center gap-4'>
        <h2 className='text-purple-400 font-bold flex items-center gap-2 text-xl'>
          <GraduationCap size={24} /> Staff Certification Tracker
        </h2>
        <div className='relative w-full md:w-64'>
          <Search className='absolute left-3 top-1/2 -translate-y-1/2 text-slate-500' size={16} />
          <input 
            className='w-full bg-slate-950 border border-slate-700 rounded-lg py-2 pl-10 pr-4 text-sm text-slate-200 focus:outline-none focus:border-purple-500 transition-colors' 
            placeholder='Search staff or cert...' 
            value={searchQuery} 
            onChange={(e) => setSearchQuery(e.target.value)} 
          />
        </div>
      </div>

      <div className='bg-slate-950/50 p-4 rounded-xl border border-slate-800/50'>
        <div className='grid grid-cols-1 md:grid-cols-5 gap-3'>
          <input className='col-span-1 md:col-span-1 bg-slate-900 border border-slate-700 p-2 rounded-lg text-sm focus:border-purple-500 focus:outline-none text-white' placeholder='Staff Name *' value={newTraining.staffName} onChange={e => setNewTraining({...newTraining, staffName: e.target.value})} />
          <input className='col-span-1 md:col-span-2 bg-slate-900 border border-slate-700 p-2 rounded-lg text-sm focus:border-purple-500 focus:outline-none text-white' placeholder='Certification Name *' value={newTraining.certName} onChange={e => setNewTraining({...newTraining, certName: e.target.value})} />
          <div className='col-span-1 flex items-center gap-2'>
            <span className='text-xs text-slate-400 uppercase font-semibold'>Expires:</span>
            <input type="date" className='w-full bg-slate-900 border border-slate-700 p-2 rounded-lg text-sm focus:border-purple-500 focus:outline-none text-slate-200' value={newTraining.expiryDate} onChange={e => setNewTraining({...newTraining, expiryDate: e.target.value})} />
          </div>
          <button 
            onClick={addTraining} 
            disabled={isSubmitting || !newTraining.staffName || !newTraining.certName}
            className='col-span-1 bg-purple-600 hover:bg-purple-500 disabled:bg-purple-800 disabled:text-purple-400 text-white font-bold rounded-lg text-sm flex items-center justify-center gap-2 py-2 transition-colors'
          >
            <Plus size={16}/> {isSubmitting ? 'ADDING...' : 'ADD RECORD'}
          </button>
        </div>
      </div>

      <div className='overflow-x-auto rounded-lg border border-slate-800 shadow-inner'>
        <table className='w-full text-left text-slate-300 text-sm'>
          <thead className='text-slate-400 uppercase text-xs bg-slate-950 sticky top-0'>
            <tr>
              <th className='p-3 cursor-pointer hover:text-purple-400 transition-colors' onClick={() => handleSort('staffName')}>
                Staff Name {sortConfig.key === 'staffName' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
              </th>
              <th className='p-3 cursor-pointer hover:text-purple-400 transition-colors' onClick={() => handleSort('certName')}>
                Certification {sortConfig.key === 'certName' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
              </th>
              <th className='p-3 cursor-pointer hover:text-purple-400 transition-colors' onClick={() => handleSort('status')}>
                Status {sortConfig.key === 'status' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
              </th>
              <th className='p-3 cursor-pointer hover:text-purple-400 transition-colors' onClick={() => handleSort('expiryDate')}>
                Expiry Date {sortConfig.key === 'expiryDate' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
              </th>
              <th className='p-3 text-right'>Actions</th>
            </tr>
          </thead>
          <tbody className='divide-y divide-slate-800/50'>
            {processedTrainings.length === 0 ? (
              <tr>
                <td colSpan="5" className="p-8 text-center text-slate-500">
                  {searchQuery ? "No records found matching search." : "No certification records added yet."}
                </td>
              </tr>
            ) : processedTrainings.map(t => {
              const expiryStatus = getExpiryStatus(t.expiryDate);
              return (
                <tr key={t.id} className='hover:bg-slate-800/30 transition-colors bg-slate-900'>
                  <td className='p-3 text-white font-bold'>{t.staffName}</td>
                  <td className='p-3 font-medium text-slate-300'>{t.certName}</td>
                  <td className='p-3'>
                    <button 
                      onClick={() => toggleStatus(t.id, t.status)}
                      className={`px-3 py-1 text-xs font-bold rounded-full transition-all hover:scale-105 shadow-sm ${
                        t.status === 'Certified' 
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                          : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                      }`}
                    >
                      {t.status}
                    </button>
                  </td>
                  <td className='p-3'>
                    {t.expiryDate ? (
                      <div className='flex flex-col gap-1'>
                        <span>{new Date(t.expiryDate).toLocaleDateString()}</span>
                        <span className={`text-[10px] flex items-center gap-1 font-semibold px-2 py-0.5 rounded-full w-fit ${expiryStatus.color}`}>
                          {expiryStatus.icon} {expiryStatus.text}
                        </span>
                      </div>
                    ) : <span className='text-slate-600'>-</span>}
                  </td>
                  <td className='p-3 text-right'>
                    <button 
                      onClick={() => deleteTraining(t.id)} 
                      className='text-slate-500 hover:text-red-400 p-2 hover:bg-slate-800 rounded-lg transition-colors'
                      title='Delete Record'
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}