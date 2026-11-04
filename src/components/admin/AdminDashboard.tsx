import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext.tsx';
import type { DashboardStats, Order, Shop } from '../../types/index.ts';
import { 
  Building2, 
  Truck, 
  Package, 
  IndianRupee, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  Plus, 
  ArrowRight, 
  RefreshCw, 
  Tag, 
  Receipt, 
  FileText, 
  UserCheck,
  Store,
  Check,
  MapPin,
  Phone
} from 'lucide-react';

interface AdminDashboardProps {
  onNavigate: (tab: string) => void;
  onOpenNewOrder: (mode?: 'pickup' | 'delivery') => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ onNavigate, onOpenNewOrder }) => {
  const { token, user, language, t, activeShopId, setActiveShopId, shops: authShops } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentOrders, setRecentOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedShopId, setSelectedShopId] = useState<string>(() => {
    return activeShopId || (authShops.length > 0 ? authShops[0].id : '');
  });

  // Sync selected shop with authShops & activeShopId
  useEffect(() => {
    if (!selectedShopId && authShops.length > 0) {
      const initial = activeShopId || authShops[0].id;
      setSelectedShopId(initial);
      setActiveShopId(initial);
    }
  }, [authShops, activeShopId, selectedShopId, setActiveShopId]);

  useEffect(() => {
    if (activeShopId && activeShopId !== selectedShopId) {
      setSelectedShopId(activeShopId);
    }
  }, [activeShopId]);

  const fetchStats = useCallback(async () => {
    if (!token || !selectedShopId) return;
    try {
      setLoading(true);
      const statsUrl = `/api/dashboard/stats?shop_id=${selectedShopId}`;
      const ordersUrl = `/api/orders?shop_id=${selectedShopId}&limit=6`;

      const [resStats, resOrders] = await Promise.all([
        fetch(statsUrl, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(ordersUrl, { headers: { Authorization: `Bearer ${token}` } })
      ]);

      if (resStats.ok) {
        const d = await resStats.json();
        setStats(d);
      }
      if (resOrders.ok) {
        const d = await resOrders.json();
        setRecentOrders(d.orders ? d.orders.slice(0, 6) : []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [token, selectedShopId]);

  useEffect(() => {
    if (selectedShopId) {
      fetchStats();
      const interval = setInterval(fetchStats, 20000);
      return () => clearInterval(interval);
    }
  }, [selectedShopId, fetchStats]);

  const currentShop = authShops.find(s => s.id === selectedShopId) || authShops[0];

  const handleSelectShop = (shopId: string) => {
    setSelectedShopId(shopId);
    setActiveShopId(shopId);
  };

  const handleOpenShopDues = (shopId: string) => {
    setActiveShopId(shopId);
    onNavigate('due_payments');
  };

  const handleOpenShopOrders = (shopId: string) => {
    setActiveShopId(shopId);
    onNavigate('orders');
  };

  return (
    <div className="space-y-6">
      {/* Welcome & Quick Action Banner */}
      <div className="bg-gradient-to-r from-[#0369A1] via-[#0284C7] to-[#38BDF8] rounded-3xl p-6 sm:p-8 text-white shadow-md shadow-sky-500/20 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <span className="text-xs font-black uppercase tracking-wider text-sky-100 bg-white/20 px-3 py-1 rounded-full">
            Friends Laundry & Dry Cleaners • Admin Control Center
          </span>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight mt-2">
            Welcome, {user?.name}!
          </h1>
          <p className="text-xs sm:text-sm text-sky-50 mt-1.5 max-w-xl font-medium">
            Strict branch-by-branch segregation. Direct control of each branch's orders, outstanding dues, cash reconciliation, and operations.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => onOpenNewOrder('pickup')}
            className="px-4 py-2.5 bg-white text-sky-900 hover:bg-sky-50 text-xs font-black rounded-2xl shadow-sm transition-all flex items-center gap-2 active:scale-98 cursor-pointer"
          >
            <Plus className="w-4 h-4 text-sky-600" />
            <span>Create Pickup</span>
          </button>

          <button
            type="button"
            onClick={() => onOpenNewOrder('delivery')}
            className="px-4 py-2.5 bg-sky-900/40 hover:bg-sky-900/60 text-white text-xs font-black rounded-2xl border border-white/20 transition-all flex items-center gap-2 active:scale-98 cursor-pointer"
          >
            <Truck className="w-4 h-4 text-sky-300" />
            <span>Create Delivery</span>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('master_editor')}
            className="px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white text-xs font-black rounded-2xl border border-white/20 backdrop-blur-xs transition-all flex items-center gap-2 cursor-pointer"
          >
            <FileText className="w-4 h-4" />
            <span>A-Z Master Editor</span>
          </button>
        </div>
      </div>

      {/* Prominent Shop Selector Tabs (Strictly Individual Branches — Zero Mixing) */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between px-1">
          <span className="text-xs font-black uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
            <Store className="w-4 h-4 text-sky-600" />
            <span>Select Branch (Each Branch Shown Separately)</span>
          </span>
          <button
            type="button"
            onClick={fetchStats}
            className="text-xs font-bold text-sky-700 hover:text-sky-900 flex items-center gap-1 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>

        {/* 4 Separate Branch Cards / Tabs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {authShops.map(shop => {
            const isSelected = selectedShopId === shop.id;
            const shortName = shop.name.replace('Friends Laundry & Dry Cleaners - ', '');

            return (
              <button
                key={shop.id}
                type="button"
                onClick={() => handleSelectShop(shop.id)}
                className={`p-4 rounded-3xl border text-left transition-all relative overflow-hidden flex flex-col justify-between cursor-pointer ${
                  isSelected
                    ? 'bg-gradient-to-br from-sky-600 via-sky-700 to-[#0369A1] text-white border-sky-600 shadow-lg shadow-sky-600/30 ring-2 ring-sky-400 ring-offset-2'
                    : 'bg-white text-slate-900 border-sky-100 hover:border-sky-300 hover:bg-sky-50/60 shadow-xs'
                }`}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full inline-block mb-1 ${
                      isSelected ? 'bg-white/20 text-sky-100' : 'bg-sky-50 text-sky-700 border border-sky-200'
                    }`}>
                      {shop.code}
                    </span>
                    <h4 className="text-sm font-black tracking-tight leading-snug line-clamp-1">
                      {shortName}
                    </h4>
                  </div>

                  {isSelected && (
                    <span className="w-6 h-6 rounded-full bg-white/20 text-white flex items-center justify-center shrink-0">
                      <Check className="w-3.5 h-3.5" />
                    </span>
                  )}
                </div>

                <div className="pt-2 border-t border-current/15 flex items-baseline justify-between mt-auto">
                  <span className={`text-[11px] font-bold ${isSelected ? 'text-sky-100' : 'text-slate-500'}`}>
                    Branch Status:
                  </span>
                  <span className={`text-xs font-black ${isSelected ? 'text-white' : 'text-sky-700'}`}>
                    {isSelected ? 'Active Selected' : 'Click to View'}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected Branch Info & Quick Action Banner */}
      {currentShop && (
        <div className="p-4 sm:p-5 bg-gradient-to-r from-sky-50 via-white to-sky-50 border border-sky-200 rounded-3xl flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xs">
          <div className="flex items-start sm:items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-sky-600 to-sky-400 text-white flex items-center justify-center font-black shadow-md shadow-sky-500/25 shrink-0 mt-0.5 sm:mt-0">
              <Store className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-black uppercase tracking-wider text-sky-800 bg-sky-100 px-2 py-0.5 rounded-full border border-sky-200">
                  Active Selected Branch
                </span>
                <span className="text-[10px] font-bold text-slate-500">{currentShop.code}</span>
              </div>
              <h2 className="text-lg font-black text-slate-900 tracking-tight mt-0.5">
                {currentShop.name}
              </h2>
              <div className="flex items-center gap-3 text-xs text-slate-600 mt-0.5 flex-wrap">
                {currentShop.address && (
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                    <span>{currentShop.address}</span>
                  </span>
                )}
                {currentShop.phone && (
                  <span className="flex items-center gap-1 font-bold text-slate-700">
                    <Phone className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                    <span>{currentShop.phone}</span>
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 md:border-l border-sky-200 md:pl-5">
            <button
              type="button"
              onClick={() => handleOpenShopOrders(currentShop.id)}
              className="px-3.5 py-2 bg-sky-600 hover:bg-sky-700 text-white text-xs font-black rounded-xl shadow-xs transition-colors cursor-pointer"
            >
              All Branch Orders
            </button>
            <button
              type="button"
              onClick={() => handleOpenShopDues(currentShop.id)}
              className="px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-black rounded-xl shadow-xs transition-colors cursor-pointer"
            >
              Branch Due Balance
            </button>
          </div>
        </div>
      )}

      {/* Primary KPI Grid (Strictly for this Branch) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Branch Code / Active */}
        <div 
          onClick={() => onNavigate('shops')} 
          className="bg-white p-5 rounded-3xl border border-sky-100 shadow-xs hover:border-sky-300 transition-all cursor-pointer"
        >
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Branch Code</span>
            <Building2 className="w-4 h-4 text-sky-700" />
          </div>
          <div className="text-2xl font-black text-slate-900">{currentShop?.code || 'ACTIVE'}</div>
          <p className="text-[11px] text-slate-500 mt-1">
            {currentShop?.name.replace('Friends Laundry & Dry Cleaners - ', '')}
          </p>
        </div>

        {/* Live Delivery Boys */}
        <div 
          onClick={() => onNavigate('live_delivery_boys')} 
          className="bg-white p-5 rounded-3xl border border-sky-100 shadow-xs hover:border-sky-300 transition-all cursor-pointer"
        >
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Delivery Boys</span>
            <Truck className="w-4 h-4 text-emerald-700" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-black text-emerald-800">{stats?.onlineBoys ?? 0}</span>
            <span className="text-xs font-bold text-slate-500">
              ({stats?.availableBoys ?? 0} Ready)
            </span>
          </div>
          <p className="text-[11px] text-emerald-700 font-semibold mt-1 flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            Heartbeat Active
          </p>
        </div>

        {/* Today's Pickups / Deliveries for this shop */}
        <div 
          onClick={() => handleOpenShopOrders(selectedShopId)} 
          className="bg-white p-5 rounded-3xl border border-sky-100 shadow-xs hover:border-sky-300 transition-all cursor-pointer"
        >
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Today's Activity</span>
            <Package className="w-4 h-4 text-sky-600" />
          </div>
          <div className="text-2xl font-black text-slate-900">
            {stats?.todayPickups ?? 0} <span className="text-xs text-slate-500 font-bold">Pickups</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            {stats?.todayDeliveries ?? 0} Deliveries Completed
          </p>
        </div>

        {/* Total Outstanding Customer Due for this shop */}
        <div 
          onClick={() => handleOpenShopDues(selectedShopId)} 
          className="bg-white p-5 rounded-3xl border border-rose-200 shadow-xs hover:border-rose-400 transition-all cursor-pointer bg-rose-50/20"
        >
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-rose-700">Branch Due Balance</span>
            <IndianRupee className="w-4 h-4 text-rose-600" />
          </div>
          <div className="text-2xl font-black text-rose-600">
            ₹{(stats?.totalOutstanding ?? 0).toFixed(2)}
          </div>
          <p className="text-[11px] text-rose-600 font-semibold mt-1">
            {stats?.overdueDuesCount ?? 0} Customer dues pending
          </p>
        </div>
      </div>

      {/* Secondary Financial KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        {/* Collections Today for this shop */}
        <div className="bg-white p-5 rounded-3xl border border-sky-100 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 block">Today's Collection</span>
            <span className="text-2xl font-black text-emerald-800 mt-1 block">
              ₹{(stats?.todayCollections ?? 0).toFixed(2)}
            </span>
            <span className="text-[11px] text-slate-500">Cash / UPI collected today</span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-800 flex items-center justify-center font-black text-xl">
            ₹
          </div>
        </div>

        {/* Overdue Credit Dues for this shop */}
        <div 
          onClick={() => handleOpenShopDues(selectedShopId)}
          className="bg-white p-5 rounded-3xl border border-rose-200 shadow-xs flex items-center justify-between cursor-pointer hover:bg-rose-50/40 transition-colors"
        >
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-rose-600 block">Overdue Dues</span>
            <span className="text-2xl font-black text-rose-700 mt-1 block">
              ₹{(stats?.overdueDuesAmount ?? 0).toFixed(2)}
            </span>
            <span className="text-[11px] text-rose-600 font-bold">{stats?.overdueDuesCount ?? 0} Invoices overdue</span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center font-bold">
            <AlertCircle className="w-6 h-6" />
          </div>
        </div>

        {/* Pending Cash Settlements for this shop */}
        <div 
          onClick={() => onNavigate('settlements')}
          className="bg-white p-5 rounded-3xl border border-sky-100 shadow-xs flex items-center justify-between cursor-pointer hover:border-amber-300 transition-colors"
        >
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 block">Pending Settlement</span>
            <span className="text-2xl font-black text-amber-700 mt-1 block">
              ₹{(stats?.pendingSettlements ?? 0).toFixed(2)}
            </span>
            <span className="text-[11px] text-amber-800 font-semibold">Cash with delivery boys</span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-800 flex items-center justify-center font-bold">
            <Clock className="w-6 h-6" />
          </div>
        </div>

        {/* Active Orders Pipeline for this shop */}
        <div 
          onClick={() => handleOpenShopOrders(selectedShopId)}
          className="bg-white p-5 rounded-3xl border border-sky-100 shadow-xs flex items-center justify-between cursor-pointer hover:border-sky-300 transition-colors"
        >
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 block">Active Orders</span>
            <span className="text-2xl font-black text-slate-900 mt-1 block">
              {stats?.pendingOrders ?? 0} Orders
            </span>
            <span className="text-[11px] text-slate-500">In pickup, wash, or delivery</span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-sky-50 text-sky-700 flex items-center justify-center font-bold">
            <Package className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Today's Itemized Collections List for this shop */}
      {stats?.todayCollectionsList && stats.todayCollectionsList.length > 0 && (
        <div className="bg-white rounded-3xl border border-sky-100 shadow-xs p-5 sm:p-6 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider text-emerald-600 block">
                Direct Branch Payment Logs
              </span>
              <h3 className="text-sm font-black text-slate-900 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Today's Collections ({currentShop?.name})</span>
              </h3>
            </div>
            <span className="text-xs font-black text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">
              Total: ₹{(stats?.todayCollections ?? 0).toFixed(2)}
            </span>
          </div>

          <div className="divide-y divide-slate-100 max-h-52 overflow-y-auto">
            {stats.todayCollectionsList.map((tx) => (
              <div key={tx.id} className="py-2.5 flex items-center justify-between text-xs">
                <div className="flex items-center gap-3">
                  <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md border ${
                    tx.payment_method === 'cash' 
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200' 
                      : 'bg-sky-50 text-sky-800 border-sky-200'
                  }`}>
                    {tx.payment_method}
                  </span>
                  <div>
                    <span className="font-extrabold text-slate-900">{tx.customer_name}</span>
                    <span className="text-[11px] text-slate-500 ml-1.5">({tx.order_number})</span>
                    <span className="text-[10px] text-slate-400 block sm:inline sm:ml-2">
                      Collected by: <strong className="text-slate-600">{tx.collected_by}</strong>
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <span className="font-mono font-black text-emerald-700 text-sm">
                    +₹{Number(tx.amount).toFixed(2)}
                  </span>
                  <span className="text-[10px] text-slate-400 block font-mono">
                    {tx.created_at?.split('T')[1]?.slice(0, 5) || ''}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Orders Preview for this shop */}
      <div className="bg-white rounded-3xl border border-sky-100 shadow-xs p-5 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-black text-slate-900">
              Recent Orders in {currentShop?.name}
            </h3>
            <p className="text-xs text-slate-500">
              Latest orders strictly from this selected branch
            </p>
          </div>
          <button
            type="button"
            onClick={() => handleOpenShopOrders(selectedShopId)}
            className="text-xs font-black text-sky-700 hover:text-sky-900 flex items-center gap-1 cursor-pointer"
          >
            <span>View All Orders</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {recentOrders.length === 0 ? (
          <div className="text-center py-8 text-xs text-slate-500 font-medium">
            No orders found for this branch. Create a new order.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {recentOrders.map(o => (
              <div key={o.id} className="py-3 flex items-center justify-between text-xs">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-black text-sky-900 bg-sky-50 px-2 py-0.5 rounded-lg border border-sky-200">
                      {o.order_number}
                    </span>
                    <span className="font-bold text-slate-900">{o.customer_name}</span>
                    <span className="text-[11px] text-slate-500">({o.area})</span>
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">
                    Branch: <strong>{o.shop_name}</strong> • Driver: {o.delivery_boy_name || 'Not assigned'}
                    {(o.outstanding_amount || 0) > 0 && (
                      <span className="ml-2 text-rose-600 font-bold bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200">
                        Due: ₹{o.outstanding_amount.toFixed(2)}
                      </span>
                    )}
                  </div>
                </div>

                <div className="text-right">
                  <div className="font-black text-slate-900">₹{o.final_total.toFixed(2)}</div>
                  <div className="text-[11px] capitalize text-sky-700 font-bold">{o.status.replace(/_/g, ' ')}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
