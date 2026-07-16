import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

import { Train, Globe, ShieldAlert } from 'lucide-react';

export default function Login() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [pendingMessage, setPendingMessage] = useState('');

  const { currentUser, userProfile, loading: authLoading, approvalPending, loginWithGoogle } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isRedirecting, setIsRedirecting] = useState(false);

  useEffect(() => {
    if (!currentUser || authLoading || approvalPending) return;

    const isReady = Boolean(userProfile) && (userProfile.approved === true || userProfile.active === true || userProfile.status === 'ACTIVE' || userProfile.loginEnabled === true);
    if (currentUser && isReady) {
      const from = location.state?.from?.pathname || '/';
      navigate(from, { replace: true });
    }
  }, [currentUser, userProfile, authLoading, approvalPending, location.state, navigate]);

  const handleGoogleLogin = async () => {
    setIsRedirecting(true);
    setError('');
    setPendingMessage('');
    setIsSubmitting(true);
    try {
      const result = await loginWithGoogle();
      if (result?.pendingApproval) {
        setPendingMessage(result.message || 'Your Google login request is pending approval. Once approved, you will be redirected automatically.');
      }
    } catch (err) {
      if (err.code === 'ACCOUNT_DEACTIVATED') {
        setPendingMessage(err.message || 'Your Google login request is pending approval.');
      } else {
        setError('Google Sign-In Error: ' + (err.message || 'Unable to sign in.'));
      }
    } finally {
      setIsRedirecting(false);
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-955 flex justify-center items-center p-4 relative overflow-hidden font-mono">
      {/* Background ambient lighting effects */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-amber-500/10 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-emerald-500/10 rounded-full blur-[120px] pointer-events-none"></div>
 
      <div className="w-full max-w-md bg-slate-900/40 backdrop-blur-md border border-slate-800 rounded-2xl shadow-2xl p-8 relative z-10">
        
        {/* LOGO */}
        <div className="flex flex-col items-center mb-8">
          <div className="h-16 w-16 bg-amber-500/10 border-2 border-amber-500/40 rounded-xl flex items-center justify-center mb-3 shadow-[0_0_20px_rgba(245,158,11,0.2)]">
            <Train className="h-8 w-8 text-amber-400" />
          </div>
          <h1 className="text-xl font-black text-slate-100 tracking-wider">BMRCL PYIDCC</h1>
          <p className="text-[10px] text-slate-500 uppercase tracking-widest mt-1">Crew Control & Dispatch Workstation</p>
        </div>

        {error && (
          <div className="mb-6 p-3 bg-red-950/20 border border-red-500/30 rounded-lg flex items-start gap-2.5">
            <ShieldAlert className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
            <span className="text-[10px] text-red-300 font-bold leading-normal uppercase">{error}</span>
          </div>
        )}

        {pendingMessage && (
          <div className="mb-6 p-4 border-2 rounded-xl bg-sky-950/25 border-sky-500/50 space-y-2">
            <div className="flex items-start gap-2.5">
              <ShieldAlert className="h-5 w-5 text-sky-400 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-xs font-black uppercase tracking-wider text-sky-400">Pending Approval</h4>
                <p className="text-[10px] text-slate-300 mt-1 uppercase tracking-wider leading-relaxed">{pendingMessage}</p>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-4">
          <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4 text-center">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Google-only access</p>
            <p className="mt-2 text-[11px] leading-relaxed text-slate-300">
              Every user must sign in with their official Google account. If this is your first login, your request will appear in User Management for Super Admin or Admin SS approval.
            </p>
          </div>

          <button 
            onClick={handleGoogleLogin}
            disabled={isRedirecting || isSubmitting || authLoading}
            className={`w-full border font-bold py-3 rounded-lg text-[10px] tracking-widest uppercase flex items-center justify-center gap-2.5 transition-colors ${
              isRedirecting || isSubmitting || authLoading
                ? 'bg-slate-800 border-slate-700 text-slate-500 cursor-not-allowed'
                : 'bg-slate-955 border-slate-805 hover:bg-slate-900 text-white'
            }`}
          >
            <Globe className="h-4 w-4 text-amber-500" />
            <span>{isRedirecting || isSubmitting || authLoading ? 'Signing in with Google...' : 'Sign in with Google'}</span>
          </button>
        </div>

        <p className="text-[9px] text-slate-605 text-center mt-6 uppercase tracking-wider leading-relaxed">Secure terminal access. Operations are monitored & audit-logged.</p>
      </div>
    </div>
  );
}