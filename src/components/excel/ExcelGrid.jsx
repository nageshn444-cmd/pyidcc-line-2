import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { colIndexToLetter, letterToColIndex, cellCoordsToKey } from '../../services/excel/formulaEngine';

const DEFAULT_COL_WIDTH = 100;
const DEFAULT_ROW_HEIGHT = 28;
const HEADER_ROW_HEIGHT = 28;
const HEADER_COL_WIDTH = 48;
const OVERSCAN_ROWS = 8;
const OVERSCAN_COLS = 4;

export default function ExcelGrid({
  sheet,
  activeCell = { row: 0, col: 0 },
  selectedRange = { startRow: 0, startCol: 0, endRow: 0, endCol: 0 },
  isEditing = false,
  editValue = '',
  onSelectCell,
  onSelectRange,
  onStartEdit,
  onCommitEdit,
  onCancelEdit,
  onEditChange,
  onCellDoubleClick,
  onAutofill,
  onResizeCol,
  onResizeRow,
  onCopy,
  onPaste,
  onClearSelection,
  zoom = 100
}) {
  const containerRef = useRef(null);
  const inputRef = useRef(null);

  // Viewport scroll offsets for virtualization
  const [scrollTop, setScrollTop] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [viewportSize, setViewportSize] = useState({ width: 1000, height: 600 });

  // Drag states
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionAnchor, setSelectionAnchor] = useState(null);
  const [isAutofilling, setIsAutofilling] = useState(false);
  const [autofillRange, setAutofillRange] = useState(null);

  // Resize drag states
  const [resizingCol, setResizingCol] = useState(null); // { colIdx, startX, startWidth }
  const [resizingRow, setResizingRow] = useState(null); // { rowIdx, startY, startHeight }

  const rowCount = sheet?.rowCount || 100;
  const colCount = sheet?.colCount || 26;
  const colWidths = sheet?.colWidths || {};
  const rowHeights = sheet?.rowHeights || {};

  // Track viewport container dimensions
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const updateSize = () => {
      setViewportSize({ width: el.clientWidth, height: el.clientHeight });
    };
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  // Autofocus inline editor when editing starts
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  // Width & height helpers
  const getColWidth = useCallback((c) => {
    const letter = colIndexToLetter(c);
    return colWidths[letter] || DEFAULT_COL_WIDTH;
  }, [colWidths]);

  const getRowHeight = useCallback((r) => {
    return rowHeights[r] || DEFAULT_ROW_HEIGHT;
  }, [rowHeights]);

  // Cumulative positions for virtualization
  const colPositions = useMemo(() => {
    const pos = [0];
    for (let c = 0; c < colCount; c++) {
      pos.push(pos[c] + getColWidth(c));
    }
    return pos;
  }, [colCount, getColWidth]);

  const rowPositions = useMemo(() => {
    const pos = [0];
    for (let r = 0; r < rowCount; r++) {
      pos.push(pos[r] + getRowHeight(r));
    }
    return pos;
  }, [rowCount, getRowHeight]);

  const totalGridWidth = colPositions[colCount];
  const totalGridHeight = rowPositions[rowCount];

  // Calculate visible range based on scroll
  const visibleRowRange = useMemo(() => {
    let startRow = 0;
    while (startRow < rowCount && rowPositions[startRow + 1] < scrollTop) {
      startRow++;
    }
    startRow = Math.max(0, startRow - OVERSCAN_ROWS);

    let endRow = startRow;
    const bottomThreshold = scrollTop + viewportSize.height;
    while (endRow < rowCount && rowPositions[endRow] < bottomThreshold) {
      endRow++;
    }
    endRow = Math.min(rowCount - 1, endRow + OVERSCAN_ROWS);

    return { startRow, endRow };
  }, [scrollTop, viewportSize.height, rowCount, rowPositions]);

  const visibleColRange = useMemo(() => {
    let startCol = 0;
    while (startCol < colCount && colPositions[startCol + 1] < scrollLeft) {
      startCol++;
    }
    startCol = Math.max(0, startCol - OVERSCAN_COLS);

    let endCol = startCol;
    const rightThreshold = scrollLeft + viewportSize.width;
    while (endCol < colCount && colPositions[endCol] < rightThreshold) {
      endCol++;
    }
    endCol = Math.min(colCount - 1, endCol + OVERSCAN_COLS);

    return { startCol, endCol };
  }, [scrollLeft, viewportSize.width, colCount, colPositions]);

  const handleScroll = (e) => {
    setScrollTop(e.target.scrollTop);
    setScrollLeft(e.target.scrollLeft);
  };

  // Selection normalization
  const minSelRow = Math.min(selectedRange.startRow, selectedRange.endRow);
  const maxSelRow = Math.max(selectedRange.startRow, selectedRange.endRow);
  const minSelCol = Math.min(selectedRange.startCol, selectedRange.endCol);
  const maxSelCol = Math.max(selectedRange.startCol, selectedRange.endCol);

  // Cell format helper for rendering
  const formatDisplayValue = (cell) => {
    if (!cell) return '';
    const val = cell.value !== undefined ? cell.value : (cell.raw ?? '');
    if (val === null || val === undefined) return '';

    if (String(val).startsWith('#')) {
      return String(val); // Error like #REF! or #VALUE!
    }

    if (cell.numberFormat === 'CURRENCY' && typeof val === 'number') {
      return `₹ ${val.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    if (cell.numberFormat === 'PERCENT' && typeof val === 'number') {
      return `${(val * 100).toFixed(1)}%`;
    }
    if (cell.numberFormat === 'NUMBER' && typeof val === 'number') {
      return val.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    return String(val);
  };

  // Mouse selection events
  const handleCellMouseDown = (r, c, e) => {
    if (e.button !== 0) return; // Left click only
    if (isEditing) onCommitEdit();

    if (e.shiftKey) {
      onSelectRange({
        startRow: selectedRange.startRow,
        startCol: selectedRange.startCol,
        endRow: r,
        endCol: c
      });
    } else {
      onSelectCell(r, c);
      setIsSelecting(true);
      setSelectionAnchor({ row: r, col: c });
    }
  };

  const handleCellMouseEnter = (r, c) => {
    if (isSelecting && selectionAnchor) {
      onSelectRange({
        startRow: selectionAnchor.row,
        startCol: selectionAnchor.col,
        endRow: r,
        endCol: c
      });
    } else if (isAutofilling && onAutofill) {
      setAutofillRange({
        startRow: minSelRow,
        startCol: minSelCol,
        endRow: Math.max(maxSelRow, r),
        endCol: Math.max(maxSelCol, c)
      });
    }
  };

  // Global mouse up for selections, drag fills, and resizing
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (isSelecting) {
        setIsSelecting(false);
        setSelectionAnchor(null);
      }
      if (isAutofilling) {
        if (autofillRange && onAutofill) {
          onAutofill(selectedRange, autofillRange);
        }
        setIsAutofilling(false);
        setAutofillRange(null);
      }
      if (resizingCol) {
        setResizingCol(null);
      }
      if (resizingRow) {
        setResizingRow(null);
      }
    };

    const handleGlobalMouseMove = (e) => {
      if (resizingCol) {
        const delta = e.clientX - resizingCol.startX;
        const newWidth = Math.max(40, resizingCol.startWidth + delta);
        onResizeCol(colIndexToLetter(resizingCol.colIdx), newWidth);
      }
      if (resizingRow) {
        const delta = e.clientY - resizingRow.startY;
        const newHeight = Math.max(20, resizingRow.startHeight + delta);
        onResizeRow(resizingRow.rowIdx, newHeight);
      }
    };

    window.addEventListener('mouseup', handleGlobalMouseUp);
    window.addEventListener('mousemove', handleGlobalMouseMove);
    return () => {
      window.removeEventListener('mouseup', handleGlobalMouseUp);
      window.removeEventListener('mousemove', handleGlobalMouseMove);
    };
  }, [isSelecting, isAutofilling, autofillRange, resizingCol, resizingRow, selectedRange, onAutofill, onResizeCol, onResizeRow]);

  // Keyboard navigation & Shortcuts
  const handleKeyDown = (e) => {
    if (isEditing) {
      if (e.key === 'Enter') {
        e.preventDefault();
        onCommitEdit();
        // Move down
        if (activeCell.row + 1 < rowCount) {
          onSelectCell(activeCell.row + 1, activeCell.col);
        }
      } else if (e.key === 'Tab') {
        e.preventDefault();
        onCommitEdit();
        // Move right
        if (activeCell.col + 1 < colCount) {
          onSelectCell(activeCell.row, activeCell.col + 1);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onCancelEdit();
      }
      return;
    }

    // Ctrl shortcuts
    if (e.ctrlKey || e.metaKey) {
      if (e.key === 'c' || e.key === 'C') {
        e.preventDefault();
        onCopy();
        return;
      }
      if (e.key === 'v' || e.key === 'V') {
        // Let paste handler work or call onPaste
        onPaste();
        return;
      }
      if (e.key === 'a' || e.key === 'A') {
        e.preventDefault();
        onSelectRange({ startRow: 0, startCol: 0, endRow: rowCount - 1, endCol: colCount - 1 });
        return;
      }
    }

    // Delete / Backspace: Clear selection
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      onClearSelection();
      return;
    }

    // Enter / F2: Start inline editing
    if (e.key === 'Enter' || e.key === 'F2') {
      e.preventDefault();
      onStartEdit();
      return;
    }

    // Arrow navigation
    let nextRow = activeCell.row;
    let nextCol = activeCell.col;

    if (e.key === 'ArrowUp') nextRow = Math.max(0, activeCell.row - 1);
    else if (e.key === 'ArrowDown') nextRow = Math.min(rowCount - 1, activeCell.row + 1);
    else if (e.key === 'ArrowLeft') nextCol = Math.max(0, activeCell.col - 1);
    else if (e.key === 'ArrowRight') nextCol = Math.min(colCount - 1, activeCell.col + 1);
    else if (e.key === 'Tab') {
      e.preventDefault();
      nextCol = e.shiftKey ? Math.max(0, activeCell.col - 1) : Math.min(colCount - 1, activeCell.col + 1);
    } else {
      // Any printable character starts inline edit with that character
      if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
        onStartEdit(e.key);
      }
      return;
    }

    e.preventDefault();
    if (e.shiftKey) {
      onSelectRange({
        startRow: selectedRange.startRow,
        startCol: selectedRange.startCol,
        endRow: nextRow,
        endCol: nextCol
      });
    } else {
      onSelectCell(nextRow, nextCol);
    }
  };

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onScroll={handleScroll}
      className="relative flex-1 bg-slate-950 overflow-auto outline-none select-none text-xs font-sans"
      style={{ zoom: `${zoom}%` }}
    >
      {/* ── Virtual Grid Canvas Bounds ── */}
      <div
        className="relative"
        style={{ width: totalGridWidth + HEADER_COL_WIDTH, height: totalGridHeight + HEADER_ROW_HEIGHT }}
      >
        {/* ── 1. Top-Left Corner (Select All Button) ── */}
        <div
          onClick={() => onSelectRange({ startRow: 0, startCol: 0, endRow: rowCount - 1, endCol: colCount - 1 })}
          title="Select all cells"
          className="sticky top-0 left-0 z-40 bg-slate-900 border-b border-r border-slate-750 flex items-center justify-center cursor-pointer hover:bg-slate-800 transition"
          style={{ width: HEADER_COL_WIDTH, height: HEADER_ROW_HEIGHT }}
        >
          <div className="w-2.5 h-2.5 bg-slate-700 rounded-xs" />
        </div>

        {/* ── 2. Sticky Column Headers (A, B, C...) ── */}
        <div
          className="sticky top-0 z-30 flex bg-slate-900 border-b border-slate-750"
          style={{ left: HEADER_COL_WIDTH, height: HEADER_ROW_HEIGHT, width: totalGridWidth }}
        >
          {Array.from({ length: visibleColRange.endCol - visibleColRange.startCol + 1 }).map((_, i) => {
            const colIdx = visibleColRange.startCol + i;
            const letter = colIndexToLetter(colIdx);
            const w = getColWidth(colIdx);
            const left = colPositions[colIdx];
            const isColSelected = minSelCol <= colIdx && colIdx <= maxSelCol;

            return (
              <div
                key={letter}
                onClick={(e) => {
                  if (e.shiftKey) {
                    onSelectRange({ startRow: 0, startCol: selectedRange.startCol, endRow: rowCount - 1, endCol: colIdx });
                  } else {
                    onSelectRange({ startRow: 0, startCol: colIdx, endRow: rowCount - 1, endCol: colIdx });
                  }
                }}
                className={`absolute top-0 flex items-center justify-center font-mono font-bold text-[11px] border-r border-slate-750 select-none cursor-pointer transition ${
                  isColSelected ? 'bg-blue-600/30 text-blue-300 font-black' : 'text-slate-400 hover:bg-slate-850 hover:text-white'
                }`}
                style={{ left, width: w, height: HEADER_ROW_HEIGHT }}
              >
                <span>{letter}</span>

                {/* Column Resize Handle */}
                <div
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    setResizingCol({ colIdx, startX: e.clientX, startWidth: w });
                  }}
                  className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-blue-500 transition"
                />
              </div>
            );
          })}
        </div>

        {/* ── 3. Sticky Row Headers (1, 2, 3...) ── */}
        <div
          className="sticky left-0 z-30 bg-slate-900 border-r border-slate-750"
          style={{ top: HEADER_ROW_HEIGHT, width: HEADER_COL_WIDTH, height: totalGridHeight }}
        >
          {Array.from({ length: visibleRowRange.endRow - visibleRowRange.startRow + 1 }).map((_, i) => {
            const rowIdx = visibleRowRange.startRow + i;
            const h = getRowHeight(rowIdx);
            const top = rowPositions[rowIdx];
            const isRowSelected = minSelRow <= rowIdx && rowIdx <= maxSelRow;

            return (
              <div
                key={rowIdx}
                onClick={(e) => {
                  if (e.shiftKey) {
                    onSelectRange({ startRow: selectedRange.startRow, startCol: 0, endRow: rowIdx, endCol: colCount - 1 });
                  } else {
                    onSelectRange({ startRow: rowIdx, startCol: 0, endRow: rowIdx, endCol: colCount - 1 });
                  }
                }}
                className={`absolute left-0 flex items-center justify-center font-mono text-[11px] border-b border-slate-750 select-none cursor-pointer transition ${
                  isRowSelected ? 'bg-blue-600/30 text-blue-300 font-bold' : 'text-slate-400 hover:bg-slate-850 hover:text-white'
                }`}
                style={{ top, width: HEADER_COL_WIDTH, height: h }}
              >
                <span>{rowIdx + 1}</span>

                {/* Row Resize Handle */}
                <div
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    setResizingRow({ rowIdx, startY: e.clientY, startHeight: h });
                  }}
                  className="absolute left-0 right-0 bottom-0 h-1.5 cursor-row-resize hover:bg-blue-500 transition"
                />
              </div>
            );
          })}
        </div>

        {/* ── 4. Virtualized Cells Grid ── */}
        <div
          className="absolute z-10"
          style={{ left: HEADER_COL_WIDTH, top: HEADER_ROW_HEIGHT, width: totalGridWidth, height: totalGridHeight }}
        >
          {Array.from({ length: visibleRowRange.endRow - visibleRowRange.startRow + 1 }).map((_, rOffset) => {
            const r = visibleRowRange.startRow + rOffset;
            const top = rowPositions[r];
            const h = getRowHeight(r);

            return Array.from({ length: visibleColRange.endCol - visibleColRange.startCol + 1 }).map((_, cOffset) => {
              const c = visibleColRange.startCol + cOffset;
              const left = colPositions[c];
              const w = getColWidth(c);
              const key = cellCoordsToKey(r, c);
              const cell = sheet?.data?.[key];

              const isCurrentCell = activeCell.row === r && activeCell.col === c;
              const inSelection = minSelRow <= r && r <= maxSelRow && minSelCol <= c && c <= maxSelCol;
              const isCellEditing = isCurrentCell && isEditing;

              return (
                <div
                  key={key}
                  onMouseDown={(e) => handleCellMouseDown(r, c, e)}
                  onMouseEnter={() => handleCellMouseEnter(r, c)}
                  onDoubleClick={() => onCellDoubleClick(r, c)}
                  className={`absolute border-r border-b border-slate-800/80 px-2 flex items-center overflow-hidden transition-colors ${
                    isCellEditing
                      ? 'bg-slate-900 z-30 ring-2 ring-blue-500'
                      : isCurrentCell
                      ? 'bg-blue-600/15 z-20'
                      : inSelection
                      ? 'bg-blue-600/10'
                      : 'hover:bg-slate-900/40 bg-slate-950'
                  }`}
                  style={{
                    left,
                    top,
                    width: w,
                    height: h,
                    fontWeight: cell?.bold ? 'bold' : 'normal',
                    fontStyle: cell?.italic ? 'italic' : 'normal',
                    textDecoration: cell?.underline ? 'underline' : 'none',
                    justifyContent: cell?.textAlign === 'center' ? 'center' : (cell?.textAlign === 'right' ? 'flex-end' : 'flex-start'),
                    color: cell?.color || (String(cell?.value).startsWith('#') ? '#f43f5e' : '#f1f5f9')
                  }}
                >
                  {isCellEditing ? (
                    <input
                      ref={inputRef}
                      type="text"
                      value={editValue}
                      onChange={(e) => onEditChange(e.target.value)}
                      className="w-full h-full bg-transparent text-white outline-none border-none p-0 font-mono text-xs"
                    />
                  ) : (
                    <span className="truncate w-full leading-tight select-none">
                      {formatDisplayValue(cell)}
                    </span>
                  )}
                </div>
              );
            });
          })}

          {/* ── 5. Excel Selection Box (Blue Outline) ── */}
          {minSelRow <= maxSelRow && minSelCol <= maxSelCol && (
            <div
              className="absolute pointer-events-none border-2 border-blue-500 z-20"
              style={{
                left: colPositions[minSelCol],
                top: rowPositions[minSelRow],
                width: colPositions[maxSelCol + 1] - colPositions[minSelCol],
                height: rowPositions[maxSelRow + 1] - rowPositions[minSelRow]
              }}
            >
              {/* Autofill Square Handle (bottom-right corner) */}
              {!isEditing && (
                <div
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    setIsAutofilling(true);
                  }}
                  className="pointer-events-auto absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-blue-500 border border-white cursor-crosshair shadow-md hover:scale-125 transition"
                  title="Drag to autofill cells or extend series"
                />
              )}
            </div>
          )}

          {/* ── 6. Autofill Ghost Preview Box ── */}
          {isAutofilling && autofillRange && (
            <div
              className="absolute pointer-events-none border-2 border-dashed border-cyan-400 bg-cyan-500/10 z-25"
              style={{
                left: colPositions[autofillRange.startCol],
                top: rowPositions[autofillRange.startRow],
                width: colPositions[autofillRange.endCol + 1] - colPositions[autofillRange.startCol],
                height: rowPositions[autofillRange.endRow + 1] - rowPositions[autofillRange.startRow]
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
