import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.tsx';
import type { DashboardStats, Order } from '../../types/index.ts';
import { 
  Store, 
  Package, 
  Truck, 
  Receipt, 
  IndianRupee, 
  Plus, 
  ArrowRight, 
  RefreshCw,
  Clock,
  Phone,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';

interface ShopDashboardProps {
  onNavigate: (tab: string) => void;
  onOpenNewOrder: () => void;
}

export const ShopDashboard: React.FC<ShopDashboardProps> = ({ onNavigate, onOpenNewOrder }) => {
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
    if (!token) return;
    fetchStats();
    const interval = setInterval(fetchStats, 15000);
    const onOrdersUpdated = () => fetchStats();
    window.addEventListener('laundry-orders-updated', onOrdersUpdated);
    return () => {
      clearInterval(interval);
      window.removeEventListener('laundry-orders-updated', onOrdersUpdated);
    };
  }, [token]);

  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className="bg-gradient-to-r from-blue-900 to-slate-900 rounded-3xl p-6 sm:p-8 text-white shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-2">
            <Store className="w-5 h-5 text-blue-300" />
            <span className="text-xs font-bold uppercase tracking-wider text-blue-300">
              {user?.shop_name || 'Friends Laundry & Drycleaners'}
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight mt-1">
            Shop Staff Counter • Operations Dashboard
          </h1>
          <p className="text-sm text-slate-300 mt-1 max-w-lg">
            Manage your customer orders, assign delivery boys, inspect pickup photos, print invoices, and monitor cash settlements.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={onOpenNewOrder}
            className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl shadow-md transition-all flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            <span>New Pickup Order</span>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('due_payments')}
            className="px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white text-xs font-bold rounded-xl backdrop-blur-xs transition-all flex items-center gap-2"
          >
            <IndianRupee className="w-4 h-4" />
            <span>Due Payments</span>
          </button>
        </div>
      </div>

      {/* Primary KPI Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Today's Orders */}
        <div 
          onClick={() => onNavigate('orders')} 
          className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs hover:shadow-xs transition-all cursor-pointer"
        >
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Today's Orders</span>
            <Package className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-2xl font-black text-slate-900">{stats?.todayOrders ?? 0}</div>
          <p className="text-[11px] text-slate-500 mt-1">Recorded today</p>
        </div>

        {/* Pending Deliveries */}
        <div 
          onClick={() => onNavigate('orders')} 
          className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs hover:shadow-xs transition-all cursor-pointer"
        >
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Pending Deliveries</span>
            <Truck className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-black text-amber-700">{stats?.pendingDeliveries ?? 0}</div>
          <p className="text-[11px] text-slate-500 mt-1">Ready or Out for Delivery</p>
        </div>

        {/* Customer Due Payments */}
        <div 
          onClick={() => onNavigate('due_payments')} 
          className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs hover:shadow-xs transition-all cursor-pointer"
        >
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Customers' Due Balance</span>
            <IndianRupee className="w-4 h-4 text-red-600" />
          </div>
          <div className="text-2xl font-black text-red-700">
            ₹{(stats?.outstandingDue ?? 0).toFixed(2)}
          </div>
          <p className="text-[11px] text-red-600 font-semibold mt-1">Unsettled customer bills</p>
        </div>

        {/* Collections Today */}
        <div 
          onClick={() => onNavigate('due_payments')} 
          className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs hover:shadow-xs transition-all cursor-pointer"
        >
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Collections Today</span>
            <Receipt className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-black text-emerald-800">
            ₹{(stats?.collectionsToday ?? 0).toFixed(2)}
          </div>
          <p className="text-[11px] text-slate-500 mt-1">Cash & UPI collected</p>
        </div>
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <button
          type="button"
          onClick={() => onNavigate('orders')}
          className="p-4 bg-white rounded-2xl border border-slate-200 text-left hover:border-blue-600 transition-colors shadow-2xs"
        >
          <Package className="w-5 h-5 text-blue-700 mb-2" />
          <h4 className="text-xs font-bold text-slate-900">Manage Orders</h4>
          <p className="text-[11px] text-slate-500 mt-0.5">Pickups, clothes count & status</p>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('customers')}
          className="p-4 bg-white rounded-2xl border border-slate-200 text-left hover:border-blue-600 transition-colors shadow-2xs"
        >
          <Store className="w-5 h-5 text-blue-700 mb-2" />
          <h4 className="text-xs font-bold text-slate-900">Saved Customers</h4>
          <p className="text-[11px] text-slate-500 mt-0.5">Contacts, addresses & flats</p>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('due_payments')}
          className="p-4 bg-white rounded-2xl border border-slate-200 text-left hover:border-blue-600 transition-colors shadow-2xs"
        >
          <IndianRupee className="w-5 h-5 text-red-600 mb-2" />
          <h4 className="text-xs font-bold text-slate-900">Due Payments</h4>
          <p className="text-[11px] text-slate-500 mt-0.5">Collect partial or full bill</p>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('settlements')}
          className="p-4 bg-white rounded-2xl border border-slate-200 text-left hover:border-blue-600 transition-colors shadow-2xs"
        >
          <CheckCircle2 className="w-5 h-5 text-emerald-700 mb-2" />
          <h4 className="text-xs font-bold text-slate-900">Cash Settlement</h4>
          <p className="text-[11px] text-slate-500 mt-0.5">Confirm handover from drivers</p>
        </button>
      </div>

      {/* Recent Orders */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Active Shop Orders</h3>
            <p className="text-xs text-slate-500">Pickups and deliveries in progress</p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('orders')}
            className="text-xs font-bold text-blue-800 hover:text-blue-950 flex items-center gap-1"
          >
            <span>View All</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {recentOrders.length === 0 ? (
          <div className="text-center py-8 text-xs text-slate-500">
            No orders created for this shop yet.
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
                    Driver: {o.delivery_boy_name || 'Unassigned'} • Pickup: {o.pickup_date}
                  </div>
                </div>

                <div className="text-right">
                  <div className="font-black text-slate-900">₹{o.final_total.toFixed(2)}</div>
                  <div className="text-[11px] capitalize text-blue-700 font-semibold">{o.status.replace(/_/g, ' ')}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
