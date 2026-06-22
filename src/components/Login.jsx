import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Train, User, Lock, Globe, ShieldAlert, CheckSquare, Square, KeyRound } from 'lucide-react';

export default function Login() {
  const [isRegister, setIsRegister] = useState(false);
  const [employeeId, setEmployeeId] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotEmpId, setForgotEmpId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const { loginWithIdAndPassword, registerWithIdAndPassword, loginWithGoogle, requestPasswordReset } = useAuth();
  const navigate = useNavigate();

  // Load remembered Employee ID on mount
  useEffect(() => {
    const savedId = localStorage.getItem('rememberedEmployeeId');
    if (savedId) {
      setEmployeeId(savedId);
      setRememberMe(true);
    }
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!employeeId || !password) {
      return setError('Please enter both Employee ID and Password.');
    }
    setError('');
    setLoading(true);

    try {
      await loginWithIdAndPassword(employeeId, password);
      if (rememberMe) {
        localStorage.setItem('rememberedEmployeeId', employeeId);
      } else {
        localStorage.removeItem('rememberedEmployeeId');
      }
      navigate('/');
    } catch (err) {
      setError(err.message || 'Failed to sign in. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    if (!employeeId || !password || !confirmPassword) {
      return setError('Please fill in all registration fields.');
    }
    if (password.length < 8) {
      return setError('Password must be at least 8 characters long.');
    }
    if (password !== confirmPassword) {
      return setError('Passwords do not match.');
    }
    setError('');
    setLoading(true);

    try {
      await registerWithIdAndPassword(employeeId, password);
      alert('Registration successful! Logging in...');
      navigate('/');
    } catch (err) {
      setError(err.message || 'Failed to register account.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError('');
    setLoading(true);
    try {
      await loginWithGoogle();
      navigate('/');
    } catch (err) {
      setError(err.message || 'Google sign-in failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    if (!forgotEmpId) {
      return alert('Please enter your Employee ID.');
    }
    try {
      await requestPasswordReset(forgotEmpId);
      alert(`If the account exists, a password reset email has been dispatched for Employee ID: ${forgotEmpId}`);
      setShowForgotModal(false);
      setForgotEmpId('');
    } catch (err) {
      alert('Error sending reset request: ' + err.message);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex justify-center items-center p-4 relative overflow-hidden font-mono">
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

        {/* Tab Selection */}
        <div className="flex bg-slate-950 p-1 border border-slate-800 rounded-lg mb-6">
          <button 
            type="button"
            onClick={() => { setIsRegister(false); setError(''); }}
            className={`flex-1 py-2 text-xs font-bold rounded transition-colors ${!isRegister ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-slate-200'}`}
          >
            SIGN IN
          </button>
          <button 
            type="button"
            onClick={() => { setIsRegister(true); setError(''); }}
            className={`flex-1 py-2 text-xs font-bold rounded transition-colors ${isRegister ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-slate-200'}`}
          >
            REGISTER
          </button>
        </div>

        {error && (
          <div className="mb-6 p-3 bg-red-950/20 border border-red-500/30 rounded-lg flex items-start gap-2.5">
            <ShieldAlert className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
            <span className="text-[10px] text-red-300 font-bold leading-normal uppercase">{error}</span>
          </div>
        )}

        <form onSubmit={isRegister ? handleRegister : handleLogin} className="space-y-4">
          
          {/* Employee ID */}
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Employee ID</label>
            <div className="relative">
              <User className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
              <input 
                type="number"
                required
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
                placeholder="Enter 5-digit ID (e.g. 20726)"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-10 pr-4 py-3 text-xs text-slate-200 focus:outline-none focus:border-amber-500 transition-colors"
              />
            </div>
          </div>

          {/* Password */}
          <div>
            <div className="flex justify-between items-center mb-1.5">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Password</label>
              {!isRegister && (
                <button 
                  type="button"
                  onClick={() => setShowForgotModal(true)}
                  className="text-[9px] font-bold text-amber-500 hover:text-amber-400 uppercase tracking-wider"
                >
                  Forgot Password?
                </button>
              )}
            </div>
            <div className="relative">
              <Lock className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
              <input 
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={isRegister ? "Minimum 8 characters" : "Enter Password"}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-10 pr-4 py-3 text-xs text-slate-200 focus:outline-none focus:border-amber-500 transition-colors"
              />
            </div>
          </div>

          {/* Confirm Password (Register only) */}
          {isRegister && (
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Confirm Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
                <input 
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter Password"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-10 pr-4 py-3 text-xs text-slate-200 focus:outline-none focus:border-amber-500 transition-colors"
                />
              </div>
            </div>
          )}

          {/* Remember Me Checkbox */}
          {!isRegister && (
            <button 
              type="button" 
              onClick={() => setRememberMe(!rememberMe)}
              className="flex items-center gap-2 text-slate-400 hover:text-slate-300 transition-colors text-left"
            >
              {rememberMe ? (
                <CheckSquare className="h-4 w-4 text-amber-500 shrink-0" />
              ) : (
                <Square className="h-4 w-4 text-slate-600 shrink-0" />
              )}
              <span className="text-[10px] font-bold uppercase tracking-wider">Remember Me</span>
            </button>
          )}

          {/* Submit Button */}
          <button 
            type="submit"
            disabled={loading}
            className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-slate-950 font-black py-3 rounded-lg text-[10px] tracking-widest uppercase shadow-md transition-colors"
          >
            {loading ? 'Processing...' : (isRegister ? 'REGISTER & ACCOUNT CREATION' : 'AUTHORIZE LOGIN')}
          </button>
        </form>

        {/* Divider */}
        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-800"></div></div>
          <div className="relative flex justify-center text-[9px] uppercase font-bold tracking-widest"><span className="bg-slate-900/40 px-2 text-slate-500">OR</span></div>
        </div>

        {/* Google Sign-in */}
        <button 
          onClick={handleGoogleSignIn}
          disabled={loading}
          className="w-full bg-slate-950 border border-slate-800 hover:bg-slate-900 text-white font-bold py-3 rounded-lg text-[10px] tracking-widest uppercase flex items-center justify-center gap-2.5 transition-colors"
        >
          <Globe className="h-4 w-4 text-amber-500" />
          <span>Sign in with Google</span>
        </button>

        <p className="text-[9px] text-slate-600 text-center mt-6 uppercase tracking-wider leading-relaxed">Secure terminal access. Operations are monitored & audit-logged.</p>
      </div>

      {/* Forgot Password Modal */}
      {showForgotModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex justify-center items-center p-4">
          <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-2 text-amber-500">
              <KeyRound size={20} />
              <h3 className="text-sm font-black uppercase tracking-wider">Reset Roster Password</h3>
            </div>
            <p className="text-[10px] text-slate-400 uppercase tracking-widest leading-relaxed">Enter your registered Employee ID. If authenticated, a standard Firebase recovery link will be sent to your registry email.</p>
            
            <form onSubmit={handleForgotPassword} className="space-y-4">
              <input 
                type="number"
                required
                placeholder="Employee ID"
                value={forgotEmpId}
                onChange={(e) => setForgotEmpId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
              />
              <div className="flex justify-end gap-2.5 text-[9px] font-black tracking-widest">
                <button 
                  type="button" 
                  onClick={() => { setShowForgotModal(false); setForgotEmpId(''); }}
                  className="bg-slate-800 hover:bg-slate-700 text-white px-4 py-2.5 rounded transition-colors uppercase"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="bg-amber-600 hover:bg-amber-500 text-slate-950 px-4 py-2.5 rounded transition-colors uppercase"
                >
                  Send Recovery Link
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}