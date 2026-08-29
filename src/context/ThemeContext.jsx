import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { db } from '../firebase';
import { doc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';
import { useAuth } from './AuthContext';

export const DEFAULT_THEME_VALUE = {
  theme: 'theme-occ-dark',
  rawTheme: 'theme-occ-dark',
  setTheme: () => {},
  autoThemeMode: 'system',
  setAutoThemeMode: () => {},
  tokens: {
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
  },
  accessibility: {
    fontSize: 'medium',
    highContrast: false,
    animations: 'normal',
    brightness: 100,
    blueLightReduction: false,
  },
  setAccessibility: () => {},
  personalization: {
    density: 'comfortable',
    widgetOrder: ['status', 'map', 'relief', 'swap', 'leave', 'matrix'],
    language: 'EN',
  },
  setPersonalization: () => {},
  customThemeColors: {
    appBg: '#0b1329',
    panelBg: 'rgba(20, 30, 55, 0.5)',
    textMain: '#f1f5f9',
    accentColor: '#10b981',
  },
  setCustomThemeColors: () => {},
  resetThemeSettings: () => {},
  emergencyMode: false,
  activeIncidentsCount: 0,
  detectedOS: 'Windows'
};

const ThemeContext = createContext(DEFAULT_THEME_VALUE);

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    return DEFAULT_THEME_VALUE;
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

const getStored = (key, fallback) => {
  if (typeof window === 'undefined') return fallback;
  try {
    const val = localStorage.getItem(key);
    return val !== null && val !== undefined ? val : fallback;
  } catch {
    return fallback;
  }
};

const getStoredJSON = (key, fallback) => {
  if (typeof window === 'undefined') return fallback;
  try {
    const val = localStorage.getItem(key);
    return val ? JSON.parse(val) : fallback;
  } catch {
    return fallback;
  }
};

export function ThemeProvider({ children }) {
  const { currentUser } = useAuth();
  const uid = currentUser?.uid || 'anonymous';

  // Instant synchronous lazy initialization from localStorage for 0ms load time
  const [theme, setThemeState] = useState(() => 
    getStored(`pyidcc_theme_${uid}`, getStored('pyidcc_theme_active', 'theme-occ-dark'))
  );
  const [autoThemeMode, setAutoThemeModeState] = useState(() => 
    getStored(`pyidcc_automode_${uid}`, getStored('pyidcc_automode_active', 'system'))
  );
  
  const [accessibility, setAccessibilityState] = useState(() => 
    getStoredJSON(`pyidcc_access_${uid}`, {
      fontSize: 'medium',
      highContrast: false,
      animations: 'normal',
      brightness: 100,
      blueLightReduction: false,
    })
  );

  const [personalization, setPersonalizationState] = useState(() => 
    getStoredJSON(`pyidcc_pers_${uid}`, {
      density: 'comfortable',
      widgetOrder: ['status', 'map', 'relief', 'swap', 'leave', 'matrix'],
      language: 'EN',
    })
  );

  const [customThemeColors, setCustomThemeColorsState] = useState(() => 
    getStoredJSON(`pyidcc_custom_${uid}`, {
      appBg: '#0b1329',
      panelBg: 'rgba(20, 30, 55, 0.5)',
      textMain: '#f1f5f9',
      accentColor: '#10b981',
    })
  );

  const [emergencyMode] = useState(false);
  const [activeIncidentsCount] = useState(0);

  // Sync Preferences to database and localStorage non-blockingly
  const savePreferences = async (updatedTheme, updatedAutoMode, updatedAccess, updatedPers, updatedCustom) => {
    const activeTheme = updatedTheme || theme;
    const activeAutoMode = updatedAutoMode || autoThemeMode;
    const activeAccess = updatedAccess || accessibility;
    const activePers = updatedPers || personalization;
    const activeCustom = updatedCustom || customThemeColors;

    try {
      localStorage.setItem('pyidcc_theme_active', activeTheme);
      localStorage.setItem('pyidcc_automode_active', activeAutoMode);
      localStorage.setItem(`pyidcc_theme_${uid}`, activeTheme);
      localStorage.setItem(`pyidcc_automode_${uid}`, activeAutoMode);
      localStorage.setItem(`pyidcc_access_${uid}`, JSON.stringify(activeAccess));
      localStorage.setItem(`pyidcc_pers_${uid}`, JSON.stringify(activePers));
      localStorage.setItem(`pyidcc_custom_${uid}`, JSON.stringify(activeCustom));
    } catch {
      // ignore storage quota issues
    }

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
      console.warn("Theme preferences background sync:", e);
    }
  };

  // Background non-blocking sync with Firestore
  useEffect(() => {
    if (!currentUser) return;

    const unsub = onSnapshot(doc(db, 'userThemeSettings', uid), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.theme) setThemeState(data.theme);
        if (data.autoThemeMode) setAutoThemeModeState(data.autoThemeMode);
        if (data.accessibility) setAccessibilityState(prev => ({ ...prev, ...data.accessibility }));
        if (data.personalization) setPersonalizationState(prev => ({ ...prev, ...data.personalization }));
        if (data.customThemeColors) setCustomThemeColorsState(data.customThemeColors);
      }
    }, () => {
      // offline silent fallback
    });

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
    const interval = setInterval(determineAutoTheme, 60000);

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

  // 4. Pure CSS/React container styling - ZERO imperative DOM manipulation ("dont do DOM")
  const containerStyle = useMemo(() => {
    if (activeTheme === 'theme-custom') {
      return {
        '--custom-app-bg': customThemeColors.appBg,
        '--custom-panel-bg': customThemeColors.panelBg,
        '--custom-panel-bg-solid': customThemeColors.panelBg.replace(/[\d\.]+\)$/, '1)'),
        '--custom-header-bg': customThemeColors.appBg,
        '--custom-text-main': customThemeColors.textMain,
        '--custom-text-sub': customThemeColors.textMain + 'dd',
        '--custom-text-muted': customThemeColors.textMain + 'aa',
        '--custom-border-color': 'rgba(255,255,255,0.08)',
        '--custom-accent-color': customThemeColors.accentColor,
        '--custom-accent-glow': customThemeColors.accentColor + '55',
      };
    }
    return undefined;
  }, [activeTheme, customThemeColors]);

  const containerClass = useMemo(() => {
    const list = [
      activeTheme,
      `text-sz-${accessibility.fontSize || 'medium'}`,
      accessibility.highContrast || activeTheme === 'theme-contrast' ? 'high-contrast' : '',
      accessibility.animations === 'reduced' ? 'reduce-motion' : accessibility.animations === 'fast' ? 'fast-motion' : '',
      'min-h-screen w-full bg-[var(--app-bg,#0B1220)] text-[var(--text-main,#F8FAFC)]'
    ];
    return list.filter(Boolean).join(' ');
  }, [activeTheme, accessibility]);

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
      <div 
        id="pyidcc-theme-root"
        className={containerClass}
        style={containerStyle}
        data-density={personalization.density || 'comfortable'}
      >
        {children}
      </div>
    </ThemeContext.Provider>
  );
}
