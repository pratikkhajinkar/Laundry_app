import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.tsx';
import type { Shop, ServiceArea } from '../../types/index.ts';
import { 
  Building2, 
  MapPin, 
  Phone, 
  Plus, 
  Edit2, 
  Check, 
  X, 
  RefreshCw, 
  Users, 
  Receipt,
  AlertCircle
} from 'lucide-react';

export const ShopsManager: React.FC = () => {
  const { token, user, t } = useAuth();
  const [shops, setShops] = useState<Shop[]>([]);
  const [areas, setAreas] = useState<ServiceArea[]>([]);
  const [loading, setLoading] = useState(true);

  // New Shop Modal
  const [showAddShop, setShowAddShop] = useState(false);
  const [shopName, setShopName] = useState('');
  const [shopCode, setShopCode] = useState('');
  const [shopAreaId, setShopAreaId] = useState('');
  const [shopAddress, setShopAddress] = useState('');
  const [shopPhone, setShopPhone] = useState('');
  const [shopGst, setShopGst] = useState('');
  const [shopUpi, setShopUpi] = useState('');
  // Staff credentials
  const [staffName, setStaffName] = useState('');
  const [staffEmailOrPhone, setStaffEmailOrPhone] = useState('');
  const [staffPassword, setStaffPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // New Area Modal
  const [showAddArea, setShowAddArea] = useState(false);
  const [areaName, setAreaName] = useState('');
  const [areaPincode, setAreaPincode] = useState('');

  const fetchData = async () => {
    try {
      setLoading(true);
      const [resShops, resAreas] = await Promise.all([
        fetch('/api/shops', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/areas', { headers: { Authorization: `Bearer ${token}` } })
      ]);

      if (resShops.ok) {
        const d = await resShops.json();
        setShops(d.shops);
      }
      if (resAreas.ok) {
        const d = await resAreas.json();
        setAreas(d.areas);
        if (d.areas.length > 0 && !shopAreaId) setShopAreaId(d.areas[0].id);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCreateShop = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!shopName.trim() || !shopAddress.trim() || !shopPhone.trim()) {
      setError('Shop name, address, and phone are required.');
      return;
    }

    try {
      setSubmitting(true);
      const res = await fetch('/api/shops', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          name: shopName.trim(),
          code: shopCode.trim() || undefined,
          service_area_id: shopAreaId || null,
          address: shopAddress.trim(),
          phone: shopPhone.trim(),
          gst_number: shopGst.trim() || null,
          upi_id: shopUpi.trim() || null,
          staffName: staffName.trim() || undefined,
          staffEmailOrPhone: staffEmailOrPhone.trim() || undefined,
          staffPassword: staffPassword || undefined
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Shop creation failed');

      setShowAddShop(false);
      setShopName('');
      setShopCode('');
      setShopAddress('');
      setShopPhone('');
      setShopGst('');
      setShopUpi('');
      setStaffName('');
      setStaffEmailOrPhone('');
      setStaffPassword('');
      await fetchData();
    } catch (err: any) {
      setError(err.message || 'Creation error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateArea = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!areaName.trim()) return;

    try {
      const res = await fetch('/api/areas', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          name: areaName.trim(),
          pincode: areaPincode.trim() || undefined
        })
      });

      if (res.ok) {
        setShowAddArea(false);
        setAreaName('');
        setAreaPincode('');
        await fetchData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">
              Laundry Shops & Service Areas
            </h1>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
              {shops.length} Shops Registered
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Manage multiple laundry shops and service zones across Pune (Warje, Kothrud, Karve Nagar, etc.).
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowAddArea(true)}
            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold rounded-xl border border-slate-200"
          >
            + Add Area
          </button>
          <button
            type="button"
            onClick={() => setShowAddShop(true)}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Add New Shop</span>
          </button>
        </div>
      </div>

      {/* Areas Badge Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
        <span className="text-xs font-bold uppercase tracking-wider text-slate-500 block mb-2">
          Configured Pune Service Areas
        </span>
        <div className="flex flex-wrap gap-2">
          {areas.map(a => (
            <span key={a.id} className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-slate-50 text-slate-800 text-xs font-semibold border border-slate-200">
              <MapPin className="w-3.5 h-3.5 text-emerald-700" />
              <span>{a.name}</span>
              {a.pincode && <span className="text-slate-400 font-normal">({a.pincode})</span>}
            </span>
          ))}
        </div>
      </div>

      {/* Shops Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {shops.map(shop => (
          <div key={shop.id} className="bg-white rounded-2xl border border-slate-200 p-6 shadow-2xs space-y-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <span className="font-mono text-xs font-bold text-emerald-800 uppercase tracking-wider">
                  {shop.code}
                </span>
                <h3 className="text-base font-bold text-slate-900 mt-0.5">{shop.name}</h3>
                <div className="flex items-center gap-1 text-xs text-slate-600 mt-0.5">
                  <Phone className="w-3 h-3 text-emerald-700" />
                  <span>{shop.phone}</span>
                </div>
              </div>

              <span className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200">
                {shop.area_name || 'Pune'}
              </span>
            </div>

            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100 text-xs space-y-1.5 text-slate-700">
              <div className="flex items-start gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                <span className="leading-relaxed">{shop.address}</span>
              </div>
              {shop.gst_number && (
                <div className="text-[11px] text-slate-500">GST: <strong>{shop.gst_number}</strong></div>
              )}
              {shop.upi_id && (
                <div className="text-[11px] text-slate-500">UPI: <strong>{shop.upi_id}</strong></div>
              )}
            </div>

            <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <span>{shop.total_orders || 0} Total Orders Processed</span>
              <span>{shop.staff_count || 1} Staff Account</span>
            </div>
          </div>
        ))}
      </div>

      {/* Add Shop Modal */}
      {showAddShop && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 border border-slate-200 my-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">Add New Laundry Shop</h3>
              <button
                type="button"
                onClick={() => setShowAddShop(false)}
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

            <form onSubmit={handleCreateShop} className="mt-4 space-y-3 text-xs">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Shop Name *
                </label>
                <input
                  type="text"
                  required
                  value={shopName}
                  onChange={(e) => setShopName(e.target.value)}
                  placeholder="e.g. Friends Laundry & Drycleaners"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-emerald-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Shop Code (Optional)
                  </label>
                  <input
                    type="text"
                    value={shopCode}
                    onChange={(e) => setShopCode(e.target.value)}
                    placeholder="e.g. FLD-WARJE"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-emerald-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Service Area
                  </label>
                  <select
                    value={shopAreaId}
                    onChange={(e) => setShopAreaId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-emerald-600"
                  >
                    {areas.map(a => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Full Shop Address *
                </label>
                <textarea
                  rows={2}
                  required
                  value={shopAddress}
                  onChange={(e) => setShopAddress(e.target.value)}
                  placeholder="Shop No. 7, Prestige Point Building, Atul Nagar Phase 1, Near RMD College, Warje, Pune, Maharashtra 411058"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-emerald-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Shop Phone *
                  </label>
                  <input
                    type="tel"
                    required
                    value={shopPhone}
                    onChange={(e) => setShopPhone(e.target.value)}
                    placeholder="e.g. 9822012345"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-emerald-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Shop UPI ID
                  </label>
                  <input
                    type="text"
                    value={shopUpi}
                    onChange={(e) => setShopUpi(e.target.value)}
                    placeholder="e.g. friendslaundry@upi"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-emerald-600"
                  />
                </div>
              </div>

              {/* Staff login setup */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 mt-2 space-y-2">
                <span className="font-bold text-slate-800 uppercase text-[11px] block">
                  Shop Staff Login Account (Optional)
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={staffEmailOrPhone}
                    onChange={(e) => setStaffEmailOrPhone(e.target.value)}
                    placeholder="Staff Phone / Email"
                    className="px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs"
                  />
                  <input
                    type="password"
                    value={staffPassword}
                    onChange={(e) => setStaffPassword(e.target.value)}
                    placeholder="Staff Password"
                    className="px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs"
                  />
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddShop(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2.5 text-xs font-bold text-white bg-emerald-800 hover:bg-emerald-900 rounded-lg shadow-xs disabled:opacity-50"
                >
                  {submitting ? 'Creating...' : 'Create Shop'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Area Modal */}
      {showAddArea && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-5 border border-slate-200">
            <h3 className="text-base font-bold text-slate-900 mb-3">Add Service Area</h3>
            <form onSubmit={handleCreateArea} className="space-y-3 text-xs">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Area Name *
                </label>
                <input
                  type="text"
                  required
                  value={areaName}
                  onChange={(e) => setAreaName(e.target.value)}
                  placeholder="e.g. Bavdhan / Baner"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-emerald-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Pincode (Optional)
                </label>
                <input
                  type="text"
                  value={areaPincode}
                  onChange={(e) => setAreaPincode(e.target.value)}
                  placeholder="e.g. 411021"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-emerald-600"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddArea(false)}
                  className="px-3 py-1.5 text-xs text-slate-600 bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs font-bold text-white bg-emerald-800 rounded-lg"
                >
                  Add Area
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
