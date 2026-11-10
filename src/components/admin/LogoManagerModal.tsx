import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext.tsx';
import { Upload, Image as ImageIcon, Check, X, Sparkles, Trash2, Camera } from 'lucide-react';
import { syncSettingsToFirestore } from '../../services/firestoreSync.ts';

interface LogoManagerModalProps {
  currentLogo: string;
  onClose: () => void;
  onLogoUpdated: (newLogo: string) => void;
}

export const LogoManagerModal: React.FC<LogoManagerModalProps> = ({ currentLogo, onClose, onLogoUpdated }) => {
  const { token, language } = useAuth();
  const [logoPreview, setLogoPreview] = useState<string>(currentLogo || '');
  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Curated Preset Logos for Friends Laundry & Dry Cleaners
  const presetLogos = [
    {
      id: 'sparkle_shirt',
      name: 'Modern Iron & Sparkle',
      svg: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none"><rect width="100" height="100" rx="24" fill="%230284c7"/><path d="M30 65 L45 35 L55 35 L70 65 Z" fill="white" opacity="0.9"/><circle cx="50" cy="30" r="10" fill="%2338bdf8"/><path d="M35 70 C45 62 55 62 65 70" stroke="white" stroke-width="4" stroke-linecap="round"/><circle cx="75" cy="28" r="4" fill="%23fef08a"/></svg>`
    },
    {
      id: 'fld_monogram',
      name: 'FLD Premium Monogram',
      svg: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none"><rect width="100" height="100" rx="24" fill="%230369a1"/><text x="50" y="62" font-family="Arial, sans-serif" font-weight="900" font-size="34" fill="white" text-anchor="middle">FLD</text><circle cx="50" cy="50" r="42" stroke="%2338bdf8" stroke-width="3" stroke-dasharray="6 4"/></svg>`
    },
    {
      id: 'washing_bubbles',
      name: 'Fresh Bubbles & Clean',
      svg: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none"><rect width="100" height="100" rx="24" fill="%230ea5e9"/><circle cx="50" cy="50" r="28" fill="white" opacity="0.25"/><circle cx="50" cy="50" r="18" fill="white"/><circle cx="68" cy="32" r="8" fill="%23bae6fd"/><circle cx="32" cy="36" r="6" fill="%23bae6fd"/></svg>`
    },
    {
      id: 'royal_dryclean',
      name: 'Royal Dry Cleaners Crown',
      svg: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none"><rect width="100" height="100" rx="24" fill="%231e293b"/><path d="M25 65 L32 38 L50 52 L68 38 L75 65 Z" fill="%2338bdf8"/><circle cx="50" cy="32" r="5" fill="%23facc15"/><circle cx="32" cy="32" r="4" fill="%23facc15"/><circle cx="68" cy="32" r="4" fill="%23facc15"/><rect x="25" y="68" width="50" height="6" rx="3" fill="white"/></svg>`
    }
  ];

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setStatusMsg({ type: 'error', text: 'Please upload an image file (PNG, JPG, SVG, WebP)' });
      return;
    }

    if (file.size > 8 * 1024 * 1024) {
      setStatusMsg({ type: 'error', text: 'Image size should be under 8MB' });
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      // Compress/resize with canvas to keep size fast and lightweight
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxDim = 400;
        let w = img.width;
        let h = img.height;
        if (w > maxDim || h > maxDim) {
          if (w > h) {
            h = Math.round((h * maxDim) / w);
            w = maxDim;
          } else {
            w = Math.round((w * maxDim) / h);
            h = maxDim;
          }
        }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, w, h);
          const compressed = canvas.toDataURL('image/png', 0.9);
          setLogoPreview(compressed);
          setStatusMsg(null);
        } else {
          setLogoPreview(dataUrl);
        }
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };

  const handleSaveLogo = async () => {
    try {
      setSaving(true);
      setStatusMsg(null);

      const res = await fetch('/api/settings/logo', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          logo: logoPreview,
          name: 'Friends Laundry & Dry Cleaners',
          nameMr: 'Friends Laundry & Dry Cleaners'
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update logo');

      // Sync to Firebase Firestore so logo persists permanently across cloud & restarts
      syncSettingsToFirestore('laundry_logo', logoPreview).catch(err => 
        console.warn('[Firestore] Background logo sync notice:', err)
      );

      setStatusMsg({ type: 'success', text: 'Logo saved and persisted successfully!' });
      onLogoUpdated(logoPreview);
      setTimeout(() => {
        onClose();
      }, 700);
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message || 'Error saving logo' });
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveLogo = async () => {
    try {
      setSaving(true);
      const res = await fetch('/api/settings/logo', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ logo: '' })
      });
      if (res.ok) {
        setLogoPreview('');
        syncSettingsToFirestore('laundry_logo', '').catch(console.warn);
        onLogoUpdated('');
        setStatusMsg({ type: 'success', text: 'Logo removed' });
        setTimeout(() => onClose(), 600);
      }
    } catch (e: any) {
      setStatusMsg({ type: 'error', text: e.message || 'Error removing logo' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full border border-sky-100 overflow-hidden my-6">
        {/* Header */}
        <div className="bg-gradient-to-r from-sky-600 to-sky-700 p-5 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/20 backdrop-blur-xs flex items-center justify-center text-white">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-black tracking-tight">
                Laundry Logo & Branding
              </h3>
              <p className="text-xs text-sky-100">
                Configure Friends Laundry logo in the corner
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-white/80 hover:text-white p-1.5 rounded-xl hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {statusMsg && (
            <div className={`p-3.5 rounded-2xl text-sm font-semibold flex items-center gap-2 ${
              statusMsg.type === 'success' 
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' 
                : 'bg-rose-50 text-rose-800 border border-rose-200'
            }`}>
              {statusMsg.type === 'success' ? <Check className="w-4 h-4 shrink-0 text-emerald-600" /> : <X className="w-4 h-4 shrink-0 text-rose-600" />}
              <span>{statusMsg.text}</span>
            </div>
          )}

          {/* Current Logo Preview */}
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 flex flex-col sm:flex-row items-center gap-4">
            <div className="relative group shrink-0">
              {logoPreview ? (
                <img 
                  src={logoPreview} 
                  alt="Logo Preview" 
                  className="w-20 h-20 rounded-2xl object-cover border-2 border-sky-400 shadow-md bg-white"
                />
              ) : (
                <div className="w-20 h-20 rounded-2xl bg-gradient-to-tr from-sky-600 to-sky-400 flex items-center justify-center text-white text-2xl font-black shadow-md border-2 border-sky-200">
                  FLD
                </div>
              )}
            </div>

            <div className="text-center sm:text-left flex-1 min-w-0">
              <span className="text-xs font-black uppercase tracking-wider text-sky-700 bg-sky-100 px-2 py-0.5 rounded-md inline-block mb-1">
                Header Live Preview
              </span>
              <div className="flex items-center gap-2 justify-center sm:justify-start">
                <span className="text-base sm:text-lg font-black text-slate-900 truncate">
                  Friends Laundry & Dry Cleaners
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {logoPreview ? 'Custom logo will appear in the top-left corner' : 'Default emblem is currently active'}
              </p>
            </div>
          </div>

          {/* Option 1: Upload from Device */}
          <div>
            <label className="block text-sm font-bold text-slate-800 mb-2">
              1. Upload Logo from Device
            </label>
            <label className="border-2 border-dashed border-sky-300 hover:border-sky-500 rounded-2xl p-5 flex flex-col items-center justify-center cursor-pointer bg-sky-50/50 hover:bg-sky-50 transition-colors">
              <Upload className="w-7 h-7 text-sky-600 mb-2" />
              <span className="text-sm font-bold text-sky-900">
                Click to browse & upload image
              </span>
              <span className="text-xs text-slate-500 mt-1">PNG, JPG, SVG, WebP (auto-resized)</span>
              <input 
                type="file" 
                accept="image/*" 
                className="hidden" 
                onChange={handleFileUpload} 
              />
            </label>
          </div>

          {/* Option 2: Choose from Preset Professional Logos */}
          <div>
            <label className="block text-sm font-bold text-slate-800 mb-2 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-amber-500" />
              <span>2. Or Choose a Ready-made Brand Logo</span>
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {presetLogos.map((p) => {
                const isSelected = logoPreview === p.svg;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setLogoPreview(p.svg)}
                    className={`p-2.5 rounded-2xl border flex flex-col items-center text-center transition-all ${
                      isSelected 
                        ? 'border-sky-600 bg-sky-50 ring-2 ring-sky-400' 
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <img src={p.svg} alt={p.name} className="w-12 h-12 rounded-xl mb-1.5 object-cover" />
                    <span className="text-[11px] font-semibold text-slate-700 line-clamp-1">{p.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-5 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3">
          {logoPreview ? (
            <button
              type="button"
              onClick={handleRemoveLogo}
              disabled={saving}
              className="flex items-center gap-1.5 px-3 py-2 text-rose-600 hover:bg-rose-50 text-xs font-bold rounded-xl transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              <span>Remove Logo</span>
            </button>
          ) : <div />}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2.5 text-sm font-semibold text-slate-600 hover:text-slate-800 rounded-xl"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveLogo}
              disabled={saving}
              className="flex items-center gap-2 px-6 py-2.5 bg-sky-600 hover:bg-sky-700 text-white text-sm font-bold rounded-xl shadow-md shadow-sky-500/20 disabled:opacity-50 transition-colors"
            >
              {saving ? (
                <span>Saving...</span>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>Save Logo</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
