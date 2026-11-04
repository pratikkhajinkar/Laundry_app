import React, { useState, useEffect, useCallback } from 'react';
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
  FileCheck,
  Store,
  Check
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
  const { token, user, t, activeShopId, setActiveShopId, shops: authShops } = useAuth();
  const [pendingList, setPendingList] = useState<PendingSettlement[]>([]);
  const [historyList, setHistoryList] = useState<ShopSettlement[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedShopId, setSelectedShopId] = useState<string>(() => activeShopId || '');

  // Settlement Confirmation Modal
  const [selectedPending, setSelectedPending] = useState<PendingSettlement | null>(null);
  const [settleAmount, setSettleAmount] = useState('');
  const [settleNotes, setSettleNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!token) return;
    try {
      setLoading(true);
      const targetShop = user?.role === 'shop' ? user.shop_id : selectedShopId;
      const params = new URLSearchParams();
      if (targetShop) params.set('shop_id', targetShop);

      const [resPending, resHistory] = await Promise.all([
        fetch(`/api/settlements/pending?${params.toString()}`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`/api/settlements?${params.toString()}`, { headers: { Authorization: `Bearer ${token}` } })
      ]);

      if (resPending.ok) {
        const d = await resPending.json();
        setPendingList(d.pendingSettlements || []);
      }
      if (resHistory.ok) {
        const d = await resHistory.json();
        setHistoryList(d.settlements || []);
      }
    } catch (e) {
      console.error('Failed to fetch settlements', e);
    } finally {
      setLoading(false);
    }
  }, [token, user?.role, user?.shop_id, selectedShopId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (activeShopId && activeShopId !== selectedShopId) {
      setSelectedShopId(activeShopId);
    }
  }, [activeShopId]);

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
  const currentShop = authShops.find(s => s.id === selectedShopId);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-3xl border border-sky-100 shadow-sm shadow-sky-500/5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
              <Receipt className="w-6 h-6 text-sky-600" />
              <span>शाखा-वार कॅश हिशोब (Shop Cash Settlements)</span>
            </h1>
            <span className="text-xs font-black px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
              {pendingList.length} बॅचेस बाकी
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            डिलिव्हरी बॉईजने ग्राहकांकडून गोळा केलेली रोख रक्कम काउंटरवर जमा करण्याची शाखा-निहाय नोंद.
          </p>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right">
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider block">
              जमा होणे बाकी रोख (Pending Handover)
            </span>
            <span className="text-2xl font-black text-amber-700">₹{totalPendingCash.toFixed(2)}</span>
          </div>

          <button
            type="button"
            onClick={fetchData}
            className="p-3 text-slate-600 hover:text-sky-900 bg-sky-50 hover:bg-sky-100 rounded-2xl transition-colors border border-sky-100 cursor-pointer shadow-xs"
            title="रिफ्रेश करा / Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Shop Navigation Tabs for Admin */}
      {user?.role === 'admin' && authShops.length > 0 && (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-black uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
              <Store className="w-4 h-4 text-sky-600" />
              <span>शाखा निवडा (Select Branch for Cash Reconciliation)</span>
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {authShops.map(shop => {
              const isSelected = selectedShopId === shop.id;
              const shortName = shop.name.replace('Friends Laundry & Dry Cleaners - ', '');

              return (
                <button
                  key={shop.id}
                  type="button"
                  onClick={() => {
                    setSelectedShopId(shop.id);
                    setActiveShopId(shop.id);
                  }}
                  className={`p-4 rounded-3xl border text-left transition-all relative overflow-hidden flex flex-col justify-between cursor-pointer ${
                    isSelected
                      ? 'bg-gradient-to-br from-sky-600 to-[#0369A1] text-white border-sky-600 shadow-md shadow-sky-600/25 ring-2 ring-sky-300'
                      : 'bg-white text-slate-900 border-sky-100 hover:border-sky-300 hover:bg-sky-50/60 shadow-xs'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
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

                    {isSelected && (
                      <span className="w-5 h-5 rounded-full bg-white/20 text-white flex items-center justify-center shrink-0">
                        <Check className="w-3.5 h-3.5" />
                      </span>
                    )}
                  </div>

                  <div className="pt-2 border-t border-current/15 flex items-baseline justify-between mt-auto">
                    <span className={`text-[11px] font-bold ${isSelected ? 'text-sky-100' : 'text-slate-500'}`}>
                      स्थिती:
                    </span>
                    <span className={`text-xs font-black ${isSelected ? 'text-white' : 'text-sky-700'}`}>
                      {isSelected ? 'सध्या निवडलेली' : 'निवडण्यासाठी क्लिक करा'}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Pending Handover Batches Section */}
      <div>
        <h2 className="text-xs font-black uppercase tracking-wider text-slate-700 mb-3 flex items-center gap-2">
          <Clock className="w-4 h-4 text-amber-600" />
          <span>डिलिव्हरी बॉईजकडून जमा होणे बाकी रोख रक्कम (Pending Handover)</span>
        </h2>

        {pendingList.length === 0 ? (
          <div className="bg-white rounded-3xl border border-sky-100 p-8 text-center shadow-xs">
            <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
            <h3 className="text-sm font-bold text-slate-900">या शाखेमध्ये सर्व रोख रक्कम जमा झालेली आहे</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
              सध्या कोणत्याही डिलिव्हरी बॉयकडे {currentShop?.name || 'या शाखेसाठी'} प्रलंबित रोख रक्कम शिल्लक नाही.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {pendingList.map((item) => (
              <div
                key={`${item.shop_id}-${item.collected_by_delivery_boy_id}`}
                className="bg-white rounded-3xl border border-sky-100 p-5 shadow-xs flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <h3 className="text-base font-black text-slate-900">{item.delivery_boy_name}</h3>
                      <p className="text-xs font-bold text-slate-500">{item.delivery_boy_phone}</p>
                    </div>
                    <span className="text-base font-black text-amber-700 bg-amber-50 px-2.5 py-1 rounded-2xl border border-amber-200">
                      ₹{item.total_collected_pending.toFixed(2)}
                    </span>
                  </div>

                  <div className="p-3 bg-sky-50/50 rounded-2xl border border-sky-100 text-xs space-y-1 mb-4">
                    <div className="flex justify-between text-slate-600">
                      <span>शाखा (Shop):</span>
                      <span className="font-bold text-slate-800">{item.shop_name}</span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>रोख ऑर्डर्स:</span>
                      <span className="font-bold text-slate-800">{item.transaction_count} ऑर्डर्स</span>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleOpenSettle(item)}
                  className="w-full py-2.5 px-4 text-xs font-black text-white bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 rounded-2xl shadow-sm transition-all flex items-center justify-center gap-1.5 cursor-pointer active:scale-98"
                >
                  <UserCheck className="w-4 h-4" />
                  <span>हिशोब जमा नोंदवा (Confirm Handover)</span>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* History of Past Settlements */}
      <div>
        <h2 className="text-xs font-black uppercase tracking-wider text-slate-700 mb-3 flex items-center gap-2">
          <FileCheck className="w-4 h-4 text-emerald-700" />
          <span>मागील जमा झालेल्या हिशोबांचा इतिहास (Settlement Audit History)</span>
        </h2>

        <div className="bg-white rounded-3xl border border-sky-100 shadow-xs overflow-hidden">
          {historyList.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              या शाखेमध्ये कोणताही मागील हिशोब उपलब्ध नाही.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-sky-50/70 border-b border-sky-100 text-[11px] font-black text-slate-600 uppercase tracking-wider">
                    <th className="py-3 px-4">पावती #</th>
                    <th className="py-3 px-4">शाखा (Shop)</th>
                    <th className="py-3 px-4">डिलिव्हरी बॉय</th>
                    <th className="py-3 px-4">जमा रक्कम</th>
                    <th className="py-3 px-4">शिल्लक बाकी</th>
                    <th className="py-3 px-4">जमा घेणारे</th>
                    <th className="py-3 px-4">तारीख व वेळ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {historyList.map((s) => (
                    <tr key={s.id} className="hover:bg-sky-50/40">
                      <td className="py-3 px-4 font-mono font-bold text-slate-900">{s.settlement_number}</td>
                      <td className="py-3 px-4 font-bold text-slate-800">{s.shop_name}</td>
                      <td className="py-3 px-4 text-slate-700 font-semibold">{s.delivery_boy_name}</td>
                      <td className="py-3 px-4 font-black text-emerald-800 font-mono">₹{s.amount_settled.toFixed(2)}</td>
                      <td className="py-3 px-4 font-mono text-slate-500">₹{s.remaining_unsettled.toFixed(2)}</td>
                      <td className="py-3 px-4 text-slate-600 font-medium">{s.confirmed_by_name}</td>
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
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-xl max-w-md w-full p-6 border border-sky-100 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-4 border-b border-sky-100">
              <div>
                <span className="text-xs font-black text-emerald-800 uppercase">कॅश जमा नोंदणी</span>
                <h3 className="text-base font-black text-slate-900">{selectedPending.delivery_boy_name}</h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPending(null)}
                className="text-slate-400 hover:text-slate-600 font-bold p-1 cursor-pointer"
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

            <div className="my-4 p-3.5 bg-sky-50 rounded-2xl border border-sky-100 text-xs flex justify-between items-center">
              <div>
                <span className="text-slate-500 block">एकूण गोळा केलेली रोख</span>
                <span className="text-slate-900 font-black text-base">₹{selectedPending.total_collected_pending.toFixed(2)}</span>
              </div>
              <div className="text-right">
                <span className="text-slate-500 block">शाखा</span>
                <span className="text-slate-900 font-bold">{selectedPending.shop_name}</span>
              </div>
            </div>

            <form onSubmit={handleConfirmSettlement} className="space-y-4">
              <div>
                <label className="block text-xs font-black text-slate-700 uppercase mb-1">
                  शाखेत जमा केलेली रक्कम (₹) *
                </label>
                <div className="relative">
                  <IndianRupee className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                  <input
                    type="number"
                    step="0.5"
                    required
                    value={settleAmount}
                    onChange={(e) => setSettleAmount(e.target.value)}
                    placeholder="जमा रक्कम टाका"
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-300 text-sm font-bold focus:ring-2 focus:ring-emerald-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-black text-slate-700 uppercase mb-1">
                  टीप / तपशील (Remarks)
                </label>
                <input
                  type="text"
                  value={settleNotes}
                  onChange={(e) => setSettleNotes(e.target.value)}
                  placeholder="उदा. कॅशियरने पावती तपासून जमा घेतली"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:ring-2 focus:ring-emerald-600"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedPending(null)}
                  className="px-4 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl cursor-pointer"
                >
                  रद्द करा
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2.5 text-xs font-black text-white bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 rounded-xl shadow-xs disabled:opacity-50 flex items-center gap-1.5 cursor-pointer active:scale-98"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{submitting ? 'जमा होत आहे...' : 'शाखा खात्यात जमा करा'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
