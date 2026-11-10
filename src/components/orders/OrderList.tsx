import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext.tsx';
import type { Order, OrderStatus, User, Shop } from '../../types/index.ts';
import { 
  Package, 
  Search, 
  Plus, 
  MapPin, 
  Phone, 
  Clock, 
  Camera, 
  Receipt, 
  Send, 
  Truck, 
  Filter, 
  RefreshCw, 
  Eye, 
  IndianRupee, 
  Scale,
  Store,
  Building2,
  Check,
  AlertTriangle
} from 'lucide-react';
import { NewOrderModal } from './NewOrderModal.tsx';
import { OrderDetailModal } from './OrderDetailModal.tsx';
import { InvoiceModal } from '../invoices/InvoiceModal.tsx';

export const OrderList: React.FC = () => {
  const { token, user, t, activeShopId, setActiveShopId, shops: authShops } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [deliveryBoys, setDeliveryBoys] = useState<User[]>([]);
  const [localShops, setLocalShops] = useState<Shop[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dueOnlyFilter, setDueOnlyFilter] = useState<boolean>(false);
  const [selectedShopId, setSelectedShopId] = useState<string>(() => activeShopId || '');

  // Modals
  const [showNewOrder, setShowNewOrder] = useState(false);
  const [newOrderMode, setNewOrderMode] = useState<'pickup' | 'delivery'>('pickup');
  const [viewOrderId, setViewOrderId] = useState<string | null>(null);
  const [viewInvoiceId, setViewInvoiceId] = useState<string | null>(null);

  const fetchMetadata = useCallback(async () => {
    if (!token) return;
    try {
      const [resShops, resBoys] = await Promise.all([
        fetch('/api/shops', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/delivery-boys', { headers: { Authorization: `Bearer ${token}` } })
      ]);

      let loadedShops: Shop[] = [];
      if (resShops.ok) {
        const d = await resShops.json();
        loadedShops = d.shops || [];
        setLocalShops(loadedShops);
      }
      if (resBoys.ok) {
        const d = await resBoys.json();
        setDeliveryBoys(d.deliveryBoys || []);
      }

      // Ensure valid shop selected (NO 'all' to prevent mixing)
      setSelectedShopId(curr => {
        if (user?.role === 'shop' && user.shop_id) {
          return user.shop_id;
        }
        if (curr && loadedShops.some(s => s.id === curr)) {
          return curr;
        }
        if (activeShopId && loadedShops.some(s => s.id === activeShopId)) {
          return activeShopId;
        }
        if (loadedShops.length > 0) {
          return loadedShops[0].id;
        }
        return '';
      });
    } catch (e) {
      console.error('Failed to load metadata', e);
    }
  }, [token, user?.role, user?.shop_id, activeShopId]);

  const fetchOrders = useCallback(async () => {
    if (!token) return;
    const targetShop = user?.role === 'shop' ? user.shop_id : selectedShopId;
    if (!targetShop) return;

    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (dueOnlyFilter) params.set('due_only', 'true');
      params.set('shop_id', targetShop);

      const res = await fetch(`/api/orders?${params.toString()}`, { 
        headers: { Authorization: `Bearer ${token}` } 
      });

      if (res.ok) {
        const d = await res.json();
        setOrders(d.orders || []);
      }
    } catch (e) {
      console.error('Failed to load orders', e);
    } finally {
      setLoading(false);
    }
  }, [token, user?.role, user?.shop_id, selectedShopId, statusFilter, dueOnlyFilter]);

  useEffect(() => {
    fetchMetadata();
  }, [fetchMetadata]);

  useEffect(() => {
    if (selectedShopId) {
      fetchOrders();
    }
  }, [selectedShopId, fetchOrders]);

  useEffect(() => {
    const onOrdersUpdated = () => {
      if (selectedShopId) fetchOrders();
    };
    window.addEventListener('laundry-orders-updated', onOrdersUpdated);
    return () => window.removeEventListener('laundry-orders-updated', onOrdersUpdated);
  }, [selectedShopId, fetchOrders]);

  useEffect(() => {
    if (activeShopId && activeShopId !== selectedShopId) {
      setSelectedShopId(activeShopId);
    }
  }, [activeShopId]);

  const effectiveShops = localShops.length > 0 ? localShops : authShops;
  const currentShop = effectiveShops.find(s => s.id === (user?.role === 'shop' ? user.shop_id : selectedShopId));

  const handleSelectShop = (shopId: string) => {
    setSelectedShopId(shopId);
    setActiveShopId(shopId);
  };

  const filtered = orders.filter(o => 
    o.order_number.toLowerCase().includes(search.toLowerCase()) ||
    o.customer_name.toLowerCase().includes(search.toLowerCase()) ||
    o.customer_mobile.includes(search) ||
    (o.area && o.area.toLowerCase().includes(search.toLowerCase())) ||
    (o.delivery_boy_name && o.delivery_boy_name.toLowerCase().includes(search.toLowerCase()))
  );

  const totalShopOutstanding = orders.reduce((acc, curr) => acc + (curr.outstanding_amount || 0), 0);
  const dueOrdersCount = orders.filter(o => (o.outstanding_amount || 0) > 0).length;

  const getStatusBadge = (status: OrderStatus) => {
    switch (status) {
      case 'pending':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-800 border border-slate-300">Pending</span>;
      case 'assigned':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300">Assigned</span>;
      case 'arriving':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800 border border-blue-300 animate-pulse">Arriving</span>;
      case 'picked_up':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-100 text-indigo-800 border border-indigo-300">Picked Up</span>;
      case 'in_processing':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-100 text-purple-800 border border-purple-300">In Processing</span>;
      case 'ready_for_delivery':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-teal-100 text-teal-800 border border-teal-300">Ready</span>;
      case 'out_for_delivery':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800 border border-blue-300">Out For Delivery</span>;
      case 'delivered':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">Delivered</span>;
      case 'failed':
      case 'cancelled':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-800 border border-red-300">{status}</span>;
      default:
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700">{status}</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-3xl border border-sky-100 shadow-sm shadow-sky-500/5">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
              <Package className="w-6 h-6 text-sky-600" />
              <span>Shop-Wise Orders</span>
            </h1>
            <span className="text-xs font-black px-3 py-1 rounded-full bg-sky-100 text-sky-800 border border-sky-200">
              {orders.length} Total Orders
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Manage orders branch by branch. Each branch is strictly segregated with zero mixing.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={fetchOrders}
            className="p-2.5 text-slate-600 hover:text-sky-900 bg-sky-50 hover:bg-sky-100 rounded-2xl transition-colors border border-sky-100 cursor-pointer shadow-xs"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          {(user?.role === 'admin' || user?.role === 'shop') && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => { setNewOrderMode('pickup'); setShowNewOrder(true); }}
                className="flex items-center gap-1.5 px-3.5 py-2.5 bg-gradient-to-r from-sky-500 to-sky-600 hover:from-sky-600 hover:to-sky-700 text-white text-xs font-black rounded-2xl shadow-sm shadow-sky-500/25 transition-all cursor-pointer active:scale-98"
              >
                <Plus className="w-4 h-4" />
                <span>+ Pickup</span>
              </button>

              <button
                type="button"
                onClick={() => { setNewOrderMode('delivery'); setShowNewOrder(true); }}
                className="flex items-center gap-1.5 px-3.5 py-2.5 bg-[#0369A1] hover:bg-[#025684] text-white text-xs font-black rounded-2xl shadow-sm transition-all cursor-pointer active:scale-98"
              >
                <Truck className="w-4 h-4 text-sky-200" />
                <span>+ Delivery</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Prominent Shop Navigation Tabs (Only for Admin; Shop staff sees their shop) */}
      {user?.role === 'admin' && effectiveShops.length > 0 && (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-black uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
              <Store className="w-4 h-4 text-sky-600" />
              <span>Select Shop Branch</span>
            </span>
            <span className="text-[11px] font-bold text-sky-700 bg-sky-50 px-2.5 py-0.5 rounded-full border border-sky-200">
              Zero Mixing • Dedicated Orders
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {effectiveShops.map(shop => {
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
                    <span className={`text-xs font-black ${isSelected ? 'text-sky-100' : 'text-sky-700'}`}>
                      {isSelected ? 'Active Selected' : 'Click to View'}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Active Selected Branch Banner */}
      <div className="p-4 sm:p-5 bg-gradient-to-r from-sky-50 via-white to-sky-50 border border-sky-200 rounded-3xl flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xs">
        <div className="flex items-start sm:items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-sky-600 to-sky-400 text-white flex items-center justify-center font-black shadow-md shadow-sky-500/25 shrink-0 mt-0.5 sm:mt-0">
            <Building2 className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-black uppercase tracking-wider text-sky-800 bg-sky-100 px-2 py-0.5 rounded-full border border-sky-200">
                Active Selected Branch
              </span>
              {currentShop?.code && (
                <span className="text-[10px] font-bold text-slate-500">
                  {currentShop.code}
                </span>
              )}
            </div>
            <h2 className="text-lg font-black text-slate-900 tracking-tight mt-0.5">
              {currentShop?.name || 'Friends Laundry & Dry Cleaners'}
            </h2>
            <div className="flex items-center gap-3 text-xs text-slate-600 mt-0.5 flex-wrap">
              {currentShop?.address && (
                <span className="flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                  <span>{currentShop.address}</span>
                </span>
              )}
              {currentShop?.phone && (
                <span className="flex items-center gap-1 font-bold text-slate-700">
                  <Phone className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                  <span>{currentShop.phone}</span>
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 md:border-l border-sky-200 md:pl-5">
          <div>
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider block">
              Orders in This Branch
            </span>
            <span className="text-xl font-black text-slate-900">
              {orders.length} Orders
            </span>
          </div>

          <div className="border-l border-sky-200 pl-4">
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider block">
              Branch Due Balance
            </span>
            <span className="text-xl font-black text-rose-600">
              ₹{totalShopOutstanding.toFixed(2)} ({dueOrdersCount})
            </span>
          </div>
        </div>
      </div>

      {/* Filter Tabs & Search */}
      <div className="space-y-3">
        {/* Horizontal Status Pills with Dedicated Due Only Button */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
          {/* Quick toggle for Due Balance Only */}
          <button
            type="button"
            onClick={() => setDueOnlyFilter(prev => !prev)}
            className={`px-3.5 py-2 rounded-2xl font-black whitespace-nowrap transition-all border flex items-center gap-1.5 cursor-pointer ${
              dueOnlyFilter
                ? 'bg-rose-600 text-white border-rose-600 shadow-md shadow-rose-600/30'
                : 'bg-rose-50 text-rose-800 border-rose-200 hover:bg-rose-100'
            }`}
          >
            <IndianRupee className="w-3.5 h-3.5" />
            <span>🔴 Due Balance Only ({dueOrdersCount})</span>
          </button>

          {[
            { id: 'all', label: 'All' },
            { id: 'pending', label: 'Pending' },
            { id: 'assigned', label: 'Assigned' },
            { id: 'arriving', label: 'Arriving' },
            { id: 'picked_up', label: 'Picked Up' },
            { id: 'in_processing', label: 'In Processing' },
            { id: 'ready_for_delivery', label: 'Ready' },
            { id: 'out_for_delivery', label: 'Out for Delivery' },
            { id: 'delivered', label: 'Delivered' }
          ].map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setStatusFilter(tab.id)}
              className={`px-3.5 py-2 rounded-2xl font-black whitespace-nowrap transition-all border cursor-pointer ${
                statusFilter === tab.id
                  ? 'bg-sky-600 text-white border-sky-600 shadow-sm shadow-sky-500/20'
                  : 'bg-white text-slate-700 border-sky-100 hover:bg-sky-50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3.5 top-3.5 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by Order #, Customer, Mobile, Address, or Delivery Boy..."
            className="w-full pl-10 pr-4 py-3 bg-white border border-sky-100 rounded-2xl text-xs font-medium text-slate-900 focus:ring-2 focus:ring-sky-400 shadow-xs"
          />
        </div>
      </div>

      {/* Order Cards Grid */}
      {loading ? (
        <div className="bg-white rounded-3xl border border-sky-100 p-12 text-center shadow-sm">
          <div className="w-8 h-8 border-4 border-sky-600 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
          <p className="text-xs font-bold text-slate-600">Loading branch orders...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-3xl border border-sky-100 p-12 text-center shadow-sm">
          <Package className="w-12 h-12 text-sky-200 mx-auto mb-3" />
          <h3 className="text-base font-extrabold text-slate-800">No Orders Found for This Branch</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1 mb-4">
            {dueOnlyFilter 
              ? 'There are no pending due balance orders for this branch.' 
              : 'No orders match the selected filters for this branch. Create a new order.'}
          </p>
          {(user?.role === 'admin' || user?.role === 'shop') && (
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => { setNewOrderMode('pickup'); setShowNewOrder(true); }}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-black bg-sky-500 text-white rounded-xl shadow-sm shadow-sky-500/20 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>+ Create Pickup</span>
              </button>
              <button
                type="button"
                onClick={() => { setNewOrderMode('delivery'); setShowNewOrder(true); }}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-black bg-[#0369A1] text-white rounded-xl shadow-sm cursor-pointer"
              >
                <Truck className="w-4 h-4" />
                <span>+ Create Delivery</span>
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(order => {
            const photoCount = (order.has_bag_photo || 0) + (order.has_clothes_photo || 0);
            const hasPickupPhotosField = Array.isArray(order.pickup_photos)
              ? order.pickup_photos.length > 0
              : Boolean(typeof order.pickup_photos === 'string' && order.pickup_photos.trim() && order.pickup_photos.trim() !== '[]');
            const hasPickupPhoto = photoCount > 0 || hasPickupPhotosField;
            const hasDue = (order.outstanding_amount || 0) > 0;

            return (
              <div
                key={order.id}
                className="bg-white rounded-3xl border border-sky-100 p-5 shadow-xs hover:border-sky-300 hover:shadow-sm transition-all flex flex-col justify-between"
              >
                <div>
                  {/* Top header */}
                  <div className="flex items-start justify-between gap-2 mb-2.5">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-black text-sm text-sky-900 bg-sky-50 px-2 py-0.5 rounded-lg border border-sky-200">
                          {order.order_number}
                        </span>
                        {getStatusBadge(order.status)}
                      </div>
                      <h3 className="text-base font-black text-slate-900 leading-tight mt-1.5">
                        {order.customer_name}
                      </h3>
                      <div className="text-xs font-semibold text-slate-600 flex items-center gap-1.5 mt-0.5">
                        <Phone className="w-3.5 h-3.5 text-sky-600" />
                        <a href={`tel:${order.customer_mobile}`} className="hover:underline font-bold text-slate-700">
                          {order.customer_mobile}
                        </a>
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="text-[10px] font-bold text-slate-500 block uppercase">Total Bill</span>
                      <span className="text-lg font-black text-slate-950">
                        ₹{order.final_total.toFixed(2)}
                      </span>
                    </div>
                  </div>

                  {/* Details box */}
                  <div className="p-3 bg-sky-50/50 rounded-2xl border border-sky-100 text-xs space-y-1.5 my-3">
                    <div className="flex justify-between items-center text-slate-600">
                      <span>Branch:</span>
                      <span className="font-bold text-slate-800">{order.shop_name}</span>
                    </div>

                    <div className="flex items-start gap-1.5 text-slate-700">
                      <MapPin className="w-3.5 h-3.5 text-sky-600 shrink-0 mt-0.5" />
                      <div className="line-clamp-2">
                        {order.flat_number && <span className="font-bold">{order.flat_number}, {order.building_name} - </span>}
                        <span>{order.pickup_address}</span>
                        {order.area && <span className="text-sky-700 font-bold"> ({order.area})</span>}
                      </div>
                    </div>

                    <div className="flex justify-between items-center pt-1 border-t border-sky-100 text-slate-600">
                      <span>Pickup Date:</span>
                      <span className="font-bold text-slate-900">{order.pickup_date}</span>
                    </div>

                    <div className="flex justify-between items-center text-slate-600">
                      <span>Delivery Boy:</span>
                      <span className="font-bold text-slate-900">
                        {order.delivery_boy_name || 'Not Assigned'}
                      </span>
                    </div>
                  </div>

                  {/* Badges: Photos, Weight & Due */}
                  <div className="flex flex-wrap items-center gap-1.5 mb-3.5">
                    {(Boolean(order.pickup_weight_kg) || Boolean(order.pickup_weight_grams) || Boolean(order.pickup_weight_total_grams)) && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-xs font-black bg-sky-100 text-sky-900 border border-sky-300">
                        <Scale className="w-3 h-3 text-sky-600" />
                        <span>{order.pickup_weight_kg || 0} kg {order.pickup_weight_grams || 0} g</span>
                      </span>
                    )}

                    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-xs font-bold ${
                      hasPickupPhoto 
                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' 
                        : 'bg-amber-100 text-amber-900 border border-amber-200'
                    }`}>
                      <Camera className="w-3 h-3" />
                      {hasPickupPhoto ? (photoCount > 1 ? `${photoCount} Photos Attached` : 'Photo Attached') : 'Photo Pending'}
                    </span>

                    {hasDue ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-xs font-black bg-rose-100 text-rose-800 border border-rose-200">
                        Due: ₹{order.outstanding_amount.toFixed(2)}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        Paid Full
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="pt-3 border-t border-sky-100 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setViewOrderId(order.id)}
                    className="flex-1 py-2 px-3 text-xs font-bold text-slate-800 bg-sky-50 hover:bg-sky-100 rounded-xl transition-colors flex items-center justify-center gap-1.5 border border-sky-100 cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5 text-sky-600" />
                    <span>View Details</span>
                  </button>

                  {order.invoice_number && (
                    <button
                      type="button"
                      onClick={() => setViewInvoiceId(order.id)}
                      className="py-2 px-3 text-xs font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 rounded-xl border border-emerald-200 transition-colors flex items-center justify-center gap-1 cursor-pointer"
                      title="View Invoice"
                    >
                      <Receipt className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Invoice</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* New Order Modal */}
      {showNewOrder && (
        <NewOrderModal
          initialMode={newOrderMode}
          onClose={() => setShowNewOrder(false)}
          onSuccess={(id) => {
            setShowNewOrder(false);
            setStatusFilter('all');
            setSearch('');
            fetchOrders();
            setViewOrderId(id);
          }}
        />
      )}

      {/* Order Detail Modal */}
      {viewOrderId && (
        <OrderDetailModal
          orderId={viewOrderId}
          onClose={() => setViewOrderId(null)}
          onUpdate={fetchOrders}
        />
      )}

      {/* Invoice Modal */}
      {viewInvoiceId && (
        <InvoiceModal
          orderIdOrInvoiceId={viewInvoiceId}
          onClose={() => setViewInvoiceId(null)}
        />
      )}
    </div>
  );
};
