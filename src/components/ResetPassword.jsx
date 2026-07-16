import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { ShieldAlert, Lock, CheckSquare, Eye, EyeOff, KeyRound } from 'lucide-react';

export default function ResetPassword() {
  const { userProfile, updateAuthPassword, logout } = useAuth();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      return setError('Password must be at least 8 characters long.');
    }
    if (newPassword === '12345678' || newPassword === String(userProfile?.employeeId)) {
      return setError('You cannot reuse the default password. Please choose a new secure password.');
    }
    if (newPassword !== confirmPassword) {
      return setError('Passwords do not match.');
    }

    setError('');
    setLoading(true);
    try {
      await updateAuthPassword(newPassword);
      setSuccess(true);
      alert('Password updated successfully! Welcome to the workstation.');
    } catch (err) {
      setError(err.message || 'Failed to update password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex justify-center items-center p-4 relative overflow-hidden font-mono text-slate-200">
      {/* Glow lights */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-amber-500/10 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-emerald-500/10 rounded-full blur-[120px] pointer-events-none"></div>

      <div className="w-full max-w-md bg-slate-900/40 backdrop-blur-md border border-slate-800 rounded-2xl shadow-2xl p-8 relative z-10">
        <div className="flex flex-col items-center mb-6 text-center">
          <div className="h-14 w-14 bg-amber-500/10 border border-amber-500/40 rounded-xl flex items-center justify-center mb-3 shadow-[0_0_15px_rgba(245,158,11,0.15)]">
            <KeyRound className="h-7 w-7 text-amber-400" />
          </div>
          <h2 className="text-lg font-black uppercase tracking-wider text-slate-100">Force Password Reset</h2>
          <p className="text-[10px] text-slate-500 uppercase tracking-widest mt-1">First Login Protocol Active</p>
        </div>

        <div className="mb-6 p-3 bg-amber-500/5 border border-amber-500/20 rounded-lg">
          <span className="text-[10px] text-amber-400 font-bold block uppercase tracking-wider">🔒 Security Policy Required</span>
          <p className="text-[9px] text-slate-400 mt-1 uppercase tracking-widest leading-relaxed">
            Welcome <span className="text-slate-200 font-bold">{userProfile?.employeeName || 'Officer'}</span> (ID: {userProfile?.employeeId}). Your account has been provisioned with a default password. You must change it to continue.
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-rose-950/20 border border-rose-500/30 rounded-lg flex items-start gap-2.5">
            <ShieldAlert className="h-4 w-4 text-rose-500 shrink-0 mt-0.5" />
            <span className="text-[10px] text-rose-300 font-bold leading-normal uppercase">{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5" htmlFor="resetpassword-l1">New Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
              <input id="resetpassword-i1" name="resetpassword-i1"
                type={showPassword ? 'text' : 'password'}
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter new password (min. 8 chars)"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-10 pr-10 py-3 text-xs text-slate-200 focus:outline-none focus:border-amber-500 transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-3 text-slate-550 hover:text-slate-300"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5" htmlFor="resetpassword-l2">Confirm New Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
              <input id="resetpassword-i2" name="resetpassword-i2"
                type={showPassword ? 'text' : 'password'}
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter new password"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-10 pr-4 py-3 text-xs text-slate-200 focus:outline-none focus:border-amber-500 transition-colors"
              />
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={logout}
              className="flex-1 bg-slate-850 hover:bg-slate-800 text-slate-300 font-bold py-3 rounded-lg text-[10px] tracking-widest uppercase transition-colors"
            >
              Sign Out
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-amber-500 hover:bg-amber-450 disabled:opacity-50 text-slate-950 font-black py-3 rounded-lg text-[10px] tracking-widest uppercase transition-colors shadow-md"
            >
              {loading ? 'Updating...' : 'Update Password'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
