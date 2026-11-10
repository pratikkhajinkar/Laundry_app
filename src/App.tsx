import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext.tsx';
import { Navbar } from './components/Navbar.tsx';
import { SetupWizard } from './components/SetupWizard.tsx';
import { LoginModal } from './components/LoginModal.tsx';
import { AdminDashboard } from './components/admin/AdminDashboard.tsx';
import { LiveDeliveryBoys } from './components/admin/LiveDeliveryBoys.tsx';
import { PriceListManager } from './components/admin/PriceListManager.tsx';
import { SettlementManager } from './components/admin/SettlementManager.tsx';
import { ShopsManager } from './components/admin/ShopsManager.tsx';
import { ReportsView } from './components/admin/ReportsView.tsx';
import { AuditLogsView } from './components/admin/AuditLogsView.tsx';
import { OrderList } from './components/orders/OrderList.tsx';
import { CustomerDirectory } from './components/customers/CustomerDirectory.tsx';
import { DuePaymentsView } from './components/payments/DuePaymentsView.tsx';
import { DeliveryBoyPortal } from './components/delivery/DeliveryBoyPortal.tsx';
import { NewOrderModal } from './components/orders/NewOrderModal.tsx';
import { ShopDashboard } from './components/shop/ShopDashboard.tsx';
import { MasterEditorView } from './components/admin/MasterEditorView.tsx';
import { QuickOrderModal } from './components/orders/QuickOrderModal.tsx';
import { OptionsMenuDrawer } from './components/navigation/OptionsMenuDrawer.tsx';
import { LogoManagerModal } from './components/admin/LogoManagerModal.tsx';
import { 
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
  Plus,
  SlidersHorizontal,
  Zap,
  Menu
} from 'lucide-react';

const MainApp: React.FC = () => {
  const { user, setupStatus, isCheckingSetup, language, t } = useAuth();
  const [currentTab, setCurrentTab] = useState<string>('dashboard');
  const [showGlobalNewOrder, setShowGlobalNewOrder] = useState<boolean>(false);
  const [globalOrderMode, setGlobalOrderMode] = useState<'pickup' | 'delivery'>('pickup');
  const [showQuickOrderModal, setShowQuickOrderModal] = useState<boolean>(false);
  const [quickOrderInitialType, setQuickOrderInitialType] = useState<'pickup' | 'delivery'>('pickup');
  const [showOptionsMenu, setShowOptionsMenu] = useState<boolean>(false);
  const [showLogoModal, setShowLogoModal] = useState<boolean>(false);
  const [logoUrl, setLogoUrl] = useState<string>('');

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

  // 1. Initial Loading Screen
  if (isCheckingSetup) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-4 border-sky-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-sm font-bold text-slate-700">Connecting to Friends Laundry & Dry Cleaners...</p>
        </div>
      </div>
    );
  }

  // 2. Setup Wizard if no admin exists yet
  if (!setupStatus?.hasAdmin) {
    return <SetupWizard />;
  }

  // 3. Login Modal if unauthenticated
  if (!user) {
    return <LoginModal />;
  }

  // 4. Role Navigation Configuration (Desktop Left Sidebar)
  const adminNav = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'master_editor', label: 'A to Z Master Editor', icon: SlidersHorizontal },
    { id: 'price_list', label: 'Price List', icon: Tag },
    { id: 'orders', label: 'Orders', icon: Package },
    { id: 'customers', label: 'Customers', icon: Users },
    { id: 'live_delivery_boys', label: 'Delivery Boys', icon: Truck },
    { id: 'due_payments', label: 'Due Payments', icon: IndianRupee },
    { id: 'settlements', label: 'Cash Settlements', icon: Receipt },
    { id: 'shops', label: 'All 4 Shops & Areas', icon: Building2 },
    { id: 'reports', label: 'Reports', icon: FileSpreadsheet },
    { id: 'audit_logs', label: 'Audit Trail', icon: ShieldCheck },
  ];

  const shopNav = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'orders', label: 'Orders', icon: Package },
    { id: 'customers', label: 'Customers', icon: Users },
    { id: 'due_payments', label: 'Due Payments', icon: IndianRupee },
    { id: 'settlements', label: 'Cash Settlements', icon: Receipt },
  ];

  const currentNav = user.role === 'admin' ? adminNav : shopNav;

  return (
    <div className="min-h-screen bg-[#F0F9FF] flex flex-col text-[#0C1E3C] w-full max-w-full overflow-x-hidden relative">
      {/* Top Navbar with fixed header and Menu toggle button */}
      <Navbar 
        currentTab={currentTab} 
        setCurrentTab={setCurrentTab} 
        onOpenMenu={() => setShowOptionsMenu(true)}
        onOpenQuickOrder={(mode) => {
          setQuickOrderInitialType(mode);
          setShowQuickOrderModal(true);
        }}
        onOpenNewOrder={(mode) => {
          setGlobalOrderMode(mode);
          setShowGlobalNewOrder(true);
        }}
      />

      {/* Delivery Boy Workspace (Dedicated Mobile-First View) */}
      {user.role === 'delivery' ? (
        <main className="flex-1 max-w-4xl w-full mx-auto p-4 sm:p-6 pb-20">
          <DeliveryBoyPortal />
        </main>
      ) : (
        /* Admin & Shop Staff Layout (Rock-solid, zero horizontal wobble) */
        <div className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-5 pb-24 lg:pb-8">
          <div className="flex flex-col lg:flex-row gap-6">
            
            {/* Desktop Left Sidebar */}
            <aside className="hidden lg:block w-64 shrink-0">
              <div className="bg-white rounded-3xl border border-sky-100 p-3.5 shadow-sm shadow-sky-500/5 sticky top-22 space-y-1.5">
                <div className="mb-3 space-y-2">
                  <button
                    type="button"
                    onClick={() => {
                      setQuickOrderInitialType('pickup');
                      setShowQuickOrderModal(true);
                    }}
                    className="w-full py-2.5 px-3 bg-gradient-to-r from-sky-500 to-[#0369A1] hover:from-sky-600 hover:to-[#025684] text-white text-xs font-black rounded-2xl shadow-sm shadow-sky-500/25 transition-all flex items-center justify-center gap-1.5 active:scale-98"
                  >
                    <Zap className="w-4 h-4 text-amber-300 fill-amber-300" />
                    <span>⚡ Quick Create (1-Click)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setGlobalOrderMode('pickup');
                      setShowGlobalNewOrder(true);
                    }}
                    className="w-full py-2 px-3 bg-sky-50 hover:bg-sky-100 text-sky-900 border border-sky-200 text-xs font-bold rounded-2xl transition-all flex items-center justify-center gap-1.5 active:scale-98"
                  >
                    <Plus className="w-3.5 h-3.5 text-sky-600" />
                    <span>Create Pickup</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setGlobalOrderMode('delivery');
                      setShowGlobalNewOrder(true);
                    }}
                    className="w-full py-2 px-3 bg-slate-50 hover:bg-slate-100 text-slate-800 border border-slate-200 text-xs font-bold rounded-2xl transition-all flex items-center justify-center gap-1.5 active:scale-98"
                  >
                    <Truck className="w-3.5 h-3.5 text-[#0369A1]" />
                    <span>Create Delivery</span>
                  </button>
                </div>

                {currentNav.map(item => {
                  const Icon = item.icon;
                  const isActive = currentTab === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setCurrentTab(item.id)}
                      className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all ${
                        isActive
                          ? 'bg-sky-50 text-sky-900 font-black shadow-xs border border-sky-200'
                          : 'text-slate-600 hover:text-sky-900 hover:bg-sky-50/50'
                      }`}
                    >
                      <Icon className={`w-4 h-4 ${isActive ? 'text-sky-600' : 'text-slate-400'}`} />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </aside>

            {/* Main Content Area */}
            <main className="flex-1 min-w-0 w-full overflow-x-hidden">
              {user.role === 'admin' && currentTab === 'dashboard' && (
                <AdminDashboard 
                  onNavigate={(tab) => setCurrentTab(tab)} 
                  onOpenNewOrder={(mode = 'pickup') => {
                    setGlobalOrderMode(mode);
                    setShowGlobalNewOrder(true);
                  }} 
                />
              )}

              {user.role === 'shop' && currentTab === 'dashboard' && (
                <ShopDashboard 
                  onNavigate={(tab) => setCurrentTab(tab)} 
                  onOpenNewOrder={() => {
                    setGlobalOrderMode('pickup');
                    setShowGlobalNewOrder(true);
                  }} 
                />
              )}

              {currentTab === 'master_editor' && <MasterEditorView />}
              {currentTab === 'live_delivery_boys' && <LiveDeliveryBoys />}
              {currentTab === 'orders' && <OrderList />}
              {currentTab === 'customers' && <CustomerDirectory />}
              {currentTab === 'price_list' && <PriceListManager />}
              {currentTab === 'due_payments' && <DuePaymentsView />}
              {currentTab === 'settlements' && <SettlementManager />}
              {currentTab === 'shops' && <ShopsManager />}
              {currentTab === 'reports' && <ReportsView />}
              {currentTab === 'audit_logs' && <AuditLogsView />}
            </main>
          </div>
        </div>
      )}

      {/* Rock-solid Mobile Bottom Navigation Bar (100% Fixed, Zero Wobble, High Clarity) */}
      {user.role !== 'delivery' && (
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-sky-200 px-3 py-2 flex items-center justify-around shadow-xl max-w-full">
          <button
            type="button"
            onClick={() => setCurrentTab('dashboard')}
            className={`flex flex-col items-center justify-center py-1 px-2.5 rounded-xl transition-colors ${
              currentTab === 'dashboard' ? 'text-sky-600 font-black' : 'text-slate-500 font-bold'
            }`}
          >
            <LayoutDashboard className="w-5 h-5 mb-0.5" />
            <span className="text-[11px]">Home</span>
          </button>

          <button
            type="button"
            onClick={() => setCurrentTab('orders')}
            className={`flex flex-col items-center justify-center py-1 px-2.5 rounded-xl transition-colors ${
              currentTab === 'orders' ? 'text-sky-600 font-black' : 'text-slate-500 font-bold'
            }`}
          >
            <Package className="w-5 h-5 mb-0.5" />
            <span className="text-[11px]">Orders</span>
          </button>

          {/* Center Elevated Quick Create Button */}
          <button
            type="button"
            onClick={() => {
              setQuickOrderInitialType('pickup');
              setShowQuickOrderModal(true);
            }}
            className="flex flex-col items-center justify-center -mt-6 active:scale-95 transition-transform"
            title="Create Order"
          >
            <div className="w-13 h-13 rounded-full bg-gradient-to-tr from-sky-600 to-sky-400 flex items-center justify-center text-white shadow-xl shadow-sky-500/40 ring-4 ring-white">
              <Zap className="w-6 h-6 fill-white" />
            </div>
            <span className="text-[10px] font-black text-sky-900 mt-0.5">+ Order</span>
          </button>

          <button
            type="button"
            onClick={() => setCurrentTab('customers')}
            className={`flex flex-col items-center justify-center py-1 px-2.5 rounded-xl transition-colors ${
              currentTab === 'customers' ? 'text-sky-600 font-black' : 'text-slate-500 font-bold'
            }`}
          >
            <Users className="w-5 h-5 mb-0.5" />
            <span className="text-[11px]">Customers</span>
          </button>

          {/* Options Menu Button (Opens All Sections cleanly) */}
          <button
            type="button"
            onClick={() => setShowOptionsMenu(true)}
            className="flex flex-col items-center justify-center py-1 px-2.5 rounded-xl text-slate-700 hover:text-sky-700 font-black transition-colors"
          >
            <Menu className="w-5 h-5 mb-0.5 text-sky-600" />
            <span className="text-[11px]">Menu</span>
          </button>
        </nav>
      )}

      {/* Options Menu Drawer (Clean slide-over with all options) */}
      <OptionsMenuDrawer
        isOpen={showOptionsMenu}
        onClose={() => setShowOptionsMenu(false)}
        currentTab={currentTab}
        onSelectTab={setCurrentTab}
        onOpenQuickOrder={(mode) => {
          setQuickOrderInitialType(mode);
          setShowQuickOrderModal(true);
        }}
        onOpenNewOrder={(mode) => {
          setGlobalOrderMode(mode);
          setShowGlobalNewOrder(true);
        }}
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
            setShowLogoModal(false);
          }}
        />
      )}

      {/* Global New Order Modal (Dual Pickup & Delivery Modes) */}
      {showGlobalNewOrder && (
        <NewOrderModal
          initialMode={globalOrderMode}
          onClose={() => setShowGlobalNewOrder(false)}
          onSuccess={() => {
            setShowGlobalNewOrder(false);
            setCurrentTab('orders');
            window.dispatchEvent(new CustomEvent('laundry-orders-updated'));
          }}
        />
      )}

      {/* 1-Click Quick Order Modal (Pickup or Delivery) */}
      {showQuickOrderModal && (
        <QuickOrderModal
          initialType={quickOrderInitialType}
          onClose={() => setShowQuickOrderModal(false)}
          onSuccess={() => {
            setShowQuickOrderModal(false);
            setCurrentTab('orders');
            window.dispatchEvent(new CustomEvent('laundry-orders-updated'));
          }}
        />
      )}
    </div>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <MainApp />
    </AuthProvider>
  );
}
