import React, { Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { OperationalEngineProvider } from './context/OperationalEngine';
import ProtectedRoute from './components/ProtectedRoute';
import './index.css';
import { lazyWithRetry } from './utils/lazyWithRetry';

import OperationalErrorBoundary from './components/common/OperationalErrorBoundary';
import OperatorRequestNotificationCenter from './components/common/OperatorRequestNotificationCenter';

const Dashboard = lazyWithRetry(() => import('./components/Dashboard'));
const Login = lazyWithRetry(() => import('./components/Login'));

const RouteLoader = () => (
  <div className="min-h-screen bg-slate-950 flex items-center justify-center">
    <div className="flex flex-col items-center gap-3">
      <div className="animate-spin rounded-full h-10 w-10 border-4 border-amber-500 border-t-transparent" />
      <span className="text-slate-400 text-xs uppercase tracking-widest font-mono">Initializing PYIDCC Console…</span>
    </div>
  </div>
);

function MainApp() {
  return (
    <div className="min-h-screen bg-transparent flex flex-col">
      <OperatorRequestNotificationCenter />
      <OperationalErrorBoundary>
        <Suspense fallback={<RouteLoader />}>
          <Routes>
            <Route path="/login" element={<Login />} />
            
            {/* Protected Routes - All roles allowed access to base layout */}
            <Route 
              path="/*" 
              element={
                <ProtectedRoute allowedRoles={['SUPER_ADMIN', 'ADMIN', 'ADMIN_SS', 'ADMIN_Station_Superintendent', 'CREW_CONTROLLER', 'STATION_CONTROLLER', 'TRAIN_OPERATOR', 'VIEWER']}>
                  <div className="flex flex-col min-h-screen">
                    <div className="flex-1 relative">
                      <Routes>
                        <Route path="/" element={<Dashboard />} />
                        <Route path="*" element={<Navigate to="/" replace />} />
                      </Routes>
                    </div>
                  </div>
                </ProtectedRoute>
              } 
            />
          </Routes>
        </Suspense>
      </OperationalErrorBoundary>
    </div>
  );
}

export default function App() {
  return (
    <Router>
      <AuthProvider>
        <OperationalEngineProvider>
          <ThemeProvider>
            <MainApp />
          </ThemeProvider>
        </OperationalEngineProvider>
      </AuthProvider>
    </Router>
  );
}