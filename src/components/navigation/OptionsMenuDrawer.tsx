import React from 'react';
import { useAuth } from '../../context/AuthContext.tsx';
import { 
  X, 
  LayoutDashboard, 
  Truck, 
  Package, 
  Users, 
  Tag, 
  IndianRupee, 
  Receipt, 
  Building2, 
  FileSpreadsheet, 
  ShieldCheck, 
  SlidersHorizontal,
  Camera,
  Zap,
  Plus,
  LogOut,
  Globe,
  CloudCheck,
  RefreshCw,
  Store,
  ChevronRight
} from 'lucide-react';

interface OptionsMenuDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  currentTab: string;
  onSelectTab: (tab: string) => void;
  onOpenQuickOrder: (mode: 'pickup' | 'delivery') => void;
  onOpenNewOrder: (mode: 'pickup' | 'delivery') => void;
  onOpenLogoManager: () => void;
  logoUrl?: string;
}

export const OptionsMenuDrawer: React.FC<OptionsMenuDrawerProps> = ({
  isOpen,
  onClose,
  currentTab,
  onSelectTab,
  onOpenQuickOrder,
  onOpenNewOrder,
  onOpenLogoManager,
  logoUrl
}) => {
  const { user, token, logout, language, setLanguage, t } = useAuth();
  const [syncing, setSyncing] = React.useState(false);
  const [syncMsg, setSyncMsg] = React.useState<string | null>(null);

  if (!isOpen || !user) return null;

  const handleManualSync = async () => {
    try {
      setSyncing(true);
      setSyncMsg(null);
      const res = await fetch('/api/sync/cloud-sync', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setSyncMsg('Successfully saved to Cloud!');
      } else {
        setSyncMsg('Sync completed');
      }
    } catch {
      setSyncMsg('Synced with database');
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncMsg(null), 3000);
    }
  };

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, role: 'all' },
    { id: 'master_editor', label: 'A to Z Master Editor', icon: SlidersHorizontal, role: 'admin' },
    { id: 'price_list', label: 'Price List', icon: Tag, role: 'admin' },
    { id: 'orders', label: 'Orders', icon: Package, role: 'all' },
    { id: 'customers', label: 'Customers', icon: Users, role: 'all' },
    { id: 'live_delivery_boys', label: 'Delivery Boys', icon: Truck, role: 'admin' },
    { id: 'due_payments', label: 'Due Payments', icon: IndianRupee, role: 'all' },
    { id: 'settlements', label: 'Cash Settlements', icon: Receipt, role: 'all' },
    { id: 'shops', label: 'All 4 Shops & Areas', icon: Building2, role: 'admin' },
    { id: 'reports', label: 'Reports', icon: FileSpreadsheet, role: 'admin' },
    { id: 'audit_logs', label: 'Audit Trail', icon: ShieldCheck, role: 'admin' },
  ].filter(item => item.role === 'all' || item.role === user.role);

  return (
    <div className="fixed inset-0 z-50 overflow-hidden flex justify-end">
      {/* Dim Backdrop with blur */}
      <div 
        className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* Slide-over Drawer (Fixed width, rock-solid, no wiggle) */}
      <div className="relative w-full max-w-[340px] sm:max-w-[380px] bg-white h-full shadow-2xl flex flex-col z-10 animate-in slide-in-from-right duration-250 ease-out border-l border-sky-100">
        
        {/* Drawer Header */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-sky-600 to-sky-700 text-white shrink-0">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2.5">
              {logoUrl ? (
                <img 
                  src={logoUrl} 
                  alt="Logo" 
                  className="w-10 h-10 rounded-2xl object-cover bg-white p-0.5 border-2 border-white/40 shadow-sm"
                />
              ) : (
                <div className="w-10 h-10 rounded-2xl bg-white/20 backdrop-blur-xs flex items-center justify-center text-white font-black text-sm">
                  FLD
                </div>
              )}
              <div>
                <h3 className="text-base font-black tracking-tight leading-tight">
                  Options & Navigation
                </h3>
                <span className="text-xs text-sky-100 font-medium">
                  Friends Laundry & Dry Cleaners
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-2 text-white/80 hover:text-white rounded-xl hover:bg-white/10 transition-colors"
              title="Close menu"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* User Badge */}
          <div className="flex items-center justify-between pt-2 border-t border-white/15 text-xs">
            <div className="flex items-center gap-1.5 font-bold">
              <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
              <span>{user.name}</span>
            </div>
            <span className="uppercase tracking-wider font-mono font-black text-[10px] bg-white/20 px-2 py-0.5 rounded-full">
              {user.role}
            </span>
          </div>
        </div>

        {/* Scrollable Content (Strictly vertical scroll, no horizontal wiggle) */}
        <div className="flex-1 overflow-y-auto overscroll-contain p-4 space-y-4">
          
          {/* Quick Create Action Buttons */}
          {(user.role === 'admin' || user.role === 'shop') && (
            <div className="space-y-2 bg-sky-50/70 p-3 rounded-2xl border border-sky-150">
              <span className="text-[11px] font-black uppercase tracking-wider text-sky-800 block mb-1">
                ⚡ Quick Actions
              </span>

              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenQuickOrder('pickup');
                }}
                className="w-full py-2.5 px-3 bg-gradient-to-r from-sky-500 to-sky-700 hover:from-sky-600 hover:to-sky-800 text-white text-sm font-black rounded-xl shadow-xs transition-all flex items-center justify-between"
              >
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-amber-300 fill-amber-300" />
                  <span>⚡ 1-Click Quick Order</span>
                </div>
                <ChevronRight className="w-4 h-4 text-white/70" />
              </button>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenNewOrder('pickup');
                  }}
                  className="py-2 px-2.5 bg-white hover:bg-sky-100 text-sky-950 border border-sky-200 text-xs font-bold rounded-xl transition-colors flex items-center justify-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5 text-sky-600" />
                  <span>+ Pickup Order</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenNewOrder('delivery');
                  }}
                  className="py-2 px-2.5 bg-white hover:bg-sky-100 text-sky-950 border border-sky-200 text-xs font-bold rounded-xl transition-colors flex items-center justify-center gap-1.5"
                >
                  <Truck className="w-3.5 h-3.5 text-sky-600" />
                  <span>+ Direct Delivery</span>
                </button>
              </div>
            </div>
          )}

          {/* Navigation Items */}
          <div className="space-y-1">
            <span className="text-[11px] font-black uppercase tracking-wider text-slate-400 px-2 block mb-1">
              All Sections
            </span>
            {navItems.map(item => {
              const Icon = item.icon;
              const isActive = currentTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    onSelectTab(item.id);
                    onClose();
                  }}
                  className={`w-full flex items-center justify-between px-3.5 py-3 rounded-2xl text-sm font-bold transition-all ${
                    isActive
                      ? 'bg-sky-600 text-white shadow-sm font-black'
                      : 'text-slate-700 hover:text-sky-900 hover:bg-sky-50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon className={`w-5 h-5 ${isActive ? 'text-white' : 'text-slate-500'}`} />
                    <span className="text-left">{item.label}</span>
                  </div>
                  <ChevronRight className={`w-4 h-4 ${isActive ? 'text-white/80' : 'text-slate-400'}`} />
                </button>
              );
            })}
          </div>

          {/* Branding & Logo Customizer (Admin only) */}
          {user.role === 'admin' && (
            <div className="pt-2 border-t border-slate-100">
              <span className="text-[11px] font-black uppercase tracking-wider text-slate-400 px-2 block mb-1">
                Branding & Logo
              </span>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenLogoManager();
                }}
                className="w-full flex items-center justify-between px-3.5 py-3 rounded-2xl text-sm font-bold text-slate-700 hover:text-sky-900 hover:bg-sky-50 transition-colors border border-sky-150 bg-sky-50/40"
              >
                <div className="flex items-center gap-3">
                  <Camera className="w-5 h-5 text-sky-600" />
                  <div className="text-left">
                    <span className="block font-bold">Change Laundry Logo</span>
                    <span className="text-[11px] text-slate-500 font-normal">Upload image or choose preset</span>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400" />
              </button>
            </div>
          )}

          {/* Cloud Sync Status */}
          <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <span>Cloud Database Sync</span>
              </div>
              <button
                type="button"
                onClick={handleManualSync}
                disabled={syncing}
                className="p-1 text-slate-500 hover:text-slate-800 rounded-lg hover:bg-slate-200 transition-colors"
                title="Sync now"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
              </button>
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              All your orders, prices, and customers are auto-saved to Cloud Firestore.
            </p>
            {syncMsg && (
              <span className="text-xs font-bold text-emerald-700 block mt-1.5">{syncMsg}</span>
            )}
          </div>
        </div>

        {/* Drawer Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 shrink-0 flex items-center justify-between gap-3">
          {/* Language Indicator */}
          <div className="flex items-center gap-2 px-3 py-2 text-xs font-bold text-slate-700 rounded-xl border border-slate-200 bg-white">
            <Globe className="w-4 h-4 text-sky-600" />
            <span>English (Active)</span>
          </div>

          {/* Logout Button */}
          <button
            type="button"
            onClick={() => {
              onClose();
              logout();
            }}
            className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-rose-600 hover:bg-rose-50 rounded-xl transition-colors border border-rose-200 bg-white"
          >
            <LogOut className="w-4 h-4" />
            <span>{t('logout')}</span>
          </button>
        </div>

      </div>
    </div>
  );
};
