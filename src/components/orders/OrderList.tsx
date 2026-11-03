import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.tsx';
import type { Order, OrderStatus, User } from '../../types/index.ts';
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
  Scale
} from 'lucide-react';
import { NewOrderModal } from './NewOrderModal.tsx';
import { OrderDetailModal } from './OrderDetailModal.tsx';
import { InvoiceModal } from '../invoices/InvoiceModal.tsx';

export const OrderList: React.FC = () => {
  const { token, user, t } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [deliveryBoys, setDeliveryBoys] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Modals
  const [showNewOrder, setShowNewOrder] = useState(false);
  const [newOrderMode, setNewOrderMode] = useState<'pickup' | 'delivery'>('pickup');
  const [viewOrderId, setViewOrderId] = useState<string | null>(null);
  const [viewInvoiceId, setViewInvoiceId] = useState<string | null>(null);

  const fetchOrders = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.set('status', statusFilter);

      const [resOrders, resBoys] = await Promise.all([
        fetch(`/api/orders?${params.toString()}`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/delivery-boys', { headers: { Authorization: `Bearer ${token}` } })
      ]);

      if (resOrders.ok) {
        const d = await resOrders.json();
        setOrders(d.orders);
      }
      if (resBoys.ok) {
        const d = await resBoys.json();
        setDeliveryBoys(d.deliveryBoys);
      }
    } catch (e) {
      console.error('Failed to load orders', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, [statusFilter]);

  const filtered = orders.filter(o => 
    o.order_number.toLowerCase().includes(search.toLowerCase()) ||
    o.customer_name.toLowerCase().includes(search.toLowerCase()) ||
    o.customer_mobile.includes(search) ||
    o.area.toLowerCase().includes(search.toLowerCase()) ||
    (o.delivery_boy_name && o.delivery_boy_name.toLowerCase().includes(search.toLowerCase()))
  );

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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">
              {t('orders')} • Pickup & Delivery Orders
            </h1>
            <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-800">
              {orders.length} Total
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Track order lifecycle from pickup scheduling, two mandatory photos, clothing counters, invoices to delivery.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={fetchOrders}
            className="p-2.5 text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors border border-slate-200"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          {(user?.role === 'admin' || user?.role === 'shop') && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => { setNewOrderMode('pickup'); setShowNewOrder(true); }}
                className="flex items-center gap-1.5 px-3.5 py-2.5 bg-sky-500 hover:bg-sky-600 text-white text-xs font-black rounded-2xl shadow-sm shadow-sky-500/20 transition-all"
              >
                <Plus className="w-4 h-4" />
                <span>Create Pickup</span>
              </button>

              <button
                type="button"
                onClick={() => { setNewOrderMode('delivery'); setShowNewOrder(true); }}
                className="flex items-center gap-1.5 px-3.5 py-2.5 bg-[#0369A1] hover:bg-[#025684] text-white text-xs font-black rounded-2xl shadow-sm transition-all"
              >
                <Truck className="w-4 h-4" />
                <span>Create Delivery</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Filter Tabs & Search */}
      <div className="space-y-3">
        {/* Horizontal Status Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
          {[
            { id: 'all', label: 'All Orders' },
            { id: 'pending', label: 'Pending' },
            { id: 'assigned', label: 'Assigned' },
            { id: 'arriving', label: 'Arriving' },
            { id: 'picked_up', label: 'Picked Up' },
            { id: 'in_processing', label: 'In Processing' },
            { id: 'ready_for_delivery', label: 'Ready' },
            { id: 'out_for_delivery', label: 'Out For Delivery' },
            { id: 'delivered', label: 'Delivered' }
          ].map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setStatusFilter(tab.id)}
              className={`px-3.5 py-2 rounded-2xl font-black whitespace-nowrap transition-all border ${
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
            placeholder="Search orders by order number (ORD-...), customer, mobile, area, or delivery boy..."
            className="w-full pl-10 pr-4 py-3 bg-white border border-sky-100 rounded-2xl text-xs font-medium text-slate-900 focus:ring-2 focus:ring-sky-400 shadow-xs"
          />
        </div>
      </div>

      {/* Order Cards Grid */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-3xl border border-sky-100 p-12 text-center shadow-sm">
          <Package className="w-12 h-12 text-sky-200 mx-auto mb-3" />
          <h3 className="text-base font-extrabold text-slate-800">No Orders Found</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1 mb-4">
            No orders match the current status filter. Create a new pickup or delivery order.
          </p>
          {(user?.role === 'admin' || user?.role === 'shop') && (
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => { setNewOrderMode('pickup'); setShowNewOrder(true); }}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-black bg-sky-500 text-white rounded-xl shadow-sm shadow-sky-500/20"
              >
                <Plus className="w-4 h-4" />
                <span>Create Pickup</span>
              </button>
              <button
                type="button"
                onClick={() => { setNewOrderMode('delivery'); setShowNewOrder(true); }}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-black bg-[#0369A1] text-white rounded-xl shadow-sm"
              >
                <Truck className="w-4 h-4" />
                <span>Create Delivery</span>
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(order => {
            const hasBothPhotos = (order.has_bag_photo || 0) > 0 && (order.has_clothes_photo || 0) > 0;
            const hasDue = order.outstanding_amount > 0;

            return (
              <div
                key={order.id}
                className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs hover:shadow-xs transition-shadow flex flex-col justify-between"
              >
                <div>
                  {/* Top header */}
                  <div className="flex items-start justify-between gap-2 mb-2.5">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-black text-sm text-emerald-850 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                          {order.order_number}
                        </span>
                        {getStatusBadge(order.status)}
                      </div>
                      <h3 className="text-lg font-black text-slate-900 leading-tight mt-1.5">
                        {order.customer_name}
                      </h3>
                      <div className="text-sm font-semibold text-slate-600 flex items-center gap-1.5 mt-0.5">
                        <Phone className="w-3.5 h-3.5 text-slate-400" />
                        <span>{order.customer_mobile}</span>
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="text-xs font-bold text-slate-500 block uppercase">Bill Total</span>
                      <span className="text-lg sm:text-xl font-black text-slate-950">
                        ₹{order.final_total.toFixed(2)}
                      </span>
                    </div>
                  </div>

                  {/* Details box */}
                  <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-150 text-sm space-y-2 my-3">
                    <div className="flex items-start gap-2 text-slate-700">
                      <MapPin className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                      <div>
                        {order.flat_number && <span className="font-bold">{order.flat_number}, {order.building_name} - </span>}
                        <span className="line-clamp-2 font-medium">{order.pickup_address}</span>
                        <div className="text-xs font-black text-emerald-850 mt-0.5">Area: {order.area}</div>
                      </div>
                    </div>

                    <div className="flex justify-between items-center pt-1.5 border-t border-slate-200 text-slate-700">
                      <span className="font-medium">Pickup:</span>
                      <span className="font-bold text-slate-900">{order.pickup_date}</span>
                    </div>

                    <div className="flex justify-between items-center text-slate-700">
                      <span className="font-medium">Assigned Driver:</span>
                      <span className="font-black text-slate-900">
                        {order.delivery_boy_name || 'Unassigned'}
                      </span>
                    </div>
                  </div>

                  {/* Badges: Photos, Weight & Due */}
                  <div className="flex flex-wrap items-center gap-2 mb-3.5">
                    {(Boolean(order.pickup_weight_kg) || Boolean(order.pickup_weight_grams) || Boolean(order.pickup_weight_total_grams)) && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-black bg-sky-100 text-sky-900 border border-sky-300">
                        <Scale className="w-3.5 h-3.5 text-sky-600" />
                        <span>{order.pickup_weight_kg || 0} kg {order.pickup_weight_grams || 0} g</span>
                      </span>
                    )}

                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold ${
                      hasBothPhotos 
                        ? 'bg-emerald-100 text-emerald-850 border border-emerald-200' 
                        : 'bg-amber-100 text-amber-900 border border-amber-200'
                    }`}>
                      <Camera className="w-3.5 h-3.5" />
                      {hasBothPhotos ? '2 Photos Attached' : 'Photos Pending'}
                    </span>

                    {hasDue ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-black bg-rose-100 text-rose-800 border border-rose-200">
                        Due: ₹{order.outstanding_amount.toFixed(2)}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-100 text-slate-700">
                        Paid
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2.5">
                  <button
                    type="button"
                    onClick={() => setViewOrderId(order.id)}
                    className="flex-1 py-2.5 px-4 text-sm font-bold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors flex items-center justify-center gap-2"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>View Details</span>
                  </button>

                  {order.invoice_number && (
                    <button
                      type="button"
                      onClick={() => setViewInvoiceId(order.id)}
                      className="py-2 px-3 text-xs font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 rounded-xl border border-emerald-200 transition-colors flex items-center justify-center gap-1"
                      title="View & Print Invoice"
                    >
                      <Receipt className="w-3.5 h-3.5" />
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
