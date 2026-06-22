import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, addDoc, query, orderBy, onSnapshot, updateDoc, doc, serverTimestamp, getDocs, where, setDoc, increment } from 'firebase/firestore';
import { Repeat, CheckCircle, Clock, ShieldCheck, UserCheck, CheckSquare, X, Check } from 'lucide-react';
import { BMRCL_CREW_REGISTRY } from '../data/bmrclCrewRegistry';

const STATUS_OPTIONS = [
  'PRESENT',
  'ABSENT (AB)',
  'LEAVE',
  'NOT REPORTING (NR)',
  'BMRTI',
  'CRT',
  'CL',
  'EL',
  'WO'
];

const DUTY_OPTIONS = [
  ...Array.from({ length: 100 }, (_, i) => (i + 1).toString()),
  '06:30 OR',
  '07:00 OR',
  '07:30 OR',
  '08:00 OR',
  '09:00 OR',
  '10:00 OR',
  '10:30 OR',
  '11:00 OR',
  '12:00 OR',
  '13:00 OR',
  '13:30 OR',
  '14:00 OR',
  '14:30 OR',
  'PUTH STBK 07:00',
  'PUTH STBK 14:00',
  'NGSA STBK 07:00',
  'NGSA STBK 14:00'
];

export default function ShiftExchange() {
  const [exchanges, setExchanges] = useState([]);
  const [formData, setFormData] = useState({
    exchangeDate: '',
    operator1Search: '',
    operator2Search: '',
    operator1Id: '',
    operator1Name: '',
    operator1Duty: '',
    operator1Status: 'PRESENT',
    operator2Id: '',
    operator2Name: '',
    operator2Duty: '',
    operator2Status: 'PRESENT'
  });

  useEffect(() => {
    const q = query(collection(db, 'shift_exchanges'), orderBy('timestamp', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setExchanges(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsubscribe();
  }, []);

  const handleInputChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmitRequest = async () => {
    if (!formData.exchangeDate || !formData.operator1Id || !formData.operator2Id) {
      alert("Please fill in at least the Date and Employee IDs for both operators.");
      return;
    }

    const exchangeRef = await addDoc(collection(db, 'shift_exchanges'), {
      ...formData,
      operator1Confirmed: true, // requester implicitly confirms
      operator2Confirmed: false,
      status: 'Awaiting Second Operator Confirmation',
      timestamp: serverTimestamp()
    });

    await addDoc(collection(db, 'auditLogs'), {
      action: "SHIFT_EXCHANGE_REQUESTED",
      exchangeId: exchangeRef.id,
      operator1Id: formData.operator1Id,
      operator2Id: formData.operator2Id,
      performedBy: formData.operator1Id,
      performedByName: formData.operator1Name,
      timestamp: serverTimestamp(),
      oldDuty: formData.operator1Duty,
      newDuty: formData.operator2Duty,
      details: `Shift exchange request created: Operator 1 (${formData.operator1Name}, Duty ${formData.operator1Duty}) and Operator 2 (${formData.operator2Name}, Duty ${formData.operator2Duty})`
    });

    setFormData({
      exchangeDate: '',
      operator1Search: '',
      operator2Search: '',
      operator1Id: '',
      operator1Name: '',
      operator1Duty: '',
      operator1Status: 'PRESENT',
      operator2Id: '',
      operator2Name: '',
      operator2Duty: '',
      operator2Status: 'PRESENT'
    });
  };

  const handleConfirm = async (id, operatorNum) => {
    const ex = exchanges.find(e => e.id === id);
    if (!ex) return;

    const field = operatorNum === 1 ? 'operator1Confirmed' : 'operator2Confirmed';
    const timeField = operatorNum === 1 ? 'operator1ConfirmedAt' : 'operator2ConfirmedAt';
    
    const isOtherConfirmed = operatorNum === 1 ? ex.operator2Confirmed : ex.operator1Confirmed;
    const newStatus = isOtherConfirmed ? 'Awaiting GCC Approval' : 'Awaiting Second Operator Confirmation';

    await updateDoc(doc(db, 'shift_exchanges', id), {
      [field]: true,
      [timeField]: serverTimestamp(),
      status: newStatus
    });

    await addDoc(collection(db, 'auditLogs'), {
      action: "SHIFT_EXCHANGE_CONFIRMED",
      exchangeId: id,
      operator1Id: ex.operator1Id,
      operator2Id: ex.operator2Id,
      performedBy: operatorNum === 1 ? ex.operator1Id : ex.operator2Id,
      performedByName: operatorNum === 1 ? ex.operator1Name : ex.operator2Name,
      timestamp: serverTimestamp(),
      oldDuty: operatorNum === 1 ? ex.operator1Duty : ex.operator2Duty,
      newDuty: operatorNum === 1 ? ex.operator2Duty : ex.operator1Duty,
      details: `Operator ${operatorNum} (${operatorNum === 1 ? ex.operator1Name : ex.operator2Name}) confirmed shift exchange request`
    });
  };

  const handleAuthorize = async (id) => {
    const ex = exchanges.find(e => e.id === id);
    if (!ex) return;

    await updateDoc(doc(db, 'shift_exchanges', id), {
      status: 'Approved',
      approvedBy: 'GCC/Crew Controller',
      approvedAt: serverTimestamp(),
      operator1OriginalDuty: ex.operator1Duty || '',
      operator1CurrentDuty: ex.operator2Duty || '',
      operator2OriginalDuty: ex.operator2Duty || '',
      operator2CurrentDuty: ex.operator1Duty || ''
    });

    try {
      // 1. Instantly Update the Dispatch Gate (crew_daily_deployment) in Firestore to sync
      if (ex.operator1Duty) {
        const q1 = query(collection(db, 'crew_daily_deployment'), where('dutyId', '==', String(ex.operator1Duty)));
        const snap1 = await getDocs(q1);
        for (const dSnap of snap1.docs) {
          await updateDoc(doc(db, 'crew_daily_deployment', dSnap.id), {
            empId: String(ex.operator2Id),
            empName: String(ex.operator2Name),
            remarks: `Shift Exchanged with ${ex.operator1Name}`,
            isExchanged: true,
            originalEmpId: String(ex.operator1Id),
            originalEmpName: String(ex.operator1Name),
            originalDuty: String(ex.operator1Duty),
            currentDuty: String(ex.operator2Duty)
          });
        }
      }

      if (ex.operator2Duty) {
        const q2 = query(collection(db, 'crew_daily_deployment'), where('dutyId', '==', String(ex.operator2Duty)));
        const snap2 = await getDocs(q2);
        for (const dSnap of snap2.docs) {
          await updateDoc(doc(db, 'crew_daily_deployment', dSnap.id), {
            empId: String(ex.operator1Id),
            empName: String(ex.operator1Name),
            remarks: `Shift Exchanged with ${ex.operator2Name}`,
            isExchanged: true,
            originalEmpId: String(ex.operator2Id),
            originalEmpName: String(ex.operator2Name),
            originalDuty: String(ex.operator2Duty),
            currentDuty: String(ex.operator1Duty)
          });
        }
      }

      // 2. Record the monthly exchange limit count for each operator
      const monthKey = ex.exchangeDate ? ex.exchangeDate.substring(0, 7) : new Date().toISOString().substring(0, 7);
      const updateCount = async (opId, opName) => {
        if (!opId) return;
        await setDoc(doc(db, 'shift_exchange_counts', `${opId}_${monthKey}`), { empId: opId, empName: opName, month: monthKey, exchangeCount: increment(1), lastUpdated: serverTimestamp() }, { merge: true });
      };

      await updateCount(ex.operator1Id, ex.operator1Name);
      await updateCount(ex.operator2Id, ex.operator2Name);

      // Audit Log
      await addDoc(collection(db, 'auditLogs'), {
        action: "SHIFT_EXCHANGE_APPROVED",
        exchangeId: id,
        operator1Id: ex.operator1Id,
        operator2Id: ex.operator2Id,
        approvedBy: 'GCC/Crew Controller',
        timestamp: serverTimestamp(),
        oldDuty: ex.operator1Duty,
        newDuty: ex.operator2Duty,
        details: `Shift exchange approved by GCC/CC: ${ex.operator1Name} swaps Duty ${ex.operator1Duty} with ${ex.operator2Name} (Duty ${ex.operator2Duty})`
      });
    } catch (error) {
      console.error("Error reflecting exchange on deployment gate or updating counts:", error);
    }
  };

  const handleReject = async (id) => {
    const ex = exchanges.find(e => e.id === id);
    if (!ex) return;

    await updateDoc(doc(db, 'shift_exchanges', id), {
      status: 'Rejected',
      rejectedBy: 'GCC/Crew Controller',
      rejectedAt: serverTimestamp()
    });

    await addDoc(collection(db, 'auditLogs'), {
      action: "SHIFT_EXCHANGE_REJECTED",
      exchangeId: id,
      operator1Id: ex.operator1Id,
      operator2Id: ex.operator2Id,
      approvedBy: 'GCC/Crew Controller',
      timestamp: serverTimestamp(),
      oldDuty: ex.operator1Duty,
      newDuty: ex.operator2Duty,
      details: `Shift exchange rejected by GCC/CC between ${ex.operator1Name} and ${ex.operator2Name}`
    });
  };

  const handleCancel = async (id) => {
    const ex = exchanges.find(e => e.id === id);
    if (!ex) return;

    await updateDoc(doc(db, 'shift_exchanges', id), {
      status: 'Cancelled',
      cancelledAt: serverTimestamp()
    });

    await addDoc(collection(db, 'auditLogs'), {
      action: "SHIFT_EXCHANGE_CANCELLED",
      exchangeId: id,
      operator1Id: ex.operator1Id,
      operator2Id: ex.operator2Id,
      timestamp: serverTimestamp(),
      oldDuty: ex.operator1Duty,
      newDuty: ex.operator2Duty,
      details: `Shift exchange request cancelled by operator`
    });
  };

  return (
    <div className='space-y-6 max-w-[100vw] font-mono'>
      {/* HEADER */}
      <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 shadow-lg flex items-center gap-3">
        <Repeat className="h-6 w-6 text-emerald-400" />
        <h2 className="text-xl font-black tracking-wider text-slate-100">TRAIN OPERATOR SHIFT EXCHANGE DESK</h2>
      </div>

      {/* CREATE REQUEST FORM */}
      <div className='bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl'>
        <h3 className='text-emerald-400 font-bold mb-4 border-b border-slate-800 pb-2 flex items-center gap-2'>
          <Clock size={16} /> Initiate New Exchange Request
        </h3>
        <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
          {/* Operator 1 */}
          <div className='bg-slate-950 p-4 rounded-lg border border-slate-800 space-y-3'>
            <h4 className='text-amber-400 font-semibold text-xs tracking-wider border-b border-slate-800 pb-1'>OPERATOR 1 (REQUESTER)</h4>
            
            <div>
              <label className='block text-[10px] text-slate-500 mb-1'>Search Operator</label>
              <input 
                list="crew-list-1"
                placeholder="Type to search..."
                value={formData.operator1Search || ''}
                onChange={(e) => {
                  const val = e.target.value;
                  const sel = BMRCL_CREW_REGISTRY.find(c => `${c.id} - ${c.name}` === val);
                  setFormData({...formData, operator1Search: val, operator1Id: sel?.id || '', operator1Name: sel?.name || ''});
                }}
                className='w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-xs text-slate-200 focus:border-amber-500 focus:outline-none'
              />
              <datalist id="crew-list-1">
                {BMRCL_CREW_REGISTRY.map(crew => (
                  <option key={`op1-${crew.id}`} value={`${crew.id} - ${crew.name}`} />
                ))}
              </datalist>
            </div>
            <div>
              <label className='block text-[10px] text-slate-500 mb-1'>Status</label>
              <select name="operator1Status" value={formData.operator1Status || 'PRESENT'} onChange={handleInputChange} className='w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-xs text-slate-200 focus:border-amber-500 focus:outline-none'>
                {STATUS_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            </div>

            <div>
              <label className='block text-[10px] text-slate-500 mb-1'>Current Duty Number</label>
              <select name="operator1Duty" value={formData.operator1Duty} onChange={handleInputChange} className='w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-xs text-slate-200 focus:border-amber-500 focus:outline-none'>
                <option value="" disabled>Select Duty</option>
                {DUTY_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            </div>
          </div>

          {/* Operator 2 */}
          <div className='bg-slate-950 p-4 rounded-lg border border-slate-800 space-y-3'>
            <h4 className='text-cyan-400 font-semibold text-xs tracking-wider border-b border-slate-800 pb-1'>OPERATOR 2 (TARGET)</h4>
            
            <div>
              <label className='block text-[10px] text-slate-500 mb-1'>Search Operator</label>
              <input 
                list="crew-list-2"
                placeholder="Type to search..."
                value={formData.operator2Search || ''}
                onChange={(e) => {
                  const val = e.target.value;
                  const sel = BMRCL_CREW_REGISTRY.find(c => `${c.id} - ${c.name}` === val);
                  setFormData({...formData, operator2Search: val, operator2Id: sel?.id || '', operator2Name: sel?.name || ''});
                }}
                className='w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-xs text-slate-200 focus:border-cyan-500 focus:outline-none'
              />
              <datalist id="crew-list-2">
                {BMRCL_CREW_REGISTRY.map(crew => (
                  <option key={`op2-${crew.id}`} value={`${crew.id} - ${crew.name}`} />
                ))}
              </datalist>
            </div>
            <div>
              <label className='block text-[10px] text-slate-500 mb-1'>Status</label>
              <select name="operator2Status" value={formData.operator2Status || 'PRESENT'} onChange={handleInputChange} className='w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-xs text-slate-200 focus:border-cyan-500 focus:outline-none'>
                {STATUS_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            </div>

            <div>
              <label className='block text-[10px] text-slate-500 mb-1'>Current Duty Number</label>
              <select name="operator2Duty" value={formData.operator2Duty} onChange={handleInputChange} className='w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-xs text-slate-200 focus:border-cyan-500 focus:outline-none'>
                <option value="" disabled>Select Duty</option>
                {DUTY_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            </div>
          </div>
        </div>

        <div className='mt-4 flex flex-col sm:flex-row items-end sm:items-center justify-between gap-4'>
          <div className='w-full sm:w-1/3'>
            <label className='block text-[10px] text-slate-500 mb-1'>Target Date for Exchange</label>
            <input type="date" name="exchangeDate" value={formData.exchangeDate} onChange={handleInputChange} className='w-full bg-slate-950 border border-slate-700 rounded p-2 text-xs text-slate-200 focus:border-emerald-500 focus:outline-none' />
          </div>
          <button onClick={handleSubmitRequest} className='w-full sm:w-auto bg-emerald-600 hover:bg-emerald-500 px-6 py-2 rounded text-white font-bold text-xs shadow-md transition-colors'>
            RAISE EXCHANGE REQUEST
          </button>
        </div>
      </div>

      {/* PENDING & AUTHORIZED EXCHANGES */}
      <div className='bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-2xl'>
        <div className="px-4 py-3 bg-slate-950 border-b border-slate-800 flex justify-between items-center text-slate-200 font-mono text-xs font-bold">
          <span className="flex items-center gap-2"><UserCheck size={16} className="text-emerald-400" /> LIVE SHIFT EXCHANGE LOG</span>
        </div>
        <div className='overflow-x-auto'>
          <table className='w-full text-left text-xs'>
            <thead className='bg-slate-900 border-b-2 border-slate-800 text-slate-400 uppercase tracking-wider'>
              <tr>
                <th className='p-3 w-28'>Date</th>
                <th className='p-3 border-r border-slate-800/50 bg-slate-900/50'>Operator 1 (Requester)</th>
                <th className='p-3 border-r border-slate-800/50 bg-slate-900/50'>Operator 2 (Target)</th>
                <th className='p-3 text-center'>Status</th>
                <th className='p-3 text-center'>Crew Controller Action</th>
              </tr>
            </thead>
            <tbody className='divide-y divide-slate-800/50'>
              {exchanges.length === 0 && (
                <tr><td colSpan="5" className='p-6 text-center text-slate-500 italic'>No shift exchange requests found.</td></tr>
              )}
              {exchanges.map((ex) => {
                const canApprove = ex.status === 'Awaiting GCC Approval';
                const showCancel = ex.status === 'Awaiting Second Operator Confirmation' || ex.status === 'Awaiting GCC Approval';

                // Status formatting
                let statusBadge = null;
                switch (ex.status) {
                  case 'Awaiting Second Operator Confirmation':
                    statusBadge = <span className='text-yellow-500 font-bold uppercase tracking-wider text-[10px]'>AWAITING 2ND OP CONFIRM</span>;
                    break;
                  case 'Awaiting GCC Approval':
                    statusBadge = <span className='text-orange-400 font-bold uppercase tracking-wider text-[10px] animate-pulse'>AWAITING GCC APPROVAL</span>;
                    break;
                  case 'Approved':
                    statusBadge = <span className='text-emerald-400 font-bold uppercase tracking-wider text-[10px] flex justify-center items-center gap-1'><CheckCircle size={12}/> APPROVED</span>;
                    break;
                  case 'Rejected':
                    statusBadge = <span className='text-rose-400 font-bold uppercase tracking-wider text-[10px] flex justify-center items-center gap-1'><X size={12}/> REJECTED</span>;
                    break;
                  case 'Cancelled':
                    statusBadge = <span className='text-slate-500 font-bold uppercase tracking-wider text-[10px]'>CANCELLED</span>;
                    break;
                  default:
                    statusBadge = <span className='text-orange-400 font-bold uppercase tracking-wider text-[10px]'>{ex.status}</span>;
                }

                return (
                  <tr key={ex.id} className='hover:bg-slate-800/20 bg-slate-950/40 transition-colors border-b border-slate-850'>
                    <td className='p-3 text-emerald-400 font-semibold'>{ex.exchangeDate}</td>
                    
                    {/* Operator 1 Block */}
                    <td className='p-3 border-r border-slate-800/50'>
                      <div className='flex flex-col gap-1'>
                        <span className='text-amber-400 font-bold'>{ex.operator1Name || ex.operator1Id}</span>
                        <span className='text-slate-500 text-[10px]'>Duty: {ex.operator1Duty || '--'} | Status: {ex.operator1Status || 'PRESENT'}</span>
                        {ex.operator1Confirmed ? (
                          <span className='text-emerald-500 flex items-center gap-1 text-[10px] font-bold mt-1'><CheckCircle size={10}/> CONFIRMED</span>
                        ) : (
                          (ex.status === 'Awaiting Second Operator Confirmation' || ex.status === 'Pending') && (
                            <button onClick={() => handleConfirm(ex.id, 1)} className='mt-1 bg-amber-900/40 border border-amber-700 hover:bg-amber-800/60 text-amber-400 text-[10px] py-1 px-2 rounded w-max transition-colors'>
                              CONFIRM REQUEST
                            </button>
                          )
                        )}
                      </div>
                    </td>

                    {/* Operator 2 Block */}
                    <td className='p-3 border-r border-slate-800/50'>
                      <div className='flex flex-col gap-1'>
                        <span className='text-cyan-400 font-bold'>{ex.operator2Name || ex.operator2Id}</span>
                        <span className='text-slate-500 text-[10px]'>Duty: {ex.operator2Duty || '--'} | Status: {ex.operator2Status || 'PRESENT'}</span>
                        {ex.operator2Confirmed ? (
                          <span className='text-emerald-500 flex items-center gap-1 text-[10px] font-bold mt-1'><CheckCircle size={10}/> CONFIRMED</span>
                        ) : (
                          (ex.status === 'Awaiting Second Operator Confirmation' || ex.status === 'Pending') && (
                            <button onClick={() => handleConfirm(ex.id, 2)} className='mt-1 bg-cyan-900/40 border border-cyan-700 hover:bg-cyan-800/60 text-cyan-400 text-[10px] py-1 px-2 rounded w-max transition-colors'>
                              CONFIRM REQUEST
                            </button>
                          )
                        )}
                      </div>
                    </td>

                    <td className='p-3 text-center'>
                      {statusBadge}
                    </td>

                    <td className='p-3 text-center'>
                      {ex.status === 'Awaiting GCC Approval' ? (
                        <div className='flex flex-col gap-1.5 items-center justify-center'>
                          <div className='flex gap-1.5 justify-center'>
                            <button 
                              onClick={() => handleAuthorize(ex.id)} 
                              className="bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-black px-2.5 py-1.5 rounded text-[10px] tracking-wider uppercase transition-colors shadow-sm flex items-center gap-0.5"
                            >
                              <Check size={10}/> Approve
                            </button>
                            <button 
                              onClick={() => handleReject(ex.id)} 
                              className="bg-rose-950 border border-rose-500 hover:bg-rose-900 text-rose-300 font-bold px-2.5 py-1.5 rounded text-[10px] tracking-wider uppercase transition-colors shadow-sm flex items-center gap-0.5"
                            >
                              <X size={10}/> Reject
                            </button>
                          </div>
                          {showCancel && (
                            <button 
                              onClick={() => handleCancel(ex.id)}
                              className="text-slate-500 hover:text-slate-400 font-bold text-[9px] uppercase tracking-wider"
                            >
                              Cancel Request
                            </button>
                          )}
                        </div>
                      ) : (ex.status === 'Awaiting Second Operator Confirmation') ? (
                        <div className='flex flex-col items-center gap-1.5'>
                          <span className='text-[10px] text-slate-500 font-bold uppercase'>Awaiting Op 2</span>
                          {showCancel && (
                            <button 
                              onClick={() => handleCancel(ex.id)}
                              className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-400 px-2 py-1 rounded text-[9px] uppercase tracking-wider font-bold"
                            >
                              Cancel
                            </button>
                          )}
                        </div>
                      ) : ex.status === 'Approved' ? (
                        <div className='flex flex-col items-center gap-0.5 text-[9px] text-slate-500'>
                          <span className='font-bold text-slate-400'>By: {ex.approvedBy || 'GCC/CC'}</span>
                          {ex.approvedAt && <span>{ex.approvedAt.toDate ? ex.approvedAt.toDate().toLocaleString() : 'Approved'}</span>}
                        </div>
                      ) : ex.status === 'Rejected' ? (
                        <div className='flex flex-col items-center gap-0.5 text-[9px] text-slate-500'>
                          <span className='font-bold text-slate-400'>By: {ex.rejectedBy || 'GCC/CC'}</span>
                          {ex.rejectedAt && <span>{ex.rejectedAt.toDate ? ex.rejectedAt.toDate().toLocaleString() : 'Rejected'}</span>}
                        </div>
                      ) : ex.status === 'Cancelled' ? (
                        <div className='flex flex-col items-center gap-0.5 text-[9px] text-slate-500 font-bold uppercase text-slate-650'>
                          <span>Cancelled</span>
                        </div>
                      ) : (
                        <span className='text-slate-600 text-[10px]'>--</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
