import React, { createContext, useContext, useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot, query, where, orderBy } from 'firebase/firestore';
import { useAuth } from './AuthContext';

const OperationalEngineContext = createContext(null);

export function useOperationalEngine() {
  return useContext(OperationalEngineContext);
}

export function OperationalEngineProvider({ children }) {
  const { currentUser } = useAuth();

  // Operational states
  const [users, setUsers] = useState([]);
  const [crewRegistry, setCrewRegistry] = useState([]);
  const [linkRoster, setLinkRoster] = useState([]);
  const [deployments, setDeployments] = useState([]);
  const [leaveRequests, setLeaveRequests] = useState([]);
  const [shiftExchanges, setShiftExchanges] = useState([]);
  const [wttMatrix, setWttMatrix] = useState([]);
  const [liveIncidents, setLiveIncidents] = useState([]);
  const [dispatches, setDispatches] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentUser) {
      setLoading(false);
      return;
    }

    setLoading(true);

    // Setup real-time subscribers
    const handleErr = (name, err) => {
      if (err.code !== 'permission-denied') {
        console.error(`${name} err:`, err);
      }
      setLoading(false);
    };

    // Safety timeout to ensure loading never hangs if Firestore is slow or offline
    const safetyTimer = setTimeout(() => {
      setLoading(false);
    }, 1500);

    const unsubUsers = onSnapshot(collection(db, 'users'), (snap) => {
      setUsers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, err => handleErr("OperationalEngine users", err));

    const unsubCrew = onSnapshot(collection(db, 'crewRegistry'), (snap) => {
      setCrewRegistry(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, err => handleErr("OperationalEngine crewRegistry", err));

    const unsubLinks = onSnapshot(collection(db, 'crew_final_links'), (snap) => {
      setLinkRoster(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, err => handleErr("OperationalEngine crew_final_links", err));

    const unsubDeployments = onSnapshot(collection(db, 'crew_daily_deployment'), (snap) => {
      setDeployments(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, err => handleErr("OperationalEngine crew_daily_deployment", err));

    const unsubLeaves = onSnapshot(collection(db, 'leave_requests'), (snap) => {
      setLeaveRequests(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, err => handleErr("OperationalEngine leave_requests", err));

    const unsubExchanges = onSnapshot(
      query(collection(db, 'shift_exchanges'), orderBy('timestamp', 'desc')), 
      (snap) => {
        setShiftExchanges(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      }, 
      err => handleErr("OperationalEngine shift_exchanges", err)
    );

    const unsubWtt = onSnapshot(collection(db, 'wtt_final_matrix'), (snap) => {
      setWttMatrix(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, err => handleErr("OperationalEngine wtt_final_matrix", err));

    const unsubIncidents = onSnapshot(collection(db, 'wtt_live_incidents'), (snap) => {
      setLiveIncidents(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, err => handleErr("OperationalEngine wtt_live_incidents", err));

    const unsubDispatches = onSnapshot(collection(db, 'automated_dispatch_gate'), (snap) => {
      setDispatches(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, err => handleErr("OperationalEngine automated_dispatch_gate", err));

    return () => {
      clearTimeout(safetyTimer);
      unsubUsers();
      unsubCrew();
      unsubLinks();
      unsubDeployments();
      unsubLeaves();
      unsubExchanges();
      unsubWtt();
      unsubIncidents();
      unsubDispatches();
    };
  }, [currentUser]);

  // Global Shared Cross-Navigation Context States
  const [selectedEmployee, setSelectedEmployee] = useState(null); // { employeeId, employeeName }
  const [selectedDuty, setSelectedDuty] = useState(null);         // { dutyNo, scheduleType }
  const [selectedTrain, setSelectedTrain] = useState(null);       // { trainId, location }
  const [activeTab, setActiveTab] = useState('ROSTER');            // Active module ID in Layout

  const contextValue = React.useMemo(() => ({
    users,
    crewRegistry,
    linkRoster,
    deployments,
    leaveRequests,
    shiftExchanges,
    wttMatrix,
    liveIncidents,
    dispatches,
    loading,
    selectedEmployee,
    setSelectedEmployee,
    selectedDuty,
    setSelectedDuty,
    selectedTrain,
    setSelectedTrain,
    activeTab,
    setActiveTab
  }), [
    users, crewRegistry, linkRoster, deployments, leaveRequests, 
    shiftExchanges, wttMatrix, liveIncidents, dispatches, loading,
    selectedEmployee, selectedDuty, selectedTrain, activeTab
  ]);

  return (
    <OperationalEngineContext.Provider value={contextValue}>
      {children}
    </OperationalEngineContext.Provider>
  );
}
