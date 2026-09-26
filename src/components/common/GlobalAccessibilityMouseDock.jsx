/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTheme, FONT_PRESET_MAP } from '../../context/ThemeContext';
import { useOperationalEngine } from '../../context/OperationalEngine';
import { 
  Type, ZoomIn, ZoomOut, MousePointer, Maximize, Minimize,
  Eye, Sun, Moon, Sliders, RotateCcw, X, Radio, Train,
  Clock, Calendar, FileText, Download, Printer, Shield,
  ChevronRight, ExternalLink, RefreshCw, LayoutGrid, Check, Sparkles
} from 'lucide-react';

export default function GlobalAccessibilityMouseDock() {
  const location = useLocation();
  const navigate = useNavigate();
  const opEngine = useOperationalEngine();
  const { 
    accessibility, 
    setAccessibility, 
    theme, 
    setTheme, 
    resetThemeSettings 
  } = useTheme();

  const [isOpen, setIsOpen] = useState(false);
  const [activeDockTab, setActiveDockTab] = useState('scaling'); // 'scaling' | 'page_tools' | 'navigator'
  const [isFullscreen, setIsFullscreen] = useState(false);
  const dockRef = useRef(null);

  // Current font and zoom values
  const currentFontPx = Number(accessibility.customFontSizePx) || FONT_PRESET_MAP[accessibility.fontSize] || 15;
  const currentZoom = Number(accessibility.pageZoom) || 100;

  // Track fullscreen state
  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  // Close dock on Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Determine current active page & context dynamically
  const activePageInfo = useMemo(() => {
    const path = location.pathname;
    const opTab = opEngine?.activeTab || '';

    if (path.includes('/excel-workspace')) {
      return {
        id: 'EXCEL_WORKSPACE',
        title: 'Enterprise Excel Workspace',
        subtitle: 'Spreadsheet Grid & Live BMRCL Data Studio',
        icon: FileText,
        color: 'emerald'
      };
    }
    if (path.includes('/fault-reporting') || path.includes('/faults')) {
      return {
        id: 'AI_FAULTS',
        title: 'AI Rolling Stock Fault Reporting',
        subtitle: 'Automated ALS Inspection & Rake Defect Logger',
        icon: Shield,
        color: 'rose'
      };
    }
    if (path.includes('/login')) {
      return {
        id: 'LOGIN',
        title: 'PYIDCC Secure Login',
        subtitle: 'BMRCL Line-2 Crew Control Portal',
        icon: Shield,
        color: 'cyan'
      };
    }

    // Tab-based detection in Dashboard
    switch (opTab) {
      case 'DASHBOARD':
      case 'TRACK':
        return {
          id: 'TRACK_DETECTOR',
          title: 'Live Schematic Track Position Detector (Line-2)',
          subtitle: 'Green Line ATS Telemetry & Active Train Operator Relievers',
          icon: Train,
          color: 'cyan'
        };
      case 'WTT':
        return {
          id: 'RELIEF_MATRIX',
          title: 'Live Train Operator Relief Matrix & WTT',
          subtitle: 'Station Changeover Table & Handover Countdowns',
          icon: Radio,
          color: 'amber'
        };
      case 'DUTY_GENERATOR':
        return {
          id: 'DUTY_GENERATOR',
          title: 'Daily Duty Generator Suite',
          subtitle: 'BMRCL Line-2 Automated Timetable & Roster Generation',
          icon: Calendar,
          color: 'purple'
        };
      case 'ROSTER':
        return {
          id: 'ROSTER',
          title: 'Monthly Roster Publisher',
          subtitle: 'Crew Shift Links & Published Roster Boards',
          icon: FileText,
          color: 'blue'
        };
      case 'EMERGENCY_RELIEF':
        return {
          id: 'EMERGENCY_RELIEF',
          title: 'Emergency Relief Engine',
          subtitle: 'Rapid Dispatch & Dynamic Crew Replacement',
          icon: Radio,
          color: 'rose'
        };
      case 'KM_CALC_SUITE':
        return {
          id: 'KM_CALC_SUITE',
          title: 'Crew KM Calculator Suite',
          subtitle: 'Official Chainage Distance & Energy Telemetry',
          icon: Sliders,
          color: 'emerald'
        };
      case 'REPORTS':
        return {
          id: 'REPORTS',
          title: 'Reports & Telemetry Center',
          subtitle: 'Operational Exports, Analytics & Shift Handover',
          icon: FileText,
          color: 'cyan'
        };
      case 'CHANGEOVER_LINK':
      case 'NIGHT_CHANGEOVER':
        return {
          id: 'CHANGEOVER',
          title: 'Line-2 Changeover Dashboard',
          subtitle: 'Night Shift & Depot Turnout Transitions',
          icon: Clock,
          color: 'amber'
        };
      case 'LEAVE':
      case 'LEAVE_BO':
        return {
          id: 'LEAVE',
          title: 'Leave & Book Off Management',
          subtitle: 'Train Operator Leave Requests & Quotas',
          icon: Calendar,
          color: 'yellow'
        };
      default:
        return {
          id: 'MAIN_DASHBOARD',
          title: 'Peenya Depot Operations Console',
          subtitle: 'BMRCL Line-2 Crew Control System',
          icon: Train,
          color: 'cyan'
        };
    }
  }, [location.pathname, opEngine?.activeTab]);

  // Toggle Fullscreen
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  // If dock is turned off in settings, don't render floating trigger
  if (accessibility.mousePointerDockOpen === false) {
    return null;
  }

  const ActiveIcon = activePageInfo.icon;

  return (
    <>
      {/* ── Persistent Floating Left-Click Mouse Trigger Button (@ Every Page) ── */}
      <div 
        className="fixed bottom-4 right-4 z-50 flex items-center gap-2 group print:hidden select-none"
        style={{ zoom: 1 }} // Prevent floating trigger from resizing out of view
      >
        <button
          onClick={() => setIsOpen(prev => !prev)}
          className={`flex items-center gap-2 px-3 py-2 rounded-full shadow-2xl backdrop-blur-md transition-all duration-300 border ${
            isOpen 
              ? 'bg-cyan-600 text-white border-cyan-400 ring-4 ring-cyan-500/30 shadow-cyan-900/50' 
              : 'bg-slate-900/90 hover:bg-slate-800 text-slate-200 border-slate-700 hover:border-cyan-500 shadow-black/80 hover:shadow-cyan-900/40'
          }`}
          title="Mouse Left Click: Open 40px Font Scaling, Zoom & Page Tools"
          aria-label="Open Accessibility & Page Options Dock"
        >
          <div className="p-1 rounded-full bg-cyan-950 text-cyan-400 border border-cyan-700/60">
            <MousePointer size={14} className="text-cyan-400 animate-pulse" />
          </div>
          <div className="flex flex-col text-left">
            <span className="text-[11px] font-black uppercase tracking-wider font-mono flex items-center gap-1.5 leading-none">
              <span>{currentFontPx}px</span>
              <span className="text-slate-500">•</span>
              <span>{currentZoom}%</span>
            </span>
            <span className="text-[9px] text-cyan-300/90 font-sans tracking-tight">
              Font & Zoom Tools
            </span>
          </div>
          <span className="hidden md:inline-block ml-1 text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
            Left Click
          </span>
        </button>
      </div>

      {/* ── Interactive Mouse Left-Pointer Accessibility & Page Tools Modal Dock ── */}
      {isOpen && (
        <div 
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:justify-end p-2 sm:p-5 bg-black/60 backdrop-blur-sm print:hidden"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsOpen(false);
          }}
          style={{ zoom: 1 }} // Keeps modal dock clear and usable even at extreme page zooms
        >
          <div 
            ref={dockRef}
            className="w-full sm:w-[460px] max-h-[90vh] bg-slate-950 border-2 border-cyan-500/60 rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-scale-up font-mono text-slate-200"
          >
            {/* Dock Top Header */}
            <div className="bg-slate-900 px-4 py-3 border-b border-slate-800 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className="p-2 rounded-lg bg-cyan-950 border border-cyan-700/60 text-cyan-400 flex-shrink-0">
                  <MousePointer size={16} />
                </div>
                <div className="min-w-0">
                  <h3 className="text-xs font-black text-white uppercase tracking-wider truncate">
                    Mouse Left-Pointer Controls
                  </h3>
                  <div className="flex items-center gap-1.5 text-[9.5px] text-cyan-300 truncate">
                    <ActiveIcon size={11} className="flex-shrink-0" />
                    <span className="truncate">{activePageInfo.title}</span>
                  </div>
                </div>
              </div>

              {/* Close Button */}
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white bg-slate-800 hover:bg-rose-900 transition border border-slate-700"
                  title="Close dock (Esc)"
                >
                  <X size={14} />
                </button>
              </div>
            </div>

            {/* Navigation Tabs Inside Dock */}
            <div className="bg-slate-900/60 border-b border-slate-850 px-3 py-1.5 flex items-center gap-1.5 text-[11px] font-bold">
              <button
                onClick={() => setActiveDockTab('scaling')}
                className={`flex-1 py-1.5 px-2 rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                  activeDockTab === 'scaling'
                    ? 'bg-cyan-600 text-white shadow-sm font-black'
                    : 'text-slate-400 hover:text-slate-200 bg-slate-950/60'
                }`}
              >
                <Type size={13} />
                <span>Font & Zoom</span>
              </button>
              <button
                onClick={() => setActiveDockTab('page_tools')}
                className={`flex-1 py-1.5 px-2 rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                  activeDockTab === 'page_tools'
                    ? 'bg-amber-600 text-white shadow-sm font-black'
                    : 'text-slate-400 hover:text-slate-200 bg-slate-950/60'
                }`}
              >
                <Sparkles size={13} />
                <span>Page Tools</span>
              </button>
              <button
                onClick={() => setActiveDockTab('navigator')}
                className={`flex-1 py-1.5 px-2 rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                  activeDockTab === 'navigator'
                    ? 'bg-emerald-600 text-white shadow-sm font-black'
                    : 'text-slate-400 hover:text-slate-200 bg-slate-950/60'
                }`}
              >
                <LayoutGrid size={13} />
                <span>Jump Page</span>
              </button>
            </div>

            {/* Dock Body Content (Scrollable) */}
            <div className="p-4 space-y-4 overflow-y-auto flex-1 text-xs">
              
              {/* ──────────────── TAB 1: FONT SCALING (UP TO 40PX) & PAGE ZOOMING ──────────────── */}
              {activeDockTab === 'scaling' && (
                <div className="space-y-4">
                  {/* Font Scaling Section */}
                  <div className="bg-slate-900/90 p-3.5 rounded-xl border border-slate-800 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Type size={14} className="text-cyan-400" />
                        <span className="text-[11px] font-black uppercase tracking-wider text-slate-200">
                          Font Scaling (Up to 40px)
                        </span>
                      </div>
                      <span className="text-xs font-black text-cyan-400 font-mono bg-cyan-950 px-2.5 py-0.5 rounded border border-cyan-800">
                        {currentFontPx}px
                      </span>
                    </div>

                    {/* Continuous Slider from 12px to 40px */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-[9px] text-slate-400 font-bold uppercase">
                        <span>12px Min</span>
                        <span>Drag slider for instant scaling</span>
                        <span>40px Max</span>
                      </div>
                      <input 
                        type="range"
                        min="12"
                        max="40"
                        step="1"
                        value={currentFontPx}
                        onChange={(e) => {
                          const px = Number(e.target.value);
                          setAccessibility({ customFontSizePx: px });
                        }}
                        className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                      />
                    </div>

                    {/* Preset Size Pills (Including 40px) */}
                    <div className="grid grid-cols-4 gap-1 text-[10px] font-bold">
                      {[
                        { label: '13px (Small)', px: 13, key: 'small' },
                        { label: '15px (Def)', px: 15, key: 'medium' },
                        { label: '18px (Lg)', px: 18, key: 'large' },
                        { label: '22px (XL)', px: 22, key: 'xlarge' },
                        { label: '26px (Huge)', px: 26, key: 'huge' },
                        { label: '30px (Massive)', px: 30, key: 'massive' },
                        { label: '34px (Giant)', px: 34, key: 'giant' },
                        { label: '40px (Ultra)', px: 40, key: 'ultra' }
                      ].map((item) => (
                        <button
                          key={item.key}
                          onClick={() => setAccessibility({ fontSize: item.key, customFontSizePx: item.px })}
                          className={`py-1 rounded text-center transition-all ${
                            currentFontPx === item.px
                              ? 'bg-cyan-600 text-white font-black shadow-sm'
                              : 'bg-slate-950 text-slate-300 hover:text-white border border-slate-800'
                          }`}
                        >
                          {item.px}px
                        </button>
                      ))}
                    </div>

                    {/* Quick Step Buttons */}
                    <div className="flex items-center gap-1.5 pt-1">
                      <button
                        onClick={() => {
                          const next = Math.max(12, currentFontPx - 2);
                          setAccessibility({ customFontSizePx: next });
                        }}
                        className="flex-1 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-black transition border border-slate-750"
                        title="Decrease font size by 2px"
                      >
                        A- (Smaller)
                      </button>
                      <button
                        onClick={() => setAccessibility({ fontSize: 'medium', customFontSizePx: 15 })}
                        className="py-1.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-[10px] font-bold transition border border-slate-750"
                      >
                        Reset 15px
                      </button>
                      <button
                        onClick={() => {
                          const next = Math.min(40, currentFontPx + 2);
                          setAccessibility({ customFontSizePx: next });
                        }}
                        className="flex-1 py-1.5 bg-cyan-900/60 hover:bg-cyan-800 text-cyan-200 rounded-lg text-xs font-black transition border border-cyan-700/60"
                        title="Increase font size by 2px"
                      >
                        A+ (Larger)
                      </button>
                      <button
                        onClick={() => setAccessibility({ fontSize: 'ultra', customFontSizePx: 40 })}
                        className="py-1.5 px-2.5 bg-emerald-900/60 hover:bg-emerald-800 text-emerald-300 rounded-lg text-[10px] font-black transition border border-emerald-700/60"
                        title="Set to 40px Maximum Font"
                      >
                        40px Max
                      </button>
                    </div>
                  </div>

                  {/* Page Zooming Section */}
                  <div className="bg-slate-900/90 p-3.5 rounded-xl border border-slate-800 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <ZoomIn size={14} className="text-emerald-400" />
                        <span className="text-[11px] font-black uppercase tracking-wider text-slate-200">
                          Page Zooming (75% - 200%)
                        </span>
                      </div>
                      <span className="text-xs font-black text-emerald-400 font-mono bg-emerald-950 px-2.5 py-0.5 rounded border border-emerald-800">
                        {currentZoom}%
                      </span>
                    </div>

                    {/* Continuous Zoom Slider */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-[9px] text-slate-400 font-bold uppercase">
                        <span>75%</span>
                        <span>Smooth Viewport Zoom</span>
                        <span>200%</span>
                      </div>
                      <input 
                        type="range"
                        min="75"
                        max="200"
                        step="5"
                        value={currentZoom}
                        onChange={(e) => setAccessibility({ pageZoom: Number(e.target.value) })}
                        className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-400"
                      />
                    </div>

                    {/* Preset Zoom Buttons */}
                    <div className="grid grid-cols-4 gap-1 text-[10px] font-bold">
                      {[75, 90, 100, 110, 125, 150, 175, 200].map((pct) => (
                        <button
                          key={pct}
                          onClick={() => setAccessibility({ pageZoom: pct })}
                          className={`py-1 rounded text-center transition-all ${
                            currentZoom === pct
                              ? 'bg-emerald-600 text-white font-black shadow-sm'
                              : 'bg-slate-950 text-slate-300 hover:text-white border border-slate-800'
                          }`}
                        >
                          {pct}%
                        </button>
                      ))}
                    </div>

                    {/* Zoom Quick Step Controls */}
                    <div className="flex items-center gap-1.5 pt-1">
                      <button
                        onClick={() => {
                          const next = Math.max(75, currentZoom - 10);
                          setAccessibility({ pageZoom: next });
                        }}
                        className="flex-1 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-bold transition border border-slate-750 flex items-center justify-center gap-1"
                        title="Zoom Out 10%"
                      >
                        <ZoomOut size={13} />
                        <span>-10%</span>
                      </button>
                      <button
                        onClick={() => setAccessibility({ pageZoom: 100 })}
                        className="py-1.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-[10px] font-bold transition border border-slate-750"
                      >
                        Reset 100%
                      </button>
                      <button
                        onClick={() => {
                          const next = Math.min(200, currentZoom + 10);
                          setAccessibility({ pageZoom: next });
                        }}
                        className="flex-1 py-1.5 bg-emerald-900/60 hover:bg-emerald-800 text-emerald-200 rounded-lg text-xs font-bold transition border border-emerald-700/60 flex items-center justify-center gap-1"
                        title="Zoom In 10%"
                      >
                        <ZoomIn size={13} />
                        <span>+10%</span>
                      </button>
                    </div>
                  </div>

                  {/* Contrast, Eye Shield & Fullscreen Toggles */}
                  <div className="grid grid-cols-2 gap-2 text-[10px] font-bold">
                    <button
                      onClick={() => setAccessibility({ highContrast: !accessibility.highContrast })}
                      className={`p-2 rounded-lg border transition flex items-center justify-center gap-1.5 ${
                        accessibility.highContrast
                          ? 'bg-yellow-950 text-yellow-300 border-yellow-600'
                          : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <Eye size={13} />
                      <span>{accessibility.highContrast ? 'High Contrast ON' : 'High Contrast'}</span>
                    </button>

                    <button
                      onClick={() => setAccessibility({ blueLightReduction: !accessibility.blueLightReduction })}
                      className={`p-2 rounded-lg border transition flex items-center justify-center gap-1.5 ${
                        accessibility.blueLightReduction
                          ? 'bg-blue-950 text-blue-300 border-blue-600'
                          : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <Shield size={13} />
                      <span>{accessibility.blueLightReduction ? 'Eye Shield ON' : 'Eye Shield'}</span>
                    </button>

                    <button
                      onClick={toggleFullscreen}
                      className="p-2 rounded-lg bg-slate-900 text-slate-300 border border-slate-800 hover:border-cyan-600 transition flex items-center justify-center gap-1.5 col-span-2"
                    >
                      {isFullscreen ? <Minimize size={13} /> : <Maximize size={13} />}
                      <span>{isFullscreen ? 'Exit Fullscreen' : 'Fullscreen Workstation View'}</span>
                    </button>
                  </div>
                </div>
              )}

              {/* ──────────────── TAB 2: PAGE-SPECIFIC TOOLS (DYNAMICALLY LOADED) ──────────────── */}
              {activeDockTab === 'page_tools' && (
                <div className="space-y-3">
                  {/* Current Page Banner */}
                  <div className="bg-slate-900 p-3 rounded-xl border border-amber-600/40 space-y-1">
                    <span className="text-[9px] uppercase font-bold text-amber-400 tracking-wider block">
                      Options Loaded For Current Page
                    </span>
                    <h4 className="text-xs font-black text-white flex items-center gap-1.5">
                      <ActiveIcon size={14} className="text-amber-400" />
                      {activePageInfo.title}
                    </h4>
                    <p className="text-[10px] text-slate-400">
                      {activePageInfo.subtitle}
                    </p>
                  </div>

                  {/* Contextual Page Actions based on active page */}
                  {activePageInfo.id === 'TRACK_DETECTOR' && (
                    <div className="space-y-2">
                      <span className="text-[9.5px] uppercase font-bold text-cyan-400 block tracking-wider">
                        Line-2 Schematic Track Controls
                      </span>
                      <div className="grid grid-cols-2 gap-2 text-[10px] font-bold">
                        <button
                          onClick={() => {
                            if (opEngine?.setActiveTab) opEngine.setActiveTab('WTT');
                            setIsOpen(false);
                          }}
                          className="p-2 rounded-lg bg-amber-950/60 hover:bg-amber-900/60 text-amber-300 border border-amber-700 transition flex items-center justify-center gap-1.5"
                        >
                          <Radio size={12} />
                          <span>Relief Matrix</span>
                        </button>
                        <button
                          onClick={() => {
                            window.scrollTo({ top: 350, behavior: 'smooth' });
                            setIsOpen(false);
                          }}
                          className="p-2 rounded-lg bg-cyan-950/60 hover:bg-cyan-900/60 text-cyan-300 border border-cyan-700 transition flex items-center justify-center gap-1.5"
                        >
                          <Train size={12} />
                          <span>Track View</span>
                        </button>
                      </div>
                      <p className="text-[9.5px] text-slate-400 bg-slate-900/80 p-2 rounded-lg border border-slate-800">
                        Tip: Train badges show both upcoming reliever (top) and current driving operator (bottom).
                      </p>
                    </div>
                  )}

                  {activePageInfo.id === 'RELIEF_MATRIX' && (
                    <div className="space-y-2">
                      <span className="text-[9.5px] uppercase font-bold text-amber-400 block tracking-wider">
                        Relief Matrix Actions
                      </span>
                      <div className="grid grid-cols-2 gap-2 text-[10px] font-bold">
                        <button
                          onClick={() => {
                            if (opEngine?.setActiveTab) opEngine.setActiveTab('DASHBOARD');
                            setIsOpen(false);
                          }}
                          className="p-2 rounded-lg bg-cyan-950/60 hover:bg-cyan-900/60 text-cyan-300 border border-cyan-700 transition flex items-center justify-center gap-1.5"
                        >
                          <Train size={12} />
                          <span>Track Detector</span>
                        </button>
                        <button
                          onClick={() => window.print()}
                          className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800 transition flex items-center justify-center gap-1.5"
                        >
                          <Printer size={12} />
                          <span>Print Matrix</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {activePageInfo.id === 'DUTY_GENERATOR' && (
                    <div className="space-y-2">
                      <span className="text-[9.5px] uppercase font-bold text-purple-400 block tracking-wider">
                        Duty Generator Actions
                      </span>
                      <div className="grid grid-cols-2 gap-2 text-[10px] font-bold">
                        <button
                          onClick={() => window.print()}
                          className="p-2 rounded-lg bg-purple-950/60 text-purple-300 border border-purple-700 transition flex items-center justify-center gap-1.5"
                        >
                          <Printer size={12} />
                          <span>Print Duties</span>
                        </button>
                        <button
                          onClick={() => {
                            if (opEngine?.setActiveTab) opEngine.setActiveTab('ROSTER');
                            setIsOpen(false);
                          }}
                          className="p-2 rounded-lg bg-blue-950/60 text-blue-300 border border-blue-700 transition flex items-center justify-center gap-1.5"
                        >
                          <FileText size={12} />
                          <span>Roster Publisher</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Common Page Actions for all pages */}
                  <div className="pt-2 border-t border-slate-800 space-y-2">
                    <span className="text-[9.5px] uppercase font-bold text-slate-400 block tracking-wider">
                      Universal Tools
                    </span>
                    <div className="grid grid-cols-2 gap-2 text-[10px] font-bold">
                      <button
                        onClick={() => window.location.reload()}
                        className="p-2 rounded-lg bg-slate-900 hover:bg-slate-850 text-slate-300 border border-slate-800 transition flex items-center justify-center gap-1.5"
                      >
                        <RefreshCw size={12} />
                        <span>Reload Page</span>
                      </button>
                      <button
                        onClick={() => window.print()}
                        className="p-2 rounded-lg bg-slate-900 hover:bg-slate-850 text-slate-300 border border-slate-800 transition flex items-center justify-center gap-1.5"
                      >
                        <Printer size={12} />
                        <span>Print Page</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* ──────────────── TAB 3: 1-CLICK UNIVERSAL PAGE NAVIGATOR ──────────────── */}
              {activeDockTab === 'navigator' && (
                <div className="space-y-3">
                  <span className="text-[9.5px] uppercase font-bold text-emerald-400 block tracking-wider">
                    Instant 1-Click Page Jump
                  </span>
                  
                  <div className="grid grid-cols-1 gap-1.5 text-xs">
                    {[
                      { id: 'DASHBOARD', name: 'Live Schematic Track Detector (Line-2)', route: '/', icon: Train, badge: 'ATS Telemetry' },
                      { id: 'WTT', name: 'Live Train Operator Relief Matrix', route: '/', icon: Radio, badge: 'Relief Tracking' },
                      { id: 'DUTY_GENERATOR', name: 'Daily Duty Generator Suite', route: '/', icon: Calendar, badge: 'WTT Schedule' },
                      { id: 'ROSTER', name: 'Monthly Roster Publisher', route: '/', icon: FileText, badge: 'Shift Links' },
                      { id: 'EMERGENCY_RELIEF', name: 'Emergency Relief Engine', route: '/', icon: Radio, badge: 'Dispatch' },
                      { id: 'KM_CALC_SUITE', name: 'Crew KM Calculator Suite', route: '/', icon: Sliders, badge: 'Distance & SEC' },
                      { id: 'EXCEL_WORKSPACE', name: 'Enterprise Excel Workspace', route: '/excel-workspace', icon: FileText, badge: 'Full Page' },
                      { id: 'AI_FAULTS', name: 'AI Rolling Stock Fault Reporting', route: '/fault-reporting', icon: Shield, badge: 'Defects' },
                      { id: 'REPORTS', name: 'Reports & Telemetry Center', route: '/', icon: Download, badge: 'Analytics' }
                    ].map((dest) => (
                      <button
                        key={dest.id}
                        onClick={() => {
                          if (dest.route === '/' && opEngine?.setActiveTab) {
                            opEngine.setActiveTab(dest.id);
                            if (location.pathname !== '/') navigate('/');
                          } else {
                            navigate(dest.route);
                          }
                          setIsOpen(false);
                        }}
                        className="w-full p-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-cyan-500/80 transition-all flex items-center justify-between text-left group"
                      >
                        <div className="flex items-center gap-2">
                          <dest.icon size={14} className="text-cyan-400 group-hover:scale-110 transition-transform" />
                          <span className="text-xs font-bold text-slate-200 group-hover:text-white">
                            {dest.name}
                          </span>
                        </div>
                        <span className="text-[9px] px-2 py-0.5 rounded bg-slate-950 text-slate-400 border border-slate-800 font-mono">
                          {dest.badge}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

            </div>

            {/* Dock Bottom Status Footer */}
            <div className="bg-slate-900/90 px-4 py-2.5 border-t border-slate-800 flex items-center justify-between text-[10px] text-slate-400 font-mono">
              <span>Active Scale: <strong className="text-cyan-400">{currentFontPx}px</strong> / <strong className="text-emerald-400">{currentZoom}%</strong></span>
              <button
                onClick={() => {
                  resetThemeSettings();
                  alert("Accessibility font scaling & zoom reset to default.");
                }}
                className="text-rose-400 hover:text-rose-300 font-bold transition flex items-center gap-1"
                title="Reset font to 15px and zoom to 100%"
              >
                <RotateCcw size={10} />
                <span>Reset Defaults</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
