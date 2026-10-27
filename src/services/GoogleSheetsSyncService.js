/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * BMRCL LINE-2 PEENYA DEPOT CREW CONTROL
 * GOOGLE SHEETS LIVE SYNC SERVICE
 * 
 * Provides bi-directional synchronization between Google Sheets and BMRCL Automated Dispatch:
 * 1. Parses Google Sheets URLs (Standard docs.google.com & Published Web URLs)
 * 2. Fetches live spreadsheet data (via GViz / CSV Export / Proxy fallback)
 * 3. Supports 1-Click Clipboard Instant Sync (Zero-configuration fallback)
 * 4. Converts live sheet stream into a browser File object for automated classifier ingest
 * 5. Persists connected spreadsheet link in localStorage and Firebase
 */

const STORAGE_KEY = 'bmrcl_connected_google_sheet_url';
export const DEFAULT_CONNECTED_GOOGLE_SHEET_URL = 'https://docs.google.com/spreadsheets/d/1mbhYUd5DYvn_os7i8MvwPj3CjYylHuXrn_tLwlUX-fU/edit?gid=0#gid=0';

/**
 * Checks if a string is a valid Google Sheets URL
 */
export function isGoogleSheetUrl(url) {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  return /docs\.google\.com\/spreadsheets\/(d|e)\/([a-zA-Z0-9-_]+)/i.test(trimmed);
}

/**
 * Parses details from a Google Sheets URL
 */
export function parseGoogleSheetUrl(url) {
  if (!isGoogleSheetUrl(url)) return null;
  const trimmed = url.trim();

  // Check for published web link
  const pubMatch = trimmed.match(/docs\.google\.com\/spreadsheets\/d\/e\/([a-zA-Z0-9-_]+)/i);
  if (pubMatch) {
    const pubId = pubMatch[1];
    return {
      isPublished: true,
      id: pubId,
      gid: '0',
      rawUrl: trimmed,
      editUrl: trimmed,
      csvUrl: trimmed.includes('?') ? `${trimmed}&output=csv` : `${trimmed}?output=csv`,
    };
  }

  // Standard sheet link
  const standardMatch = trimmed.match(/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/i);
  if (!standardMatch) return null;

  const id = standardMatch[1];
  
  // Extract gid (sheet tab ID)
  let gid = '0';
  const gidMatch = trimmed.match(/[#&?]gid=([0-9]+)/i);
  if (gidMatch) {
    gid = gidMatch[1];
  }

  return {
    isPublished: false,
    id,
    gid,
    rawUrl: trimmed,
    editUrl: `https://docs.google.com/spreadsheets/d/${id}/edit#gid=${gid}`,
    csvUrl: `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`,
    gvizCsvUrl: `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&gid=${gid}`,
    xlsxUrl: `https://docs.google.com/spreadsheets/d/${id}/export?format=xlsx`,
    embedUrl: `https://docs.google.com/spreadsheets/d/${id}/htmlembed?gid=${gid}&widget=false&chrome=false`,
  };
}

/**
 * Helper to execute fetch with a strict timeout signal
 */
async function fetchWithTimeout(url, options = {}, timeoutMs = 3500) {
  let timer;
  let signal;
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    signal = AbortSignal.timeout(timeoutMs);
  } else {
    const controller = new AbortController();
    timer = setTimeout(() => controller.abort(), timeoutMs);
    signal = controller.signal;
  }

  try {
    const response = await fetch(url, {
      ...options,
      signal,
    });
    if (timer) clearTimeout(timer);
    return response;
  } catch (err) {
    if (timer) clearTimeout(timer);
    throw err;
  }
}

/**
 * Validates whether the fetched text is genuine CSV data and not an HTML error or login page.
 */
function validateCsvContent(text) {
  if (!text || typeof text !== 'string') return false;
  if (text.includes('<!DOCTYPE html>') || text.includes('<html') || text.includes('Sign in to your Google Account')) {
    return false;
  }
  return text.includes(',') || text.includes('\t') || text.includes('\n');
}

/**
 * Fetches CSV content directly from Google Sheets with ultra-fast parallel proxy fallback
 */
export async function fetchGoogleSheetCsv(url) {
  const parsed = parseGoogleSheetUrl(url);
  if (!parsed) {
    throw new Error('Please enter a valid Google Sheets URL (e.g. https://docs.google.com/spreadsheets/d/...)');
  }

  let isRestricted = false;

  // 1. First, attempt direct Google Sheets endpoints with a fast 2.5s timeout.
  // For published/public sheets or CORS-tolerant browsers, this resolves in ~200-500ms!
  const directEndpoints = parsed.isPublished
    ? [parsed.csvUrl]
    : [parsed.gvizCsvUrl, parsed.csvUrl];

  for (const ep of directEndpoints) {
    try {
      const response = await fetchWithTimeout(ep, {
        cache: 'no-store',
        headers: { 'Accept': 'text/csv, text/plain, */*' },
      }, 2500);

      if (response.status === 401 || response.status === 403) {
        isRestricted = true;
      } else if (response.ok) {
        const text = await response.text();
        if (text.includes('Sign in to your Google Account')) {
          isRestricted = true;
        } else if (validateCsvContent(text)) {
          return text;
        }
      }
    } catch {
      // Direct fetch failed (CORS or network timeout); advance to fast concurrent proxy race
    }
  }

  // 2. If direct endpoints failed (e.g. browser CORS restrictions on Google servers),
  // race multiple independent CORS proxies concurrently. The fastest working proxy wins!
  const targetCsvUrl = parsed.isPublished ? parsed.csvUrl : (parsed.gvizCsvUrl || parsed.csvUrl);
  const targetExportUrl = parsed.csvUrl;

  const proxyCandidates = [
    `https://corsproxy.io/?${encodeURIComponent(targetCsvUrl)}`,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(targetCsvUrl)}`,
    `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(targetCsvUrl)}`,
    `https://corsproxy.io/?${encodeURIComponent(targetExportUrl)}`,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(targetExportUrl)}`,
  ];

  try {
    const fastestResult = await Promise.any(
      proxyCandidates.map(async (proxyUrl) => {
        const response = await fetchWithTimeout(proxyUrl, {
          cache: 'no-store',
          headers: { 'Accept': 'text/csv, text/plain, */*' },
        }, 4500);

        if (response.status === 401 || response.status === 403) {
          isRestricted = true;
          throw new Error('Restricted');
        }
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const text = await response.text();
        if (text && text.includes('Sign in to your Google Account')) {
          isRestricted = true;
          throw new Error('Restricted');
        }
        if (validateCsvContent(text)) {
          return text;
        }
        throw new Error('Invalid CSV payload');
      })
    );

    if (fastestResult) {
      return fastestResult;
    }
  } catch {
    // All proxies failed or timed out
  }

  if (isRestricted) {
    throw new Error(
      'Google Sheet is currently set to "Restricted".\n\n' +
      'To enable automatic 1-click sync:\n' +
      '1. In your Google Sheet, click the blue "Share" button (top-right)\n' +
      '2. Under "General access", change "Restricted" to "Anyone with the link" (Viewer)\n' +
      '3. Click "Done"\n\n' +
      '💡 Quick alternative: Copy your sheet in Google Sheets (Ctrl+A, Ctrl+C), then click "📋 Paste & Sync" in the app!'
    );
  }

  throw new Error(
    'Unable to read Google Sheet data. Please ensure link sharing is enabled: In Google Sheets, click "Share" → under General access, select "Anyone with the link can view".'
  );
}

/**
 * Converts CSV/TSV raw text into a standard browser File object
 */
export function csvToFile(csvText, fileName = 'Google_Sheet_Duty_Roster.csv') {
  const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
  return new File([blob], fileName, {
    type: 'text/csv',
    lastModified: Date.now()
  });
}

/**
 * Reads clipboard content and converts it directly into a roster File
 */
export async function pasteClipboardAsRosterFile() {
  if (!navigator.clipboard || !navigator.clipboard.readText) {
    throw new Error('Clipboard access is not supported by your browser.');
  }
  const text = await navigator.clipboard.readText();
  if (!text || text.trim().length === 0) {
    throw new Error('Clipboard is empty! In Google Sheets, press Ctrl+A then Ctrl+C, then return here and click Paste & Sync.');
  }
  return csvToFile(text, 'Google_Sheet_Clipboard_Roster.csv');
}

/**
 * Saves connected Google Sheet URL to localStorage
 */
export function saveGoogleSheetUrl(url) {
  if (typeof window !== 'undefined' && window.localStorage) {
    if (url) {
      window.localStorage.setItem(STORAGE_KEY, String(url).trim());
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }
}

/**
 * Gets saved Google Sheet URL from localStorage, defaulting to the BMRCL user's configured sheet
 */
export function getSavedGoogleSheetUrl() {
  if (typeof window !== 'undefined' && window.localStorage) {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved && isGoogleSheetUrl(saved)) {
      return saved;
    }
  }
  return DEFAULT_CONNECTED_GOOGLE_SHEET_URL;
}

/**
 * Generates an empty Google Sheet creation link
 */
export function getCreateGoogleSheetUrl() {
  return 'https://docs.google.com/spreadsheets/create';
}

export default {
  DEFAULT_CONNECTED_GOOGLE_SHEET_URL,
  isGoogleSheetUrl,
  parseGoogleSheetUrl,
  fetchGoogleSheetCsv,
  csvToFile,
  pasteClipboardAsRosterFile,
  saveGoogleSheetUrl,
  getSavedGoogleSheetUrl,
  getCreateGoogleSheetUrl
};
