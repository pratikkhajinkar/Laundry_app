import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext.tsx';
import type { Order } from '../../types/index.ts';
import { 
  X, 
  Printer, 
  Send, 
  ShieldCheck, 
  Calendar, 
  MapPin, 
  Phone, 
  User as UserIcon, 
  Camera, 
  CheckCircle2, 
  FileText,
  Clock,
  Sparkles
} from 'lucide-react';

interface PickupProofModalProps {
  order: Order;
  onClose: () => void;
}

export const PickupProofModal: React.FC<PickupProofModalProps> = ({ order, onClose }) => {
  const { token } = useAuth();
  const [sendingWa, setSendingWa] = useState(false);
  const [waHint, setWaHint] = useState<string | null>(null);

  const totalPieces = order.total_pieces || 
    ((order.iron_count || 0) + (order.dryclean_count || 0) + (order.wash_count || 0)) ||
    (order.items?.reduce((s, it) => s + (it.unit !== 'kg' ? it.quantity : 0), 0) || 0);

  const proofNotes = order.pickup_proof_notes || order.special_instructions || order.credit_notes || '';

  const photosList: string[] = [];
  if (Array.isArray(order.photos) && order.photos.length > 0) {
    order.photos.forEach(p => { if (p.file_url) photosList.push(p.file_url); });
  } else if (order.pickup_photos) {
    if (Array.isArray(order.pickup_photos)) {
      photosList.push(...order.pickup_photos);
    } else if (typeof order.pickup_photos === 'string') {
      try {
        const parsed = JSON.parse(order.pickup_photos);
        if (Array.isArray(parsed)) photosList.push(...parsed);
      } catch {
        photosList.push(order.pickup_photos);
      }
    }
  }

  const handleSendWhatsApp = async () => {
    try {
      setSendingWa(true);
      setWaHint(null);
      const res = await fetch(`/api/orders/${order.id}/pickup-proof-whatsapp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (res.ok && data.whatsappUrl) {
        window.open(data.whatsappUrl, '_blank');
        setWaHint('WhatsApp opened with pre-filled Pickup Proof message. Press Send to deliver!');
      } else {
        alert(data.error || 'Failed to prepare WhatsApp message');
      }
    } catch (e: any) {
      alert(e.message || 'Error sending WhatsApp proof');
    } finally {
      setSendingWa(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header Bar */}
        <div className="bg-gradient-to-r from-emerald-600 to-teal-700 text-white px-5 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center border border-white/20">
              <ShieldCheck className="w-6 h-6 text-emerald-200" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-lg font-bold">Pickup Proof & Acknowledgement</h3>
                <span className="text-xs bg-emerald-500/40 text-emerald-100 font-semibold px-2 py-0.5 rounded-full border border-emerald-400/30">
                  Proof Receipt
                </span>
              </div>
              <p className="text-xs text-emerald-100">
                Official Clothes Handover Proof • Order #{order.order_number}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/10 text-white/80 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Printable Content */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-5 text-gray-800 print:p-0">
          
          {/* Important Notice Banner */}
          <div className="bg-amber-50 border-l-4 border-amber-500 p-3.5 rounded-r-xl flex items-start space-x-3">
            <Sparkles className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-900 leading-relaxed">
              <span className="font-bold">Clothes Handover Proof: </span>
              This is an official acknowledgement of garments collected at customer doorstep. 
              The accurate final bill will be issued at the shop after professional cloth inspection and counting.
            </div>
          </div>

          {/* Shop & Order Overview Card */}
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 flex flex-col sm:flex-row justify-between gap-4">
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Service Shop</p>
              <h4 className="font-bold text-gray-900 text-base">{order.shop_name || 'Friends Laundry & Dry Cleaners'}</h4>
              <p className="text-xs text-gray-600 mt-0.5 flex items-center">
                <Phone className="w-3.5 h-3.5 mr-1 text-gray-400" />
                {order.shop_phone || '9822012345'}
              </p>
            </div>
            <div className="sm:text-right">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Order Reference</p>
              <p className="font-mono font-bold text-emerald-700 text-lg">#{order.order_number}</p>
              <p className="text-xs text-gray-500 flex items-center sm:justify-end mt-0.5">
                <Clock className="w-3.5 h-3.5 mr-1 text-gray-400" />
                {new Date(order.created_at || Date.now()).toLocaleString('en-IN', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </p>
            </div>
          </div>

          {/* Customer & Delivery Boy Info Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="bg-blue-50/60 border border-blue-100 rounded-xl p-3.5">
              <p className="font-bold text-blue-900 flex items-center mb-1.5">
                <UserIcon className="w-3.5 h-3.5 mr-1 text-blue-600" />
                Customer Details
              </p>
              <p className="font-bold text-gray-900 text-sm">{order.customer_name}</p>
              <p className="text-gray-700 flex items-center mt-1">
                <Phone className="w-3.5 h-3.5 mr-1 text-gray-500" />
                {order.customer_mobile}
              </p>
              <p className="text-gray-600 flex items-start mt-1">
                <MapPin className="w-3.5 h-3.5 mr-1 text-gray-500 shrink-0 mt-0.5" />
                <span>
                  {order.flat_number ? `${order.flat_number}, ` : ''}
                  {order.building_name ? `${order.building_name}, ` : ''}
                  {order.pickup_address} ({order.area})
                </span>
              </p>
            </div>

            <div className="bg-emerald-50/60 border border-emerald-100 rounded-xl p-3.5">
              <p className="font-bold text-emerald-900 flex items-center mb-1.5">
                <ShieldCheck className="w-3.5 h-3.5 mr-1 text-emerald-600" />
                Pickup Handover By
              </p>
              <p className="font-bold text-gray-900 text-sm">
                {order.delivery_boy_name || 'Assigned Delivery Boy'}
              </p>
              <p className="text-gray-700 flex items-center mt-1">
                <Phone className="w-3.5 h-3.5 mr-1 text-gray-500" />
                {order.delivery_boy_phone || 'Delivery Executive'}
              </p>
              <p className="text-emerald-700 font-semibold flex items-center mt-2">
                <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-emerald-600" />
                Status: {order.status.replace('_', ' ').toUpperCase()}
              </p>
            </div>
          </div>

          {/* Clothes Shortcut Count Summary Cards */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider flex items-center">
              <FileText className="w-4 h-4 mr-1 text-emerald-600" />
              Handover Clothes Count & Weight Proof
            </h4>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3 text-center">
                <p className="text-[11px] font-semibold text-indigo-700">Total Clothes</p>
                <p className="text-2xl font-black text-indigo-950 mt-0.5">
                  {totalPieces > 0 ? `${totalPieces} pcs` : 'Recorded'}
                </p>
              </div>

              <div className="bg-purple-50 border border-purple-200 rounded-xl p-3 text-center">
                <p className="text-[11px] font-semibold text-purple-700">Ironing</p>
                <p className="text-xl font-bold text-purple-950 mt-0.5">
                  {order.iron_count ? `${order.iron_count} pcs` : '—'}
                </p>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-center">
                <p className="text-[11px] font-semibold text-amber-700">Dry Clean</p>
                <p className="text-xl font-bold text-amber-950 mt-0.5">
                  {order.dryclean_count ? `${order.dryclean_count} pcs` : '—'}
                </p>
              </div>

              <div className="bg-teal-50 border border-teal-200 rounded-xl p-3 text-center">
                <p className="text-[11px] font-semibold text-teal-700">Weight (Kg)</p>
                <p className="text-base font-bold text-teal-950 mt-1">
                  {(order.pickup_weight_total_grams || 0) > 0 
                    ? `${order.pickup_weight_kg || 0} kg ${order.pickup_weight_grams || 0} g` 
                    : (order.wash_count ? `${order.wash_count} pcs` : '—')}
                </p>
              </div>
            </div>
          </div>

          {/* Dedicated Proof Notes Column / Box */}
          <div className="bg-gradient-to-r from-gray-50 to-amber-50/40 border border-amber-200 rounded-xl p-4">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-bold text-amber-900 uppercase tracking-wider flex items-center">
                <FileText className="w-3.5 h-3.5 mr-1 text-amber-600" />
                Proof Note & Clothes Description
              </span>
              <span className="text-[10px] font-semibold bg-amber-200/60 text-amber-900 px-2 py-0.5 rounded-full">
                Permanent Proof Record
              </span>
            </div>
            {proofNotes ? (
              <p className="text-sm font-medium text-gray-900 bg-white border border-amber-100 rounded-lg p-3 whitespace-pre-line leading-relaxed shadow-sm">
                {proofNotes}
              </p>
            ) : (
              <p className="text-xs text-gray-500 italic bg-white/70 border border-gray-200 rounded-lg p-3">
                No special garment notes specified during handover.
              </p>
            )}
          </div>

          {/* Pickup Photos (Proof) */}
          {photosList.length > 0 && (
            <div>
              <p className="text-xs font-bold text-gray-700 uppercase tracking-wider flex items-center mb-2">
                <Camera className="w-4 h-4 mr-1 text-emerald-600" />
                Handover Photos Proof ({photosList.length} photos)
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {photosList.map((url, idx) => (
                  <div key={idx} className="relative group rounded-xl overflow-hidden border border-gray-300 bg-gray-100 aspect-square">
                    <img
                      src={url}
                      alt={`Proof ${idx + 1}`}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute bottom-0 inset-x-0 bg-black/60 text-white text-[10px] font-medium py-0.5 px-1.5 text-center truncate">
                      Proof #{idx + 1}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* WhatsApp Success Hint */}
          {waHint && (
            <div className="bg-emerald-50 border border-emerald-300 text-emerald-800 text-xs p-3 rounded-xl flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{waHint}</span>
            </div>
          )}
        </div>

        {/* Modal Footer Actions */}
        <div className="bg-gray-50 border-t border-gray-200 px-5 py-3.5 flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={handlePrint}
            className="px-4 py-2 bg-white border border-gray-300 rounded-xl text-gray-700 text-xs font-bold hover:bg-gray-100 transition flex items-center shadow-sm"
          >
            <Printer className="w-4 h-4 mr-1.5 text-gray-500" />
            Print Proof Slip
          </button>

          <div className="flex items-center space-x-2.5">
            <button
              type="button"
              onClick={handleSendWhatsApp}
              disabled={sendingWa}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition flex items-center shadow-md disabled:opacity-50"
            >
              <Send className="w-4 h-4 mr-1.5" />
              {sendingWa ? 'Preparing...' : 'Send Proof on WhatsApp'}
            </button>

            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-xl text-xs font-bold transition"
            >
              Close
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
