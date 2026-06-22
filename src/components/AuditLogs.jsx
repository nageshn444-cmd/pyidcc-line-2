import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { History, ShieldAlert, Monitor, Calendar, Search } from 'lucide-react';

export default function AuditLogs() {
  const [activeSubTab, setActiveSubTab] = useState('AUDIT'); // AUDIT or LOGIN
  const [auditLogs, setAuditLogs] = useState([]);
  const [loginHistory, setLoginHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterAction, setFilterAction] = useState('ALL');

  const fetchData = async () => {
    try {
      setLoading(true);
      
      // Fetch system audit logs
      const auditQuery = query(collection(db, 'auditLogs'), orderBy('timestamp', 'desc'), limit(150));
      const auditSnap = await getDocs(auditQuery);
      setAuditLogs(auditSnap.docs.map(d => ({ id: d.id, ...d.data() })));

      // Fetch login history
      const loginQuery = query(collection(db, 'login_history'), orderBy('timestamp', 'desc'), limit(150));
      const loginSnap = await getDocs(loginQuery);
      setLoginHistory(loginSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [activeSubTab]);

  // Unique actions for filters
  const actionTypes = ['ALL', ...new Set(auditLogs.map(log => log.action))];

  // Filtering audit logs
  const filteredAudit = auditLogs.filter(log => {
    const matchesSearch = 
      String(log.performedByName).toLowerCase().includes(searchTerm.toLowerCase()) ||
      String(log.details).toLowerCase().includes(searchTerm.toLowerCase()) ||
      String(log.performedBy).toLowerCase().includes(searchTerm.toLowerCase());
    const matchesAction = filterAction === 'ALL' || log.action === filterAction;
    return matchesSearch && matchesAction;
  });

  // Filtering login history
  const filteredLogin = loginHistory.filter(log => {
    return (
      String(log.employeeName).toLowerCase().includes(searchTerm.toLowerCase()) ||
      String(log.employeeId).toLowerCase().includes(searchTerm.toLowerCase()) ||
      String(log.device).toLowerCase().includes(searchTerm.toLowerCase()) ||
      String(log.status).toLowerCase().includes(searchTerm.toLowerCase())
    );
  });

  return (
    <div className="space-y-6 font-mono text-slate-100">
      {/* Header & Tabs */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 border-b border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <History className="h-6 w-6 text-amber-500" />
          <div>
            <h2 className="text-lg font-black tracking-wider uppercase">Security & Session Auditing</h2>
            <p className="text-[10px] text-slate-400 mt-1 uppercase tracking-widest">Chronological tracing of user actions, modifications, and hardware terminals</p>
          </div>
        </div>
        
        <div className="flex bg-slate-900 border border-slate-700 rounded-lg p-1">
          <button 
            onClick={() => { setActiveSubTab('AUDIT'); setSearchTerm(''); setFilterAction('ALL'); }} 
            className={`px-4 py-1.5 text-xs font-bold rounded tracking-wider transition-colors ${activeSubTab === 'AUDIT' ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-slate-200'}`}
          >
            SYSTEM AUDIT
          </button>
          <button 
            onClick={() => { setActiveSubTab('LOGIN'); setSearchTerm(''); }} 
            className={`px-4 py-1.5 text-xs font-bold rounded tracking-wider transition-colors ${activeSubTab === 'LOGIN' ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-slate-200'}`}
          >
            LOGIN LOGS
          </button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 bg-slate-900 border border-slate-800 p-3 rounded-lg shadow-md">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
          <input 
            type="text" 
            placeholder={activeSubTab === 'AUDIT' ? "Search Name, details..." : "Search Employee, device, status..."}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 rounded pl-9 pr-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-500 transition-colors"
          />
        </div>

        {activeSubTab === 'AUDIT' && (
          <div className="w-full sm:w-48">
            <select 
              value={filterAction}
              onChange={(e) => setFilterAction(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
            >
              {actionTypes.map(act => (
                <option key={act} value={act}>{act}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Logs Display Panel */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-2xl">
        {loading ? (
          <div className="text-center py-20 text-slate-500 font-bold uppercase tracking-widest animate-pulse">Syncing logs data...</div>
        ) : activeSubTab === 'AUDIT' ? (
          /* SYSTEM AUDIT TRAIL TABLE */
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs whitespace-nowrap">
              <thead className="bg-slate-950 text-slate-500 uppercase tracking-widest text-[9px]">
                <tr>
                  <th className="p-3 w-40">Timestamp</th>
                  <th className="p-3 w-32 text-center">Action Category</th>
                  <th className="p-3 w-48">Performed By</th>
                  <th className="p-3">Details / Modification Trace</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {filteredAudit.length === 0 ? (
                  <tr>
                    <td colSpan="4" className="p-6 text-center text-slate-500 italic">No audit records match the query filter.</td>
                  </tr>
                ) : (
                  filteredAudit.map(log => (
                    <tr key={log.id} className="hover:bg-slate-800/30">
                      <td className="p-3 text-[10px] text-slate-500">
                        {log.timestamp?.toDate ? log.timestamp.toDate().toLocaleString() : '--'}
                      </td>
                      <td className="p-3 text-center">
                        <span className={`px-2 py-0.5 rounded text-[9px] font-black tracking-widest uppercase border ${
                          log.action.includes('CHANGE') || log.action.includes('RESET') ? 'bg-amber-950 border-amber-800 text-amber-400' :
                          log.action.includes('REGISTER') || log.action.includes('CREATE') || log.action.includes('APPROVE') ? 'bg-emerald-950 border-emerald-800 text-emerald-400' : 'bg-slate-950 border-slate-800 text-slate-400'
                        }`}>
                          {log.action}
                        </span>
                      </td>
                      <td className="p-3 font-bold">
                        {log.performedByName} 
                        <span className="text-[10px] text-slate-500 block">ID: {log.performedBy}</span>
                      </td>
                      <td className="p-3 text-slate-300 font-semibold">{log.details}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : (
          /* LOGIN SESSION HISTORY TABLE */
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs whitespace-nowrap">
              <thead className="bg-slate-950 text-slate-500 uppercase tracking-widest text-[9px]">
                <tr>
                  <th className="p-3 w-40">Timestamp</th>
                  <th className="p-3 w-48">Employee Profile</th>
                  <th className="p-3 w-28 text-center">Result Status</th>
                  <th className="p-3 w-64">Terminal / Agent</th>
                  <th className="p-3">Remarks / Failure Trace</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {filteredLogin.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="p-6 text-center text-slate-500 italic">No login logs match the query filter.</td>
                  </tr>
                ) : (
                  filteredLogin.map(log => (
                    <tr key={log.id} className="hover:bg-slate-800/30">
                      <td className="p-3 text-[10px] text-slate-500">
                        {log.timestamp?.toDate ? log.timestamp.toDate().toLocaleString() : '--'}
                      </td>
                      <td className="p-3 font-bold">
                        {log.employeeName}
                        <span className="text-[10px] text-slate-500 block">ID: {log.employeeId}</span>
                      </td>
                      <td className="p-3 text-center">
                        {log.status === 'SUCCESS' ? (
                          <span className="bg-emerald-950 border border-emerald-800 text-emerald-400 font-black px-2 py-0.5 rounded text-[9px] tracking-widest uppercase">
                            SUCCESS
                          </span>
                        ) : (
                          <span className="bg-rose-950 border border-rose-800 text-rose-400 font-black px-2 py-0.5 rounded text-[9px] tracking-widest uppercase">
                            FAILED
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-slate-400 font-mono text-[10px] max-w-xs truncate" title={log.device}>
                        <div className="flex items-center gap-1.5">
                          <Monitor className="h-3 w-3 text-slate-500" />
                          <span>{log.device}</span>
                        </div>
                      </td>
                      <td className="p-3 text-slate-400 italic text-[10px]">{log.reason || 'None'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
