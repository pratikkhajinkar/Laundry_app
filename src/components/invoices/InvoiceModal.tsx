import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.tsx';
import type { Invoice, OrderItem, PaymentTransaction } from '../../types/index.ts';
import { 
  Printer, 
  Send, 
  X, 
  Download, 
  CheckCircle2, 
  AlertTriangle, 
  Calendar, 
  MapPin, 
  Phone, 
  Building2, 
  Scale, 
  Receipt,
  Share2,
  Clock,
  Sparkles
} from 'lucide-react';

interface InvoiceModalProps {
  invoiceIdOrOrderId?: string;
  orderIdOrInvoiceId?: string;
  onClose: () => void;
}

export const InvoiceModal: React.FC<InvoiceModalProps> = ({ invoiceIdOrOrderId, orderIdOrInvoiceId, onClose }) => {
  const targetId = invoiceIdOrOrderId || orderIdOrInvoiceId || '';
  const { token } = useAuth();
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [payments, setPayments] = useState<PaymentTransaction[]>([]);
  const [photos, setPhotos] = useState<any[]>([]);
  const [previewPhotoUrl, setPreviewPhotoUrl] = useState<string | null>(null);
  const [sharingWa, setSharingWa] = useState<boolean>(false);
  const [waMessage, setWaMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    async function fetchInvoice() {
      try {
        setLoading(true);
        const res = await fetch(`/api/invoices/${targetId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to load invoice');

        if (isMounted) {
          setInvoice(data.invoice);
          setItems(data.items || []);
          setPayments(data.payments || []);
          setPhotos(data.photos || []);
        }
      } catch (err: any) {
        if (isMounted) setError(err.message || 'Error loading bill');
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    if (targetId) {
      fetchInvoice();
    }
    return () => { isMounted = false; };
  }, [targetId, token]);

  const handlePrint = () => {
    window.print();
  };

  const handleShareWhatsApp = async () => {
    if (!invoice) return;
    try {
      setSharingWa(true);
      const res = await fetch(`/api/invoices/${invoice.id}/whatsapp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to prepare WhatsApp bill');

      if (data.whatsappUrl) {
        window.open(data.whatsappUrl, '_blank');
        setWaMessage('✅ WhatsApp message opened!');
        setTimeout(() => setWaMessage(null), 4000);
      }
    } catch (err: any) {
      alert(err.message || 'WhatsApp sharing failed');
    } finally {
      setSharingWa(false);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl p-8 max-w-sm w-full text-center space-y-3">
          <div className="w-10 h-10 border-3 border-sky-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm font-bold text-slate-700">Loading invoice...</p>
        </div>
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl p-6 max-w-sm w-full text-center space-y-4">
          <AlertTriangle className="w-10 h-10 text-rose-500 mx-auto" />
          <h4 className="text-base font-bold text-slate-900">Invoice Not Found</h4>
          <p className="text-xs text-slate-600">{error || 'Invoice not found'}</p>
          <button
            onClick={onClose}
            className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  const previousDue = Number(invoice.previous_due) || 0;
  const currentBillTotal = Number(invoice.final_total) || 0;
  const currentBillRemaining = Number(invoice.outstanding_balance) || 0;
  const currentBillPaid = Number(invoice.amount_paid) || 0;
  const totalCombinedDue = invoice.total_with_previous_due !== undefined 
    ? Number(invoice.total_with_previous_due) 
    : Math.round((currentBillRemaining + previousDue) * 100) / 100;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full border border-sky-100 overflow-hidden my-auto max-h-[95vh] flex flex-col">
        
        {/* Modal Top Bar - Hidden in Print */}
        <div className="no-print bg-slate-900 text-white px-5 py-3.5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Receipt className="w-4 h-4 text-sky-400" />
            <span className="text-xs font-bold tracking-wider uppercase text-sky-300">
              Tax Invoice & Receipt • {invoice.invoice_number}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleShareWhatsApp}
              disabled={sharingWa}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors"
            >
              <Send className="w-3.5 h-3.5" />
              <span>WhatsApp</span>
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="px-3 py-1.5 bg-sky-500 hover:bg-sky-400 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors shadow-xs"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print Invoice</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {waMessage && (
          <div className="no-print bg-emerald-50 border-b border-emerald-200 text-emerald-800 text-xs px-5 py-2 font-bold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>{waMessage}</span>
          </div>
        )}

        {/* Printable Invoice Container */}
        <div id="printable-invoice" className="printable-invoice p-6 sm:p-8 overflow-y-auto space-y-6 flex-1 bg-white text-slate-900">
          
          {/* Header & Shop Branding */}
          <div className="flex items-start justify-between pb-6 border-b-2 border-sky-100">
            <div>
              <span className="text-[10px] font-black tracking-widest text-sky-600 uppercase block mb-1">
                Launderers & Dry Cleaners
              </span>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                {invoice.shop_name || 'Friends Laundry & Dry Cleaners'}
              </h1>
              <p className="text-xs text-slate-600 mt-1 max-w-sm">
                {invoice.shop_address || 'Shop No. 4, Warje Bridge Corner, Pune, Maharashtra 411058'}
              </p>
              <div className="flex items-center gap-4 text-xs text-slate-600 mt-2 font-medium">
                <span className="flex items-center gap-1">
                  <Phone className="w-3 h-3 text-sky-600" />
                  {invoice.shop_phone || '8484890123'}
                </span>
                {invoice.shop_gst && (
                  <span>GSTIN: <strong>{invoice.shop_gst}</strong></span>
                )}
                {invoice.shop_upi && (
                  <span>UPI: <strong>{invoice.shop_upi}</strong></span>
                )}
              </div>
            </div>

            <div className="text-right">
              <span className="inline-block bg-sky-100 text-sky-800 font-black text-[11px] px-3 py-1 rounded-full uppercase tracking-wider mb-2">
                TAX INVOICE
              </span>
              <p className="text-xs font-mono font-bold text-slate-900">
                Invoice #: {invoice.invoice_number}
              </p>
              <p className="text-xs text-slate-600 mt-0.5">
                Order #: {invoice.order_number}
              </p>
              <p className="text-xs text-slate-600 mt-0.5">
                Date: {invoice.date || new Date().toISOString().split('T')[0]}
              </p>
              <div className="mt-2">
                <span className={`inline-block text-[10px] font-black uppercase px-2.5 py-0.5 rounded-md border ${
                  invoice.payment_status === 'paid' 
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-300' 
                    : (invoice.payment_status === 'partially_paid' 
                        ? 'bg-amber-50 text-amber-800 border-amber-300' 
                        : 'bg-rose-50 text-rose-800 border-rose-300')
                }`}>
                  {invoice.payment_status === 'paid' ? 'Paid' : (invoice.payment_status === 'partially_paid' ? 'Partially Paid' : 'Unpaid')}
                </span>
              </div>
            </div>
          </div>

          {/* Customer & Delivery Information */}
          <div className="grid grid-cols-2 gap-4 bg-sky-50/50 p-4 rounded-2xl border border-sky-100 text-xs">
            <div>
              <span className="text-[10px] font-black text-sky-700 uppercase tracking-wider block mb-1">
                Billed To (Customer)
              </span>
              <h3 className="font-extrabold text-sm text-slate-900">{invoice.customer_name}</h3>
              <p className="text-slate-600 flex items-center gap-1 mt-0.5 font-medium">
                <Phone className="w-3 h-3 text-sky-600" />
                {invoice.customer_mobile}
              </p>
              {invoice.customer_email && (
                <p className="text-slate-600 text-[11px] mt-0.5">{invoice.customer_email}</p>
              )}
            </div>
            <div>
              <span className="text-[10px] font-black text-sky-700 uppercase tracking-wider block mb-1">
                Delivery Address
              </span>
              <p className="text-slate-700 font-medium leading-relaxed">
                {invoice.delivery_address || invoice.pickup_address || 'Counter Pickup'}
              </p>
              {invoice.customer_area && (
                <p className="text-slate-500 text-[11px] mt-0.5">Area: {invoice.customer_area}</p>
              )}
              {invoice.expected_payment_date && (
                <div className="mt-2 bg-amber-100/70 border border-amber-200 text-amber-900 text-[11px] font-bold p-1.5 rounded-lg inline-block">
                  Due Date: {invoice.expected_payment_date}
                </div>
              )}
            </div>
          </div>

          {/* Items Table with Weight & Piece Differentiation */}
          <div>
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b-2 border-slate-900 text-[11px] font-black text-slate-800 uppercase tracking-wider">
                  <th className="py-2.5 px-2">#</th>
                  <th className="py-2.5 px-2">Item Description</th>
                  <th className="py-2.5 px-2 text-center">Qty / Weight</th>
                  <th className="py-2.5 px-2 text-right">Rate</th>
                  <th className="py-2.5 px-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.length > 0 ? (
                  items.map((item, idx) => {
                    const isWeight = item.unit === 'kg' || (item.weight_display && item.weight_display.length > 0);
                    const isSqFt = item.unit === 'sq_ft' || (Number(item.sq_ft) > 0);
                    return (
                      <tr key={item.id || idx} className="hover:bg-sky-50/30">
                        <td className="py-2.5 px-2 font-mono text-slate-400">{idx + 1}</td>
                        <td className="py-2.5 px-2">
                          <span className="font-extrabold text-slate-900 block">{item.item_name}</span>
                          {isSqFt && item.sq_ft_length && item.sq_ft_width && (
                            <span className="text-[10px] text-purple-700 font-bold block">
                              Size: {item.sq_ft_length} ft × {item.sq_ft_width} ft ({item.sq_ft} sq.ft)
                            </span>
                          )}
                          {item.notes && <span className="text-[10px] text-slate-500">{item.notes}</span>}
                        </td>
                        <td className="py-2.5 px-2 text-center font-bold">
                          {isWeight ? (
                            <span className="bg-amber-50 text-amber-900 border border-amber-200 px-2 py-0.5 rounded-md font-mono text-[11px]">
                              {item.weight_display || `${item.weight_kg} kg`}
                            </span>
                          ) : isSqFt ? (
                            <span className="bg-purple-50 text-purple-900 border border-purple-200 px-2 py-0.5 rounded-md font-mono text-[11px]">
                              {item.sq_ft} sq.ft
                            </span>
                          ) : (
                            <span>{item.quantity} pcs</span>
                          )}
                        </td>
                        <td className="py-2.5 px-2 text-right font-mono text-slate-700">
                          ₹{Number(item.rate).toFixed(2)}{isWeight ? '/kg' : isSqFt ? '/sq.ft' : ''}
                        </td>
                        <td className="py-2.5 px-2 text-right font-mono font-black text-slate-900">
                          ₹{Number(item.line_total).toFixed(2)}
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={5} className="py-4 text-center text-slate-400 italic">
                      No clothing items recorded
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Ledger Calculation Breakdown: Old Due + New Bill */}
          <div className="pt-4 border-t-2 border-slate-200 flex flex-col sm:flex-row justify-between items-start gap-6">
            <div className="w-full sm:max-w-xs space-y-2 text-xs">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider block">
                Payment Details & Method
              </span>
              {payments.length > 0 ? (
                <div className="space-y-1.5">
                  {payments.map((p) => (
                    <div key={p.id} className="bg-slate-50 p-2 rounded-xl border border-slate-200 flex items-center justify-between text-[11px]">
                      <div>
                        <span className="font-bold text-slate-900 uppercase block">{p.payment_method}</span>
                        <span className="text-[10px] text-slate-500">{p.created_at?.split('T')[0]}</span>
                      </div>
                      <span className="font-mono font-black text-emerald-700">₹{Number(p.amount).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-slate-400 italic text-[11px]">No payments recorded yet.</p>
              )}
              {invoice.credit_notes && (
                <div className="mt-2 bg-amber-50 p-2.5 rounded-xl border border-amber-200 text-amber-900 text-[11px]">
                  <strong>Credit Note:</strong> {invoice.credit_notes}
                </div>
              )}
            </div>

            {/* Strict Financial Calculations Table */}
            <div className="w-full sm:w-72 bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-2 text-xs">
              <div className="flex justify-between text-slate-600">
                <span>Items Subtotal:</span>
                <span className="font-mono font-bold">₹{Number(invoice.subtotal).toFixed(2)}</span>
              </div>
              {Number(invoice.delivery_charge) > 0 && (
                <div className="flex justify-between text-slate-600">
                  <span>Delivery Fee:</span>
                  <span className="font-mono font-bold">₹{Number(invoice.delivery_charge).toFixed(2)}</span>
                </div>
              )}
              {Number(invoice.discount_amount) > 0 && (
                <div className="flex justify-between text-emerald-600">
                  <span>Discount:</span>
                  <span className="font-mono font-bold">-₹{Number(invoice.discount_amount).toFixed(2)}</span>
                </div>
              )}

              {/* Current Bill Total */}
              <div className="flex justify-between text-slate-900 font-extrabold pt-2 border-t border-slate-200">
                <span>Current Bill:</span>
                <span className="font-mono text-sm">₹{currentBillTotal.toFixed(2)}</span>
              </div>

              {/* Previous Due Balance */}
              {previousDue > 0 && (
                <div className="flex justify-between text-rose-600 font-extrabold">
                  <span>Previous Due:</span>
                  <span className="font-mono text-sm">₹{previousDue.toFixed(2)}</span>
                </div>
              )}

              {/* Total Payable (Old + New) */}
              <div className="flex justify-between text-slate-900 font-black text-sm pt-2 border-t-2 border-slate-900">
                <span>Total Payable:</span>
                <span className="font-mono text-base">₹{(currentBillTotal + previousDue).toFixed(2)}</span>
              </div>

              {/* Amount Paid Now */}
              <div className="flex justify-between text-emerald-700 font-bold">
                <span>Amount Paid:</span>
                <span className="font-mono">₹{currentBillPaid.toFixed(2)}</span>
              </div>

              {/* Remaining Outstanding */}
              <div className="flex justify-between text-amber-900 bg-amber-100 p-2 rounded-xl font-black text-sm mt-1">
                <span>Remaining Due:</span>
                <span className="font-mono text-base">₹{totalCombinedDue.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Pickup Photos Section (Compact thumbnails with preview) */}
          {photos.length > 0 && (
            <div className="pt-4 border-t border-slate-200 space-y-2">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider block">
                Pickup Photos ({photos.length})
              </span>
              <div className="flex items-center gap-3 overflow-x-auto pb-1">
                {photos.map((p, idx) => (
                  <div
                    key={p.id || idx}
                    onClick={() => setPreviewPhotoUrl(p.file_url)}
                    className="cursor-pointer group relative rounded-xl border border-slate-200 overflow-hidden shrink-0 w-20 h-20 bg-slate-100 hover:ring-2 hover:ring-sky-500 transition-all"
                  >
                    <img
                      src={p.file_url}
                      alt={p.photo_type || 'Pickup photo'}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                    />
                    <div className="absolute inset-x-0 bottom-0 bg-slate-900/70 text-[9px] font-bold text-white text-center py-0.5 capitalize truncate">
                      {p.photo_type || 'Photo'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Footer & Terms */}
          <div className="pt-6 border-t border-slate-200 text-center text-[10px] text-slate-500 space-y-1">
            <p className="font-bold text-slate-700">Thank you for trusting Friends Laundry & Dry Cleaners!</p>
            <p>Please verify your invoice and garments upon delivery. Report any discrepancies within 48 hours.</p>
            <p className="text-[9px] text-slate-400 font-mono">This is a computer-generated tax invoice. No signature required.</p>
          </div>

        </div>

      </div>

      {/* Full-size Photo Preview Modal */}
      {previewPhotoUrl && (
        <div 
          className="fixed inset-0 z-60 bg-black/90 flex items-center justify-center p-4 cursor-pointer"
          onClick={() => setPreviewPhotoUrl(null)}
        >
          <div className="relative max-w-xl max-h-[85vh] rounded-2xl overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
            <img src={previewPhotoUrl} alt="Garment preview" className="w-full h-full object-contain" />
            <button
              onClick={() => setPreviewPhotoUrl(null)}
              className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/70 text-white flex items-center justify-center hover:bg-black transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
