import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { db } from '../firebase';
import { writeBatch, doc } from 'firebase/firestore';

export default function GccRosterUploader() {
  const [status, setStatus] = useState('');
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onload = async (evt) => {
      const bstr = evt.target.result;
      const wb = XLSX.read(bstr, { type: 'binary' });
      const rawData = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
      
      const batch = writeBatch(db);
      const targetDate = new Date().toISOString().split('T')[0];
      
      rawData.forEach((row) => {
        const trainId = parseInt(row['Train No'] || row['Train ID']);
        if(trainId >= 201 && trainId <= 223) {
          const docRef = doc(db, 'daily_crew_tracks', `${targetDate}_${trainId}`);
          batch.set(docRef, {
            date: targetDate,
            trainId: trainId,
            isShortLoopActive: String(row['Trip Pattern']).includes('SHORT'),
            currentOperator: {
              employeeId: String(row['Employ id']),
              name: String(row['TO NAME']),
              dutyNumber: String(row['Duty No'])
            }
          }, { merge: true });
        }
      });
      await batch.commit();
      setStatus('GCC Roster Matrix safely deployed to live tracks.');
    };
    reader.readAsBinaryString(file);
  };
  return (
    <div className="occ-crew-block">
      <h3>Ingest Manual GCC Data</h3>
      <input type="file" onChange={handleFileUpload} />
      <p>{status}</p>
    </div>
  );
}
