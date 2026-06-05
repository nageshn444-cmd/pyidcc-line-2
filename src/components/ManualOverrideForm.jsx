import React, { useState } from 'react';
import { db } from '../firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { BMRCL_CREW_REGISTRY } from './BmrclCrewRegistry';

export default function ManualOverrideForm({ activeTrain, onClose }) {
  const [selectedOpId, setSelectedOpId] = useState(activeTrain?.currentOperator?.employeeId || '');
  const [isShortLoop, setIsShortLoop] = useState(activeTrain?.isShortLoopActive || false);
  const [updating, setUpdating] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleOverrideSubmit = async (e) => {
    e.preventDefault();
    setUpdating(true);
    setSuccess(false);

    const targetDate = new Date().toISOString().split('T')[0];
    const docRef = doc(db, 'daily_crew_tracks', `${targetDate}_${activeTrain?.trainId || 'unknown'}`);
    const operatorProfile = BMRCL_CREW_REGISTRY.find(emp => emp.id === selectedOpId);

    try {
      await updateDoc(docRef, {
        isShortLoopActive: isShortLoop,
        terminalLoopRoute: isShortLoop ? "NGSA-PUTH" : "BIET-APTS",
        lastDatabaseSync: new Date().toISOString(),
        "currentOperator.employeeId": operatorProfile?.id || "N/A",
        "currentOperator.name": operatorProfile?.name || "UNASSIGNED",
        "currentOperator.contactNumber": operatorProfile?.contact || "",
        "currentOperator.isManualOverride": true
      });

      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        onClose();
      }, 1500);
    } catch (err) {
      console.error("Deviation update rejected by firewall:", err);
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div style={{ background: 'var(--occ-bg-card)', border: '1px solid var(--occ-border)', padding: '20px', borderRadius: '12px' }}>
      <h3 style={{ margin: '0 0 16px 0', color: '#ffffff' }}>Manual Override: Train {activeTrain?.trainId}</h3>
      
      <form onSubmit={handleOverrideSubmit}>
        <div style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <label style={{ fontSize: '13px', color: 'var(--occ-text-secondary)' }}>Route Configuration Pattern:</label>
          <button
            type="button"
            onClick={() => setIsShortLoop(!isShortLoop)}
            style={{
              padding: '6px 12px', borderRadius: '20px', border: 'none', cursor: 'pointer', fontWeight: 'bold',
              backgroundColor: isShortLoop ? 'var(--occ-neon-amber)' : 'var(--occ-bg-surface)',
              color: isShortLoop ? '#000' : '#fff'
            }}
          >
            {isShortLoop ? 'NGSA-PUTH Short Loop' : 'BIET-APTS Full Line'}
          </button>
        </div>

        <div style={{ marginBottom: '25px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', color: 'var(--occ-text-secondary)' }}>
            Assign Hot-Swap Operator:
          </label>
          <select
            value={selectedOpId}
            onChange={(e) => setSelectedOpId(e.target.value)}
            style={{ width: '100%', padding: '10px', borderRadius: '6px', backgroundColor: 'var(--occ-bg-surface)', color: '#fff', border: '1px solid var(--occ-border)' }}
            required
          >
            <option value="">-- Select Active Crew Target --</option>
            {BMRCL_CREW_REGISTRY.map(emp => (
              <option key={emp.id} value={emp.id}>
                {emp.name} ({emp.id}) - {emp.designation}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <button type="button" onClick={onClose} style={{ padding: '8px 14px', background: 'transparent', color: '#fff', border: '1px solid var(--occ-border)', borderRadius: '6px', cursor: 'pointer' }}>Cancel</button>
          <button type="submit" style={{ padding: '8px 14px', background: 'var(--occ-neon-green)', color: '#000', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }} disabled={updating}>Commit Live Swap</button>
        </div>
      </form>
      {success && <div style={{ marginTop: '12px', color: 'var(--occ-neon-green)', fontSize: '12px', textAlign: 'center' }}>? Dynamic track synchronized.</div>}
    </div>
  );
}
