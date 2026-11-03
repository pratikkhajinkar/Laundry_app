import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.tsx';
import type { Customer, Shop, User, ClothingCategory } from '../../types/index.ts';
import { 
  PackagePlus, 
  Truck, 
  Search, 
  UserCheck, 
  MapPin, 
  Phone, 
  Calendar, 
  Clock, 
  AlertCircle, 
  Building, 
  Plus, 
  Minus, 
  Trash2, 
  Receipt, 
  Shirt, 
  Sparkles, 
  CheckCircle2,
  Scale,
  X,
  CreditCard,
  AlertTriangle
} from 'lucide-react';
import { syncOrderToFirestore, syncCustomerToFirestore } from '../../services/firestoreSync.ts';

interface NewOrderModalProps {
  onClose: () => void;
  onSuccess: (orderId: string) => void;
  initialMode?: 'pickup' | 'delivery';
}

interface ItemRow {
  category_id?: string;
  item_name: string;
  unit: 'piece' | 'kg';
  quantity: number; // for piece
  kg: number; // for kg
  grams: number; // for grams
  rate: number;
}

export const NewOrderModal: React.FC<NewOrderModalProps> = ({ 
  onClose, 
  onSuccess,
  initialMode = 'pickup'
}) => {
  const { token, user } = useAuth();
  const [orderType, setOrderType] = useState<'pickup' | 'delivery'>(initialMode);
  
  const [shops, setShops] = useState<Shop[]>([]);
  const [deliveryBoys, setDeliveryBoys] = useState<User[]>([]);
  const [categories, setCategories] = useState<ClothingCategory[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerOldDue, setCustomerOldDue] = useState<number>(0);
  const [loadingOldDue, setLoadingOldDue] = useState<boolean>(false);

  // Form fields
  const [shopId, setShopId] = useState(user?.role === 'shop' ? (user.shop_id || '') : '');
  const [customerName, setCustomerName] = useState('');
  const [customerMobile, setCustomerMobile] = useState('');
  const [pickupAddress, setPickupAddress] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [area, setArea] = useState('Warje');
  const [buildingName, setBuildingName] = useState('');
  const [flatNumber, setFlatNumber] = useState('');
  const [pickupDate, setPickupDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [pickupTimeSlot, setPickupTimeSlot] = useState('Morning (9 AM - 12 PM)');
  const [assignedDeliveryBoyId, setAssignedDeliveryBoyId] = useState('');
  const [specialInstructions, setSpecialInstructions] = useState('');

  // Items & pricing for direct delivery / shop counter order
  const [items, setItems] = useState<ItemRow[]>([]);
  const [deliveryCharge, setDeliveryCharge] = useState<number>(0);
  const [discountAmount, setDiscountAmount] = useState<number>(0);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch shops, delivery boys, and clothing categories
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
          // Set initial template items with 0 quantity and 0 weight so new bill begins at 0.00
          const initialItems: ItemRow[] = (d.categories || []).map((cat: ClothingCategory) => ({
            category_id: cat.id,
            item_name: cat.name,
            unit: (cat.unit === 'kg' ? 'kg' : 'piece') as 'piece' | 'kg',
            quantity: 0,
            kg: 0,
            grams: 0,
            rate: cat.default_rate
          }));
          setItems(initialItems);
        }
      } catch (err) {
        console.error(err);
      }
    };

    fetchMetadata();
  }, []);

  // Search customers
  useEffect(() => {
    const searchCust = async () => {
      if (!customerSearch.trim()) return;
      try {
        const res = await fetch(`/api/customers?q=${encodeURIComponent(customerSearch)}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const d = await res.json();
          setCustomers(d.customers);
        }
      } catch (e) {
        console.error(e);
      }
    };

    const timer = setTimeout(searchCust, 300);
    return () => clearTimeout(timer);
  }, [customerSearch]);

  const handleSelectCustomer = async (c: Customer) => {
    setSelectedCustomer(c);
    setCustomerName(c.name);
    setCustomerMobile(c.mobile);
    setPickupAddress(c.pickup_address);
    setDeliveryAddress(c.delivery_address || c.pickup_address);
    setArea(c.area);
    setBuildingName(c.building_name || '');
    setFlatNumber(c.flat_number || '');
    setCustomerSearch('');
    setCustomers([]);

    // Fetch live customer outstanding due
    try {
      setLoadingOldDue(true);
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
    } finally {
      setLoadingOldDue(false);
    }
  };

  // Item calculations
  const calculateLineTotal = (item: ItemRow): number => {
    if (item.unit === 'kg') {
      const totalGrams = (Math.max(0, item.kg) * 1000) + Math.max(0, item.grams);
      if (totalGrams <= 0) return 0;
      // Formula: (kg * 1000 + grams) * rate / 1000
      return Math.round(((totalGrams * item.rate) / 1000) * 100) / 100;
    }
    return Math.round(Math.max(0, item.quantity) * item.rate * 100) / 100;
  };

  const handleItemQuantityChange = (index: number, newQty: number) => {
    const updated = [...items];
    updated[index].quantity = Math.max(0, newQty);
    setItems(updated);
  };

  const handleItemKgChange = (index: number, kg: number) => {
    const updated = [...items];
    updated[index].kg = Math.max(0, kg);
    setItems(updated);
  };

  const handleItemGramsChange = (index: number, grams: number) => {
    const updated = [...items];
    updated[index].grams = Math.max(0, Math.min(999, grams));
    setItems(updated);
  };

  const handleItemRateChange = (index: number, newRate: number) => {
    const updated = [...items];
    updated[index].rate = Math.max(0, newRate);
    setItems(updated);
  };

  const handleToggleUnit = (index: number) => {
    const updated = [...items];
    const newUnit = updated[index].unit === 'kg' ? 'piece' : 'kg';
    updated[index].unit = newUnit;
    if (newUnit === 'kg') {
      updated[index].kg = updated[index].quantity || 1;
      updated[index].grams = 0;
    } else {
      updated[index].quantity = updated[index].kg || 1;
    }
    setItems(updated);
  };

  const handleAddCustomItem = (unitType: 'piece' | 'kg' = 'piece') => {
    setItems([
      ...items,
      {
        item_name: unitType === 'kg' ? 'Wash & Fold (By Weight)' : 'Custom Item',
        unit: unitType,
        quantity: unitType === 'piece' ? 1 : 0,
        kg: unitType === 'kg' ? 1 : 0,
        grams: 0,
        rate: unitType === 'kg' ? 80 : 50
      }
    ]);
  };

  const handleRemoveItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  // Active items in delivery mode
  const activeItems = items.filter(it => {
    if (it.unit === 'kg') {
      return (it.kg * 1000 + it.grams) > 0;
    }
    return it.quantity > 0;
  });

  const calculatedSubtotal = activeItems.reduce((acc, it) => acc + calculateLineTotal(it), 0);
  // In pickup mode, clothes are not yet picked up, so new bill starts at 0.00
  const calculatedFinalBill = orderType === 'delivery'
    ? Math.max(0, calculatedSubtotal + (Number(deliveryCharge) || 0) - (Number(discountAmount) || 0))
    : 0;
  const combinedTotalDue = Math.round((calculatedFinalBill + customerOldDue) * 100) / 100;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!customerName.trim() || !customerMobile.trim() || !pickupAddress.trim() || !area.trim()) {
      setError('Please fill in customer name, mobile number, address, and area.');
      return;
    }

    try {
      setSubmitting(true);

      // 1. Create or ensure customer exists
      let finalCustomerId = selectedCustomer?.id;
      if (!finalCustomerId) {
        const custRes = await fetch('/api/customers', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            name: customerName.trim(),
            mobile: customerMobile.trim(),
            pickup_address: pickupAddress.trim(),
            delivery_address: deliveryAddress.trim() || pickupAddress.trim(),
            area: area.trim(),
            building_name: buildingName.trim() || null,
            flat_number: flatNumber.trim() || null,
            shop_id: shopId
          })
        });

        let custData: any = {};
        const custText = await custRes.text();
        try {
          custData = custText ? JSON.parse(custText) : {};
        } catch {
          throw new Error(`Customer service error (${custRes.status}). Please check details and retry.`);
        }
        if (!custRes.ok) throw new Error(custData.error || 'Failed to save customer. Please verify phone number and retry.');
        finalCustomerId = custData.id;

        if (finalCustomerId) {
          syncCustomerToFirestore({
            id: finalCustomerId,
            name: customerName.trim(),
            mobile: customerMobile.trim(),
            pickup_address: pickupAddress.trim(),
            area: area.trim(),
            shop_id: shopId
          }).catch(err => console.warn('[Firestore] Background customer sync notice:', err));
        }
      }

      // 2. Prepare items payload if delivery mode
      const itemsPayload = orderType === 'delivery' ? activeItems.map(it => {
        const lineTotal = calculateLineTotal(it);
        if (it.unit === 'kg') {
          return {
            category_id: it.category_id || null,
            item_name: it.item_name,
            unit: 'kg',
            kg: it.kg,
            grams: it.grams,
            weight_kg: Math.round(((it.kg * 1000) + it.grams)) / 1000,
            weight_display: `${it.kg} kg ${it.grams} g`,
            quantity: 1,
            rate: it.rate,
            line_total: lineTotal
          };
        }
        return {
          category_id: it.category_id || null,
          item_name: it.item_name,
          unit: 'piece',
          quantity: it.quantity,
          rate: it.rate,
          line_total: lineTotal
        };
      }) : undefined;

      // 3. Create Order
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          customer_id: finalCustomerId,
          shop_id: shopId,
          order_type: orderType,
          pickup_address: pickupAddress.trim(),
          delivery_address: deliveryAddress.trim() || pickupAddress.trim(),
          area: area.trim(),
          pickup_date: pickupDate,
          pickup_time_slot: pickupTimeSlot,
          assigned_delivery_boy_id: assignedDeliveryBoyId || null,
          special_instructions: specialInstructions.trim() || null,
          items: itemsPayload,
          delivery_charge: deliveryCharge,
          discount_amount: discountAmount
        })
      });

      let data: any = {};
      const resText = await res.text();
      try {
        data = resText ? JSON.parse(resText) : {};
      } catch {
        throw new Error(`Order server error (${res.status}). Please check network and retry.`);
      }
      if (!res.ok) throw new Error(data.error || 'Failed to create order. Please try again.');

      // Sync Order to Firestore in background
      syncOrderToFirestore({
        id: data.orderId,
        order_number: data.orderNumber,
        customer_name: customerName.trim(),
        customer_mobile: customerMobile.trim(),
        pickup_address: pickupAddress.trim(),
        area: area.trim(),
        status: orderType === 'delivery' ? (assignedDeliveryBoyId ? 'out_for_delivery' : 'ready_for_delivery') : (assignedDeliveryBoyId ? 'assigned' : 'pending'),
        final_total: calculatedFinalBill,
        amount_paid: 0,
        outstanding_amount: calculatedFinalBill,
        payment_status: 'unpaid'
      }).catch(err => console.warn('[Firestore] Background order sync notice:', err));

      onSuccess(data.orderId);
      onClose();

    } catch (err: any) {
      const msg = err?.message || '';
      if (msg.includes('Unexpected token') || msg.includes('<!DOCTYPE') || msg.includes('is not valid JSON')) {
        setError('सर्व्हर तात्पुरता व्यस्त आहे किंवा रीस्टार्ट होत आहे. कृपया २ सेकंद थांबा आणि पुन्हा प्रयत्न करा.');
      } else {
        setError(msg || 'ऑर्डर तयार करताना त्रुटी आली. कृपया पुन्हा प्रयत्न करा.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full border border-sky-100 overflow-hidden my-4 max-h-[92vh] flex flex-col">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-sky-600 to-sky-700 p-5 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center shrink-0">
              <PackagePlus className="w-5 h-5 text-white" />
            </div>
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider bg-white/25 px-2.5 py-0.5 rounded-full inline-block">
                Laundry Flow • New Order
              </span>
              <h3 className="text-lg font-black mt-0.5">
                {orderType === 'pickup' ? 'Create Pickup Order' : 'Counter Bill / Direct Delivery'}
              </h3>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 sm:p-6 overflow-y-auto space-y-5 flex-1">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          {/* Mode Switch: Pickup vs Direct Delivery */}
          <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1.5 rounded-2xl">
            <button
              type="button"
              onClick={() => setOrderType('pickup')}
              className={`py-2 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all ${
                orderType === 'pickup'
                  ? 'bg-sky-500 text-white shadow-md'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Truck className="w-4 h-4" />
              <span>Home Pickup</span>
            </button>
            <button
              type="button"
              onClick={() => setOrderType('delivery')}
              className={`py-2 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all ${
                orderType === 'delivery'
                  ? 'bg-sky-500 text-white shadow-md'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Receipt className="w-4 h-4" />
              <span>Counter Bill / Direct Delivery</span>
            </button>
          </div>

          {/* Customer Search & Selection */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                <Search className="w-3.5 h-3.5 text-sky-600" />
                <span>Search or Create New Customer</span>
              </label>
              {selectedCustomer && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCustomer(null);
                    setCustomerOldDue(0);
                    setCustomerName('');
                    setCustomerMobile('');
                  }}
                  className="text-[11px] font-bold text-rose-600 hover:underline"
                >
                  Clear Selection
                </button>
              )}
            </div>

            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search customer by name or mobile number..."
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-sky-500"
              />
              {customers.length > 0 && (
                <div className="absolute z-20 left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-48 overflow-y-auto divide-y divide-slate-100">
                  {customers.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => handleSelectCustomer(c)}
                      className="w-full text-left p-2.5 hover:bg-sky-50 transition-colors flex items-center justify-between"
                    >
                      <div>
                        <span className="text-xs font-bold text-slate-900 block">{c.name}</span>
                        <span className="text-[10px] text-slate-500">{c.mobile} • {c.area}</span>
                      </div>
                      {(c.total_due || 0) > 0 && (
                        <span className="text-[10px] font-black bg-rose-50 text-rose-600 border border-rose-200 px-2 py-0.5 rounded-full">
                          Due: ₹{Number(c.total_due).toFixed(2)}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Selected Customer & Old Due Alert Banner */}
            {selectedCustomer && (
              <div className="bg-sky-50/70 border border-sky-200 rounded-2xl p-3.5 space-y-2">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-sky-500 text-white flex items-center justify-center font-black text-xs">
                      {selectedCustomer.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h4 className="text-xs font-extrabold text-slate-900">{selectedCustomer.name}</h4>
                      <p className="text-[10px] text-slate-600">{selectedCustomer.mobile} • {selectedCustomer.area}</p>
                    </div>
                  </div>
                  {customerOldDue > 0 ? (
                    <div className="text-right bg-amber-100/80 border border-amber-300 px-3 py-1.5 rounded-xl">
                      <span className="text-[10px] font-bold text-amber-800 uppercase block">Previous Due</span>
                      <span className="text-sm font-black text-amber-900">
                        {loadingOldDue ? '...' : `₹${customerOldDue.toFixed(2)}`}
                      </span>
                    </div>
                  ) : (
                    <div className="text-right bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-xl">
                      <span className="text-[10px] font-bold text-emerald-700">Account Clear (No Due)</span>
                    </div>
                  )}
                </div>
                {customerOldDue > 0 && (
                  <p className="text-[10px] text-amber-800 bg-white/60 p-1.5 rounded-lg border border-amber-200/50">
                    💡 <strong>Smart Rule:</strong> Previous dues remain separate in the customer ledger and are not combined into new order charges automatically.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Customer Details Inputs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="text-sm font-bold text-slate-800 block mb-1.5">Customer Name *</label>
              <input
                type="text"
                required
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="e.g. Tulip"
                className="w-full px-4 py-3 text-base font-semibold rounded-2xl border-2 border-slate-200 focus:outline-hidden focus:border-sky-500"
              />
            </div>
            <div>
              <label className="text-sm font-bold text-slate-800 block mb-1.5">Mobile Number *</label>
              <input
                type="tel"
                required
                value={customerMobile}
                onChange={(e) => setCustomerMobile(e.target.value)}
                placeholder="e.g. 8483826902"
                className="w-full px-4 py-3 text-base font-semibold rounded-2xl border-2 border-slate-200 focus:outline-hidden focus:border-sky-500"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="text-sm font-bold text-slate-800 block mb-1.5">Pickup Address *</label>
              <input
                type="text"
                required
                value={pickupAddress}
                onChange={(e) => setPickupAddress(e.target.value)}
                placeholder="Flat/House No., Building, Street"
                className="w-full px-4 py-3 text-base font-semibold rounded-2xl border-2 border-slate-200 focus:outline-hidden focus:border-sky-500"
              />
            </div>
            <div>
              <label className="text-sm font-bold text-slate-800 block mb-1.5">Area / Locality *</label>
              <input
                type="text"
                required
                value={area}
                onChange={(e) => setArea(e.target.value)}
                placeholder="e.g. Warje, Kothrud"
                className="w-full px-4 py-3 text-base font-semibold rounded-2xl border-2 border-slate-200 focus:outline-hidden focus:border-sky-500"
              />
            </div>
            <div>
              <label className="text-sm font-bold text-slate-800 block mb-1.5">Shop Branch</label>
              <select
                value={shopId}
                onChange={(e) => setShopId(e.target.value)}
                disabled={user?.role === 'shop'}
                className="w-full px-4 py-3 text-base font-semibold rounded-2xl border-2 border-slate-200 focus:outline-hidden focus:border-sky-500 bg-white"
              >
                {shops.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Delivery Boy Assignment & Slot */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-3 border-t border-slate-100">
            <div>
              <label className="text-sm font-bold text-slate-800 block mb-1.5">Assign Delivery Boy</label>
              <select
                value={assignedDeliveryBoyId}
                onChange={(e) => setAssignedDeliveryBoyId(e.target.value)}
                className="w-full px-4 py-3 text-base font-semibold rounded-2xl border-2 border-slate-200 focus:outline-hidden focus:border-sky-500 bg-white"
              >
                <option value="">-- Assign Later (Unassigned) --</option>
                {deliveryBoys.map((d) => (
                  <option key={d.id} value={d.id}>{d.name} ({d.email_or_phone})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[11px] font-bold text-slate-700 block mb-1">Pickup Date</label>
              <input
                type="date"
                value={pickupDate}
                onChange={(e) => setPickupDate(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-sky-500"
              />
            </div>
          </div>

          {/* Direct Delivery / Shop Bill Clothing Items with Weight arithmetic */}
          {orderType === 'delivery' && (
            <div className="space-y-3 pt-3 border-t border-slate-200">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                    <Shirt className="w-4 h-4 text-sky-600" />
                    <span>Clothing Items & Weight Billing</span>
                  </h4>
                  <p className="text-[10px] text-slate-500">Both piece count and weight (kg + grams) are supported.</p>
                </div>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleAddCustomItem('kg')}
                    className="text-[10px] font-bold text-sky-700 bg-sky-50 hover:bg-sky-100 border border-sky-200 px-2 py-1 rounded-lg flex items-center gap-1 transition-colors"
                  >
                    <Scale className="w-3 h-3 text-sky-600" />
                    <span>+ Add By Weight</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAddCustomItem('piece')}
                    className="text-[10px] font-bold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 px-2 py-1 rounded-lg flex items-center gap-1 transition-colors"
                  >
                    <Plus className="w-3 h-3 text-slate-600" />
                    <span>+ Add By Piece</span>
                  </button>
                </div>
              </div>

              {/* Items List */}
              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {items.map((item, index) => {
                  const lineTotal = calculateLineTotal(item);
                  return (
                    <div 
                      key={index} 
                      className={`p-2.5 rounded-xl border transition-all ${
                        lineTotal > 0 ? 'bg-sky-50/50 border-sky-200' : 'bg-slate-50/60 border-slate-200'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <input
                          type="text"
                          value={item.item_name}
                          onChange={(e) => {
                            const updated = [...items];
                            updated[index].item_name = e.target.value;
                            setItems(updated);
                          }}
                          className="text-xs font-bold text-slate-900 bg-transparent border-0 p-0 focus:outline-hidden flex-1"
                        />
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleToggleUnit(index)}
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full border transition-colors ${
                              item.unit === 'kg' 
                                ? 'bg-amber-100 text-amber-800 border-amber-300' 
                                : 'bg-slate-200 text-slate-700 border-slate-300'
                            }`}
                          >
                            {item.unit === 'kg' ? 'By Weight (Kg)' : 'By Piece'}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(index)}
                            className="text-slate-400 hover:text-rose-500 p-0.5 rounded-sm"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Inputs row */}
                      <div className="flex items-center justify-between gap-2 text-xs">
                        {item.unit === 'kg' ? (
                          <div className="flex items-center gap-2 flex-wrap">
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                min="0"
                                value={item.kg}
                                onChange={(e) => handleItemKgChange(index, parseInt(e.target.value, 10) || 0)}
                                className="w-14 px-2 py-1 bg-white border border-slate-300 rounded-lg text-center font-black text-xs"
                              />
                              <span className="text-[11px] font-bold text-slate-600">kg</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                min="0"
                                max="999"
                                step="50"
                                value={item.grams}
                                onChange={(e) => handleItemGramsChange(index, parseInt(e.target.value, 10) || 0)}
                                className="w-16 px-2 py-1 bg-white border border-slate-300 rounded-lg text-center font-black text-xs"
                              />
                              <span className="text-[11px] font-bold text-slate-600">grams</span>
                            </div>
                            <div className="flex items-center gap-1 text-[11px] text-slate-500">
                              <span>@ ₹</span>
                              <input
                                type="number"
                                min="1"
                                value={item.rate}
                                onChange={(e) => handleItemRateChange(index, parseFloat(e.target.value) || 0)}
                                className="w-14 px-1.5 py-1 bg-white border border-slate-300 rounded-lg text-center font-bold text-xs"
                              />
                              <span>/kg</span>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <div className="flex items-center border border-slate-300 rounded-lg bg-white overflow-hidden">
                              <button
                                type="button"
                                onClick={() => handleItemQuantityChange(index, item.quantity - 1)}
                                className="px-2 py-1 hover:bg-slate-100 text-slate-600"
                              >
                                <Minus className="w-3 h-3" />
                              </button>
                              <span className="px-2.5 font-black text-xs">{item.quantity}</span>
                              <button
                                type="button"
                                onClick={() => handleItemQuantityChange(index, item.quantity + 1)}
                                className="px-2 py-1 hover:bg-slate-100 text-slate-600"
                              >
                                <Plus className="w-3 h-3" />
                              </button>
                            </div>
                            <div className="flex items-center gap-1 text-[11px] text-slate-500">
                              <span>@ ₹</span>
                              <input
                                type="number"
                                min="1"
                                value={item.rate}
                                onChange={(e) => handleItemRateChange(index, parseFloat(e.target.value) || 0)}
                                className="w-14 px-1.5 py-1 bg-white border border-slate-300 rounded-lg text-center font-bold text-xs"
                              />
                            </div>
                          </div>
                        )}

                        <div className="text-right shrink-0">
                          <span className="text-sm font-black text-slate-900">
                            ₹{lineTotal.toFixed(2)}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Delivery and Discount adjustment */}
              <div className="grid grid-cols-2 gap-3 pt-2">
                <div>
                  <label className="text-[11px] font-bold text-slate-600 block mb-0.5">Delivery Charge (₹)</label>
                  <input
                    type="number"
                    min="0"
                    value={deliveryCharge}
                    onChange={(e) => setDeliveryCharge(parseFloat(e.target.value) || 0)}
                    className="w-full px-2.5 py-1.5 text-xs rounded-xl border border-slate-200"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-600 block mb-0.5">Discount (₹)</label>
                  <input
                    type="number"
                    min="0"
                    value={discountAmount}
                    onChange={(e) => setDiscountAmount(parseFloat(e.target.value) || 0)}
                    className="w-full px-2.5 py-1.5 text-xs rounded-xl border border-slate-200"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Unified Summary Box */}
          <div className="bg-sky-50 border border-sky-200/80 rounded-2xl p-4 space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-slate-700">
              <span>Current Order Bill:</span>
              <span className="text-sm font-black text-slate-900">
                {orderType === 'pickup' ? '₹0.00 (Determined at pickup)' : `₹${calculatedFinalBill.toFixed(2)}`}
              </span>
            </div>
            {customerOldDue > 0 && (
              <div className="flex items-center justify-between text-xs font-bold text-rose-600">
                <span>Customer Previous Due:</span>
                <span className="text-sm font-black">₹{customerOldDue.toFixed(2)}</span>
              </div>
            )}
            <div className="flex items-center justify-between text-xs font-black text-sky-900 pt-2 border-t border-sky-200">
              <span>Total Customer Payable:</span>
              <span className="text-base font-black text-sky-950">₹{combinedTotalDue.toFixed(2)}</span>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="flex-1 py-2.5 px-4 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-2 py-2.5 px-4 rounded-xl bg-sky-500 hover:bg-sky-600 text-white font-black text-xs shadow-md shadow-sky-500/25 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{submitting ? 'Creating Order...' : (orderType === 'pickup' ? 'Create Pickup Order' : 'Create & Deliver Order')}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
