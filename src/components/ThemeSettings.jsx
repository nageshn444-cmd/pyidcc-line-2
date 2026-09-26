import React, { useState } from 'react';
import { useTheme, FONT_PRESET_MAP } from '../context/ThemeContext';
import { 
  Sun, Moon, Eye, ShieldAlert, Sparkles, Paintbrush, 
  RotateCcw, Sliders, Type, LayoutGrid, Activity, 
  Copy, Check, Download, Upload, Laptop, Clock,
  ZoomIn, ZoomOut, MousePointer, Maximize
} from 'lucide-react';

export default function ThemeSettings() {
  const {
    theme,
    rawTheme,
    setTheme,
    autoThemeMode,
    setAutoThemeMode,
    accessibility,
    setAccessibility,
    personalization,
    setPersonalization,
    customThemeColors,
    setCustomThemeColors,
    resetThemeSettings,
    detectedOS
  } = useTheme();

  const [importString, setImportString] = useState('');
  const [importError, setImportError] = useState(null);
  const [importSuccess, setImportSuccess] = useState(false);
  const [copied, setCopied] = useState(false);

  const themes = [
    { id: 'theme-occ-dark', label: 'Metro OCC Dark', desc: 'SCADA-optimized deep slate dark environment', icon: Moon },
    { id: 'theme-occ-light', label: 'Metro OCC Light', desc: 'White and slate light room visual setup', icon: Sun },
    { id: 'theme-night-ops', label: 'Night Operations', desc: 'Pure black surface with neon cyan controls', icon: Moon },
    { id: 'theme-comfort-day', label: 'Eye Comfort Day', desc: 'Warm paper white base with dark brown-grey text', icon: Eye },
    { id: 'theme-comfort-night', label: 'Eye Comfort Night', desc: 'Zinc base with reduced blue light filters', icon: Eye },
    { id: 'theme-emerald-ops', label: 'Emerald Operations', desc: 'Slate grey with emerald green highlight accents', icon: Activity },
    { id: 'theme-contrast', label: 'High Contrast Access', desc: 'WCAG AA+ black, white, and yellow accessibility styling', icon: ShieldAlert },
    { id: 'theme-bmrcl', label: 'BMRCL Classic', desc: 'Bangalore Metro inspired corporate blue, green & gold theme', icon: Sparkles },
    { id: 'theme-auto', label: 'Auto Theme Detector', desc: 'Progression: Comfort Day → OCC Light → OCC Dark → Comfort Night', icon: Laptop },
  ];

  // Export current config
  const handleExport = () => {
    const config = {
      theme: rawTheme,
      autoThemeMode,
      accessibility,
      personalization,
      customThemeColors
    };
    navigator.clipboard.writeText(JSON.stringify(config, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Import config
  const handleImport = () => {
    try {
      setImportError(null);
      setImportSuccess(false);
      const parsed = JSON.parse(importString);
      
      if (parsed.theme) setTheme(parsed.theme);
      if (parsed.autoThemeMode) setAutoThemeMode(parsed.autoThemeMode);
      if (parsed.accessibility) setAccessibility(parsed.accessibility);
      if (parsed.personalization) setPersonalization(parsed.personalization);
      if (parsed.customThemeColors) setCustomThemeColors(parsed.customThemeColors);

      setImportSuccess(true);
      setImportString('');
      setTimeout(() => setImportSuccess(false), 3000);
    } catch (err) {
      setImportError("Invalid JSON structure: " + err.message);
    }
  };

  return (
    <div className="space-y-6 font-mono text-slate-200">
      
      {/* Settings Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Theme List Selection */}
        <div className="lg:col-span-2 space-y-4 bg-slate-950/40 border border-slate-800/80 rounded-xl p-5">
          <h3 className="text-xs font-bold text-slate-300 uppercase tracking-widest flex items-center gap-2 border-b border-slate-800/60 pb-3 mb-4">
            <Sliders className="h-4 w-4 text-blue-500" /> Choose Workstation Theme
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {themes.map(t => {
              const Icon = t.icon;
              const isActive = rawTheme === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTheme(t.id)}
                  className={`text-left p-4 rounded-xl border transition-all duration-300 relative group flex items-start gap-3 ${
                    isActive 
                      ? 'bg-blue-500/10 border-blue-500/50 shadow-[0_0_15px_rgba(59,130,246,0.08)]' 
                      : 'bg-slate-900/50 border-slate-800/60 hover:border-slate-700 hover:bg-slate-850/30'
                  }`}
                >
                  <div className={`p-2 rounded-lg ${isActive ? 'bg-blue-500/20 text-blue-400' : 'bg-slate-950 text-slate-500 group-hover:text-slate-350'}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div>
                    <h4 className={`text-xs font-bold ${isActive ? 'text-blue-450' : 'text-slate-200'}`}>{t.label}</h4>
                    <p className="text-[10px] text-slate-500 mt-1 uppercase tracking-wider leading-relaxed">{t.desc}</p>
                  </div>
                  {isActive && (
                    <span className="absolute right-3 top-3 h-2 w-2 rounded-full bg-blue-500 animate-pulse"></span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Auto Theme Switcher Sub-configuration */}
          {rawTheme === 'theme-auto' && (
            <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-4 animate-slide-in mt-4">
              <h4 className="text-xs font-bold text-blue-450 uppercase tracking-widest flex items-center gap-1.5">
                <Laptop className="h-4 w-4" /> Auto Theme Preferences
              </h4>
              <p className="text-[10px] text-slate-400 uppercase tracking-wider">
                Detected OS: <span className="text-emerald-450 font-bold">{detectedOS}</span>
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <button
                  onClick={() => setAutoThemeMode('system')}
                  className={`p-3 border rounded-lg text-xs font-bold text-center transition ${
                    autoThemeMode === 'system' 
                      ? 'bg-blue-500/10 border-blue-500/50 text-blue-400' 
                      : 'border-slate-850 bg-slate-950 text-slate-450 hover:bg-slate-900'
                  }`}
                >
                  Match System Appearance
                </button>
                <button
                  onClick={() => setAutoThemeMode('time')}
                  className={`p-3 border rounded-lg text-xs font-bold text-center transition ${
                    autoThemeMode === 'time' 
                      ? 'bg-blue-500/10 border-blue-500/50 text-blue-400' 
                      : 'border-slate-850 bg-slate-950 text-slate-450 hover:bg-slate-900'
                  }`}
                >
                  Time Operations Cycle (Day/Night)
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Live Preview Panel */}
        <div className="space-y-4 bg-slate-950/40 border border-slate-800/80 rounded-xl p-5 flex flex-col">
          <h3 className="text-xs font-bold text-slate-300 uppercase tracking-widest flex items-center gap-2 border-b border-slate-800/60 pb-3 mb-4">
            <Eye className="h-4 w-4 text-cyan-400" /> Dynamic Live Theme Preview
          </h3>
          
          <div className="border border-slate-800 rounded-xl p-4 bg-slate-950 flex-1 space-y-3 flex flex-col justify-center">
            {/* Header bar */}
            <div className="h-8 bg-slate-900 border border-slate-800 rounded flex items-center justify-between px-3 text-[10px] font-bold">
              <span className="text-slate-100">Telemetry Feed</span>
              <span className="text-emerald-450 animate-pulse font-bold">● ONLINE</span>
            </div>

            {/* Matrix box mockup */}
            <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg space-y-2">
              <div className="flex justify-between items-center text-[10px] font-bold text-slate-400 border-b border-slate-800/50 pb-1.5">
                <span>Duty 12 (PEENYA DEPOT)</span>
                <span className="bg-slate-950 text-amber-500 border border-slate-800 px-1 py-0.5 rounded text-[8.5px]">TRAIN 204</span>
              </div>
              <div className="flex justify-between items-center text-[10px]">
                <span className="text-slate-350">Operator Name:</span>
                <span className="text-slate-100 font-bold uppercase">MUTUKUMARAN S</span>
              </div>
              <div className="flex justify-between items-center text-[10px]">
                <span className="text-slate-350">Remarks:</span>
                <span className="text-slate-450 italic">Day Shift Leg 3</span>
              </div>
            </div>

            {/* Test input elements */}
            <div className="space-y-1">
              <span className="text-[8px] uppercase tracking-wider text-slate-500">Form Fields</span>
              <input id="themesettings-i1" name="themesettings-i1" 
                type="text" 
                value="Active Dispatch Desk Input" 
                readOnly
                className="w-full text-[10px] p-2 bg-slate-900 border border-slate-800 rounded-lg animate-pulse"
              />
            </div>

            {/* Buttons Mockup */}
            <div className="grid grid-cols-2 gap-2">
              <button className="theme-btn-primary p-2 text-[10px] font-bold rounded-lg uppercase tracking-wider">
                Primary
              </button>
              <button className="bg-slate-900 border border-slate-800 text-slate-200 p-2 text-[10px] font-bold rounded-lg uppercase tracking-wider">
                Secondary
              </button>
            </div>
            
            <div className="text-[9.5px] text-slate-500 text-center uppercase tracking-widest leading-relaxed mt-2">
              All UI controls render with custom theme variables instantly.
            </div>
          </div>
        </div>

      </div>

      {/* Accessibility & Scaling Section */}
      <div className="bg-slate-950/40 border border-slate-800/80 rounded-xl p-5 space-y-6">
        <div className="flex items-center justify-between border-b border-slate-800/60 pb-3 flex-wrap gap-2">
          <h3 className="text-xs font-bold text-slate-300 uppercase tracking-widest flex items-center gap-2">
            <Type className="h-4 w-4 text-cyan-400" /> Accessibility & Scaling Adjustments
          </h3>
          <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-800 font-mono font-bold">
            Font: {accessibility.customFontSizePx || FONT_PRESET_MAP[accessibility.fontSize] || 15}px • Zoom: {accessibility.pageZoom || 100}%
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          
          {/* 1. Font Size Scaling (Extended up to 40px) */}
          <div className="space-y-3 bg-slate-900/60 p-3.5 rounded-xl border border-slate-800">
            <div className="flex items-center justify-between">
              <h4 className="text-[10px] font-bold text-slate-300 uppercase tracking-widest flex items-center gap-1.5">
                <Type className="h-3.5 w-3.5 text-cyan-400" /> Font Scaling (Up to 40px)
              </h4>
              <span className="text-xs font-black text-cyan-400 font-mono bg-cyan-950 px-2 py-0.5 rounded border border-cyan-800">
                {accessibility.customFontSizePx || FONT_PRESET_MAP[accessibility.fontSize] || 15}px
              </span>
            </div>

            {/* Preset Selector */}
            <select id="themesettings-i2" name="themesettings-i2"
              value={accessibility.fontSize}
              onChange={(e) => {
                const val = e.target.value;
                const px = FONT_PRESET_MAP[val] || 15;
                setAccessibility({ fontSize: val, customFontSizePx: px });
              }}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-medium"
            >
              <option value="small">Small (13px)</option>
              <option value="medium">Medium (15px - Default)</option>
              <option value="large">Large (18px)</option>
              <option value="xlarge">Extra Large (22px)</option>
              <option value="huge">Huge (26px)</option>
              <option value="massive">Massive (30px)</option>
              <option value="giant">Giant (34px)</option>
              <option value="supergiant">Super Giant (37px)</option>
              <option value="ultra">Ultra Maximum (40px)</option>
            </select>

            {/* Continuous Pixel Range Slider (12px to 40px) */}
            <div className="space-y-1">
              <div className="flex justify-between text-[9px] text-slate-400 font-bold uppercase">
                <span>12px</span>
                <span>Fine-tune Font Size</span>
                <span>40px</span>
              </div>
              <input 
                type="range"
                min="12"
                max="40"
                step="1"
                value={accessibility.customFontSizePx || FONT_PRESET_MAP[accessibility.fontSize] || 15}
                onChange={(e) => {
                  const px = Number(e.target.value);
                  setAccessibility({ customFontSizePx: px });
                }}
                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
              />
            </div>

            {/* Quick Font Step Buttons */}
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  const curr = accessibility.customFontSizePx || FONT_PRESET_MAP[accessibility.fontSize] || 15;
                  const next = Math.max(12, curr - 2);
                  setAccessibility({ customFontSizePx: next });
                }}
                className="flex-1 py-1 px-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs font-black transition border border-slate-750"
                title="Decrease font size by 2px"
              >
                A-
              </button>
              <button
                type="button"
                onClick={() => setAccessibility({ fontSize: 'medium', customFontSizePx: 15 })}
                className="py-1 px-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[10px] font-bold transition border border-slate-750"
                title="Reset to 15px standard"
              >
                15px
              </button>
              <button
                type="button"
                onClick={() => {
                  const curr = accessibility.customFontSizePx || FONT_PRESET_MAP[accessibility.fontSize] || 15;
                  const next = Math.min(40, curr + 2);
                  setAccessibility({ customFontSizePx: next });
                }}
                className="flex-1 py-1 px-2 bg-cyan-900/60 hover:bg-cyan-800 text-cyan-200 rounded text-xs font-black transition border border-cyan-700/60"
                title="Increase font size by 2px"
              >
                A+
              </button>
              <button
                type="button"
                onClick={() => setAccessibility({ fontSize: 'ultra', customFontSizePx: 40 })}
                className="py-1 px-2.5 bg-emerald-900/60 hover:bg-emerald-800 text-emerald-300 rounded text-[10px] font-black transition border border-emerald-700/60"
                title="Jump to 40px Maximum Font"
              >
                40px
              </button>
            </div>
          </div>

          {/* 2. Page Zooming Controls (75% to 200%) */}
          <div className="space-y-3 bg-slate-900/60 p-3.5 rounded-xl border border-slate-800">
            <div className="flex items-center justify-between">
              <h4 className="text-[10px] font-bold text-slate-300 uppercase tracking-widest flex items-center gap-1.5">
                <ZoomIn className="h-3.5 w-3.5 text-emerald-400" /> Page Zooming (75% - 200%)
              </h4>
              <span className="text-xs font-black text-emerald-400 font-mono bg-emerald-950 px-2 py-0.5 rounded border border-emerald-800">
                {accessibility.pageZoom || 100}%
              </span>
            </div>

            {/* Zoom Preset Selector */}
            <select
              value={accessibility.pageZoom || 100}
              onChange={(e) => setAccessibility({ pageZoom: Number(e.target.value) })}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 font-medium"
            >
              <option value="75">75% (Compact Overview)</option>
              <option value="90">90% (Condensed)</option>
              <option value="100">100% (Standard 1:1 Scale)</option>
              <option value="110">110% (Comfort Zoom)</option>
              <option value="125">125% (Magnified)</option>
              <option value="150">150% (High Zoom)</option>
              <option value="175">175% (Extra High Zoom)</option>
              <option value="200">200% (Ultra 2x Zoom)</option>
            </select>

            {/* Continuous Zoom Slider */}
            <div className="space-y-1">
              <div className="flex justify-between text-[9px] text-slate-400 font-bold uppercase">
                <span>75%</span>
                <span>Zoom Scale Slider</span>
                <span>200%</span>
              </div>
              <input 
                type="range"
                min="75"
                max="200"
                step="5"
                value={accessibility.pageZoom || 100}
                onChange={(e) => setAccessibility({ pageZoom: Number(e.target.value) })}
                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-400"
              />
            </div>

            {/* Zoom Step Buttons */}
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  const curr = accessibility.pageZoom || 100;
                  const next = Math.max(75, curr - 10);
                  setAccessibility({ pageZoom: next });
                }}
                className="flex-1 py-1 px-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs font-bold transition border border-slate-750 flex items-center justify-center gap-1"
                title="Zoom Out 10%"
              >
                <ZoomOut size={12} />
                <span>-10%</span>
              </button>
              <button
                type="button"
                onClick={() => setAccessibility({ pageZoom: 100 })}
                className="py-1 px-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[10px] font-bold transition border border-slate-750"
                title="Reset to 100% standard zoom"
              >
                100%
              </button>
              <button
                type="button"
                onClick={() => {
                  const curr = accessibility.pageZoom || 100;
                  const next = Math.min(200, curr + 10);
                  setAccessibility({ pageZoom: next });
                }}
                className="flex-1 py-1 px-2 bg-emerald-900/60 hover:bg-emerald-800 text-emerald-200 rounded text-xs font-bold transition border border-emerald-700/60 flex items-center justify-center gap-1"
                title="Zoom In 10%"
              >
                <ZoomIn size={12} />
                <span>+10%</span>
              </button>
            </div>
          </div>

          {/* 3. Mouse Left Pointer Options Dock & Density */}
          <div className="space-y-3 bg-slate-900/60 p-3.5 rounded-xl border border-slate-800 flex flex-col justify-between">
            <div>
              <h4 className="text-[10px] font-bold text-slate-300 uppercase tracking-widest flex items-center gap-1.5 mb-2">
                <MousePointer className="h-3.5 w-3.5 text-amber-400" /> Mouse Pointer Controls & Density
              </h4>

              {/* Grid Density */}
              <div className="space-y-1 mb-3">
                <span className="text-[9.5px] text-slate-400 font-bold uppercase">Card / Table Density</span>
                <select id="themesettings-i3" name="themesettings-i3"
                  value={personalization.density}
                  onChange={(e) => setPersonalization({ density: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 focus:outline-none"
                >
                  <option value="compact">Compact Grid</option>
                  <option value="comfortable">Comfortable Grid (Default)</option>
                  <option value="spacious">Spacious Grid</option>
                </select>
              </div>

              {/* Checkboxes: Dock & Eye Shield */}
              <div className="space-y-2 bg-slate-950 border border-slate-800 rounded-lg p-2.5">
                <label className="flex items-center gap-2 cursor-pointer select-none" htmlFor="themesettings-dock">
                  <input 
                    id="themesettings-dock"
                    name="themesettings-dock"
                    type="checkbox"
                    checked={accessibility.mousePointerDockOpen !== false}
                    onChange={(e) => setAccessibility({ mousePointerDockOpen: e.target.checked })}
                    className="rounded bg-slate-900 border-slate-700 text-amber-500 focus:ring-0 h-3.5 w-3.5 cursor-pointer"
                  />
                  <span className="text-[10px] font-bold text-amber-300 uppercase">
                    Mouse Left-Click Dock on Every Page
                  </span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer select-none" htmlFor="themesettings-i5">
                  <input id="themesettings-i5" name="themesettings-i5" 
                    type="checkbox"
                    checked={accessibility.blueLightReduction}
                    onChange={(e) => setAccessibility({ blueLightReduction: e.target.checked })}
                    className="rounded bg-slate-900 border-slate-700 text-blue-500 focus:ring-0 h-3.5 w-3.5 cursor-pointer"
                  />
                  <span className="text-[10px] uppercase font-bold text-blue-400">Eye Shield (Blue Light Reduction)</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer select-none" htmlFor="themesettings-i6">
                  <input id="themesettings-i6" name="themesettings-i6" 
                    type="checkbox"
                    checked={accessibility.highContrast}
                    onChange={(e) => setAccessibility({ highContrast: e.target.checked })}
                    className="rounded bg-slate-900 border-slate-700 text-yellow-500 focus:ring-0 h-3.5 w-3.5 cursor-pointer"
                  />
                  <span className="text-[10px] uppercase font-bold text-yellow-400">High Contrast Mode</span>
                </label>
              </div>
            </div>
          </div>

        </div>

        {/* Live Typography Preview Box */}
        <div className="p-4 rounded-xl bg-slate-900 border border-cyan-800/50 shadow-inner">
          <div className="flex justify-between items-center text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 border-b border-slate-800 pb-1.5">
            <span>Live Font Size & Zoom Preview</span>
            <span className="text-cyan-400 font-mono">
              Active: {accessibility.customFontSizePx || FONT_PRESET_MAP[accessibility.fontSize] || 15}px @ {accessibility.pageZoom || 100}% Zoom
            </span>
          </div>
          <div 
            className="text-slate-100 font-sans font-bold leading-relaxed transition-all"
            style={{ 
              fontSize: `${accessibility.customFontSizePx || FONT_PRESET_MAP[accessibility.fontSize] || 15}px`,
              lineHeight: 1.3
            }}
          >
            BMRCL Peenya Depot (Line-2) • Train T-206 Reliever Handover Active at PYID Platform 1
          </div>
          <p className="text-[11px] text-slate-400 mt-2 font-mono">
            All text, cards, tables, and buttons across every page automatically scale with this configuration.
          </p>
        </div>

        {/* Sliders & Reset controls */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2 border-t border-slate-800/60">
          {/* Brightness Adjustment Slider */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              <span>Overall Board Brightness</span>
              <span className="text-blue-400 font-black">{accessibility.brightness}%</span>
            </div>
            <input id="themesettings-i7" name="themesettings-i7" 
              type="range" 
              min="50" 
              max="100" 
              value={accessibility.brightness} 
              onChange={(e) => setAccessibility({ brightness: Number(e.target.value) })}
              className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-500" 
            />
          </div>

          {/* Reset Controls Button */}
          <div className="flex items-center justify-end">
            <button
              onClick={() => {
                if (window.confirm("Are you sure you want to reset all workstation theme, text scaling (15px), and zoom (100%) back to default settings?")) {
                  resetThemeSettings();
                  alert("Workstation preferences reset successfully.");
                }
              }}
              className="bg-rose-950/20 hover:bg-rose-900/20 border border-rose-900/40 text-rose-400 px-5 py-2.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all flex items-center gap-2"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Reset Theme & Scaling Defaults
            </button>
          </div>
        </div>
      </div>

      {/* Import / Export Settings */}
      <div className="bg-slate-950/40 border border-slate-800/80 rounded-xl p-5 space-y-4">
        <h3 className="text-xs font-bold text-slate-300 uppercase tracking-widest flex items-center gap-2 border-b border-slate-800/60 pb-3">
          <Download className="h-4 w-4 text-cyan-400" /> Backup, Import & Export Configuration
        </h3>
        <p className="text-[10px] text-slate-400 uppercase tracking-wider leading-relaxed">
          Export your current visual configuration payload to easily back it up or share visual preferences across workstations. Copy the output or paste a saved JSON configuration below to apply changes.
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest" htmlFor="themesettings-i8">Visual Preference Profile Import</label>
            <textarea id="themesettings-i8" name="themesettings-i8"
              rows={4}
              placeholder='Paste visual config JSON payload here...'
              value={importString}
              onChange={(e) => setImportString(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-200 font-mono focus:outline-none"
            />
            <div className="flex items-center gap-2">
              <button
                onClick={handleImport}
                disabled={!importString}
                className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Upload className="h-3.5 w-3.5" /> Apply Profile
              </button>
              {importError && (
                <span className="text-[10px] text-rose-450 uppercase font-bold">{importError}</span>
              )}
              {importSuccess && (
                <span className="text-[10px] text-emerald-450 uppercase font-bold">Profile imported and applied!</span>
              )}
            </div>
          </div>

          <div className="flex flex-col justify-between space-y-2">
            <div>
              <div className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Active Profile Export</div>
              <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg text-[10.5px] text-slate-450 font-mono select-all overflow-x-auto whitespace-pre">
{`{
  "theme": "${rawTheme}",
  "autoThemeMode": "${autoThemeMode}",
  "fontSize": "${accessibility.fontSize}",
  "density": "${personalization.density}"
}`}
              </div>
            </div>
            <button
              onClick={handleExport}
              className="bg-slate-900 border border-slate-800 text-slate-200 hover:bg-slate-850 px-4 py-2.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition flex items-center justify-center gap-1.5"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
              <span>{copied ? 'Profile Copied!' : 'Copy Profile To Clipboard'}</span>
            </button>
          </div>
        </div>
      </div>

    </div>
  );
}
