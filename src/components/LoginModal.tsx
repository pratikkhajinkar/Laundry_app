import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import type { UserRole } from '../types/index.ts';
import { ShieldCheck, Store, Truck, Shirt, AlertCircle, ArrowRight } from 'lucide-react';

export const LoginModal: React.FC = () => {
  const { login, language, setLanguage, t } = useAuth();
  const [selectedRole, setSelectedRole] = useState<UserRole>('admin');
  const [emailOrPhone, setEmailOrPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!emailOrPhone.trim() || !password) {
      setError('Please provide your login credentials.');
      return;
    }

    try {
      setLoading(true);
      await login(emailOrPhone.trim(), password, selectedRole);
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F0F9FF] flex flex-col justify-center py-10 px-4 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
          <div className="w-16 h-16 rounded-3xl bg-gradient-to-tr from-sky-600 to-sky-400 flex items-center justify-center text-white shadow-lg shadow-sky-500/25">
            <Shirt className="w-9 h-9" />
          </div>
        </div>
        <h2 className="mt-4 text-center text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
          Friends Laundry & Dry Cleaners
        </h2>
        <p className="mt-1 text-center text-xs sm:text-sm font-semibold text-sky-800">
          Laundry Pickup, Delivery & Due Payment System
        </p>

        {/* Role Selector Tabs (Admin & Delivery Boy) */}
        <div className="mt-6 grid grid-cols-2 gap-2 p-1.5 bg-sky-100/70 rounded-2xl border border-sky-200">
          <button
            type="button"
            onClick={() => { setSelectedRole('admin'); setError(null); }}
            className={`flex flex-col items-center justify-center py-2.5 px-2 rounded-xl text-xs font-bold transition-all ${
              selectedRole === 'admin'
                ? 'bg-white text-sky-950 shadow-sm'
                : 'text-sky-800 hover:text-sky-950'
            }`}
          >
            <ShieldCheck className="w-4 h-4 mb-1 text-sky-600" />
            <span>Super Admin</span>
          </button>

          <button
            type="button"
            onClick={() => { setSelectedRole('delivery'); setError(null); }}
            className={`flex flex-col items-center justify-center py-2.5 px-2 rounded-xl text-xs font-bold transition-all ${
              selectedRole === 'delivery'
                ? 'bg-white text-sky-950 shadow-sm'
                : 'text-sky-800 hover:text-sky-950'
            }`}
          >
            <Truck className="w-4 h-4 mb-1 text-sky-600" />
            <span>Delivery Boy</span>
          </button>
        </div>
      </div>

      <div className="mt-5 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-6 shadow-xl rounded-2xl sm:px-10 border border-slate-200">
          <div className="mb-5 pb-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-900">
                {selectedRole === 'admin' && 'Super Admin Portal'}
                {selectedRole === 'delivery' && 'Delivery Boy Portal'}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {selectedRole === 'admin' && 'Manage all 4 shops, orders, fleet & full system edits.'}
                {selectedRole === 'delivery' && 'View assigned pickups, upload photos, send bill & collect cash.'}
              </p>
            </div>
            <span className="text-xs px-2 py-1 rounded bg-slate-100 text-slate-700 font-bold border border-slate-200">
              English
            </span>
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                {selectedRole === 'delivery' ? 'Mobile Number' : 'Email or Mobile Number'}
              </label>
              <input
                type="text"
                required
                value={emailOrPhone}
                onChange={(e) => setEmailOrPhone(e.target.value)}
                placeholder={selectedRole === 'delivery' ? 'e.g. 9822012345' : 'e.g. admin@laundry.com or 9822012345'}
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-emerald-600 focus:border-transparent text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Password
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-emerald-600 focus:border-transparent text-sm"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className={`w-full mt-2 flex items-center justify-center gap-2 py-3 px-4 border border-transparent rounded-2xl shadow-sm text-sm font-extrabold text-white transition-all disabled:opacity-50 active:scale-98 ${
                selectedRole === 'admin' 
                  ? 'bg-gradient-to-r from-sky-500 to-sky-600 hover:from-sky-600 hover:to-sky-700 shadow-sky-500/25' 
                  : selectedRole === 'shop'
                  ? 'bg-[#0369A1] hover:bg-[#025684]'
                  : 'bg-gradient-to-r from-sky-600 to-[#0369A1] hover:from-sky-700 hover:to-[#025684]'
              }`}
            >
              <span>{loading ? 'Authenticating...' : `Log In as ${selectedRole === 'admin' ? 'Super Admin' : selectedRole === 'shop' ? 'Shop Staff' : 'Delivery Boy'}`}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
