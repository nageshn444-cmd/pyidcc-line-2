import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ShieldAlert } from 'lucide-react';

export default function ProtectedRoute({ children, allowedRoles }) {
  const { currentUser, userRole } = useAuth();
  const location = useLocation();

  if (!currentUser) {
    // Not logged in, redirect to login page with the return url
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (allowedRoles && !allowedRoles.includes(userRole)) {
    // Logged in but doesn't have the right role
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center p-4">
        <div className="max-w-md w-full bg-slate-900 border border-red-500/30 rounded-xl p-8 shadow-2xl text-center">
          <div className="h-16 w-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <ShieldAlert className="text-red-500" size={32} />
          </div>
          <h2 className="text-xl font-bold text-slate-100 mb-2">Access Denied</h2>
          <p className="text-slate-400 mb-6">
            You don't have the required permissions to view this page. Your current role is <span className="font-semibold text-emerald-400">{userRole || 'Pending'}</span>.
          </p>
          <p className="text-sm text-slate-500 mb-6">
            Please contact the system administrator if you need access.
          </p>
          <button 
            onClick={() => window.history.back()}
            className="text-emerald-500 hover:text-emerald-400 font-medium transition-colors"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  return children;
}
