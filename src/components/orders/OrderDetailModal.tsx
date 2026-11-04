import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext.tsx';
import type { Order, OrderItem, OrderPhoto, Invoice, PaymentTransaction, User, ClothingCategory } from '../../types/index.ts';
import { 
  Package, 
  MapPin, 
  Phone, 
  Camera, 
  Upload,
  Receipt, 
  Clock, 
  Truck, 
  UserCheck, 
  Send, 
  Printer, 
  Navigation,
  CheckCircle2,
  AlertCircle,
  IndianRupee,
  Calendar,
  Building,
  Plus,
  Trash2,
  Edit3,
  ShieldCheck,
  FileText,
  Check,
  Sparkles,
  ArrowRight
} from 'lucide-react';
import { InvoiceModal } from '../invoices/InvoiceModal.tsx';
import { DuePaymentCollectionModal } from '../payments/DuePaymentCollectionModal.tsx';
import { PickupProofModal } from './PickupProofModal.tsx';
import { syncOrderToFirestore } from '../../services/firestoreSync.ts';
import { CameraModal } from '../common/CameraModal.tsx';
import { compressImage } from '../../utils/imageCompressor.ts';

interface OrderDetailModalProps {
  orderId: string;
  onClose: () => void;
  onUpdate: () => void;
}

interface BillLineItem {
  id: string;
  category_id?: string | null;
  item_name: string;
  unit: 'piece' | 'kg' | 'sq_ft';
  quantity: number;
  rate: number;
  line_total: number;
  kg?: number;
  grams?: number;
  sq_ft?: number;
  sq_ft_length?: number;
  sq_ft_width?: number;
}

export const OrderDetailModal: React.FC<OrderDetailModalProps> = ({ orderId, onClose, onUpdate }) => {
  const { token, user, t } = useAuth();
  const [data, setData] = useState<{
    order: Order;
    items: OrderItem[];
    photos: OrderPhoto[];
    invoice: Invoice | null;
    payments: PaymentTransaction[];
    statusHistory: any[];
    assignmentHistory: any[];
  } | null>(null);

  const [deliveryBoys, setDeliveryBoys] = useState<User[]>([]);
  const [categories, setCategories] = useState<ClothingCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [showPickupProofModal, setShowPickupProofModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'details' | 'photos' | 'items' | 'history'>('details');

  // Assign boy state
  const [selectedBoyId, setSelectedBoyId] = useState('');
  const [assigning, setAssigning] = useState(false);

  // Status update state
  const [newStatus, setNewStatus] = useState('');
  const [statusNotes, setStatusNotes] = useState('');
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [showDuePaymentModal, setShowDuePaymentModal] = useState(false);

  // Real Bill Builder states (Admin / Shop)
  const [isEditingBill, setIsEditingBill] = useState(false);
  const [billItems, setBillItems] = useState<BillLineItem[]>([]);
  const [billDeliveryCharge, setBillDeliveryCharge] = useState<number>(0);
  const [billDiscount, setBillDiscount] = useState<number>(0);
  const [billDeliveryBoyId, setBillDeliveryBoyId] = useState<string>('');
  const [billTargetStatus, setBillTargetStatus] = useState<'ready_for_delivery' | 'out_for_delivery'>('ready_for_delivery');
  const [savingBill, setSavingBill] = useState(false);
  const [billSaveSuccess, setBillSaveSuccess] = useState<string | null>(null);
  const [billError, setBillError] = useState<string | null>(null);

  // Photo upload states
  const [showCameraModal, setShowCameraModal] = useState<boolean>(false);
  const [uploadingPhoto, setUploadingPhoto] = useState<boolean>(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const photoFileInputRef = useRef<HTMLInputElement>(null);

  const handlePhotoUpload = async (fileOrB64: File | string) => {
    if (!orderId) return;
    setPhotoError(null);
    setUploadingPhoto(true);

    try {
      let base64Data: string;
      if (typeof fileOrB64 === 'string') {
        base64Data = fileOrB64;
      } else {
        base64Data = await compressImage(fileOrB64, 1280, 1280, 0.82);
      }

      if (!base64Data) {
        throw new Error('Failed to process image');
      }

      const res = await fetch(`/api/orders/${orderId}/photos`, {
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

      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error || 'Photo upload failed');

      await fetchDetail();
      onUpdate();
    } catch (err: any) {
      setPhotoError(err.message || 'Failed to upload photo');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const fetchDetail = async () => {
    try {
      setLoading(true);
      const [resOrder, resBoys, resCats] = await Promise.all([
        fetch(`/api/orders/${orderId}`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/delivery-boys', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/clothing-categories', { headers: { Authorization: `Bearer ${token}` } })
      ]);

      if (resOrder.ok) {
        const d = await resOrder.json();
        setData(d);
        setNewStatus(d.order.status);
        if (d.order.assigned_delivery_boy_id) {
          setSelectedBoyId(d.order.assigned_delivery_boy_id);
          setBillDeliveryBoyId(d.order.assigned_delivery_boy_id);
        }
        setBillDeliveryCharge(d.order.delivery_charge || 0);
        setBillDiscount(d.order.discount_amount || 0);

        // Populate initial bill items from order items
        if (Array.isArray(d.items) && d.items.length > 0) {
          setBillItems(d.items.map((it: any) => ({
            id: it.id || crypto.randomUUID(),
            category_id: it.category_id || null,
            item_name: it.item_name || 'Clothing Item',
            unit: it.unit || 'piece',
            quantity: it.quantity || 1,
            rate: it.rate || 0,
            line_total: it.line_total || 0,
            kg: it.kg || Math.floor((it.weight_grams_total || 0) / 1000) || 0,
            grams: it.grams || ((it.weight_grams_total || 0) % 1000) || 0,
            sq_ft: it.sq_ft || 0,
            sq_ft_length: it.sq_ft_length || 0,
            sq_ft_width: it.sq_ft_width || 0
          })));
        } else {
          // If no items yet, start with empty list or shortcut from pickup if available
          setBillItems([]);
        }
      }

      if (resBoys.ok) {
        const d = await resBoys.json();
        setDeliveryBoys(d.deliveryBoys || []);
      }

      if (resCats.ok) {
        const d = await resCats.json();
        setCategories(d.categories || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDetail();
  }, [orderId]);

  const handleAssign = async () => {
    if (!selectedBoyId) return;
    try {
      setAssigning(true);
      const res = await fetch(`/api/orders/${orderId}/assign`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          delivery_boy_id: selectedBoyId,
          stage: data?.order.status === 'ready_for_delivery' ? 'delivery' : 'pickup',
          notes: 'Assigned via order details'
        })
      });
      if (res.ok) {
        await fetchDetail();
        onUpdate();
        alert('Delivery boy assigned successfully!');
      }
    } catch (e) {
      console.error(e);
    } finally {
      setAssigning(false);
    }
  };

  const handleUpdateStatus = async () => {
    if (!newStatus) return;

    if (newStatus === 'delivered' && data?.order && (Number(data.order.outstanding_amount) || 0) > 0) {
      setShowDuePaymentModal(true);
      return;
    }

    try {
      setUpdatingStatus(true);
      const res = await fetch(`/api/orders/${orderId}/status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          status: newStatus,
          notes: statusNotes.trim() || undefined
        })
      });

      const d = await res.json();
      if (!res.ok) {
        if (d.requiresDuePayment) {
          setShowDuePaymentModal(true);
          return;
        }
        alert(d.error || 'Failed to update status');
        return;
      }

      setStatusNotes('');
      await fetchDetail();
      onUpdate();
    } catch (e) {
      console.error(e);
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleWhatsAppShare = async () => {
    if (!data?.invoice) {
      alert('Invoice must be generated before sharing on WhatsApp');
      return;
    }
    try {
      const res = await fetch(`/api/invoices/${data.invoice.id}/whatsapp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        }
      });
      const resData = await res.json();
      if (res.ok && resData.whatsappUrl) {
        window.open(resData.whatsappUrl, '_blank');
      }
    } catch (e) {
      console.error(e);
    }
  };

  // -------------------------------------------------------------
  // REAL BILL BUILDER HELPERS
  // -------------------------------------------------------------

  const calculateLineTotal = (item: BillLineItem): number => {
    if (item.unit === 'piece') {
      return Math.round((Math.max(0, item.quantity) * Math.max(0, item.rate)) * 100) / 100;
    }
    if (item.unit === 'kg') {
      const totalGrams = (Math.max(0, item.kg || 0) * 1000) + Math.max(0, Math.min(999, item.grams || 0));
      if (totalGrams <= 0) return 0;
      return Math.round(((totalGrams * Math.max(0, item.rate)) / 1000) * 100) / 100;
    }
    if (item.unit === 'sq_ft') {
      const length = Math.max(0, item.sq_ft_length || 0);
      const width = Math.max(0, item.sq_ft_width || 0);
      const computedSqFt = (length > 0 && width > 0) ? (length * width) : Math.max(0, item.sq_ft || 0);
      return Math.round((computedSqFt * Math.max(0, item.rate)) * 100) / 100;
    }
    return Math.round((Math.max(0, item.quantity) * Math.max(0, item.rate)) * 100) / 100;
  };

  const calculateBillSubtotal = (): number => {
    return billItems.reduce((acc, it) => acc + calculateLineTotal(it), 0);
  };

  const calculateBillFinalTotal = (): number => {
    const sub = calculateBillSubtotal();
    return Math.max(0, sub + Math.max(0, billDeliveryCharge) - Math.max(0, billDiscount));
  };

  const addLineItemFromCategory = (cat: ClothingCategory) => {
    const unit = (cat.unit as 'piece' | 'kg' | 'sq_ft') || 'piece';
    const newItem: BillLineItem = {
      id: crypto.randomUUID(),
      category_id: cat.id,
      item_name: cat.name,
      unit,
      quantity: 1,
      rate: cat.default_rate,
      line_total: cat.default_rate,
      kg: unit === 'kg' ? 1 : 0,
      grams: 0,
      sq_ft: unit === 'sq_ft' ? 40 : 0,
      sq_ft_length: unit === 'sq_ft' ? 8 : 0,
      sq_ft_width: unit === 'sq_ft' ? 5 : 0
    };
    newItem.line_total = calculateLineTotal(newItem);
    setBillItems(prev => [...prev, newItem]);
  };

  const addCustomLineItem = (unit: 'piece' | 'sq_ft' | 'kg' = 'piece') => {
    const newItem: BillLineItem = {
      id: crypto.randomUUID(),
      category_id: null,
      item_name: unit === 'sq_ft' ? 'Curtains (By Sq Ft)' : unit === 'kg' ? 'Wash & Fold' : 'Custom Garment',
      unit,
      quantity: 1,
      rate: unit === 'sq_ft' ? 25 : unit === 'kg' ? 80 : 30,
      line_total: 0,
      kg: unit === 'kg' ? 1 : 0,
      grams: 0,
      sq_ft: unit === 'sq_ft' ? 40 : 0,
      sq_ft_length: unit === 'sq_ft' ? 8 : 0,
      sq_ft_width: unit === 'sq_ft' ? 5 : 0
    };
    newItem.line_total = calculateLineTotal(newItem);
    setBillItems(prev => [...prev, newItem]);
  };

  const updateBillItem = (id: string, updates: Partial<BillLineItem>) => {
    setBillItems(prev => prev.map(it => {
      if (it.id !== id) return it;
      const updated = { ...it, ...updates };
      // Auto compute sq_ft if length and width changed
      if (updated.unit === 'sq_ft' && updates.sq_ft_length !== undefined || updates.sq_ft_width !== undefined) {
        if ((updated.sq_ft_length || 0) > 0 && (updated.sq_ft_width || 0) > 0) {
          updated.sq_ft = Math.round(((updated.sq_ft_length || 0) * (updated.sq_ft_width || 0)) * 100) / 100;
        }
      }
      updated.line_total = calculateLineTotal(updated);
      return updated;
    }));
  };

  const removeBillItem = (id: string) => {
    setBillItems(prev => prev.filter(it => it.id !== id));
  };

  const handleSaveRealBillAndDispatch = async () => {
    if (billItems.length === 0) {
      setBillError('Please add at least one clothing item or curtains item.');
      return;
    }

    setBillError(null);
    setSavingBill(true);

    try {
      const payloadItems = billItems.map(it => {
        const length = Math.max(0, it.sq_ft_length || 0);
        const width = Math.max(0, it.sq_ft_width || 0);
        const computedSqFt = (length > 0 && width > 0) ? (length * width) : Math.max(0, it.sq_ft || 0);

        return {
          category_id: it.category_id || null,
          item_name: it.item_name,
          unit: it.unit,
          quantity: it.unit === 'piece' ? Math.max(1, it.quantity || 1) : 1,
          rate: Math.max(0, it.rate || 0),
          kg: it.unit === 'kg' ? (it.kg || 0) : 0,
          grams: it.unit === 'kg' ? (it.grams || 0) : 0,
          sq_ft: it.unit === 'sq_ft' ? computedSqFt : 0,
          sq_ft_length: it.unit === 'sq_ft' ? length : 0,
          sq_ft_width: it.unit === 'sq_ft' ? width : 0,
          line_total: calculateLineTotal(it)
        };
      });

      const res = await fetch(`/api/orders/${orderId}/items`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          items: payloadItems,
          delivery_charge: billDeliveryCharge,
          discount_amount: billDiscount,
          assigned_delivery_boy_id: billDeliveryBoyId || undefined,
          target_status: billTargetStatus
        })
      });

      const resData = await res.json();
      if (!res.ok) {
        throw new Error(resData.error || 'Failed to save bill');
      }

      // Sync updated order directly to Firestore
      syncOrderToFirestore({
        id: orderId,
        subtotal: resData.subtotal,
        final_total: resData.finalTotal,
        outstanding_amount: resData.outstandingAmount,
        status: resData.status,
        assigned_delivery_boy_id: billDeliveryBoyId || null
      });

      setBillSaveSuccess('Real Bill generated successfully! Order dispatched for delivery.');
      setIsEditingBill(false);
      await fetchDetail();
      onUpdate();

      setTimeout(() => setBillSaveSuccess(null), 4000);
    } catch (err: any) {
      setBillError(err.message || 'Error saving real bill');
    } finally {
      setSavingBill(false);
    }
  };

  if (loading || !data) {
    return (
      <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl p-8 max-w-sm w-full text-center">
          <div className="w-8 h-8 border-3 border-emerald-800 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-sm font-semibold text-slate-700">Loading Order Details...</p>
        </div>
      </div>
    );
  }

  const { order, items, photos, invoice, payments, statusHistory, assignmentHistory } = data;
  const singlePickupPhoto = photos[0]?.file_url || (Array.isArray(order.pickup_photos) ? order.pickup_photos[0] : null);
  const hasProof = Boolean(order.pickup_photos || order.iron_count || order.wash_count || order.dryclean_count || order.pickup_proof_notes || photos.length > 0);

  return (
    <>
      <div className="fixed inset-0 z-50 bg-slate-900/70 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
        <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full p-5 sm:p-7 border border-slate-200 my-6">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-black uppercase tracking-wider text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  {order.order_number}
                </span>
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-800 capitalize border border-slate-200">
                  {order.status.replace(/_/g, ' ')}
                </span>
                {order.payment_status === 'paid' && (
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                    Paid In Full
                  </span>
                )}
              </div>
              <h2 className="text-lg font-bold text-slate-900 mt-1">
                {order.customer_name} • {order.shop_name}
              </h2>
            </div>

            <div className="flex items-center gap-2">
              {hasProof && (
                <button
                  type="button"
                  onClick={() => setShowPickupProofModal(true)}
                  className="px-3 py-1.5 text-xs font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 rounded-lg flex items-center gap-1.5 border border-emerald-200"
                >
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-700" />
                  <span>Pickup Proof Slip</span>
                </button>
              )}

              {invoice && (
                <button
                  type="button"
                  onClick={() => setShowInvoiceModal(true)}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg flex items-center gap-1.5 border border-slate-200"
                >
                  <Receipt className="w-3.5 h-3.5 text-slate-600" />
                  <span>Invoice #{invoice.invoice_number}</span>
                </button>
              )}

              {invoice && (
                <button
                  type="button"
                  onClick={handleWhatsAppShare}
                  className="px-3 py-1.5 text-xs font-bold text-white bg-emerald-800 hover:bg-emerald-900 rounded-lg shadow-xs flex items-center gap-1.5"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>WhatsApp</span>
                </button>
              )}

              <button
                type="button"
                onClick={onClose}
                className="text-slate-400 hover:text-slate-600 font-bold p-1"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Sub Navigation Tabs */}
          <div className="flex gap-2 border-b border-slate-100 mt-4 pb-2 text-xs font-bold">
            <button
              type="button"
              onClick={() => setActiveTab('details')}
              className={`pb-2 px-3 border-b-2 transition-colors ${
                activeTab === 'details'
                  ? 'border-emerald-800 text-emerald-900'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              Order Details & Customer
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('items')}
              className={`pb-2 px-3 border-b-2 transition-colors flex items-center gap-1.5 ${
                activeTab === 'items'
                  ? 'border-emerald-800 text-emerald-900'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <span>Clothing Items & Real Bill ({items.length})</span>
              {order.final_total === 0 && (
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-amber-100 text-amber-800 animate-pulse">
                  Bill Pending
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('photos')}
              className={`pb-2 px-3 border-b-2 transition-colors flex items-center gap-1.5 ${
                activeTab === 'photos'
                  ? 'border-emerald-800 text-emerald-900'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <span>Pickup Photo Proof</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                photos.length > 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
              }`}>
                {photos.length > 0 ? 'Uploaded' : 'None'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('history')}
              className={`pb-2 px-3 border-b-2 transition-colors ${
                activeTab === 'history'
                  ? 'border-emerald-800 text-emerald-900'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              Audit & Assignment History
            </button>
          </div>

          {/* Success Banner */}
          {billSaveSuccess && (
            <div className="mt-3 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{billSaveSuccess}</span>
            </div>
          )}

          {/* TAB 1: DETAILS */}
          {activeTab === 'details' && (
            <div className="py-4 space-y-4 text-xs">
              {/* Ready for billing banner if order is picked up without items */}
              {(order.status === 'picked_up' || order.status === 'in_processing') && items.length === 0 && (
                <div className="p-4 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-300 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
                  <div className="flex items-start gap-2.5">
                    <Sparkles className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="font-bold text-amber-950 text-sm">Clothes Picked Up • Accurate Real Bill Required</h4>
                      <p className="text-amber-800 text-xs mt-0.5">
                        The delivery partner handed over the garments. Inspect the clothes, enter quantities and curtain square feet, then dispatch to a delivery partner.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('items');
                      setIsEditingBill(true);
                    }}
                    className="px-4 py-2 bg-emerald-800 hover:bg-emerald-900 text-white font-bold rounded-xl text-xs shadow-xs shrink-0 flex items-center gap-1.5"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>Create Real Bill & Dispatch</span>
                  </button>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Customer card */}
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                  <span className="text-[10px] font-bold uppercase text-slate-500 tracking-wider block">Customer Details</span>
                  <div className="text-sm font-bold text-slate-900">{order.customer_name}</div>
                  <div className="flex items-center gap-1 text-slate-700">
                    <Phone className="w-3.5 h-3.5 text-emerald-700" />
                    <a href={`tel:${order.customer_mobile}`} className="font-semibold hover:underline">
                      {order.customer_mobile}
                    </a>
                  </div>
                  <div className="flex items-start gap-1 text-slate-600 pt-1">
                    <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                    <div>
                      {order.flat_number && <span className="font-semibold">{order.flat_number}, {order.building_name} - </span>}
                      <span>{order.pickup_address}</span>
                      <div className="text-[11px] text-emerald-800 font-semibold mt-0.5">Area: {order.area}</div>
                    </div>
                  </div>

                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${order.pickup_address}, ${order.area}, Pune`)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-blue-700 hover:underline font-semibold pt-1"
                  >
                    <Navigation className="w-3 h-3" />
                    <span>Open in Google Maps</span>
                  </a>
                </div>

                {/* Billing Summary card */}
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase text-slate-500 tracking-wider block">Billing & Payment</span>
                    {(user?.role === 'admin' || user?.role === 'shop') && (
                      <button
                        type="button"
                        onClick={() => {
                          setActiveTab('items');
                          setIsEditingBill(true);
                        }}
                        className="text-[11px] text-emerald-800 hover:underline font-bold flex items-center gap-1"
                      >
                        <Edit3 className="w-3 h-3" />
                        <span>Edit Real Bill</span>
                      </button>
                    )}
                  </div>

                  <div className="flex justify-between text-slate-600">
                    <span>Subtotal:</span>
                    <span className="font-semibold text-slate-900">₹{order.subtotal.toFixed(2)}</span>
                  </div>

                  {order.delivery_charge > 0 && (
                    <div className="flex justify-between text-slate-600">
                      <span>Delivery Fee:</span>
                      <span className="font-semibold text-slate-900">₹{order.delivery_charge.toFixed(2)}</span>
                    </div>
                  )}

                  {order.discount_amount > 0 && (
                    <div className="flex justify-between text-emerald-700">
                      <span>Discount:</span>
                      <span className="font-semibold">-₹{order.discount_amount.toFixed(2)}</span>
                    </div>
                  )}

                  <div className="flex justify-between text-slate-600">
                    <span>Final Bill:</span>
                    <span className="font-bold text-slate-900 text-sm">₹{order.final_total.toFixed(2)}</span>
                  </div>

                  <div className="flex justify-between text-slate-600">
                    <span>Paid to Date:</span>
                    <span className="font-semibold text-emerald-800">₹{order.amount_paid.toFixed(2)}</span>
                  </div>

                  <div className="flex justify-between pt-2 border-t border-slate-200">
                    <span className="font-bold text-slate-800">Remaining Due:</span>
                    <span className="font-black text-red-700 text-base">₹{order.outstanding_amount.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {/* Handover Proof Details Summary Card */}
              {hasProof && (
                <div className="p-4 bg-emerald-50/50 rounded-xl border border-emerald-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase text-emerald-900 tracking-wider flex items-center gap-1">
                      <ShieldCheck className="w-4 h-4 text-emerald-700" />
                      <span>Pickup Handover Proof Summary</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowPickupProofModal(true)}
                      className="text-xs font-bold text-emerald-800 underline hover:text-emerald-950"
                    >
                      View Full Proof Receipt
                    </button>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-center">
                    <div className="bg-white p-2 rounded-lg border border-emerald-100">
                      <span className="text-[10px] text-slate-500 block">Total Clothes</span>
                      <span className="font-extrabold text-sm text-slate-900">
                        {order.total_pieces || (order.iron_count || 0) + (order.dryclean_count || 0) + (order.wash_count || 0) || 'Recorded'} pcs
                      </span>
                    </div>
                    <div className="bg-white p-2 rounded-lg border border-emerald-100">
                      <span className="text-[10px] text-slate-500 block">Ironing</span>
                      <span className="font-bold text-sm text-purple-900">{order.iron_count || 0} pcs</span>
                    </div>
                    <div className="bg-white p-2 rounded-lg border border-emerald-100">
                      <span className="text-[10px] text-slate-500 block">Dry Clean</span>
                      <span className="font-bold text-sm text-amber-900">{order.dryclean_count || 0} pcs</span>
                    </div>
                    <div className="bg-white p-2 rounded-lg border border-emerald-100">
                      <span className="text-[10px] text-slate-500 block">Washing / Fold</span>
                      <span className="font-bold text-sm text-teal-900">{order.wash_count || 0} pcs</span>
                    </div>
                  </div>

                  {order.pickup_proof_notes && (
                    <div className="mt-2 bg-white p-2.5 rounded-lg border border-emerald-100 text-xs">
                      <span className="font-bold text-slate-700 block mb-0.5">Clothes Handover Note:</span>
                      <span className="text-slate-800 italic">{order.pickup_proof_notes}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Assignment Box */}
              {(user?.role === 'admin' || user?.role === 'shop') && (
                <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-3">
                  <span className="text-xs font-bold uppercase text-slate-800 block">
                    Assign or Reassign Delivery Boy
                  </span>
                  <div className="flex flex-col sm:flex-row items-center gap-2">
                    <select
                      value={selectedBoyId}
                      onChange={(e) => setSelectedBoyId(e.target.value)}
                      className="w-full sm:w-80 px-3 py-2 rounded-lg border border-slate-300 text-xs focus:ring-2 focus:ring-emerald-600"
                    >
                      <option value="">-- Select Delivery Boy --</option>
                      {deliveryBoys.map(boy => {
                        const statusLabel = boy.is_online === 1 
                          ? (boy.is_busy ? '⚠️ Online (Busy)' : '✅ Online (Available)') 
                          : '⚪ Offline';
                        return (
                          <option key={boy.id} value={boy.id}>
                            {boy.name} [{statusLabel}] - {boy.active_jobs_count || 0} active ({boy.area_name || 'All'})
                          </option>
                        );
                      })}
                    </select>

                    <button
                      type="button"
                      disabled={assigning || !selectedBoyId}
                      onClick={handleAssign}
                      className="w-full sm:w-auto px-4 py-2 bg-emerald-800 hover:bg-emerald-900 text-white font-bold rounded-lg disabled:opacity-50 shadow-xs"
                    >
                      {assigning ? 'Assigning...' : 'Assign Delivery Boy'}
                    </button>
                  </div>
                </div>
              )}

              {/* Update Status Box */}
              {(user?.role === 'admin' || user?.role === 'shop') && (
                <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-3">
                  <span className="text-xs font-bold uppercase text-slate-800 block">
                    Update Order Operational Status
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <select
                      value={newStatus}
                      onChange={(e) => setNewStatus(e.target.value)}
                      className="px-3 py-2 rounded-lg border border-slate-300 text-xs font-semibold focus:ring-2 focus:ring-emerald-600"
                    >
                      <option value="pending">Pending</option>
                      <option value="assigned">Assigned</option>
                      <option value="arriving">Arriving</option>
                      <option value="picked_up">Picked Up</option>
                      <option value="in_processing">In Processing (Washing/Ironing)</option>
                      <option value="ready_for_delivery">Ready for Delivery</option>
                      <option value="out_for_delivery">Out for Delivery</option>
                      <option value="delivered">Delivered</option>
                      <option value="failed">Failed</option>
                      <option value="rescheduled">Rescheduled</option>
                      <option value="cancelled">Cancelled</option>
                    </select>

                    <input
                      type="text"
                      value={statusNotes}
                      onChange={(e) => setStatusNotes(e.target.value)}
                      placeholder="Optional notes or remarks"
                      className="px-3 py-2 rounded-lg border border-slate-300 text-xs focus:ring-2 focus:ring-emerald-600"
                    />

                    <button
                      type="button"
                      disabled={updatingStatus}
                      onClick={handleUpdateStatus}
                      className="px-4 py-2 bg-slate-900 hover:bg-black text-white font-bold rounded-lg shadow-xs disabled:opacity-50"
                    >
                      {updatingStatus ? 'Updating...' : 'Update Status'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: CLOTHING ITEMS & REAL BILL BUILDER */}
          {activeTab === 'items' && (
            <div className="py-4 space-y-4">
              {/* If editing real bill */}
              {isEditingBill ? (
                <div className="bg-slate-50 p-4 sm:p-5 rounded-2xl border border-slate-300 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-200 gap-2">
                    <div>
                      <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                        <Edit3 className="w-4 h-4 text-emerald-800" />
                        <span>Create / Edit Real Final Bill</span>
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Select clothes, curtains with square feet, or weight, then assign a delivery partner for delivery.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => setIsEditingBill(false)}
                      className="text-xs font-semibold text-slate-600 hover:text-slate-900 bg-white px-3 py-1.5 rounded-lg border border-slate-200 self-start sm:self-auto"
                    >
                      Cancel Edit
                    </button>
                  </div>

                  {billError && (
                    <div className="p-3 bg-red-50 text-red-700 text-xs rounded-xl border border-red-200 flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{billError}</span>
                    </div>
                  )}

                  {/* Quick Category Shortcut Badges */}
                  <div>
                    <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block mb-2">
                      Quick Add Items:
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {categories.map(cat => (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => addLineItemFromCategory(cat)}
                          className="px-2.5 py-1 text-xs font-semibold bg-white hover:bg-emerald-50 hover:text-emerald-900 hover:border-emerald-300 rounded-lg border border-slate-200 shadow-2xs transition-all flex items-center gap-1"
                        >
                          <Plus className="w-3 h-3 text-emerald-700" />
                          <span>{cat.name}</span>
                          <span className="text-[10px] text-slate-400">
                            (₹{cat.default_rate}{cat.unit === 'sq_ft' ? '/sq.ft' : cat.unit === 'kg' ? '/kg' : ''})
                          </span>
                        </button>
                      ))}

                      {/* Custom Sq Ft Button for Curtains */}
                      <button
                        type="button"
                        onClick={() => addCustomLineItem('sq_ft')}
                        className="px-2.5 py-1 text-xs font-bold bg-amber-50 hover:bg-amber-100 text-amber-900 rounded-lg border border-amber-300 shadow-2xs flex items-center gap-1"
                      >
                        <Sparkles className="w-3 h-3 text-amber-600" />
                        <span>+ Custom Curtain / Rug (Sq Ft)</span>
                      </button>

                      {/* Custom Piece Button */}
                      <button
                        type="button"
                        onClick={() => addCustomLineItem('piece')}
                        className="px-2.5 py-1 text-xs font-bold bg-sky-50 hover:bg-sky-100 text-sky-900 rounded-lg border border-sky-300 shadow-2xs flex items-center gap-1"
                      >
                        <Plus className="w-3 h-3 text-sky-700" />
                        <span>+ Other Item (Piece)</span>
                      </button>
                    </div>
                  </div>

                  {/* Line Items Table / Editor */}
                  <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-2xs">
                    {billItems.length === 0 ? (
                      <div className="p-8 text-center text-xs text-slate-500">
                        No items added yet. Click any quick add item above or add a custom item to begin.
                      </div>
                    ) : (
                      <div className="divide-y divide-slate-100">
                        {billItems.map((item, index) => {
                          const lineTot = calculateLineTotal(item);

                          return (
                            <div key={item.id} className="p-3 sm:p-3.5 space-y-2">
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                <div className="flex items-center gap-2 flex-1">
                                  <span className="w-5 text-slate-400 font-mono text-xs">{index + 1}.</span>
                                  <input
                                    type="text"
                                    value={item.item_name}
                                    onChange={(e) => updateBillItem(item.id, { item_name: e.target.value })}
                                    className="flex-1 font-semibold text-slate-900 text-xs px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-1 focus:ring-emerald-600"
                                    placeholder="Item name (e.g. Living Room Curtains)"
                                  />
                                  <select
                                    value={item.unit}
                                    onChange={(e) => updateBillItem(item.id, { unit: e.target.value as any })}
                                    className="text-xs px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-bold text-slate-700"
                                  >
                                    <option value="piece">Per Piece</option>
                                    <option value="sq_ft">Square Feet (Sq. Ft)</option>
                                    <option value="kg">Per Kg</option>
                                  </select>
                                </div>

                                <div className="flex items-center justify-between sm:justify-end gap-3">
                                  <div className="text-right">
                                    <span className="text-[10px] text-slate-400 uppercase block font-semibold">Line Total</span>
                                    <span className="font-mono font-black text-sm text-slate-900">₹{lineTot.toFixed(2)}</span>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => removeBillItem(item.id)}
                                    className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                    title="Remove item"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </div>

                              {/* Unit Specific Controls */}
                              {item.unit === 'sq_ft' && (
                                <div className="bg-amber-50/70 p-2.5 rounded-lg border border-amber-200 text-xs grid grid-cols-1 sm:grid-cols-4 gap-2 items-center">
                                  <div>
                                    <label className="text-[10px] font-bold text-amber-900 block mb-0.5">Length (Feet)</label>
                                    <input
                                      type="number"
                                      step="0.1"
                                      min="0"
                                      value={item.sq_ft_length || ''}
                                      onChange={(e) => updateBillItem(item.id, { sq_ft_length: parseFloat(e.target.value) || 0 })}
                                      placeholder="Length ft"
                                      className="w-full px-2 py-1 bg-white border border-amber-300 rounded font-mono font-semibold"
                                    />
                                  </div>

                                  <div>
                                    <label className="text-[10px] font-bold text-amber-900 block mb-0.5">Width (Feet)</label>
                                    <input
                                      type="number"
                                      step="0.1"
                                      min="0"
                                      value={item.sq_ft_width || ''}
                                      onChange={(e) => updateBillItem(item.id, { sq_ft_width: parseFloat(e.target.value) || 0 })}
                                      placeholder="Width ft"
                                      className="w-full px-2 py-1 bg-white border border-amber-300 rounded font-mono font-semibold"
                                    />
                                  </div>

                                  <div>
                                    <label className="text-[10px] font-bold text-amber-900 block mb-0.5">
                                      Total Sq. Ft (L × W)
                                    </label>
                                    <input
                                      type="number"
                                      step="0.1"
                                      min="0"
                                      value={item.sq_ft || ''}
                                      onChange={(e) => updateBillItem(item.id, { sq_ft: parseFloat(e.target.value) || 0 })}
                                      placeholder="Sq ft"
                                      className="w-full px-2 py-1 bg-white border border-amber-300 rounded font-mono font-black text-amber-950"
                                    />
                                  </div>

                                  <div>
                                    <label className="text-[10px] font-bold text-amber-900 block mb-0.5">Rate (₹/sq.ft)</label>
                                    <input
                                      type="number"
                                      min="0"
                                      value={item.rate || ''}
                                      onChange={(e) => updateBillItem(item.id, { rate: parseFloat(e.target.value) || 0 })}
                                      placeholder="Rate"
                                      className="w-full px-2 py-1 bg-white border border-amber-300 rounded font-mono font-semibold"
                                    />
                                  </div>
                                </div>
                              )}

                              {item.unit === 'kg' && (
                                <div className="bg-sky-50/70 p-2.5 rounded-lg border border-sky-200 text-xs grid grid-cols-1 sm:grid-cols-3 gap-2 items-center">
                                  <div>
                                    <label className="text-[10px] font-bold text-sky-900 block mb-0.5">Kg</label>
                                    <input
                                      type="number"
                                      min="0"
                                      value={item.kg || ''}
                                      onChange={(e) => updateBillItem(item.id, { kg: parseInt(e.target.value, 10) || 0 })}
                                      placeholder="Kg"
                                      className="w-full px-2 py-1 bg-white border border-sky-300 rounded font-mono font-semibold"
                                    />
                                  </div>

                                  <div>
                                    <label className="text-[10px] font-bold text-sky-900 block mb-0.5">Grams (0-999)</label>
                                    <input
                                      type="number"
                                      min="0"
                                      max="999"
                                      step="50"
                                      value={item.grams || ''}
                                      onChange={(e) => updateBillItem(item.id, { grams: parseInt(e.target.value, 10) || 0 })}
                                      placeholder="Grams"
                                      className="w-full px-2 py-1 bg-white border border-sky-300 rounded font-mono font-semibold"
                                    />
                                  </div>

                                  <div>
                                    <label className="text-[10px] font-bold text-sky-900 block mb-0.5">Rate (₹/kg)</label>
                                    <input
                                      type="number"
                                      min="0"
                                      value={item.rate || ''}
                                      onChange={(e) => updateBillItem(item.id, { rate: parseFloat(e.target.value) || 0 })}
                                      placeholder="Rate"
                                      className="w-full px-2 py-1 bg-white border border-sky-300 rounded font-mono font-semibold"
                                    />
                                  </div>
                                </div>
                              )}

                              {item.unit === 'piece' && (
                                <div className="bg-slate-50/70 p-2 rounded-lg border border-slate-200 text-xs grid grid-cols-2 gap-2 items-center sm:w-80">
                                  <div>
                                    <label className="text-[10px] font-bold text-slate-600 block mb-0.5">Quantity (Pieces)</label>
                                    <input
                                      type="number"
                                      min="1"
                                      value={item.quantity || ''}
                                      onChange={(e) => updateBillItem(item.id, { quantity: parseInt(e.target.value, 10) || 0 })}
                                      className="w-full px-2 py-1 bg-white border border-slate-300 rounded font-mono font-semibold"
                                    />
                                  </div>

                                  <div>
                                    <label className="text-[10px] font-bold text-slate-600 block mb-0.5">Rate per Piece (₹)</label>
                                    <input
                                      type="number"
                                      min="0"
                                      value={item.rate || ''}
                                      onChange={(e) => updateBillItem(item.id, { rate: parseFloat(e.target.value) || 0 })}
                                      className="w-full px-2 py-1 bg-white border border-slate-300 rounded font-mono font-semibold"
                                    />
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Adjustments: Delivery Charge, Discount & Summary */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                    <div className="space-y-2 bg-white p-3 rounded-xl border border-slate-200 text-xs">
                      <span className="font-bold text-slate-800 uppercase text-[10px] block">Bill Adjustments</span>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] font-bold text-slate-600 block mb-0.5">Delivery Fee (₹)</label>
                          <input
                            type="number"
                            min="0"
                            value={billDeliveryCharge || ''}
                            onChange={(e) => setBillDeliveryCharge(Math.max(0, parseFloat(e.target.value) || 0))}
                            placeholder="0"
                            className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg font-mono font-semibold"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-slate-600 block mb-0.5">Discount Amount (₹)</label>
                          <input
                            type="number"
                            min="0"
                            value={billDiscount || ''}
                            onChange={(e) => setBillDiscount(Math.max(0, parseFloat(e.target.value) || 0))}
                            placeholder="0"
                            className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg font-mono font-semibold"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="bg-emerald-50/80 p-3.5 rounded-xl border border-emerald-200 text-xs flex flex-col justify-between">
                      <div className="flex justify-between text-slate-600">
                        <span>Items Subtotal:</span>
                        <span className="font-mono font-bold text-slate-900">₹{calculateBillSubtotal().toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-slate-600">
                        <span>Delivery Fee:</span>
                        <span className="font-mono text-slate-700">+₹{billDeliveryCharge.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-emerald-800">
                        <span>Discount:</span>
                        <span className="font-mono font-semibold">-₹{billDiscount.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between pt-1.5 border-t border-emerald-300 font-black text-emerald-950">
                        <span className="text-sm">Final Bill:</span>
                        <span className="font-mono text-lg">₹{calculateBillFinalTotal().toFixed(2)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Dispatch Settings */}
                  <div className="p-3.5 bg-white rounded-xl border border-slate-200 space-y-2 text-xs">
                    <span className="font-bold text-slate-800 uppercase text-[10px] block">
                      Dispatch To Delivery Partner:
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] font-bold text-slate-600 block mb-0.5">
                          Assigned Delivery Boy
                        </label>
                        <select
                          value={billDeliveryBoyId}
                          onChange={(e) => setBillDeliveryBoyId(e.target.value)}
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg font-semibold text-xs"
                        >
                          <option value="">-- Leave Unassigned (Hold at Shop) --</option>
                          {deliveryBoys.map(boy => (
                            <option key={boy.id} value={boy.id}>
                              {boy.name} [{boy.is_online ? 'Online' : 'Offline'}] - {boy.active_jobs_count || 0} active jobs
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="text-[10px] font-bold text-slate-600 block mb-0.5">
                          Target Status
                        </label>
                        <select
                          value={billTargetStatus}
                          onChange={(e) => setBillTargetStatus(e.target.value as any)}
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg font-semibold text-xs"
                        >
                          <option value="ready_for_delivery">Ready for Delivery (Shelf Packed)</option>
                          <option value="out_for_delivery">Out for Delivery (Dispatched Immediately)</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Save Action */}
                  <div className="pt-2 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setIsEditingBill(false)}
                      className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded-xl"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={savingBill || billItems.length === 0}
                      onClick={handleSaveRealBillAndDispatch}
                      className="px-5 py-2.5 text-xs font-bold text-white bg-emerald-800 hover:bg-emerald-900 rounded-xl shadow-xs disabled:opacity-50 transition-colors flex items-center gap-1.5"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>{savingBill ? 'Saving & Dispatching...' : 'Save Real Bill & Dispatch for Delivery'}</span>
                    </button>
                  </div>
                </div>
              ) : (
                /* Static Items View */
                <div className="space-y-4">
                  {(user?.role === 'admin' || user?.role === 'shop') && (
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-slate-500">
                        {items.length === 0 ? 'No bill created yet.' : `${items.length} clothing item(s) on record.`}
                      </span>
                      <button
                        type="button"
                        onClick={() => setIsEditingBill(true)}
                        className="px-4 py-2 text-xs font-bold text-white bg-emerald-800 hover:bg-emerald-900 rounded-xl shadow-xs flex items-center gap-1.5"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>{items.length === 0 ? '+ Create Real Bill & Dispatch' : 'Edit Real Bill & Dispatch'}</span>
                      </button>
                    </div>
                  )}

                  {items.length === 0 ? (
                    <div className="p-8 text-center text-xs text-slate-500 bg-slate-50 rounded-xl border border-slate-200">
                      <Package className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                      <p className="font-semibold text-slate-700">No Real Bill Generated Yet</p>
                      <p className="text-slate-500 mt-1">
                        Garments are collected as proof. Click above to add items, curtains with square feet, or weight to generate the accurate bill.
                      </p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto border border-slate-200 rounded-xl">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase">
                            <th className="py-2.5 px-3">Item Name</th>
                            <th className="py-2.5 px-3 text-center">Unit / Measure</th>
                            <th className="py-2.5 px-3 text-right">Applied Rate</th>
                            <th className="py-2.5 px-3 text-right">Line Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {items.map(it => (
                            <tr key={it.id}>
                              <td className="py-2.5 px-3 font-semibold text-slate-900">{it.item_name}</td>
                              <td className="py-2.5 px-3 text-center text-slate-600">
                                {it.unit === 'sq_ft' 
                                  ? `${it.sq_ft} sq.ft ${it.sq_ft_length && it.sq_ft_width ? `(${it.sq_ft_length} × ${it.sq_ft_width} ft)` : ''}`
                                  : it.unit === 'kg' 
                                    ? (it.weight_display || `${it.quantity} kg`)
                                    : `${it.quantity} pcs`}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono text-slate-600">
                                ₹{it.rate.toFixed(2)}{it.unit === 'sq_ft' ? '/sq.ft' : it.unit === 'kg' ? '/kg' : ''}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
                                ₹{it.line_total.toFixed(2)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="bg-slate-50 font-bold border-t border-slate-200 text-slate-900">
                            <td colSpan={3} className="py-2.5 px-3 text-right">Subtotal:</td>
                            <td className="py-2.5 px-3 text-right font-mono">₹{order.subtotal.toFixed(2)}</td>
                          </tr>
                          {order.delivery_charge > 0 && (
                            <tr className="bg-slate-50 font-bold text-slate-700">
                              <td colSpan={3} className="py-2 px-3 text-right">Delivery Charge:</td>
                              <td className="py-2 px-3 text-right font-mono">₹{order.delivery_charge.toFixed(2)}</td>
                            </tr>
                          )}
                          {order.discount_amount > 0 && (
                            <tr className="bg-slate-50 font-bold text-emerald-800">
                              <td colSpan={3} className="py-2 px-3 text-right">Discount:</td>
                              <td className="py-2 px-3 text-right font-mono">-₹{order.discount_amount.toFixed(2)}</td>
                            </tr>
                          )}
                          <tr className="bg-emerald-50 font-black border-t border-emerald-200 text-emerald-950">
                            <td colSpan={3} className="py-2.5 px-3 text-right">Final Bill:</td>
                            <td className="py-2.5 px-3 text-right font-mono text-sm">₹{order.final_total.toFixed(2)}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: SINGLE PICKUP PHOTO PROOF */}
          {activeTab === 'photos' && (
            <div className="py-4 space-y-4">
              <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-emerald-950 text-xs flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                  <span>
                    Pickup photo proof captured during garment handover at doorstep or shop counter.
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={uploadingPhoto}
                    onClick={() => setShowCameraModal(true)}
                    className="py-1.5 px-3 bg-sky-500 hover:bg-sky-600 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    <span>{uploadingPhoto ? 'Processing...' : '📸 Click Photo'}</span>
                  </button>
                  <button
                    type="button"
                    disabled={uploadingPhoto}
                    onClick={() => photoFileInputRef.current?.click()}
                    className="py-1.5 px-3 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors"
                  >
                    <Upload className="w-3.5 h-3.5 text-slate-500" />
                    <span>Upload File</span>
                  </button>
                </div>
              </div>

              {photoError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{photoError}</span>
                </div>
              )}

              <input
                ref={photoFileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (f) await handlePhotoUpload(f);
                  if (e.target) e.target.value = '';
                }}
              />

              {photos.length === 0 ? (
                <div 
                  onClick={() => setShowCameraModal(true)}
                  className="p-10 text-center text-xs text-slate-400 bg-slate-50 hover:bg-sky-50/50 rounded-2xl border-2 border-dashed border-slate-200 hover:border-sky-300 cursor-pointer transition-colors group"
                >
                  <div className="w-12 h-12 rounded-full bg-white shadow-xs border border-slate-200 flex items-center justify-center mx-auto mb-2 group-hover:scale-105 transition-transform">
                    <Camera className="w-6 h-6 text-slate-400 group-hover:text-sky-600" />
                  </div>
                  <p className="font-semibold text-slate-700">No Pickup Photo Uploaded Yet</p>
                  <p className="text-slate-400 mt-0.5">Click here or use the buttons above to capture or upload a proof photo.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {photos.map((p, idx) => (
                    <div key={p.id || idx} className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-slate-800">
                          Pickup Photo Proof #{idx + 1}
                        </span>
                        <span className="text-[10px] text-emerald-800 font-bold bg-emerald-100 px-2 py-0.5 rounded">
                          Uploaded
                        </span>
                      </div>
                      <div className="rounded-lg overflow-hidden border border-slate-200 aspect-video bg-black">
                        <img src={p.file_url} alt="Pickup Proof" className="w-full h-full object-contain" />
                      </div>
                      <div className="text-[11px] text-slate-500 mt-2 flex justify-between">
                        <span>Captured: {new Date(p.created_at).toLocaleString('en-IN')}</span>
                        {p.caption && <span className="font-semibold">{p.caption}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 4: AUDIT & ASSIGNMENT HISTORY */}
          {activeTab === 'history' && (
            <div className="py-4 space-y-4 text-xs">
              <div>
                <span className="font-bold text-slate-800 uppercase text-[11px] mb-2 block">Assignment History</span>
                <div className="bg-slate-50 rounded-xl border border-slate-200 divide-y divide-slate-200">
                  {assignmentHistory.length === 0 ? (
                    <div className="p-3 text-slate-400 italic">No previous assignment logs</div>
                  ) : (
                    assignmentHistory.map(ah => (
                      <div key={ah.id} className="p-3 flex justify-between items-center">
                        <div>
                          <div className="font-semibold text-slate-900">
                            Assigned to <strong>{ah.delivery_boy_name}</strong> for {ah.stage}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            By: {ah.assigned_by_name || 'System'} • {ah.notes || 'Job assigned'}
                          </div>
                        </div>
                        <span className="text-[11px] text-slate-400">
                          {new Date(ah.assigned_at).toLocaleString('en-IN')}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div>
                <span className="font-bold text-slate-800 uppercase text-[11px] mb-2 block">Status Transitions</span>
                <div className="bg-slate-50 rounded-xl border border-slate-200 divide-y divide-slate-200">
                  {statusHistory.map(sh => (
                    <div key={sh.id} className="p-3 flex justify-between items-center">
                      <div>
                        <div className="font-semibold text-slate-900 capitalize">
                          Status changed to: <strong>{sh.status.replace(/_/g, ' ')}</strong>
                        </div>
                        <div className="text-[11px] text-slate-500">
                          By: {sh.changed_by_name || 'User'} {sh.notes ? `• ${sh.notes}` : ''}
                        </div>
                      </div>
                      <span className="text-[11px] text-slate-400">
                        {new Date(sh.created_at).toLocaleString('en-IN')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="pt-4 border-t border-slate-200 flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl"
            >
              Close
            </button>
          </div>
        </div>
      </div>

      {showInvoiceModal && invoice && (
        <InvoiceModal orderIdOrInvoiceId={invoice.id} onClose={() => setShowInvoiceModal(false)} />
      )}

      {showPickupProofModal && (
        <PickupProofModal
          order={order}
          onClose={() => setShowPickupProofModal(false)}
        />
      )}

      {showDuePaymentModal && data?.order && (
        <DuePaymentCollectionModal
          order={data.order}
          autoCompleteDelivery={true}
          onClose={() => setShowDuePaymentModal(false)}
          onSuccess={async () => {
            setShowDuePaymentModal(false);
            await fetchDetail();
            onUpdate();
          }}
        />
      )}

      {/* Live In-App Camera Viewfinder Modal */}
      <CameraModal
        isOpen={showCameraModal}
        onClose={() => setShowCameraModal(false)}
        onCapture={handlePhotoUpload}
        title="Capture Pickup Photo Proof"
      />
    </>
  );
};
