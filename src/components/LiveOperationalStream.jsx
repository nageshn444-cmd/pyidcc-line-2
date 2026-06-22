/* eslint-disable react/prop-types */
import React, { useEffect, useState } from 'react';
import { db } from '../firebase';
import { collectionGroup, onSnapshot, query, where, orderBy } from 'firebase/firestore';

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
        <div className="occ-label-mini text-slate-400 font-mono animate-pulse">Initializing Live BMRCL Data Streams...</div>
      </div>
    );
  }

  return (
    <div className="occ-matrix-grid grid grid-cols-1 md:grid-cols-2 gap-4">
      {activeTracks.map((track) => (
        <div key={track.trainId} className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
           <h4 className="text-emerald-400 font-bold mb-2 font-mono">Train ID: {track.trainId}</h4>
           <div className="text-slate-400 text-xs font-mono">System Time: {systemTime.toLocaleTimeString()}</div>
        </div>
      ))}
      
      {activeTracks.length === 0 && (
        <div className="col-span-full text-center p-8 text-slate-500 bg-slate-900 rounded-xl border border-dashed border-slate-800 font-mono text-sm">
          No active rolling units matching this filter profile are logged on Line 2 paths today.
        </div>
      )}
    </div>
  );
}
