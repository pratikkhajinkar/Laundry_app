import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.tsx';
import type { User, ServiceArea } from '../../types/index.ts';
import { syncDeliveryBoyToFirestore } from '../../services/firestoreSync.ts';
import { 
  Truck, 
  UserPlus, 
  Radio, 
  MapPin, 
  Clock, 
  Phone, 
  CheckCircle, 
  XCircle, 
  AlertCircle,
  Briefcase,
  RefreshCw,
  Search,
  Edit2,
  Trash2,
  ShieldCheck,
  X
} from 'lucide-react';

export const LiveDeliveryBoys: React.FC = () => {
  const { token, t } = useAuth();
  const [deliveryBoys, setDeliveryBoys] = useState<User[]>([]);
  const [areas, setAreas] = useState<ServiceArea[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [search, setSearch] = useState('');
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [syncingWithCloud, setSyncingWithCloud] = useState(false);

  // Delete Confirmation Modal State
  const [boyToDelete, setBoyToDelete] = useState<User | null>(null);
  const [deletingBoy, setDeletingBoy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Add Form state
  const [name, setName] = useState('');
  const [phoneOrEmail, setPhoneOrEmail] = useState('');
  const [password, setPassword] = useState('');
  const [serviceAreaId, setServiceAreaId] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Edit Form state
  const [editingBoy, setEditingBoy] = useState<User | null>(null);
  const [editName, setEditName] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [editServiceAreaId, setEditServiceAreaId] = useState('');
  const [editStatus, setEditStatus] = useState<'active' | 'inactive'>('active');
  const [editError, setEditError] = useState<string | null>(null);
  const [editSubmitting, setEditSubmitting] = useState(false);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [resBoys, resAreas] = await Promise.all([
        fetch('/api/delivery-boys', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/areas', { headers: { Authorization: `Bearer ${token}` } })
      ]);

      if (resBoys.ok) {
        const data = await resBoys.json();
        setDeliveryBoys(data.deliveryBoys);
      }
      if (resAreas.ok) {
        const data = await resAreas.json();
        setAreas(data.areas);
      }
    } catch (err) {
      console.error('Error fetching live delivery boys:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // Poll every 15s to update real-time online presence and job assignments
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, []);

  const handleAddDeliveryBoy = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!name.trim() || !phoneOrEmail.trim() || !password) {
      setFormError('Please enter Name, Mobile, and Password.');
      return;
    }

    try {
      setSubmitting(true);
      const res = await fetch('/api/delivery-boys', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          name: name.trim(),
          phoneOrEmail: phoneOrEmail.trim(),
          password,
          service_area_id: serviceAreaId || null
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create account');

      // Dual-persistence sync to Firebase Firestore
      const targetArea = areas.find(a => a.id === serviceAreaId);
      await syncDeliveryBoyToFirestore({
        id: data.id,
        name: name.trim(),
        email_or_phone: phoneOrEmail.trim(),
        role: 'delivery',
        service_area_id: serviceAreaId || null,
        area_name: targetArea?.name || null,
        status: 'active',
        is_online: 0,
        is_busy: 0
      });

      const createdName = name.trim();
      setName('');
      setPhoneOrEmail('');
      setPassword('');
      setServiceAreaId('');
      setSearch('');
      setShowAddModal(false);
      setSuccessMsg(`✅ Delivery boy "${createdName}" created and saved successfully!`);
      setTimeout(() => setSuccessMsg(null), 6000);
      await fetchData();
    } catch (err: any) {
      setFormError(err.message || 'Creation failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenEdit = (boy: User) => {
    setEditingBoy(boy);
    setEditName(boy.name);
    setEditServiceAreaId(boy.service_area_id || '');
    setEditStatus(boy.status);
    setEditPassword('');
    setEditError(null);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBoy) return;
    setEditError(null);

    try {
      setEditSubmitting(true);
      const payload: any = {
        name: editName.trim(),
        service_area_id: editServiceAreaId || null,
        status: editStatus
      };
      if (editPassword.trim()) {
        payload.password = editPassword.trim();
      }

      const res = await fetch(`/api/delivery-boys/${editingBoy.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update account');

      // Sync updated boy to Firestore
      const targetArea = areas.find(a => a.id === editServiceAreaId);
      await syncDeliveryBoyToFirestore({
        id: editingBoy.id,
        name: editName.trim(),
        email_or_phone: editingBoy.email_or_phone,
        role: 'delivery',
        service_area_id: editServiceAreaId || null,
        area_name: targetArea?.name || null,
        status: editStatus
      });

      setEditingBoy(null);
      await fetchData();
    } catch (err: any) {
      setEditError(err.message || 'Update failed');
    } finally {
      setEditSubmitting(false);
    }
  };

  const handleDeleteDeliveryBoy = (boy: User) => {
    setBoyToDelete(boy);
    setDeleteError(null);
  };

  const executeDeleteBoy = async () => {
    if (!boyToDelete) return;
    try {
      setDeletingBoy(true);
      setDeleteError(null);
      const res = await fetch(`/api/delivery-boys/${boyToDelete.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) {
        setDeleteError(data.error || 'Failed to remove delivery personnel');
        return;
      }
      setSuccessMsg(data.message || `Delivery personnel "${boyToDelete.name}" removed successfully.`);
      setTimeout(() => setSuccessMsg(null), 6000);
      setBoyToDelete(null);
      await fetchData();
    } catch (e: any) {
      setDeleteError(e.message || 'Failed to delete delivery personnel');
    } finally {
      setDeletingBoy(false);
    }
  };

  const handleSyncFleetWithCloud = async () => {
    try {
      setSyncingWithCloud(true);
      setErrorMsg(null);
      const res = await fetch('/api/sync/cloud-sync', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        setSuccessMsg(`☁️ Cloud sync complete: ${data.rehydrated?.restoredDeliveryBoys || 0} delivery boys verified & synced with Firestore.`);
        setTimeout(() => setSuccessMsg(null), 6000);
        await fetchData();
      } else {
        setErrorMsg(data.error || 'Cloud sync failed');
      }
    } catch (e: any) {
      setErrorMsg(e.message || 'Sync error');
    } finally {
      setSyncingWithCloud(false);
    }
  };

  const handleToggleStatus = async (boy: User) => {
    const newStatus = boy.status === 'active' ? 'inactive' : 'active';
    try {
      const res = await fetch(`/api/delivery-boys/${boy.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          name: boy.name,
          service_area_id: boy.service_area_id,
          status: newStatus
        })
      });
      if (res.ok) {
        fetchData();
      }
    } catch (err) {
      console.error('Error toggling boy status:', err);
    }
  };

  const filtered = deliveryBoys.filter(b => 
    b.name.toLowerCase().includes(search.toLowerCase()) ||
    b.email_or_phone.includes(search) ||
    (b.area_name && b.area_name.toLowerCase().includes(search.toLowerCase()))
  );

  const onlineCount = deliveryBoys.filter(b => b.is_online === 1).length;
  const availableCount = deliveryBoys.filter(b => b.is_online === 1 && b.is_busy === 0).length;

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-3xl border border-sky-100 shadow-sm shadow-sky-500/5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-black text-slate-900 tracking-tight">
              {t('liveDeliveryBoys')} • Delivery Staff Management
            </h1>
            <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-sky-100 text-sky-900 border border-sky-200">
              <span className="w-2 h-2 rounded-full bg-sky-500 animate-pulse"></span>
              {onlineCount} {t('online')} ({availableCount} {t('available')})
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Real-time fleet presence, heartbeat monitoring, service areas, and full A to Z account management.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={fetchData}
            disabled={loading}
            className="p-2.5 text-slate-600 hover:text-sky-900 bg-sky-50 hover:bg-sky-100 rounded-2xl transition-colors border border-sky-100"
            title="Refresh Fleet"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            type="button"
            onClick={handleSyncFleetWithCloud}
            disabled={syncingWithCloud}
            className="flex items-center gap-1.5 px-3.5 py-2.5 bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-200 rounded-2xl text-xs font-bold transition-all disabled:opacity-50"
            title="Bidirectionally verify & sync all delivery boys with Cloud Firestore"
          >
            <ShieldCheck className={`w-4 h-4 text-sky-600 ${syncingWithCloud ? 'animate-spin' : ''}`} />
            <span>{syncingWithCloud ? 'Syncing...' : 'Cloud Verified'}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-sky-500 to-sky-600 hover:from-sky-600 hover:to-sky-700 text-white rounded-2xl text-xs font-black shadow-sm shadow-sky-500/25 transition-all"
          >
            <UserPlus className="w-4 h-4" />
            <span>Add Delivery Boy</span>
          </button>
        </div>
      </div>

      {/* Success Notification Banner */}
      {successMsg && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-black flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2">
            <span className="text-base">🎉</span>
            <span>{successMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessMsg(null)}
            className="text-emerald-700 hover:text-emerald-950 font-black px-2 py-1"
          >
            ✕
          </button>
        </div>
      )}

      {/* Error Notification Banner */}
      {errorMsg && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 text-xs font-black flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMsg(null)}
            className="text-rose-700 hover:text-rose-950 font-black px-2 py-1"
          >
            ✕
          </button>
        </div>
      )}

      {/* Search Bar */}
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
          <Search className="w-4 h-4 text-slate-400" />
        </div>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, mobile number, or area (Warje, Kothrud, Karve Nagar, Bavdhan)..."
          className="w-full pl-10 pr-4 py-3 bg-white rounded-2xl border border-sky-100 text-xs font-medium text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-sky-400 shadow-xs"
        />
      </div>

      {/* Delivery Boys Grid */}
      {loading && deliveryBoys.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-3xl border border-sky-100 shadow-sm">
          <div className="w-8 h-8 border-4 border-sky-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-xs font-bold text-slate-500">Loading delivery personnel...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-3xl border border-sky-100 shadow-sm">
          <Truck className="w-12 h-12 text-sky-200 mx-auto mb-3" />
          <h3 className="text-base font-extrabold text-slate-800">No Delivery Boys Found</h3>
          <p className="text-xs text-slate-500 mt-1">
            {search ? 'Try clearing your search query.' : 'Add your first delivery boy to start scheduling pickups and deliveries.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(boy => {
            const isOnline = boy.is_online === 1;
            const isBusy = boy.is_busy === 1;
            const activeJobs = boy.active_jobs_count || 0;

            return (
              <div
                key={boy.id}
                className="bg-white rounded-3xl border border-sky-100 p-5 shadow-sm shadow-sky-500/5 hover:border-sky-300 transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-11 h-11 rounded-2xl flex items-center justify-center font-black text-sm ${
                        isOnline ? 'bg-sky-100 text-sky-800' : 'bg-slate-100 text-slate-500'
                      }`}>
                        {boy.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <h3 className="text-sm font-black text-slate-900">{boy.name}</h3>
                        <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-0.5">
                          <Phone className="w-3 h-3 text-sky-600" />
                          <span>{boy.email_or_phone}</span>
                        </div>
                      </div>
                    </div>

                    {/* Status Pill */}
                    <div className="flex flex-col items-end gap-1">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                        isOnline 
                          ? (isBusy ? 'bg-amber-100 text-amber-800 border border-amber-200' : 'bg-emerald-100 text-emerald-800 border border-emerald-200')
                          : 'bg-slate-100 text-slate-600 border border-slate-200'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? (isBusy ? 'bg-amber-500' : 'bg-emerald-500') : 'bg-slate-400'}`}></span>
                        {isOnline ? (isBusy ? 'Busy' : 'Available') : 'Offline'}
                      </span>

                      {boy.status === 'inactive' && (
                        <span className="text-[10px] font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-md">
                          Inactive
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Area Badge & Workload Box */}
                  <div className="flex items-center gap-2 mb-3">
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-bold bg-sky-50 text-sky-800 border border-sky-100">
                      <MapPin className="w-3 h-3 text-sky-600" />
                      {boy.area_name || 'All Pune Areas'}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 p-3 bg-sky-50/50 rounded-2xl border border-sky-100 text-xs mb-3">
                    <div>
                      <span className="text-slate-500 block text-[10px] font-bold uppercase">Active Jobs</span>
                      <span className="text-slate-900 font-black text-sm flex items-center gap-1 mt-0.5">
                        <Briefcase className="w-3.5 h-3.5 text-sky-600" />
                        {activeJobs} Assigned
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px] font-bold uppercase">Last Heartbeat</span>
                      <span className="text-slate-700 font-bold text-[11px] flex items-center gap-1 mt-0.5">
                        <Clock className="w-3 h-3 text-slate-400" />
                        {boy.last_heartbeat ? new Date(boy.last_heartbeat).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : 'Never'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Card Action Buttons (Call, Edit, Status Toggle, Delete) */}
                <div className="pt-3 border-t border-sky-100 flex items-center justify-between gap-1 text-xs">
                  <a
                    href={`tel:${boy.email_or_phone}`}
                    className="p-2 text-sky-700 hover:text-sky-900 bg-sky-50 hover:bg-sky-100 rounded-xl font-bold flex items-center gap-1 transition-colors"
                    title="Call"
                  >
                    <Phone className="w-3.5 h-3.5 text-sky-600" />
                    <span className="hidden sm:inline">Call</span>
                  </a>

                  <button
                    type="button"
                    onClick={() => handleOpenEdit(boy)}
                    className="p-2 text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl font-bold flex items-center gap-1 transition-colors"
                    title="Edit Delivery Boy Account"
                  >
                    <Edit2 className="w-3.5 h-3.5 text-slate-600" />
                    <span>Edit</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleToggleStatus(boy)}
                    className={`p-2 rounded-xl text-xs font-bold transition-colors ${
                      boy.status === 'active'
                        ? 'text-amber-700 bg-amber-50 hover:bg-amber-100'
                        : 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100'
                    }`}
                    title={boy.status === 'active' ? 'Deactivate Account' : 'Activate Account'}
                  >
                    {boy.status === 'active' ? 'Deactivate' : 'Activate'}
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDeleteDeliveryBoy(boy)}
                    className="p-2 text-rose-600 hover:text-rose-800 bg-rose-50 hover:bg-rose-100 rounded-xl font-bold transition-colors"
                    title="Delete Account"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Delivery Boy Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-6 border border-sky-100">
            <div className="flex items-center justify-between pb-4 border-b border-sky-100">
              <div className="flex items-center gap-2">
                <Truck className="w-5 h-5 text-sky-600" />
                <h3 className="text-base font-black text-slate-900">Add New Delivery Boy</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold"
              >
                ✕
              </button>
            </div>

            {formError && (
              <div className="mt-4 p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleAddDeliveryBoy} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-extrabold text-slate-700 uppercase mb-1">
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Rahul Shinde"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs font-bold text-slate-900 focus:ring-2 focus:ring-sky-400"
                />
              </div>

              <div>
                <label className="block text-xs font-extrabold text-slate-700 uppercase mb-1">
                  Mobile Number (Login ID) *
                </label>
                <input
                  type="text"
                  required
                  value={phoneOrEmail}
                  onChange={(e) => setPhoneOrEmail(e.target.value)}
                  placeholder="e.g. 9823456789"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs font-bold text-slate-900 focus:ring-2 focus:ring-sky-400"
                />
              </div>

              <div>
                <label className="block text-xs font-extrabold text-slate-700 uppercase mb-1">
                  Login Password *
                </label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimum 6 characters"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs font-bold text-slate-900 focus:ring-2 focus:ring-sky-400"
                />
              </div>

              <div>
                <label className="block text-xs font-extrabold text-slate-700 uppercase mb-1">
                  Assigned Service Area
                </label>
                <select
                  value={serviceAreaId}
                  onChange={(e) => setServiceAreaId(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs font-bold text-slate-900 focus:ring-2 focus:ring-sky-400"
                >
                  <option value="">All Areas / Floating (Warje, Kothrud, Karve Nagar, Bavdhan)</option>
                  {areas.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.pincode || a.city})
                    </option>
                  ))}
                </select>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2.5 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2.5 text-xs font-black text-white bg-sky-500 hover:bg-sky-600 rounded-xl shadow-sm shadow-sky-500/20 disabled:opacity-50"
                >
                  {submitting ? 'Creating...' : 'Create Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Delivery Boy Modal */}
      {editingBoy && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-6 border border-sky-100">
            <div className="flex items-center justify-between pb-4 border-b border-sky-100">
              <div className="flex items-center gap-2">
                <Edit2 className="w-5 h-5 text-sky-600" />
                <h3 className="text-base font-black text-slate-900">Edit Delivery Boy</h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingBoy(null)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold"
              >
                ✕
              </button>
            </div>

            {editError && (
              <div className="mt-4 p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{editError}</span>
              </div>
            )}

            <form onSubmit={handleSaveEdit} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-extrabold text-slate-700 uppercase mb-1">
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs font-bold text-slate-900 focus:ring-2 focus:ring-sky-400"
                />
              </div>

              <div>
                <label className="block text-xs font-extrabold text-slate-700 uppercase mb-1">
                  Mobile Number (Read-only Login ID)
                </label>
                <input
                  type="text"
                  disabled
                  value={editingBoy.email_or_phone}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-100 border border-slate-200 text-xs font-bold text-slate-600"
                />
              </div>

              <div>
                <label className="block text-xs font-extrabold text-slate-700 uppercase mb-1">
                  Reset Password (Leave blank to keep unchanged)
                </label>
                <input
                  type="password"
                  value={editPassword}
                  onChange={(e) => setEditPassword(e.target.value)}
                  placeholder="New password (optional)"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs font-bold text-slate-900 focus:ring-2 focus:ring-sky-400"
                />
              </div>

              <div>
                <label className="block text-xs font-extrabold text-slate-700 uppercase mb-1">
                  Assigned Service Area
                </label>
                <select
                  value={editServiceAreaId}
                  onChange={(e) => setEditServiceAreaId(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs font-bold text-slate-900 focus:ring-2 focus:ring-sky-400"
                >
                  <option value="">All Areas / Floating</option>
                  {areas.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.pincode || a.city})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-extrabold text-slate-700 uppercase mb-1">
                  Account Status
                </label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as any)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs font-bold text-slate-900 focus:ring-2 focus:ring-sky-400"
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingBoy(null)}
                  className="px-4 py-2.5 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editSubmitting}
                  className="px-5 py-2.5 text-xs font-black text-white bg-sky-500 hover:bg-sky-600 rounded-xl shadow-sm shadow-sky-500/20 disabled:opacity-50"
                >
                  {editSubmitting ? 'Saving Changes...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {boyToDelete && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-rose-100 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-600 shrink-0">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900">Remove Delivery Personnel</h3>
                <p className="text-xs text-slate-500">Confirm account removal or deactivation</p>
              </div>
            </div>

            {deleteError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{deleteError}</span>
              </div>
            )}

            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-bold">Name:</span>
                <span className="text-slate-900 font-black">{boyToDelete.name}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-bold">Mobile / Login:</span>
                <span className="font-mono font-bold text-slate-700">{boyToDelete.email_or_phone}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-bold">Area:</span>
                <span className="font-bold text-slate-700">{boyToDelete.area_name || 'All Pune'}</span>
              </div>
            </div>

            <p className="text-xs text-slate-500 leading-relaxed">
              If this delivery personnel has historical orders, their account will be safely archived and set to <strong>Inactive</strong> so past delivery records and bills remain preserved. If they have active deliveries in progress, please reassign them first.
            </p>

            <div className="pt-2 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => { setBoyToDelete(null); setDeleteError(null); }}
                disabled={deletingBoy}
                className="px-4 py-2.5 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={executeDeleteBoy}
                disabled={deletingBoy}
                className="px-5 py-2.5 text-xs font-black text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-sm shadow-rose-600/20 disabled:opacity-50 flex items-center gap-2 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{deletingBoy ? 'Processing...' : 'Confirm Remove'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
