import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.tsx';
import type { Order } from '../../types/index.ts';
import { syncPaymentToFirestore, syncOrderToFirestore } from '../../services/firestoreSync.ts';
import { 
  AlertTriangle, 
  IndianRupee, 
  CheckCircle2, 
  QrCode, 
  Banknote, 
  CreditCard, 
  Send, 
  ShieldCheck, 
  X,
  Phone,
  Building2,
  Calendar,
  FileText,
  Clock,
  ArrowRight,
  HandCoins
} from 'lucide-react';

interface DuePaymentCollectionModalProps {
  order: Order;
  onClose: () => void;
  onSuccess: (updatedOrder?: Partial<Order>) => void;
  autoCompleteDelivery?: boolean;
}

export const DuePaymentCollectionModal: React.FC<DuePaymentCollectionModalProps> = ({
  order,
  onClose,
  onSuccess,
  autoCompleteDelivery = true
}) => {
  const { token, user } = useAuth();
  const [activeMode, setActiveMode] = useState<'collect_and_deliver' | 'credit_delivery'>('collect_and_deliver');
  
  // Payment states
  const [amount, setAmount] = useState<string>(String(order.outstanding_amount || 0));
  const [method, setMethod] = useState<'cash' | 'upi' | 'card' | 'bank_transfer'>('cash');
  const [reference, setReference] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  // Credit delivery states
  const [expectedDate, setExpectedDate] = useState<string>(() => {
    // Default to 3 days in the future
    const d = new Date();
    d.setDate(d.getDate() + 3);
    return d.toISOString().split('T')[0];
  });
  const [creditNotes, setCreditNotes] = useState<string>('');

  // Customer due history
  const [previousDue, setPreviousDue] = useState<number>(0);
  const [loadingLedger, setLoadingLedger] = useState<boolean>(true);

  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Fetch customer's old unpaid dues across other orders
  useEffect(() => {
    let isMounted = true;
    async function loadCustomerDues() {
      try {
        setLoadingLedger(true);
        const res = await fetch(`/api/customers/${order.customer_id}/due-orders`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          // Filter out current order to calculate true previous dues
          const otherOrders = (data.orders || []).filter((o: any) => o.id !== order.id);
          const oldDue = otherOrders.reduce((sum: number, o: any) => sum + (Number(o.outstanding_amount) || 0), 0);
          if (isMounted) setPreviousDue(Math.round(oldDue * 100) / 100);
        }
      } catch (err) {
        console.error('Failed to load customer dues', err);
      } finally {
        if (isMounted) setLoadingLedger(false);
      }
    }
    if (order.customer_id) {
      loadCustomerDues();
    }
    return () => { isMounted = false; };
  }, [order.customer_id, order.id, token]);

  const currentOrderDue = Number(order.outstanding_amount) || 0;
  const currentOrderTotal = Number(order.final_total) || 0;
  const combinedTotalDue = Math.round((currentOrderDue + previousDue) * 100) / 100;

  const numericAmount = parseFloat(amount) || 0;
  const isFullSettlement = numericAmount >= currentOrderDue;

  // Handle standard payment collection and deliver
  const handleCollectAndDeliver = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (numericAmount <= 0) {
      setError('Please enter a valid amount greater than ₹0.');
      return;
    }

    if (combinedTotalDue > 0 && numericAmount > combinedTotalDue + 0.01) {
      setError(`Amount cannot exceed the total customer due of ₹${combinedTotalDue.toFixed(2)}.`);
      return;
    }

    if (method === 'upi' && !reference.trim() && numericAmount > 500) {
      setError('Please enter UPI reference / UTR number.');
      return;
    }

    try {
      setSubmitting(true);

      // 1. Collect payment in backend database
      const resPay = await fetch('/api/payments/collect', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          order_id: order.id,
          amount: numericAmount,
          payment_method: method,
          transaction_reference: reference.trim() || null,
          notes: notes.trim() || (autoCompleteDelivery ? 'Collected at delivery' : 'Due payment collected')
        })
      });

      const payData = await resPay.json();
      if (!resPay.ok) {
        throw new Error(payData.error || 'Payment collection failed.');
      }

      // Sync payment to Firebase Firestore
      if (payData.transactionId) {
        await syncPaymentToFirestore({
          id: payData.transactionId,
          order_id: order.id,
          customer_id: order.customer_id,
          amount: numericAmount,
          payment_method: method,
          transaction_reference: reference.trim() || null,
          collected_by_delivery_boy_id: user?.id || null
        });
      }

      // 2. Advance order status to 'delivered'
      let finalStatus = order.status;
      if (autoCompleteDelivery) {
        const resStatus = await fetch(`/api/orders/${order.id}/status`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            status: 'delivered',
            allow_unpaid_override: numericAmount < currentOrderDue, // allow partial
            notes: `Delivered. Payment of ₹${numericAmount} collected via ${method.toUpperCase()}.`
          })
        });

        if (resStatus.ok) {
          finalStatus = 'delivered';
        }
      }

      const remainingOrderDue = Math.max(0, currentOrderDue - numericAmount);

      // Sync updated order state to Firestore
      await syncOrderToFirestore({
        id: order.id,
        order_number: order.order_number,
        customer_name: order.customer_name,
        customer_mobile: order.customer_mobile,
        final_total: order.final_total,
        amount_paid: (order.amount_paid || 0) + numericAmount,
        outstanding_amount: remainingOrderDue,
        payment_status: remainingOrderDue <= 0.01 ? 'paid' : 'partially_paid',
        status: finalStatus
      });

      setSuccessMsg(`✅ ₹${numericAmount} successfully collected and order delivered!`);

      setTimeout(() => {
        onSuccess({
          amount_paid: (order.amount_paid || 0) + numericAmount,
          outstanding_amount: remainingOrderDue,
          payment_status: remainingOrderDue <= 0.01 ? 'paid' : 'partially_paid',
          status: finalStatus
        });
      }, 1200);

    } catch (err: any) {
      setError(err.message || 'Error processing transaction');
    } finally {
      setSubmitting(false);
    }
  };

  // Handle Credit Delivery
  const handleCreditDelivery = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!expectedDate) {
      setError('Please select expected payment date.');
      return;
    }

    try {
      setSubmitting(true);

      const res = await fetch(`/api/orders/${order.id}/status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          status: 'delivered',
          isCreditDelivery: true,
          delivery_type: 'credit',
          expected_payment_date: expectedDate,
          credit_notes: creditNotes.trim() || 'Credit Delivery',
          notes: `Credit Delivery completed. Expected payment date: ${expectedDate}. ${creditNotes ? 'Note: ' + creditNotes : ''}`
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to complete credit delivery.');
      }

      // Sync to Firestore
      await syncOrderToFirestore({
        id: order.id,
        order_number: order.order_number,
        customer_name: order.customer_name,
        customer_mobile: order.customer_mobile,
        final_total: order.final_total,
        amount_paid: order.amount_paid,
        outstanding_amount: order.outstanding_amount,
        payment_status: order.payment_status,
        status: 'delivered'
      });

      setSuccessMsg(`✅ Order delivered on credit! Expected payment date: ${expectedDate}`);

      setTimeout(() => {
        onSuccess({
          status: 'delivered',
          delivery_type: 'credit',
          expected_payment_date: expectedDate,
          credit_notes: creditNotes.trim() || null
        });
      }, 1200);

    } catch (err: any) {
      setError(err.message || 'Error processing credit delivery');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full border border-sky-100 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header with Sky Blue branding */}
        <div className="bg-gradient-to-r from-sky-600 via-sky-500 to-sky-700 p-5 text-white">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-amber-200" />
              </div>
              <div>
                <span className="text-[11px] font-black uppercase tracking-wider bg-white/25 px-2.5 py-0.5 rounded-full inline-block">
                  Delivery & Payment Options
                </span>
                <h3 className="text-lg font-black mt-1">
                  {order.order_number} • Delivery Confirmation
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
          <p className="text-xs text-sky-100 mt-2 font-medium">
            Collect payment from customer or record credit delivery (pay later).
          </p>
        </div>

        {/* Customer & Multi-Due Ledger Card */}
        <div className="p-5 sm:p-6 space-y-4">
          <div className="bg-sky-50/70 border border-sky-200/80 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold text-sky-700 uppercase tracking-wider block">
                  Customer Details
                </span>
                <h4 className="text-base font-extrabold text-slate-900">{order.customer_name}</h4>
                <div className="flex items-center gap-1.5 text-xs text-slate-600 mt-0.5">
                  <Phone className="w-3.5 h-3.5 text-sky-600" />
                  <span>{order.customer_mobile}</span>
                </div>
              </div>
              <div className="text-right">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                  Current Order Bill
                </span>
                <span className="text-lg font-black text-slate-900">
                  ₹{currentOrderTotal.toFixed(2)}
                </span>
              </div>
            </div>

            {/* Smart Due Split Display */}
            <div className="grid grid-cols-3 gap-2 pt-2 border-t border-sky-200/60 text-center">
              <div className="bg-white p-2 rounded-xl border border-sky-100 shadow-xs">
                <span className="text-[10px] font-bold text-slate-500 block">Order Balance</span>
                <span className="text-sm font-black text-amber-600">₹{currentOrderDue.toFixed(2)}</span>
              </div>
              <div className="bg-white p-2 rounded-xl border border-sky-100 shadow-xs">
                <span className="text-[10px] font-bold text-slate-500 block">Previous Due</span>
                <span className="text-sm font-black text-rose-600">
                  {loadingLedger ? '...' : `₹${previousDue.toFixed(2)}`}
                </span>
              </div>
              <div className="bg-amber-50 p-2 rounded-xl border border-amber-200 shadow-xs">
                <span className="text-[10px] font-black text-amber-900 block">Total Due</span>
                <span className="text-sm font-black text-amber-900">
                  {loadingLedger ? '...' : `₹${combinedTotalDue.toFixed(2)}`}
                </span>
              </div>
            </div>
          </div>

          {/* Mode Switch Tabs */}
          <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1.5 rounded-2xl">
            <button
              type="button"
              onClick={() => setActiveMode('collect_and_deliver')}
              className={`py-2.5 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all ${
                activeMode === 'collect_and_deliver'
                  ? 'bg-sky-500 text-white shadow-md'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Banknote className="w-4 h-4" />
              <span>Collect Payment & Deliver</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveMode('credit_delivery')}
              className={`py-2.5 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all ${
                activeMode === 'credit_delivery'
                  ? 'bg-amber-500 text-white shadow-md'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <HandCoins className="w-4 h-4" />
              <span>Credit Delivery (Pay Later)</span>
            </button>
          </div>

          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
              <span className="font-bold">{successMsg}</span>
            </div>
          )}

          {/* MODE 1: COLLECT PAYMENT AND DELIVER */}
          {activeMode === 'collect_and_deliver' && (
            <form onSubmit={handleCollectAndDeliver} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Amount Collected (₹)
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold">₹</span>
                  <input
                    type="number"
                    step="0.01"
                    min="1"
                    max={combinedTotalDue}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    required
                    className="w-full pl-8 pr-4 py-2.5 rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-sky-500 font-black text-slate-900 text-lg"
                  />
                </div>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {currentOrderDue > 0 && (
                    <button
                      type="button"
                      onClick={() => setAmount(String(Math.round((currentOrderDue / 2) * 100) / 100))}
                      className="text-[11px] font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1 rounded-lg border border-emerald-200 transition-colors"
                    >
                      50% Half (₹{(Math.round((currentOrderDue / 2) * 100) / 100).toFixed(0)})
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setAmount(String(currentOrderDue))}
                    className="text-[11px] font-bold text-sky-800 bg-sky-50 hover:bg-sky-100 px-2.5 py-1 rounded-lg border border-sky-200 transition-colors"
                  >
                    Current Due (₹{currentOrderDue})
                  </button>
                  {previousDue > 0 && (
                    <button
                      type="button"
                      onClick={() => setAmount(String(combinedTotalDue))}
                      className="text-[11px] font-bold text-amber-900 bg-amber-50 hover:bg-amber-100 px-2.5 py-1 rounded-lg border border-amber-200 transition-colors"
                    >
                      Total Due (₹{combinedTotalDue})
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-slate-500 mt-1 font-medium">
                  💡 Partial payments supported: You can enter any amount up to the total due of ₹{combinedTotalDue.toFixed(2)}.
                </p>
              </div>

              {/* Payment Method Selector */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Payment Method
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setMethod('cash')}
                    className={`py-2 px-3 rounded-xl border text-xs font-bold flex flex-col items-center gap-1 transition-all ${
                      method === 'cash'
                        ? 'border-emerald-500 bg-emerald-50 text-emerald-800 shadow-xs'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-600'
                    }`}
                  >
                    <Banknote className="w-4 h-4 text-emerald-600" />
                    <span>Cash</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setMethod('upi')}
                    className={`py-2 px-3 rounded-xl border text-xs font-bold flex flex-col items-center gap-1 transition-all ${
                      method === 'upi'
                        ? 'border-sky-500 bg-sky-50 text-sky-800 shadow-xs'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-600'
                    }`}
                  >
                    <QrCode className="w-4 h-4 text-sky-600" />
                    <span>UPI / QR</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setMethod('card')}
                    className={`py-2 px-3 rounded-xl border text-xs font-bold flex flex-col items-center gap-1 transition-all ${
                      method === 'card'
                        ? 'border-purple-500 bg-purple-50 text-purple-800 shadow-xs'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-600'
                    }`}
                  >
                    <CreditCard className="w-4 h-4 text-purple-600" />
                    <span>Card / POS</span>
                  </button>
                </div>
              </div>

              {method === 'upi' && (
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    UPI Reference Number (UTR / Ref)
                  </label>
                  <input
                    type="text"
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    placeholder="e.g. 402819284912"
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-sky-500 text-xs font-medium"
                  />
                </div>
              )}

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Notes (Optional)
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Payment details or remarks"
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-sky-500 text-xs font-medium"
                />
              </div>

              <div className="flex gap-2 pt-2">
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
                  disabled={submitting || numericAmount <= 0}
                  className="flex-2 py-2.5 px-4 rounded-xl bg-sky-500 hover:bg-sky-600 text-white font-black text-xs shadow-md shadow-sky-500/25 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{submitting ? 'Processing...' : `Collect ₹${numericAmount} & Deliver`}</span>
                </button>
              </div>
            </form>
          )}

          {/* MODE 2: CREDIT DELIVERY */}
          {activeMode === 'credit_delivery' && (
            <form onSubmit={handleCreditDelivery} className="space-y-4">
              <div className="bg-amber-50/80 border border-amber-200 rounded-2xl p-4 text-amber-900 text-xs space-y-1">
                <div className="flex items-center gap-2 font-bold text-amber-800">
                  <HandCoins className="w-4 h-4 text-amber-600" />
                  <span>Credit Delivery Terms</span>
                </div>
                <p>
                  Order will be marked delivered without payment. Remaining balance of <strong>₹{currentOrderDue.toFixed(2)}</strong> will remain on the customer account ledger.
                </p>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 flex items-center gap-1 mb-1">
                  <Calendar className="w-3.5 h-3.5 text-sky-600" />
                  <span>Expected Payment Date *</span>
                </label>
                <input
                  type="date"
                  value={expectedDate}
                  min={new Date().toISOString().split('T')[0]}
                  onChange={(e) => setExpectedDate(e.target.value)}
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-amber-500 text-sm font-bold text-slate-900"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 flex items-center gap-1 mb-1">
                  <FileText className="w-3.5 h-3.5 text-sky-600" />
                  <span>Credit Notes / Customer Promise</span>
                </label>
                <textarea
                  value={creditNotes}
                  onChange={(e) => setCreditNotes(e.target.value)}
                  placeholder="e.g. 'Will pay via UPI on Monday' or 'After month end'"
                  rows={2}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-amber-500 text-xs font-medium"
                />
              </div>

              <div className="flex gap-2 pt-2">
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
                  disabled={submitting || !expectedDate}
                  className="flex-2 py-2.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-black text-xs shadow-md shadow-amber-500/25 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                >
                  <HandCoins className="w-4 h-4" />
                  <span>{submitting ? 'Recording...' : 'Confirm Credit Delivery'}</span>
                </button>
              </div>
            </form>
          )}

        </div>
      </div>
    </div>
  );
};
