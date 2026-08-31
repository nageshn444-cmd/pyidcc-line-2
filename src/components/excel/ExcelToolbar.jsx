import React, { useState, useRef, useEffect } from 'react';
import { 
  Undo2, Redo2, Save, Cloud, Printer, Upload, Download, Search,
  Bold, Italic, Underline, Strikethrough, AlignLeft, AlignCenter, AlignRight,
  WrapText, Combine, Grid, Plus, Trash2, ArrowUpDown, ArrowDownAZ, ArrowUpZA,
  Filter, Sparkles, HelpCircle, FileText, ChevronDown, Check, RefreshCw
} from 'lucide-react';

export default function ExcelToolbar({
  workbookName = 'PYIDCC_Spreadsheet',
  onRenameWorkbook,
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
  onSaveManual,
  onSaveCloud,
  saveStatus = 'Saved',
  onOpenImport,
  onOpenExport,
  onOpenFindReplace,
  onPrint,
  // Formatting states & handlers for active cell
  activeFormat = {},
  onToggleFormat,
  onSetNumberFormat,
  onSetTextAlign,
  onToggleWrapText,
  onToggleMerge,
  onInsertRow,
  onDeleteRow,
  onInsertCol,
  onDeleteCol,
  onSortAsc,
  onSortDesc,
  onToggleFreezeHeader,
  isHeaderFrozen = false
}) {
  const [isRenaming, setIsRenaming] = useState(false);
  const [tempName, setTempName] = useState(workbookName);
  const [activeMenu, setActiveMenu] = useState(null); // 'FILE' | 'EDIT' | 'VIEW' | 'INSERT' | 'FORMAT' | 'DATA' | 'TOOLS' | 'HELP'
  const menuRef = useRef(null);

  useEffect(() => {
    setTempName(workbookName);
  }, [workbookName]);

  // Click outside to dismiss open menus
  useEffect(() => {
    function handleClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setActiveMenu(null);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const commitRename = () => {
    if (tempName.trim() && onRenameWorkbook) {
      onRenameWorkbook(tempName.trim());
    }
    setIsRenaming(false);
  };

  return (
    <div className="bg-slate-900 border-b border-slate-800 select-none text-slate-200">
      {/* ── Top Bar: Logo, Title & Application Menus ── */}
      <div className="flex flex-wrap items-center justify-between px-3 py-1.5 border-b border-slate-800/80 gap-2">
        <div className="flex items-center gap-3">
          {/* Excel Brand Accent */}
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-emerald-600 rounded-lg flex items-center justify-center font-bold text-white shadow-md shadow-emerald-600/30 text-xs">
              XL
            </div>
            {isRenaming ? (
              <input
                type="text"
                value={tempName}
                autoFocus
                onChange={(e) => setTempName(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitRename();
                  if (e.key === 'Escape') setIsRenaming(false);
                }}
                className="bg-slate-950 text-white font-bold text-sm px-2 py-0.5 rounded border border-blue-500 outline-none"
              />
            ) : (
              <h1
                onClick={() => setIsRenaming(true)}
                title="Click to rename workbook"
                className="font-bold text-sm text-white hover:text-blue-300 cursor-pointer px-1 py-0.5 rounded hover:bg-slate-800 transition truncate max-w-[260px]"
              >
                {workbookName}
              </h1>
            )}
          </div>

          {/* Menus: File, Edit, View, Insert, Format, Data, Tools, Help */}
          <div ref={menuRef} className="relative flex items-center gap-0.5 text-xs text-slate-300 font-medium">
            {[
              { id: 'FILE', label: 'File' },
              { id: 'EDIT', label: 'Edit' },
              { id: 'VIEW', label: 'View' },
              { id: 'INSERT', label: 'Insert' },
              { id: 'FORMAT', label: 'Format' },
              { id: 'DATA', label: 'Data' },
              { id: 'TOOLS', label: 'Tools' },
              { id: 'HELP', label: 'Help' }
            ].map((m) => (
              <div key={m.id} className="relative">
                <button
                  onClick={() => setActiveMenu(activeMenu === m.id ? null : m.id)}
                  className={`px-2.5 py-1 rounded-md transition ${
                    activeMenu === m.id ? 'bg-slate-800 text-white' : 'hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  {m.label}
                </button>

                {/* Dropdown for each menu */}
                {activeMenu === m.id && (
                  <div className="absolute top-7 left-0 z-50 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl py-1.5 min-w-[190px] text-xs animate-fadeIn text-slate-200 font-normal">
                    {m.id === 'FILE' && (
                      <>
                        <button onClick={() => { onSaveManual(); setActiveMenu(null); }} className="w-full px-3 py-1.5 hover:bg-slate-700 flex items-center justify-between text-left">
                          <span>Save Locally</span> <kbd className="text-[10px] text-slate-400 font-mono">Ctrl+S</kbd>
                        </button>
                        <button onClick={() => { onSaveCloud(); setActiveMenu(null); }} className="w-full px-3 py-1.5 hover:bg-slate-700 flex items-center justify-between text-left text-blue-300">
                          <span>Save to Cloud</span> <Cloud className="w-3.5 h-3.5" />
                        </button>
                        <div className="my-1 border-t border-slate-750" />
                        <button onClick={() => { onOpenImport(); setActiveMenu(null); }} className="w-full px-3 py-1.5 hover:bg-slate-700 flex items-center gap-2 text-left">
                          <Upload className="w-3.5 h-3.5 text-cyan-400" /> Import Excel / CSV
                        </button>
                        <button onClick={() => { onOpenExport(); setActiveMenu(null); }} className="w-full px-3 py-1.5 hover:bg-slate-700 flex items-center gap-2 text-left">
                          <Download className="w-3.5 h-3.5 text-emerald-400" /> Export Excel (.xlsx)
                        </button>
                        <button onClick={() => { onPrint(); setActiveMenu(null); }} className="w-full px-3 py-1.5 hover:bg-slate-700 flex items-center justify-between text-left">
                          <span className="flex items-center gap-2"><Printer className="w-3.5 h-3.5" /> Print</span>
                          <kbd className="text-[10px] text-slate-400 font-mono">Ctrl+P</kbd>
                        </button>
                      </>
                    )}

                    {m.id === 'EDIT' && (
                      <>
                        <button onClick={() => { onUndo(); setActiveMenu(null); }} disabled={!canUndo} className="w-full px-3 py-1.5 hover:bg-slate-700 disabled:opacity-40 flex items-center justify-between text-left">
                          <span>Undo</span> <kbd className="text-[10px] text-slate-400 font-mono">Ctrl+Z</kbd>
                        </button>
                        <button onClick={() => { onRedo(); setActiveMenu(null); }} disabled={!canRedo} className="w-full px-3 py-1.5 hover:bg-slate-700 disabled:opacity-40 flex items-center justify-between text-left">
                          <span>Redo</span> <kbd className="text-[10px] text-slate-400 font-mono">Ctrl+Y</kbd>
                        </button>
                        <div className="my-1 border-t border-slate-750" />
                        <button onClick={() => { onOpenFindReplace(); setActiveMenu(null); }} className="w-full px-3 py-1.5 hover:bg-slate-700 flex items-center justify-between text-left">
                          <span>Find &amp; Replace</span> <kbd className="text-[10px] text-slate-400 font-mono">Ctrl+F</kbd>
                        </button>
                      </>
                    )}

                    {m.id === 'VIEW' && (
                      <>
                        <button onClick={() => { onToggleFreezeHeader(); setActiveMenu(null); }} className="w-full px-3 py-1.5 hover:bg-slate-700 flex items-center justify-between text-left">
                          <span>Freeze Top Row</span> {isHeaderFrozen && <Check className="w-3.5 h-3.5 text-blue-400" />}
                        </button>
                      </>
                    )}

                    {m.id === 'INSERT' && (
                      <>
                        <button onClick={() => { onInsertRow(); setActiveMenu(null); }} className="w-full px-3 py-1.5 hover:bg-slate-700 text-left">
                          + Insert Row Above
                        </button>
                        <button onClick={() => { onInsertCol(); setActiveMenu(null); }} className="w-full px-3 py-1.5 hover:bg-slate-700 text-left">
                          + Insert Column Left
                        </button>
                      </>
                    )}

                    {m.id === 'FORMAT' && (
                      <>
                        <button onClick={() => { onToggleFormat('bold'); setActiveMenu(null); }} className="w-full px-3 py-1.5 hover:bg-slate-700 text-left">
                          <strong>Bold (Ctrl+B)</strong>
                        </button>
                        <button onClick={() => { onToggleFormat('italic'); setActiveMenu(null); }} className="w-full px-3 py-1.5 hover:bg-slate-700 text-left">
                          <em>Italic (Ctrl+I)</em>
                        </button>
                        <button onClick={() => { onToggleMerge(); setActiveMenu(null); }} className="w-full px-3 py-1.5 hover:bg-slate-700 text-left">
                          Merge / Unmerge Selection
                        </button>
                        <button onClick={() => { onToggleWrapText(); setActiveMenu(null); }} className="w-full px-3 py-1.5 hover:bg-slate-700 text-left">
                          Toggle Text Wrapping
                        </button>
                      </>
                    )}

                    {m.id === 'DATA' && (
                      <>
                        <button onClick={() => { onSortAsc(); setActiveMenu(null); }} className="w-full px-3 py-1.5 hover:bg-slate-700 flex items-center gap-2 text-left">
                          <ArrowDownAZ className="w-3.5 h-3.5 text-cyan-400" /> Sort Ascending (A-Z)
                        </button>
                        <button onClick={() => { onSortDesc(); setActiveMenu(null); }} className="w-full px-3 py-1.5 hover:bg-slate-700 flex items-center gap-2 text-left">
                          <ArrowUpZA className="w-3.5 h-3.5 text-cyan-400" /> Sort Descending (Z-A)
                        </button>
                      </>
                    )}

                    {m.id === 'TOOLS' && (
                      <>
                        <button onClick={() => { onOpenImport(); setActiveMenu(null); }} className="w-full px-3 py-1.5 hover:bg-slate-700 text-left text-cyan-300">
                          Import PYIDCC Datasets
                        </button>
                      </>
                    )}

                    {m.id === 'HELP' && (
                      <div className="p-3 text-[11px] text-slate-300 space-y-1.5">
                        <div className="font-bold text-white">Excel Workspace Shortcuts</div>
                        <div>• <kbd className="bg-slate-900 px-1 rounded">Enter</kbd> Commit edit</div>
                        <div>• <kbd className="bg-slate-900 px-1 rounded">Tab</kbd> Next cell right</div>
                        <div>• <kbd className="bg-slate-900 px-1 rounded">Arrows</kbd> Cell navigation</div>
                        <div>• <kbd className="bg-slate-900 px-1 rounded">Ctrl+C / V</kbd> Copy / Paste</div>
                        <div>• <kbd className="bg-slate-900 px-1 rounded">Ctrl+Z / Y</kbd> Undo / Redo</div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Right Actions: Save Status, Cloud Save, Export */}
        <div className="flex items-center gap-2">
          <button
            onClick={onSaveCloud}
            title="Save Snapshot to Firebase Cloud"
            className="flex items-center gap-1 px-2.5 py-1 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/40 text-blue-300 rounded-lg text-xs font-bold transition"
          >
            <Cloud className="w-3.5 h-3.5" /> Save Cloud
          </button>
          <button
            onClick={onOpenExport}
            className="flex items-center gap-1 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition shadow-sm"
          >
            <Download className="w-3.5 h-3.5" /> Export
          </button>
        </div>
      </div>

      {/* ── Action Ribbon Toolbar (Formatting, Align, Rows/Cols, Math) ── */}
      <div className="flex flex-wrap items-center gap-1 px-3 py-1 bg-slate-950/60 overflow-x-auto text-xs">
        {/* Undo / Redo */}
        <button
          onClick={onUndo}
          disabled={!canUndo}
          title="Undo (Ctrl+Z)"
          className="p-1.5 hover:bg-slate-800 disabled:opacity-30 rounded text-slate-300 hover:text-white transition"
        >
          <Undo2 className="w-4 h-4" />
        </button>
        <button
          onClick={onRedo}
          disabled={!canRedo}
          title="Redo (Ctrl+Y)"
          className="p-1.5 hover:bg-slate-800 disabled:opacity-30 rounded text-slate-300 hover:text-white transition"
        >
          <Redo2 className="w-4 h-4" />
        </button>

        <div className="h-4 w-px bg-slate-800 mx-1" />

        {/* Print / Save / Import */}
        <button onClick={onPrint} title="Print Active Sheet" className="p-1.5 hover:bg-slate-800 rounded text-slate-300 hover:text-white transition">
          <Printer className="w-4 h-4" />
        </button>
        <button onClick={onSaveManual} title="Save Workbook Locally" className="p-1.5 hover:bg-slate-800 rounded text-slate-300 hover:text-white transition">
          <Save className="w-4 h-4" />
        </button>
        <button onClick={onOpenImport} title="Import Excel / CSV" className="p-1.5 hover:bg-slate-800 rounded text-cyan-400 hover:text-cyan-300 transition">
          <Upload className="w-4 h-4" />
        </button>

        <div className="h-4 w-px bg-slate-800 mx-1" />

        {/* Text Style: Bold, Italic, Underline, Strikethrough */}
        <button
          onClick={() => onToggleFormat('bold')}
          title="Bold (Ctrl+B)"
          className={`p-1.5 rounded transition ${activeFormat.bold ? 'bg-blue-600 text-white' : 'hover:bg-slate-800 text-slate-300'}`}
        >
          <Bold className="w-4 h-4" />
        </button>
        <button
          onClick={() => onToggleFormat('italic')}
          title="Italic (Ctrl+I)"
          className={`p-1.5 rounded transition ${activeFormat.italic ? 'bg-blue-600 text-white' : 'hover:bg-slate-800 text-slate-300'}`}
        >
          <Italic className="w-4 h-4" />
        </button>
        <button
          onClick={() => onToggleFormat('underline')}
          title="Underline (Ctrl+U)"
          className={`p-1.5 rounded transition ${activeFormat.underline ? 'bg-blue-600 text-white' : 'hover:bg-slate-800 text-slate-300'}`}
        >
          <Underline className="w-4 h-4" />
        </button>

        <div className="h-4 w-px bg-slate-800 mx-1" />

        {/* Alignments: Left, Center, Right */}
        <button
          onClick={() => onSetTextAlign('left')}
          title="Align Left"
          className={`p-1.5 rounded transition ${activeFormat.textAlign === 'left' ? 'bg-slate-800 text-blue-400' : 'hover:bg-slate-800 text-slate-300'}`}
        >
          <AlignLeft className="w-4 h-4" />
        </button>
        <button
          onClick={() => onSetTextAlign('center')}
          title="Align Center"
          className={`p-1.5 rounded transition ${activeFormat.textAlign === 'center' ? 'bg-slate-800 text-blue-400' : 'hover:bg-slate-800 text-slate-300'}`}
        >
          <AlignCenter className="w-4 h-4" />
        </button>
        <button
          onClick={() => onSetTextAlign('right')}
          title="Align Right"
          className={`p-1.5 rounded transition ${activeFormat.textAlign === 'right' ? 'bg-slate-800 text-blue-400' : 'hover:bg-slate-800 text-slate-300'}`}
        >
          <AlignRight className="w-4 h-4" />
        </button>

        <div className="h-4 w-px bg-slate-800 mx-1" />

        {/* Text Wrap & Merge */}
        <button
          onClick={onToggleWrapText}
          title="Wrap Text"
          className={`p-1.5 rounded transition ${activeFormat.wrapText ? 'bg-blue-600 text-white' : 'hover:bg-slate-800 text-slate-300'}`}
        >
          <WrapText className="w-4 h-4" />
        </button>
        <button
          onClick={onToggleMerge}
          title="Merge / Unmerge Selection"
          className="p-1.5 hover:bg-slate-800 rounded text-slate-300 hover:text-white transition"
        >
          <Combine className="w-4 h-4" />
        </button>

        <div className="h-4 w-px bg-slate-800 mx-1" />

        {/* Number Formats Selector */}
        <select
          value={activeFormat.numberFormat || 'GENERAL'}
          onChange={(e) => onSetNumberFormat(e.target.value)}
          className="bg-slate-900 border border-slate-750 text-slate-200 rounded px-2 py-1 text-xs focus:outline-none focus:border-blue-500"
        >
          <option value="GENERAL">General</option>
          <option value="NUMBER">Number (1,234.00)</option>
          <option value="CURRENCY">Currency (₹ 1,234)</option>
          <option value="PERCENT">Percent (%)</option>
          <option value="DATE">Date (DD-MM-YYYY)</option>
          <option value="TIME">Time (HH:MM)</option>
        </select>

        <div className="h-4 w-px bg-slate-800 mx-1" />

        {/* Row & Column Insertion/Deletion */}
        <button onClick={onInsertRow} title="Insert Row Above" className="p-1.5 hover:bg-slate-800 rounded text-slate-300 hover:text-white transition flex items-center gap-0.5 text-[10px]">
          <Plus className="w-3.5 h-3.5 text-emerald-400" /> Row
        </button>
        <button onClick={onDeleteRow} title="Delete Selected Row" className="p-1.5 hover:bg-slate-800 rounded text-slate-300 hover:text-rose-400 transition flex items-center gap-0.5 text-[10px]">
          <Trash2 className="w-3.5 h-3.5" /> Row
        </button>
        <button onClick={onInsertCol} title="Insert Column Left" className="p-1.5 hover:bg-slate-800 rounded text-slate-300 hover:text-white transition flex items-center gap-0.5 text-[10px]">
          <Plus className="w-3.5 h-3.5 text-emerald-400" /> Col
        </button>
        <button onClick={onDeleteCol} title="Delete Selected Column" className="p-1.5 hover:bg-slate-800 rounded text-slate-300 hover:text-rose-400 transition flex items-center gap-0.5 text-[10px]">
          <Trash2 className="w-3.5 h-3.5" /> Col
        </button>

        <div className="h-4 w-px bg-slate-800 mx-1" />

        {/* Sort & Freeze */}
        <button onClick={onSortAsc} title="Sort Ascending A-Z" className="p-1.5 hover:bg-slate-800 rounded text-slate-300 hover:text-white transition">
          <ArrowDownAZ className="w-4 h-4" />
        </button>
        <button onClick={onSortDesc} title="Sort Descending Z-A" className="p-1.5 hover:bg-slate-800 rounded text-slate-300 hover:text-white transition">
          <ArrowUpZA className="w-4 h-4" />
        </button>
        <button
          onClick={onToggleFreezeHeader}
          title="Freeze / Unfreeze Top Row"
          className={`p-1.5 rounded transition ${isHeaderFrozen ? 'bg-blue-600 text-white' : 'hover:bg-slate-800 text-slate-300'}`}
        >
          <Grid className="w-4 h-4" />
        </button>
        <button onClick={onOpenFindReplace} title="Find &amp; Replace (Ctrl+F)" className="p-1.5 hover:bg-slate-800 rounded text-slate-300 hover:text-white transition">
          <Search className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
