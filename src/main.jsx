import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css' // This line injects the Tailwind engine globally

// Intercept and suppress non-fatal Firestore / Firebase Auth cross-origin polling noise
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

console.error = (...args) => {
  const msg = args.map(a => String(a?.message || a || '')).join(' ');
  if (
    msg.includes('permission-denied') || 
    msg.includes('Missing or insufficient permissions') ||
    msg.includes('Cross-Origin-Opener-Policy') ||
    msg.includes('window.closed')
  ) {
    return; // Suppress spurious Firebase SDK cross-origin polling messages
  }
  originalConsoleError.apply(console, args);
};

console.warn = (...args) => {
  const msg = args.map(a => String(a?.message || a || '')).join(' ');
  if (
    msg.includes('Cross-Origin-Opener-Policy') ||
    msg.includes('window.closed')
  ) {
    return;
  }
  originalConsoleWarn.apply(console, args);
};


ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
