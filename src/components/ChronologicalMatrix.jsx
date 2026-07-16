/* eslint-disable react/prop-types */
import React, { useMemo, useState, useEffect, useRef } from 'react';
import { Train, ArrowDownCircle, ArrowUpCircle, Trash2, Download, Edit3, Save, XCircle, Copy, Plus } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function ChronologicalMatrix({
  liveIncidents = [], filteredUnifiedRows = [],
  dnStationOrder = [], upStationOrder = [],
  editingCell = { rowId: null, direction: null, station: null, isTid: false },
  setEditingCell = () => { }, editValue = '', setEditValue = () => { },
  handleWttCellSave = () => { }, handleWttBulkSave = () => { }, handleDeleteTripRow = () => { },
  addDelayToTime = (time) => time, activeDay = ''
}) {
  const { userProfile } = useAuth();
  const isTrainOperator = userProfile?.role === 'TRAIN_OPERATOR' || 
                          userProfile?.role === 'STATION_CONTROLLER' || 
                          userProfile?.role === 'VIEWER' ||
                          String(userProfile?.role || '').toLowerCase().includes('operator') ||
                          String(userProfile?.role || '').toLowerCase().includes('controller') ||
                          String(userProfile?.designation || '').toLowerCase().includes('operator') ||
                          String(userProfile?.designation || '').toLowerCase().includes('controller') ||
                          String(userProfile?.designation || '').toLowerCase().includes('viewer');

  // Grab-to-scroll vertical/horizontal table management
  const wttScrollRef = useRef(null);
  const [isWttDragging, setIsWttDragging] = useState(false);
  const [wttStartX, setWttStartX] = useState(0);
  const [wttStartY, setWttStartY] = useState(0);
  const [wttScrollLeft, setWttScrollLeft] = useState(0);
  const [wttScrollTop, setWttScrollTop] = useState(0);

  const onWttMouseDown = (e) => {
    // Ignore input text inputs, paste events, selects, or button clicks
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA' || e.target.closest('button') || e.target.closest('input')) return;
    setIsWttDragging(true);
    setWttStartX(e.pageX - wttScrollRef.current.offsetLeft);
    setWttStartY(e.pageY - wttScrollRef.current.offsetTop);
    setWttScrollLeft(wttScrollRef.current.scrollLeft);
    setWttScrollTop(wttScrollRef.current.scrollTop);
  };

  const onWttMouseLeave = () => {
    setIsWttDragging(false);
  };

  const onWttMouseUp = () => {
    setIsWttDragging(false);
  };

  const onWttMouseMove = (e) => {
    if (!isWttDragging) return;
    e.preventDefault();
    const x = e.pageX - wttScrollRef.current.offsetLeft;
    const y = e.pageY - wttScrollRef.current.offsetTop;
    const walkX = (x - wttStartX) * 1.5;
    const walkY = (y - wttStartY) * 1.5;
    wttScrollRef.current.scrollLeft = wttScrollLeft - walkX;
    wttScrollRef.current.scrollTop = wttScrollTop - walkY;
  };

  const [isEditMode, setIsEditMode] = useState(false);
  const [localRows, setLocalRows] = useState([]);

  const sortedRows = useMemo(() => {
    return [...filteredUnifiedRows].sort((a, b) => {
      const getEarliestTime = (row) => {
        let minSecs = 999999;
        const timeToSeconds = (timeStr) => {
          if (!timeStr || timeStr === '--' || timeStr === '-') return 999999;
          const parts = timeStr.split(':');
          let secs = 0;
          if (parts[0]) secs += parseInt(parts[0], 10) * 3600;
          if (parts[1]) secs += parseInt(parts[1], 10) * 60;
          if (parts[2]) secs += parseInt(parts[2], 10);
          if (secs < 3 * 3600) secs += 24 * 3600;
          return secs;
        };
        const times = { ...(row.downTrip?.stations || {}), ...(row.upTrip?.stations || {}) };
        Object.values(times).forEach(t => {
          minSecs = Math.min(minSecs, timeToSeconds(t));
        });
        return minSecs;
      };
      const timeA = getEarliestTime(a);
      const timeB = getEarliestTime(b);
      if (timeA !== timeB) return timeA - timeB;
      return String(a.trainId).localeCompare(String(b.trainId), undefined, { numeric: true });
    });
  }, [filteredUnifiedRows]);

  // Sync localRows when entering edit mode or when underlying data changes and we aren't editing
  useEffect(() => {
    if (!isEditMode) {
      setLocalRows(JSON.parse(JSON.stringify(sortedRows)));
    }
  }, [sortedRows, isEditMode]);

  const toggleEditMode = () => {
    if (isEditMode) {
      if (window.confirm("Discard unsaved changes?")) {
        setIsEditMode(false);
        setLocalRows(JSON.parse(JSON.stringify(sortedRows)));
      }
    } else {
      setIsEditMode(true);
    }
  };

  const handleSaveBulk = () => {
    handleWttBulkSave(localRows);
    setIsEditMode(false);
  };

  const handleLocalCellChange = (rowIndex, direction, stationName, isTidField, value) => {
    const updated = [...localRows];
    const row = updated[rowIndex];
    if (isTidField) {
      row.trainId = value;
    } else {
      let targetTrip = direction === 'DN' ? row.downTrip : row.upTrip;
      if (!targetTrip) {
        targetTrip = { isNew: true, stations: {} };
        if (direction === 'DN') row.downTrip = targetTrip;
        else row.upTrip = targetTrip;
      }
      if (!targetTrip.stations) targetTrip.stations = {};
      const keys = Object.keys(targetTrip.stations);
      const foundKey = keys.find(k => k.trim().toLowerCase() === stationName.trim().toLowerCase());
      if (foundKey) {
        targetTrip.stations[foundKey] = value;
      } else {
        targetTrip.stations[stationName] = value;
      }
    }
    setLocalRows(updated);
  };

  const handlePaste = (e, startRowIdx, startColIdx) => {
    e.preventDefault();
    const pasteData = e.clipboardData.getData('text');
    if (!pasteData) return;

    const rows = pasteData.split(/\r?\n/).map(r => r.split('\t'));
    const updated = [...localRows];

    const columns = [
      { isTidField: true },
      ...dnStationOrder.map(st => ({ direction: 'DN', station: st })),
      ...upStationOrder.map(st => ({ direction: 'UP', station: st }))
    ];

    for (let i = 0; i < rows.length; i++) {
      const targetRowIdx = startRowIdx + i;
      // Auto-expand row if we paste beyond current rows
      if (targetRowIdx >= updated.length) {
        updated.push({
          id: `temp_${Date.now()}_${i}`,
          trainId: '',
          downTrip: { isNew: true, stations: {} },
          upTrip: { isNew: true, stations: {} }
        });
      }

      const rowValues = rows[i];
      if (rowValues.length === 1 && rowValues[0].trim() === '') continue;

      for (let j = 0; j < rowValues.length; j++) {
        const targetColIdx = startColIdx + j;
        if (targetColIdx >= columns.length) break;

        const colDef = columns[targetColIdx];
        const val = rowValues[j].trim();
        const row = updated[targetRowIdx];

        if (colDef.isTidField) {
          row.trainId = val;
        } else {
          let targetTrip = colDef.direction === 'DN' ? row.downTrip : row.upTrip;
          if (!targetTrip) {
            targetTrip = { isNew: true, stations: {} };
            if (colDef.direction === 'DN') row.downTrip = targetTrip;
            else row.upTrip = targetTrip;
          }
          if (!targetTrip.stations) targetTrip.stations = {};
          const keys = Object.keys(targetTrip.stations);
          const foundKey = keys.find(k => k.trim().toLowerCase() === colDef.station.trim().toLowerCase());
          if (foundKey) {
            targetTrip.stations[foundKey] = val;
          } else {
            targetTrip.stations[colDef.station] = val;
          }
        }
      }
    }
    setLocalRows(updated);
  };

  const handleCopyRowToClipboard = (row) => {
    const rowData = [
      row.trainId || '',
      ...dnStationOrder.map(st => row.downTrip?.stations?.[st] || ''),
      ...upStationOrder.map(st => row.upTrip?.stations?.[st] || '')
    ];
    navigator.clipboard.writeText(rowData.join('\t'));
  };

  const handleAddRow = () => {
    setLocalRows([...localRows, {
      id: `temp_${Date.now()}`,
      trainId: '',
      downTrip: { isNew: true, stations: {} },
      upTrip: { isNew: true, stations: {} }
    }]);
  };

  const onTrashClick = (row, idx) => {
    if (isEditMode && String(row.id).startsWith('temp_')) {
      const updated = [...localRows];
      updated.splice(idx, 1);
      setLocalRows(updated);
    } else {
      handleDeleteTripRow(row);
    }
  };

  const displayRows = isEditMode ? localRows : sortedRows;

  return (
    <div className="w-full">
      <div className="w-full bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-2xl">
        <div className="px-4 py-2.5 bg-slate-950 border-b border-slate-800 flex justify-between items-center text-slate-200 font-mono text-xs font-bold">
          <span className="flex items-center gap-1.5 text-emerald-400"><Train className="h-4 w-4" /> RE-ALIGNED CHRONOLOGICAL MATRIX SHEET</span>

          {!isTrainOperator && (
            <div className="flex gap-2">
              {!isEditMode ? (
                <button
                  onClick={toggleEditMode}
                  className="bg-blue-950/40 border border-blue-500/30 px-3 py-1.5 rounded text-blue-400 font-bold uppercase hover:bg-blue-900/50 transition-colors"
                >
                  <Edit3 className="h-3.5 w-3.5 inline mr-1" /> EDIT / PASTE MODE
                </button>
              ) : (
                <>
                  <button
                    onClick={toggleEditMode}
                    className="bg-rose-950/40 border border-rose-500/30 px-3 py-1.5 rounded text-rose-400 font-bold uppercase hover:bg-rose-900/50 transition-colors"
                  >
                    <XCircle className="h-3.5 w-3.5 inline mr-1" /> CANCEL
                  </button>
                  <button
                    onClick={handleSaveBulk}
                    className="bg-emerald-950/40 border border-emerald-500/30 px-3 py-1.5 rounded text-emerald-400 font-bold uppercase hover:bg-emerald-900/50 transition-colors"
                  >
                    <Save className="h-3.5 w-3.5 inline mr-1" /> SAVE CHANGES
                  </button>
                </>
              )}

              <button
                onClick={() => {
                  if (sortedRows.length === 0) return alert("No data to export");
                  const headers = ["TRAIN ID", ...dnStationOrder.map(st => `DN_${st}`), ...upStationOrder.map(st => `UP_${st}`)];
                  const csvRows = [headers.join(',')];
                  sortedRows.forEach(row => {
                    const csvRow = [row.trainId, ...dnStationOrder.map(st => row.downTrip?.stations?.[st] || '--'), ...upStationOrder.map(st => row.upTrip?.stations?.[st] || '--')];
                    csvRows.push(csvRow.join(','));
                  });
                  const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
                  const link = document.createElement("a");
                  link.href = URL.createObjectURL(blob);
                  link.download = `WTT_Matrix_${activeDay || 'data'}_${new Date().toISOString().split('T')[0]}.csv`;
                  document.body.appendChild(link);
                  link.click();
                  document.body.removeChild(link);
                }}
                className="bg-slate-800/40 border border-slate-500/30 px-3 py-1.5 rounded text-slate-400 font-bold uppercase hover:bg-slate-700/50 transition-colors"
              >
                <Download className="h-3.5 w-3.5 inline mr-1" /> EXPORT CSV
              </button>
            </div>
          )}
        </div>

        <div
          ref={wttScrollRef}
          onMouseDown={onWttMouseDown}
          onMouseLeave={onWttMouseLeave}
          onMouseUp={onWttMouseUp}
          onMouseMove={onWttMouseMove}
          className="overflow-auto w-full max-h-[580px] cursor-grab active:cursor-grabbing select-none"
        >
          <table className="w-full text-left border-collapse font-mono text-[11px] min-w-[2000px]">
            <thead>
              <tr className="bg-slate-950 border-b border-slate-800 text-center sticky top-0 z-30">
                {!isTrainOperator && <th className="w-[70px] py-2" rowSpan="2">Actions</th>}
                <th className="w-[80px] border-r-2 border-slate-800" rowSpan="2">TRAIN ID</th>
                <th colSpan={dnStationOrder.length} className="text-amber-400 border-r-2 border-slate-800 py-1"><ArrowDownCircle className="h-3.5 w-3.5 inline" /> DOWN LINE</th>
                <th colSpan={upStationOrder.length} className="text-cyan-400 py-1"><ArrowUpCircle className="h-3.5 w-3.5 inline" /> UP LINE</th>
              </tr>
              <tr className="bg-slate-900 border-b-2 border-slate-800 text-center sticky top-[28px] z-30 text-[10px]">
                {dnStationOrder.map(st => <th key={`dn-head-${st}`} className={`py-1.5 border-r border-slate-800 ${st === 'PYID' ? 'bg-emerald-800/40 text-emerald-300' : 'text-slate-400'}`}>{st}</th>)}
                {upStationOrder.map(st => <th key={`up-head-${st}`} className={`py-1.5 border-r border-slate-800 ${st === 'PYID' ? 'bg-emerald-800/40 text-emerald-300' : 'text-slate-400'}`}>{st}</th>)}
              </tr>
            </thead>
            <tbody className="text-center">
              {displayRows.map((row, rowIdx) => {
                const matchingIncident = (liveIncidents || []).find(inc => String(inc.trainId) === String(row.trainId));
                const delayVal = matchingIncident ? parseInt(matchingIncident.delayMins, 10) : 0;
                const stickyTidBgClass = rowIdx % 2 === 0 ? "bg-slate-900" : "bg-slate-950/40";

                let colIndexCounter = 0;

                const renderWttCell = (direction, stationName, isTidField = false) => {
                  const targetTrip = direction === 'DN' ? row.downTrip : row.upTrip;
                  const currentColIdx = colIndexCounter++;

                  const getCellValue = () => {
                    if (isTidField) return row.trainId || '';
                    if (!targetTrip?.stations) return '--';
                    const keys = Object.keys(targetTrip.stations);
                    const foundKey = keys.find(k => k.trim().toLowerCase() === stationName?.trim().toLowerCase());
                    return foundKey ? targetTrip.stations[foundKey] : '--';
                  };

                  let baseValue = getCellValue();

                  // IF IN EDIT MODE
                  if (isEditMode) {
                    const editBg = stationName === 'PYID' ? 'bg-emerald-900/40' : 'bg-slate-950';
                    return (
                      <td key={`edit-${row.id || rowIdx}-${direction}-${stationName || 'tid'}`} className={`p-0 border border-slate-800 ${editBg} ${isTidField ? 'bg-slate-950 sticky left-0 z-20 border-r-2' : ''}`}>
                        <input
                          type="text"
                          value={baseValue === '--' ? '' : baseValue}
                          onChange={(e) => handleLocalCellChange(rowIdx, direction, stationName, isTidField, e.target.value)}
                          onPaste={(e) => handlePaste(e, rowIdx, currentColIdx)}
                          className={`w-full h-full min-h-[28px] ${editBg} text-emerald-400 text-center focus:outline-none focus:ring-1 focus:ring-emerald-500 font-bold`}
                        />
                      </td>
                    );
                  }

                  // NORMAL VIEW MODE
                  let cellValue = (baseValue !== '--' && delayVal > 0) ? addDelayToTime(baseValue, delayVal) : baseValue;

                  const isEditing = editingCell.rowId === row.id && editingCell.direction === direction && editingCell.station === stationName && editingCell.isTid === isTidField;

                  if (isEditing) {
                    return (
                      <td key={`edit-single-${row.id}-${direction}-${stationName}`} className="p-0.5 bg-slate-950 z-50">
                        <input type="text" value={editValue} onChange={(e) => setEditValue(e.target.value)} onBlur={() => handleWttCellSave(row, direction, stationName, isTidField)} className="w-full bg-slate-950 text-emerald-400 text-center focus:outline-none" autoFocus />
                      </td>
                    );
                  }

                  let textColor = direction === 'DN' ? 'text-amber-200' : 'text-cyan-200';
                  if (baseValue === '--') textColor = 'text-slate-700';
                  if (isTidField) textColor = 'text-slate-100 font-black';
                  if (delayVal > 0 && baseValue !== '--') textColor = 'text-orange-400 font-black';

                  return (
                    <td key={`cell-${row.id || rowIdx}-${direction}-${stationName || 'tid'}`}
                      onDoubleClick={() => {
                        if (isTrainOperator) return;
                        setEditingCell({ rowId: row.id, direction, station: stationName, isTid: isTidField }); 
                        setEditValue(baseValue); 
                      }}
                      className={`py-2 px-1 border-r border-slate-800/30 ${isTrainOperator ? '' : 'cursor-pointer'} ${textColor} ${stationName === 'PYID' ? 'bg-emerald-800/30 font-bold shadow-inner' : ''} ${isTidField ? `${stickyTidBgClass} sticky left-0 border-r-2 border-slate-800 z-10` : ''}`}>
                      {cellValue}
                    </td>
                  );
                };

                return (
                  <tr key={row.id || rowIdx} className={`${rowIdx % 2 === 0 ? "bg-slate-900" : "bg-slate-950/40"} border-b border-slate-800/30`}>
                    {!isTrainOperator && (
                      <td className="py-2 border-r border-slate-800 flex items-center justify-center gap-2 h-full">
                        {isEditMode && (
                          <button onClick={() => handleCopyRowToClipboard(row)} title="Copy Row" className="text-blue-400 hover:text-blue-300">
                            <Copy className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <button onClick={() => onTrashClick(row, rowIdx)} title="Delete Row" className="text-rose-500 hover:text-rose-400">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    )}
                    {renderWttCell('DN', null, true)}
                    {dnStationOrder.map(st => renderWttCell('DN', st))}
                    {upStationOrder.map(st => renderWttCell('UP', st))}
                  </tr>
                );
              })}
            </tbody>
          </table>
          {isEditMode && (
            <div className="p-3 bg-slate-950 border-t border-slate-800 flex justify-center sticky left-0 bottom-0 w-full z-20">
              <button
                onClick={handleAddRow}
                className="flex items-center gap-2 bg-emerald-950/40 hover:bg-emerald-900/60 border border-emerald-500/30 px-4 py-2 rounded text-emerald-400 font-bold uppercase transition-colors shadow-lg"
              >
                <Plus className="h-4 w-4" /> ADD BLANK ROW (MANUAL ENTRY)
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}