import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.tsx';
import type { Order, ClothingCategory } from '../../types/index.ts';
import { syncOrderToFirestore } from '../../services/firestoreSync.ts';
import { 
  Receipt, 
  Plus, 
  Minus, 
  Trash2, 
  X, 
  AlertCircle, 
  CheckCircle2, 
  IndianRupee, 
  Phone, 
  MapPin, 
  Scale, 
  Shirt, 
  Sparkles, 
  HandCoins, 
  FileText, 
  Send,
  Layers,
  Ruler,
  Clock,
  ShieldCheck
} from 'lucide-react';

export interface DeliveryBillItem {
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
  notes?: string;
}

interface DeliveryRealBillModalProps {
  order: Order;
  onClose: () => void;
  onSuccess: (updatedOrder?: Partial<Order>) => void;
  onOpenPaymentCollection?: (order: Order) => void;
  onOpenInvoice?: (orderId: string) => void;
}

export const DeliveryRealBillModal: React.FC<DeliveryRealBillModalProps> = ({
  order,
  onClose,
  onSuccess,
  onOpenPaymentCollection,
  onOpenInvoice
}) => {
  const { token, user } = useAuth();
  const [categories, setCategories] = useState<ClothingCategory[]>([]);
  const [items, setItems] = useState<DeliveryBillItem[]>([]);
  const [deliveryCharge, setDeliveryCharge] = useState<number>(order.delivery_charge || 0);
  const [discountAmount, setDiscountAmount] = useState<number>(order.discount_amount || 0);
  const [previousDue, setPreviousDue] = useState<number>(0);
  const [loadingLedger, setLoadingLedger] = useState<boolean>(true);
  const [loadingItems, setLoadingItems] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Load existing items, categories, and previous due balance
  useEffect(() => {
    let isMounted = true;

    async function loadData() {
      try {
        setLoadingItems(true);
        const [resOrder, resCats, resDues] = await Promise.all([
          fetch(`/api/orders/${order.id}`, { headers: { Authorization: `Bearer ${token}` } }),
          fetch('/api/clothing-categories', { headers: { Authorization: `Bearer ${token}` } }),
          fetch(`/api/customers/${order.customer_id}/due-orders`, { headers: { Authorization: `Bearer ${token}` } })
        ]);

        if (resCats.ok) {
          const dCats = await resCats.json();
          if (isMounted) setCategories(dCats.categories || []);
        }

        if (resOrder.ok) {
          const dOrder = await resOrder.json();
          if (isMounted && Array.isArray(dOrder.items) && dOrder.items.length > 0) {
            setItems(dOrder.items.map((it: any) => ({
              id: it.id || crypto.randomUUID(),
              category_id: it.category_id || null,
              item_name: it.item_name || 'Clothing Item',
              unit: it.unit || 'piece',
              quantity: it.quantity || 1,
              rate: Number(it.rate) || 0,
              line_total: Number(it.line_total) || 0,
              kg: it.kg || Math.floor((Number(it.weight_grams_total) || 0) / 1000) || 0,
              grams: it.grams || ((Number(it.weight_grams_total) || 0) % 1000) || 0,
              sq_ft: Number(it.sq_ft) || 0,
              sq_ft_length: Number(it.sq_ft_length) || 0,
              sq_ft_width: Number(it.sq_ft_width) || 0,
              notes: it.notes || ''
            })));
          } else if (isMounted) {
            // If order has pickup weight recorded, initialize with weight item
            const totalPickupGrams = Number(order.pickup_weight_total_grams) || ((Number(order.pickup_weight_kg) || 0) * 1000 + (Number(order.pickup_weight_grams) || 0));
            if (totalPickupGrams > 0) {
              const r = Number(order.pickup_weight_rate) || 80;
              const kg = Number(order.pickup_weight_kg) || Math.floor(totalPickupGrams / 1000);
              const grams = Number(order.pickup_weight_grams) || (totalPickupGrams % 1000);
              const lineTotal = Math.round(((totalPickupGrams * r) / 1000) * 100) / 100;
              setItems([{
                id: crypto.randomUUID(),
                item_name: 'Wash & Fold (By Weight)',
                unit: 'kg',
                quantity: 1,
                rate: r,
                line_total: lineTotal,
                kg,
                grams
              }]);
            }
          }
        }

        if (resDues.ok) {
          const dDues = await resDues.json();
          const otherOrders = (dDues.orders || []).filter((o: any) => o.id !== order.id);
          const oldDue = otherOrders.reduce((sum: number, o: any) => sum + (Number(o.outstanding_amount) || 0), 0);
          if (isMounted) setPreviousDue(Math.round(oldDue * 100) / 100);
        }
      } catch (err) {
        console.error('Failed to load real bill details', err);
      } finally {
        if (isMounted) {
          setLoadingItems(false);
          setLoadingLedger(false);
        }
      }
    }

    loadData();
    return () => { isMounted = false; };
  }, [order.id, order.customer_id, token]);

  const calculateLineTotal = (item: DeliveryBillItem): number => {
    if (item.unit === 'kg') {
      const kg = Math.max(0, parseInt(String(item.kg), 10) || 0);
      const grams = Math.max(0, Math.min(999, parseInt(String(item.grams), 10) || 0));
      const totalGrams = (kg * 1000) + grams;
      const rate = Math.max(0, parseFloat(String(item.rate)) || 0);
      // Integer gram calculation: totalGrams * rate / 1000
      return Math.round(((totalGrams * rate) / 1000) * 100) / 100;
    }
    if (item.unit === 'sq_ft') {
      const length = Math.max(0, parseFloat(String(item.sq_ft_length)) || 0);
      const width = Math.max(0, parseFloat(String(item.sq_ft_width)) || 0);
      let sqFt = Math.max(0, parseFloat(String(item.sq_ft)) || 0);
      if (length > 0 && width > 0) {
        sqFt = Math.round((length * width) * 100) / 100;
      }
      const rate = Math.max(0, parseFloat(String(item.rate)) || 0);
      return Math.round(sqFt * rate * 100) / 100;
    }
    const qty = Math.max(0, parseInt(String(item.quantity), 10) || 0);
    const rate = Math.max(0, parseFloat(String(item.rate)) || 0);
    return Math.round(qty * rate * 100) / 100;
  };

  const handleAddItemFromCategory = (cat: ClothingCategory) => {
    // Check if category already in items as piece
    const existingIndex = items.findIndex(it => it.category_id === cat.id && it.unit === 'piece');
    if (existingIndex >= 0) {
      const updated = [...items];
      updated[existingIndex].quantity += 1;
      updated[existingIndex].line_total = calculateLineTotal(updated[existingIndex]);
      setItems(updated);
    } else {
      const newItem: DeliveryBillItem = {
        id: crypto.randomUUID(),
        category_id: cat.id,
        item_name: cat.name,
        unit: 'piece',
        quantity: 1,
        rate: cat.default_rate,
        line_total: cat.default_rate
      };
      setItems([...items, newItem]);
    }
  };

  const handleAddCurtainSqFt = () => {
    const newItem: DeliveryBillItem = {
      id: crypto.randomUUID(),
      item_name: 'Curtains (By Sq. Ft)',
      unit: 'sq_ft',
      quantity: 1,
      sq_ft_length: 7,
      sq_ft_width: 4,
      sq_ft: 28,
      rate: 15,
      line_total: Math.round(28 * 15 * 100) / 100
    };
    setItems([...items, newItem]);
  };

  const handleAddWeightItem = () => {
    const newItem: DeliveryBillItem = {
      id: crypto.randomUUID(),
      item_name: 'Wash & Fold (By Weight)',
      unit: 'kg',
      quantity: 1,
      kg: 2,
      grams: 0,
      rate: 80,
      line_total: 160
    };
    setItems([...items, newItem]);
  };

  const handleAddCustomItem = () => {
    const newItem: DeliveryBillItem = {
      id: crypto.randomUUID(),
      item_name: 'Special Garment / Dry Clean',
      unit: 'piece',
      quantity: 1,
      rate: 50,
      line_total: 50
    };
    setItems([...items, newItem]);
  };

  const updateItem = (id: string, updates: Partial<DeliveryBillItem>) => {
    setItems(prev => prev.map(it => {
      if (it.id !== id) return it;
      const updated = { ...it, ...updates };
      if (updated.unit === 'sq_ft' && (updates.sq_ft_length !== undefined || updates.sq_ft_width !== undefined)) {
        const l = Math.max(0, updated.sq_ft_length || 0);
        const w = Math.max(0, updated.sq_ft_width || 0);
        if (l > 0 && w > 0) {
          updated.sq_ft = Math.round((l * w) * 100) / 100;
        }
      }
      updated.line_total = calculateLineTotal(updated);
      return updated;
    }));
  };

  const removeItem = (id: string) => {
    setItems(prev => prev.filter(it => it.id !== id));
  };

  // Calculations
  const calculatedSubtotal = items.reduce((acc, it) => acc + calculateLineTotal(it), 0);
  const parsedDeliveryCharge = Math.max(0, Number(deliveryCharge) || 0);
  const parsedDiscount = Math.max(0, Number(discountAmount) || 0);
  const currentFinalBill = Math.max(0, calculatedSubtotal + parsedDeliveryCharge - parsedDiscount);
  const currentOrderDue = Math.max(0, currentFinalBill - (order.amount_paid || 0));
  const combinedTotalDue = Math.round((currentOrderDue + previousDue) * 100) / 100;

  const handleSaveBill = async (actionAfterSave?: 'collect_payment' | 'view_invoice') => {
    setError(null);
    if (items.length === 0) {
      setError('Please add at least one clothing item, weight, or curtains.');
      return;
    }

    try {
      setSubmitting(true);

      const payloadItems = items.map(it => {
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
          line_total: calculateLineTotal(it),
          notes: it.notes || null
        };
      });

      const res = await fetch(`/api/orders/${order.id}/items`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          items: payloadItems,
          delivery_charge: parsedDeliveryCharge,
          discount_amount: parsedDiscount,
          target_status: order.status === 'picked_up' ? 'ready_for_delivery' : order.status
        })
      });

      let resData: any = {};
      const resText = await res.text();
      try {
        resData = JSON.parse(resText);
      } catch {
        throw new Error(resText || `Server error (${res.status})`);
      }
      if (!res.ok) throw new Error(resData.error || 'Failed to save real bill');

      // Sync updated order directly to Cloud Firestore in background
      syncOrderToFirestore({
        id: order.id,
        order_number: order.order_number,
        customer_name: order.customer_name,
        customer_mobile: order.customer_mobile,
        pickup_address: order.pickup_address,
        area: order.area,
        status: resData.status || order.status,
        final_total: resData.finalTotal,
        outstanding_amount: resData.outstandingAmount,
        payment_status: resData.outstandingAmount <= 0.01 ? 'paid' : (order.amount_paid > 0 ? 'partially_paid' : 'unpaid')
      }).catch(err => console.warn('[Firestore] Sync bill notice:', err));

      const updatedOrder: Order = {
        ...order,
        subtotal: resData.subtotal,
        delivery_charge: parsedDeliveryCharge,
        discount_amount: parsedDiscount,
        final_total: resData.finalTotal,
        outstanding_amount: resData.outstandingAmount,
        status: resData.status || order.status
      };

      setSuccessMsg(`✅ Real Bill of ₹${resData.finalTotal.toFixed(2)} generated successfully!`);

      if (actionAfterSave === 'collect_payment' && onOpenPaymentCollection) {
        onSuccess(updatedOrder);
        onClose();
        onOpenPaymentCollection(updatedOrder);
        return;
      }

      if (actionAfterSave === 'view_invoice' && onOpenInvoice) {
        onSuccess(updatedOrder);
        onClose();
        onOpenInvoice(order.id);
        return;
      }

      setTimeout(() => {
        onSuccess(updatedOrder);
        onClose();
      }, 1000);

    } catch (err: any) {
      setError(err.message || 'Error saving real bill');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full border border-sky-100 overflow-hidden my-4 max-h-[94vh] flex flex-col animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-sky-600 via-sky-500 to-sky-700 p-5 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center shrink-0">
              <Receipt className="w-5 h-5 text-white" />
            </div>
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider bg-white/25 px-2.5 py-0.5 rounded-full inline-block">
                Delivery Boy • Real Bill Creator
              </span>
              <h3 className="text-lg font-black mt-0.5">
                {order.order_number} • Real Bill & Items
              </h3>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-4 flex-1">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
              <span className="font-bold">{successMsg}</span>
            </div>
          )}

          {/* Customer & Multi-Due Ledger Status Banner */}
          <div className="bg-sky-50/70 border border-sky-200/80 rounded-2xl p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <span className="text-[10px] font-bold text-sky-700 uppercase tracking-wider block">
                  Customer Information
                </span>
                <h4 className="text-base font-extrabold text-slate-900">{order.customer_name}</h4>
                <div className="flex items-center gap-2 text-xs text-slate-600 mt-0.5">
                  <span className="flex items-center gap-1">
                    <Phone className="w-3.5 h-3.5 text-sky-600" />
                    {order.customer_mobile}
                  </span>
                  <span>•</span>
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-sky-600" />
                    {order.area}
                  </span>
                </div>
              </div>

              {/* Pickup Handover Proof Reference (if available) */}
              {(order.total_pieces || order.iron_count || order.wash_count || order.dryclean_count || order.pickup_proof_notes) && (
                <div className="bg-white/90 p-2.5 rounded-xl border border-sky-100 text-[11px] space-y-0.5">
                  <div className="flex items-center gap-1 font-bold text-emerald-800">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Pickup Handover Proof:</span>
                  </div>
                  <div className="text-slate-700 font-medium">
                    {order.clothes_summary || `${order.total_pieces || 0} garments collected`}
                  </div>
                  {order.pickup_proof_notes && (
                    <div className="text-slate-500 italic text-[10px]">
                      "{order.pickup_proof_notes}"
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Smart Due Split Display: Old Due + Current Bill + Grand Total */}
            <div className="grid grid-cols-3 gap-2 pt-2 border-t border-sky-200/60 text-center">
              <div className="bg-white p-2.5 rounded-xl border border-sky-100 shadow-2xs">
                <span className="text-[10px] font-bold text-slate-500 block">Current New Bill</span>
                <span className="text-sm font-black text-sky-700">₹{currentFinalBill.toFixed(2)}</span>
              </div>
              <div className="bg-white p-2.5 rounded-xl border border-sky-100 shadow-2xs">
                <span className="text-[10px] font-bold text-slate-500 block">Previous Due</span>
                <span className="text-sm font-black text-rose-600">
                  {loadingLedger ? '...' : `₹${previousDue.toFixed(2)}`}
                </span>
              </div>
              <div className="bg-amber-50 p-2.5 rounded-xl border border-amber-200 shadow-2xs">
                <span className="text-[10px] font-black text-amber-900 block">Combined Total Due</span>
                <span className="text-sm font-black text-amber-900">
                  {loadingLedger ? '...' : `₹${combinedTotalDue.toFixed(2)}`}
                </span>
              </div>
            </div>
          </div>

          {/* Quick-Add Garment Category Grid */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-sky-600" />
                <span>Quick Add Garments & Rates</span>
              </label>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleAddCurtainSqFt}
                  className="text-[11px] font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 px-2.5 py-1 rounded-lg border border-purple-200 flex items-center gap-1 transition-colors"
                >
                  <Ruler className="w-3 h-3 text-purple-600" />
                  <span>+ Curtain (Sq. Ft)</span>
                </button>
                <button
                  type="button"
                  onClick={handleAddWeightItem}
                  className="text-[11px] font-bold text-amber-800 bg-amber-50 hover:bg-amber-100 px-2.5 py-1 rounded-lg border border-amber-200 flex items-center gap-1 transition-colors"
                >
                  <Scale className="w-3 h-3 text-amber-600" />
                  <span>+ Weight (Kg)</span>
                </button>
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto p-1 bg-slate-50 rounded-2xl border border-slate-200">
              {categories.slice(0, 10).map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => handleAddItemFromCategory(cat)}
                  className="px-2.5 py-1.5 rounded-xl text-xs font-bold bg-white text-slate-800 border border-slate-200 hover:border-sky-400 hover:bg-sky-50 shadow-2xs transition-all flex items-center gap-1.5 active:scale-95"
                >
                  <Plus className="w-3 h-3 text-sky-600" />
                  <span>{cat.name}</span>
                  <span className="text-[10px] text-slate-500 font-normal">₹{cat.default_rate}</span>
                </button>
              ))}
              <button
                type="button"
                onClick={handleAddCustomItem}
                className="px-2.5 py-1.5 rounded-xl text-xs font-bold bg-sky-50 text-sky-800 border border-sky-200 hover:bg-sky-100 shadow-2xs transition-all flex items-center gap-1 active:scale-95"
              >
                <Plus className="w-3 h-3 text-sky-600" />
                <span>+ Custom Item</span>
              </button>
            </div>
          </div>

          {/* Clothing Items Table */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-black text-slate-800 uppercase tracking-wider">
                Bill Items ({items.length})
              </label>
              <span className="text-xs font-bold text-slate-500">
                Subtotal: ₹{calculatedSubtotal.toFixed(2)}
              </span>
            </div>

            {loadingItems ? (
              <div className="p-8 text-center text-slate-400 text-xs italic">
                Loading clothes items...
              </div>
            ) : items.length === 0 ? (
              <div className="p-6 bg-slate-50 rounded-2xl border border-dashed border-slate-200 text-center space-y-1">
                <Shirt className="w-8 h-8 text-slate-300 mx-auto" />
                <p className="text-xs font-bold text-slate-600">No clothes added to real bill yet.</p>
                <p className="text-[11px] text-slate-400">
                  Tap any category button above to add garments or curtains.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
                {items.map((it, idx) => (
                  <div key={it.id} className="p-3 bg-white rounded-2xl border border-slate-200 shadow-2xs space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <span className="text-xs font-mono font-bold text-slate-400 w-4">{idx + 1}.</span>
                        <input
                          type="text"
                          value={it.item_name}
                          onChange={(e) => updateItem(it.id, { item_name: e.target.value })}
                          className="font-bold text-xs text-slate-900 border-b border-transparent hover:border-slate-300 focus:border-sky-500 focus:outline-hidden py-0.5 flex-1 min-w-[120px]"
                          placeholder="Garment name"
                        />
                      </div>

                      {/* Unit badge / toggle */}
                      <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full border ${
                        it.unit === 'sq_ft' 
                          ? 'bg-purple-100 text-purple-800 border-purple-200' 
                          : it.unit === 'kg' 
                            ? 'bg-amber-100 text-amber-900 border-amber-200' 
                            : 'bg-slate-100 text-slate-700 border-slate-200'
                      }`}>
                        {it.unit === 'sq_ft' ? 'Curtains (Sq Ft)' : (it.unit === 'kg' ? 'By Weight' : 'Piece')}
                      </span>

                      <button
                        type="button"
                        onClick={() => removeItem(it.id)}
                        className="p-1 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors"
                        title="Remove item"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Unit Controls: Piece vs Curtains Sq.Ft vs Weight Kg */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-100 text-xs">
                      {it.unit === 'piece' && (
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] text-slate-500 font-medium">Qty:</span>
                          <button
                            type="button"
                            onClick={() => updateItem(it.id, { quantity: Math.max(1, it.quantity - 1) })}
                            className="w-6 h-6 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center font-black text-slate-700"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <input
                            type="number"
                            min="1"
                            value={it.quantity}
                            onChange={(e) => updateItem(it.id, { quantity: Math.max(1, parseInt(e.target.value, 10) || 1) })}
                            className="w-10 text-center font-black text-xs border border-slate-200 rounded-md py-0.5"
                          />
                          <button
                            type="button"
                            onClick={() => updateItem(it.id, { quantity: it.quantity + 1 })}
                            className="w-6 h-6 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center font-black text-slate-700"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      )}

                      {it.unit === 'sq_ft' && (
                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] text-slate-500 font-bold">L(ft):</span>
                            <input
                              type="number"
                              step="0.1"
                              min="0"
                              value={it.sq_ft_length || ''}
                              onChange={(e) => updateItem(it.id, { sq_ft_length: parseFloat(e.target.value) || 0 })}
                              className="w-12 text-center font-bold text-xs border border-slate-200 rounded-md py-0.5"
                              placeholder="Length"
                            />
                          </div>
                          <span>×</span>
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] text-slate-500 font-bold">W(ft):</span>
                            <input
                              type="number"
                              step="0.1"
                              min="0"
                              value={it.sq_ft_width || ''}
                              onChange={(e) => updateItem(it.id, { sq_ft_width: parseFloat(e.target.value) || 0 })}
                              className="w-12 text-center font-bold text-xs border border-slate-200 rounded-md py-0.5"
                              placeholder="Width"
                            />
                          </div>
                          <span className="text-[11px] font-mono font-bold text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded">
                            ={it.sq_ft || 0} sq.ft
                          </span>
                        </div>
                      )}

                      {it.unit === 'kg' && (
                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              min="0"
                              value={it.kg || 0}
                              onChange={(e) => updateItem(it.id, { kg: Math.max(0, parseInt(e.target.value, 10) || 0) })}
                              className="w-12 text-center font-bold text-xs border border-slate-200 rounded-md py-0.5"
                            />
                            <span className="text-[10px] text-slate-500 font-bold">kg</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              min="0"
                              max="999"
                              value={it.grams || 0}
                              onChange={(e) => updateItem(it.id, { grams: Math.max(0, Math.min(999, parseInt(e.target.value, 10) || 0)) })}
                              className="w-14 text-center font-bold text-xs border border-slate-200 rounded-md py-0.5"
                            />
                            <span className="text-[10px] text-slate-500 font-bold">g</span>
                          </div>
                        </div>
                      )}

                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1">
                          <span className="text-[11px] text-slate-500">Rate: ₹</span>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={it.rate}
                            onChange={(e) => updateItem(it.id, { rate: Math.max(0, parseFloat(e.target.value) || 0) })}
                            className="w-16 font-bold text-xs text-right border border-slate-200 rounded-md py-0.5 pr-1"
                          />
                        </div>
                        <span className="font-mono font-black text-slate-900 text-xs min-w-[60px] text-right">
                          = ₹{it.line_total.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Delivery Charge & Discount Inputs */}
          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100">
            <div>
              <label className="text-[11px] font-bold text-slate-700 block mb-1">
                Delivery Charge (₹)
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={deliveryCharge}
                onChange={(e) => setDeliveryCharge(Math.max(0, parseFloat(e.target.value) || 0))}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 font-bold text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-sky-500"
              />
            </div>
            <div>
              <label className="text-[11px] font-bold text-slate-700 block mb-1">
                Discount (₹)
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={discountAmount}
                onChange={(e) => setDiscountAmount(Math.max(0, parseFloat(e.target.value) || 0))}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 font-bold text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-sky-500"
              />
            </div>
          </div>

          {/* Final Strict Financial Summary */}
          <div className="p-4 bg-slate-900 text-white rounded-2xl space-y-2 text-xs shadow-md">
            <div className="flex justify-between text-slate-300">
              <span>Clothes Items Subtotal:</span>
              <span className="font-mono font-bold">₹{calculatedSubtotal.toFixed(2)}</span>
            </div>
            {parsedDeliveryCharge > 0 && (
              <div className="flex justify-between text-slate-300">
                <span>Delivery Charge:</span>
                <span className="font-mono font-bold">+₹{parsedDeliveryCharge.toFixed(2)}</span>
              </div>
            )}
            {parsedDiscount > 0 && (
              <div className="flex justify-between text-emerald-400">
                <span>Discount:</span>
                <span className="font-mono font-bold">-₹{parsedDiscount.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between text-sky-300 font-extrabold pt-1.5 border-t border-slate-800 text-sm">
              <span>Current Order Bill:</span>
              <span className="font-mono">₹{currentFinalBill.toFixed(2)}</span>
            </div>

            {previousDue > 0 && (
              <div className="flex justify-between text-rose-300 font-extrabold">
                <span>Customer Previous Due:</span>
                <span className="font-mono">+₹{previousDue.toFixed(2)}</span>
              </div>
            )}

            <div className="flex justify-between items-center text-amber-300 font-black text-base pt-2 border-t-2 border-slate-700">
              <span>Combined Total Payable:</span>
              <span className="font-mono text-lg">₹{combinedTotalDue.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="py-2.5 px-4 text-xs font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-200 rounded-xl transition-colors"
          >
            Cancel
          </button>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => handleSaveBill('view_invoice')}
              disabled={submitting || items.length === 0}
              className="py-2.5 px-3.5 text-xs font-bold bg-white text-slate-800 border border-slate-300 hover:bg-slate-100 rounded-xl transition-all flex items-center gap-1.5 shadow-2xs"
            >
              <FileText className="w-3.5 h-3.5 text-slate-600" />
              <span>Save & View PDF</span>
            </button>

            <button
              type="button"
              onClick={() => handleSaveBill('collect_payment')}
              disabled={submitting || items.length === 0}
              className="py-2.5 px-3.5 text-xs font-black bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl transition-all flex items-center gap-1.5 shadow-sm shadow-emerald-700/20 active:scale-95"
            >
              <HandCoins className="w-3.5 h-3.5 text-amber-300" />
              <span>Save & Collect Payment</span>
            </button>

            <button
              type="button"
              onClick={() => handleSaveBill()}
              disabled={submitting || items.length === 0}
              className="py-2.5 px-4 text-xs font-black bg-sky-600 hover:bg-sky-700 text-white rounded-xl transition-all flex items-center gap-1.5 shadow-sm shadow-sky-600/20 active:scale-95"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{submitting ? 'Saving Bill...' : 'Save Real Bill'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
