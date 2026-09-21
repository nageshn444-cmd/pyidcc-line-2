import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { 
  Calendar, CheckCircle, FileText, User, ChevronRight, 
  Clock, MapPin, ShieldAlert, Award, Compass, RefreshCw, Send, 
  FileSpreadsheet, Sparkles, AlertCircle, Eye, Radio
} from 'lucide-react';
import { db } from '../../firebase';
import { doc, setDoc, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { getRolling7Days, toDateIsoStr } from '../../utils/rosterDateUtils';

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

  // ── Rolling 7-Day Roster View Support (Today, Tomorrow, Day +2 ... Day +6) ──
  const rollingDays = useMemo(() => getRolling7Days(new Date()), []);
  const [selectedDayOffset, setSelectedDayOffset] = useState(0); // 0 = TODAY, 1 = TOMORROW, etc.
  const selectedDayObj = rollingDays[selectedDayOffset] || rollingDays[0];
  const selectedDateStr = selectedDayObj.dateStr;

  // Real-time listener for selected day's published roster
  const [selectedDayRoster, setSelectedDayRoster] = useState(null);
  const [loadingDayRoster, setLoadingDayRoster] = useState(false);

  useEffect(() => {
    if (selectedDayOffset === 0) {
      const docRef = doc(db, 'dispatch_excel_cache', selectedDateStr);
      const unsub = onSnapshot(docRef, (snap) => {
        if (snap.exists()) {
          setSelectedDayRoster(snap.data());
        } else {
          const currentRef = doc(db, 'dispatch_excel_cache', 'current');
          const unsubCurrent = onSnapshot(currentRef, (currSnap) => {
            if (currSnap.exists()) setSelectedDayRoster(currSnap.data());
          });
          return () => unsubCurrent();
        }
      });
      return () => unsub();
    } else {
      setLoadingDayRoster(true);
      const docRef = doc(db, 'dispatch_excel_cache', selectedDateStr);
      const unsub = onSnapshot(docRef, (snap) => {
        if (snap.exists()) {
          setSelectedDayRoster(snap.data());
        } else {
          setSelectedDayRoster(null);
        }
        setLoadingDayRoster(false);
      }, (err) => {
        console.warn('Selected day roster listener error:', err);
        setLoadingDayRoster(false);
      });
      return () => unsub();
    }
  }, [selectedDateStr, selectedDayOffset]);

  // Compute assignment for the selected day
  const selectedDayAssignment = useMemo(() => {
    if (!empId) return null;
    const cleanId = String(empId).trim().toLowerCase();

    if (selectedDayOffset === 0 && myDeployment) {
      return { type: 'DUTY', ...myDeployment };
    }

    if (!selectedDayRoster) return null;

    // 1. In duties
    const dMatch = (selectedDayRoster.duties || []).find(
      d => String(d.empId || '').trim().toLowerCase() === cleanId
    );
    if (dMatch) return { type: 'DUTY', ...dMatch };

    // 2. In weekly offs
    const woMatch = (selectedDayRoster.weeklyOffs || []).find(
      w => String(w.empNo || w.empId || '').trim().toLowerCase() === cleanId
    );
    if (woMatch) return { type: 'WEEKLY_OFF', name: woMatch.name || woMatch.empName };

    // 3. In leaves
    const lvMatch = (selectedDayRoster.leaves || []).find(
      l => String(l.empNo || l.empId || '').trim().toLowerCase() === cleanId
    );
    if (lvMatch) return { type: 'LEAVE', leaveType: lvMatch.type || 'CL', from: lvMatch.from, name: lvMatch.name };

    // 4. In CC desks
    const ccMatch = (selectedDayRoster.controlDesks || []).find(
      c => String(c.empNo || c.empId || '').trim().toLowerCase() === cleanId
    );
    if (ccMatch) return { type: 'CC_DESK', code: ccMatch.code || 'CC Desk', time: ccMatch.time, name: ccMatch.name };

    // 5. In standbys
    const sbMatch = (selectedDayRoster.standbys || []).find(
      s => String(s.empNo || s.empId || '').trim().toLowerCase() === cleanId
    );
    if (sbMatch) return { type: 'STANDBY', code: sbMatch.code || 'OR', time: sbMatch.time, name: sbMatch.name };

    // 6. In stepbacks
    const stbkMatch = (selectedDayRoster.outstationStepbacks || []).find(
      s => String(s.empNo || s.empId || '').trim().toLowerCase() === cleanId
    );
    if (stbkMatch) return { type: 'STEPBACK', station: stbkMatch.station || 'PUTH', time: stbkMatch.time, name: stbkMatch.name };

    // 7. In CRRC training
    const customRegs = selectedDayRoster.customRegisters || {};
    const crrcList = customRegs['CRRC 4RS DM-DTG TRAINING AT PEENYA DEPOT (RBL)'] || 
                     customRegs['RS CRRC-DM Train 440kms Trg'] || 
                     selectedDayRoster.crtTraining || [];
    const trgMatch = crrcList.find(
      t => String(t.empNo || t.empId || '').trim().toLowerCase() === cleanId
    );
    if (trgMatch) return { type: 'TRAINING', tag: 'RS CRRC-DM Train 440kms Trg', name: trgMatch.name };

    return null;
  }, [empId, selectedDayOffset, myDeployment, selectedDayRoster]);

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
      const canonicalCrewId = String(empId).startsWith('crew_') ? String(empId) : `crew_${empId}`;
      const registryRef = doc(db, 'crewRegistry', canonicalCrewId);
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
        <div className="flex items-center gap-2">
          <Link
            to="/fault-reporting"
            className="flex items-center gap-1 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 text-[10px] font-bold px-2 py-1 rounded transition"
            title="Report Train/Mainline Fault via AI"
          >
            <ShieldAlert className="h-3 w-3 text-rose-400 animate-pulse" />
            <span>FAULT</span>
          </Link>
          <button 
            onClick={logout}
            className="text-neutral-500 hover:text-white text-[10px] font-bold border border-neutral-850 px-2.5 py-1 rounded"
          >
            Sign-Out
          </button>
        </div>
      </header>

      {/* 2. Scrollable Body Content */}
      <main className="flex-1 p-4 overflow-y-auto mb-16 space-y-4">
        
        {activeTab === 'TODAY' ? (
          <div className="space-y-4">

            {/* 7-Day Rolling Selector (Today, Tomorrow, Day +2 ... Day +6) */}
            <div className="bg-neutral-900/90 border border-neutral-800 rounded-xl p-2.5 space-y-2">
              <div className="flex items-center justify-between text-[10px] uppercase font-bold text-neutral-400">
                <span className="flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-cyan-400" />
                  Select Duty Day (Next 7 Days):
                </span>
                <span className="text-cyan-400 font-mono font-black">{selectedDayObj.sheetTag}</span>
              </div>
              
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                {rollingDays.map((d, idx) => {
                  const isSelected = idx === selectedDayOffset;
                  return (
                    <button
                      key={d.dateStr}
                      type="button"
                      onClick={() => setSelectedDayOffset(idx)}
                      className={`flex flex-col items-center px-2.5 py-1.5 rounded-lg text-[10px] font-mono font-bold transition shrink-0 ${
                        isSelected
                          ? 'bg-cyan-500 text-black shadow-lg shadow-cyan-950/40 ring-2 ring-cyan-300'
                          : 'bg-neutral-950 hover:bg-neutral-850 text-neutral-400 hover:text-white border border-neutral-800'
                      }`}
                    >
                      <span className="text-[8px] uppercase tracking-wider">{d.badge}</span>
                      <span className="text-xs">{d.sheetTag}</span>
                      <span className="text-[8px] font-normal">{d.shortDay}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            
            {/* ── TODAY'S VIEW (OFFSET = 0) ── */}
            {selectedDayOffset === 0 ? (
              <div className="space-y-4">
                {/* Today's Duty Card */}
                <div className="border border-neutral-850 bg-neutral-950 p-4 rounded-xl space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] text-neutral-500 font-bold uppercase tracking-widest block">Today's Duty Info ({selectedDayObj.displayLabel})</span>
                    <span className="text-[9px] px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-300 font-bold border border-emerald-800">ACTIVE LIVE</span>
                  </div>
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

                      <button
                        onClick={() => setActiveTab('NOTICE')}
                        className="w-full flex items-center justify-center gap-2 bg-neutral-900 hover:bg-neutral-850 border border-neutral-800 text-neutral-300 hover:text-white text-xs font-bold py-2.5 rounded-lg transition"
                      >
                        <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                        <span>View Today's Official GCC Roster Sheet</span>
                      </button>
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
                              <label className="text-[9px] text-neutral-500 uppercase font-bold" htmlFor="trainoperatorpwa-i1">Duty ID</label>
                              <input id="trainoperatorpwa-i1" name="trainoperatorpwa-i1"
                                type="text"
                                placeholder="e.g. D10 or 12"
                                value={manualDutyId}
                                onChange={(e) => setManualDutyId(e.target.value)}
                                className="w-full bg-neutral-900 border border-neutral-800 rounded p-2 text-white font-mono"
                                required
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[9px] text-neutral-500 uppercase font-bold" htmlFor="trainoperatorpwa-i2">Train ID</label>
                              <input id="trainoperatorpwa-i2" name="trainoperatorpwa-i2"
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
                              <label className="text-[9px] text-neutral-500 uppercase font-bold" htmlFor="trainoperatorpwa-i3">Sign-On Time</label>
                              <input id="trainoperatorpwa-i3" name="trainoperatorpwa-i3"
                                type="text"
                                placeholder="e.g. 06:00:00"
                                value={manualSignOnTime}
                                onChange={(e) => setManualSignOnTime(e.target.value)}
                                className="w-full bg-neutral-900 border border-neutral-800 rounded p-2 text-white font-mono"
                                required
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[9px] text-neutral-500 uppercase font-bold" htmlFor="trainoperatorpwa-i4">Sign-Off Time</label>
                              <input id="trainoperatorpwa-i4" name="trainoperatorpwa-i4"
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
                            <label className="text-[9px] text-neutral-500 uppercase font-bold" htmlFor="trainoperatorpwa-i5">Sign-On Location</label>
                            <select id="trainoperatorpwa-i5" name="trainoperatorpwa-i5"
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

                      <button
                        onClick={() => setActiveTab('NOTICE')}
                        className="w-full flex items-center justify-center gap-2 bg-neutral-900 hover:bg-neutral-850 border border-neutral-800 text-neutral-300 hover:text-white text-xs font-bold py-2.5 rounded-lg transition"
                      >
                        <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                        <span>View Today's Official GCC Roster Sheet</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* ── TOMORROW & NEXT 7 DAYS VIEW (OFFSET > 0) ── */
              <div className="space-y-4">
                {loadingDayRoster ? (
                  <div className="border border-neutral-850 bg-neutral-950 p-6 rounded-xl text-center text-neutral-400 flex flex-col items-center justify-center gap-2">
                    <RefreshCw className="w-5 h-5 text-cyan-400 animate-spin" />
                    <span className="text-xs font-mono">Checking Published Roster for {selectedDayObj.displayLabel}...</span>
                  </div>
                ) : !selectedDayRoster || !selectedDayRoster.duties || selectedDayRoster.duties.length === 0 ? (
                  /* Pending Publication Card */
                  <div className="border border-neutral-850 bg-neutral-950 p-5 rounded-xl text-center space-y-3">
                    <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-2xl inline-flex text-amber-400">
                      <AlertCircle className="w-8 h-8" />
                    </div>
                    <div>
                      <h4 className="text-sm font-black text-white uppercase tracking-wider">
                        {selectedDayObj.relativeLabel} Roster ({selectedDayObj.sheetTag}) Pending Publication
                      </h4>
                      <p className="text-xs text-neutral-400 mt-1">
                        GCC Desk has not published the official duty roster for {selectedDayObj.fullOfficialTitle} yet.
                      </p>
                    </div>
                    <div className="text-[10px] text-neutral-500 font-mono bg-neutral-900/60 p-2.5 rounded border border-neutral-850">
                      As soon as GCC deploys the roster, it will sync here automatically in real time.
                    </div>
                  </div>
                ) : (
                  /* Published Roster Card for Operator */
                  <div className="space-y-3">
                    {selectedDayAssignment?.type === 'DUTY' ? (
                      <div className="border border-cyan-800/80 bg-gradient-to-b from-cyan-955/40 to-neutral-950 p-4 rounded-xl space-y-3 shadow-xl">
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] text-cyan-400 font-black uppercase tracking-widest flex items-center gap-1.5">
                            <Sparkles className="w-3.5 h-3.5" />
                            {selectedDayObj.relativeLabel.toUpperCase()}'S PUBLISHED DUTY
                          </span>
                          <span className="text-[9px] px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-300 font-mono font-bold border border-emerald-800">
                            PUBLISHED BY GCC
                          </span>
                        </div>

                        <div className="flex justify-between items-center">
                          <span className="text-xl font-black text-cyan-300">
                            DUTY ID: {selectedDayAssignment.dutyId}
                          </span>
                          <span className="text-xs bg-neutral-900 border border-neutral-800 px-2.5 py-1 rounded text-cyan-400 font-mono font-bold">
                            Train: {selectedDayAssignment.trainId || 'Auto'}
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                          <div className="bg-neutral-900/80 p-2.5 rounded-lg border border-neutral-850 flex items-center gap-2">
                            <Clock className="h-4 w-4 text-cyan-400 shrink-0" />
                            <div>
                              <div className="text-[9px] text-neutral-500">SIGN-ON</div>
                              <div className="font-bold text-white">{selectedDayAssignment.signOnTime}</div>
                              <div className="text-[9px] text-cyan-400">{selectedDayAssignment.signOnLocation}</div>
                            </div>
                          </div>
                          <div className="bg-neutral-900/80 p-2.5 rounded-lg border border-neutral-850 flex items-center gap-2">
                            <Clock className="h-4 w-4 text-rose-400 shrink-0" />
                            <div>
                              <div className="text-[9px] text-neutral-500">SIGN-OFF</div>
                              <div className="font-bold text-white">{selectedDayAssignment.signOffTime}</div>
                              <div className="text-[9px] text-rose-300">{selectedDayAssignment.signOffLocation}</div>
                            </div>
                          </div>
                        </div>

                        {selectedDayAssignment.dutyType && (
                          <div className="text-[11px] text-neutral-400 bg-neutral-900/60 px-2.5 py-1.5 rounded border border-neutral-850 flex justify-between font-mono">
                            <span>Service Type:</span>
                            <span className="text-white font-bold">{selectedDayAssignment.dutyType}</span>
                          </div>
                        )}

                        <button
                          onClick={() => setActiveTab('NOTICE')}
                          className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-black font-black text-xs py-3 rounded-lg uppercase tracking-wider transition shadow-lg shadow-emerald-950/40"
                        >
                          <FileSpreadsheet className="w-4 h-4" />
                          <span>View Official GCC Roster Sheet ({selectedDayObj.sheetTag})</span>
                        </button>
                      </div>
                    ) : selectedDayAssignment?.type === 'WEEKLY_OFF' ? (
                      <div className="border border-emerald-800/80 bg-gradient-to-b from-emerald-955/40 to-neutral-950 p-5 rounded-xl space-y-3 text-center shadow-xl">
                        <div className="p-3 bg-emerald-500/20 border border-emerald-500/40 rounded-full inline-flex text-emerald-400">
                          <Award className="w-8 h-8" />
                        </div>
                        <div>
                          <h4 className="text-base font-black text-emerald-300 uppercase tracking-wider">
                            WEEKLY OFF / REST DAY (WO)
                          </h4>
                          <p className="text-xs text-emerald-200/80 mt-1">
                            You are assigned to official Weekly Off on {selectedDayObj.displayLabel}.
                          </p>
                        </div>
                        <button
                          onClick={() => setActiveTab('NOTICE')}
                          className="w-full flex items-center justify-center gap-2 bg-neutral-900 hover:bg-neutral-850 border border-neutral-800 text-neutral-300 hover:text-white text-xs font-bold py-2.5 rounded-lg transition"
                        >
                          <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                          <span>View Official GCC Roster Sheet ({selectedDayObj.sheetTag})</span>
                        </button>
                      </div>
                    ) : selectedDayAssignment?.type === 'LEAVE' ? (
                      <div className="border border-rose-800/80 bg-gradient-to-b from-rose-955/40 to-neutral-950 p-5 rounded-xl space-y-3 text-center shadow-xl">
                        <div className="p-3 bg-rose-500/20 border border-rose-500/40 rounded-full inline-flex text-rose-400">
                          <AlertCircle className="w-8 h-8" />
                        </div>
                        <div>
                          <h4 className="text-base font-black text-rose-300 uppercase tracking-wider">
                            APPROVED LEAVE ({selectedDayAssignment.leaveType})
                          </h4>
                          <p className="text-xs text-rose-200/80 mt-1">
                            Recorded in the GCC Daily Roster Register for {selectedDayObj.displayLabel}.
                          </p>
                        </div>
                        <button
                          onClick={() => setActiveTab('NOTICE')}
                          className="w-full flex items-center justify-center gap-2 bg-neutral-900 hover:bg-neutral-850 border border-neutral-800 text-neutral-300 hover:text-white text-xs font-bold py-2.5 rounded-lg transition"
                        >
                          <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                          <span>View Official GCC Roster Sheet ({selectedDayObj.sheetTag})</span>
                        </button>
                      </div>
                    ) : selectedDayAssignment ? (
                      <div className="border border-indigo-800/80 bg-gradient-to-b from-indigo-955/40 to-neutral-950 p-5 rounded-xl space-y-3 text-center shadow-xl">
                        <h4 className="text-base font-black text-indigo-300 uppercase tracking-wider">
                          SPECIAL ASSIGNMENT: {selectedDayAssignment.code || selectedDayAssignment.tag || selectedDayAssignment.type}
                        </h4>
                        <p className="text-xs text-indigo-200/80 mt-1">
                          Scheduled for {selectedDayObj.displayLabel}.
                        </p>
                        <button
                          onClick={() => setActiveTab('NOTICE')}
                          className="w-full flex items-center justify-center gap-2 bg-neutral-900 hover:bg-neutral-850 border border-neutral-800 text-neutral-300 hover:text-white text-xs font-bold py-2.5 rounded-lg transition"
                        >
                          <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                          <span>View Official GCC Roster Sheet ({selectedDayObj.sheetTag})</span>
                        </button>
                      </div>
                    ) : (
                      <div className="border border-neutral-850 bg-neutral-950 p-5 rounded-xl text-center space-y-3">
                        <div className="text-xs text-neutral-400">
                          {selectedDayObj.sheetTag} Roster is published, but no specific duty was assigned to your Emp ID ({empId}).
                        </div>
                        <button
                          onClick={() => setActiveTab('NOTICE')}
                          className="w-full flex items-center justify-center gap-2 bg-neutral-900 hover:bg-neutral-850 border border-neutral-800 text-neutral-300 hover:text-white text-xs font-bold py-2.5 rounded-lg transition"
                        >
                          <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                          <span>View Full GCC Roster Sheet ({selectedDayObj.sheetTag})</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

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
                  <label className="block text-[10px] text-neutral-500 mb-1 uppercase" htmlFor="trainoperatorpwa-i6">Full Name (Read Only)</label>
                  <input id="trainoperatorpwa-i6" name="trainoperatorpwa-i6" 
                    type="text" 
                    value={userProfile?.employeeName || ''} 
                    disabled 
                    className="w-full bg-neutral-900/40 border border-neutral-900 text-neutral-400 p-2 rounded cursor-not-allowed font-bold"
                  />
                </div>

                <div>
                  <label className="block text-[10px] text-neutral-500 mb-1 uppercase" htmlFor="trainoperatorpwa-i7">Contact Mobile</label>
                  <input id="trainoperatorpwa-i7" name="trainoperatorpwa-i7" 
                    type="text" 
                    value={profileForm.contact} 
                    onChange={e => setProfileForm({ ...profileForm, contact: e.target.value })} 
                    className="w-full bg-neutral-900 border border-neutral-850 focus:border-cyan-500 text-white p-2 rounded focus:outline-none"
                    placeholder="Enter contact number..."
                  />
                </div>

                <div>
                  <label className="block text-[10px] text-neutral-500 mb-1 uppercase" htmlFor="trainoperatorpwa-i8">Email Address</label>
                  <input id="trainoperatorpwa-i8" name="trainoperatorpwa-i8" 
                    type="email" 
                    value={profileForm.email} 
                    onChange={e => setProfileForm({ ...profileForm, email: e.target.value })} 
                    className="w-full bg-neutral-900 border border-neutral-850 focus:border-cyan-500 text-white p-2 rounded focus:outline-none"
                    placeholder="Enter email address..."
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] text-neutral-500 mb-1 uppercase" htmlFor="trainoperatorpwa-i9">Blood Group</label>
                    <input id="trainoperatorpwa-i9" name="trainoperatorpwa-i9" 
                      type="text" 
                      value={profileForm.bloodGroup} 
                      onChange={e => setProfileForm({ ...profileForm, bloodGroup: e.target.value })} 
                      className="w-full bg-neutral-900 border border-neutral-850 focus:border-cyan-500 text-white p-2 rounded focus:outline-none"
                      placeholder="e.g. O+"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-neutral-500 mb-1 uppercase" htmlFor="trainoperatorpwa-i10">Emergency Contact</label>
                    <input id="trainoperatorpwa-i10" name="trainoperatorpwa-i10" 
                      type="text" 
                      value={profileForm.emergencyContact} 
                      onChange={e => setProfileForm({ ...profileForm, emergencyContact: e.target.value })} 
                      className="w-full bg-neutral-900 border border-neutral-850 focus:border-cyan-500 text-white p-2 rounded focus:outline-none"
                      placeholder="Name / Phone..."
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] text-neutral-500 mb-1 uppercase" htmlFor="trainoperatorpwa-i11">PME Medical Expiry</label>
                  <input id="trainoperatorpwa-i11" name="trainoperatorpwa-i11" 
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
        ) : activeTab === 'NOTICE' ? (
          <div className="space-y-4 pb-16">
            <RosterPublisherBoard userRole="TRAIN_OPERATOR" currentOperatorId={empId} />
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
        <button 
          onClick={() => setActiveTab('NOTICE')}
          className={`flex flex-col items-center gap-1.5 text-[9px] font-black uppercase tracking-wider ${activeTab === 'NOTICE' ? 'text-cyan-400' : 'text-neutral-500'}`}
        >
          <FileSpreadsheet className="h-5 w-5" />
          <span>Notice Sheet</span>
        </button>
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
        <Link
          to="/fault-reporting"
          className="flex flex-col items-center gap-1.5 text-[9px] font-black uppercase tracking-wider text-rose-400 hover:text-rose-300 transition"
        >
          <ShieldAlert className="h-5 w-5 animate-pulse" />
          <span>Faults</span>
        </Link>
      </footer>

    </div>
  );
}
