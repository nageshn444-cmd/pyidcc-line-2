import React, { useState, useEffect } from 'react';
import { 
  Calendar, CheckCircle, FileText, User, ChevronRight, 
  Clock, MapPin, ShieldAlert, Award, Compass, RefreshCw, Send 
} from 'lucide-react';
import { db } from '../../firebase';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import TORequestForm from '../TORequestForm';
import ShiftExchange from '../ShiftExchange';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';

export default function TrainOperatorPwa({
  liveTrainTrackingMap,
  unifiedRows,
  liveIncidents,
  deployments,
  attendanceLogs,
  loading,
  fetchLiveData,
  activeDay
}) {
  const [signedOn, setSignedOn] = useState(false);
  const [signOnTime, setSignOnTime] = useState(null);
  const { theme } = useTheme();
  const { userProfile, currentUser, logout, hasPermission, permissions } = useAuth();

  // Manual Duty Registration States
  const [showManualForm, setShowManualForm] = useState(false);
  const [manualDutyId, setManualDutyId] = useState('');
  const [manualTrainId, setManualTrainId] = useState('');
  const [manualSignOnTime, setManualSignOnTime] = useState('06:00:00');
  const [manualSignOffTime, setManualSignOffTime] = useState('14:00:00');
  const [manualLocation, setManualLocation] = useState('PYID');
  const [submittingManual, setSubmittingManual] = useState(false);

  const normalizeDutyId = (id) => {
    const s = String(id || '').trim();
    if (/^[1-9]$/.test(s)) return '0' + s;
    return s;
  };

  const handleRegisterManualDuty = async (e) => {
    e.preventDefault();
    if (!manualDutyId.trim()) return alert("Please enter a Duty ID.");
    if (!manualTrainId.trim()) return alert("Please enter a Train ID.");
    
    setSubmittingManual(true);
    try {
      const normDuty = normalizeDutyId(manualDutyId);
      const targetDocId = `gcc_deploy_${activeDay.toLowerCase()}_duty_${normDuty}`;
      
      await setDoc(doc(db, 'crew_daily_deployment', targetDocId), {
        scheduleType: activeDay,
        dutyId: normDuty,
        empId: empId,
        empName: userProfile?.employeeName || 'Operator',
        trainId: manualTrainId.trim(),
        signOnTime: manualSignOnTime,
        signOffTime: manualSignOffTime,
        signOnLocation: manualLocation,
        status: 'LIVE',
        remarks: 'Operator Manual Register',
        lastUpdated: serverTimestamp()
      }, { merge: true });
      
      alert("🎉 Duty registered successfully!");
      if (fetchLiveData) fetchLiveData(); // trigger refresh
      setShowManualForm(false);
    } catch (err) {
      console.error(err);
      alert("Failed to register duty: " + err.message);
    } finally {
      setSubmittingManual(false);
    }
  };

  const canViewDuty = hasPermission('Duty Roster', 'View') || hasPermission('Duty Roster', 'Own');
  const canViewSwaps = hasPermission('Shift Exchange', 'View') || hasPermission('Shift Exchange', 'Request') || hasPermission('Leave Requests', 'View');
  const canViewKpis = hasPermission('Reports Center', 'View');

  const [activeTab, setActiveTab] = useState(() => {
    if (canViewDuty) return 'TODAY';
    if (canViewSwaps) return 'REQUESTS';
    if (canViewKpis) return 'REPORTS';
    return 'TODAY';
  });

  useEffect(() => {
    const d = hasPermission('Duty Roster', 'View') || hasPermission('Duty Roster', 'Own');
    const s = hasPermission('Shift Exchange', 'View') || hasPermission('Shift Exchange', 'Request') || hasPermission('Leave Requests', 'View');
    const k = hasPermission('Reports Center', 'View');
    const visible = [];
    if (d) visible.push('TODAY');
    if (s) visible.push('REQUESTS');
    if (k) visible.push('REPORTS');
    if (visible.length > 0 && !visible.includes(activeTab)) {
      setActiveTab(visible[0]);
    }
  }, [permissions, activeTab]);

  const [profileForm, setProfileForm] = useState({
    contact: '',
    email: '',
    bloodGroup: '',
    emergencyContact: '',
    medicalValidTill: ''
  });

  useEffect(() => {
    if (userProfile) {
      setProfileForm({
        contact: userProfile.contact || userProfile.mobileNumber || '',
        email: userProfile.email || '',
        bloodGroup: userProfile.bloodGroup || '',
        emergencyContact: userProfile.emergencyContact || '',
        medicalValidTill: userProfile.medicalValidTill || userProfile.medicalExpiry || ''
      });
    }
  }, [userProfile]);

  const empId = userProfile?.employeeId || '';
  const myDeployment = deployments.find(d => String(d.empId) === String(empId));

  // Handle one-click mobile sign on
  const handleSignOn = async () => {
    if (!myDeployment) return;
    try {
      const actualTime = new Date().toLocaleTimeString();
      const attendanceRef = doc(db, "crew_live_attendance", `${myDeployment.dutyId}_${activeDay}`);
      await setDoc(attendanceRef, {
        dutyId: myDeployment.dutyId,
        empId: empId,
        empName: userProfile?.employeeName || 'Operator',
        scheduleType: activeDay,
        signOnTimeActual: actualTime,
        timestamp: serverTimestamp()
      });
      setSignedOn(true);
      setSignOnTime(actualTime);
      fetchLiveData();
    } catch (err) {
      console.error(err);
      alert("Sign-on failed. Check network connection.");
    }
  };

  const handleSaveProfile = async () => {
    if (!empId) {
      alert("No operator profile found to update.");
      return;
    }
    try {
      if (!profileForm.contact || !profileForm.email) {
        alert("Mobile number and email are required.");
        return;
      }

      // 1. Update in crewRegistry
      const registryRef = doc(db, 'crewRegistry', empId);
      await setDoc(registryRef, {
        mobileNumber: profileForm.contact,
        contact: profileForm.contact,
        email: profileForm.email,
        bloodGroup: profileForm.bloodGroup,
        emergencyContact: profileForm.emergencyContact,
        medicalValidTill: profileForm.medicalValidTill
      }, { merge: true });

      // 2. Update in users
      const userRef = doc(db, 'users', empId);
      await setDoc(userRef, {
        email: profileForm.email,
        contact: profileForm.contact,
        mobileNumber: profileForm.contact,
        bloodGroup: profileForm.bloodGroup,
        emergencyContact: profileForm.emergencyContact,
        medicalValidTill: profileForm.medicalValidTill
      }, { merge: true });

      // 3. Update in system_users
      if (currentUser?.uid) {
        const sysUserRef = doc(db, 'system_users', currentUser.uid);
        await setDoc(sysUserRef, {
          email: profileForm.email,
          mobileNumber: profileForm.contact,
          bloodGroup: profileForm.bloodGroup,
          emergencyContact: profileForm.emergencyContact
        }, { merge: true });
      }

      alert("🎉 Profile and registry details saved successfully!");
    } catch (err) {
      console.error(err);
      alert("Failed to save details: " + err.message);
    }
  };

  return (
    <div className={`min-h-screen bg-[var(--app-bg)] text-white font-mono flex flex-col justify-between max-w-md mx-auto border-x border-[var(--border-color)] shadow-2xl relative ${theme}`}>
      
      {/* 1. Mobile Header */}
      <header className="p-4 border-b border-[var(--border-color)] flex justify-between items-center sticky top-0 bg-[var(--header-bg)] backdrop-blur-md z-30">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-cyan-500 animate-pulse"></div>
          <span className="text-xs font-black uppercase tracking-wider text-cyan-400">BMRCL PWA OPERATOR</span>
        </div>
        <button 
          onClick={logout}
          className="text-neutral-500 hover:text-white text-[10px] font-bold border border-neutral-850 px-2.5 py-1 rounded"
        >
          Sign-Out
        </button>
      </header>

      {/* 2. Scrollable Body Content */}
      <main className="flex-1 p-4 overflow-y-auto mb-16 space-y-4">
        
        {activeTab === 'TODAY' ? (
          <div className="space-y-4">
            
            {/* Today's Duty Card */}
            <div className="border border-neutral-850 bg-neutral-950 p-4 rounded-xl space-y-3">
              <span className="text-[10px] text-neutral-500 font-bold uppercase tracking-widest block">Today's Duty Info</span>
              {myDeployment ? (
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-lg font-black text-cyan-400">DUTY ID: {myDeployment.dutyId}</span>
                    <span className="text-xs bg-neutral-900 border border-neutral-800 px-2 py-0.5 rounded text-neutral-400 font-bold">
                      Train: {myDeployment.trainId}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-neutral-900/60 p-2.5 rounded border border-neutral-900 flex items-center gap-2">
                      <Clock className="h-4 w-4 text-cyan-500" />
                      <div>
                        <div className="text-[9px] text-neutral-500">SIGN-ON</div>
                        <div className="font-bold">{myDeployment.signOnTime}</div>
                      </div>
                    </div>
                    <div className="bg-neutral-900/60 p-2.5 rounded border border-neutral-900 flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-cyan-500" />
                      <div>
                        <div className="text-[9px] text-neutral-500">LOCATION</div>
                        <div className="font-bold">{myDeployment.signOnLocation}</div>
                      </div>
                    </div>
                  </div>

                  {/* Sign On Trigger Button */}
                  {!myDeployment.isSignedOn && !signedOn ? (
                    <button 
                      onClick={handleSignOn}
                      className="w-full bg-cyan-600 hover:bg-cyan-500 text-black font-black py-3 rounded-lg text-xs uppercase tracking-widest transition shadow-lg shadow-cyan-900/10"
                    >
                      Sign On Duty
                    </button>
                  ) : (
                    <div className="bg-emerald-950/20 border border-emerald-900/30 text-emerald-400 p-3 rounded-lg flex items-center justify-between text-xs font-bold uppercase">
                      <span>✓ SIGNED ON SUCCESSFULLY</span>
                      <span className="text-[10px] font-mono text-slate-400">{myDeployment.signOnTimestamp || signOnTime}</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="text-center py-4 text-xs text-neutral-500 italic">No duty active for your profile today.</div>
                  
                  {!showManualForm ? (
                    <button
                      onClick={() => setShowManualForm(true)}
                      className="w-full border border-cyan-800 bg-cyan-955 hover:bg-cyan-900 text-cyan-400 font-bold py-2.5 rounded-lg text-xs uppercase tracking-wider transition"
                    >
                      Register Duty Manually
                    </button>
                  ) : (
                    <form onSubmit={handleRegisterManualDuty} className="border-t border-neutral-850 pt-4 space-y-3">
                      <span className="text-[10px] text-cyan-400 font-bold uppercase tracking-widest block">Manual Duty Registration</span>
                      
                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div className="space-y-1">
                          <label className="text-[9px] text-neutral-500 uppercase font-bold">Duty ID</label>
                          <input
                            type="text"
                            placeholder="e.g. D10 or 12"
                            value={manualDutyId}
                            onChange={(e) => setManualDutyId(e.target.value)}
                            className="w-full bg-neutral-900 border border-neutral-800 rounded p-2 text-white font-mono"
                            required
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[9px] text-neutral-500 uppercase font-bold">Train ID</label>
                          <input
                            type="text"
                            placeholder="e.g. 201"
                            value={manualTrainId}
                            onChange={(e) => setManualTrainId(e.target.value)}
                            className="w-full bg-neutral-900 border border-neutral-800 rounded p-2 text-white font-mono"
                            required
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div className="space-y-1">
                          <label className="text-[9px] text-neutral-500 uppercase font-bold">Sign-On Time</label>
                          <input
                            type="text"
                            placeholder="e.g. 06:00:00"
                            value={manualSignOnTime}
                            onChange={(e) => setManualSignOnTime(e.target.value)}
                            className="w-full bg-neutral-900 border border-neutral-800 rounded p-2 text-white font-mono"
                            required
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[9px] text-neutral-500 uppercase font-bold">Sign-Off Time</label>
                          <input
                            type="text"
                            placeholder="e.g. 14:00:00"
                            value={manualSignOffTime}
                            onChange={(e) => setManualSignOffTime(e.target.value)}
                            className="w-full bg-neutral-900 border border-neutral-800 rounded p-2 text-white font-mono"
                            required
                          />
                        </div>
                      </div>

                      <div className="space-y-1 text-xs">
                        <label className="text-[9px] text-neutral-500 uppercase font-bold">Sign-On Location</label>
                        <select
                          value={manualLocation}
                          onChange={(e) => setManualLocation(e.target.value)}
                          className="w-full bg-neutral-900 border border-neutral-800 rounded p-2 text-white font-mono"
                        >
                          <option value="PYID">Peenya Industry Depot (PYID)</option>
                          <option value="NGSA">Nagasandra (NGSA)</option>
                          <option value="PUTH">Yelachenahalli (PUTH)</option>
                          <option value="APTS">Anjanapura (APTS)</option>
                        </select>
                      </div>

                      <div className="flex gap-2 pt-2">
                        <button
                          type="button"
                          onClick={() => setShowManualForm(false)}
                          className="w-1/2 border border-neutral-850 bg-neutral-900 hover:bg-neutral-850 text-neutral-400 font-bold py-2 rounded text-xs uppercase"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={submittingManual}
                          className="w-1/2 bg-cyan-600 hover:bg-cyan-500 disabled:bg-neutral-850 text-black font-black py-2 rounded text-xs uppercase tracking-widest"
                        >
                          {submittingManual ? "Saving..." : "Register"}
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              )}
            </div>

            {/* Run Legs (if duty is active) */}
            {myDeployment && myDeployment.rawLegs && (
              <div className="border border-neutral-850 bg-neutral-950 p-4 rounded-xl">
                <span className="text-[10px] text-neutral-500 font-bold uppercase tracking-widest block mb-3">Shift Leg Timeline</span>
                <div className="space-y-3 relative before:absolute before:left-3 before:top-2 before:bottom-2 before:w-0.5 before:bg-neutral-850">
                  
                  <div className="flex items-start gap-3 pl-6 relative">
                    <div className="absolute left-1.5 top-1.5 w-3.5 h-3.5 rounded-full bg-neutral-950 border-2 border-cyan-400 flex items-center justify-center text-[8px] text-cyan-400 font-black">1</div>
                    <div>
                      <div className="text-xs font-bold text-neutral-200">Leg 1: Dispatch Induction</div>
                      <div className="text-[10px] text-neutral-500 mt-0.5">Train {myDeployment.rawLegs.l1Train} | {myDeployment.rawLegs.l1Start} - {myDeployment.rawLegs.l1End}</div>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 pl-6 relative">
                    <div className="absolute left-1.5 top-1.5 w-3.5 h-3.5 rounded-full bg-neutral-950 border-2 border-cyan-400 flex items-center justify-center text-[8px] text-cyan-400 font-black">2</div>
                    <div>
                      <div className="text-xs font-bold text-neutral-200">Leg 2: Mid-Shift Working</div>
                      <div className="text-[10px] text-neutral-500 mt-0.5">Train {myDeployment.rawLegs.l2Train} | {myDeployment.rawLegs.l2Start} - {myDeployment.rawLegs.l2End}</div>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 pl-6 relative">
                    <div className="absolute left-1.5 top-1.5 w-3.5 h-3.5 rounded-full bg-neutral-950 border-2 border-cyan-400 flex items-center justify-center text-[8px] text-cyan-400 font-black">3</div>
                    <div>
                      <div className="text-xs font-bold text-neutral-200">Leg 3: Handover Loop</div>
                      <div className="text-[10px] text-neutral-500 mt-0.5">Train {myDeployment.rawLegs.l3Train} | {myDeployment.rawLegs.l3Start} - {myDeployment.rawLegs.l3End}</div>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 pl-6 relative">
                    <div className="absolute left-1.5 top-1.5 w-3.5 h-3.5 rounded-full bg-neutral-950 border-2 border-cyan-400 flex items-center justify-center text-[8px] text-cyan-400 font-black">4</div>
                    <div>
                      <div className="text-xs font-bold text-neutral-200">Leg 4: Final Sign-Off Leg</div>
                      <div className="text-[10px] text-neutral-500 mt-0.5">Train {myDeployment.rawLegs.l4Train} | {myDeployment.rawLegs.l4Start} - {myDeployment.rawLegs.l4End}</div>
                    </div>
                  </div>

                </div>
              </div>
            )}
          </div>
        ) : activeTab === 'REQUESTS' ? (
          <div className="space-y-4">
            <div className="border border-neutral-850 bg-neutral-950 p-4 rounded-xl">
              <span className="text-[10px] text-neutral-500 font-bold uppercase tracking-widest block mb-2">Leave Submission Form</span>
              <TORequestForm />
            </div>
            <div className="border border-neutral-850 bg-neutral-950 p-4 rounded-xl">
              <span className="text-[10px] text-neutral-500 font-bold uppercase tracking-widest block mb-2">Shift Swap Requests</span>
              <ShiftExchange />
            </div>
          </div>
        ) : activeTab === 'REPORTS' ? (
          <div className="space-y-4">
            
            {/* Competency Expries */}
            <div className="border border-neutral-850 bg-neutral-950 p-4 rounded-xl space-y-3">
              <span className="text-[10px] text-neutral-500 font-bold uppercase tracking-widest block">Competency & Qualifications</span>
              <div className="flex justify-between items-center text-xs">
                <span className="text-neutral-400">PME Medical Expiry</span>
                <span className={`font-bold ${
                  userProfile?.medicalValidTill 
                    ? (new Date(userProfile.medicalValidTill) > new Date() ? 'text-emerald-400' : 'text-rose-500') 
                    : 'text-neutral-400'
                }`}>
                  {userProfile?.medicalValidTill || 'Not Entered'} 
                  {userProfile?.medicalValidTill && (new Date(userProfile.medicalValidTill) > new Date() ? ' (Valid)' : ' (Expired)')}
                </span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-neutral-400">Competency Certificate</span>
                <span className="text-emerald-400 font-bold">256 Runs Logged</span>
              </div>
            </div>

            {/* Kilometer Report */}
            <div className="border border-neutral-850 bg-neutral-950 p-4 rounded-xl space-y-3">
              <span className="text-[10px] text-neutral-500 font-bold uppercase tracking-widest block">Kilometer Ledger</span>
              <div className="flex justify-between items-center text-xs">
                <span className="text-neutral-400">Weekly Target Distance</span>
                <span className="text-cyan-400 font-bold">350 KM</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-neutral-400">Total Distance Logged</span>
                <span className="text-cyan-400 font-bold">210 KM</span>
              </div>
            </div>

            {/* Personal Details Form */}
            <div className="border border-neutral-850 bg-neutral-950 p-4 rounded-xl space-y-4">
              <span className="text-[10px] text-neutral-500 font-bold uppercase tracking-widest block border-b border-neutral-900 pb-1.5">
                Update Profile Details
              </span>
              
              <div className="space-y-3 text-xs">
                <div>
                  <label className="block text-[10px] text-neutral-500 mb-1 uppercase">Full Name (Read Only)</label>
                  <input 
                    type="text" 
                    value={userProfile?.employeeName || ''} 
                    disabled 
                    className="w-full bg-neutral-900/40 border border-neutral-900 text-neutral-400 p-2 rounded cursor-not-allowed font-bold"
                  />
                </div>

                <div>
                  <label className="block text-[10px] text-neutral-500 mb-1 uppercase">Contact Mobile</label>
                  <input 
                    type="text" 
                    value={profileForm.contact} 
                    onChange={e => setProfileForm({ ...profileForm, contact: e.target.value })} 
                    className="w-full bg-neutral-900 border border-neutral-850 focus:border-cyan-500 text-white p-2 rounded focus:outline-none"
                    placeholder="Enter contact number..."
                  />
                </div>

                <div>
                  <label className="block text-[10px] text-neutral-500 mb-1 uppercase">Email Address</label>
                  <input 
                    type="email" 
                    value={profileForm.email} 
                    onChange={e => setProfileForm({ ...profileForm, email: e.target.value })} 
                    className="w-full bg-neutral-900 border border-neutral-850 focus:border-cyan-500 text-white p-2 rounded focus:outline-none"
                    placeholder="Enter email address..."
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] text-neutral-500 mb-1 uppercase">Blood Group</label>
                    <input 
                      type="text" 
                      value={profileForm.bloodGroup} 
                      onChange={e => setProfileForm({ ...profileForm, bloodGroup: e.target.value })} 
                      className="w-full bg-neutral-900 border border-neutral-850 focus:border-cyan-500 text-white p-2 rounded focus:outline-none"
                      placeholder="e.g. O+"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-neutral-500 mb-1 uppercase">Emergency Contact</label>
                    <input 
                      type="text" 
                      value={profileForm.emergencyContact} 
                      onChange={e => setProfileForm({ ...profileForm, emergencyContact: e.target.value })} 
                      className="w-full bg-neutral-900 border border-neutral-850 focus:border-cyan-500 text-white p-2 rounded focus:outline-none"
                      placeholder="Name / Phone..."
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] text-neutral-500 mb-1 uppercase">PME Medical Expiry</label>
                  <input 
                    type="date" 
                    value={profileForm.medicalValidTill} 
                    onChange={e => setProfileForm({ ...profileForm, medicalValidTill: e.target.value })} 
                    className="w-full bg-neutral-900 border border-neutral-850 focus:border-cyan-500 text-white p-2 rounded focus:outline-none"
                  />
                </div>

                <button 
                  onClick={handleSaveProfile}
                  className="w-full bg-gradient-to-r from-cyan-600 to-emerald-600 hover:from-cyan-500 hover:to-emerald-500 text-black font-black py-2.5 rounded-lg text-[10px] uppercase tracking-widest transition shadow-lg flex items-center justify-center gap-1"
                >
                  <Send className="h-3 w-3" /> Save Details
                </button>
              </div>
            </div>

          </div>
        ) : null}
      </main>

      {/* 3. AMOLED Bottom Bar */}
      <footer className="fixed bottom-0 inset-x-0 bg-black border-t border-neutral-900 max-w-md mx-auto flex justify-around p-2.5 z-40">
        {canViewDuty && (
          <button 
            onClick={() => setActiveTab('TODAY')}
            className={`flex flex-col items-center gap-1.5 text-[9px] font-black uppercase tracking-wider ${activeTab === 'TODAY' ? 'text-cyan-400' : 'text-neutral-500'}`}
          >
            <Clock className="h-5 w-5" />
            <span>Duty</span>
          </button>
        )}
        {canViewSwaps && (
          <button 
            onClick={() => setActiveTab('REQUESTS')}
            className={`flex flex-col items-center gap-1.5 text-[9px] font-black uppercase tracking-wider ${activeTab === 'REQUESTS' ? 'text-cyan-400' : 'text-neutral-500'}`}
          >
            <RefreshCw className="h-5 w-5" />
            <span>Swaps</span>
          </button>
        )}
        {canViewKpis && (
          <button 
            onClick={() => setActiveTab('REPORTS')}
            className={`flex flex-col items-center gap-1.5 text-[9px] font-black uppercase tracking-wider ${activeTab === 'REPORTS' ? 'text-cyan-400' : 'text-neutral-500'}`}
          >
            <FileText className="h-5 w-5" />
            <span>KPIs</span>
          </button>
        )}
      </footer>

    </div>
  );
}
