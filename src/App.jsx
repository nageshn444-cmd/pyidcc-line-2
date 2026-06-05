import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Dashboard from './components/Dashboard';
import Login from './components/Login';
import ProtectedRoute from './components/ProtectedRoute';
import { LogOut } from 'lucide-react';
import './index.css';

function TopNav() {
  const { currentUser, userRole, logout } = useAuth();

  return (
    <div className="bg-slate-900 border-b border-slate-800 p-4 sticky top-0 z-50 shadow-md">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="h-8 w-8 bg-emerald-500 rounded flex items-center justify-center font-bold text-white shadow-[0_0_15px_rgba(16,185,129,0.5)]">
            OP
          </div>
          <h1 className="text-xl font-bold text-slate-100 tracking-tight">
            Master System Control
          </h1>
        </div>
        
        {currentUser && (
          <div className="flex items-center space-x-4">
            <div className="text-right hidden sm:block">
              <div className="text-sm font-medium text-slate-200">{currentUser.displayName}</div>
              <div className="text-xs text-emerald-400 font-semibold">{userRole}</div>
            </div>
            <button 
              onClick={() => logout()}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
              title="Logout"
            >
              <LogOut size={20} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function MainApp() {
  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      <Routes>
        <Route path="/login" element={<Login />} />
        
        <Route 
          path="/*" 
          element={
            <ProtectedRoute allowedRoles={['ADMIN', 'CREW_CONTROLLER', 'TRAIN_OPERATOR', 'VIEWER']}>
              <div className="flex flex-col min-h-screen">
                <TopNav />
                <div className="flex-1 relative">
                  <Routes>
                    <Route path="/" element={<Dashboard />} />
                    {/* Add more protected routes here later */}
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
        <MainApp />
      </AuthProvider>
    </Router>
  );
}
