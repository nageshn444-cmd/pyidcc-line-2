import React from 'react';
import { ShieldAlert, RefreshCw, AlertOctagon, Terminal } from 'lucide-react';

export class OperationalErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[BMRCL PYIDCC Engine Error Caught]:', error, errorInfo);
    this.setState({ errorInfo });
  }

  handlePurgeAndReload = async () => {
    try {
      if (typeof window !== 'undefined' && window.indexedDB) {
        if (typeof window.indexedDB.databases === 'function') {
          const dbs = await window.indexedDB.databases();
          for (const d of dbs) {
            if (d.name && (d.name.includes('firestore') || d.name.includes('pyidline2crew'))) {
              try {
                window.indexedDB.deleteDatabase(d.name);
              } catch (_) {}
            }
          }
        }
        try {
          window.indexedDB.deleteDatabase('firestore/[DEFAULT]/pyidline2crew-41022/main');
        } catch (_) {}
      }
      sessionStorage.clear();
    } catch (e) {
      console.warn('[OperationalErrorBoundary] Cache wipe error:', e);
    }
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  handleReset = async () => {
    const errorStr = String(this.state.error?.message || '') + ' ' + String(this.state.error?.stack || '');
    const isFirestoreAssertionError =
      errorStr.includes('INTERNAL ASSERTION FAILED') ||
      errorStr.includes('b7de') ||
      errorStr.includes('b815') ||
      errorStr.includes('batchId');

    const isDynamicImportError = 
      errorStr.includes('Failed to fetch dynamically imported module') ||
      errorStr.includes('dynamically imported module') ||
      errorStr.includes('Loading chunk');

    if (isFirestoreAssertionError) {
      await this.handlePurgeAndReload();
      return;
    }

    this.setState({ hasError: false, error: null, errorInfo: null });
    if (isDynamicImportError && typeof window !== 'undefined') {
      window.location.reload();
      return;
    }
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  render() {
    if (this.state.hasError) {
      const errorStr = String(this.state.error?.message || '') + ' ' + String(this.state.error?.stack || '');
      const isFirestoreAssertionError =
        errorStr.includes('INTERNAL ASSERTION FAILED') ||
        errorStr.includes('b7de') ||
        errorStr.includes('b815') ||
        errorStr.includes('batchId');

      const isDynamicImportError = 
        errorStr.includes('Failed to fetch dynamically imported module') ||
        errorStr.includes('dynamically imported module') ||
        errorStr.includes('Loading chunk');

      return (
        <div className="min-h-100 flex items-center justify-center p-6 bg-slate-950 text-slate-100 font-sans">
          <div className="max-w-2xl w-full bg-slate-900 border-2 border-rose-500/40 rounded-3xl p-8 shadow-2xl space-y-6">
            <div className="flex items-center gap-4 border-b border-slate-800 pb-5">
              <div className="p-3 bg-rose-500/20 text-rose-400 rounded-2xl border border-rose-500/40">
                <ShieldAlert className="w-8 h-8" />
              </div>
              <div>
                <span className="text-[10px] font-mono font-bold tracking-widest text-rose-400 uppercase block">
                  BMRCL PYIDCC • Fault Isolation Subsystem
                </span>
                <h2 className="text-xl font-black text-white">
                  {isFirestoreAssertionError
                    ? 'Firestore Local Cache Desync Detected'
                    : isDynamicImportError
                    ? 'Module Connection Re-sync Required'
                    : 'Operational View Suspended'}
                </h2>
              </div>
            </div>

            <p className="text-sm text-slate-300">
              {isFirestoreAssertionError
                ? 'An interrupted mutation batch in the browser local IndexedDB cache caused a Firestore internal assertion failure (batchId). Purging the corrupted local cache will safely reconnect you with the live operational database without any data loss.'
                : isDynamicImportError
                ? 'A temporary dev server restart or network interruption prevented dynamic chunk loading. Click below to reconnect and resume.'
                : 'An unexpected runtime error was caught in this console component. The rest of the crew control system remains protected.'}
            </p>

            {this.state.error && (
              <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2">
                <div className="flex items-center gap-2 text-xs font-mono font-bold text-rose-400">
                  <AlertOctagon className="w-4 h-4" />
                  <span>{this.state.error.name}: {this.state.error.message}</span>
                </div>
                {this.state.error.stack && (
                  <pre className="text-[10px] text-slate-500 font-mono max-h-32 overflow-y-auto whitespace-pre-wrap">
                    {this.state.error.stack.split('\n').slice(0, 5).join('\n')}
                  </pre>
                )}
              </div>
            )}

            <div className="flex items-center justify-between pt-2">
              <button
                onClick={() => navigator.clipboard?.writeText(String(this.state.error?.stack || this.state.error?.message))}
                className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-xl border border-slate-700 transition-all"
              >
                <Terminal className="w-3.5 h-3.5" />
                Copy Diagnostic Trace
              </button>

              <div className="flex items-center gap-3">
                {isFirestoreAssertionError ? (
                  <button
                    onClick={this.handlePurgeAndReload}
                    className="flex items-center gap-2 px-6 py-2.5 bg-linear-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-lg shadow-rose-950/40"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Purge Local Cache & Reconnect
                  </button>
                ) : (
                  <button
                    onClick={this.handleReset}
                    className="flex items-center gap-2 px-6 py-2.5 bg-linear-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-slate-950 font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-lg shadow-emerald-950/40"
                  >
                    <RefreshCw className="w-4 h-4" />
                    {isDynamicImportError ? 'Reload & Reconnect View' : 'Recover & Reconnect View'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default OperationalErrorBoundary;
