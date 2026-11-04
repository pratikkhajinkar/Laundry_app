import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.tsx';
import type { Customer, Shop, ServiceArea, CustomerLedgerSummary } from '../../types/index.ts';
import { syncCustomerToFirestore, syncPaymentToFirestore } from '../../services/firestoreSync.ts';
import { 
  Users, 
  Search, 
  Plus, 
  Phone, 
  MapPin, 
  Building, 
  Clock, 
  Receipt, 
  AlertCircle,
  Edit2,
  IndianRupee,
  CheckCircle2,
  QrCode,
  Banknote,
  CreditCard,
  X,
  BookOpen,
  Calendar,
  ArrowUpRight,
  ArrowDownLeft,
  Printer,
  History,
  AlertTriangle,
  ChevronRight,
  HandCoins,
  Trash2
} from 'lucide-react';

export const CustomerDirectory: React.FC<{ onSelectCustomer?: (customer: Customer) => void }> = ({ onSelectCustomer }) => {
  const { token, user, activeShopId, setActiveShopId } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [shops, setShops] = useState<Shop[]>([]);
  const [areas, setAreas] = useState<ServiceArea[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedShopId, setSelectedShopId] = useState<string>(() => activeShopId || '');
  const [showAddModal, setShowAddModal] = useState(false);

  // Add Form
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [email, setEmail] = useState('');
  const [pickupAddress, setPickupAddress] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [area, setArea] = useState('');
  const [buildingName, setBuildingName] = useState('');
  const [flatNumber, setFlatNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [shopId, setShopId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Customer Ledger Modal State
  const [ledgerCustomer, setLedgerCustomer] = useState<Customer | null>(null);
  const [ledgerData, setLedgerData] = useState<CustomerLedgerSummary | null>(null);
  const [loadingLedger, setLoadingLedger] = useState<boolean>(false);

  // Collect Customer Due Modal State
  const [dueCustomer, setDueCustomer] = useState<Customer | null>(null);
  const [targetOrderId, setTargetOrderId] = useState<string | null>(null);
  const [dueOrders, setDueOrders] = useState<any[]>([]);
  const [dueTotal, setDueTotal] = useState<number>(0);
  const [collectAmount, setCollectAmount] = useState<string>('');
  const [collectMethod, setCollectMethod] = useState<'cash' | 'upi' | 'card'>('cash');
  const [collectRef, setCollectRef] = useState<string>('');
  const [collectNotes, setCollectNotes] = useState<string>('');
  const [collecting, setCollecting] = useState<boolean>(false);
  const [collectSuccess, setCollectSuccess] = useState<string | null>(null);
  const [collectError, setCollectError] = useState<string | null>(null);

  // Delete Customer State
  const [customerToDelete, setCustomerToDelete] = useState<{ customer: Customer; orderCount?: number; requiresForce?: boolean } | null>(null);
  const [deletingCustomer, setDeletingCustomer] = useState<boolean>(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleRequestDelete = (c: Customer, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setDeleteError(null);
    setCustomerToDelete({ customer: c });
  };

  const handleConfirmDelete = async (force: boolean = false) => {
    if (!customerToDelete) return;
    try {
      setDeletingCustomer(true);
      setDeleteError(null);
      const res = await fetch(`/api/customers/${customerToDelete.customer.id}${force ? '?force=true' : ''}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setCustomers(prev => prev.filter(c => c.id !== customerToDelete.customer.id));
        if (ledgerCustomer?.id === customerToDelete.customer.id) {
          setLedgerCustomer(null);
        }
        setCustomerToDelete(null);
      } else if (data.requiresForce) {
        setCustomerToDelete({
          customer: customerToDelete.customer,
          orderCount: data.orderCount,
          requiresForce: true
        });
      } else {
        setDeleteError(data.error || 'Failed to delete customer');
      }
    } catch (err: any) {
      setDeleteError(err.message || 'Error deleting customer');
    } finally {
      setDeletingCustomer(false);
    }
  };

  const fetchCustomers = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (search) params.set('q', search);
      const targetShop = user?.role === 'shop' ? user.shop_id : selectedShopId;
      if (targetShop && targetShop !== 'all') params.set('shop_id', targetShop);

      const res = await fetch(`/api/customers?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setCustomers(data.customers);
      }
    } catch (err) {
      console.error('Error fetching customers:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchMetadata = async () => {
    try {
      const [resShops, resAreas] = await Promise.all([
        fetch('/api/shops', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/areas', { headers: { Authorization: `Bearer ${token}` } })
      ]);
      if (resShops.ok) {
        const d = await resShops.json();
        setShops(d.shops);
        if (d.shops.length > 0 && !shopId) setShopId(d.shops[0].id);
      }
      if (resAreas.ok) {
        const d = await resAreas.json();
        setAreas(d.areas);
        if (d.areas.length > 0 && !area) setArea(d.areas[0].name);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchMetadata();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchCustomers();
    }, 300);
    return () => clearTimeout(timer);
  }, [search, selectedShopId]);

  // Open full ledger for customer
  const handleOpenLedger = async (customer: Customer) => {
    setLedgerCustomer(customer);
    setLedgerData(null);
    setLoadingLedger(true);
    try {
      const res = await fetch(`/api/customers/${customer.id}/ledger`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const d = await res.json();
        setLedgerData(d);
      }
    } catch (err) {
      console.error('Failed to load ledger', err);
    } finally {
      setLoadingLedger(false);
    }
  };

  // Open due collection modal
  const handleOpenDueModal = async (customer: Customer, specificOrderId?: string) => {
    setDueCustomer(customer);
    setTargetOrderId(specificOrderId || null);
    setCollectSuccess(null);
    setCollectError(null);
    setCollectRef('');
    setCollectNotes('');

    try {
      const res = await fetch(`/api/customers/${customer.id}/due-orders`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const d = await res.json();
        setDueOrders(d.orders || []);
        if (specificOrderId) {
          const match = (d.orders || []).find((o: any) => o.id === specificOrderId);
          const amt = match ? Number(match.outstanding_amount) : Number(d.totalDue);
          setDueTotal(amt);
          setCollectAmount(String(amt));
        } else {
          setDueTotal(Number(d.totalDue) || 0);
          setCollectAmount(String(d.totalDue || 0));
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Submit collected payment
  const handleCollectPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dueCustomer) return;
    setCollectError(null);
    const amt = parseFloat(collectAmount);

    if (!amt || amt <= 0) {
      setCollectError('Please enter a valid amount.');
      return;
    }

    try {
      setCollecting(true);
      const res = await fetch(`/api/customers/${dueCustomer.id}/collect-due`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          amount: amt,
          payment_method: collectMethod,
          transaction_reference: collectRef.trim() || null,
          target_order_id: targetOrderId || null,
          notes: collectNotes.trim() || 'Customer account due payment'
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Payment failed');

      setCollectSuccess(`✅ ₹${amt} collected successfully!`);

      // Refresh data
      fetchCustomers();
      if (ledgerCustomer && ledgerCustomer.id === dueCustomer.id) {
        handleOpenLedger(dueCustomer);
      }

      setTimeout(() => {
        setDueCustomer(null);
        setCollectSuccess(null);
      }, 1500);

    } catch (err: any) {
      setCollectError(err.message || 'Payment collection failed');
    } finally {
      setCollecting(false);
    }
  };

  const handleOpenAddModal = () => {
    setError(null);
    setSuccessMsg(null);
    const activeId = selectedShopId || activeShopId || shops[0]?.id || '';
    setShopId(activeId);
    const curShop = shops.find(s => s.id === activeId);
    if (curShop) {
      setArea(curShop.name.replace('Friends Laundry & Dry Cleaners - ', ''));
    }
    setShowAddModal(true);
  };

  const handleAddCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    if (!name.trim() || !mobile.trim()) {
      setError('Customer name and mobile number are required.');
      return;
    }

    try {
      setSubmitting(true);
      const res = await fetch('/api/customers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          name: name.trim(),
          mobile: mobile.trim(),
          email: email.trim() || null,
          pickup_address: pickupAddress.trim() || 'Store Counter / Shop Pickup',
          delivery_address: deliveryAddress.trim() || pickupAddress.trim() || 'Store Counter / Shop Pickup',
          area: area.trim() || 'Warje',
          building_name: buildingName.trim() || null,
          flat_number: flatNumber.trim() || null,
          notes: notes.trim() || null,
          shop_id: shopId || selectedShopId || activeShopId
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add customer');

      await syncCustomerToFirestore({
        id: data.id,
        name: name.trim(),
        mobile: mobile.trim(),
        pickup_address: pickupAddress.trim(),
        area: area.trim(),
        shop_id: shopId
      });

      setSuccessMsg('✅ Customer added successfully!');
      setName('');
      setMobile('');
      setEmail('');
      setPickupAddress('');
      setDeliveryAddress('');
      setBuildingName('');
      setFlatNumber('');
      setNotes('');
      fetchCustomers();

      setTimeout(() => {
        setShowAddModal(false);
        setSuccessMsg(null);
      }, 1200);

    } catch (err: any) {
      setError(err.message || 'Error creating customer');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-3xl border border-sky-100 shadow-xs">
        <div>
          <span className="text-[10px] font-black uppercase tracking-wider text-sky-600 block">
            Customer Directory & Accounts Ledger
          </span>
          <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
            <Users className="w-6 h-6 text-sky-600" />
            <span>Customer Directory & Ledger</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Customer contacts, pending dues, invoices, and full ledger history.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleOpenAddModal}
            className="px-4 py-2.5 bg-sky-500 hover:bg-sky-600 text-white rounded-2xl font-black text-xs flex items-center gap-1.5 shadow-md shadow-sky-500/20 transition-all shrink-0 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>+ Add New Customer</span>
          </button>
        </div>
      </div>

      {/* Shop Navigation Tabs for Admin */}
      {user?.role === 'admin' && shops.length > 0 && (
        <div className="space-y-2">
          <span className="text-xs font-black uppercase tracking-wider text-slate-600 block">
            Select Branch for Customers
          </span>
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {shops.map(shop => {
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
                  className={`px-4 py-2.5 rounded-2xl text-xs font-black whitespace-nowrap transition-all border cursor-pointer ${
                    isSelected
                      ? 'bg-gradient-to-r from-sky-600 to-[#0369A1] text-white border-sky-600 shadow-md shadow-sky-600/25 ring-2 ring-sky-300'
                      : 'bg-white text-slate-700 border-sky-100 hover:bg-sky-50 shadow-xs'
                  }`}
                >
                  🏪 {shortName}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Search Input */}
      <div className="relative">
        <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder="Search by customer name, mobile or address..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-11 pr-4 py-3 bg-white border border-slate-200 rounded-2xl text-xs font-medium focus:outline-hidden focus:ring-2 focus:ring-sky-500 shadow-xs"
        />
      </div>

      {/* Customers List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading && customers.length === 0 ? (
          <div className="col-span-full text-center py-12 text-slate-400 text-xs">
            Loading customers...
          </div>
        ) : customers.length === 0 ? (
          <div className="col-span-full text-center py-12 bg-white rounded-3xl border border-slate-100 p-8 space-y-2">
            <Users className="w-10 h-10 text-slate-300 mx-auto" />
            <p className="text-sm font-bold text-slate-700">No customers found</p>
            <p className="text-xs text-slate-400">Click '+ Add New Customer' to add your first customer.</p>
          </div>
        ) : (
          customers.map((c) => {
            const hasDue = (Number(c.total_due) || 0) > 0;
            return (
              <div 
                key={c.id}
                className="bg-white rounded-3xl border border-sky-100 hover:border-sky-300 p-5 shadow-xs hover:shadow-md transition-all flex flex-col justify-between space-y-4"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className="w-10 h-10 rounded-2xl bg-sky-100 text-sky-800 flex items-center justify-center font-black text-sm shrink-0">
                        {c.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <h4 className="font-extrabold text-sm text-slate-900 leading-tight">{c.name}</h4>
                        <span className="text-[11px] font-bold text-slate-500 flex items-center gap-1 mt-0.5">
                          <Phone className="w-3 h-3 text-sky-600" />
                          {c.mobile}
                        </span>
                      </div>
                    </div>

                    {hasDue ? (
                      <span className="text-[10px] font-black bg-rose-50 text-rose-700 border border-rose-200 px-2.5 py-1 rounded-full shrink-0">
                        Due: ₹{Number(c.total_due).toFixed(2)}
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full shrink-0">
                        Clear
                      </span>
                    )}
                  </div>

                  <div className="mt-3 pt-3 border-t border-slate-100 text-xs text-slate-600 space-y-1">
                    <p className="flex items-start gap-1.5 leading-snug">
                      <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                      <span>{c.pickup_address}</span>
                    </p>
                    <p className="text-[11px] text-slate-500 font-medium pl-5">
                      {c.area}{c.building_name ? ` • ${c.building_name}` : ''}
                    </p>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-100 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleOpenLedger(c)}
                    className="flex-1 py-2 px-3 bg-sky-50 hover:bg-sky-100 text-sky-800 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-colors border border-sky-200 cursor-pointer"
                  >
                    <BookOpen className="w-3.5 h-3.5 text-sky-600" />
                    <span>Ledger</span>
                  </button>

                  {hasDue && (
                    <button
                      type="button"
                      onClick={() => handleOpenDueModal(c)}
                      className="py-2 px-3 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-black text-xs flex items-center gap-1 transition-all shadow-xs cursor-pointer"
                    >
                      <HandCoins className="w-3.5 h-3.5" />
                      <span>Collect Due</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={(e) => handleRequestDelete(c, e)}
                    className="p-2 bg-rose-50 hover:bg-rose-100 text-rose-600 hover:text-rose-700 rounded-xl transition-colors border border-rose-200 cursor-pointer"
                    title="Delete Customer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* CUSTOMER LEDGER MODAL (Account Statement & History) */}
      {ledgerCustomer && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl max-w-3xl w-full border border-sky-100 overflow-hidden my-auto max-h-[95vh] flex flex-col">
            
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-sky-600 to-sky-700 p-5 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center shrink-0">
                  <BookOpen className="w-5 h-5 text-white" />
                </div>
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider bg-white/25 px-2.5 py-0.5 rounded-full inline-block">
                    Customer Ledger Account
                  </span>
                  <h3 className="text-lg font-black mt-0.5">
                    {ledgerCustomer.name} • Account Statement
                  </h3>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleRequestDelete(ledgerCustomer)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-500/30 hover:bg-rose-600 text-white rounded-xl text-xs font-bold border border-white/20 transition-colors cursor-pointer"
                  title="Delete Customer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete Customer</span>
                </button>
                <button
                  type="button"
                  onClick={() => setLedgerCustomer(null)}
                  className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-5 sm:p-6 overflow-y-auto space-y-5 flex-1">
              
              {loadingLedger ? (
                <div className="text-center py-12 text-slate-400 text-xs">
                  Loading customer ledger...
                </div>
              ) : ledgerData ? (
                <>
                  {/* Summary Metric Cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    <div className="bg-slate-50 border border-slate-200 p-3 rounded-2xl">
                      <span className="text-[10px] font-bold text-slate-500 uppercase block">Total Orders</span>
                      <span className="text-lg font-black text-slate-900">{ledgerData.total_orders_count}</span>
                    </div>
                    <div className="bg-sky-50 border border-sky-200 p-3 rounded-2xl">
                      <span className="text-[10px] font-bold text-sky-700 uppercase block">Total Billed</span>
                      <span className="text-lg font-black text-sky-900">₹{ledgerData.total_billed_amount.toFixed(2)}</span>
                    </div>
                    <div className="bg-emerald-50 border border-emerald-200 p-3 rounded-2xl">
                      <span className="text-[10px] font-bold text-emerald-700 uppercase block">Total Paid</span>
                      <span className="text-lg font-black text-emerald-800">₹{ledgerData.total_paid_amount.toFixed(2)}</span>
                    </div>
                    <div className={`p-3 rounded-2xl border ${
                      ledgerData.total_outstanding_due > 0 
                        ? 'bg-amber-50 border-amber-300 text-amber-900' 
                        : 'bg-slate-50 border-slate-200 text-slate-900'
                    }`}>
                      <span className="text-[10px] font-black uppercase block">Outstanding Due</span>
                      <span className="text-lg font-black">₹{ledgerData.total_outstanding_due.toFixed(2)}</span>
                    </div>
                  </div>

                  {/* Overdue Warning Alert if any */}
                  {ledgerData.overdue_bills_count > 0 && (
                    <div className="bg-rose-50 border border-rose-300 p-3 rounded-2xl flex items-center justify-between text-xs text-rose-800">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                        <span>
                          <strong>{ledgerData.overdue_bills_count} bills</strong> are overdue (Overdue: ₹{ledgerData.overdue_bills_amount.toFixed(2)})
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleOpenDueModal(ledgerCustomer)}
                        className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-bold text-[11px]"
                      >
                        Collect Due
                      </button>
                    </div>
                  )}

                  {/* Unpaid Orders Section */}
                  {ledgerData.unpaid_orders && ledgerData.unpaid_orders.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                          <Receipt className="w-4 h-4 text-amber-600" />
                          <span>Unpaid Invoices List</span>
                        </h4>
                        <button
                          type="button"
                          onClick={() => handleOpenDueModal(ledgerCustomer)}
                          className="text-[11px] font-black text-amber-700 hover:text-amber-800 bg-amber-100 px-2.5 py-1 rounded-lg border border-amber-200"
                        >
                          Collect Full Due (₹{ledgerData.total_outstanding_due.toFixed(2)})
                        </button>
                      </div>

                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        {ledgerData.unpaid_orders.map((ord: any) => (
                          <div 
                            key={ord.id}
                            className="bg-amber-50/60 border border-amber-200 p-3 rounded-2xl flex items-center justify-between text-xs"
                          >
                            <div>
                              <span className="font-extrabold text-slate-900 block">
                                Order #{ord.order_number} • {ord.created_at?.split('T')[0]}
                              </span>
                              <span className="text-[11px] text-slate-600">
                                Bill: ₹{Number(ord.final_total).toFixed(2)} • Paid: ₹{Number(ord.amount_paid).toFixed(2)}
                              </span>
                              {ord.expected_payment_date && (
                                <span className="text-[10px] text-amber-800 font-bold block mt-0.5">
                                  Due Date: {ord.expected_payment_date}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="font-black text-sm text-rose-600">
                                Due: ₹{Number(ord.outstanding_amount).toFixed(2)}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleOpenDueModal(ledgerCustomer, ord.id)}
                                className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-bold text-[11px]"
                              >
                                Collect
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Complete Chronological Ledger Entries */}
                  <div className="space-y-2 pt-2 border-t border-slate-100">
                    <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                      <History className="w-4 h-4 text-sky-600" />
                      <span>Chronological Account Ledger</span>
                    </h4>

                    <div className="border border-slate-200 rounded-2xl overflow-hidden overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="bg-slate-100 border-b border-slate-200 text-[10px] font-black text-slate-600 uppercase tracking-wider">
                            <th className="py-2.5 px-3">Date</th>
                            <th className="py-2.5 px-3">Type</th>
                            <th className="py-2.5 px-3">Ref / Order #</th>
                            <th className="py-2.5 px-3">Description</th>
                            <th className="py-2.5 px-3 text-right">Debit (+)</th>
                            <th className="py-2.5 px-3 text-right">Credit (-)</th>
                            <th className="py-2.5 px-3 text-right">Balance</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {ledgerData.entries.map((entry: any) => (
                            <tr key={entry.id} className="hover:bg-sky-50/30">
                              <td className="py-2 px-3 text-slate-500 font-mono text-[11px]">
                                {entry.date?.split('T')[0]}
                              </td>
                              <td className="py-2 px-3">
                                {entry.type === 'order' ? (
                                  <span className="inline-flex items-center gap-1 font-bold text-sky-800 text-[11px]">
                                    <ArrowUpRight className="w-3 h-3 text-sky-600" />
                                    <span>New Bill</span>
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 font-bold text-emerald-800 text-[11px]">
                                    <ArrowDownLeft className="w-3 h-3 text-emerald-600" />
                                    <span>Payment</span>
                                  </span>
                                )}
                              </td>
                              <td className="py-2 px-3 font-mono font-bold text-slate-700 text-[11px]">
                                {entry.reference_no}
                              </td>
                              <td className="py-2 px-3 text-slate-600 text-[11px]">
                                {entry.description}
                                {entry.expected_payment_date && (
                                  <span className="text-[10px] text-amber-700 block font-medium">
                                    Due: {entry.expected_payment_date}
                                  </span>
                                )}
                              </td>
                              <td className="py-2 px-3 text-right font-mono font-bold text-sky-900">
                                {entry.debit > 0 ? `₹${entry.debit.toFixed(2)}` : '-'}
                              </td>
                              <td className="py-2 px-3 text-right font-mono font-bold text-emerald-700">
                                {entry.credit > 0 ? `₹${entry.credit.toFixed(2)}` : '-'}
                              </td>
                              <td className="py-2 px-3 text-right font-mono font-black text-slate-900">
                                ₹{entry.balance_after.toFixed(2)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              ) : null}

            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
              <span className="text-[11px] text-slate-500">
                {ledgerCustomer.pickup_address} • {ledgerCustomer.area}
              </span>
              <button
                type="button"
                onClick={() => setLedgerCustomer(null)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-xl font-bold text-xs transition-colors"
              >
                Close
              </button>
            </div>

          </div>
        </div>
      )}

      {/* QUICK DUE PAYMENT COLLECTION MODAL */}
      {dueCustomer && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full border border-sky-100 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            
            <div className="bg-gradient-to-r from-amber-500 to-amber-600 p-5 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center shrink-0">
                  <HandCoins className="w-5 h-5 text-white" />
                </div>
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider bg-white/25 px-2 py-0.5 rounded-full inline-block">
                    Collect Outstanding Due
                  </span>
                  <h3 className="text-base font-black mt-0.5">{dueCustomer.name}</h3>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDueCustomer(null)}
                className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCollectPayment} className="p-5 sm:p-6 space-y-4">
              {collectError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{collectError}</span>
                </div>
              )}

              {collectSuccess && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                  <span className="font-bold">{collectSuccess}</span>
                </div>
              )}

              <div className="bg-amber-50 border border-amber-200 p-3 rounded-2xl flex items-center justify-between text-xs">
                <span className="text-amber-800 font-bold">
                  {targetOrderId ? 'Selected Order Due:' : 'Customer Total Due:'}
                </span>
                <span className="text-base font-black text-amber-900">₹{dueTotal.toFixed(2)}</span>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Amount to Collect (₹) *
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold">₹</span>
                  <input
                    type="number"
                    step="0.01"
                    min="1"
                    max={dueTotal}
                    value={collectAmount}
                    onChange={(e) => setCollectAmount(e.target.value)}
                    required
                    className="w-full pl-8 pr-4 py-2.5 rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-sky-500 font-black text-slate-900 text-lg"
                  />
                </div>
              </div>

              {/* Payment Method Selector */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Payment Method
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setCollectMethod('cash')}
                    className={`py-2 px-3 rounded-xl border text-xs font-bold flex flex-col items-center gap-1 transition-all ${
                      collectMethod === 'cash'
                        ? 'border-emerald-500 bg-emerald-50 text-emerald-800 shadow-xs'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-600'
                    }`}
                  >
                    <Banknote className="w-4 h-4 text-emerald-600" />
                    <span>Cash</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setCollectMethod('upi')}
                    className={`py-2 px-3 rounded-xl border text-xs font-bold flex flex-col items-center gap-1 transition-all ${
                      collectMethod === 'upi'
                        ? 'border-sky-500 bg-sky-50 text-sky-800 shadow-xs'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-600'
                    }`}
                  >
                    <QrCode className="w-4 h-4 text-sky-600" />
                    <span>UPI / QR</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setCollectMethod('card')}
                    className={`py-2 px-3 rounded-xl border text-xs font-bold flex flex-col items-center gap-1 transition-all ${
                      collectMethod === 'card'
                        ? 'border-purple-500 bg-purple-50 text-purple-800 shadow-xs'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-600'
                    }`}
                  >
                    <CreditCard className="w-4 h-4 text-purple-600" />
                    <span>Card / Online</span>
                  </button>
                </div>
              </div>

              {collectMethod === 'upi' && (
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    UPI Reference Number (UTR / Ref)
                  </label>
                  <input
                    type="text"
                    value={collectRef}
                    onChange={(e) => setCollectRef(e.target.value)}
                    placeholder="e.g. 402819284912"
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-sky-500 text-xs font-medium"
                  />
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setDueCustomer(null)}
                  disabled={collecting}
                  className="flex-1 py-2.5 px-4 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={collecting}
                  className="flex-2 py-2.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-black text-xs shadow-md shadow-amber-500/25 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{collecting ? 'Processing...' : `Collect ₹${collectAmount}`}</span>
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

      {/* ADD CUSTOMER MODAL */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full border border-sky-100 overflow-hidden my-auto max-h-[95vh] flex flex-col">
            
            <div className="bg-gradient-to-r from-sky-600 to-sky-700 p-5 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center shrink-0">
                  <Plus className="w-5 h-5 text-white" />
                </div>
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider bg-white/25 px-2 py-0.5 rounded-full inline-block">
                    New Registration
                  </span>
                  <h3 className="text-base font-black mt-0.5">Add New Customer</h3>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddCustomer} className="p-5 sm:p-6 space-y-3.5 overflow-y-auto flex-1">
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

              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">Customer Full Name *</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Rahul Shinde"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">Mobile Number *</label>
                  <input
                    type="tel"
                    required
                    value={mobile}
                    onChange={(e) => setMobile(e.target.value)}
                    placeholder="e.g. 9822123456"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-sky-500"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">Email (Optional)</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="rahul@example.com"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-sky-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">Pickup Address *</label>
                <input
                  type="text"
                  required
                  value={pickupAddress}
                  onChange={(e) => setPickupAddress(e.target.value)}
                  placeholder="House/Flat, Street, Landmark"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">Building / Society</label>
                  <input
                    type="text"
                    value={buildingName}
                    onChange={(e) => setBuildingName(e.target.value)}
                    placeholder="e.g. Sudarshan Heights"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-sky-500"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">Flat / Room Number</label>
                  <input
                    type="text"
                    value={flatNumber}
                    onChange={(e) => setFlatNumber(e.target.value)}
                    placeholder="e.g. B-402"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-sky-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">Service Area *</label>
                  <input
                    type="text"
                    required
                    value={area}
                    onChange={(e) => setArea(e.target.value)}
                    placeholder="e.g. Warje, Kothrud"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-sky-500"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">Assigned Shop</label>
                  <select
                    value={shopId}
                    onChange={(e) => setShopId(e.target.value)}
                    disabled={user?.role === 'shop'}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-sky-500 bg-white"
                  >
                    {shops.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  disabled={submitting}
                  className="flex-1 py-2.5 px-4 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-2 py-2.5 px-4 rounded-xl bg-sky-500 hover:bg-sky-600 text-white font-black text-xs shadow-md shadow-sky-500/25 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{submitting ? 'Saving...' : 'Save Customer'}</span>
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

      {/* DELETE CUSTOMER CONFIRMATION MODAL */}
      {customerToDelete && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full border border-rose-100 overflow-hidden my-auto p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-2xl bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <h3 className="text-base font-black text-slate-900">
                  {customerToDelete.requiresForce ? 'Force Delete Customer?' : 'Delete Customer?'}
                </h3>
                <p className="text-xs text-slate-600 mt-1">
                  Are you sure you want to delete <strong className="text-slate-900">{customerToDelete.customer.name}</strong> ({customerToDelete.customer.mobile})?
                </p>
              </div>
            </div>

            {customerToDelete.requiresForce && (
              <div className="p-3.5 bg-amber-50 border border-amber-300 rounded-2xl text-xs text-amber-900 space-y-1">
                <div className="font-black flex items-center gap-1.5 text-amber-800">
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                  <span>Customer Has Active Orders ({customerToDelete.orderCount})</span>
                </div>
                <p className="text-[11px] text-amber-800 leading-relaxed">
                  Deleting this customer will also permanently delete all {customerToDelete.orderCount} order(s), line items, invoices, and payment records associated with them.
                </p>
              </div>
            )}

            {deleteError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>{deleteError}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setCustomerToDelete(null)}
                disabled={deletingCustomer}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleConfirmDelete(customerToDelete.requiresForce || false)}
                disabled={deletingCustomer}
                className="px-4 py-2 text-xs font-black text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{deletingCustomer ? 'Deleting...' : (customerToDelete.requiresForce ? 'Delete Customer & All Orders' : 'Delete Customer')}</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
