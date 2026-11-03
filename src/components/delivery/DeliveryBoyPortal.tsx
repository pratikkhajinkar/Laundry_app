import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext.tsx';
import type { Order, ClothingCategory, DuePaymentItem } from '../../types/index.ts';
import { 
  Truck, 
  MapPin, 
  Phone, 
  Camera, 
  Upload, 
  CheckCircle2, 
  AlertCircle, 
  Navigation, 
  Plus, 
  Minus, 
  IndianRupee, 
  Receipt, 
  RefreshCw, 
  ShieldCheck, 
  Sparkles, 
  Send, 
  Printer, 
  Scale, 
  Zap, 
  Package,
  Search,
  HandCoins,
  FileText,
  Clock,
  ArrowRight
} from 'lucide-react';
import { InvoiceModal } from '../invoices/InvoiceModal.tsx';
import { DuePaymentCollectionModal } from '../payments/DuePaymentCollectionModal.tsx';
import { QuickOrderModal } from '../orders/QuickOrderModal.tsx';
import { PickupProofModal } from '../orders/PickupProofModal.tsx';
import { DeliveryRealBillModal } from './DeliveryRealBillModal.tsx';
import { syncOrderToFirestore } from '../../services/firestoreSync.ts';

export const DeliveryBoyPortal: React.FC = () => {
  const { user, token, toggleAvailability } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [categories, setCategories] = useState<ClothingCategory[]>([]);
  const [duePayments, setDuePayments] = useState<DuePaymentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'pickups' | 'deliveries' | 'dues' | 'history'>('pickups');

  // Search filter for Due Payments tab
  const [dueSearch, setDueSearch] = useState('');
  const [loadingDues, setLoadingDues] = useState(false);

  // Quick Order Modal
  const [showQuickOrderModal, setShowQuickOrderModal] = useState(false);

  // Delivery Boy Real Bill Modal state
  const [realBillOrder, setRealBillOrder] = useState<Order | null>(null);

  // Active Order Modal states
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [modalMode, setModalMode] = useState<'pickup_flow' | 'payment_flow' | null>(null);

  // WhatsApp Bill Preview Modal states
  const [showWaPreviewModal, setShowWaPreviewModal] = useState(false);
  const [previewData, setPreviewData] = useState<{ order: Order; items: any[]; invoice: any; payments: any[] } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [waSending, setWaSending] = useState(false);
  const [waHint, setWaHint] = useState<string | null>(null);
  const [showPrintInvoiceId, setShowPrintInvoiceId] = useState<string | null>(null);

  // Pickup Proof Modal states
  const [showPickupProofModal, setShowPickupProofModal] = useState(false);
  const [proofModalOrder, setProofModalOrder] = useState<Order | null>(null);

  // Mandatory Single Pickup Photo state
  const [pickupPhoto, setPickupPhoto] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  // Shortcut Piece Counts & Proof Notes for doorstep handover
  const [washCount, setWashCount] = useState<number>(0);
  const [drycleanCount, setDrycleanCount] = useState<number>(0);
  const [ironCount, setIronCount] = useState<number>(0);
  const [otherCount, setOtherCount] = useState<number>(0);
  const [pickupProofNotes, setPickupProofNotes] = useState<string>('');

  // Optional Weight Entry (Kg + Grams) state for pickup
  const [pickupWeightKg, setPickupWeightKg] = useState<number>(0);
  const [pickupWeightGrams, setPickupWeightGrams] = useState<number>(0);
  const [submittingPickup, setSubmittingPickup] = useState(false);

  // Due Payment Collection Modal state
  const [dueCollectionOrder, setDueCollectionOrder] = useState<Order | null>(null);

  const fetchOrders = async () => {
    try {
      setLoading(true);
      const [resOrders, resCats] = await Promise.all([
        fetch('/api/orders', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/clothing-categories', { headers: { Authorization: `Bearer ${token}` } })
      ]);

      if (resOrders.ok) {
        const d = await resOrders.json();
        setOrders(d.orders || []);
      }
      if (resCats.ok) {
        const d = await resCats.json();
        setCategories(d.categories || []);
      }
    } catch (e) {
      console.error('Failed to fetch delivery boy jobs', e);
    } finally {
      setLoading(false);
    }
  };

  const fetchDuePayments = async () => {
    try {
      setLoadingDues(true);
      const res = await fetch('/api/due-payments', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const d = await res.json();
        setDuePayments(d.duePayments || []);
      }
    } catch (e) {
      console.error('Failed to fetch due payments', e);
    } finally {
      setLoadingDues(false);
    }
  };

  useEffect(() => {
    fetchOrders();
    fetchDuePayments();
    const interval = setInterval(() => {
      fetchOrders();
      fetchDuePayments();
    }, 20000);
    return () => clearInterval(interval);
  }, []);

  const openPickupModal = async (order: Order) => {
    setSelectedOrder(order);
    setModalMode('pickup_flow');
    setPhotoError(null);
    setPickupPhoto(null);
    setWashCount(order.wash_count || 0);
    setDrycleanCount(order.dryclean_count || 0);
    setIronCount(order.iron_count || 0);
    setOtherCount(0);
    setPickupWeightKg(order.pickup_weight_kg || 0);
    setPickupWeightGrams(order.pickup_weight_grams || 0);
    setPickupProofNotes(order.pickup_proof_notes || '');

    // Fetch existing photos or items if any
    try {
      const res = await fetch(`/api/orders/${order.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const d = await res.json();
        if (d.photos && d.photos.length > 0) {
          setPickupPhoto(d.photos[0].file_url);
        } else if (d.order?.pickup_photos) {
          try {
            const arr = JSON.parse(d.order.pickup_photos);
            if (Array.isArray(arr) && arr.length > 0) setPickupPhoto(arr[0]);
          } catch {}
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handlePhotoUpload = async (file: File) => {
    if (!selectedOrder) return;
    setPhotoError(null);
    setUploadingPhoto(true);

    try {
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
      });
      reader.readAsDataURL(file);
      const base64Data = await base64Promise;

      const res = await fetch(`/api/orders/${selectedOrder.id}/photos`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          photo_type: 'bag',
          image_data: base64Data
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Photo upload failed');
      setPickupPhoto(data.fileUrl || data.uploaded?.[0]?.fileUrl);
    } catch (err: any) {
      setPhotoError(err.message || 'Failed to upload photo');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleSavePickupDetailsAndOpenProof = async () => {
    if (!selectedOrder) return;
    setPhotoError(null);

    // Single photo check
    if (!pickupPhoto) {
      setPhotoError('1 Pickup Photo is required as proof of garments collected.');
      return;
    }

    const totalPieces = washCount + drycleanCount + ironCount + otherCount;
    const totalGrams = (Math.max(0, pickupWeightKg) * 1000) + Math.max(0, Math.min(999, pickupWeightGrams));

    if (totalPieces <= 0 && totalGrams <= 0 && !pickupProofNotes.trim()) {
      setPhotoError('Please enter clothes piece counts, weight, or proof notes.');
      return;
    }

    try {
      setSubmittingPickup(true);

      const res = await fetch(`/api/orders/${selectedOrder.id}/pickup-details`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          kg: pickupWeightKg,
          grams: pickupWeightGrams,
          iron_count: ironCount,
          dryclean_count: drycleanCount,
          wash_count: washCount,
          total_pieces: totalPieces,
          pickup_proof_notes: pickupProofNotes.trim() || undefined,
          clothes_summary: `${washCount ? washCount + ' Wash ' : ''}${drycleanCount ? drycleanCount + ' DryClean ' : ''}${ironCount ? ironCount + ' Iron ' : ''}${otherCount ? otherCount + ' Other' : ''}`.trim()
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save pickup details');

      // Sync directly to Firestore
      syncOrderToFirestore({
        id: selectedOrder.id,
        status: 'picked_up',
        iron_count: ironCount,
        dryclean_count: drycleanCount,
        wash_count: washCount,
        total_pieces: totalPieces,
        pickup_proof_notes: pickupProofNotes.trim() || undefined,
        pickup_photos: [pickupPhoto]
      });

      const completedOrder: Order = {
        ...selectedOrder,
        status: 'picked_up',
        iron_count: ironCount,
        dryclean_count: drycleanCount,
        wash_count: washCount,
        total_pieces: totalPieces,
        pickup_proof_notes: pickupProofNotes.trim() || undefined,
        pickup_weight_kg: pickupWeightKg,
        pickup_weight_grams: pickupWeightGrams,
        pickup_weight_total_grams: totalGrams,
        pickup_photos: [pickupPhoto]
      };

      setModalMode(null);
      setSelectedOrder(null);
      await fetchOrders();

      // Open Pickup Proof Modal immediately so delivery boy can view slip & share via WhatsApp
      setProofModalOrder(completedOrder);
      setShowPickupProofModal(true);
    } catch (err: any) {
      setPhotoError(err.message || 'Failed to complete pickup');
    } finally {
      setSubmittingPickup(false);
    }
  };

  const handleUpdateStatus = async (orderId: string, status: string, notes?: string) => {
    try {
      const res = await fetch(`/api/orders/${orderId}/status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ status, notes })
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.requiresDuePayment) {
          const ord = orders.find(o => o.id === orderId) || selectedOrder;
          if (ord) {
            setDueCollectionOrder(ord);
            return;
          }
        }
        alert(data.error || 'Failed to update status');
        return;
      }
      await fetchOrders();
      await fetchDuePayments();
      syncOrderToFirestore({ id: orderId, status: status as any });
      if (selectedOrder?.id === orderId) {
        setSelectedOrder(prev => prev ? { ...prev, status: status as any } : null);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleOpenWhatsAppPreview = async (order: Order) => {
    try {
      setPreviewLoading(true);
      setShowWaPreviewModal(true);
      setWaHint(null);
      const res = await fetch(`/api/orders/${order.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const d = await res.json();
        setPreviewData(d);
      }
    } catch (e) {
      console.error('Failed to load order for WhatsApp preview', e);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleSendWhatsAppFromPreview = async () => {
    if (!previewData?.invoice && !previewData?.order) return;
    const invId = previewData.invoice?.id || previewData.order.id;
    try {
      setWaSending(true);
      const res = await fetch(`/api/invoices/${invId}/whatsapp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (res.ok && data.whatsappUrl) {
        setWaHint('WhatsApp click-to-chat has opened with the customer’s bill pre-filled. Please tap Send in WhatsApp to deliver the message.');
        window.open(data.whatsappUrl, '_blank');
      } else {
        alert(data.error || 'Failed to prepare WhatsApp message');
      }
    } catch (e) {
      console.error(e);
      alert('Error connecting to WhatsApp service');
    } finally {
      setWaSending(false);
    }
  };

  // Filter orders
  const pickupOrders = orders.filter(o => ['assigned', 'arriving'].includes(o.status));
  const deliveryOrders = orders.filter(o => ['picked_up', 'in_processing', 'ready_for_delivery', 'out_for_delivery'].includes(o.status));
  const completedOrders = orders.filter(o => ['delivered', 'failed', 'rescheduled'].includes(o.status));

  // Filter due payments
  const filteredDuePayments = duePayments.filter(item => {
    if (!dueSearch.trim()) return true;
    const term = dueSearch.toLowerCase();
    return (
      item.customer_name?.toLowerCase().includes(term) ||
      item.customer_mobile?.includes(term) ||
      item.customer_area?.toLowerCase().includes(term) ||
      item.order_number?.toLowerCase().includes(term) ||
      item.invoice_number?.toLowerCase().includes(term)
    );
  });

  const totalOutstandingDue = duePayments.reduce((s, it) => s + (Number(it.outstanding_balance) || 0), 0);
  const currentTotalPieces = washCount + drycleanCount + ironCount + otherCount;

  return (
    <div className="space-y-5 pb-16">
      {/* Driver Status Card */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold text-slate-900 tracking-tight">
              Welcome, {user?.name}! 👋
            </h1>
            <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
              {user?.area_name ? `Area: ${user.area_name}` : 'Pune Fleet'}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Pick up garments, capture handover proof, and collect customer balance dues.
          </p>
        </div>

        {/* Availability Toggle Button */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => toggleAvailability(!user?.is_busy)}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-2 ${
              user?.is_busy 
                ? 'bg-amber-100 text-amber-900 border border-amber-300' 
                : 'bg-emerald-800 text-white hover:bg-emerald-900'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${user?.is_busy ? 'bg-amber-500' : 'bg-emerald-300 animate-pulse'}`}></span>
            <span>{user?.is_busy ? 'Status: Busy' : 'Status: Ready for Jobs'}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              fetchOrders();
              fetchDuePayments();
            }}
            className="p-2 text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl"
            title="Refresh Jobs & Dues"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Quick Pickup Shortcut Button */}
      <button
        type="button"
        onClick={() => setShowQuickOrderModal(true)}
        className="w-full py-3.5 px-4 bg-gradient-to-r from-sky-500 via-sky-600 to-[#0369A1] hover:from-sky-600 hover:to-[#025684] text-white text-xs font-black rounded-2xl shadow-md shadow-sky-500/20 transition-all flex items-center justify-center gap-2 active:scale-98"
      >
        <Zap className="w-4 h-4 text-amber-300 fill-amber-300" />
        <span>⚡ Quick Create Pickup Order</span>
      </button>

      {/* 4 Tabs: Pickups, Deliveries, Due Payments, Completed */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-1.5 bg-slate-200 rounded-2xl text-xs">
        <button
          type="button"
          onClick={() => setActiveTab('pickups')}
          className={`py-2.5 px-3 rounded-xl font-bold transition-all flex items-center justify-center gap-1.5 ${
            activeTab === 'pickups'
              ? 'bg-white text-emerald-900 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <span>Pickups</span>
          <span className="px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px]">
            {pickupOrders.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('deliveries')}
          className={`py-2.5 px-3 rounded-xl font-bold transition-all flex items-center justify-center gap-1.5 ${
            activeTab === 'deliveries'
              ? 'bg-white text-blue-900 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <span>Deliveries</span>
          <span className="px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-800 text-[10px]">
            {deliveryOrders.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('dues')}
          className={`py-2.5 px-3 rounded-xl font-bold transition-all flex items-center justify-center gap-1.5 ${
            activeTab === 'dues'
              ? 'bg-white text-red-900 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <span>Due Payments</span>
          <span className="px-1.5 py-0.5 rounded-full bg-red-100 text-red-800 text-[10px] font-black">
            {duePayments.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('history')}
          className={`py-2.5 px-3 rounded-xl font-bold transition-all flex items-center justify-center gap-1.5 ${
            activeTab === 'history'
              ? 'bg-white text-slate-900 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <span>Completed</span>
          <span className="px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[10px]">
            {completedOrders.length}
          </span>
        </button>
      </div>

      {/* TAB CONTENT */}
      <div className="space-y-4">
        {/* ============================================================== */}
        {/* 1. PICKUPS TAB */}
        {/* ============================================================== */}
        {activeTab === 'pickups' && (
          pickupOrders.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center">
              <Truck className="w-12 h-12 text-slate-300 mx-auto mb-2" />
              <h3 className="text-sm font-semibold text-slate-900">No Pending Pickups Assigned</h3>
              <p className="text-xs text-slate-500 mt-1">
                New laundry pickups assigned by the Admin or Shop Staff will appear here automatically.
              </p>
            </div>
          ) : (
            pickupOrders.map(order => (
              <div key={order.id} className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs space-y-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider">
                      {order.order_number}
                    </span>
                    <h3 className="text-base font-bold text-slate-900">{order.customer_name}</h3>
                    <p className="text-xs text-slate-500 font-medium">Pickup Date: {order.pickup_date} ({order.pickup_time_slot || 'Anytime'})</p>
                  </div>
                  <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-amber-100 text-amber-900 border border-amber-200 capitalize">
                    {order.status}
                  </span>
                </div>

                {/* Address & Navigation */}
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-xs space-y-1.5">
                  <div className="flex items-start gap-2 text-slate-700">
                    <MapPin className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                    <div>
                      {order.flat_number && <span className="font-semibold">{order.flat_number}, {order.building_name} - </span>}
                      <span>{order.pickup_address}</span>
                      <div className="text-[11px] text-emerald-800 font-bold mt-0.5">Area: {order.area}</div>
                    </div>
                  </div>
                </div>

                {order.special_instructions && (
                  <p className="text-xs text-amber-800 bg-amber-50 p-2.5 rounded-lg border border-amber-200">
                    <strong>Instructions:</strong> {order.special_instructions}
                  </p>
                )}

                {/* Action Buttons: Call, Maps, Arrived, Complete Pickup */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                  <a
                    href={`tel:${order.customer_mobile}`}
                    className="flex items-center justify-center gap-1.5 py-2.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold border border-slate-200"
                  >
                    <Phone className="w-3.5 h-3.5 text-emerald-700" />
                    <span>Call</span>
                  </a>

                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${order.pickup_address}, ${order.area}, Pune`)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-center gap-1.5 py-2.5 px-3 bg-blue-50 hover:bg-blue-100 text-blue-800 rounded-xl text-xs font-bold border border-blue-200"
                  >
                    <Navigation className="w-3.5 h-3.5 text-blue-700" />
                    <span>Maps</span>
                  </a>

                  {order.status === 'assigned' && (
                    <button
                      type="button"
                      onClick={() => handleUpdateStatus(order.id, 'arriving', 'Delivery boy is on the way')}
                      className="flex items-center justify-center gap-1.5 py-2.5 px-3 bg-amber-50 hover:bg-amber-100 text-amber-900 rounded-xl text-xs font-bold border border-amber-200"
                    >
                      <span>Mark Arriving</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => openPickupModal(order)}
                    className="flex items-center justify-center gap-1.5 py-2.5 px-3 bg-emerald-800 hover:bg-emerald-900 text-white rounded-xl text-xs font-bold shadow-xs col-span-2 sm:col-span-1"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    <span>Complete Pickup (1 Photo)</span>
                  </button>
                </div>
              </div>
            ))
          )
        )}

        {/* ============================================================== */}
        {/* 2. DELIVERIES TAB */}
        {/* ============================================================== */}
        {activeTab === 'deliveries' && (
          deliveryOrders.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center">
              <Truck className="w-12 h-12 text-slate-300 mx-auto mb-2" />
              <h3 className="text-sm font-semibold text-slate-900">No Active Deliveries</h3>
              <p className="text-xs text-slate-500 mt-1">
                Orders ready for customer delivery will appear here.
              </p>
            </div>
          ) : (
            deliveryOrders.map(order => (
              <div key={order.id} className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs space-y-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="text-[11px] font-bold text-blue-800 uppercase tracking-wider">
                      {order.order_number} {order.invoice_number ? `• ${order.invoice_number}` : ''}
                    </span>
                    <h3 className="text-base font-bold text-slate-900">{order.customer_name}</h3>
                    <div className="text-xs font-semibold text-emerald-800 mt-0.5">
                      Bill: ₹{order.final_total.toFixed(2)} | Balance Due: ₹{order.outstanding_amount.toFixed(2)}
                    </div>
                  </div>
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${
                    order.status === 'out_for_delivery'
                      ? 'bg-blue-100 text-blue-800 border-blue-200'
                      : order.status === 'ready_for_delivery'
                        ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                        : 'bg-slate-100 text-slate-700 border-slate-200'
                  }`}>
                    {order.status.replace(/_/g, ' ')}
                  </span>
                </div>

                {/* Delivery Address */}
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-xs space-y-1.5">
                  <div className="flex items-start gap-2 text-slate-700">
                    <MapPin className="w-4 h-4 text-blue-700 shrink-0 mt-0.5" />
                    <div>
                      {order.flat_number && <span className="font-semibold">{order.flat_number}, {order.building_name} - </span>}
                      <span>{order.delivery_address || order.pickup_address}</span>
                      <div className="text-[11px] text-blue-800 font-bold mt-0.5">Area: {order.area}</div>
                    </div>
                  </div>
                </div>

                {/* Real Bill Creation / Editing for Delivery Boy */}
                <div className="pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setRealBillOrder(order)}
                    className={`w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-black shadow-xs transition-all ${
                      (order.final_total || 0) > 0
                        ? 'bg-sky-50 text-sky-900 border border-sky-300 hover:bg-sky-100'
                        : 'bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white shadow-amber-500/20 animate-pulse'
                    }`}
                  >
                    <Receipt className="w-4 h-4" />
                    <span>
                      {(order.final_total || 0) > 0
                        ? `📝 Edit Real Bill (₹${order.final_total.toFixed(2)})`
                        : '⚡ Create Real Bill (Add Clothes & Curtains)'}
                    </span>
                  </button>
                </div>

                {/* Primary Action Buttons: WhatsApp Bill Sharing, Proof Slip, and PDF Invoice */}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => handleOpenWhatsAppPreview(order)}
                    className="flex-1 min-w-[150px] flex items-center justify-center gap-1.5 py-2.5 px-3 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold shadow-xs transition-colors"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Send Bill on WhatsApp</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setProofModalOrder(order);
                      setShowPickupProofModal(true);
                    }}
                    className="flex items-center justify-center gap-1.5 py-2.5 px-3 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 rounded-xl text-xs font-bold border border-emerald-200"
                    title="View Pickup Handover Proof"
                  >
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-700" />
                    <span>Proof Slip</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowPrintInvoiceId(order.id)}
                    className="flex items-center justify-center gap-1.5 py-2.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold border border-slate-200 transition-colors"
                    title="View Invoice & Download PDF"
                  >
                    <Receipt className="w-3.5 h-3.5 text-slate-600" />
                    <span>PDF Bill</span>
                  </button>
                </div>

                {/* Secondary Action buttons */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                  <a
                    href={`tel:${order.customer_mobile}`}
                    className="flex items-center justify-center gap-1.5 py-2.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold border border-slate-200"
                  >
                    <Phone className="w-3.5 h-3.5 text-emerald-700" />
                    <span>Call</span>
                  </a>

                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${order.delivery_address || order.pickup_address}, ${order.area}, Pune`)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-center gap-1.5 py-2.5 px-3 bg-blue-50 hover:bg-blue-100 text-blue-800 rounded-xl text-xs font-bold border border-blue-200"
                  >
                    <Navigation className="w-3.5 h-3.5 text-blue-700" />
                    <span>Maps</span>
                  </a>

                  {order.status !== 'out_for_delivery' && (
                    <button
                      type="button"
                      onClick={() => handleUpdateStatus(order.id, 'out_for_delivery', 'Out for customer delivery')}
                      className="flex items-center justify-center gap-1.5 py-2.5 px-3 bg-blue-800 hover:bg-blue-900 text-white rounded-xl text-xs font-bold shadow-xs"
                    >
                      <span>Out For Delivery</span>
                    </button>
                  )}

                  {order.outstanding_amount > 0 && (
                    <button
                      type="button"
                      onClick={() => setDueCollectionOrder(order)}
                      className="flex items-center justify-center gap-1.5 py-2.5 px-3 bg-emerald-800 hover:bg-emerald-900 text-white rounded-xl text-xs font-bold shadow-xs"
                    >
                      <IndianRupee className="w-3.5 h-3.5" />
                      <span>Collect ₹{order.outstanding_amount}</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      if ((order.outstanding_amount || 0) > 0) {
                        setDueCollectionOrder(order);
                      } else {
                        handleUpdateStatus(order.id, 'delivered', 'Handed over to customer');
                      }
                    }}
                    className={`flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl text-xs font-bold transition-all shadow-xs ${
                      (order.outstanding_amount || 0) > 0
                        ? 'bg-amber-600 hover:bg-amber-700 text-white'
                        : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                    }`}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>
                      {(order.outstanding_amount || 0) > 0
                        ? `Collect Due (₹${order.outstanding_amount}) & Deliver`
                        : 'Mark Delivered'}
                    </span>
                  </button>
                </div>
              </div>
            ))
          )
        )}

        {/* ============================================================== */}
        {/* 3. DUE PAYMENTS TAB (ADMIN PARITY FOR DELIVERY BOY) */}
        {/* ============================================================== */}
        {activeTab === 'dues' && (
          <div className="space-y-4">
            {/* Summary Banner */}
            <div className="p-4 bg-gradient-to-r from-red-500 via-rose-600 to-red-700 text-white rounded-2xl shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <span className="text-[11px] uppercase tracking-wider font-bold text-red-100 block">
                  Pending Due Payments
                </span>
                <h3 className="text-2xl font-black font-mono">
                  ₹{totalOutstandingDue.toFixed(2)}
                </h3>
                <p className="text-xs text-red-100 mt-0.5">
                  Outstanding balance across {duePayments.length} customer order(s)
                </p>
              </div>

              <button
                type="button"
                onClick={fetchDuePayments}
                className="px-3.5 py-2 bg-white/20 hover:bg-white/30 text-white rounded-xl text-xs font-bold border border-white/20 flex items-center gap-1.5 self-start sm:self-auto"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingDues ? 'animate-spin' : ''}`} />
                <span>Refresh Dues</span>
              </button>
            </div>

            {/* Search Input */}
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={dueSearch}
                onChange={(e) => setDueSearch(e.target.value)}
                placeholder="Search due payments by customer name, phone, area, order number..."
                className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 focus:ring-2 focus:ring-red-500 focus:outline-hidden"
              />
            </div>

            {/* List of Due Payment Cards */}
            {filteredDuePayments.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center">
                <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-2" />
                <h3 className="text-sm font-semibold text-slate-900">
                  {dueSearch ? 'No Matching Due Payments Found' : 'No Outstanding Balance Dues!'}
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  {dueSearch ? 'Try a different search term.' : 'All customer accounts are currently settled.'}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredDuePayments.map(item => (
                  <div key={item.invoice_id || item.order_id} className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-2xs space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-bold text-red-700 bg-red-50 px-2 py-0.5 rounded border border-red-200">
                            {item.order_number}
                          </span>
                          {item.invoice_number && (
                            <span className="text-[11px] font-medium text-slate-500">
                              Inv: {item.invoice_number}
                            </span>
                          )}
                        </div>
                        <h4 className="text-base font-bold text-slate-900 mt-1">{item.customer_name}</h4>
                        <div className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                          <MapPin className="w-3.5 h-3.5 text-slate-400" />
                          <span>{item.flat_number ? `${item.flat_number}, ` : ''}{item.customer_area}</span>
                        </div>
                      </div>

                      <div className="text-left sm:text-right bg-red-50 sm:bg-transparent p-2.5 sm:p-0 rounded-xl border sm:border-0 border-red-100">
                        <span className="text-[10px] text-slate-500 font-bold uppercase block">Balance Due</span>
                        <span className="text-xl font-black text-red-700 font-mono">
                          ₹{Number(item.outstanding_balance).toFixed(2)}
                        </span>
                        {(item.previous_unpaid_due || 0) > 0 && (
                          <span className="text-[11px] text-amber-800 font-bold block mt-0.5">
                            Total Customer Dues: ₹{Number(item.total_customer_due).toFixed(2)}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Action Bar */}
                    <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
                      <a
                        href={`tel:${item.customer_mobile}`}
                        className="flex-1 sm:flex-none px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold border border-slate-200 flex items-center justify-center gap-1.5"
                      >
                        <Phone className="w-3.5 h-3.5 text-emerald-700" />
                        <span>{item.customer_mobile}</span>
                      </a>

                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${item.customer_area}, Pune`)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="px-3.5 py-2 bg-blue-50 hover:bg-blue-100 text-blue-800 rounded-xl text-xs font-bold border border-blue-200 flex items-center justify-center gap-1.5"
                      >
                        <Navigation className="w-3.5 h-3.5 text-blue-700" />
                        <span>Maps</span>
                      </a>

                      <button
                        type="button"
                        onClick={() => {
                          const matchingOrder = orders.find(o => o.id === item.order_id) || {
                            id: item.order_id,
                            order_number: item.order_number,
                            customer_name: item.customer_name,
                            customer_mobile: item.customer_mobile,
                            outstanding_amount: item.outstanding_balance,
                            final_total: item.final_total,
                            amount_paid: item.amount_paid,
                            status: item.order_status as any,
                            area: item.customer_area
                          } as Order;

                          setDueCollectionOrder(matchingOrder);
                        }}
                        className="flex-1 sm:flex-none px-4 py-2 bg-emerald-800 hover:bg-emerald-900 text-white rounded-xl text-xs font-bold shadow-xs flex items-center justify-center gap-1.5 ml-auto"
                      >
                        <HandCoins className="w-3.5 h-3.5" />
                        <span>Collect Due Payment</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ============================================================== */}
        {/* 4. COMPLETED ORDERS TAB */}
        {/* ============================================================== */}
        {activeTab === 'history' && (
          completedOrders.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center">
              <CheckCircle2 className="w-12 h-12 text-slate-300 mx-auto mb-2" />
              <h3 className="text-sm font-semibold text-slate-900">No Completed Orders Yet</h3>
            </div>
          ) : (
            completedOrders.map(order => (
              <div key={order.id} className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div>
                  <span className="font-bold text-slate-900 block">{order.order_number} - {order.customer_name}</span>
                  <span className="text-slate-500">Delivered • Total ₹{order.final_total} • {order.payment_status}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setProofModalOrder(order);
                      setShowPickupProofModal(true);
                    }}
                    className="px-2.5 py-1.5 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 rounded-lg border border-emerald-200 flex items-center gap-1"
                  >
                    <ShieldCheck className="w-3 h-3 text-emerald-700" />
                    <span>Proof Slip</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleOpenWhatsAppPreview(order)}
                    className="px-3 py-1.5 text-xs font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 rounded-lg border border-emerald-200 flex items-center gap-1"
                  >
                    <Send className="w-3 h-3" />
                    <span>WhatsApp Bill</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowPrintInvoiceId(order.id)}
                    className="px-2.5 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg border border-slate-200"
                  >
                    PDF
                  </button>

                  <span className="px-2.5 py-1 rounded-full font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                    Completed
                  </span>
                </div>
              </div>
            ))
          )
        )}
      </div>

      {/* ============================================================== */}
      {/* SINGLE PICKUP PHOTO & INFORMATIONAL HANDOVER PROOF MODAL */}
      {/* ============================================================== */}
      {modalMode === 'pickup_flow' && selectedOrder && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full p-5 sm:p-6 border border-slate-200 my-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <span className="text-xs font-bold text-emerald-800 uppercase tracking-wider">
                  Pickup Order • {selectedOrder.order_number}
                </span>
                <h3 className="text-base font-bold text-slate-900">
                  {selectedOrder.customer_name} ({selectedOrder.area})
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setModalMode(null)}
                className="text-slate-400 hover:text-slate-600 font-bold text-lg"
              >
                ✕
              </button>
            </div>

            {photoError && (
              <div className="p-3 bg-red-50 text-red-700 text-xs rounded-xl border border-red-200 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{photoError}</span>
              </div>
            )}

            {/* NOTICE BANNER */}
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-start gap-2">
              <Sparkles className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <strong>Informational Handover Proof Only: </strong>
                No prices or billing amounts are calculated at pickup. Only capture 1 pickup photo, piece counts, and notes. The shop counter will inspect garments and issue the accurate real bill.
              </div>
            </div>

            {/* STEP 1: SINGLE PICKUP PHOTO (ONLY 1 REQUIRED) */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Camera className="w-4 h-4 text-emerald-800" />
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                    Step 1: Single Pickup Photo Proof *
                  </h4>
                </div>
                <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                  pickupPhoto 
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' 
                    : 'bg-amber-100 text-amber-800'
                }`}>
                  {pickupPhoto ? '✅ Photo Uploaded' : '⚠️ 1 Photo Required'}
                </span>
              </div>

              <p className="text-[11px] text-slate-500 mb-3">
                Take a photo of the laundry bag or handed over clothes. Only 1 photo is required.
              </p>

              <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
                {pickupPhoto ? (
                  <div className="relative rounded-lg overflow-hidden border border-slate-200 aspect-video bg-slate-100 mb-2.5">
                    <img src={pickupPhoto} alt="Pickup Proof" className="w-full h-full object-cover" />
                  </div>
                ) : (
                  <div className="rounded-lg border-2 border-dashed border-slate-300 aspect-video flex flex-col items-center justify-center p-3 text-center mb-2.5 bg-slate-50">
                    <Camera className="w-8 h-8 text-slate-400 mb-1" />
                    <span className="text-xs text-slate-600 font-semibold">Take or upload pickup photo</span>
                    <span className="text-[10px] text-slate-400">Mobile camera or file upload</span>
                  </div>
                )}

                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  ref={photoInputRef}
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && handlePhotoUpload(e.target.files[0])}
                />
                <button
                  type="button"
                  disabled={uploadingPhoto}
                  onClick={() => photoInputRef.current?.click()}
                  className="w-full py-2.5 px-3 text-xs font-bold rounded-xl bg-emerald-50 text-emerald-900 border border-emerald-200 hover:bg-emerald-100 flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>{uploadingPhoto ? 'Uploading Photo...' : pickupPhoto ? 'Retake / Change Photo' : 'Capture Pickup Photo'}</span>
                </button>
              </div>
            </div>

            {/* STEP 2: SHORTCUT CLOTHES PIECES COUNTER & PROOF NOTE */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
                  <Package className="w-4 h-4 text-sky-600" />
                  <span>Step 2: Clothes Piece Count & Proof Note</span>
                </h4>
                <span className="text-xs font-black bg-indigo-100 text-indigo-900 px-2.5 py-0.5 rounded-full">
                  Total: {currentTotalPieces} pcs
                </span>
              </div>

              {/* 4 Shortcut Counters */}
              <div className="grid grid-cols-2 gap-2.5">
                {/* Washing / Wash & Fold */}
                <div className="bg-white p-2.5 rounded-xl border border-slate-200 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-slate-900 block">Washing</span>
                    <span className="text-[10px] text-slate-400">Wash & Fold</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setWashCount(prev => Math.max(0, prev - 1))}
                      className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 font-bold text-slate-700 flex items-center justify-center"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="w-6 text-center font-bold text-sm text-slate-900">{washCount}</span>
                    <button
                      type="button"
                      onClick={() => setWashCount(prev => prev + 1)}
                      className="w-7 h-7 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-bold flex items-center justify-center"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                {/* Dry Clean */}
                <div className="bg-white p-2.5 rounded-xl border border-slate-200 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-slate-900 block">Dry Clean</span>
                    <span className="text-[10px] text-slate-400">Suits / Sarees</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setDrycleanCount(prev => Math.max(0, prev - 1))}
                      className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 font-bold text-slate-700 flex items-center justify-center"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="w-6 text-center font-bold text-sm text-slate-900">{drycleanCount}</span>
                    <button
                      type="button"
                      onClick={() => setDrycleanCount(prev => prev + 1)}
                      className="w-7 h-7 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold flex items-center justify-center"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                {/* Ironing */}
                <div className="bg-white p-2.5 rounded-xl border border-slate-200 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-slate-900 block">Ironing</span>
                    <span className="text-[10px] text-slate-400">Steam / Press</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setIronCount(prev => Math.max(0, prev - 1))}
                      className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 font-bold text-slate-700 flex items-center justify-center"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="w-6 text-center font-bold text-sm text-slate-900">{ironCount}</span>
                    <button
                      type="button"
                      onClick={() => setIronCount(prev => prev + 1)}
                      className="w-7 h-7 rounded-lg bg-purple-700 hover:bg-purple-800 text-white font-bold flex items-center justify-center"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                {/* Other Items */}
                <div className="bg-white p-2.5 rounded-xl border border-slate-200 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-slate-900 block">Other</span>
                    <span className="text-[10px] text-slate-400">Bedsheets / etc</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setOtherCount(prev => Math.max(0, prev - 1))}
                      className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 font-bold text-slate-700 flex items-center justify-center"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="w-6 text-center font-bold text-sm text-slate-900">{otherCount}</span>
                    <button
                      type="button"
                      onClick={() => setOtherCount(prev => prev + 1)}
                      className="w-7 h-7 rounded-lg bg-sky-700 hover:bg-sky-800 text-white font-bold flex items-center justify-center"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Optional Weight Section */}
              <div className="bg-white p-3 rounded-xl border border-slate-200 space-y-1.5 text-xs">
                <span className="text-[10px] font-bold uppercase text-slate-500 tracking-wider block">
                  Optional: Weight (Kg + Grams) if given by weight
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] font-semibold text-slate-600 block mb-0.5">Kilograms (Kg)</label>
                    <input
                      type="number"
                      min="0"
                      value={pickupWeightKg || ''}
                      onChange={(e) => setPickupWeightKg(Math.max(0, parseInt(e.target.value, 10) || 0))}
                      placeholder="0"
                      className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg font-mono text-center font-bold"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-slate-600 block mb-0.5">Grams (0-999)</label>
                    <input
                      type="number"
                      min="0"
                      max="999"
                      step="50"
                      value={pickupWeightGrams || ''}
                      onChange={(e) => setPickupWeightGrams(Math.max(0, Math.min(999, parseInt(e.target.value, 10) || 0)))}
                      placeholder="0"
                      className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg font-mono text-center font-bold"
                    />
                  </div>
                </div>
              </div>

              {/* Clothes Proof Note & Description Box */}
              <div className="bg-white p-3 rounded-xl border border-slate-200 space-y-1.5 text-xs">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold uppercase text-slate-700 flex items-center gap-1">
                    <FileText className="w-3.5 h-3.5 text-emerald-700" />
                    <span>Clothes Proof Note & Condition Details</span>
                  </label>
                  <span className="text-[10px] text-slate-400">Proof on Receipt</span>
                </div>
                <textarea
                  rows={2}
                  value={pickupProofNotes}
                  onChange={(e) => setPickupProofNotes(e.target.value)}
                  placeholder="e.g. 5 shirts collar stain, 1 white kurta torn button, 2 curtains handed over in blue bag..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-900 focus:ring-1 focus:ring-emerald-600"
                />
              </div>
            </div>

            {/* Actions */}
            <div className="pt-2 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setModalMode(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={submittingPickup || !pickupPhoto}
                onClick={handleSavePickupDetailsAndOpenProof}
                className="px-5 py-2.5 text-xs font-bold text-white bg-emerald-800 hover:bg-emerald-900 rounded-xl shadow-xs disabled:opacity-50 transition-colors flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{submittingPickup ? 'Saving Pickup Proof...' : 'Complete Pickup & View Proof Slip'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* WHATSAPP BILL PREVIEW MODAL */}
      {/* ============================================================== */}
      {showWaPreviewModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl max-w-xl w-full p-5 sm:p-6 border border-slate-200 my-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Send className="w-4 h-4 text-emerald-700" />
                <h3 className="text-sm font-bold text-slate-900">WhatsApp Customer Bill Preview</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowWaPreviewModal(false)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            {previewLoading ? (
              <div className="py-12 text-center text-xs text-slate-500">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-emerald-700" />
                <span>Loading order bill details...</span>
              </div>
            ) : previewData ? (
              <div className="py-4 space-y-4 text-xs">
                {/* Order & Customer info */}
                <div className="flex justify-between items-center p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <div>
                    <span className="font-bold text-slate-900 block">{previewData.order.customer_name}</span>
                    <span className="text-slate-500">{previewData.order.customer_mobile}</span>
                  </div>
                  <div className="text-right">
                    <span className="font-mono font-bold text-emerald-800 block">{previewData.order.order_number}</span>
                    <span className="text-slate-500">Final Bill: ₹{Number(previewData.order.final_total || 0).toFixed(2)}</span>
                  </div>
                </div>

                {/* Items preview table */}
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-600 uppercase">
                        <th className="py-2 px-3">Item</th>
                        <th className="py-2 px-3 text-center">Qty / Measure</th>
                        <th className="py-2 px-3 text-right">Rate</th>
                        <th className="py-2 px-3 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {previewData.items?.map((it: any, idx: number) => (
                        <tr key={it.id || idx}>
                          <td className="py-2 px-3 font-semibold text-slate-900">{it.item_name}</td>
                          <td className="py-2 px-3 text-center text-slate-600">
                            {it.unit === 'sq_ft' ? `${it.sq_ft} sq.ft` : it.unit === 'kg' ? it.weight_display : `${it.quantity} pcs`}
                          </td>
                          <td className="py-2 px-3 text-right font-mono text-slate-600">₹{parseFloat(it.rate).toFixed(2)}</td>
                          <td className="py-2 px-3 text-right font-mono font-bold text-slate-900">₹{parseFloat(it.line_total).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Financial Summary */}
                <div className="grid grid-cols-3 gap-2 p-3 bg-slate-50 rounded-xl border border-slate-200 text-center">
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase font-bold block">Final Bill</span>
                    <span className="text-sm font-black text-slate-900 font-mono">₹{Number(previewData.order.final_total || 0).toFixed(2)}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase font-bold block">Amount Paid</span>
                    <span className="text-sm font-bold text-emerald-800 font-mono">₹{Number(previewData.order.amount_paid || 0).toFixed(2)}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase font-bold block">Remaining Due</span>
                    <span className="text-sm font-black text-red-700 font-mono">₹{Number(previewData.order.outstanding_amount || 0).toFixed(2)}</span>
                  </div>
                </div>

                {/* WhatsApp Message Preview Box (100% English) */}
                <div className="p-3.5 bg-emerald-50/70 border border-emerald-200 rounded-xl text-emerald-950 font-mono text-[11px] space-y-1">
                  <div className="flex items-center justify-between text-emerald-900 font-bold mb-1 border-b border-emerald-200 pb-1 font-sans">
                    <span>📱 Prefilled WhatsApp Message Preview</span>
                    <span>To: {previewData.order.customer_mobile}</span>
                  </div>
                  <div className="text-emerald-900 font-sans font-bold">Friends Laundry & Dry Cleaners</div>
                  <div className="text-emerald-800">Hello! Here is your official laundry bill:</div>
                  <div className="text-slate-700">Order Number: {previewData.order.order_number}</div>
                  <div className="text-slate-700">Customer Name: {previewData.order.customer_name}</div>
                  <div className="text-slate-700 pt-1 font-semibold">Clothing Details:</div>
                  {previewData.items?.map((it: any) => (
                    <div key={it.id} className="text-slate-600 pl-2">
                      • {it.item_name} — {it.unit === 'sq_ft' ? `${it.sq_ft} sq.ft` : `${it.quantity} pcs`} × ₹{Number(it.rate || 0).toFixed(2)} = ₹{Number(it.line_total || 0).toFixed(2)}
                    </div>
                  ))}
                  <div className="text-emerald-900 font-bold pt-1">
                    Final Bill: ₹{Number(previewData.order.final_total || 0).toFixed(2)}
                  </div>
                  <div className="text-slate-700">
                    Amount Paid: ₹{Number(previewData.order.amount_paid || 0).toFixed(2)} | Balance Due: ₹{Number(previewData.order.outstanding_amount || 0).toFixed(2)}
                  </div>
                  <div className="text-emerald-800 pt-1">Thank you for your business! Friends Laundry & Dry Cleaners</div>
                </div>

                {waHint && (
                  <div className="p-3 bg-emerald-100 border border-emerald-300 rounded-xl text-emerald-950 text-xs flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                    <span>{waHint}</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="py-8 text-center text-xs text-slate-500">
                Failed to load order bill details.
              </div>
            )}

            <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowWaPreviewModal(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl"
              >
                Close
              </button>

              {previewData && (
                <button
                  type="button"
                  onClick={() => setShowPrintInvoiceId(previewData.invoice?.id || previewData.order.id)}
                  className="px-4 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl border border-slate-200 flex items-center gap-1.5"
                >
                  <Receipt className="w-3.5 h-3.5" />
                  <span>Download / Print PDF</span>
                </button>
              )}

              <button
                type="button"
                disabled={waSending || !previewData}
                onClick={handleSendWhatsAppFromPreview}
                className="px-5 py-2.5 text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 rounded-xl shadow-xs disabled:opacity-50 flex items-center gap-1.5"
              >
                <Send className="w-4 h-4" />
                <span>{waSending ? 'Opening WhatsApp...' : 'Open WhatsApp & Send Bill'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* DUE PAYMENT COLLECTION MODAL */}
      {/* ============================================================== */}
      {dueCollectionOrder && (
        <DuePaymentCollectionModal
          order={dueCollectionOrder}
          autoCompleteDelivery={false}
          onClose={() => setDueCollectionOrder(null)}
          onSuccess={async () => {
            setDueCollectionOrder(null);
            await fetchOrders();
            await fetchDuePayments();
          }}
        />
      )}

      {/* ============================================================== */}
      {/* OFFICIAL PICKUP PROOF RECEIPT MODAL */}
      {/* ============================================================== */}
      {showPickupProofModal && proofModalOrder && (
        <PickupProofModal
          order={proofModalOrder}
          onClose={() => {
            setShowPickupProofModal(false);
            setProofModalOrder(null);
          }}
        />
      )}

      {/* Invoice Modal for Delivery Boy View/Print/Download */}
      {showPrintInvoiceId && (
        <InvoiceModal
          orderIdOrInvoiceId={showPrintInvoiceId}
          onClose={() => setShowPrintInvoiceId(null)}
        />
      )}

      {/* Quick Create Pickup Shortcut Modal */}
      {showQuickOrderModal && (
        <QuickOrderModal
          initialType="pickup"
          onClose={() => setShowQuickOrderModal(false)}
          onSuccess={async (orderId) => {
            setShowQuickOrderModal(false);
            await fetchOrders();
            const orderRes = await fetch(`/api/orders/${orderId}`, {
              headers: { Authorization: `Bearer ${token}` }
            });
            if (orderRes.ok) {
              const d = await orderRes.json();
              if (d.order) {
                setProofModalOrder(d.order);
                setShowPickupProofModal(true);
              }
            }
          }}
        />
      )}

      {/* Real Bill Modal for Delivery Boy */}
      {realBillOrder && (
        <DeliveryRealBillModal
          order={realBillOrder}
          onClose={() => setRealBillOrder(null)}
          onSuccess={async (updated) => {
            setRealBillOrder(null);
            await fetchOrders();
            await fetchDuePayments();
          }}
          onOpenPaymentCollection={(ord) => {
            setDueCollectionOrder(ord);
          }}
          onOpenInvoice={(ordId) => {
            setShowPrintInvoiceId(ordId);
          }}
        />
      )}
    </div>
  );
};
