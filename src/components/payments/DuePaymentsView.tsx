import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext.tsx';
import type { DuePaymentItem, Shop } from '../../types/index.ts';
import { syncPaymentToFirestore } from '../../services/firestoreSync.ts';
import { 
  IndianRupee, 
  Search, 
  CheckCircle2, 
  AlertCircle, 
  Phone, 
  MapPin, 
  Receipt, 
  Calendar,
  Send,
  RefreshCw,
  Clock,
  ArrowRight,
  Banknote,
  QrCode,
  CreditCard,
  X,
  Filter,
  Building2,
  Check,
  Store,
  ShieldAlert
} from 'lucide-react';

interface ShopDuesSummary {
  shop_id: string;
  shop_name: string;
  shop_code: string;
  shop_phone?: string;
  shop_address?: string;
  due_orders_count: number;
  total_due_amount: number;
}

export const DuePaymentsView: React.FC = () => {
  const { token, user, t, activeShopId, setActiveShopId, shops: authShops, refreshShops } = useAuth();
  const [items, setItems] = useState<DuePaymentItem[]>([]);
  const [localShops, setLocalShops] = useState<Shop[]>([]);
  const [shopSummaries, setShopSummaries] = useState<ShopDuesSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedShopId, setSelectedShopId] = useState<string>(() => {
    return activeShopId || '';
  });

  // Collect Payment Modal
  const [selectedItem, setSelectedItem] = useState<DuePaymentItem | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState<'cash' | 'upi' | 'card'>('cash');
  const [payRef, setPayRef] = useState('');
  const [payNotes, setPayNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Fetch shops & dues summary
  const fetchSummary = useCallback(async () => {
    if (!token) return;
    try {
      const [resSummary, resShops] = await Promise.all([
        fetch('/api/due-payments/summary', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/shops', { headers: { Authorization: `Bearer ${token}` } })
      ]);

      let loadedShops: Shop[] = [];
      if (resShops.ok) {
        const d = await resShops.json();
        loadedShops = d.shops || [];
        setLocalShops(loadedShops);
      }

      if (resSummary.ok) {
        const d = await resSummary.json();
        setShopSummaries(d.summary || []);
      }

      // Ensure a valid shop is selected (strictly NO "all" to prevent mixing)
      setSelectedShopId((current) => {
        if (user?.role === 'shop' && user.shop_id) {
          return user.shop_id;
        }
        if (current && loadedShops.some(s => s.id === current)) {
          return current;
        }
        if (activeShopId && loadedShops.some(s => s.id === activeShopId)) {
          return activeShopId;
        }
        if (loadedShops.length > 0) {
          // Prefer shop with dues if any, otherwise first shop
          return loadedShops[0].id;
        }
        return '';
      });
    } catch (err) {
      console.error('Error fetching dues summary:', err);
    }
  }, [token, user?.role, user?.shop_id, activeShopId]);

  // Fetch due payments for the strictly selected shop
  const fetchDuePayments = useCallback(async () => {
    if (!token) return;
    const targetShop = user?.role === 'shop' ? user.shop_id : selectedShopId;
    if (!targetShop) return;

    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.set('shop_id', targetShop);

      const res = await fetch(`/api/due-payments?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setItems(data.duePayments || []);
      }
    } catch (err) {
      console.error('Error fetching due payments:', err);
    } finally {
      setLoading(false);
    }
  }, [token, user?.role, user?.shop_id, selectedShopId]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  useEffect(() => {
    if (selectedShopId) {
      fetchDuePayments();
    }
  }, [selectedShopId, fetchDuePayments]);

  // Sync with global activeShopId changes
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

  const handleOpenCollect = (item: DuePaymentItem) => {
    setSelectedItem(item);
    setPayAmount(String(item.outstanding_balance));
    setError(null);
    setSuccess(null);
    setPayRef('');
    setPayNotes('');
    setPayMethod('cash');
  };

  const handleConfirmPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem) return;
    setError(null);

    const amount = parseFloat(payAmount);
    if (!amount || amount <= 0) {
      setError('कृपया वैध रक्कम टाका / Please enter a valid payment amount.');
      return;
    }

    if (amount > selectedItem.outstanding_balance + 0.01) {
      setError(`रक्कम ₹${amount} ही बाकी रक्कम ₹${selectedItem.outstanding_balance.toFixed(2)} पेक्षा जास्त असू शकत नाही.`);
      return;
    }

    try {
      setSubmitting(true);
      const res = await fetch('/api/payments/collect', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          order_id: selectedItem.order_id,
          invoice_id: selectedItem.invoice_id,
          amount,
          payment_method: payMethod,
          transaction_reference: payRef.trim() || null,
          notes: payNotes.trim() || 'Due payment collection'
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Payment failed');

      // Dual-persistence sync to Firebase Firestore
      if (data.transactionId) {
        await syncPaymentToFirestore({
          id: data.transactionId,
          order_id: selectedItem.order_id,
          customer_id: selectedItem.customer_id,
          amount,
          payment_method: payMethod,
          transaction_reference: payRef.trim() || null,
          collected_by_delivery_boy_id: user?.id || null
        });
      }

      setSuccess(`✅ ₹${amount} ची रक्कम जमा झाली! नवीन बाकी: ₹${data.remainingBalance.toFixed(2)}`);
      await Promise.all([fetchDuePayments(), fetchSummary()]);

      setTimeout(() => {
        setSelectedItem(null);
        setSuccess(null);
      }, 1500);
    } catch (err: any) {
      setError(err.message || 'Payment collection error');
    } finally {
      setSubmitting(false);
    }
  };

  const filtered = items.filter(it => 
    it.customer_name.toLowerCase().includes(search.toLowerCase()) ||
    it.customer_mobile.includes(search) ||
    it.invoice_number.toLowerCase().includes(search.toLowerCase()) ||
    it.order_number.toLowerCase().includes(search.toLowerCase()) ||
    (it.customer_area && it.customer_area.toLowerCase().includes(search.toLowerCase()))
  );

  const totalOutstanding = filtered.reduce((acc, curr) => acc + curr.outstanding_balance, 0);

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-3xl border border-sky-100 shadow-sm shadow-sky-500/5">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
              <IndianRupee className="w-6 h-6 text-sky-600" />
              <span>शाखा-वार बाकी ऑर्डर्स (Shop-Wise Due Orders)</span>
            </h1>
            <span className="text-xs font-black px-3 py-1 rounded-full bg-rose-100 text-rose-800 border border-rose-200">
              {filtered.length} बाकी ऑर्डर्स (Due)
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            प्रत्येक शाखेची बाकी ऑर्डर्स व पेमेंट्स स्वतंत्रपणे दाखवली जातात. शाखा निवडून फक्त त्याच शाखेची बाकी रक्कम तपासा.
          </p>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right">
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider block">
              या शाखेची एकूण बाकी (Shop Due)
            </span>
            <span className="text-2xl sm:text-3xl font-black text-rose-600">
              ₹{totalOutstanding.toFixed(2)}
            </span>
          </div>

          <button
            type="button"
            onClick={() => { fetchDuePayments(); fetchSummary(); }}
            className="p-3 text-slate-600 hover:text-sky-900 bg-sky-50 hover:bg-sky-100 rounded-2xl transition-colors border border-sky-100 cursor-pointer shadow-xs"
            title="ताजे आकडे लोड करा / Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Prominent Shop Tabs / Cards (Only for Admin; Shop staff sees only their shop) */}
      {user?.role === 'admin' && effectiveShops.length > 0 && (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-black uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
              <Store className="w-4 h-4 text-sky-600" />
              <span>शाखा निवडा (Select Shop Branch — Zero Mixing)</span>
            </span>
            <span className="text-[11px] font-bold text-sky-700 bg-sky-50 px-2.5 py-0.5 rounded-full border border-sky-200">
              एकूण ४ शाखा
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {effectiveShops.map(shop => {
              const isSelected = selectedShopId === shop.id;
              const summary = shopSummaries.find(s => s.shop_id === shop.id);
              const dueCount = summary ? summary.due_orders_count : 0;
              const dueAmount = summary ? summary.total_due_amount : 0;
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
                  <div className="flex items-start justify-between gap-2 mb-2.5">
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

                    <span className={`text-xs font-black px-2.5 py-1 rounded-full shrink-0 flex items-center gap-1 ${
                      dueCount > 0
                        ? isSelected 
                          ? 'bg-rose-500 text-white shadow-xs' 
                          : 'bg-rose-100 text-rose-700 border border-rose-200'
                        : isSelected 
                          ? 'bg-white/20 text-sky-100' 
                          : 'bg-slate-100 text-slate-500'
                    }`}>
                      {dueCount} Due
                    </span>
                  </div>

                  <div className="pt-2 border-t border-current/15 flex items-baseline justify-between mt-auto">
                    <span className={`text-[11px] font-bold ${isSelected ? 'text-sky-100' : 'text-slate-500'}`}>
                      एकूण बाकी:
                    </span>
                    <span className={`text-base font-black ${
                      isSelected ? 'text-white' : dueAmount > 0 ? 'text-rose-600' : 'text-slate-700'
                    }`}>
                      ₹{dueAmount.toFixed(2)}
                    </span>
                  </div>

                  {isSelected && (
                    <div className="absolute top-2 right-2 text-sky-200 opacity-20 pointer-events-none">
                      <Check className="w-12 h-12" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Active Selected Shop Banner */}
      <div className="p-4 sm:p-5 bg-gradient-to-r from-sky-50 via-white to-sky-50 border border-sky-200 rounded-3xl flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xs">
        <div className="flex items-start sm:items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-sky-600 to-sky-400 text-white flex items-center justify-center font-black shadow-md shadow-sky-500/25 shrink-0 mt-0.5 sm:mt-0">
            <Building2 className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-black uppercase tracking-wider text-sky-800 bg-sky-100 px-2 py-0.5 rounded-full border border-sky-200">
                सध्या निवडलेली शाखा (Active Selected Branch)
              </span>
              {currentShop?.code && (
                <span className="text-[10px] font-bold text-slate-500">
                  Code: {currentShop.code}
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

        <div className="flex items-center gap-3 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 md:border-l border-sky-200 md:pl-5">
          <div className="text-left md:text-right">
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider block">
              शाखा बाकी हिशोब
            </span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl font-black text-rose-600">
                ₹{totalOutstanding.toFixed(2)}
              </span>
              <span className="text-xs font-bold text-slate-500">
                ({filtered.length} ऑर्डर्स)
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Search Input */}
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3.5 top-3.5 text-slate-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ग्राहकाचे नाव, मोबाईल, बिल क्रमांक (INV-...) किंवा ऑर्डर क्रमांक शोधा..."
          className="w-full pl-10 pr-4 py-3 bg-white border border-sky-100 rounded-2xl text-xs font-medium text-slate-900 focus:ring-2 focus:ring-sky-400 shadow-xs"
        />
      </div>

      {/* Due Payments Cards / Table */}
      {loading ? (
        <div className="bg-white rounded-3xl border border-sky-100 p-12 text-center shadow-sm">
          <div className="w-8 h-8 border-4 border-sky-600 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
          <p className="text-xs font-bold text-slate-600">शाखेची बाकी ऑर्डर्स लोड होत आहेत...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-3xl border border-sky-100 p-12 text-center shadow-sm">
          <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-2" />
          <h3 className="text-base font-extrabold text-slate-900">या शाखेमध्ये कोणतीही बाकी रक्कम नाही</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
            {currentShop?.name || 'निवडलेल्या शाखेची'} सर्व बिले पूर्ण भरलेली आहेत अथवा शोध परिणामात कोणतीही ऑर्डर सापडली नाही.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((item) => (
            <div
              key={item.invoice_id}
              className="bg-white rounded-3xl border border-sky-100 p-5 shadow-sm shadow-sky-500/5 hover:border-sky-300 transition-all flex flex-col justify-between"
            >
              <div>
                {/* Header */}
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div>
                    <span className="text-[10px] font-bold text-sky-700 uppercase tracking-wider block">
                      {item.invoice_number} • {item.order_number}
                    </span>
                    <h3 className="text-base font-black text-slate-900 leading-tight mt-0.5">
                      {item.customer_name}
                    </h3>
                    <div className="flex items-center gap-1 text-xs text-slate-500 mt-0.5">
                      <Phone className="w-3.5 h-3.5 text-sky-600" />
                      <a href={`tel:${item.customer_mobile}`} className="hover:underline font-bold text-slate-700">
                        {item.customer_mobile}
                      </a>
                    </div>
                  </div>

                  <span className="text-lg font-black text-rose-700 bg-rose-50 px-3 py-1 rounded-2xl border border-rose-200">
                    ₹{item.outstanding_balance.toFixed(2)}
                  </span>
                </div>

                {/* Details box */}
                <div className="p-3 bg-sky-50/50 rounded-2xl border border-sky-100 text-xs space-y-1.5 mb-3">
                  <div className="flex justify-between text-slate-600">
                    <span>शाखा (Branch):</span>
                    <span className="font-bold text-slate-800">{item.shop_name}</span>
                  </div>
                  {item.customer_area && (
                    <div className="flex justify-between text-slate-600">
                      <span>पत्ता / एरिया:</span>
                      <span className="font-bold text-slate-800">{item.customer_area}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-slate-600">
                    <span>एकूण बिल (Total Bill):</span>
                    <span className="font-bold text-slate-900">₹{item.final_total.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>भरलेली रक्कम (Paid):</span>
                    <span className="font-bold text-emerald-700">₹{item.amount_paid.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="pt-3 border-t border-sky-100 flex items-center justify-between gap-2">
                <a
                  href={`https://wa.me/91${item.customer_mobile.replace(/\D/g, '')}?text=${encodeURIComponent(
                    `नमस्कार ${item.customer_name}, फ्रेंड्स लॉन्ड्री अँड ड्राय क्लीनर्स (${item.shop_name}) मधील आपल्या ऑर्डर क्रमांक ${item.order_number} ची बाकी रक्कम ₹${item.outstanding_balance.toFixed(2)} आहे. कृपया डिलिव्हरीच्या वेळी किंवा ऑनलाईन UPI द्वारे अदा करावी. धन्यवाद! - फ्रेंड्स लॉन्ड्री`
                  )}`}
                  target="_blank"
                  rel="noreferrer"
                  className="p-2.5 bg-sky-50 hover:bg-sky-100 text-sky-800 rounded-2xl text-xs font-bold border border-sky-100 flex items-center gap-1 transition-colors"
                  title="WhatsApp मेसेज पाठवा"
                >
                  <Send className="w-3.5 h-3.5 text-sky-600" />
                  <span>स्मरणपत्र</span>
                </a>

                <button
                  type="button"
                  onClick={() => handleOpenCollect(item)}
                  className="flex-1 py-2.5 px-3 bg-gradient-to-r from-sky-500 to-sky-600 hover:from-sky-600 hover:to-sky-700 text-white rounded-2xl text-xs font-black shadow-sm shadow-sky-500/25 flex items-center justify-center gap-1.5 transition-all cursor-pointer active:scale-98"
                >
                  <IndianRupee className="w-3.5 h-3.5" />
                  <span>रक्कम जमा करा ₹{item.outstanding_balance.toFixed(2)}</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Collect Payment Modal */}
      {selectedItem && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full border border-sky-100 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="bg-gradient-to-r from-sky-600 to-[#0369A1] p-5 text-white flex items-start justify-between">
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider bg-white/20 px-2.5 py-0.5 rounded-full">
                  रक्कम जमा नोंदणी (Record Payment)
                </span>
                <h3 className="text-lg font-black mt-1">{selectedItem.customer_name}</h3>
                <p className="text-xs text-sky-100 mt-0.5">{selectedItem.order_number} • {selectedItem.invoice_number}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedItem(null)}
                className="text-white/80 hover:text-white p-1 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 sm:p-6 space-y-4">
              <div className="p-4 rounded-2xl bg-sky-50/70 border border-sky-100 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold text-slate-500 uppercase block">बाकी रक्कम (Outstanding)</span>
                  <span className="text-2xl font-black text-rose-600">₹{selectedItem.outstanding_balance.toFixed(2)}</span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] font-bold text-slate-500 uppercase block">एकूण बिल</span>
                  <span className="text-sm font-bold text-slate-900">₹{selectedItem.final_total.toFixed(2)}</span>
                </div>
              </div>

              {error && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {success && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold rounded-xl flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                  <span>{success}</span>
                </div>
              )}

              <form onSubmit={handleConfirmPayment} className="space-y-4">
                {/* Method selector */}
                <div>
                  <label className="block text-xs font-black text-slate-700 uppercase mb-1.5">
                    पेमेंट पद्धत निवडा *
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setPayMethod('cash')}
                      className={`flex flex-col items-center justify-center p-3 rounded-2xl border text-xs font-bold transition-all cursor-pointer ${
                        payMethod === 'cash'
                          ? 'bg-sky-600 text-white border-sky-600 shadow-sm'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <Banknote className="w-5 h-5 mb-1" />
                      <span>रोख (Cash)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setPayMethod('upi')}
                      className={`flex flex-col items-center justify-center p-3 rounded-2xl border text-xs font-bold transition-all cursor-pointer ${
                        payMethod === 'upi'
                          ? 'bg-sky-600 text-white border-sky-600 shadow-sm'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <QrCode className="w-5 h-5 mb-1" />
                      <span>UPI / QR</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setPayMethod('card')}
                      className={`flex flex-col items-center justify-center p-3 rounded-2xl border text-xs font-bold transition-all cursor-pointer ${
                        payMethod === 'card'
                          ? 'bg-sky-600 text-white border-sky-600 shadow-sm'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <CreditCard className="w-5 h-5 mb-1" />
                      <span>कार्ड / नेट</span>
                    </button>
                  </div>
                </div>

                {/* Amount input */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-black text-slate-700 uppercase">
                      जमा झालेली रक्कम (₹) *
                    </label>
                    <button
                      type="button"
                      onClick={() => setPayAmount(String(selectedItem.outstanding_balance))}
                      className="text-[11px] font-bold text-sky-600 hover:text-sky-800 underline cursor-pointer"
                    >
                      पूर्ण बाकी (₹{selectedItem.outstanding_balance.toFixed(2)})
                    </button>
                  </div>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                      <IndianRupee className="w-5 h-5 text-slate-400" />
                    </div>
                    <input
                      type="number"
                      step="0.01"
                      required
                      value={payAmount}
                      onChange={(e) => setPayAmount(e.target.value)}
                      placeholder="0.00"
                      className="w-full pl-10 pr-4 py-3 rounded-xl border-2 border-slate-200 focus:border-sky-500 text-base font-extrabold text-slate-900"
                    />
                  </div>
                </div>

                {/* Reference & Notes */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                      UPI Ref / पावती क्र.
                    </label>
                    <input
                      type="text"
                      value={payRef}
                      onChange={(e) => setPayRef(e.target.value)}
                      placeholder="उदा. 439281729182"
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:border-sky-500 focus:outline-hidden"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                      टीप (Notes)
                    </label>
                    <input
                      type="text"
                      value={payNotes}
                      onChange={(e) => setPayNotes(e.target.value)}
                      placeholder="उदा. बाकी रक्कम जमा"
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:border-sky-500 focus:outline-hidden"
                    />
                  </div>
                </div>

                <div className="pt-2 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedItem(null)}
                    className="px-4 py-2.5 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl cursor-pointer"
                  >
                    रद्द करा
                  </button>
                  <button
                    type="submit"
                    disabled={submitting || !!success}
                    className="px-5 py-2.5 text-xs font-black text-white bg-gradient-to-r from-sky-500 to-sky-600 hover:from-sky-600 hover:to-sky-700 rounded-xl shadow-md shadow-sky-500/20 disabled:opacity-50 cursor-pointer active:scale-98"
                  >
                    {submitting ? 'जमा होत आहे...' : `जमा करा ₹${payAmount || '0'}`}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
