import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { OperationalEngineProvider } from './context/OperationalEngine';
import Dashboard from './components/Dashboard';
import Login from './components/Login';
import ProtectedRoute from './components/ProtectedRoute';
import './index.css';

function MainApp() {
  return (
    <div className="min-h-screen bg-transparent flex flex-col">
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