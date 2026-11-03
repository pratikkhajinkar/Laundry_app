import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.tsx';
import type { ClothingCategory } from '../../types/index.ts';
import { Tag, Plus, Edit2, Check, X, ShieldAlert, Sparkles, RefreshCw, Trash2, CheckCircle2, AlertCircle } from 'lucide-react';
import { syncCategoryToFirestore, deleteCategoryFromFirestore } from '../../services/firestoreSync.ts';

export const PriceListManager: React.FC = () => {
  const { token, language, t } = useAuth();
  const [categories, setCategories] = useState<ClothingCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRate, setEditRate] = useState<string>('');
  const [editName, setEditName] = useState<string>('');
  const [editNameMr, setEditNameMr] = useState<string>('');
  const [editUnit, setEditUnit] = useState<string>('piece');
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Add new modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newNameMr, setNewNameMr] = useState('');
  const [newRate, setNewRate] = useState('');
  const [newUnit, setNewUnit] = useState('piece');
  const [modalError, setModalError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const showToast = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 3500);
  };

  const fetchCategories = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/admin/clothing-categories', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setCategories(data.categories || []);
      }
    } catch (err) {
      console.error('Failed to load categories:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  const handleStartEdit = (cat: ClothingCategory) => {
    setEditingId(cat.id);
    setEditRate(String(cat.default_rate));
    setEditName(cat.name);
    setEditNameMr(cat.name_mr || '');
    setEditUnit(cat.unit || 'piece');
  };

  const handleSaveEdit = async (cat: ClothingCategory) => {
    const rateVal = parseFloat(editRate);
    if (isNaN(rateVal) || rateVal < 0) {
      showToast('error', 'Please enter a valid rate (₹ >= 0)');
      return;
    }
    if (!editName.trim()) {
      showToast('error', 'Item name cannot be empty');
      return;
    }

    try {
      const updatedPayload = {
        name: editName.trim(),
        name_mr: editNameMr.trim() || null,
        default_rate: rateVal,
        unit: editUnit,
        is_active: cat.is_active,
        sort_order: cat.sort_order
      };

      const res = await fetch(`/api/clothing-categories/${cat.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(updatedPayload)
      });

      if (res.ok) {
        // Direct client sync to Firebase Firestore for guaranteed durability
        syncCategoryToFirestore({
          id: cat.id,
          ...updatedPayload
        }).catch(err => console.warn('[Firestore] Price update sync notice:', err));

        // Optimistically update local state immediately
        setCategories(prev => prev.map(c => c.id === cat.id ? { ...c, ...updatedPayload } : c));
        setEditingId(null);
        showToast('success', `${editName.trim()} rate updated to ₹${rateVal} and saved permanently!`);
      } else {
        const errData = await res.json().catch(() => ({}));
        showToast('error', errData.error || 'Failed to save changes');
      }
    } catch (err: any) {
      showToast('error', err.message || 'Error updating category');
    }
  };

  const handleToggleActive = async (cat: ClothingCategory) => {
    try {
      const nextActive = cat.is_active === 1 ? 0 : 1;
      const res = await fetch(`/api/clothing-categories/${cat.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          name: cat.name,
          name_mr: cat.name_mr,
          default_rate: cat.default_rate,
          unit: cat.unit,
          is_active: nextActive,
          sort_order: cat.sort_order
        })
      });
      if (res.ok) {
        syncCategoryToFirestore({
          id: cat.id,
          name: cat.name,
          name_mr: cat.name_mr,
          default_rate: cat.default_rate,
          unit: cat.unit,
          is_active: nextActive,
          sort_order: cat.sort_order
        }).catch(console.warn);

        setCategories(prev => prev.map(c => c.id === cat.id ? { ...c, is_active: nextActive } : c));
        showToast('success', `${cat.name} is now ${nextActive === 1 ? 'Active' : 'Disabled'}`);
      }
    } catch (err) {
      console.error('Error toggling category:', err);
    }
  };

  const handleDeleteCategory = async (cat: ClothingCategory) => {
    try {
      const res = await fetch(`/api/clothing-categories/${cat.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        deleteCategoryFromFirestore(cat.id).catch(console.warn);
        setCategories(prev => prev.filter(c => c.id !== cat.id));
        setDeletingId(null);
        showToast('success', `${cat.name} deleted successfully`);
      } else {
        const err = await res.json().catch(() => ({}));
        showToast('error', err.error || 'Failed to delete category');
      }
    } catch (e: any) {
      showToast('error', e.message || 'Error deleting category');
    }
  };

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);

    const rateVal = parseFloat(newRate);
    if (!newName.trim() || isNaN(rateVal) || rateVal < 0) {
      setModalError('Please provide item name and a valid rate');
      return;
    }

    try {
      const payload = {
        name: newName.trim(),
        name_mr: newNameMr.trim() || null,
        default_rate: rateVal,
        unit: newUnit,
        sort_order: categories.length + 1
      };

      const res = await fetch('/api/clothing-categories', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add item');

      // Sync new category to Firestore
      if (data.id) {
        syncCategoryToFirestore({
          id: data.id,
          ...payload,
          is_active: 1
        }).catch(err => console.warn('[Firestore] New category sync notice:', err));
      }

      setNewName('');
      setNewNameMr('');
      setNewRate('');
      setShowAddModal(false);
      await fetchCategories();
      showToast('success', `${payload.name} (₹${rateVal}) added and saved permanently!`);
    } catch (err: any) {
      setModalError(err.message || 'Failed to add item');
    }
  };

  const filteredCategories = categories.filter(c => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      (c.name_mr && c.name_mr.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {notification && (
        <div className={`p-4 rounded-2xl flex items-center gap-3 shadow-lg border transition-all text-sm sm:text-base font-bold ${
          notification.type === 'success' 
            ? 'bg-emerald-600 text-white border-emerald-500' 
            : 'bg-rose-600 text-white border-rose-500'
        }`}>
          {notification.type === 'success' ? <CheckCircle2 className="w-5 h-5 shrink-0" /> : <AlertCircle className="w-5 h-5 shrink-0" />}
          <span>{notification.message}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 sm:p-6 rounded-3xl border border-slate-200 shadow-sm">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              {language === 'mr' ? 'कपड्यांचे दरपत्रक (Price List)' : 'Clothing Price List & Rates'}
            </h1>
            <span className="text-xs sm:text-sm font-bold px-3 py-1 rounded-full bg-emerald-100 text-emerald-850">
              {categories.filter(c => c.is_active === 1).length} {language === 'mr' ? 'सक्रिय दर' : 'Active Rates'}
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-1 font-medium">
            {language === 'mr' 
              ? 'येथे जोडलेले नवीन आयटम आणि बदललेले दर कायमस्वरूपी डेटाबेस व क्लाऊडमध्ये सेव्ह राहतील.' 
              : 'Add new items or modify rates. All changes and additions persist permanently in database & cloud.'}
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={fetchCategories}
            className="p-3 text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-2xl transition-colors"
            title="Refresh"
          >
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-5 py-3 bg-emerald-700 hover:bg-emerald-800 text-white text-sm sm:text-base font-black rounded-2xl shadow-md shadow-emerald-700/20 transition-all hover:scale-[1.02]"
          >
            <Plus className="w-5 h-5" />
            <span>{language === 'mr' ? '+ नवीन कपडा आयटम जोडा' : '+ Add Clothing Item'}</span>
          </button>
        </div>
      </div>

      {/* Search Filter */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 flex items-center gap-3">
        <Tag className="w-5 h-5 text-slate-400 shrink-0 ml-1" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={language === 'mr' ? 'कपड्याचे नाव शोधा (उदा. Shirt, Jeans, Saree, Wash & Iron)...' : 'Search item name (e.g. Shirt, Jeans, Saree, Wash & Iron)...'}
          className="w-full text-sm sm:text-base font-semibold text-slate-800 placeholder-slate-400 bg-transparent outline-none"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="text-xs font-bold text-slate-400 hover:text-slate-600 px-2 py-1 bg-slate-100 rounded-lg"
          >
            Clear
          </button>
        )}
      </div>

      {/* Table of items */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-100/80 border-b border-slate-200 text-xs sm:text-sm font-black text-slate-700 uppercase tracking-wider">
                <th className="py-4 px-4 sm:px-6">{language === 'mr' ? 'कपड्याचे नाव' : 'Item Name'}</th>
                <th className="py-4 px-4">{language === 'mr' ? 'मराठी नाव' : 'Marathi Label'}</th>
                <th className="py-4 px-4">{language === 'mr' ? 'दर (Rate)' : 'Rate (₹)'}</th>
                <th className="py-4 px-4">{language === 'mr' ? 'युनिट' : 'Unit'}</th>
                <th className="py-4 px-4">{language === 'mr' ? 'स्थिती' : 'Status'}</th>
                <th className="py-4 px-4 sm:px-6 text-right">{language === 'mr' ? 'कृती' : 'Actions'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredCategories.map((cat) => {
                const isEditing = editingId === cat.id;

                return (
                  <tr key={cat.id} className="hover:bg-slate-50/80 transition-colors">
                    {/* Name */}
                    <td className="py-4 px-4 sm:px-6">
                      {isEditing ? (
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="px-3 py-2 border-2 border-emerald-500 rounded-xl text-base font-bold text-slate-900 w-full max-w-[200px]"
                        />
                      ) : (
                        <div className="flex items-center gap-2.5">
                          <Tag className="w-4 h-4 text-emerald-600 shrink-0" />
                          <span className="text-base sm:text-lg font-bold text-slate-900">{cat.name}</span>
                        </div>
                      )}
                    </td>

                    {/* Marathi Name */}
                    <td className="py-4 px-4">
                      {isEditing ? (
                        <input
                          type="text"
                          value={editNameMr}
                          onChange={(e) => setEditNameMr(e.target.value)}
                          className="px-3 py-2 border-2 border-emerald-500 rounded-xl text-base font-bold text-slate-900 w-full max-w-[180px]"
                        />
                      ) : (
                        <span className="text-sm sm:text-base font-semibold text-slate-600">{cat.name_mr || '-'}</span>
                      )}
                    </td>

                    {/* Rate */}
                    <td className="py-4 px-4 font-black">
                      {isEditing ? (
                        <div className="flex items-center gap-1.5">
                          <span className="text-base font-bold text-slate-500">₹</span>
                          <input
                            type="number"
                            step="1"
                            value={editRate}
                            onChange={(e) => setEditRate(e.target.value)}
                            className="px-3 py-2 border-2 border-emerald-500 rounded-xl text-base font-black text-emerald-800 w-24"
                          />
                        </div>
                      ) : (
                        <span className="text-base sm:text-xl font-black text-emerald-800">₹{cat.default_rate.toFixed(2)}</span>
                      )}
                    </td>

                    {/* Unit */}
                    <td className="py-4 px-4">
                      {isEditing ? (
                        <select
                          value={editUnit}
                          onChange={(e) => setEditUnit(e.target.value)}
                          className="px-2.5 py-2 border border-slate-300 rounded-xl text-sm font-bold bg-white"
                        >
                          <option value="piece">piece (नग)</option>
                          <option value="kg">kg (किलो)</option>
                          <option value="sq_ft">sq_ft (चौरस फूट)</option>
                        </select>
                      ) : (
                        <span className="text-xs sm:text-sm font-bold px-2.5 py-1 bg-slate-100 text-slate-700 rounded-lg uppercase">
                          {cat.unit}
                        </span>
                      )}
                    </td>

                    {/* Status */}
                    <td className="py-4 px-4">
                      <button
                        type="button"
                        onClick={() => handleToggleActive(cat)}
                        className={`text-xs sm:text-sm font-bold px-3 py-1 rounded-full border cursor-pointer transition-all ${
                          cat.is_active === 1
                            ? 'bg-emerald-50 text-emerald-850 border-emerald-300 hover:bg-emerald-100'
                            : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200'
                        }`}
                        title="Click to toggle active state"
                      >
                        {cat.is_active === 1 ? 'Active' : 'Disabled'}
                      </button>
                    </td>

                    {/* Actions */}
                    <td className="py-4 px-4 sm:px-6 text-right">
                      {isEditing ? (
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => handleSaveEdit(cat)}
                            className="flex items-center gap-1 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-xl shadow-xs"
                            title="Save"
                          >
                            <Check className="w-4 h-4" />
                            <span>Save</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            className="p-2 text-slate-500 hover:bg-slate-100 rounded-xl"
                            title="Cancel"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => handleStartEdit(cat)}
                            className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-bold text-emerald-850 hover:text-emerald-950 px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition-colors"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                            <span>Edit Rate</span>
                          </button>

                          {deletingId === cat.id ? (
                            <div className="inline-flex items-center gap-1 bg-rose-50 p-1 rounded-xl border border-rose-200">
                              <span className="text-xs text-rose-700 font-bold px-1">Confirm?</span>
                              <button
                                type="button"
                                onClick={() => handleDeleteCategory(cat)}
                                className="px-2 py-0.5 bg-rose-600 text-white rounded text-xs font-bold"
                              >
                                Yes
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeletingId(null)}
                                className="px-1.5 py-0.5 text-slate-500 text-xs font-bold"
                              >
                                No
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setDeletingId(cat.id)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors"
                              title="Delete Item"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-6 sm:p-7 border border-slate-200">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <h3 className="text-lg sm:text-xl font-black text-slate-900">
                {language === 'mr' ? 'नवीन कपडा आयटम जोडा' : 'Add Clothing Item'}
              </h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-600 font-bold p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            {modalError && (
              <div className="mt-3 p-3.5 bg-rose-50 text-rose-800 text-sm font-semibold rounded-2xl border border-rose-200 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>{modalError}</span>
              </div>
            )}

            <form onSubmit={handleAddCategory} className="mt-5 space-y-4">
              <div>
                <label className="block text-xs sm:text-sm font-bold text-slate-800 uppercase mb-1.5">
                  Item Name (English) *
                </label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Coat / Blazer / Blanket"
                  className="w-full px-4 py-3 rounded-2xl border-2 border-slate-200 text-base font-semibold focus:border-emerald-600 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs sm:text-sm font-bold text-slate-800 uppercase mb-1.5">
                  Marathi Label
                </label>
                <input
                  type="text"
                  value={newNameMr}
                  onChange={(e) => setNewNameMr(e.target.value)}
                  placeholder="e.g. कोट / ब्लेझर / ब्लँकेट"
                  className="w-full px-4 py-3 rounded-2xl border-2 border-slate-200 text-base font-semibold focus:border-emerald-600 outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs sm:text-sm font-bold text-slate-800 uppercase mb-1.5">
                    Rate (₹) *
                  </label>
                  <input
                    type="number"
                    step="1"
                    required
                    value={newRate}
                    onChange={(e) => setNewRate(e.target.value)}
                    placeholder="e.g. 150"
                    className="w-full px-4 py-3 rounded-2xl border-2 border-slate-200 text-base font-black text-emerald-800 focus:border-emerald-600 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs sm:text-sm font-bold text-slate-800 uppercase mb-1.5">
                    Unit *
                  </label>
                  <select
                    value={newUnit}
                    onChange={(e) => setNewUnit(e.target.value)}
                    className="w-full px-4 py-3 rounded-2xl border-2 border-slate-200 text-base font-semibold focus:border-emerald-600 outline-none bg-white"
                  >
                    <option value="piece">piece (नग)</option>
                    <option value="kg">kg (किलो)</option>
                    <option value="sq_ft">sq_ft (चौरस फूट)</option>
                  </select>
                </div>
              </div>

              <div className="pt-3 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-5 py-3 text-sm font-bold text-slate-600 hover:text-slate-800 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-3 bg-emerald-700 hover:bg-emerald-800 text-white text-sm sm:text-base font-black rounded-2xl shadow-md shadow-emerald-700/20"
                >
                  Save & Persist Item
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
