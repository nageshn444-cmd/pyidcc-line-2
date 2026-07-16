import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { doc, onSnapshot, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { Calendar, Send, Clock, AlertCircle, CheckCircle, UploadCloud } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function TORequestForm() {
  const { currentUser } = useAuth();
  const [windowConfig, setWindowConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  
  const [leaveData, setLeaveData] = useState({
    startDate: '',
    endDate: '',
    reason: '',
    leaveType: 'CL',
    subCategory: '',
    certificateFile: null,
    certificateFileName: '',
    previousMlUsage: 0,
    leaveBalance: 15,
    leaveAvailedThisYear: 3
  });

  useEffect(() => {
    const docRef = doc(db, 'system_config', 'leave_window');
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        setWindowConfig(docSnap.data());
      } else {
        setWindowConfig({ isOpen: false });
      }
      setLoading(false);
    }, (error) => {
      console.error("Sync Error:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!currentUser) {
      return alert("You must be logged in to submit a leave request.");
    }

    if (!leaveData.startDate || !leaveData.endDate || !leaveData.reason) {
      return alert("Please fill all required fields.");
    }

    if (new Date(leaveData.endDate) < new Date(leaveData.startDate)) {
        return alert("End date cannot be before start date.");
    }

    const allowedStart = windowConfig?.startDate;
    const allowedEnd = windowConfig?.endDate;
    if (allowedStart && allowedEnd) {
      if (leaveData.startDate < allowedStart || leaveData.endDate > allowedEnd) {
        return alert(`⚠️ INVALID LEAVE DATES:\nLeave request dates must be strictly within the dates opened by GCC:\nStart Date: ${allowedStart}\nEnd Date: ${allowedEnd}`);
      }
    }
    
    setSubmitting(true);
    try {
      await addDoc(collection(db, 'leave_requests'), {
        empId: currentUser.uid,
        empName: currentUser.displayName || 'Unknown Operator',
        startDate: leaveData.startDate,
        endDate: leaveData.endDate,
        reason: leaveData.reason,
        leaveType: leaveData.leaveType,
        subCategory: leaveData.subCategory || 'General',
        certificateUploaded: !!leaveData.certificateFileName,
        certificateFileName: leaveData.certificateFileName || '',
        previousMlUsage: Number(leaveData.previousMlUsage || 0),
        leaveBalance: Number(leaveData.leaveBalance || 15),
        leaveAvailedThisYear: Number(leaveData.leaveAvailedThisYear || 3),
        status: 'PENDING',
        requestDate: serverTimestamp(),
        targetMonth: windowConfig?.targetMonth || 'Unknown',
        isPriorRequest: true 
      });
      alert("✅ Leave Request Submitted Successfully!");
      setLeaveData({ 
        startDate: '', 
        endDate: '', 
        reason: '', 
        leaveType: 'CL',
        subCategory: '',
        certificateFile: null,
        certificateFileName: '',
        previousMlUsage: 0,
        leaveBalance: 15,
        leaveAvailedThisYear: 3
      });
    } catch (err) {
      console.error("Submission Error:", err);
      alert("Failed to submit request. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8 bg-slate-900 border border-slate-800 rounded-xl text-slate-400 text-center animate-pulse flex flex-col items-center">
        <Clock className="h-8 w-8 mb-2 animate-spin" />
        Synchronizing live leave windows...
      </div>
    );
  }

  const today = new Date().toISOString().split('T')[0];
  const isWithinWindow = windowConfig?.isOpen === true && 
                         today <= (windowConfig?.endDate || '9999-12-31');

  if (!isWithinWindow) {
    return (
      <div className="p-6 bg-slate-900 border border-rose-900/50 bg-rose-950/10 rounded-xl text-center shadow-inner font-mono">
        <Clock className="mx-auto h-8 w-8 text-rose-500 mb-3 opacity-80" />
        <h3 className="text-rose-400 font-bold mb-2 uppercase tracking-wide text-lg">Leave Window Closed</h3>
        <p className="text-sm text-slate-400">
          The window for leave requests for {windowConfig?.targetMonth || 'this period'} is currently closed or the deadline has passed.
        </p>
        {windowConfig?.endDate && (
          <div className="mt-4 p-3 bg-slate-950 rounded border border-slate-800 text-xs text-slate-500 font-bold tracking-wider">
            Submission Deadline: {windowConfig.endDate}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-slate-900 p-6 rounded-xl border border-emerald-500/30 shadow-lg relative overflow-hidden font-mono text-slate-200">
      <div className="absolute top-0 right-0 bg-emerald-600 text-[10px] font-black tracking-widest px-3 py-1.5 text-slate-950 rounded-bl-lg flex items-center gap-1.5 shadow-sm">
        <span className="h-2 w-2 bg-slate-950 rounded-full animate-pulse"></span> WINDOW OPEN
      </div>
      
      <h3 className="text-emerald-400 font-bold mb-4 flex items-center gap-2 text-lg uppercase tracking-wider">
        <Calendar className="h-5 w-5" /> Submit Leave Request
      </h3>
      
      <div className="mb-6 p-3 bg-emerald-950/20 border border-emerald-900/50 rounded-lg flex justify-between items-center text-xs">
         <p className="text-slate-300 font-bold tracking-wide">TARGET MONTH: <span className="text-emerald-300">{windowConfig?.targetMonth || 'N/A'}</span></p>
         <p className="text-slate-300 font-bold tracking-wide">DEADLINE: <span className="text-amber-400">{windowConfig?.endDate || 'N/A'}</span></p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="block text-xs font-bold text-slate-400 mb-1 uppercase tracking-wider">Leave Category</label>
            <select 
              value={leaveData.leaveType}
              onChange={(e) => {
                const type = e.target.value;
                let sub = '';
                if (type === 'ML') sub = 'Sick Leave';
                else if (type === 'CCL') sub = 'Child Examination';
                else if (type === 'OL') sub = 'Optional Holiday';
                else if (type === 'SCL') sub = 'Official Government Duty';
                else if (type === 'CO') sub = 'Compensatory Off Relief';
                setLeaveData({...leaveData, leaveType: type, subCategory: sub});
              }}
              className="w-full bg-slate-950 border border-slate-700 rounded p-2.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 font-mono"
            >
              <option value="CL">Casual Leave (CL)</option>
              <option value="EL">Earned Leave (EL)</option>
              <option value="ML">Medical Leave (ML)</option>
              <option value="PL">Paternity Leave (PL)</option>
              <option value="MATERNITY">Maternity Leave (MatL)</option>
              <option value="CCL">Child Care Leave (CCL)</option>
              <option value="OL">Optional Leave / Restricted Holiday (OL)</option>
              <option value="SCL">Special Casual Leave (SCL)</option>
              <option value="CO">Compensatory Off (CO)</option>
              <option value="EOL">Extraordinary Leave (EOL)</option>
              <option value="STUDY">Study Leave (StL)</option>
            </select>
          </div>

          {['ML', 'CCL', 'OL', 'SCL', 'CO'].includes(leaveData.leaveType) && (
            <div className="col-span-2">
              <label className="block text-xs font-bold text-slate-400 mb-1 uppercase tracking-wider">Sub Category</label>
              <select
                value={leaveData.subCategory}
                onChange={(e) => setLeaveData({...leaveData, subCategory: e.target.value})}
                className="w-full bg-slate-950 border border-slate-700 rounded p-2.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 font-mono"
              >
                {leaveData.leaveType === 'ML' && (
                  <>
                    <option value="Sick Leave">Sick Leave</option>
                    <option value="Doctor Recommended Rest">Doctor Recommended Rest</option>
                    <option value="Medical Treatment">Medical Treatment</option>
                    <option value="Hospitalization">Hospitalization</option>
                  </>
                )}
                {leaveData.leaveType === 'CCL' && (
                  <>
                    <option value="Child Examination">Child Examination</option>
                    <option value="Child Medical Care">Child Medical Care</option>
                    <option value="Family Welfare Support">Family Welfare Support</option>
                  </>
                )}
                {leaveData.leaveType === 'OL' && (
                  <>
                    <option value="Optional Holiday">Optional Holiday</option>
                    <option value="Restricted Holiday">Restricted Holiday</option>
                    <option value="Personal Religious Occasion">Personal Religious Occasion</option>
                  </>
                )}
                {leaveData.leaveType === 'SCL' && (
                  <>
                    <option value="Official Government Duty">Official Government Duty</option>
                    <option value="Court Summons">Court Summons</option>
                    <option value="Accident Relief">Accident Relief</option>
                    <option value="Sports/Union Event Representing BMRCL">Sports/Union Event Representing BMRCL</option>
                  </>
                )}
                {leaveData.leaveType === 'CO' && (
                  <>
                    <option value="Compensatory Off Relief">Compensatory Off Relief</option>
                    <option value="National Holiday Compensatory Off">National Holiday Compensatory Off</option>
                  </>
                )}
              </select>
            </div>
          )}

          {leaveData.leaveType === 'ML' && (
            <div className="col-span-2">
              <label className="block text-xs font-bold text-slate-400 mb-1 uppercase tracking-wider flex items-center gap-1">
                <UploadCloud size={14} /> Upload Medical Certificate (Simulated)
              </label>
              <input 
                type="file" 
                accept=".pdf,.jpg,.jpeg,.png"
                onChange={(e) => {
                  const file = e.target.files[0];
                  if (file) {
                    setLeaveData({...leaveData, certificateFile: file, certificateFileName: file.name});
                  }
                }}
                className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-xs text-slate-400"
              />
              {leaveData.certificateFileName && (
                <span className="text-[10px] text-emerald-400 mt-1 block">✓ Selected: {leaveData.certificateFileName}</span>
              )}
            </div>
          )}

          {/* Conflict Parameters Testing Input */}
          <div className="col-span-2 border-t border-slate-800 pt-4 mt-2">
            <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2"> Roster conflict params (for simulations)</span>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-[8px] font-bold text-slate-500 uppercase tracking-wider mb-1">ML Usage Count</label>
                <input 
                  type="number" 
                  min="0"
                  value={leaveData.previousMlUsage}
                  onChange={(e) => setLeaveData({...leaveData, previousMlUsage: parseInt(e.target.value, 10) || 0})}
                  className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-xs text-slate-200 text-center"
                />
              </div>
              <div>
                <label className="block text-[8px] font-bold text-slate-500 uppercase tracking-wider mb-1">Leave Balance</label>
                <input 
                  type="number" 
                  min="0"
                  value={leaveData.leaveBalance}
                  onChange={(e) => setLeaveData({...leaveData, leaveBalance: parseInt(e.target.value, 10) || 0})}
                  className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-xs text-slate-200 text-center"
                />
              </div>
              <div>
                <label className="block text-[8px] font-bold text-slate-500 uppercase tracking-wider mb-1">Availed this year</label>
                <input 
                  type="number" 
                  min="0"
                  value={leaveData.leaveAvailedThisYear}
                  onChange={(e) => setLeaveData({...leaveData, leaveAvailedThisYear: parseInt(e.target.value, 10) || 0})}
                  className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-xs text-slate-200 text-center"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-400 mb-1 uppercase tracking-wider">Start Date</label>
            <input 
              type="date" 
              required
              min={windowConfig?.startDate || ''}
              max={windowConfig?.endDate || ''}
              value={leaveData.startDate}
              onChange={(e) => setLeaveData({...leaveData, startDate: e.target.value})}
              className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500" 
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-400 mb-1 uppercase tracking-wider">End Date</label>
            <input 
              type="date" 
              required
              min={leaveData.startDate || windowConfig?.startDate || ''}
              max={windowConfig?.endDate || ''}
              value={leaveData.endDate}
              onChange={(e) => setLeaveData({...leaveData, endDate: e.target.value})}
              className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500" 
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-400 mb-1 uppercase tracking-wider">Reason for Leave</label>
          <textarea 
            required
            rows="2"
            value={leaveData.reason}
            onChange={(e) => setLeaveData({...leaveData, reason: e.target.value})}
            placeholder="Explain the operational urgency..."
            className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 resize-none font-mono"
          ></textarea>
        </div>

        <button 
          type="submit" 
          disabled={submitting}
          className="w-full bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-black tracking-widest p-3 rounded flex items-center justify-center gap-2 transition-colors uppercase text-xs shadow-md mt-2 disabled:opacity-50"
        >
          {submitting ? 'PROCESSING...' : <><Send className="h-4 w-4" /> SUBMIT APPLICATION</>}
        </button>
      </form>
    </div>
  );
}