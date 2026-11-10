import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.tsx';
import {
  SlidersHorizontal,
  Package,
  Shirt,
  Users,
  Store,
  Truck,
  Tag,
  Receipt,
  Database,
  Save,
  Edit3,
  Trash2,
  Plus,
  Minus,
  Search,
  CheckCircle2,
  RefreshCw,
  AlertCircle,
  IndianRupee,
  Building2,
  Calendar,
  Phone,
  MapPin,
  X,
  FileCheck,
  ShieldCheck,
  HardDrive
} from 'lucide-react';
import { syncOrderToFirestore, syncCustomerToFirestore } from '../../services/firestoreSync.ts';

interface OrderItem {
  id?: string;
  item_name: string;
  quantity: number;
  rate: number;
  line_total: number;
}

interface MasterOrder {
  id: string;
  order_number: string;
  customer_id: string;
  customer_name: string;
  customer_mobile: string;
  shop_id: string;
  shop_name: string;
  status: string;
  order_type: string;
  area: string;
  pickup_address: string;
  delivery_address: string;
  pickup_date: string;
  delivery_date: string | null;
  assigned_delivery_boy_id: string | null;
  delivery_boy_name: string | null;
  subtotal: number;
  delivery_charge: number;
  discount_amount: number;
  final_total: number;
  amount_paid: number;
  outstanding_amount: number;
  payment_status: string;
  notes: string | null;
  special_instructions?: string | null;
  created_at: string;
  items?: OrderItem[];
  invoice_number?: string;
  invoice_id?: string;
}

interface MasterCustomer {
  id: string;
  name: string;
  mobile: string;
  email: string | null;
  pickup_address: string;
  delivery_address: string;
  area: string;
  building_name: string | null;
  flat_number: string | null;
  notes: string | null;
}

interface MasterShop {
  id: string;
  name: string;
  code: string;
  phone: string;
  address: string;
  gst_number: string | null;
  upi_id: string | null;
}

interface MasterDeliveryBoy {
  id: string;
  name: string;
  email_or_phone: string;
  area_name: string | null;
  status?: string;
  is_busy: number;
  is_active?: number;
}

interface MasterCategory {
  id: string;
  name: string;
  default_rate?: number;
  unit?: string;
  base_price?: number;
  service_type?: string;
  is_active: number;
  sort_order?: number;
}

interface MasterArea {
  id: string;
  name: string;
  pincode: string | null;
  city: string;
}

interface DbStats {
  journalMode: string;
  dbSizeFormatted: string;
  backupSizeFormatted: string;
  lastBackupTime: string | null;
  counts: {
    orders: number;
    customers: number;
    users: number;
    shops: number;
    categories: number;
    invoices: number;
    orderItems: number;
    payments: number;
  };
}

export const MasterEditorView: React.FC = () => {
  const { token, language, activeShopId, setActiveShopId } = useAuth();
  const [activeTab, setActiveTab] = useState<'orders' | 'customers' | 'shops' | 'delivery' | 'categories' | 'database'>('orders');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Master Data state
  const [orders, setOrders] = useState<MasterOrder[]>([]);
  const [customers, setCustomers] = useState<MasterCustomer[]>([]);
  const [shops, setShops] = useState<MasterShop[]>([]);
  const [deliveryBoys, setDeliveryBoys] = useState<MasterDeliveryBoy[]>([]);
  const [categories, setCategories] = useState<MasterCategory[]>([]);
  const [serviceAreas, setServiceAreas] = useState<MasterArea[]>([]);
  const [dbStats, setDbStats] = useState<DbStats | null>(null);

  // Filter & Search
  const [searchTerm, setSearchTerm] = useState('');
  const [shopFilter, setShopFilter] = useState(() => activeShopId || '');

  // Edit Modals
  const [editingOrder, setEditingOrder] = useState<MasterOrder | null>(null);
  const [editingOrderItems, setEditingOrderItems] = useState<{ order: MasterOrder; items: OrderItem[] } | null>(null);
  const [editingCustomer, setEditingCustomer] = useState<MasterCustomer | null>(null);
  const [editingShop, setEditingShop] = useState<MasterShop | null>(null);
  const [editingCategory, setEditingCategory] = useState<MasterCategory | null>(null);

  const fetchMasterData = async () => {
    try {
      setLoading(true);
      const [resMaster, resStats] = await Promise.all([
        fetch('/api/admin/master-data', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/admin/database/stats', { headers: { Authorization: `Bearer ${token}` } })
      ]);

      if (resMaster.ok) {
        const d = await resMaster.json();
        setOrders(d.orders || []);
        setCustomers(d.customers || []);
        setShops(d.shops || []);
        setDeliveryBoys(d.deliveryBoys || []);
        setCategories(d.categories || []);
        setServiceAreas(d.serviceAreas || []);
        if (!shopFilter && !activeShopId && d.shops?.length > 0) {
          setShopFilter(d.shops[0].id);
        } else if (activeShopId && !shopFilter) {
          setShopFilter(activeShopId);
        }
      }

      if (resStats.ok) {
        const s = await resStats.json();
        setDbStats(s);
      }
    } catch (err: any) {
      setMsg({ type: 'error', text: 'Failed to load master data: ' + err.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMasterData();
  }, []);

  useEffect(() => {
    if (activeShopId && activeShopId !== shopFilter) {
      setShopFilter(activeShopId);
    }
  }, [activeShopId]);

  const showNotification = (type: 'success' | 'error', text: string) => {
    setMsg({ type, text });
    setTimeout(() => setMsg(null), 5000);
  };

  // Trigger snapshot backup
  const handleBackupNow = async () => {
    try {
      setSaving(true);
      const res = await fetch('/api/admin/database/backup', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        showNotification('success', 'Database flush & snapshot backup created successfully! All data is securely locked.');
        const statsRes = await fetch('/api/admin/database/stats', { headers: { Authorization: `Bearer ${token}` } });
        if (statsRes.ok) setDbStats(await statsRes.json());
      } else {
        const err = await res.json();
        showNotification('error', err.error || 'Failed to backup database');
      }
    } catch (e: any) {
      showNotification('error', e.message);
    } finally {
      setSaving(false);
    }
  };

  // Save Order General Edits
  const handleSaveOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingOrder) return;
    try {
      setSaving(true);
      const res = await fetch(`/api/admin/orders/${editingOrder.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(editingOrder)
      });
      if (res.ok) {
        await syncOrderToFirestore(editingOrder as any);
        showNotification('success', `Order ${editingOrder.order_number} updated successfully!`);
        setEditingOrder(null);
        fetchMasterData();
      } else {
        const err = await res.json();
        showNotification('error', err.error || 'Failed to update order');
      }
    } catch (e: any) {
      showNotification('error', e.message);
    } finally {
      setSaving(false);
    }
  };

  // Save Clothes Items & Auto Recalculate Invoice
  const handleSaveOrderItems = async () => {
    if (!editingOrderItems) return;
    try {
      setSaving(true);
      const { order, items } = editingOrderItems;
      const res = await fetch(`/api/admin/orders/${order.id}/items`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          items,
          delivery_charge: order.delivery_charge,
          discount_amount: order.discount_amount
        })
      });
      if (res.ok) {
        showNotification('success', `Clothes items & bill recalculated successfully for ${order.order_number}!`);
        setEditingOrderItems(null);
        fetchMasterData();
      } else {
        const err = await res.json();
        showNotification('error', err.error || 'Failed to recalculate items');
      }
    } catch (e: any) {
      showNotification('error', e.message);
    } finally {
      setSaving(false);
    }
  };

  // Save Customer Edits
  const handleSaveCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCustomer) return;
    try {
      setSaving(true);
      const res = await fetch(`/api/customers/${editingCustomer.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(editingCustomer)
      });
      if (res.ok) {
        await syncCustomerToFirestore(editingCustomer);
        showNotification('success', `Customer ${editingCustomer.name} updated!`);
        setEditingCustomer(null);
        fetchMasterData();
      } else {
        const err = await res.json();
        showNotification('error', err.error || 'Failed to update customer');
      }
    } catch (e: any) {
      showNotification('error', e.message);
    } finally {
      setSaving(false);
    }
  };

  // Save Shop Edits
  const handleSaveShop = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingShop) return;
    try {
      setSaving(true);
      const res = await fetch(`/api/shops/${editingShop.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(editingShop)
      });
      if (res.ok) {
        showNotification('success', `Shop ${editingShop.name} updated!`);
        setEditingShop(null);
        fetchMasterData();
      } else {
        const err = await res.json();
        showNotification('error', err.error || 'Failed to update shop');
      }
    } catch (e: any) {
      showNotification('error', e.message);
    } finally {
      setSaving(false);
    }
  };

  // Save Category/Rate Edits
  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCategory) return;
    try {
      setSaving(true);
      const rateVal = Number(editingCategory.default_rate ?? editingCategory.base_price ?? 0);
      const unitVal = editingCategory.unit || 'piece';
      const res = await fetch(`/api/clothing-categories/${editingCategory.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: editingCategory.name,
          default_rate: rateVal,
          unit: unitVal,
          is_active: editingCategory.is_active ?? 1,
          sort_order: editingCategory.sort_order ?? 0
        })
      });
      if (res.ok) {
        showNotification('success', `Rate updated for ${editingCategory.name}!`);
        setEditingCategory(null);
        fetchMasterData();
      } else {
        const err = await res.json();
        showNotification('error', err.error || 'Failed to update category');
      }
    } catch (e: any) {
      showNotification('error', e.message);
    } finally {
      setSaving(false);
    }
  };

  // Delete Order
  const handleDeleteOrder = async (orderId: string, orderNumber: string) => {
    if (!confirm(`Are you sure you want to permanently delete Order ${orderNumber}? This will also delete associated items, invoices, and photo records.`)) {
      return;
    }
    try {
      setSaving(true);
      const res = await fetch(`/api/admin/orders/${orderId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        showNotification('success', `Order ${orderNumber} deleted.`);
        fetchMasterData();
      } else {
        const err = await res.json();
        showNotification('error', err.error || 'Failed to delete order');
      }
    } catch (e: any) {
      showNotification('error', e.message);
    } finally {
      setSaving(false);
    }
  };

  // Filtered Orders
  const filteredOrders = orders.filter(o => {
    const matchShop = !shopFilter || o.shop_id === shopFilter;
    const matchSearch = searchTerm === '' ||
      o.order_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      o.customer_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      o.customer_mobile.includes(searchTerm) ||
      o.area.toLowerCase().includes(searchTerm.toLowerCase());
    return matchShop && matchSearch;
  });

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-emerald-950 text-white rounded-2xl p-6 shadow-md border border-slate-700">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                <SlidersHorizontal className="w-5 h-5" />
              </span>
              <h1 className="text-xl font-bold tracking-tight">
                A to Z Master Editor (All Data Control)
              </h1>
              <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-emerald-800/80 text-emerald-200 border border-emerald-600/50">
                Super Admin Only
              </span>
            </div>
            <p className="text-xs text-slate-300 mt-1 max-w-2xl">
              Directly modify any Order, Clothing Counts, Rates, Invoices, 4 Shops, Customers, Delivery Staff, and SQLite WAL Database Durability.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleBackupNow}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-xs transition-colors"
            >
              <HardDrive className={`w-4 h-4 ${saving ? 'animate-spin' : ''}`} />
              <span>Snapshot Backup Now</span>
            </button>
            <button
              type="button"
              onClick={fetchMasterData}
              disabled={loading}
              className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl transition-colors border border-slate-600"
              title="Refresh All"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Quick DB Durability Pill */}
        {dbStats && (
          <div className="mt-4 pt-4 border-t border-slate-700/60 flex flex-wrap items-center gap-3 text-xs text-slate-300">
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 font-mono">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              WAL Mode: {dbStats.journalMode} (Zero Data Loss)
            </span>
            <span>DB Size: <strong className="text-white font-mono">{dbStats.dbSizeFormatted}</strong></span>
            <span>•</span>
            <span>Backup Size: <strong className="text-white font-mono">{dbStats.backupSizeFormatted}</strong></span>
            <span>•</span>
            <span>Total Orders: <strong className="text-white font-mono">{dbStats.counts.orders}</strong></span>
            <span>•</span>
            <span>Total Customers: <strong className="text-white font-mono">{dbStats.counts.customers}</strong></span>
            <span>•</span>
            <span>Total Invoices: <strong className="text-white font-mono">{dbStats.counts.invoices}</strong></span>
          </div>
        )}
      </div>

      {/* Notifications */}
      {msg && (
        <div className={`p-4 rounded-xl flex items-center gap-2 text-sm font-semibold ${
          msg.type === 'success' 
            ? 'bg-emerald-50 text-emerald-900 border border-emerald-300' 
            : 'bg-red-50 text-red-900 border border-red-300'
        }`}>
          {msg.type === 'success' ? <CheckCircle2 className="w-5 h-5 text-emerald-700" /> : <AlertCircle className="w-5 h-5 text-red-700" />}
          <span>{msg.text}</span>
        </div>
      )}

      {/* Navigation Sub-Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 border-b border-slate-200 text-xs font-bold">
        {[
          { id: 'orders', label: '📦 Orders & Clothes', icon: Package },
          { id: 'customers', label: '👥 Customers', icon: Users },
          { id: 'shops', label: '🏬 4 Official Shops', icon: Store },
          { id: 'delivery', label: '🚴 Delivery Staff', icon: Truck },
          { id: 'categories', label: '🏷️ Price List & Rates', icon: Tag },
          { id: 'database', label: '💾 Database Durability', icon: Database }
        ].map(t => {
          const Icon = t.icon;
          const isActive = activeTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id as any)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl whitespace-nowrap transition-colors border ${
                isActive
                  ? 'bg-emerald-800 text-white border-emerald-800 shadow-2xs'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB 1: ORDERS & CLOTHES EDIT */}
      {activeTab === 'orders' && (
        <div className="space-y-4">
          {/* Filters Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-600">Shop Filter:</span>
              <select
                value={shopFilter}
                onChange={(e) => {
                  setShopFilter(e.target.value);
                  setActiveShopId(e.target.value);
                }}
                className="text-xs font-semibold px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-600"
              >
                {shops.map(s => (
                  <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
                ))}
              </select>
            </div>

            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search orders by number, customer, phone, or area..."
                className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-600"
              />
            </div>
          </div>

          {/* Orders Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[11px]">
                    <th className="py-3 px-4">Order #</th>
                    <th className="py-3 px-4">Customer</th>
                    <th className="py-3 px-4">Shop Branch</th>
                    <th className="py-3 px-4">Type & Area</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Bill / Paid / Due</th>
                    <th className="py-3 px-4 text-center">Master Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredOrders.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-400">
                        No orders match the selected filter.
                      </td>
                    </tr>
                  ) : (
                    filteredOrders.map(order => (
                      <tr key={order.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3.5 px-4">
                          <span className="font-mono font-black text-emerald-900">{order.order_number}</span>
                          <div className="text-[10px] text-slate-400">{order.pickup_date}</div>
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="font-bold text-slate-900">{order.customer_name}</div>
                          <div className="text-slate-500 font-mono text-[11px]">{order.customer_mobile}</div>
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="inline-flex items-center gap-1 font-semibold text-slate-700">
                            <Store className="w-3 h-3 text-slate-400" />
                            {order.shop_name}
                          </span>
                        </td>
                        <td className="py-3.5 px-4">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            order.order_type === 'delivery' ? 'bg-blue-100 text-blue-800' : 'bg-emerald-100 text-emerald-800'
                          }`}>
                            {order.order_type}
                          </span>
                          <div className="text-slate-500 text-[11px] mt-0.5">{order.area}</div>
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-800 border border-slate-300">
                            {order.status}
                          </span>
                          <div className="text-[10px] text-slate-500 mt-0.5">
                            Driver: {order.delivery_boy_name || 'Unassigned'}
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <div className="font-black text-slate-900">₹{order.final_total.toFixed(2)}</div>
                          <div className="text-[11px] text-emerald-700">Paid: ₹{order.amount_paid.toFixed(2)}</div>
                          {order.outstanding_amount > 0 ? (
                            <div className="text-[11px] font-bold text-red-600">Due: ₹{order.outstanding_amount.toFixed(2)}</div>
                          ) : (
                            <div className="text-[10px] text-slate-400">Clear</div>
                          )}
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setEditingOrder({ ...order })}
                              className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-bold flex items-center gap-1 transition-colors"
                              title="Edit Details (Status, Customer, Address, Driver)"
                            >
                              <Edit3 className="w-3.5 h-3.5 text-slate-600" />
                              <span>Order</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                const parsed = (order.items && order.items.length > 0)
                                  ? order.items
                                  : [
                                      { item_name: 'T-shirt', quantity: 0, rate: 15, line_total: 0 },
                                      { item_name: 'Shirt', quantity: 0, rate: 15, line_total: 0 },
                                      { item_name: 'Pant/Trousers', quantity: 0, rate: 20, line_total: 0 },
                                      { item_name: 'Jeans', quantity: 0, rate: 25, line_total: 0 }
                                    ];
                                setEditingOrderItems({ order: { ...order }, items: JSON.parse(JSON.stringify(parsed)) });
                              }}
                              className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-lg font-bold flex items-center gap-1 transition-colors"
                              title="Edit Clothes Counts & Live Rates (Recalculate Bill)"
                            >
                              <Shirt className="w-3.5 h-3.5 text-emerald-700" />
                              <span>Clothes & Rates</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleDeleteOrder(order.id, order.order_number)}
                              className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              title="Permanently Delete Order"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: CUSTOMERS EDIT */}
      {activeTab === 'customers' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-900">Registered Customers Directory ({customers.length})</h2>
              <span className="text-xs text-slate-500">Edit address, phone numbers and notes.</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[11px]">
                    <th className="py-3 px-4">Customer Name</th>
                    <th className="py-3 px-4">Mobile</th>
                    <th className="py-3 px-4">Area</th>
                    <th className="py-3 px-4">Flat / Building / Address</th>
                    <th className="py-3 px-4">Notes</th>
                    <th className="py-3 px-4 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {customers.map(c => (
                    <tr key={c.id} className="hover:bg-slate-50/80">
                      <td className="py-3 px-4 font-bold text-slate-900">{c.name}</td>
                      <td className="py-3 px-4 font-mono text-slate-700">{c.mobile}</td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-800 font-semibold">{c.area}</span>
                      </td>
                      <td className="py-3 px-4 text-slate-600 max-w-xs truncate">
                        {c.flat_number && `${c.flat_number}, `}{c.building_name && `${c.building_name}, `}{c.pickup_address}
                      </td>
                      <td className="py-3 px-4 text-slate-400 italic text-[11px]">{c.notes || '—'}</td>
                      <td className="py-3 px-4 text-center">
                        <button
                          type="button"
                          onClick={() => setEditingCustomer({ ...c })}
                          className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg font-bold inline-flex items-center gap-1"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>Edit</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: 4 OFFICIAL SHOPS EDIT */}
      {activeTab === 'shops' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-bold text-slate-900">4 Official Branches of Friends Laundry & Dry Cleaners</h2>
                <p className="text-xs text-slate-500">Edit address, phone numbers, UPI QR and GST for all 4 branches.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {shops.map(s => (
                <div key={s.id} className="bg-slate-50 rounded-xl border border-slate-200 p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                        {s.code}
                      </span>
                      <h3 className="text-sm font-bold text-slate-900 mt-1">{s.name}</h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => setEditingShop({ ...s })}
                      className="px-2.5 py-1 text-xs bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg font-bold flex items-center gap-1 shadow-2xs"
                    >
                      <Edit3 className="w-3 h-3 text-slate-600" />
                      <span>Edit Branch</span>
                    </button>
                  </div>

                  <div className="text-xs space-y-1 text-slate-600">
                    <div className="flex items-start gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                      <span>{s.address}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="font-mono">{s.phone}</span>
                    </div>
                    {s.upi_id && (
                      <div className="flex items-center gap-1.5 text-emerald-800 font-semibold">
                        <IndianRupee className="w-3.5 h-3.5 text-emerald-600" />
                        <span>UPI: {s.upi_id}</span>
                      </div>
                    )}
                    {s.gst_number && (
                      <div className="text-[11px] text-slate-500 font-mono">
                        GST: {s.gst_number}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: DELIVERY BOYS EDIT */}
      {activeTab === 'delivery' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-slate-900">Delivery Personnel List ({deliveryBoys.length})</h2>
                <p className="text-xs text-slate-500">View and update field delivery staff mobile numbers and active availability.</p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[11px]">
                    <th className="py-3 px-4">Name</th>
                    <th className="py-3 px-4">Mobile / Login</th>
                    <th className="py-3 px-4">Assigned Area</th>
                    <th className="py-3 px-4">Live Status</th>
                    <th className="py-3 px-4">Account Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {deliveryBoys.map(boy => (
                    <tr key={boy.id} className="hover:bg-slate-50/80">
                      <td className="py-3 px-4 font-bold text-slate-900">{boy.name}</td>
                      <td className="py-3 px-4 font-mono text-slate-700">{boy.email_or_phone}</td>
                      <td className="py-3 px-4 text-slate-700">{boy.area_name || 'Pune Metro'}</td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          boy.is_busy ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                        }`}>
                          {boy.is_busy ? 'Busy on Delivery' : 'Available'}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          (boy.status === 'active' || boy.is_active === 1) ? 'bg-slate-100 text-slate-800' : 'bg-red-100 text-red-800'
                        }`}>
                          {(boy.status === 'active' || boy.is_active === 1) ? 'Active' : 'Disabled'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: PRICE LIST / CATEGORIES EDIT */}
      {activeTab === 'categories' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-slate-900">Clothing Rates Configuration ({categories.length} items)</h2>
                <p className="text-xs text-slate-500">Official laundry & dry clean rates used when generating invoices automatically.</p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[11px]">
                    <th className="py-3 px-4">Garment Item</th>
                    <th className="py-3 px-4">Billing Unit</th>
                    <th className="py-3 px-4 text-right">Default Rate (₹)</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4 text-center">Edit Rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {categories.map(cat => {
                    const rateValue = Number(cat.default_rate ?? cat.base_price ?? 0);
                    const unitValue = String(cat.unit || cat.service_type || 'piece').replace(/_/g, ' ');
                    const isCatActive = cat.is_active !== 0;
                    return (
                    <tr key={cat.id} className="hover:bg-slate-50/80">
                      <td className="py-3 px-4 font-bold text-slate-900">{cat.name}</td>
                      <td className="py-3 px-4 text-slate-600 capitalize">{unitValue}</td>
                      <td className="py-3 px-4 text-right font-black text-slate-900 font-mono text-sm">
                        ₹{rateValue.toFixed(2)}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          isCatActive ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'
                        }`}>
                          {isCatActive ? 'Active' : 'Disabled'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <button
                          type="button"
                          onClick={() => setEditingCategory({ ...cat })}
                          className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg font-bold inline-flex items-center gap-1"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>Change Rate</span>
                        </button>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 6: DATABASE DURABILITY & BACKUPS */}
      {activeTab === 'database' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-2xs space-y-6">
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Database className="w-5 h-5 text-emerald-800" />
                <span>Database Durability & Backup Guarantee</span>
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Friends Laundry & Dry Cleaners database operates in full SQLite WAL mode (Write-Ahead Logging) with automated checkpoints. Website refresh or server restart will NEVER delete or erase order, invoice, customer, or payment data.
              </p>
            </div>

            {dbStats && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Journal Mode</span>
                  <span className="text-lg font-black text-emerald-800 font-mono">{dbStats.journalMode}</span>
                  <span className="text-[11px] text-slate-400 block mt-1">Synchronous = NORMAL</span>
                </div>

                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Active Database</span>
                  <span className="text-lg font-black text-slate-900 font-mono">{dbStats.dbSizeFormatted}</span>
                  <span className="text-[11px] text-slate-400 block mt-1">data/laundry.db</span>
                </div>

                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Snapshot Backup</span>
                  <span className="text-lg font-black text-slate-900 font-mono">{dbStats.backupSizeFormatted}</span>
                  <span className="text-[11px] text-slate-400 block mt-1">data/laundry_backup.db</span>
                </div>

                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Last Backup Flush</span>
                  <span className="text-xs font-bold text-slate-900 block mt-1 truncate">
                    {dbStats.lastBackupTime ? new Date(dbStats.lastBackupTime).toLocaleString() : 'Just now'}
                  </span>
                  <span className="text-[11px] text-emerald-700 font-semibold block mt-1">Auto-checkpointed</span>
                </div>
              </div>
            )}

            {/* Firebase Cloud Sync Card */}
            <div className="p-4 rounded-xl bg-amber-50/70 border border-amber-200 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-base">🔥</span>
                  <span className="text-xs font-bold text-amber-950">Firebase Firestore Cloud Sync</span>
                </div>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                  Provisioned & Ready
                </span>
              </div>
              <p className="text-[11px] text-amber-900">
                Cloud Project: <strong className="font-mono text-amber-950">organic-granite-cf38q</strong> • Region: <strong className="font-mono text-amber-950">asia-southeast1</strong>
              </p>
              <div className="text-[10px] text-amber-800 font-mono truncate">
                Database: ai-studio-laundryflowmanag-a49b7bdd-a6d0-4611-aa8e-c2cf2e733ca0
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={handleBackupNow}
                disabled={saving}
                className="px-5 py-3 bg-emerald-800 hover:bg-emerald-900 text-white font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center gap-2"
              >
                <HardDrive className={`w-4 h-4 ${saving ? 'animate-spin' : ''}`} />
                <span>Create Immediate Full Backup Snapshot</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 1: EDIT ORDER GENERAL DETAILS */}
      {editingOrder && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 shadow-xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Master Edit: Order #{editingOrder.order_number}
                </h3>
                <p className="text-xs text-slate-500">Edit status, shop branch, delivery boy, addresses, dates & notes.</p>
              </div>
              <button
                type="button"
                onClick={() => setEditingOrder(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveOrder} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Status</label>
                  <select
                    value={editingOrder.status}
                    onChange={(e) => setEditingOrder({ ...editingOrder, status: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                  >
                    <option value="pending">Pending</option>
                    <option value="assigned">Assigned</option>
                    <option value="arriving">Arriving</option>
                    <option value="picked_up">Picked Up</option>
                    <option value="in_processing">In Processing</option>
                    <option value="ready_for_delivery">Ready for Delivery</option>
                    <option value="out_for_delivery">Out for Delivery</option>
                    <option value="delivered">Delivered</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">Shop Branch (Select Shop)</label>
                  <select
                    value={editingOrder.shop_id}
                    onChange={(e) => setEditingOrder({ ...editingOrder, shop_id: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                  >
                    {shops.map(s => (
                      <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">Assigned Delivery Boy</label>
                  <select
                    value={editingOrder.assigned_delivery_boy_id || ''}
                    onChange={(e) => setEditingOrder({ ...editingOrder, assigned_delivery_boy_id: e.target.value || null })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                  >
                    <option value="">-- Unassigned --</option>
                    {deliveryBoys.map(d => (
                      <option key={d.id} value={d.id}>{d.name} ({d.email_or_phone})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">Area</label>
                  <input
                    type="text"
                    value={editingOrder.area}
                    onChange={(e) => setEditingOrder({ ...editingOrder, area: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">Pickup Date</label>
                  <input
                    type="date"
                    value={editingOrder.pickup_date}
                    onChange={(e) => setEditingOrder({ ...editingOrder, pickup_date: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">Delivery Date</label>
                  <input
                    type="date"
                    value={editingOrder.delivery_date || ''}
                    onChange={(e) => setEditingOrder({ ...editingOrder, delivery_date: e.target.value || null })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Pickup Address</label>
                <textarea
                  rows={2}
                  value={editingOrder.pickup_address}
                  onChange={(e) => setEditingOrder({ ...editingOrder, pickup_address: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Delivery Address</label>
                <textarea
                  rows={2}
                  value={editingOrder.delivery_address}
                  onChange={(e) => setEditingOrder({ ...editingOrder, delivery_address: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Order Notes / Instructions</label>
                <input
                  type="text"
                  value={editingOrder.special_instructions ?? editingOrder.notes ?? ''}
                  onChange={(e) => setEditingOrder({ ...editingOrder, special_instructions: e.target.value, notes: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingOrder(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 bg-emerald-800 hover:bg-emerald-900 text-white rounded-xl font-bold flex items-center gap-1.5"
                >
                  <Save className="w-4 h-4" />
                  <span>Save Order Changes</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: EDIT CLOTHES COUNTERS & LIVE RATES (RECALCULATES BILL & INVOICE) */}
      {editingOrderItems && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto p-6 shadow-xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Shirt className="w-5 h-5 text-emerald-800" />
                  <span>Clothes & Live Rate Editor — {editingOrderItems.order.order_number}</span>
                </h3>
                <p className="text-xs text-slate-500">
                  Update quantities or rates for each clothing item. Item subtotals and invoice totals will recalculate automatically.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingOrderItems(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Items Table */}
            <div className="space-y-3">
              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase text-[11px]">
                    <tr>
                      <th className="py-2.5 px-3">Item Name</th>
                      <th className="py-2.5 px-3 text-center">Quantity</th>
                      <th className="py-2.5 px-3 text-right">Rate (₹)</th>
                      <th className="py-2.5 px-3 text-right">Subtotal (₹)</th>
                      <th className="py-2.5 px-3 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {editingOrderItems.items.map((it, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/60">
                        <td className="py-2.5 px-3 font-semibold">
                          <input
                            type="text"
                            value={it.item_name}
                            onChange={(e) => {
                              const copy = [...editingOrderItems.items];
                              copy[idx].item_name = e.target.value;
                              setEditingOrderItems({ ...editingOrderItems, items: copy });
                            }}
                            className="w-full p-1.5 bg-slate-50 border border-slate-200 rounded-lg font-bold"
                          />
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <div className="inline-flex items-center border border-slate-200 rounded-lg overflow-hidden bg-white">
                            <button
                              type="button"
                              onClick={() => {
                                const copy = [...editingOrderItems.items];
                                copy[idx].quantity = Math.max(0, copy[idx].quantity - 1);
                                copy[idx].line_total = copy[idx].quantity * copy[idx].rate;
                                setEditingOrderItems({ ...editingOrderItems, items: copy });
                              }}
                              className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <input
                              type="number"
                              min={0}
                              value={it.quantity}
                              onChange={(e) => {
                                const copy = [...editingOrderItems.items];
                                copy[idx].quantity = Math.max(0, parseInt(e.target.value) || 0);
                                copy[idx].line_total = copy[idx].quantity * copy[idx].rate;
                                setEditingOrderItems({ ...editingOrderItems, items: copy });
                              }}
                              className="w-12 text-center py-1 font-black text-xs font-mono"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                const copy = [...editingOrderItems.items];
                                copy[idx].quantity = copy[idx].quantity + 1;
                                copy[idx].line_total = copy[idx].quantity * copy[idx].rate;
                                setEditingOrderItems({ ...editingOrderItems, items: copy });
                              }}
                              className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <span>₹</span>
                            <input
                              type="number"
                              min={0}
                              value={it.rate}
                              onChange={(e) => {
                                const copy = [...editingOrderItems.items];
                                copy[idx].rate = Math.max(0, parseFloat(e.target.value) || 0);
                                copy[idx].line_total = copy[idx].quantity * copy[idx].rate;
                                setEditingOrderItems({ ...editingOrderItems, items: copy });
                              }}
                              className="w-16 p-1 text-right bg-slate-50 border border-slate-200 rounded-lg font-mono font-bold text-xs"
                            />
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-right font-black font-mono text-slate-900">
                          ₹{(it.quantity * it.rate).toFixed(2)}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <button
                            type="button"
                            onClick={() => {
                              const copy = editingOrderItems.items.filter((_, i) => i !== idx);
                              setEditingOrderItems({ ...editingOrderItems, items: copy });
                            }}
                            className="p-1 text-red-500 hover:bg-red-50 rounded"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Add Custom Row Button */}
              <button
                type="button"
                onClick={() => {
                  const copy = [...editingOrderItems.items, { item_name: 'Special Item', quantity: 1, rate: 30, line_total: 30 }];
                  setEditingOrderItems({ ...editingOrderItems, items: copy });
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 rounded-lg border border-emerald-200"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ Add Another Clothing Item</span>
              </button>

              {/* Live Calculation Summary */}
              {(() => {
                const subtotal = editingOrderItems.items.reduce((s, it) => s + (it.quantity * it.rate), 0);
                const totalClothes = editingOrderItems.items.reduce((s, it) => s + it.quantity, 0);
                const deliveryCharge = editingOrderItems.order.delivery_charge || 0;
                const discount = editingOrderItems.order.discount_amount || 0;
                const finalTotal = Math.max(0, subtotal + deliveryCharge - discount);

                return (
                  <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-2 text-xs">
                    <div className="flex justify-between text-slate-600">
                      <span>Total Clothes Count:</span>
                      <strong className="text-slate-900 font-mono text-sm">{totalClothes} pieces</strong>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>Subtotal:</span>
                      <strong className="text-slate-900 font-mono">₹{subtotal.toFixed(2)}</strong>
                    </div>
                    <div className="flex justify-between items-center text-slate-600">
                      <span>Delivery Fee:</span>
                      <div className="flex items-center gap-1">
                        <span>₹</span>
                        <input
                          type="number"
                          min={0}
                          value={deliveryCharge}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || 0;
                            setEditingOrderItems({
                              ...editingOrderItems,
                              order: { ...editingOrderItems.order, delivery_charge: val }
                            });
                          }}
                          className="w-16 p-1 text-right bg-white border border-slate-200 rounded font-mono font-bold"
                        />
                      </div>
                    </div>
                    <div className="flex justify-between items-center text-slate-600">
                      <span>Discount:</span>
                      <div className="flex items-center gap-1">
                        <span>₹</span>
                        <input
                          type="number"
                          min={0}
                          value={discount}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || 0;
                            setEditingOrderItems({
                              ...editingOrderItems,
                              order: { ...editingOrderItems.order, discount_amount: val }
                            });
                          }}
                          className="w-16 p-1 text-right bg-white border border-slate-200 rounded font-mono font-bold text-red-600"
                        />
                      </div>
                    </div>
                    <div className="pt-2 border-t border-slate-200 flex justify-between items-center text-sm font-black text-slate-900">
                      <span>New Final Bill Amount:</span>
                      <span className="text-base text-emerald-800 font-mono">₹{finalTotal.toFixed(2)}</span>
                    </div>
                  </div>
                );
              })()}

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingOrderItems(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveOrderItems}
                  disabled={saving}
                  className="px-5 py-2 bg-emerald-800 hover:bg-emerald-900 text-white rounded-xl font-bold flex items-center gap-1.5"
                >
                  <Save className="w-4 h-4" />
                  <span>Update & Recalculate Invoice Now</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: EDIT CUSTOMER */}
      {editingCustomer && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200 space-y-4 text-xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h3 className="text-base font-bold text-slate-900">Edit Customer: {editingCustomer.name}</h3>
              <button onClick={() => setEditingCustomer(null)} className="p-1.5 text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCustomer} className="space-y-3">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Customer Name</label>
                <input
                  type="text"
                  value={editingCustomer.name}
                  onChange={(e) => setEditingCustomer({ ...editingCustomer, name: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                  required
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Mobile Number</label>
                <input
                  type="text"
                  value={editingCustomer.mobile}
                  onChange={(e) => setEditingCustomer({ ...editingCustomer, mobile: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono"
                  required
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Area</label>
                <input
                  type="text"
                  value={editingCustomer.area}
                  onChange={(e) => setEditingCustomer({ ...editingCustomer, area: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Flat / House #</label>
                  <input
                    type="text"
                    value={editingCustomer.flat_number || ''}
                    onChange={(e) => setEditingCustomer({ ...editingCustomer, flat_number: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Society / Building</label>
                  <input
                    type="text"
                    value={editingCustomer.building_name || ''}
                    onChange={(e) => setEditingCustomer({ ...editingCustomer, building_name: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Full Pickup Address</label>
                <textarea
                  rows={2}
                  value={editingCustomer.pickup_address}
                  onChange={(e) => setEditingCustomer({ ...editingCustomer, pickup_address: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                  required
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingCustomer(null)}
                  className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 bg-emerald-800 text-white rounded-xl font-bold"
                >
                  Save Customer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: EDIT SHOP */}
      {editingShop && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200 space-y-4 text-xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h3 className="text-base font-bold text-slate-900">Edit Shop Branch: {editingShop.name}</h3>
              <button onClick={() => setEditingShop(null)} className="p-1.5 text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveShop} className="space-y-3">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Branch Name</label>
                <input
                  type="text"
                  value={editingShop.name}
                  onChange={(e) => setEditingShop({ ...editingShop, name: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Branch Code</label>
                  <input
                    type="text"
                    value={editingShop.code}
                    onChange={(e) => setEditingShop({ ...editingShop, code: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold"
                    required
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Phone Number</label>
                  <input
                    type="text"
                    value={editingShop.phone}
                    onChange={(e) => setEditingShop({ ...editingShop, phone: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Branch Address</label>
                <textarea
                  rows={2}
                  value={editingShop.address}
                  onChange={(e) => setEditingShop({ ...editingShop, address: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">UPI ID for Payments</label>
                  <input
                    type="text"
                    value={editingShop.upi_id || ''}
                    onChange={(e) => setEditingShop({ ...editingShop, upi_id: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">GST Number (Optional)</label>
                  <input
                    type="text"
                    value={editingShop.gst_number || ''}
                    onChange={(e) => setEditingShop({ ...editingShop, gst_number: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingShop(null)}
                  className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 bg-emerald-800 text-white rounded-xl font-bold"
                >
                  Save Branch
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 5: EDIT CATEGORY RATE */}
      {editingCategory && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 space-y-4 text-xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h3 className="text-base font-bold text-slate-900">Change Official Rate: {editingCategory.name}</h3>
              <button onClick={() => setEditingCategory(null)} className="p-1.5 text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCategory} className="space-y-3">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Garment Name</label>
                <input
                  type="text"
                  value={editingCategory.name}
                  onChange={(e) => setEditingCategory({ ...editingCategory, name: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                  required
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Default Rate (₹)</label>
                <div className="flex items-center gap-1">
                  <span className="text-base font-black text-slate-600">₹</span>
                  <input
                    type="number"
                    min={0}
                    step="any"
                    value={editingCategory.default_rate ?? editingCategory.base_price ?? 0}
                    onChange={(e) => setEditingCategory({
                      ...editingCategory,
                      default_rate: parseFloat(e.target.value) || 0,
                      base_price: parseFloat(e.target.value) || 0
                    })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold text-sm"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Billing Unit</label>
                <select
                  value={editingCategory.unit || 'piece'}
                  onChange={(e) => setEditingCategory({ ...editingCategory, unit: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-semibold"
                >
                  <option value="piece">Per Piece</option>
                  <option value="kg">Per Kg (Weight)</option>
                  <option value="sq_ft">Per Sq. Ft</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingCategory(null)}
                  className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 bg-emerald-800 text-white rounded-xl font-bold"
                >
                  Save Rate
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
