import React, { useState } from 'react';
import { Plus, MoreVertical, Trash2, Copy, Edit2, Eraser } from 'lucide-react';

export default function ExcelSheetTabs({
  sheets = {},
  activeSheetId,
  onSelectSheet,
  onAddSheet,
  onRenameSheet,
  onDeleteSheet,
  onDuplicateSheet,
  onClearSheet
}) {
  const [editingSheetId, setEditingSheetId] = useState(null);
  const [tempName, setTempName] = useState('');
  const [activeMenuSheetId, setActiveMenuSheetId] = useState(null);

  const sheetList = Object.values(sheets);

  const startRename = (s) => {
    setEditingSheetId(s.id);
    setTempName(s.name);
    setActiveMenuSheetId(null);
  };

  const commitRename = () => {
    if (editingSheetId && tempName.trim()) {
      onRenameSheet(editingSheetId, tempName.trim());
    }
    setEditingSheetId(null);
    setTempName('');
  };

  return (
    <div className="flex items-center justify-between bg-slate-900 border-t border-slate-800 px-2 py-1 select-none text-xs">
      {/* Left: Sheet Tabs List */}
      <div className="flex items-center gap-1 overflow-x-auto max-w-[80vw] py-0.5">
        {sheetList.map((s) => {
          const isActive = s.id === activeSheetId;
          const isRenaming = editingSheetId === s.id;

          return (
            <div
              key={s.id}
              className={`relative flex items-center gap-1 px-3 py-1.5 rounded-t-lg font-medium cursor-pointer border-t-2 transition-all ${
                isActive
                  ? 'bg-slate-950 text-white border-blue-500 shadow-sm'
                  : 'bg-slate-850/60 text-slate-400 border-transparent hover:bg-slate-800 hover:text-slate-200'
              }`}
              onClick={() => !isRenaming && onSelectSheet(s.id)}
              onDoubleClick={() => startRename(s)}
            >
              {isRenaming ? (
                <input
                  type="text"
                  value={tempName}
                  autoFocus
                  onChange={(e) => setTempName(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitRename();
                    if (e.key === 'Escape') setEditingSheetId(null);
                  }}
                  className="bg-slate-800 text-white px-1 py-0.5 rounded outline-none border border-blue-500 text-xs w-28"
                />
              ) : (
                <span className="truncate max-w-[120px]">{s.name}</span>
              )}

              {/* Context menu toggle */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveMenuSheetId(activeMenuSheetId === s.id ? null : s.id);
                }}
                className="p-0.5 hover:bg-slate-700/50 rounded opacity-60 hover:opacity-100 transition"
              >
                <MoreVertical className="w-3 h-3" />
              </button>

              {/* Sheet Context Menu */}
              {activeMenuSheetId === s.id && (
                <div
                  className="absolute bottom-8 left-0 z-50 bg-slate-800 border border-slate-700 rounded-lg shadow-xl py-1 text-slate-200 min-w-[130px] text-[11px]"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    onClick={() => startRename(s)}
                    className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-700 w-full text-left"
                  >
                    <Edit2 className="w-3.5 h-3.5 text-blue-400" /> Rename
                  </button>
                  <button
                    onClick={() => {
                      onDuplicateSheet(s.id);
                      setActiveMenuSheetId(null);
                    }}
                    className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-700 w-full text-left"
                  >
                    <Copy className="w-3.5 h-3.5 text-amber-400" /> Duplicate
                  </button>
                  <button
                    onClick={() => {
                      onClearSheet(s.id);
                      setActiveMenuSheetId(null);
                    }}
                    className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-700 w-full text-left text-orange-400"
                  >
                    <Eraser className="w-3.5 h-3.5" /> Clear Data
                  </button>
                  {sheetList.length > 1 && (
                    <button
                      onClick={() => {
                        onDeleteSheet(s.id);
                        setActiveMenuSheetId(null);
                      }}
                      className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-700 w-full text-left text-rose-400 border-t border-slate-700/50"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Delete Sheet
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* Add New Sheet Button */}
        <button
          onClick={onAddSheet}
          title="Add New Worksheet"
          className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg transition"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      <div className="text-[11px] text-slate-500 font-mono hidden sm:block">
        {sheetList.length} Sheet{sheetList.length > 1 ? 's' : ''}
      </div>
    </div>
  );
}
