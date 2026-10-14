import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth, isOwnerUser } from '../context/AuthContext';
import { 
  Train, Globe, ShieldAlert, Lock, User, 
  Eye, EyeOff, KeyRound, CheckCircle2, RefreshCw, LogOut 
} from 'lucide-react';

export default function Login() {
  const [activeTab, setActiveTab] = useState('staff'); // 'staff' | 'google'
  const [employeeId, setEmployeeId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [localPendingMessage, setLocalPendingMessage] = useState('');

  // Forgot password modal
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotInput, setForgotInput] = useState('');
  const [forgotSubmitting, setForgotSubmitting] = useState(false);
  const [forgotSuccess, setForgotSuccess] = useState('');

  const { 
    currentUser, 
    userProfile, 
    loading: authLoading, 
    approvalPending, 
    approvalPendingMessage,
    loginWithIdAndPassword, 
    loginWithGoogle,
    requestPasswordReset,
    logout 
  } = useAuth();

  const navigate = useNavigate();
  const location = useLocation();

  const isOwner = isOwnerUser(currentUser, userProfile);
  const isReady = (Boolean(userProfile) && (
    userProfile.approved === true || 
    userProfile.active === true || 
    userProfile.status === 'ACTIVE' || 
    userProfile.loginEnabled === true
  )) || isOwner;

  useEffect(() => {
    if (!currentUser) return;
    if (authLoading && !isOwner) return;
    if (approvalPending && !isOwner) return;

    if (isReady || isOwner) {
      const dest = location.state?.from?.pathname && location.state.from.pathname !== '/login' 
        ? location.state.from.pathname 
        : '/';
      navigate(dest, { replace: true });
    }
  }, [currentUser?.uid, Boolean(userProfile), userProfile?.approved, userProfile?.active, userProfile?.status, userProfile?.loginEnabled, authLoading, approvalPending, isReady, isOwner, navigate, location.state]);

  const handleStaffLogin = async (e) => {
    e.preventDefault();
    const cleanId = employeeId.trim();
    // Default to Employee ID if password field is left empty
    const cleanPassword = password.trim() || cleanId;
    if (!cleanId) {
      setError('Please enter your Employee ID (5-digit starting with 2 for regular staff or 10-digit starting with 8 for JMD TD).');
      return;
    }

    setError('');
    setLocalPendingMessage('');
    setIsSubmitting(true);
    try {
      const result = await loginWithIdAndPassword(cleanId, cleanPassword);
      if (result?.pendingApproval && !isOwnerUser(result?.user, null)) {
        setLocalPendingMessage(result.message || 'Your account is pending administrator activation.');
      } else {
        const dest = location.state?.from?.pathname && location.state.from.pathname !== '/login' 
          ? location.state.from.pathname 
          : '/';
        navigate(dest, { replace: true });
      }
    } catch (err) {
      setError(err.message || 'Unable to log in. Please check your credentials.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError('');
    setLocalPendingMessage('');
    setIsSubmitting(true);
    try {
      const result = await loginWithGoogle();
      if (result?.redirected) {
        return; // Redirect flow in progress
      }
      if (result?.pendingApproval && !isOwnerUser(result?.user, null)) {
        setLocalPendingMessage(result.message || 'Your Google login request is pending approval.');
      } else if (result?.ok) {
        const dest = location.state?.from?.pathname && location.state.from.pathname !== '/login' 
          ? location.state.from.pathname 
          : '/';
        navigate(dest, { replace: true });
      }
    } catch (err) {
      if (err.code === 'ACCOUNT_DEACTIVATED') {
        setLocalPendingMessage(err.message || 'Your Google account is pending approval.');
      } else {
        setError(err.message || 'Unable to sign in with Google.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    if (!forgotInput.trim()) return;
    setForgotSubmitting(true);
    setError('');
    setForgotSuccess('');
    try {
      await requestPasswordReset(forgotInput.trim());
      setForgotSuccess(`Password recovery email dispatched for ${forgotInput.trim()}. Please check your registered email inbox.`);
    } catch (err) {
      setError(err.message || 'Unable to send password reset email. Please contact Admin.');
    } finally {
      setForgotSubmitting(false);
    }
  };

  const displayPendingMessage = localPendingMessage || approvalPendingMessage;

  return (
    <div className="min-h-screen bg-slate-950 flex justify-center items-center p-4 relative overflow-hidden font-mono selection:bg-amber-500/30 selection:text-amber-200">
      {/* Background ambient lighting effects */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-amber-500/10 rounded-full blur-[140px] pointer-events-none"></div>
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-emerald-500/10 rounded-full blur-[140px] pointer-events-none"></div>
 
      <div className="w-full max-w-md bg-slate-900/60 backdrop-blur-xl border border-slate-800 rounded-2xl shadow-2xl p-6 sm:p-8 relative z-10">
        
        {/* LOGO & HEADER */}
        <div className="flex flex-col items-center mb-6 text-center">
          <div className="h-16 w-16 bg-amber-500/10 border-2 border-amber-500/40 rounded-2xl flex items-center justify-center mb-3 shadow-[0_0_24px_rgba(245,158,11,0.25)]">
            <Train className="h-8 w-8 text-amber-400" />
          </div>
          <h1 className="text-xl font-black text-slate-100 tracking-wider uppercase">BMRCL PYIDCC</h1>
          <p className="text-[10px] text-slate-400 uppercase tracking-widest mt-1">Crew Control & Dispatch Workstation</p>
          <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-slate-800/80 border border-slate-700/60 text-[9px] text-slate-300">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
            Peenya Depot Line 2 Ops
          </div>
        </div>

        {/* ERROR NOTIFICATION */}
        {error && (
          <div className="mb-5 p-3.5 bg-rose-950/30 border border-rose-500/40 rounded-xl flex items-start gap-2.5 text-left animate-in fade-in">
            <ShieldAlert className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
            <div className="text-[11px] text-rose-200 leading-relaxed font-mono">
              <span className="font-bold uppercase tracking-wider block text-rose-300 mb-0.5">Authentication Notice</span>
              {error}
            </div>
          </div>
        )}

        {/* PENDING APPROVAL SCREEN */}
        {((approvalPending || displayPendingMessage) && !isOwner) && (
          <div className="mb-6 p-4 border-2 rounded-xl bg-amber-950/20 border-amber-500/40 space-y-3 animate-in fade-in">
            <div className="flex items-start gap-3">
              <ShieldAlert className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-xs font-black uppercase tracking-wider text-amber-400">Account Pending Activation</h4>
                <p className="text-[11px] text-slate-300 mt-1 uppercase tracking-wider leading-relaxed">
                  {displayPendingMessage || 'Your login request has been recorded. Once Super Admin (20726 - Nagesha N) or Admin SS approves your profile in User Management, your access will activate.'}
                </p>
                {currentUser && (
                  <p className="text-[10px] text-slate-400 mt-2 font-mono">
                    Signed in as: <span className="text-amber-300">{currentUser.email || currentUser.uid}</span>
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2 border-t border-amber-500/20">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="flex-1 py-2 px-3 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 rounded-lg text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-colors"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span>Refresh Status</span>
              </button>
              <button
                type="button"
                onClick={async () => {
                  await logout();
                  setLocalPendingMessage('');
                }}
                className="py-2 px-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 rounded-lg text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-colors"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span>Sign Out</span>
              </button>
            </div>
          </div>
        )}

        {/* AUTH TABS */}
        <div className="flex border border-slate-800 rounded-xl p-1 bg-slate-950/60 mb-5">
          <button
            type="button"
            onClick={() => { setActiveTab('staff'); setError(''); }}
            className={`flex-1 py-2.5 rounded-lg text-[10px] font-bold tracking-wider uppercase transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'staff'
                ? 'bg-amber-500 text-slate-950 shadow-md font-black'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <User className="h-3.5 w-3.5" />
            <span>Staff ID Login</span>
          </button>
          <button
            type="button"
            onClick={() => { setActiveTab('google'); setError(''); }}
            className={`flex-1 py-2.5 rounded-lg text-[10px] font-bold tracking-wider uppercase transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'google'
                ? 'bg-amber-500 text-slate-950 shadow-md font-black'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Globe className="h-3.5 w-3.5" />
            <span>Google SSO</span>
          </button>
        </div>

        {/* SUPER ADMIN QUICK ASSIST */}
        <div className="mb-4 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse"></span>
            <div>
              <div className="text-[10px] font-black text-amber-300 uppercase tracking-wider">Super Admin Terminal</div>
              <div className="text-[9px] text-slate-400">20726 • Station Superintendent</div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setActiveTab('staff');
              setEmployeeId('20726');
              setPassword('207260');
              setError('');
            }}
            className="py-1 px-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-[10px] font-black uppercase tracking-wider transition-all shadow-sm"
          >
            Quick Fill
          </button>
        </div>

        {/* TAB 1: STAFF ID LOGIN (Works on Mobile, LAN, & Any Device) */}
        {activeTab === 'staff' && (
          <form onSubmit={handleStaffLogin} className="space-y-4">
            {/* Guide Banner */}
            <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800 text-[10px] space-y-1">
              <div className="text-amber-400 font-bold flex items-center justify-between">
                <span>Employee ID Login Notice</span>
                <span className="text-[9px] text-slate-400 font-normal">All Ranks</span>
              </div>
              <div className="text-slate-400 text-[9px] leading-relaxed">
                • <strong className="text-slate-300">Regular Staff</strong>: 5-digit ID (starting with 2, e.g. 20xxx)<br/>
                • <strong className="text-slate-300">JMD Train Drivers (TD)</strong>: 10-digit ID (starting with 8, e.g. 8xxxxxxxxx)<br/>
                • <strong className="text-emerald-400">Password</strong>: Use the <strong className="text-emerald-300">same Employee ID</strong> as your password.
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="block text-[10px] font-bold text-slate-300 uppercase tracking-widest">
                  Employee ID
                </label>
                <span className="text-[9px] text-slate-500 font-mono">5-digit (2xxxx) / 10-digit (8xxxxxxxxx)</span>
              </div>
              <div className="relative">
                <User className="absolute left-3.5 top-3.5 h-4 w-4 text-slate-500" />
                <input 
                  type="text"
                  inputMode="text"
                  autoComplete="username"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck="false"
                  required
                  value={employeeId}
                  onChange={(e) => setEmployeeId(e.target.value)}
                  placeholder="e.g. 20726 or 88000087 / 8000000001"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-3 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-amber-500 transition-colors"
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">
                  Password
                </label>
                <div className="flex items-center gap-2">
                  {employeeId.trim() && (
                    <button
                      type="button"
                      onClick={() => setPassword(employeeId.trim())}
                      className="text-[9px] font-bold text-emerald-400 hover:text-emerald-300 underline uppercase tracking-wider"
                      title="Set password to match your Employee ID"
                    >
                      Use Employee ID
                    </button>
                  )}
                  <button 
                    type="button"
                    onClick={() => setShowForgotModal(true)}
                    className="text-[9px] font-bold text-amber-400 hover:text-amber-300 uppercase tracking-wider"
                  >
                    Forgot?
                  </button>
                </div>
              </div>
              <div className="relative">
                <Lock className="absolute left-3.5 top-3.5 h-4 w-4 text-slate-500" />
                <input 
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck="false"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Same as Employee ID by default"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-10 py-3 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-amber-500 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-3.5 text-slate-500 hover:text-slate-300 transition-colors"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="text-[9px] text-slate-500 mt-1">
                Leave blank or enter your Employee ID to sign in with default credentials.
              </p>
            </div>

            <button 
              type="submit"
              disabled={isSubmitting || authLoading}
              className={`w-full py-3.5 rounded-xl font-black text-[11px] tracking-widest uppercase transition-all flex items-center justify-center gap-2 shadow-lg ${
                isSubmitting || authLoading
                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-slate-950 shadow-emerald-950/50'
              }`}
            >
              {isSubmitting || authLoading ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  <span>Authorizing Terminal…</span>
                </>
              ) : (
                <span>Authorize & Login</span>
              )}
            </button>

            <div className="pt-2 text-center">
              <span className="text-[9px] text-slate-500 uppercase tracking-wider block">
                Works on all mobile devices, tablets, and local network terminals.
              </span>
            </div>
          </form>
        )}

        {/* TAB 2: GOOGLE SSO (Seamless Mobile Redirect & Desktop Popup) */}
        {activeTab === 'google' && (
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 text-center">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Official Google SSO</p>
              <p className="mt-2 text-[11px] leading-relaxed text-slate-300">
                Sign in with your official BMRCL Google Workspace account. Seamlessly redirects on mobile devices and tablet browsers.
              </p>
            </div>

            <button 
              type="button"
              onClick={handleGoogleLogin}
              disabled={isSubmitting || authLoading}
              className={`w-full py-3.5 rounded-xl border font-black text-[11px] tracking-widest uppercase flex items-center justify-center gap-2.5 transition-all shadow-md ${
                isSubmitting || authLoading
                  ? 'bg-slate-800 border-slate-700 text-slate-500 cursor-not-allowed'
                  : 'bg-slate-950 border-slate-700 hover:bg-slate-900 text-white hover:border-amber-500/60'
              }`}
            >
              <Globe className="h-4 w-4 text-amber-500" />
              <span>{isSubmitting || authLoading ? 'Connecting to Google…' : 'Sign In With Google'}</span>
            </button>

            <div className="p-3 bg-slate-950/40 border border-slate-800/80 rounded-xl text-[9px] text-slate-400 uppercase tracking-wider text-center leading-relaxed">
              If accessing via local Wi-Fi IP (e.g. 192.168.x.x), please use <span className="text-amber-400 font-bold">Staff ID Login</span> to bypass OAuth domain restrictions.
            </div>
          </div>
        )}

        <p className="text-[9px] text-slate-600 text-center mt-6 uppercase tracking-wider leading-relaxed">
          BMRCL Peenya Depot Line 2 • Workstation Access Monitored & Audit-Logged
        </p>
      </div>

      {/* FORGOT PASSWORD MODAL */}
      {showForgotModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex justify-center items-center p-4 animate-in fade-in">
          <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4 font-mono">
            <div className="flex items-center gap-2.5 text-amber-400">
              <KeyRound className="h-5 w-5" />
              <h3 className="text-xs font-black uppercase tracking-wider">Reset Roster Password</h3>
            </div>
            
            <p className="text-[10px] text-slate-400 uppercase tracking-widest leading-relaxed">
              Enter your registered Employee ID or BMRCL email. A secure recovery link will be sent to your registered inbox.
            </p>

            {forgotSuccess && (
              <div className="p-3 bg-emerald-950/30 border border-emerald-500/40 rounded-xl flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                <span className="text-[10px] text-emerald-300 font-bold uppercase leading-relaxed">{forgotSuccess}</span>
              </div>
            )}

            <form onSubmit={handleForgotPassword} className="space-y-4">
              <input 
                type="text"
                required
                placeholder="Employee ID (e.g. 20726)"
                value={forgotInput}
                onChange={(e) => setForgotInput(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-200 focus:outline-none focus:border-amber-500 transition-colors"
              />

              <div className="flex justify-end gap-2.5 text-[10px] font-black tracking-widest">
                <button 
                  type="button" 
                  onClick={() => { setShowForgotModal(false); setForgotInput(''); setForgotSuccess(''); }}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-4 py-2.5 rounded-lg transition-colors uppercase"
                >
                  Close
                </button>
                <button 
                  type="submit"
                  disabled={forgotSubmitting}
                  className="bg-amber-500 hover:bg-amber-400 text-slate-950 px-4 py-2.5 rounded-lg transition-colors uppercase disabled:opacity-50"
                >
                  {forgotSubmitting ? 'Sending…' : 'Send Link'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}