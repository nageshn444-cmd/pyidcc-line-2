import { lazy } from 'react';

/**
 * Enhanced lazy loader with automatic retry and reload resilience.
 * Handles Vite dev server restarts, HMR token disconnects, and stale cache chunk failures.
 * 
 * @param {() => Promise<{ default: React.ComponentType<any> }>} componentImport
 * @param {number} retries Number of retry attempts before fallback reload
 * @param {number} delayMs Delay between retries
 */
export function lazyWithRetry(componentImport, retries = 2, delayMs = 800) {
  return lazy(() => {
    return new Promise((resolve, reject) => {
      const attempt = (attemptsLeft) => {
        componentImport()
          .then(resolve)
          .catch((error) => {
            const msg = String(error?.message || '');
            const isImportError =
              msg.includes('Failed to fetch dynamically imported module') ||
              msg.includes('Importing a module script failed') ||
              msg.includes('error loading dynamically imported module') ||
              msg.includes('Loading chunk') ||
              error?.name === 'TypeError';

            if (attemptsLeft > 0 && isImportError) {
              setTimeout(() => {
                attempt(attemptsLeft - 1);
              }, delayMs);
            } else if (isImportError && typeof window !== 'undefined') {
              // Attempt a graceful reload once per session path
              const reloadKey = `chunk_reload_${window.location.pathname}`;
              const hasReloaded = window.sessionStorage.getItem(reloadKey);
              if (!hasReloaded) {
                window.sessionStorage.setItem(reloadKey, 'true');
                window.location.reload();
                return;
              }
              window.sessionStorage.removeItem(reloadKey);
              reject(error);
            } else {
              reject(error);
            }
          });
      };
      attempt(retries);
    });
  });
}

export default lazyWithRetry;
