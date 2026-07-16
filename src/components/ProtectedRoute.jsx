import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ShieldAlert } from 'lucide-react';
import ResetPassword from './ResetPassword';

export default function ProtectedRoute({ children, allowedRoles }) {
  const { currentUser, userProfile, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-slate-300 text-sm uppercase tracking-wider">Preparing your workspace…</div>
      </div>
    );
  }

  // 1. Check if logged in
  if (!currentUser) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // 2. OWNER OVERRIDE: If it's you, bypass all checks
  const isOwner = currentUser?.email === 'nageshn444@gmail.com' || userProfile?.employeeId === '20726';
  const isApprovedUser = Boolean(
    currentUser && (
      userProfile?.approved === true ||
      userProfile?.loginEnabled === true ||
      userProfile?.active === true ||
      userProfile?.status === 'ACTIVE'
    )
  );
  
  // 3. Check for First Login Forced Reset
  const isFirstLogin = userProfile?.firstLogin === true || userProfile?.passwordResetRequired === true;
  if (isFirstLogin && !isOwner) {
    return <ResetPassword />;
  }

  if (isOwner || isApprovedUser) return children;

  // 3. Normal Role Check for everyone else
  const userRole = userProfile?.role;
  if (allowedRoles && !allowedRoles.includes(userRole)) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center p-4">
        <div className="max-w-md w-full bg-slate-900 border border-red-500/30 rounded-xl p-8 shadow-2xl text-center">
          <div className="h-16 w-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <ShieldAlert className="text-red-500" size={32} />
          </div>
          <h2 className="text-xl font-bold text-slate-100 mb-2">Access Denied</h2>
          <p className="text-slate-400 mb-6">
            You don't have the required permissions. Your role is <span className="font-semibold text-emerald-400">{userRole || 'Pending'}</span>.
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