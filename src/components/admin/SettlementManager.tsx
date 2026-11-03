import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.tsx';
import type { ShopSettlement } from '../../types/index.ts';
import { 
  Building2, 
  Truck, 
  IndianRupee, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  UserCheck, 
  RefreshCw,
  Receipt,
  FileCheck
} from 'lucide-react';

interface PendingSettlement {
  shop_id: string;
  collected_by_delivery_boy_id: string;
  shop_name: string;
  delivery_boy_name: string;
  delivery_boy_phone: string;
  transaction_count: number;
  total_collected_pending: number;
}

export const SettlementManager: React.FC = () => {
  const { token, user, t } = useAuth();
  const [pendingList, setPendingList] = useState<PendingSettlement[]>([]);
  const [historyList, setHistoryList] = useState<ShopSettlement[]>([]);
  const [loading, setLoading] = useState(true);

  // Settlement Confirmation Modal
  const [selectedPending, setSelectedPending] = useState<PendingSettlement | null>(null);
  const [settleAmount, setSettleAmount] = useState('');
  const [settleNotes, setSettleNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [resPending, resHistory] = await Promise.all([
        fetch('/api/settlements/pending', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/settlements', { headers: { Authorization: `Bearer ${token}` } })
      ]);

      if (resPending.ok) {
        const d = await resPending.json();
        setPendingList(d.pendingSettlements);
      }
      if (resHistory.ok) {
        const d = await resHistory.json();
        setHistoryList(d.settlements);
      }
    } catch (e) {
      console.error('Failed to fetch settlements', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleOpenSettle = (item: PendingSettlement) => {
    setSelectedPending(item);
    setSettleAmount(String(item.total_collected_pending));
    setError(null);
  };

  const handleConfirmSettlement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPending) return;
    setError(null);

    const amount = parseFloat(settleAmount);
    if (!amount || amount <= 0) {
      setError('Please enter a valid settled amount.');
      return;
    }

    if (amount > selectedPending.total_collected_pending + 0.01) {
      setError(`Amount ₹${amount} exceeds pending unsettled cash of ₹${selectedPending.total_collected_pending.toFixed(2)}.`);
      return;
    }

    try {
      setSubmitting(true);
      const res = await fetch('/api/settlements/record', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          shop_id: selectedPending.shop_id,
          delivery_boy_id: selectedPending.collected_by_delivery_boy_id,
          amount_settled: amount,
          notes: settleNotes.trim() || null
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to confirm settlement');

      setSelectedPending(null);
      await fetchData();
      alert(`Settlement ${data.settlementNumber} recorded! Settled ₹${amount}.`);
    } catch (err: any) {
      setError(err.message || 'Settlement error');
    } finally {
      setSubmitting(false);
    }
  };

  const totalPendingCash = pendingList.reduce((acc, curr) => acc + curr.total_collected_pending, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">
              {t('settlements')} • Shop Cash Settlements
            </h1>
            <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
              {pendingList.length} Pending Handover Batches
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Reconcile cash collected by delivery boys from customers vs. amount handed over to the shop counter.
          </p>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Cash Awaiting Handover</span>
            <span className="text-xl font-black text-amber-700">₹{totalPendingCash.toFixed(2)}</span>
          </div>

          <button
            type="button"
            onClick={fetchData}
            className="p-2.5 text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors border border-slate-200"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Pending Handover Batches Section */}
      <div>
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-3 flex items-center gap-2">
          <Clock className="w-4 h-4 text-amber-600" />
          <span>Pending Handover from Delivery Fleet</span>
        </h2>

        {pendingList.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
            <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
            <h3 className="text-sm font-semibold text-slate-900">All Cash In Hand Settled</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
              There is currently no unsettled customer cash held by delivery boys for this shop.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {pendingList.map((item) => (
              <div
                key={`${item.shop_id}-${item.collected_by_delivery_boy_id}`}
                className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">{item.delivery_boy_name}</h3>
                      <p className="text-xs text-slate-500">{item.delivery_boy_phone}</p>
                    </div>
                    <span className="text-base font-extrabold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-xl border border-amber-200">
                      ₹{item.total_collected_pending.toFixed(2)}
                    </span>
                  </div>

                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-xs space-y-1 mb-4">
                    <div className="flex justify-between text-slate-600">
                      <span>Target Shop:</span>
                      <span className="font-semibold text-slate-800">{item.shop_name}</span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>Cash Transactions:</span>
                      <span className="font-semibold text-slate-800">{item.transaction_count} orders</span>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleOpenSettle(item)}
                  className="w-full py-2.5 px-4 text-xs font-bold text-white bg-emerald-800 hover:bg-emerald-900 rounded-xl shadow-xs transition-colors flex items-center justify-center gap-1.5"
                >
                  <UserCheck className="w-4 h-4" />
                  <span>Confirm Handover & Settlement</span>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* History of Past Settlements */}
      <div>
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-3 flex items-center gap-2">
          <FileCheck className="w-4 h-4 text-emerald-700" />
          <span>Settlement Confirmation Audit History</span>
        </h2>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
          {historyList.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              No historical settlements recorded yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                    <th className="py-3 px-4">Settlement #</th>
                    <th className="py-3 px-4">Shop</th>
                    <th className="py-3 px-4">Delivery Boy</th>
                    <th className="py-3 px-4">Settled Amount</th>
                    <th className="py-3 px-4">Remaining Unsettled</th>
                    <th className="py-3 px-4">Confirmed By</th>
                    <th className="py-3 px-4">Date & Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {historyList.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-50">
                      <td className="py-3 px-4 font-mono font-bold text-slate-900">{s.settlement_number}</td>
                      <td className="py-3 px-4 font-semibold text-slate-800">{s.shop_name}</td>
                      <td className="py-3 px-4 text-slate-700">{s.delivery_boy_name}</td>
                      <td className="py-3 px-4 font-bold text-emerald-800 font-mono">₹{s.amount_settled.toFixed(2)}</td>
                      <td className="py-3 px-4 font-mono text-slate-500">₹{s.remaining_unsettled.toFixed(2)}</td>
                      <td className="py-3 px-4 text-slate-600">{s.confirmed_by_name}</td>
                      <td className="py-3 px-4 text-slate-400 text-[11px]">
                        {new Date(s.created_at).toLocaleString('en-IN')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Confirmation Modal */}
      {selectedPending && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 border border-slate-200">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div>
                <span className="text-xs font-bold text-emerald-800 uppercase">Confirm Shop Settlement</span>
                <h3 className="text-base font-bold text-slate-900">{selectedPending.delivery_boy_name}</h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPending(null)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            {error && (
              <div className="mt-3 p-3 bg-red-50 text-red-700 text-xs rounded-xl border border-red-200 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="my-4 p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs flex justify-between items-center">
              <div>
                <span className="text-slate-500 block">Total Unsettled Cash</span>
                <span className="text-slate-900 font-bold text-sm">₹{selectedPending.total_collected_pending.toFixed(2)}</span>
              </div>
              <div className="text-right">
                <span className="text-slate-500 block">Target Shop</span>
                <span className="text-slate-900 font-bold">{selectedPending.shop_name}</span>
              </div>
            </div>

            <form onSubmit={handleConfirmSettlement} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Amount Handed Over to Shop (₹) *
                </label>
                <div className="relative">
                  <IndianRupee className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="number"
                    step="0.5"
                    required
                    value={settleAmount}
                    onChange={(e) => setSettleAmount(e.target.value)}
                    placeholder="Enter handed over cash"
                    className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 text-sm font-bold focus:ring-2 focus:ring-emerald-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Settlement Notes / Remarks
                </label>
                <input
                  type="text"
                  value={settleNotes}
                  onChange={(e) => setSettleNotes(e.target.value)}
                  placeholder="e.g. Verified by cashier with cash voucher #12"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-emerald-600"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedPending(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2.5 text-xs font-bold text-white bg-emerald-800 hover:bg-emerald-900 rounded-xl shadow-xs disabled:opacity-50 flex items-center gap-1.5"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{submitting ? 'Confirming...' : 'Confirm Receipt into Shop Account'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
