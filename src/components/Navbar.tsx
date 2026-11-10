import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { 
  Shirt, 
  LogOut, 
  Store, 
  Truck, 
  ShieldCheck,
  SlidersHorizontal,
  Camera,
  Menu,
  Zap,
  Globe,
  ChevronDown,
  Check
} from 'lucide-react';
import { LogoManagerModal } from './admin/LogoManagerModal.tsx';
import { OptionsMenuDrawer } from './navigation/OptionsMenuDrawer.tsx';

interface NavbarProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
  onOpenQuickOrder?: (mode: 'pickup' | 'delivery') => void;
  onOpenNewOrder?: (mode: 'pickup' | 'delivery') => void;
  onOpenMenu?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ 
  currentTab, 
  setCurrentTab,
  onOpenQuickOrder,
  onOpenNewOrder,
  onOpenMenu
}) => {
  const { user, token, logout, language, setLanguage, t, toggleAvailability, activeShopId, setActiveShopId, shops } = useAuth();
  const [logoUrl, setLogoUrl] = useState<string>('');
  const [showLogoModal, setShowLogoModal] = useState<boolean>(false);
  const [showDrawer, setShowDrawer] = useState<boolean>(false);
  const [showShopDropdown, setShowShopDropdown] = useState<boolean>(false);
  const shopDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (shopDropdownRef.current && !shopDropdownRef.current.contains(e.target as Node)) {
        setShowShopDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    fetch('/api/settings')
      .then(r => r.json())
      .then(d => {
        if (d?.logo) setLogoUrl(d.logo);
      })
      .catch(() => {});

    const onLogoEvent = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail;
      if (typeof detail === 'string') setLogoUrl(detail);
    };
    window.addEventListener('laundry-logo-updated', onLogoEvent);
    return () => window.removeEventListener('laundry-logo-updated', onLogoEvent);
  }, []);

  if (!user) return null;

  const activeShop = shops.find(s => s.id === activeShopId);

  const roleBadge = () => {
    switch (user.role) {
      case 'admin':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black bg-sky-100 text-sky-900 border border-sky-300">
            <ShieldCheck className="w-3.5 h-3.5 text-sky-600" />
            <span>Admin</span>
          </span>
        );
      case 'shop':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black bg-blue-100 text-blue-900 border border-blue-300">
            <Store className="w-3.5 h-3.5 text-blue-600" />
            <span>{user.shop_name || t('shop')}</span>
          </span>
        );
      case 'delivery':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black bg-amber-100 text-amber-900 border border-amber-300">
            <Truck className="w-3.5 h-3.5 text-amber-600" />
            <span>{t('delivery')} {user.area_name ? `(${user.area_name})` : ''}</span>
          </span>
        );
    }
  };

  return (
    <>
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-sky-100 shadow-xs w-full max-w-full overflow-visible">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 gap-2 w-full">
            
            {/* Corner Logo & Brand Name strictly on single row without wrapping underneath */}
            <div 
              className="flex items-center gap-2.5 sm:gap-3 cursor-pointer select-none shrink-0 min-w-0" 
              onClick={() => setCurrentTab('dashboard')}
            >
              <div 
                className="relative group shrink-0" 
                title={user.role === 'admin' ? 'Click to change logo' : 'Friends Laundry Logo'}
                onClick={(e) => {
                  if (user.role === 'admin') {
                    e.stopPropagation();
                    setShowLogoModal(true);
                  }
                }}
              >
                {logoUrl ? (
                  <img 
                    src={logoUrl} 
                    alt="Friends Laundry Logo" 
                    className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl object-cover shadow-md border-2 border-sky-300 bg-white" 
                  />
                ) : (
                  <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-gradient-to-tr from-sky-600 to-sky-400 flex items-center justify-center text-white shadow-md shadow-sky-500/20 font-black">
                    <Shirt className="w-6 h-6" />
                  </div>
                )}
                {user.role === 'admin' && (
                  <div className="absolute -bottom-1 -right-1 bg-white rounded-full p-1 shadow-sm border border-sky-300 opacity-90 group-hover:scale-110 transition-transform">
                    <Camera className="w-3 h-3 text-sky-700" />
                  </div>
                )}
              </div>

              {/* Laundry Title Inline Only - No Text Dropping Underneath */}
              <div className="flex items-center gap-2 whitespace-nowrap min-w-0">
                <span className="text-base sm:text-xl font-black tracking-tight text-slate-900 whitespace-nowrap truncate max-w-[200px] sm:max-w-none">
                  Friends Laundry & Dry Cleaners
                </span>
                <span className="hidden md:inline-block text-[11px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-sky-100 text-sky-800 border border-sky-200 shrink-0">
                  Live
                </span>
              </div>
            </div>

            {/* Delivery Boy Online/Busy Toggle */}
            {user.role === 'delivery' && (
              <div className="hidden sm:flex items-center gap-2 bg-slate-50 p-1 rounded-xl border border-slate-200 shrink-0">
                <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 px-2 py-1 bg-white rounded-lg shadow-2xs">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  {t('online')}
                </span>
                <button
                  type="button"
                  onClick={() => toggleAvailability(!user.is_busy)}
                  className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-colors ${
                    user.is_busy 
                      ? 'bg-amber-100 text-amber-800 border border-amber-300' 
                      : 'bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100'
                  }`}
                >
                  {user.is_busy ? `⚠️ ${t('busy')}` : `✅ ${t('available')}`}
                </button>
              </div>
            )}

            {/* Right Action buttons & Prominent Fixed Menu Button */}
            <div className="flex items-center gap-2 shrink-0">
              {/* Admin Shop Switcher */}
              {user.role === 'admin' && shops.length > 0 && (
                <div className="relative" ref={shopDropdownRef}>
                  <button
                    type="button"
                    onClick={() => setShowShopDropdown(prev => !prev)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-black bg-sky-50 text-sky-900 border border-sky-300 hover:bg-sky-100 transition-all cursor-pointer shadow-2xs"
                    title="Switch Active Shop Branch"
                  >
                    <Store className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                    <span className="truncate max-w-[110px] sm:max-w-[150px]">
                      {activeShop?.name?.replace('Friends Laundry & Dry Cleaners - ', '') || 'Select Shop'}
                    </span>
                    <ChevronDown className={`w-3 h-3 text-sky-600 transition-transform ${showShopDropdown ? 'rotate-180' : ''}`} />
                  </button>

                  {showShopDropdown && (
                    <div className="absolute right-0 mt-2 w-64 bg-white rounded-2xl shadow-xl border border-sky-100 py-1.5 z-50 animate-in fade-in zoom-in-95 duration-100">
                      <div className="px-3.5 py-1.5 border-b border-sky-50 text-[10px] font-black uppercase tracking-wider text-slate-400">
                        Select Branch
                      </div>
                      {shops.map(s => {
                        const isSelected = s.id === activeShopId;
                        const shortName = s.name.replace('Friends Laundry & Dry Cleaners - ', '');
                        return (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => {
                              setActiveShopId(s.id);
                              setShowShopDropdown(false);
                            }}
                            className={`w-full text-left px-3.5 py-2 text-xs font-bold flex items-center justify-between transition-colors ${
                              isSelected ? 'bg-sky-50 text-sky-900 font-black' : 'text-slate-700 hover:bg-slate-50'
                            }`}
                          >
                            <div className="truncate pr-2">
                              <div className="truncate">{shortName}</div>
                              <div className="text-[10px] text-slate-400 font-normal">{s.code}</div>
                            </div>
                            {isSelected && <Check className="w-4 h-4 text-sky-600 shrink-0" />}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {roleBadge()}

              {/* Dedicated Options Menu Button (Rock-solid, opens all options cleanly) */}
              <button
                type="button"
                onClick={() => onOpenMenu ? onOpenMenu() : setShowDrawer(true)}
                className="flex items-center gap-1.5 px-3 sm:px-3.5 py-2 bg-gradient-to-r from-sky-500 to-sky-700 hover:from-sky-600 hover:to-sky-800 text-white font-black text-xs sm:text-sm rounded-2xl shadow-sm shadow-sky-500/25 active:scale-95 transition-all cursor-pointer"
                title="Open Options Menu"
              >
                <Menu className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                <span>Menu</span>
              </button>

              {/* Desktop quick logout */}
              <button
                type="button"
                onClick={() => logout()}
                className="hidden lg:flex p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors"
                title={t('logout')}
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Options Menu Drawer */}
      <OptionsMenuDrawer
        isOpen={showDrawer}
        onClose={() => setShowDrawer(false)}
        currentTab={currentTab}
        onSelectTab={setCurrentTab}
        onOpenQuickOrder={(mode) => onOpenQuickOrder ? onOpenQuickOrder(mode) : null}
        onOpenNewOrder={(mode) => onOpenNewOrder ? onOpenNewOrder(mode) : null}
        onOpenLogoManager={() => setShowLogoModal(true)}
        logoUrl={logoUrl}
      />

      {/* Logo Manager Modal */}
      {showLogoModal && (
        <LogoManagerModal 
          currentLogo={logoUrl}
          onClose={() => setShowLogoModal(false)}
          onLogoUpdated={(newLogo) => {
            setLogoUrl(newLogo);
            window.dispatchEvent(new CustomEvent('laundry-logo-updated', { detail: newLogo }));
          }}
        />
      )}
    </>
  );
};
