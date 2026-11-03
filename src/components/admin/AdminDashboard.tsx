import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.tsx';
import type { DashboardStats, Order } from '../../types/index.ts';
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
  UserCheck
} from 'lucide-react';

interface AdminDashboardProps {
  onNavigate: (tab: string) => void;
  onOpenNewOrder: (mode?: 'pickup' | 'delivery') => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ onNavigate, onOpenNewOrder }) => {
  const { token, user, language, t } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentOrders, setRecentOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchStats = async () => {
    try {
      setLoading(true);
      const [resStats, resOrders] = await Promise.all([
        fetch('/api/dashboard/stats', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/orders?limit=6', { headers: { Authorization: `Bearer ${token}` } })
      ]);

      if (resStats.ok) {
        const d = await resStats.json();
        setStats(d);
      }
      if (resOrders.ok) {
        const d = await resOrders.json();
        setRecentOrders(d.orders.slice(0, 5));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 15000);
    return () => clearInterval(interval);
  }, []);

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
            Real-time control over 4 shops, delivery fleet, customer addresses, live clothing counters, automatic invoicing, and dual-persistence durability.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => onOpenNewOrder('pickup')}
            className="px-4 py-2.5 bg-white text-sky-900 hover:bg-sky-50 text-xs font-black rounded-2xl shadow-sm transition-all flex items-center gap-2 active:scale-98"
          >
            <Plus className="w-4 h-4 text-sky-600" />
            <span>Create Pickup</span>
          </button>

          <button
            type="button"
            onClick={() => onOpenNewOrder('delivery')}
            className="px-4 py-2.5 bg-sky-900/40 hover:bg-sky-900/60 text-white text-xs font-black rounded-2xl border border-white/20 transition-all flex items-center gap-2 active:scale-98"
          >
            <Truck className="w-4 h-4 text-sky-300" />
            <span>Create Delivery</span>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('master_editor')}
            className="px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white text-xs font-black rounded-2xl border border-white/20 backdrop-blur-xs transition-all flex items-center gap-2"
          >
            <FileText className="w-4 h-4" />
            <span>A-Z Master Editor</span>
          </button>
        </div>
      </div>

      {/* Primary KPI Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Total Shops */}
        <div 
          onClick={() => onNavigate('shops')} 
          className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs hover:shadow-xs transition-all cursor-pointer"
        >
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Total Shops</span>
            <Building2 className="w-4 h-4 text-emerald-700" />
          </div>
          <div className="text-2xl font-black text-slate-900">{stats?.totalShops ?? 0}</div>
          <p className="text-[11px] text-slate-500 mt-1">Warje & across Pune</p>
        </div>

        {/* Live Delivery Boys */}
        <div 
          onClick={() => onNavigate('live_delivery_boys')} 
          className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs hover:shadow-xs transition-all cursor-pointer"
        >
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Live Delivery Boys</span>
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

        {/* Today's Pickups / Deliveries */}
        <div 
          onClick={() => onNavigate('orders')} 
          className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs hover:shadow-xs transition-all cursor-pointer"
        >
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Today's Jobs</span>
            <Package className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-2xl font-black text-slate-900">
            {stats?.todayPickups ?? 0} <span className="text-xs text-slate-500 font-bold">Pickups</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            {stats?.todayDeliveries ?? 0} Deliveries Completed
          </p>
        </div>

        {/* Total Outstanding Customer Due */}
        <div 
          onClick={() => onNavigate('due_payments')} 
          className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs hover:shadow-xs transition-all cursor-pointer"
        >
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Customer Due Balance</span>
            <IndianRupee className="w-4 h-4 text-red-600" />
          </div>
          <div className="text-2xl font-black text-red-700">
            ₹{(stats?.totalOutstanding ?? 0).toFixed(2)}
          </div>
          <p className="text-[11px] text-red-600 font-semibold mt-1">
            Unpaid Customer Invoices
          </p>
        </div>
      </div>

      {/* Secondary Financial KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        {/* Collections Today */}
        <div className="bg-white p-5 rounded-2xl border border-sky-100 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 block">Collections Today</span>
            <span className="text-2xl font-black text-emerald-800 mt-1 block">
              ₹{(stats?.todayCollections ?? 0).toFixed(2)}
            </span>
            <span className="text-[11px] text-slate-500">Today's collection (Cash/UPI)</span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-800 flex items-center justify-center font-black text-xl">
            ₹
          </div>
        </div>

        {/* Overdue Credit Dues */}
        <div 
          onClick={() => onNavigate('due_payments')}
          className="bg-white p-5 rounded-2xl border border-rose-200 shadow-2xs flex items-center justify-between cursor-pointer hover:bg-rose-50/40 transition-colors"
        >
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-rose-600 block">Overdue Customer Dues</span>
            <span className="text-2xl font-black text-rose-700 mt-1 block">
              ₹{(stats?.overdueDuesAmount ?? 0).toFixed(2)}
            </span>
            <span className="text-[11px] text-rose-600 font-bold">{stats?.overdueDuesCount ?? 0} customer bills past due</span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center font-bold">
            <AlertCircle className="w-6 h-6" />
          </div>
        </div>

        {/* Pending Shop Settlements */}
        <div 
          onClick={() => onNavigate('settlements')}
          className="bg-white p-5 rounded-2xl border border-sky-100 shadow-2xs flex items-center justify-between cursor-pointer hover:border-amber-300 transition-colors"
        >
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 block">Pending Cash Handover</span>
            <span className="text-2xl font-black text-amber-700 mt-1 block">
              ₹{(stats?.pendingSettlements ?? 0).toFixed(2)}
            </span>
            <span className="text-[11px] text-amber-800 font-semibold">Cash held by delivery boys</span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-800 flex items-center justify-center font-bold">
            <Clock className="w-6 h-6" />
          </div>
        </div>

        {/* Active Orders Pipeline */}
        <div 
          onClick={() => onNavigate('orders')}
          className="bg-white p-5 rounded-2xl border border-sky-100 shadow-2xs flex items-center justify-between cursor-pointer hover:border-sky-300 transition-colors"
        >
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 block">Active Pipeline</span>
            <span className="text-2xl font-black text-slate-900 mt-1 block">
              {stats?.pendingOrders ?? 0} Orders
            </span>
            <span className="text-[11px] text-slate-500">In pickup, washing or delivery</span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-sky-50 text-sky-700 flex items-center justify-center font-bold">
            <Package className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Today's Itemized Collections List */}
      {stats?.todayCollectionsList && stats.todayCollectionsList.length > 0 && (
        <div className="bg-white rounded-3xl border border-sky-100 shadow-2xs p-5 sm:p-6 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider text-emerald-600 block">
                Real-Time Payments Feed
              </span>
              <h3 className="text-sm font-black text-slate-900 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Today's Collections Attribution</span>
              </h3>
            </div>
            <span className="text-xs font-black text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">
              Total Collections: ₹{(stats?.todayCollections ?? 0).toFixed(2)}
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

      {/* Quick Access Tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <button
          type="button"
          onClick={() => onNavigate('live_delivery_boys')}
          className="p-4 bg-white rounded-2xl border border-slate-200 text-left hover:border-emerald-600 transition-colors shadow-2xs"
        >
          <Truck className="w-5 h-5 text-emerald-800 mb-2" />
          <h4 className="text-xs font-bold text-slate-900">Live Delivery Fleet</h4>
          <p className="text-[11px] text-slate-500 mt-0.5">Availability & assignments</p>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('price_list')}
          className="p-4 bg-white rounded-2xl border border-slate-200 text-left hover:border-emerald-600 transition-colors shadow-2xs"
        >
          <Tag className="w-5 h-5 text-emerald-800 mb-2" />
          <h4 className="text-xs font-bold text-slate-900">Clothing Price List</h4>
          <p className="text-[11px] text-slate-500 mt-0.5">Rates per garment & item</p>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('due_payments')}
          className="p-4 bg-white rounded-2xl border border-slate-200 text-left hover:border-emerald-600 transition-colors shadow-2xs"
        >
          <IndianRupee className="w-5 h-5 text-red-600 mb-2" />
          <h4 className="text-xs font-bold text-slate-900">Due Payments</h4>
          <p className="text-[11px] text-slate-500 mt-0.5">Collect balance from customers</p>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('settlements')}
          className="p-4 bg-white rounded-2xl border border-slate-200 text-left hover:border-emerald-600 transition-colors shadow-2xs"
        >
          <UserCheck className="w-5 h-5 text-amber-700 mb-2" />
          <h4 className="text-xs font-bold text-slate-900">Shop Settlements</h4>
          <p className="text-[11px] text-slate-500 mt-0.5">Confirm cash handed to shop</p>
        </button>
      </div>

      {/* Recent Orders Preview */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Recent Laundry Orders</h3>
            <p className="text-xs text-slate-500">Latest pickups recorded across all shops</p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('orders')}
            className="text-xs font-bold text-emerald-800 hover:text-emerald-950 flex items-center gap-1"
          >
            <span>View All Orders</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {recentOrders.length === 0 ? (
          <div className="text-center py-8 text-xs text-slate-500">
            No orders created yet. Click 'Create Pickup Order' to record your first order.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {recentOrders.map(o => (
              <div key={o.id} className="py-3 flex items-center justify-between text-xs">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-slate-900">{o.order_number}</span>
                    <span className="font-semibold text-slate-700">{o.customer_name}</span>
                    <span className="text-[11px] text-slate-500">({o.area})</span>
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    Shop: {o.shop_name} • Driver: {o.delivery_boy_name || 'Unassigned'}
                  </div>
                </div>

                <div className="text-right">
                  <div className="font-black text-slate-900">₹{o.final_total.toFixed(2)}</div>
                  <div className="text-[11px] capitalize text-emerald-700 font-semibold">{o.status.replace(/_/g, ' ')}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
