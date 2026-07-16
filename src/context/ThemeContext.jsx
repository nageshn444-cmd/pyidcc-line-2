import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { db } from '../firebase';
import { doc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';
import { useAuth } from './AuthContext';

const ThemeContext = createContext();

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

// Automatic contrasting text color generator based on background luminance
export function getContrastColor(hexColor) {
  if (!hexColor) return '#ffffff';
  const cleanHex = hexColor.replace('#', '');
  if (cleanHex.length < 6) return '#ffffff';
  const r = parseInt(cleanHex.substr(0, 2), 16);
  const g = parseInt(cleanHex.substr(2, 2), 16);
  const b = parseInt(cleanHex.substr(4, 2), 16);
  const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
  return (yiq >= 135) ? '#0f172a' : '#ffffff';
}

// Detect operating system for the "Auto Theme" OS detection
const detectOS = () => {
  if (typeof window === 'undefined') return 'Unknown';
  const ua = window.navigator.userAgent;
  if (/Windows/i.test(ua)) return 'Windows';
  if (/Macintosh|Mac OS X/i.test(ua)) return 'macOS';
  if (/Linux/i.test(ua)) return 'Linux';
  if (/Android/i.test(ua)) return 'Android';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'iOS';
  return 'Browser-Default';
};

export function ThemeProvider({ children }) {
  const { currentUser } = useAuth();
  const uid = currentUser?.uid || 'anonymous';

  // Base state definitions
  const [theme, setThemeState] = useState('theme-occ-dark');
  const [autoThemeMode, setAutoThemeModeState] = useState('system'); // 'system' | 'time'
  
  const [accessibility, setAccessibilityState] = useState({
    fontSize: 'medium', // 'small' | 'medium' | 'large' | 'xlarge'
    highContrast: false,
    animations: 'normal', // 'normal' | 'reduced' | 'fast'
    brightness: 100, // 50 to 100
    blueLightReduction: false,
  });

  const [personalization, setPersonalizationState] = useState({
    density: 'comfortable', // 'compact' | 'comfortable' | 'spacious'
    widgetOrder: ['status', 'map', 'relief', 'swap', 'leave', 'matrix'],
    language: 'EN',
  });

  const [customThemeColors, setCustomThemeColorsState] = useState({
    appBg: '#0b1329',
    panelBg: 'rgba(20, 30, 55, 0.5)',
    textMain: '#f1f5f9',
    accentColor: '#10b981',
  });

  const [emergencyMode, setEmergencyMode] = useState(false);
  const [activeIncidentsCount, setActiveIncidentsCount] = useState(0);

  // Sync Preferences to database and localStorage
  const savePreferences = async (updatedTheme, updatedAutoMode, updatedAccess, updatedPers, updatedCustom) => {
    // Save to LocalStorage first for speed
    const activeTheme = updatedTheme || theme;
    const activeAutoMode = updatedAutoMode || autoThemeMode;
    const activeAccess = updatedAccess || accessibility;
    const activePers = updatedPers || personalization;
    const activeCustom = updatedCustom || customThemeColors;

    localStorage.setItem(`pyidcc_theme_${uid}`, activeTheme);
    localStorage.setItem(`pyidcc_automode_${uid}`, activeAutoMode);
    localStorage.setItem(`pyidcc_access_${uid}`, JSON.stringify(activeAccess));
    localStorage.setItem(`pyidcc_pers_${uid}`, JSON.stringify(activePers));
    localStorage.setItem(`pyidcc_custom_${uid}`, JSON.stringify(activeCustom));

    if (!currentUser) return;
    try {
      const payload = {
        theme: activeTheme,
        autoThemeMode: activeAutoMode,
        accessibility: activeAccess,
        personalization: activePers,
        customThemeColors: activeCustom,
        lastUpdated: serverTimestamp()
      };
      await setDoc(doc(db, 'userThemeSettings', uid), payload, { merge: true });
    } catch (e) {
      console.error("Failed to save theme settings to Firestore:", e);
    }
  };

  // 1. Fetch & Sync with Firestore & LocalStorage
  useEffect(() => {
    if (!currentUser) {
      // Offline fallback
      const storedTheme = localStorage.getItem(`pyidcc_theme_anonymous`) || 'theme-occ-dark';
      const storedAuto = localStorage.getItem(`pyidcc_automode_anonymous`) || 'system';
      setThemeState(storedTheme);
      setAutoThemeModeState(storedAuto);
      return;
    }

    const unsub = onSnapshot(doc(db, 'userThemeSettings', uid), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.theme) setThemeState(data.theme);
        if (data.autoThemeMode) setAutoThemeModeState(data.autoThemeMode);
        if (data.accessibility) setAccessibilityState(prev => ({ ...prev, ...data.accessibility }));
        if (data.personalization) setPersonalizationState(prev => ({ ...prev, ...data.personalization }));
        if (data.customThemeColors) setCustomThemeColorsState(data.customThemeColors);
      } else {
        // Sync fallback from localStorage
        const storedTheme = localStorage.getItem(`pyidcc_theme_${uid}`);
        if (storedTheme) setThemeState(storedTheme);

        const storedAuto = localStorage.getItem(`pyidcc_automode_${uid}`);
        if (storedAuto) setAutoThemeModeState(storedAuto);

        const storedAccess = localStorage.getItem(`pyidcc_access_${uid}`);
        if (storedAccess) {
          try { setAccessibilityState(JSON.parse(storedAccess)); } catch (e) { console.error(e); }
        }
        const storedPers = localStorage.getItem(`pyidcc_pers_${uid}`);
        if (storedPers) {
          try { setPersonalizationState(JSON.parse(storedPers)); } catch (e) { console.error(e); }
        }
        const storedCustom = localStorage.getItem(`pyidcc_custom_${uid}`);
        if (storedCustom) {
          try { setCustomThemeColorsState(JSON.parse(storedCustom)); } catch (e) { console.error(e); }
        }
      }
    });

    return () => unsub();
  }, [currentUser, uid]);

  // Listen to live incidents to trigger emergency mode
  useEffect(() => {
    if (!currentUser) {
      setActiveIncidentsCount(0);
      setEmergencyMode(false);
      return;
    }

    const unsub = onSnapshot(doc(db, 'userThemeSettings', uid), () => {
      // Nested subscription to incidents
      const incidentsUnsub = onSnapshot(doc(db, 'config', 'incidents'), () => {
        // Safe check since we may not need to read all collections in offline modes
      });
      return () => incidentsUnsub();
    }, () => {});

    return () => unsub();
  }, [currentUser, uid]);

  // 2. Computed Auto Theme switching
  const [computedAutoSubTheme, setComputedAutoSubTheme] = useState('theme-occ-dark');
  useEffect(() => {
    if (theme !== 'theme-auto') return;

    const determineAutoTheme = () => {
      if (autoThemeMode === 'system') {
        const isSystemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        setComputedAutoSubTheme(isSystemDark ? 'theme-occ-dark' : 'theme-occ-light');
      } else {
        // Time based progressive cycle:
        // 06:00 - 09:00: Eye Comfort Day
        // 09:00 - 17:00: OCC Light
        // 17:00 - 21:00: OCC Dark
        // 21:00 - 06:00: Eye Comfort Night
        const now = new Date();
        const hour = now.getHours() + now.getMinutes() / 60;
        if (hour >= 6.0 && hour < 9.0) {
          setComputedAutoSubTheme('theme-comfort-day');
        } else if (hour >= 9.0 && hour < 17.0) {
          setComputedAutoSubTheme('theme-occ-light');
        } else if (hour >= 17.0 && hour < 21.0) {
          setComputedAutoSubTheme('theme-occ-dark');
        } else {
          setComputedAutoSubTheme('theme-comfort-night');
        }
      }
    };

    determineAutoTheme();
    const interval = setInterval(determineAutoTheme, 30000);

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const listener = () => determineAutoTheme();
    mediaQuery.addEventListener('change', listener);

    return () => {
      clearInterval(interval);
      mediaQuery.removeEventListener('change', listener);
    };
  }, [theme, autoThemeMode]);

  // Active theme calculation
  const activeTheme = useMemo(() => {
    if (emergencyMode) return 'theme-emergency';
    if (theme === 'theme-auto') return computedAutoSubTheme;
    return theme;
  }, [theme, computedAutoSubTheme, emergencyMode]);

  // 3. Centralized theme design tokens
  const tokens = useMemo(() => ({
    background: 'var(--app-bg)',
    surface: 'var(--panel-bg-solid)',
    card: 'var(--panel-bg)',
    primary: 'var(--accent-color)',
    secondary: 'var(--text-sub)',
    text: 'var(--text-main)',
    textMuted: 'var(--text-muted)',
    border: 'var(--border-color)',
    success: 'var(--success-color)',
    warning: 'var(--warning-color)',
    error: 'var(--error-color)',
    info: 'var(--info-color)',
    hover: 'var(--hover-bg)',
    headerBg: 'var(--header-bg)',
    accentText: 'var(--accent-text)',
    cardShadow: 'var(--card-shadow)'
  }), []);

  // 4. Apply classes and css variables to HTML element
  useEffect(() => {
    const htmlEl = document.documentElement;

    // List of all themes to remove
    const themesList = [
      'theme-occ-dark',
      'theme-occ-light',
      'theme-night-ops',
      'theme-comfort-day',
      'theme-comfort-night',
      'theme-contrast',
      'theme-emerald-ops',
      'theme-bmrcl',
      'theme-emergency',
      'theme-custom'
    ];
    themesList.forEach(t => htmlEl.classList.remove(t));
    htmlEl.classList.add(activeTheme);

    // Apply custom colors if theme-custom is active
    if (activeTheme === 'theme-custom') {
      htmlEl.style.setProperty('--custom-app-bg', customThemeColors.appBg);
      htmlEl.style.setProperty('--custom-panel-bg', customThemeColors.panelBg);
      htmlEl.style.setProperty('--custom-panel-bg-solid', customThemeColors.panelBg.replace(/[\d\.]+\)$/, '1)'));
      htmlEl.style.setProperty('--custom-header-bg', customThemeColors.appBg);
      htmlEl.style.setProperty('--custom-text-main', customThemeColors.textMain);
      htmlEl.style.setProperty('--custom-text-sub', customThemeColors.textMain + 'dd');
      htmlEl.style.setProperty('--custom-text-muted', customThemeColors.textMain + 'aa');
      htmlEl.style.setProperty('--custom-border-color', 'rgba(255,255,255,0.08)');
      htmlEl.style.setProperty('--custom-accent-color', customThemeColors.accentColor);
      htmlEl.style.setProperty('--custom-accent-glow', customThemeColors.accentColor + '55');
    } else {
      // Clear custom properties
      const propertiesToRemove = [
        '--custom-app-bg', '--custom-panel-bg', '--custom-panel-bg-solid',
        '--custom-header-bg', '--custom-text-main', '--custom-text-sub',
        '--custom-text-muted', '--custom-border-color', '--custom-accent-color',
        '--custom-accent-glow'
      ];
      propertiesToRemove.forEach(p => htmlEl.style.removeProperty(p));
    }

    // Apply accessibility properties
    htmlEl.classList.remove('text-sz-small', 'text-sz-medium', 'text-sz-large', 'text-sz-xlarge');
    htmlEl.classList.add(`text-sz-${accessibility.fontSize}`);

    htmlEl.setAttribute('data-density', personalization.density || 'comfortable');

    if (accessibility.highContrast || activeTheme === 'theme-contrast') {
      htmlEl.classList.add('high-contrast');
    } else {
      htmlEl.classList.remove('high-contrast');
    }

    htmlEl.classList.remove('reduce-motion', 'fast-motion');
    if (accessibility.animations === 'reduced') {
      htmlEl.classList.add('reduce-motion');
    } else if (accessibility.animations === 'fast') {
      htmlEl.classList.add('fast-motion');
    }

    let filterString = `brightness(${accessibility.brightness || 100}%)`;
    if (accessibility.blueLightReduction) {
      filterString += ` sepia(0.45) saturate(0.85) hue-rotate(-12deg)`;
    }
    htmlEl.style.filter = filterString;
  }, [activeTheme, accessibility, personalization, customThemeColors]);

  const setTheme = (newTheme) => {
    setThemeState(newTheme);
    savePreferences(newTheme, null, null, null, null);
  };

  const setAutoThemeMode = (newMode) => {
    setAutoThemeModeState(newMode);
    savePreferences(null, newMode, null, null, null);
  };

  const setAccessibility = (newAccess) => {
    setAccessibilityState(prev => {
      const updated = { ...prev, ...newAccess };
      savePreferences(null, null, updated, null, null);
      return updated;
    });
  };

  const setPersonalization = (newPers) => {
    setPersonalizationState(prev => {
      const updated = { ...prev, ...newPers };
      savePreferences(null, null, null, updated, null);
      return updated;
    });
  };

  const setCustomThemeColors = (newCustom) => {
    setCustomThemeColorsState(prev => {
      const updated = { ...prev, ...newCustom };
      savePreferences(null, null, null, null, updated);
      return updated;
    });
  };

  const resetThemeSettings = () => {
    const defaultAccess = {
      fontSize: 'medium',
      highContrast: false,
      animations: 'normal',
      brightness: 100,
      blueLightReduction: false,
    };
    const defaultPers = {
      density: 'comfortable',
      widgetOrder: ['status', 'map', 'relief', 'swap', 'leave', 'matrix'],
      language: 'EN',
    };
    const defaultCustom = {
      appBg: '#0b1329',
      panelBg: 'rgba(20, 30, 55, 0.5)',
      textMain: '#f1f5f9',
      accentColor: '#10b981',
    };
    setThemeState('theme-occ-dark');
    setAutoThemeModeState('system');
    setAccessibilityState(defaultAccess);
    setPersonalizationState(defaultPers);
    setCustomThemeColorsState(defaultCustom);
    savePreferences('theme-occ-dark', 'system', defaultAccess, defaultPers, defaultCustom);
  };

  const detectedOS = useMemo(() => detectOS(), []);

  const value = useMemo(() => ({
    theme: activeTheme,
    rawTheme: theme,
    setTheme,
    autoThemeMode,
    setAutoThemeMode,
    tokens,
    accessibility,
    setAccessibility,
    personalization,
    setPersonalization,
    customThemeColors,
    setCustomThemeColors,
    resetThemeSettings,
    emergencyMode,
    activeIncidentsCount,
    detectedOS
  }), [activeTheme, theme, autoThemeMode, tokens, accessibility, personalization, customThemeColors, emergencyMode, activeIncidentsCount, detectedOS]);

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}
