import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css' // This line injects the Tailwind engine globally

// Intercept and suppress inevitable Firestore snapshot permission-denied warnings during logout
const originalConsoleError = console.error;
console.error = (...args) => {
  const msg = args.join(' ');
  if (msg.includes('permission-denied') || msg.includes('Missing or insufficient permissions')) {
    return; // Suppress spurious Firebase logout warning
  }
  originalConsoleError.apply(console, args);
};


ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
