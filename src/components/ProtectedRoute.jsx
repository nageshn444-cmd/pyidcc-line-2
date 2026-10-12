import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth, isOwnerUser } from '../context/AuthContext';
import { ShieldAlert } from 'lucide-react';
import ResetPassword from './ResetPassword';

export default function ProtectedRoute({ children, allowedRoles }) {
  const { currentUser, userProfile, loading } = useAuth();
  const location = useLocation();

  // 1. OWNER OVERRIDE: Check owner FIRST before loading check to prevent redirect loops on mobile!
  const isOwner = isOwnerUser(currentUser, userProfile);
  if (isOwner) {
    return children;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-amber-500 border-t-transparent" />
          <div className="text-slate-300 text-xs font-mono uppercase tracking-wider">Preparing your workspace…</div>
        </div>
      </div>
    );
  }

  // 2. Check if logged in
  if (!currentUser) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

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

  if (isApprovedUser) return children;

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