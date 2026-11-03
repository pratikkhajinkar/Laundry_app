import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.tsx';
import type { DuePaymentItem } from '../../types/index.ts';
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
  X
} from 'lucide-react';

export const DuePaymentsView: React.FC = () => {
  const { token, user, t } = useAuth();
  const [items, setItems] = useState<DuePaymentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Collect Payment Modal
  const [selectedItem, setSelectedItem] = useState<DuePaymentItem | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState<'cash' | 'upi' | 'card'>('cash');
  const [payRef, setPayRef] = useState('');
  const [payNotes, setPayNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const fetchDuePayments = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/due-payments', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setItems(data.duePayments);
      }
    } catch (err) {
      console.error('Error fetching due payments:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDuePayments();
  }, []);

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
      setError('Please enter a valid payment amount.');
      return;
    }

    if (amount > selectedItem.outstanding_balance + 0.01) {
      setError(`Amount ₹${amount} exceeds the balance due of ₹${selectedItem.outstanding_balance.toFixed(2)}.`);
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

      setSuccess(`✅ Payment of ₹${amount} recorded! New balance: ₹${data.remainingBalance.toFixed(2)}`);
      await fetchDuePayments();

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
    it.customer_area.toLowerCase().includes(search.toLowerCase())
  );

  const totalOutstanding = filtered.reduce((acc, curr) => acc + curr.outstanding_balance, 0);

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-3xl border border-sky-100 shadow-sm shadow-sky-500/5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-black text-slate-900 tracking-tight">
              {t('duePayments')} • Due Payments Management
            </h1>
            <span className="text-xs font-black px-3 py-1 rounded-full bg-rose-100 text-rose-800 border border-rose-200">
              {filtered.length} Outstanding
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Real-time tracking of unpaid customer balances. Partial or full payments are confirmed into database records.
          </p>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right">
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider block">Total Outstanding</span>
            <span className="text-2xl font-black text-rose-600">₹{totalOutstanding.toFixed(2)}</span>
          </div>

          <button
            type="button"
            onClick={fetchDuePayments}
            className="p-2.5 text-slate-600 hover:text-sky-900 bg-sky-50 hover:bg-sky-100 rounded-2xl transition-colors border border-sky-100"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Search Input */}
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3.5 top-3.5 text-slate-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter by customer name, mobile, invoice # (INV-...), or area..."
          className="w-full pl-10 pr-4 py-3 bg-white border border-sky-100 rounded-2xl text-xs font-medium text-slate-900 focus:ring-2 focus:ring-sky-400 shadow-xs"
        />
      </div>

      {/* Due Payments Cards / Table */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-3xl border border-sky-100 p-12 text-center shadow-sm">
          <CheckCircle2 className="w-12 h-12 text-sky-500 mx-auto mb-2" />
          <h3 className="text-base font-extrabold text-slate-900">No Outstanding Due Payments</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
            All customer invoices have been fully settled or no unpaid bills match your filter.
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
                    <span>Shop:</span>
                    <span className="font-bold text-slate-800">{item.shop_name}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Area:</span>
                    <span className="font-bold text-slate-800">{item.customer_area}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Total Bill:</span>
                    <span className="font-bold text-slate-900">₹{item.final_total.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Paid So Far:</span>
                    <span className="font-bold text-emerald-700">₹{item.amount_paid.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="pt-3 border-t border-sky-100 flex items-center justify-between gap-2">
                <a
                  href={`https://wa.me/91${item.customer_mobile.replace(/\D/g, '')}?text=${encodeURIComponent(
                    `Namaskar ${item.customer_name}, your laundry bill for ${item.order_number} has an outstanding balance of ₹${item.outstanding_balance.toFixed(2)}. Please pay at delivery or via UPI: friendslaundry@upi. Thank you! - Friends Laundry & Dry Cleaners`
                  )}`}
                  target="_blank"
                  rel="noreferrer"
                  className="p-2.5 bg-sky-50 hover:bg-sky-100 text-sky-800 rounded-2xl text-xs font-bold border border-sky-100 flex items-center gap-1 transition-colors"
                >
                  <Send className="w-3.5 h-3.5 text-sky-600" />
                  <span>Reminder</span>
                </a>

                <button
                  type="button"
                  onClick={() => handleOpenCollect(item)}
                  className="flex-1 py-2.5 px-3 bg-gradient-to-r from-sky-500 to-sky-600 hover:from-sky-600 hover:to-sky-700 text-white rounded-2xl text-xs font-black shadow-sm shadow-sky-500/25 flex items-center justify-center gap-1.5 transition-all"
                >
                  <IndianRupee className="w-3.5 h-3.5" />
                  <span>Collect ₹{item.outstanding_balance.toFixed(2)}</span>
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
                  Record Due Payment
                </span>
                <h3 className="text-lg font-black mt-1">{selectedItem.customer_name}</h3>
                <p className="text-xs text-sky-100 mt-0.5">{selectedItem.order_number} • {selectedItem.invoice_number}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedItem(null)}
                className="text-white/80 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 sm:p-6 space-y-4">
              <div className="p-4 rounded-2xl bg-sky-50/70 border border-sky-100 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold text-slate-500 uppercase block">Outstanding Balance</span>
                  <span className="text-2xl font-black text-rose-600">₹{selectedItem.outstanding_balance.toFixed(2)}</span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] font-bold text-slate-500 uppercase block">Total Bill</span>
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
                    Select Payment Method *
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setPayMethod('cash')}
                      className={`flex flex-col items-center justify-center p-3 rounded-2xl border text-xs font-bold transition-all ${
                        payMethod === 'cash'
                          ? 'bg-sky-600 text-white border-sky-600 shadow-sm'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <Banknote className="w-5 h-5 mb-1" />
                      <span>Cash</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setPayMethod('upi')}
                      className={`flex flex-col items-center justify-center p-3 rounded-2xl border text-xs font-bold transition-all ${
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
                      className={`flex flex-col items-center justify-center p-3 rounded-2xl border text-xs font-bold transition-all ${
                        payMethod === 'card'
                          ? 'bg-sky-600 text-white border-sky-600 shadow-sm'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <CreditCard className="w-5 h-5 mb-1" />
                      <span>Card / Net</span>
                    </button>
                  </div>
                </div>

                {/* Amount input */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-black text-slate-700 uppercase">
                      Amount Collected (₹) *
                    </label>
                    <button
                      type="button"
                      onClick={() => setPayAmount(String(selectedItem.outstanding_balance))}
                      className="text-[11px] font-bold text-sky-600 hover:text-sky-800 underline"
                    >
                      Full Due (₹{selectedItem.outstanding_balance})
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
                      UPI Ref / Receipt No.
                    </label>
                    <input
                      type="text"
                      value={payRef}
                      onChange={(e) => setPayRef(e.target.value)}
                      placeholder="e.g. 439281729182"
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:border-sky-500 focus:outline-hidden"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                      Notes
                    </label>
                    <input
                      type="text"
                      value={payNotes}
                      onChange={(e) => setPayNotes(e.target.value)}
                      placeholder="e.g. Cash collected"
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:border-sky-500 focus:outline-hidden"
                    />
                  </div>
                </div>

                <div className="pt-2 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedItem(null)}
                    className="px-4 py-2.5 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting || !!success}
                    className="px-5 py-2.5 text-xs font-black text-white bg-gradient-to-r from-sky-500 to-sky-600 hover:from-sky-600 hover:to-sky-700 rounded-xl shadow-md shadow-sky-500/20 disabled:opacity-50"
                  >
                    {submitting ? 'Processing...' : `Collect ₹${payAmount || '0'}`}
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
