import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, onSnapshot, updateDoc, doc, addDoc, serverTimestamp, orderBy, deleteDoc } from 'firebase/firestore';
import { Package, Plus, Clock, Edit2, Save, X, Trash2, ArrowRightCircle } from 'lucide-react';

export default function AssetReconciliation() {
  const [assets, setAssets] = useState([]);
  const [logs, setLogs] = useState([]);
  const [newItem, setNewItem] = useState({ name: '', total: 0 });
  const [issueQty, setIssueQty] = useState({});
  
  // Edit State
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ name: '', total: 0 });

  useEffect(() => {
    const unsubAssets = onSnapshot(collection(db, 'station_assets'), (snapshot) => {
      setAssets(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const qLogs = query(collection(db, 'asset_transactions'), orderBy('timestamp', 'desc'));
    const unsubLogs = onSnapshot(qLogs, (snapshot) => {
      setLogs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    return () => { unsubAssets(); unsubLogs(); };
  }, []);

  const addAsset = async () => {
    if (!newItem.name) return;
    await addDoc(collection(db, 'station_assets'), { name: newItem.name, total: parseInt(newItem.total), issued: 0 });
    setNewItem({ name: '', total: 0 });
  };

  const saveEdit = async (id) => {
    await updateDoc(doc(db, 'station_assets', id), {
      name: editForm.name,
      total: parseInt(editForm.total)
    });
    setEditingId(null);
  };

  const deleteAsset = async (id) => {
    if(window.confirm("Delete this asset permanently?")) await deleteDoc(doc(db, 'station_assets', id));
  };

  const issueAsset = async (asset) => {
    const qty = parseInt(issueQty[asset.id] || 0);
    if (qty <= 0) return;
    await updateDoc(doc(db, 'station_assets', asset.id), { issued: (asset.issued || 0) + qty });
    await addDoc(collection(db, 'asset_transactions'), { assetName: asset.name, quantity: qty, timestamp: serverTimestamp() });
    setIssueQty(prev => ({ ...prev, [asset.id]: 0 }));
  };

  return (
    <div className='space-y-6 max-w-[100vw] font-mono'>
      {/* Header & Add Form */}
      <div className='bg-slate-900 p-6 rounded-xl border border-slate-800 shadow-xl'>
        <div className='flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6'>
          <h2 className='text-emerald-400 font-bold flex items-center gap-2 text-lg'><Package /> Asset Inventory Control</h2>
          <div className='flex flex-wrap gap-2 bg-slate-950 p-2 rounded-lg border border-slate-800'>
            <input placeholder='New Item Name' className='bg-slate-900 border border-slate-700 p-2 rounded text-xs text-slate-200 focus:outline-none focus:border-emerald-500 w-full md:w-48 transition-colors' value={newItem.name} onChange={e => setNewItem({...newItem, name: e.target.value})} />
            <input type="number" placeholder='Initial Qty' className='bg-slate-900 border border-slate-700 p-2 rounded text-xs w-full md:w-24 text-slate-200 focus:outline-none focus:border-emerald-500 transition-colors' value={newItem.total} onChange={e => setNewItem({...newItem, total: e.target.value})} />
            <button onClick={addAsset} className='bg-emerald-600 hover:bg-emerald-500 transition-colors px-4 py-2 rounded text-white font-bold flex items-center justify-center gap-1 text-xs w-full md:w-auto shadow-md'><Plus size={14}/> ADD</button>
          </div>
        </div>

        <div className='overflow-x-auto w-full rounded-lg border border-slate-800 shadow-inner'>
          <table className='w-full text-left border-collapse text-xs'>
            <thead>
              <tr className='bg-slate-950/80 border-b border-slate-800 text-slate-400 uppercase tracking-wider'>
                <th className='p-3 w-1/3'>Item Name</th>
                <th className='p-3 w-24 text-center'>Total</th>
                <th className='p-3 w-24 text-center'>Issued</th>
                <th className='p-3 w-24 text-center'>Stock</th>
                <th className='p-3 text-center'>Action: Issue</th>
                <th className='p-3 w-24 text-center'>Controls</th>
              </tr>
            </thead>
            <tbody className='divide-y divide-slate-800/50 text-slate-300'>
              {assets.map(asset => (
                <tr key={asset.id} className='hover:bg-slate-800/30 transition-colors'>
                  <td className='p-3'>
                    {editingId === asset.id ? (
                      <input className='bg-slate-950 border border-emerald-500/50 text-emerald-400 px-2 py-1.5 rounded w-full focus:outline-none focus:border-emerald-400 font-semibold' value={editForm.name} onChange={e => setEditForm({...editForm, name: e.target.value})} autoFocus />
                    ) : (
                      <span className='font-bold text-slate-200 text-sm'>{asset.name}</span>
                    )}
                  </td>
                  <td className='p-3 text-center'>
                    {editingId === asset.id ? (
                      <input type="number" className='bg-slate-950 border border-emerald-500/50 text-emerald-400 px-2 py-1.5 rounded w-16 text-center focus:outline-none focus:border-emerald-400 font-semibold' value={editForm.total} onChange={e => setEditForm({...editForm, total: e.target.value})} />
                    ) : (
                      <span className='text-slate-300'>{asset.total}</span>
                    )}
                  </td>
                  <td className='p-3 text-center text-amber-400 font-semibold'>{asset.issued}</td>
                  <td className='p-3 text-center'>
                    <span className={`font-bold px-2 py-1 rounded ${asset.total - asset.issued <= 0 ? 'bg-rose-950/40 text-rose-400 border border-rose-900/50' : 'bg-emerald-950/40 text-emerald-400 border border-emerald-900/50'}`}>
                      {asset.total - asset.issued}
                    </span>
                  </td>
                  <td className='p-3 text-center'>
                    <div className='flex items-center justify-center gap-2'>
                      <input type="number" min="1" max={asset.total - asset.issued} placeholder="Qty" className='bg-slate-950 border border-slate-700 w-16 p-1.5 rounded text-center focus:outline-none focus:border-blue-500 text-slate-200 transition-colors' value={issueQty[asset.id] || ''} onChange={(e) => setIssueQty({...issueQty, [asset.id]: e.target.value})} />
                      <button onClick={() => issueAsset(asset)} disabled={!issueQty[asset.id] || asset.total - asset.issued <= 0} className='bg-blue-600/20 text-blue-400 border border-blue-600/50 hover:bg-blue-600/40 disabled:opacity-50 disabled:cursor-not-allowed px-3 py-1.5 rounded font-bold text-[10px] uppercase flex items-center gap-1 transition-all'>ISSUE <ArrowRightCircle size={12}/></button>
                    </div>
                  </td>
                  <td className='p-3 text-center'>
                    <div className='flex items-center justify-center gap-3'>
                      {editingId === asset.id ? (
                        <>
                          <button onClick={() => saveEdit(asset.id)} className='text-emerald-400 hover:text-emerald-300 p-1.5 bg-emerald-400/10 hover:bg-emerald-400/20 rounded transition-colors' title="Save"><Save size={16}/></button>
                          <button onClick={() => setEditingId(null)} className='text-slate-400 hover:text-slate-300 p-1.5 bg-slate-800 hover:bg-slate-700 rounded transition-colors' title="Cancel"><X size={16}/></button>
                        </>
                      ) : (
                        <button onClick={() => {setEditingId(asset.id); setEditForm({name: asset.name, total: asset.total})}} className='text-cyan-400 hover:text-cyan-300 p-1.5 hover:bg-cyan-400/10 rounded transition-colors' title="Edit Asset"><Edit2 size={16}/></button>
                      )}
                      <button onClick={() => deleteAsset(asset.id)} className='text-rose-400 hover:text-rose-300 p-1.5 hover:bg-rose-400/10 rounded transition-colors' title="Delete Asset"><Trash2 size={16}/></button>
                    </div>
                  </td>
                </tr>
              ))}
              {assets.length === 0 && (
                <tr><td colSpan="6" className="text-center py-8 text-slate-500 italic">No assets tracked currently. Add items above.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Issue Transaction Logs View */}
      <div className='bg-slate-900 p-6 rounded-xl border border-slate-800 shadow-xl'>
        <h3 className='text-cyan-400 font-bold mb-4 flex items-center gap-2'><Clock size={18}/> Asset Transaction Logs</h3>
        <div className='max-h-64 overflow-y-auto space-y-2 pr-2 font-mono text-xs'>
          {logs.length === 0 && <p className='text-slate-500 italic'>No transactions recorded yet.</p>}
          {logs.map(log => (
            <div key={log.id} className='bg-slate-950 border border-slate-800 p-3 rounded-lg flex flex-col md:flex-row justify-between items-start md:items-center gap-2 hover:bg-slate-900 transition-colors shadow-sm'>
              <div className='flex items-center gap-3'>
                <span className='bg-blue-900/30 border border-blue-800/50 text-blue-400 px-2 py-1 rounded font-bold tracking-wider'>ISSUED: {log.quantity}</span>
                <span className='text-slate-300 font-semibold text-sm'>{log.assetName}</span>
              </div>
              <span className='text-slate-500 font-semibold'>{log.timestamp?.toDate().toLocaleString() || 'Just now'}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}