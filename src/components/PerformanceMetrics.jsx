/* eslint-disable react/prop-types */
import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { TrendingUp } from 'lucide-react';

export default function PerformanceMetrics({ incidents = [] }) {
  const data = incidents.reduce((acc, inc) => {
    const existing = acc.find(item => item.trainId === inc.trainId);
    const delayMins = Number(inc.delayMins) || 0;
    if (existing) {
      existing.delay += delayMins;
    } else {
      acc.push({ trainId: inc.trainId, delay: delayMins });
    }
    return acc;
  }, []);

  return (
    <div className='bg-slate-900 p-6 rounded-xl border border-slate-800 shadow-xl'>
      <h2 className='text-emerald-400 font-bold mb-6 flex items-center gap-2'>
        <TrendingUp className='h-5 w-5' /> TRAIN DELAY IMPACT ANALYSIS
      </h2>
      <div className='h-64 w-full'>
        <ResponsiveContainer width={250} height={250}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray='3 3' stroke='#334155' />
            <XAxis dataKey='trainId' stroke='#94a3b8' fontSize={12} />
            <YAxis stroke='#94a3b8' fontSize={12} />
            <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155' }} />
            <Bar dataKey='delay' fill='#10b981'>
              {data.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.delay > 10 ? '#ef4444' : '#10b981'} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      {data.length === 0 && (
        <p className='mt-4 text-sm text-slate-500'>No live delay incidents logged for the selected schedule.</p>
      )}
    </div>
  );
}
