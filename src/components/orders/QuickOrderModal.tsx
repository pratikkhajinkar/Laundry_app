import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext.tsx';
import type { Customer, Shop, User, ClothingCategory } from '../../types/index.ts';
import { 
  Zap, 
  Truck, 
  Package, 
  Search, 
  UserCheck, 
  MapPin, 
  Phone, 
  Camera, 
  Upload, 
  Trash2, 
  Scale, 
  IndianRupee, 
  AlertCircle, 
  CheckCircle2, 
  X, 
  Sparkles,
  ArrowRight,
  RefreshCw,
  Eye
} from 'lucide-react';
import { syncOrderToFirestore, syncCustomerToFirestore } from '../../services/firestoreSync.ts';

interface QuickOrderModalProps {
  initialType?: 'pickup' | 'delivery';
  onClose: () => void;
  onSuccess: (orderId: string, orderNumber: string) => void;
}

interface PhotoItem {
  id: string;
  photo_type: string;
  image_data: string;
  previewUrl: string;
  caption?: string;
}

export const QuickOrderModal: React.FC<QuickOrderModalProps> = ({
  initialType = 'pickup',
  onClose,
  onSuccess
}) => {
  const { token, user } = useAuth();
  const [orderType, setOrderType] = useState<'pickup' | 'delivery'>(initialType);

  // Reference data
  const [shops, setShops] = useState<Shop[]>([]);
  const [deliveryBoys, setDeliveryBoys] = useState<User[]>([]);
  const [categories, setCategories] = useState<ClothingCategory[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [searching, setSearching] = useState(false);

  // Selected or New Customer
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [customerMobile, setCustomerMobile] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [customerArea, setCustomerArea] = useState('Warje');
  const [buildingName, setBuildingName] = useState('');
  const [flatNumber, setFlatNumber] = useState('');
  const [customerOldDue, setCustomerOldDue] = useState<number>(0);

  // Order Details
  const [shopId, setShopId] = useState(user?.role === 'shop' ? (user.shop_id || '') : '');
  const [assignedDeliveryBoyId, setAssignedDeliveryBoyId] = useState(
    user?.role === 'delivery' ? user.id : ''
  );
  const [notes, setNotes] = useState('');

  // Pickup shortcut clothes counts & handover proof notes
  const [ironCount, setIronCount] = useState<number>(0);
  const [drycleanCount, setDrycleanCount] = useState<number>(0);
  const [washCount, setWashCount] = useState<number>(0);
  const [pickupProofNotes, setPickupProofNotes] = useState<string>('');

  // Weight Entry (Kg + Grams)
  const [weightKg, setWeightKg] = useState<number>(0);
  const [weightGrams, setWeightGrams] = useState<number>(0);
  const [weightRate, setWeightRate] = useState<number>(80);

  // Photos
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [previewModalUrl, setPreviewModalUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Delivery-specific items (for quick delivery)
  const [deliveryItems, setDeliveryItems] = useState<{ [catId: string]: number }>({});
  const [advancePaid, setAdvancePaid] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'upi' | 'card'>('cash');

  // UI state
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successInfo, setSuccessInfo] = useState<{ orderNumber: string; total: number } | null>(null);

  // Formula: ((kg * 1000 + grams) * rate) / 1000
  const totalGrams = (Math.max(0, weightKg) * 1000) + Math.max(0, Math.min(999, weightGrams));
  const calculatedWeightAmount = totalGrams > 0 
    ? Math.round(((totalGrams * weightRate) / 1000) * 100) / 100 
    : 0;

  // Pieces subtotal for delivery mode
  const piecesSubtotal = Object.entries(deliveryItems).reduce((sum, [catId, qty]) => {
    const cat = categories.find(c => c.id === catId);
    return sum + (qty * (cat?.default_rate || 0));
  }, 0);

  const grandSubtotal = calculatedWeightAmount + piecesSubtotal;
  const combinedPayable = Math.round((grandSubtotal + customerOldDue) * 100) / 100;

  useEffect(() => {
    const fetchMetadata = async () => {
      try {
        const [resShops, resBoys, resCats] = await Promise.all([
          fetch('/api/shops', { headers: { Authorization: `Bearer ${token}` } }),
          fetch('/api/delivery-boys', { headers: { Authorization: `Bearer ${token}` } }),
          fetch('/api/clothing-categories', { headers: { Authorization: `Bearer ${token}` } })
        ]);

        if (resShops.ok) {
          const d = await resShops.json();
          setShops(d.shops);
          if (d.shops.length > 0 && !shopId) setShopId(d.shops[0].id);
        }
        if (resBoys.ok) {
          const d = await resBoys.json();
          setDeliveryBoys(d.deliveryBoys);
        }
        if (resCats.ok) {
          const d = await resCats.json();
          setCategories(d.categories);
          const weightCat = d.categories.find((c: ClothingCategory) => c.unit === 'kg');
          if (weightCat) setWeightRate(weightCat.default_rate);
        }
      } catch (err) {
        console.error(err);
      }
    };

    fetchMetadata();
  }, []);

  // Customer search with debounce
  useEffect(() => {
    if (!customerSearch.trim()) {
      setCustomers([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        setSearching(true);
        const res = await fetch(`/api/customers?q=${encodeURIComponent(customerSearch.trim())}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const d = await res.json();
          setCustomers(d.customers || []);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [customerSearch]);

  const handleSelectCustomer = async (c: Customer) => {
    setSelectedCustomer(c);
    setCustomerName(c.name);
    setCustomerMobile(c.mobile);
    setCustomerAddress(c.pickup_address || c.delivery_address || '');
    setCustomerArea(c.area || 'Warje');
    setBuildingName(c.building_name || '');
    setFlatNumber(c.flat_number || '');
    setCustomerSearch('');
    setCustomers([]);

    // Fetch live due
    try {
      const res = await fetch(`/api/customers/${c.id}/due-orders`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const d = await res.json();
        setCustomerOldDue(Number(d.totalDue) || 0);
      } else {
        setCustomerOldDue(Number(c.total_due) || 0);
      }
    } catch {
      setCustomerOldDue(Number(c.total_due) || 0);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, isCamera = false) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64Data = reader.result as string;
        setPhotos(prev => [
          ...prev,
          {
            id: Math.random().toString(36).substring(2, 9),
            photo_type: isCamera ? 'bag' : 'clothes',
            image_data: base64Data,
            previewUrl: base64Data,
            caption: isCamera ? 'Camera Photo' : file.name
          }
        ]);
      };
      reader.readAsDataURL(file);
    });

    if (e.target) e.target.value = '';
  };

  const handleRemovePhoto = (id: string) => {
    setPhotos(prev => prev.filter(p => p.id !== id));
  };

  // Anti-duplicate protection: disabled when submitting
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);

    if (!customerName.trim()) {
      setError('Please enter customer name.');
      return;
    }
    if (!customerMobile.trim() || customerMobile.trim().length < 10) {
      setError('Please enter a valid 10-digit mobile number.');
      return;
    }
    if (!customerAddress.trim()) {
      setError('Please enter customer address.');
      return;
    }

    try {
      setSubmitting(true);

      const itemsPayload: any[] = [];
      Object.entries(deliveryItems).forEach(([catId, qty]) => {
        if (qty > 0) {
          const cat = categories.find(c => c.id === catId);
          if (cat) {
            itemsPayload.push({
              category_id: cat.id,
              item_name: cat.name,
              quantity: qty,
              rate: cat.default_rate,
              unit: 'piece'
            });
          }
        }
      });

      const payload = {
        order_type: orderType,
        customer_id: selectedCustomer?.id || undefined,
        customer: !selectedCustomer ? {
          name: customerName.trim(),
          mobile: customerMobile.trim(),
          pickup_address: customerAddress.trim(),
          delivery_address: customerAddress.trim(),
          area: customerArea.trim(),
          building_name: buildingName.trim() || null,
          flat_number: flatNumber.trim() || null
        } : undefined,
        shop_id: shopId,
        assigned_delivery_boy_id: assignedDeliveryBoyId || (user?.role === 'delivery' ? user.id : null),
        weight: totalGrams > 0 ? {
          kg: weightKg,
          grams: weightGrams,
          rate: weightRate,
          item_name: 'Wash & Fold (By Weight)'
        } : undefined,
        photos: photos.map(p => ({
          photo_type: p.photo_type,
          image_data: p.image_data,
          caption: p.caption
        })),
        items: itemsPayload.length > 0 ? itemsPayload : undefined,
        special_instructions: notes.trim() || (orderType === 'pickup' ? 'Quick Pickup' : 'Quick Delivery'),
        advance_paid: advancePaid,
        payment_method: paymentMethod,
        pickup_proof_notes: pickupProofNotes.trim() || undefined,
        iron_count: ironCount,
        dryclean_count: drycleanCount,
        wash_count: washCount,
        total_pieces: ironCount + drycleanCount + washCount
      };

      const res = await fetch('/api/orders/quick', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      let data: any = {};
      const resText = await res.text();
      try {
        data = resText ? JSON.parse(resText) : {};
      } catch {
        throw new Error(`Quick order server error (${res.status}). Please check network and retry.`);
      }
      if (!res.ok) throw new Error(data.error || 'Failed to create quick order. Please try again.');

      // Sync directly to Firebase Firestore
      syncOrderToFirestore({
        id: data.orderId,
        order_number: data.orderNumber,
        customer_name: customerName.trim(),
        customer_mobile: customerMobile.trim(),
        pickup_address: customerAddress.trim(),
        delivery_address: customerAddress.trim(),
        area: customerArea.trim(),
        status: data.status || 'pending',
        order_type: orderType,
        final_total: data.finalTotal,
        outstanding_amount: data.outstandingAmount,
        pickup_weight_kg: weightKg,
        pickup_weight_grams: weightGrams,
        pickup_weight_total_grams: totalGrams,
        pickup_weight_rate: weightRate,
        pickup_photos: data.photos
      });

      if (!selectedCustomer) {
        syncCustomerToFirestore({
          id: data.customerId || data.orderId,
          name: customerName.trim(),
          mobile: customerMobile.trim(),
          pickup_address: customerAddress.trim(),
          delivery_address: customerAddress.trim(),
          area: customerArea.trim(),
          building_name: buildingName.trim() || null,
          flat_number: flatNumber.trim() || null
        });
      }

      setSuccessInfo({
        orderNumber: data.orderNumber,
        total: data.finalTotal
      });

      setTimeout(() => {
        onSuccess(data.orderId, data.orderNumber);
      }, 1200);

    } catch (err: any) {
      const msg = err?.message || '';
      if (msg.includes('Unexpected token') || msg.includes('<!DOCTYPE') || msg.includes('is not valid JSON')) {
        setError('सर्व्हर तात्पुरता व्यस्त आहे किंवा रीस्टार्ट होत आहे. कृपया २ सेकंद थांबा आणि पुन्हा प्रयत्न करा.');
      } else {
        setError(msg || 'An error occurred. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full border border-sky-100 overflow-hidden my-auto max-h-[95vh] flex flex-col animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-sky-600 via-sky-500 to-[#0369A1] text-white px-5 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-white/20 backdrop-blur-xs flex items-center justify-center shadow-xs">
              <Zap className="w-5 h-5 text-amber-300 fill-amber-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-black tracking-tight">Quick Create</h3>
                <span className="bg-white/20 text-white text-[10px] font-black px-2 py-0.5 rounded-full uppercase">
                  1-Click Shortcut
                </span>
              </div>
              <p className="text-[11px] text-sky-100">Select or enter customer details to create order</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Dual Mode Switcher Tabs */}
        <div className="bg-sky-50/70 border-b border-sky-100 p-2 shrink-0">
          <div className="grid grid-cols-2 gap-2 bg-sky-100/60 p-1 rounded-2xl">
            <button
              type="button"
              onClick={() => setOrderType('pickup')}
              className={`py-2 px-3 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 ${
                orderType === 'pickup'
                  ? 'bg-white text-sky-950 shadow-xs'
                  : 'text-slate-600 hover:text-sky-950'
              }`}
            >
              <Package className="w-4 h-4 text-sky-600" />
              <span>Quick Pickup</span>
            </button>
            <button
              type="button"
              onClick={() => setOrderType('delivery')}
              className={`py-2 px-3 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 ${
                orderType === 'delivery'
                  ? 'bg-[#0369A1] text-white shadow-xs'
                  : 'text-slate-600 hover:text-sky-950'
              }`}
            >
              <Truck className="w-4 h-4 text-amber-300" />
              <span>Quick Delivery</span>
            </button>
          </div>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {error && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl flex items-center gap-2.5 text-xs font-bold animate-shake">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          {successInfo && (
            <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-2xl flex items-center gap-3 text-xs font-black">
              <CheckCircle2 className="w-6 h-6 shrink-0 text-emerald-600" />
              <div>
                <p className="text-sm font-black">Order created successfully! ({successInfo.orderNumber})</p>
                <p className="text-[11px] text-emerald-700">Total Bill: ₹{successInfo.total.toFixed(2)}</p>
              </div>
            </div>
          )}

          {/* 1. Customer Search / Selection (Auto-fill) */}
          <div className="bg-sky-50/50 p-4 rounded-2xl border border-sky-100 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-black text-sky-950 uppercase tracking-wider flex items-center gap-1.5">
                <Search className="w-3.5 h-3.5 text-sky-600" />
                <span>Customer Search & Auto-Fill</span>
              </label>
              {selectedCustomer && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCustomer(null);
                    setCustomerName('');
                    setCustomerMobile('');
                    setCustomerAddress('');
                    setCustomerOldDue(0);
                  }}
                  className="text-[11px] font-bold text-sky-700 hover:underline"
                >
                  Clear Selection
                </button>
              )}
            </div>

            {/* Search Input */}
            <div className="relative">
              <input
                type="text"
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
                placeholder="Type customer name or mobile number..."
                className="w-full pl-9 pr-3 py-2 bg-white border border-sky-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-sky-500 focus:outline-hidden"
              />
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              {searching && (
                <RefreshCw className="w-3.5 h-3.5 text-sky-600 absolute right-3 top-3 animate-spin" />
              )}
            </div>

            {/* Search Results Dropdown */}
            {customers.length > 0 && (
              <div className="bg-white rounded-xl border border-sky-200 shadow-lg divide-y divide-slate-100 max-h-44 overflow-y-auto">
                {customers.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => handleSelectCustomer(c)}
                    className="w-full text-left p-2.5 hover:bg-sky-50 transition-colors flex items-center justify-between text-xs"
                  >
                    <div>
                      <span className="font-extrabold text-slate-900 block">{c.name}</span>
                      <span className="text-[11px] text-slate-500 font-mono">{c.mobile} • {c.area}</span>
                    </div>
                    {Number(c.total_due) > 0 && (
                      <span className="text-[10px] font-black bg-rose-50 text-rose-700 border border-rose-200 px-2 py-0.5 rounded-full font-mono">
                        Due: ₹{Number(c.total_due).toFixed(2)}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}

            {/* Selected or Editable Customer Details */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">Customer Name *</label>
                <input
                  type="text"
                  required
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="e.g. John Doe"
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:ring-2 focus:ring-sky-500 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">Mobile Number *</label>
                <input
                  type="tel"
                  required
                  maxLength={10}
                  value={customerMobile}
                  onChange={(e) => setCustomerMobile(e.target.value.replace(/\D/g, ''))}
                  placeholder="e.g. 9822012345"
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold font-mono text-slate-900 focus:ring-2 focus:ring-sky-500 focus:outline-hidden"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="text-[11px] font-bold text-slate-700 block mb-1">Address *</label>
                <input
                  type="text"
                  required
                  value={customerAddress}
                  onChange={(e) => setCustomerAddress(e.target.value)}
                  placeholder="e.g. Flat 402, Sunshine Heights, Warje"
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:ring-2 focus:ring-sky-500 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">Area / Locality</label>
                <select
                  value={customerArea}
                  onChange={(e) => setCustomerArea(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:ring-2 focus:ring-sky-500 focus:outline-hidden"
                >
                  <option value="Warje">Warje</option>
                  <option value="Kothrud">Kothrud</option>
                  <option value="Karve Nagar">Karve Nagar</option>
                  <option value="Bavdhan">Bavdhan</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">Shop Branch</label>
                <select
                  value={shopId}
                  onChange={(e) => setShopId(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:ring-2 focus:ring-sky-500 focus:outline-hidden"
                >
                  {shops.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Old Due alert if any */}
            {customerOldDue > 0 && (
              <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between text-xs">
                <span className="font-bold text-amber-900">Previous Due:</span>
                <span className="font-mono font-black text-rose-700">₹{customerOldDue.toFixed(2)}</span>
              </div>
            )}
          </div>

          {/* CLOTHES HANDOVER PROOF (Shortcut Piece Counters & Proof Note Box) */}
          {orderType === 'pickup' && (
            <div className="bg-amber-50/70 p-4 rounded-2xl border border-amber-200 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-xs font-black text-amber-950 uppercase tracking-wider flex items-center gap-1.5">
                    <Package className="w-3.5 h-3.5 text-amber-600" />
                    <span>Clothes Handover Proof (Pieces Count)</span>
                  </label>
                  <p className="text-[11px] text-amber-800 mt-0.5">
                    Quick piece shortcuts for doorstep handover receipt. Final billing is done at shop.
                  </p>
                </div>
                <span className="text-xs font-black bg-amber-200 text-amber-950 px-3 py-1 rounded-full shadow-2xs">
                  {ironCount + drycleanCount + washCount} Total Pcs
                </span>
              </div>

              {/* 3 Shortcut Counters: Ironing, Dry Clean, Wash & Fold */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* Ironing */}
                <div className="bg-white p-3 rounded-xl border border-amber-200 shadow-2xs">
                  <div className="flex justify-between items-center mb-1.5">
                    <span className="text-xs font-extrabold text-blue-900">Ironing</span>
                    <span className="text-base font-black font-mono text-blue-700">{ironCount}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setIronCount(Math.max(0, ironCount - 1))}
                      className="w-7 h-7 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg font-black text-sm"
                    >
                      -
                    </button>
                    <button
                      type="button"
                      onClick={() => setIronCount(ironCount + 1)}
                      className="flex-1 h-7 bg-blue-100 hover:bg-blue-200 text-blue-900 rounded-lg font-bold text-xs"
                    >
                      +1
                    </button>
                    <button
                      type="button"
                      onClick={() => setIronCount(ironCount + 5)}
                      className="px-2 h-7 bg-blue-50 hover:bg-blue-100 text-blue-800 rounded-lg font-bold text-[11px]"
                    >
                      +5
                    </button>
                    <button
                      type="button"
                      onClick={() => setIronCount(ironCount + 10)}
                      className="px-2 h-7 bg-blue-50 hover:bg-blue-100 text-blue-800 rounded-lg font-bold text-[11px]"
                    >
                      +10
                    </button>
                  </div>
                </div>

                {/* Dry Clean */}
                <div className="bg-white p-3 rounded-xl border border-amber-200 shadow-2xs">
                  <div className="flex justify-between items-center mb-1.5">
                    <span className="text-xs font-extrabold text-purple-900">Dry Clean</span>
                    <span className="text-base font-black font-mono text-purple-700">{drycleanCount}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setDrycleanCount(Math.max(0, drycleanCount - 1))}
                      className="w-7 h-7 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg font-black text-sm"
                    >
                      -
                    </button>
                    <button
                      type="button"
                      onClick={() => setDrycleanCount(drycleanCount + 1)}
                      className="flex-1 h-7 bg-purple-100 hover:bg-purple-200 text-purple-900 rounded-lg font-bold text-xs"
                    >
                      +1
                    </button>
                    <button
                      type="button"
                      onClick={() => setDrycleanCount(drycleanCount + 5)}
                      className="px-2 h-7 bg-purple-50 hover:bg-purple-100 text-purple-800 rounded-lg font-bold text-[11px]"
                    >
                      +5
                    </button>
                    <button
                      type="button"
                      onClick={() => setDrycleanCount(drycleanCount + 10)}
                      className="px-2 h-7 bg-purple-50 hover:bg-purple-100 text-purple-800 rounded-lg font-bold text-[11px]"
                    >
                      +10
                    </button>
                  </div>
                </div>

                {/* Wash & Fold */}
                <div className="bg-white p-3 rounded-xl border border-amber-200 shadow-2xs">
                  <div className="flex justify-between items-center mb-1.5">
                    <span className="text-xs font-extrabold text-teal-900">Wash & Fold</span>
                    <span className="text-base font-black font-mono text-teal-700">{washCount}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setWashCount(Math.max(0, washCount - 1))}
                      className="w-7 h-7 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg font-black text-sm"
                    >
                      -
                    </button>
                    <button
                      type="button"
                      onClick={() => setWashCount(washCount + 1)}
                      className="flex-1 h-7 bg-teal-100 hover:bg-teal-200 text-teal-900 rounded-lg font-bold text-xs"
                    >
                      +1
                    </button>
                    <button
                      type="button"
                      onClick={() => setWashCount(washCount + 5)}
                      className="px-2 h-7 bg-teal-50 hover:bg-teal-100 text-teal-800 rounded-lg font-bold text-[11px]"
                    >
                      +5
                    </button>
                    <button
                      type="button"
                      onClick={() => setWashCount(washCount + 10)}
                      className="px-2 h-7 bg-teal-50 hover:bg-teal-100 text-teal-800 rounded-lg font-bold text-[11px]"
                    >
                      +10
                    </button>
                  </div>
                </div>
              </div>

              {/* Dedicated Clothes Proof Note Textarea */}
              <div>
                <label className="text-[11px] font-bold text-amber-950 uppercase block mb-1">
                  Clothes Proof Note & Details (Mandatory Proof Note)
                </label>
                <textarea
                  rows={2}
                  value={pickupProofNotes}
                  onChange={(e) => setPickupProofNotes(e.target.value)}
                  placeholder="e.g. 5 Shirts, 2 Sarees, 1 Blazer — collar stains / damage proof"
                  className="w-full px-3 py-2 bg-white border border-amber-200 rounded-xl text-xs font-medium text-slate-900 focus:ring-2 focus:ring-amber-500 focus:outline-hidden leading-relaxed shadow-2xs"
                />
              </div>
            </div>
          )}

          {/* 2. Weight Entry in Kg & Grams */}
          <div className="bg-sky-50/40 p-4 rounded-2xl border border-sky-100 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-black text-sky-950 uppercase tracking-wider flex items-center gap-1.5">
                <Scale className="w-3.5 h-3.5 text-sky-600" />
                <span>Weight Entry (Kg & Grams)</span>
              </label>
              <span className="text-[10px] bg-sky-100 text-sky-900 font-extrabold px-2 py-0.5 rounded-full">
                ₹{weightRate}/kg
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2.5">
              <div>
                <label className="text-[10px] font-bold text-slate-600 block mb-1">Kg</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={weightKg === 0 ? '' : weightKg}
                  onChange={(e) => setWeightKg(Math.max(0, parseInt(e.target.value, 10) || 0))}
                  placeholder="0"
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-black font-mono text-center text-slate-900 focus:ring-2 focus:ring-sky-500 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-600 block mb-1">Grams (0-999)</label>
                <input
                  type="number"
                  min="0"
                  max="999"
                  step="50"
                  value={weightGrams === 0 ? '' : weightGrams}
                  onChange={(e) => setWeightGrams(Math.max(0, Math.min(999, parseInt(e.target.value, 10) || 0)))}
                  placeholder="0"
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-black font-mono text-center text-slate-900 focus:ring-2 focus:ring-sky-500 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-600 block mb-1">Rate (₹/kg)</label>
                <input
                  type="number"
                  min="1"
                  value={weightRate}
                  onChange={(e) => setWeightRate(Math.max(0, parseFloat(e.target.value) || 0))}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-black font-mono text-center text-slate-900 focus:ring-2 focus:ring-sky-500 focus:outline-hidden"
                />
              </div>
            </div>

            {/* Live Calculation Preview */}
            {totalGrams > 0 && (
              <div className="p-3 bg-white rounded-xl border border-sky-200 flex items-center justify-between text-xs">
                <div>
                  <span className="font-bold text-slate-700 block">Total Weight: {weightKg} kg {weightGrams} g</span>
                  <span className="text-[10px] text-slate-500 font-mono">
                    ({totalGrams} g × ₹{weightRate}) / 1000
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-slate-500 block">Weight Amount</span>
                  <span className="font-mono text-base font-black text-sky-900">₹{calculatedWeightAmount.toFixed(2)}</span>
                </div>
              </div>
            )}
          </div>

          {/* 3. Pickup Photos */}
          <div className="bg-sky-50/40 p-4 rounded-2xl border border-sky-100 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-black text-sky-950 uppercase tracking-wider flex items-center gap-1.5">
                <Camera className="w-3.5 h-3.5 text-sky-600" />
                <span>Pickup Photos (Garment Bag / Clothes)</span>
              </label>
              <span className="text-[10px] text-slate-500 font-bold">
                {photos.length} photos added
              </span>
            </div>

            {/* Photo Action Buttons */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                className="py-2.5 px-3 bg-white hover:bg-sky-50 border border-sky-200 rounded-xl text-xs font-bold text-sky-900 flex items-center justify-center gap-2 transition-all active:scale-98 shadow-2xs"
              >
                <Camera className="w-4 h-4 text-sky-600" />
                <span>Take Photo</span>
              </button>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="py-2.5 px-3 bg-white hover:bg-sky-50 border border-sky-200 rounded-xl text-xs font-bold text-sky-900 flex items-center justify-center gap-2 transition-all active:scale-98 shadow-2xs"
              >
                <Upload className="w-4 h-4 text-sky-600" />
                <span>Upload from Gallery</span>
              </button>

              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => handleFileChange(e, true)}
              />
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => handleFileChange(e, false)}
              />
            </div>

            {/* Photo Thumbnails */}
            {photos.length > 0 && (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 pt-1">
                {photos.map((p) => (
                  <div key={p.id} className="relative group rounded-xl overflow-hidden border border-slate-200 aspect-square bg-slate-100">
                    <img 
                      src={p.previewUrl} 
                      alt="Garment photo" 
                      className="w-full h-full object-cover cursor-pointer"
                      onClick={() => setPreviewModalUrl(p.previewUrl)}
                    />
                    <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => setPreviewModalUrl(p.previewUrl)}
                        className="w-7 h-7 bg-white/90 rounded-full flex items-center justify-center text-slate-900 hover:bg-white"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemovePhoto(p.id)}
                        className="w-7 h-7 bg-rose-600 rounded-full flex items-center justify-center text-white hover:bg-rose-700"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 4. Quick Delivery Item Counts */}
          {orderType === 'delivery' && (
            <div className="bg-sky-50/40 p-4 rounded-2xl border border-sky-100 space-y-3">
              <label className="text-xs font-black text-sky-950 uppercase tracking-wider block">
                Clothing Items (Direct Delivery)
              </label>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {categories.filter(c => c.unit !== 'kg').slice(0, 6).map(cat => {
                  const currentQty = deliveryItems[cat.id] || 0;
                  return (
                    <div key={cat.id} className="bg-white p-2.5 rounded-xl border border-slate-200 flex items-center justify-between text-xs">
                      <div>
                        <span className="font-bold text-slate-800 block truncate max-w-[90px]">{cat.name}</span>
                        <span className="text-[10px] text-slate-400">₹{cat.default_rate}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setDeliveryItems(prev => ({ ...prev, [cat.id]: Math.max(0, currentQty - 1) }))}
                          className="w-6 h-6 rounded-lg bg-slate-100 hover:bg-slate-200 font-bold flex items-center justify-center"
                        >
                          -
                        </button>
                        <span className="w-5 text-center font-bold font-mono">{currentQty}</span>
                        <button
                          type="button"
                          onClick={() => setDeliveryItems(prev => ({ ...prev, [cat.id]: currentQty + 1 }))}
                          className="w-6 h-6 rounded-lg bg-sky-100 hover:bg-sky-200 text-sky-900 font-bold flex items-center justify-center"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 5. Assignment & Notes */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-bold text-slate-700 block mb-1">Assign Delivery Boy</label>
              <select
                value={assignedDeliveryBoyId}
                onChange={(e) => setAssignedDeliveryBoyId(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:ring-2 focus:ring-sky-500 focus:outline-hidden"
              >
                <option value="">-- Unassigned --</option>
                {deliveryBoys.map(d => (
                  <option key={d.id} value={d.id}>{d.name} ({d.is_online ? '🟢 Online' : '⚪ Offline'})</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-700 block mb-1">Special Instructions (Notes)</label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Wash white clothes separately"
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 focus:ring-2 focus:ring-sky-500 focus:outline-hidden"
              />
            </div>
          </div>

          {/* 6. Grand Financial Summary Bar */}
          <div className="p-4 bg-slate-900 text-white rounded-2xl space-y-2">
            <div className="flex justify-between text-xs text-slate-300">
              <span>Current Order Bill:</span>
              <span className="font-mono font-bold text-white">₹{grandSubtotal.toFixed(2)}</span>
            </div>
            {customerOldDue > 0 && (
              <div className="flex justify-between text-xs text-rose-400">
                <span>Previous Due:</span>
                <span className="font-mono font-bold">₹{customerOldDue.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between text-sm font-black pt-2 border-t border-slate-800 text-sky-300">
              <span>Total Payable:</span>
              <span className="font-mono text-base text-white">₹{combinedPayable.toFixed(2)}</span>
            </div>
          </div>

          {/* Footer Submit Button with anti-duplicate debounce */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={submitting}
              className={`w-full py-3.5 px-4 rounded-2xl text-xs font-black shadow-md flex items-center justify-center gap-2 transition-all active:scale-98 ${
                submitting
                  ? 'bg-slate-300 text-slate-600 cursor-not-allowed'
                  : orderType === 'delivery'
                    ? 'bg-[#0369A1] hover:bg-[#025684] text-white shadow-sky-900/20'
                    : 'bg-sky-500 hover:bg-sky-600 text-white shadow-sky-500/25'
              }`}
            >
              {submitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Creating Order...</span>
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4 fill-current" />
                  <span>
                    {orderType === 'pickup' 
                      ? '⚡ Create Quick Pickup (1-Click)' 
                      : '⚡ Create Quick Delivery (1-Click)'}
                  </span>
                  <ArrowRight className="w-4 h-4 ml-1" />
                </>
              )}
            </button>
          </div>
        </form>

      </div>

      {/* Image Preview Zoom Modal */}
      {previewModalUrl && (
        <div className="fixed inset-0 z-60 bg-black/90 flex items-center justify-center p-4" onClick={() => setPreviewModalUrl(null)}>
          <div className="relative max-w-xl max-h-[85vh] overflow-hidden rounded-2xl">
            <img src={previewModalUrl} alt="Preview" className="w-full h-full object-contain" />
            <button
              onClick={() => setPreviewModalUrl(null)}
              className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
