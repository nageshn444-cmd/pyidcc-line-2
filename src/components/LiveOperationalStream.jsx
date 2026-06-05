import React, { useEffect, useState } from 'react';
import { db } from '../firebaseConfig';
import { collectionGroup, onSnapshot, query, where, orderBy } from 'firebase/firestore';
import CrewControlDashboard from './CrewControlDashboard';

export default function LiveOperationalStream({ filterShortLoopOnly }) {
  const [activeTracks, setActiveTracks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [systemTime, setSystemTime] = useState(new Date());

  useEffect(() => {
    const clockInterval = setInterval(() => setSystemTime(new Date()), 1000);
    return () => clearInterval(clockInterval);
  }, []);

  useEffect(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    
    // Create an efficient collection group query optimized via firestore.indexes.json
    let baseQuery = query(
      collectionGroup(db, 'daily_crew_tracks'),
      where('date', '==', todayStr),
      orderBy('trainId', 'asc')
    );

    if (filterShortLoopOnly) {
      baseQuery = query(
        collectionGroup(db, 'daily_crew_tracks'),
        where('date', '==', todayStr),
        where('isShortLoopActive', '==', true),
        orderBy('trainId', 'asc')
      );
    }

    const unsubscribe = onSnapshot(baseQuery, (snapshot) => {
      const updatedTracks = [];
      snapshot.forEach((doc) => {
        updatedTracks.push({ docId: doc.id, ...doc.data() });
      });
      setActiveTracks(updatedTracks);
      setLoading(false);
    }, (error) => {
      console.error("Operational track stream subscription failed:", error);
    });

    return () => unsubscribe();
  }, [filterShortLoopOnly]);

  if (loading) {
    return (
      <div style={{ padding: '40px', color: 'var(--occ-text-secondary)', textAlign: 'center' }}>
        <div className="occ-label-mini">Initializing Live BMRCL Data Streams...</div>
      </div>
    );
  }

  return (
    <div className="occ-matrix-grid">
      {activeTracks.map((track) => (
        <CrewControlDashboard 
          key={track.trainId} 
          overrideSingleTrack={track} 
          currentSystemTime={systemTime} 
        />
      ))}
      
      {activeTracks.length === 0 && (
        <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '40px', color: 'var(--occ-text-secondary)', background: 'var(--occ-bg-card)', borderRadius: '8px', border: '1px dashed var(--occ-border)' }}>
          No active rolling units matching this filter profile are logged on Line 2 paths today.
        </div>
      )}
    </div>
  );
}
