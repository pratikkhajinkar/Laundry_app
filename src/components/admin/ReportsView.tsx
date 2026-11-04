import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.tsx';
import { 
  FileSpreadsheet, 
  Download, 
  Calendar, 
  Filter, 
  RefreshCw,
  Receipt,
  Truck,
  IndianRupee,
  Package
} from 'lucide-react';

export const ReportsView: React.FC = () => {
  const { token, user, t, activeShopId, setActiveShopId, shops } = useAuth();
  const [reportType, setReportType] = useState<'orders' | 'due_payments' | 'collections' | 'settlements'>('orders');
  const [selectedShopId, setSelectedShopId] = useState<string>(() => activeShopId || '');
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchReport = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.set('type', reportType);
      if (selectedShopId && selectedShopId !== 'all') {
        params.set('shop_id', selectedShopId);
      }

      const res = await fetch(`/api/reports/export?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const d = await res.json();
        setData(d.rows || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
  }, [reportType, selectedShopId]);

  const handleExportCSV = () => {
    if (data.length === 0) {
      alert('No data available to export');
      return;
    }

    const headers = Object.keys(data[0]);
    const csvRows = [
      headers.join(','),
      ...data.map(row => 
        headers.map(fieldName => {
          const val = row[fieldName] ?? '';
          return `"${String(val).replace(/"/g, '""')}"`;
        }).join(',')
      )
    ];

    const csvString = csvRows.join('\r\n');
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `friends_laundry_${reportType}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">
              {t('reports')} • Reports & Data Exports
            </h1>
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-800">
              {data.length} Records
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Real-world operational, due balance, collection and settlement audits with 1-click CSV export.
          </p>
        </div>

        <button
          type="button"
          onClick={handleExportCSV}
          disabled={data.length === 0}
          className="flex items-center gap-2 px-4 py-2.5 bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-bold rounded-xl shadow-xs transition-colors disabled:opacity-50"
        >
          <Download className="w-4 h-4" />
          <span>Export to CSV</span>
        </button>
      </div>

      {/* Shop Selector Tabs for Reports */}
      {user?.role === 'admin' && shops.length > 0 && (
        <div className="space-y-2">
          <span className="text-xs font-black uppercase tracking-wider text-slate-600 block">
            Select Branch for Report
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

      {/* Tabs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-1.5 bg-slate-200 rounded-2xl">
        {[
          { id: 'orders', label: 'Orders Report', icon: Package },
          { id: 'due_payments', label: 'Due Balances', icon: IndianRupee },
          { id: 'collections', label: 'Payment Collections', icon: Receipt },
          { id: 'settlements', label: 'Shop Settlements', icon: Truck },
        ].map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setReportType(tab.id as any)}
              className={`py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                reportType === tab.id
                  ? 'bg-white text-emerald-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-xs text-slate-500">
            <RefreshCw className="w-6 h-6 text-emerald-800 animate-spin mx-auto mb-2" />
            Loading report data...
          </div>
        ) : data.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-500">
            No records found for this report.
          </div>
        ) : (
          <div className="overflow-x-auto max-h-[600px]">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                <tr>
                  {Object.keys(data[0]).map(col => (
                    <th key={col} className="py-3 px-4 whitespace-nowrap">
                      {col.replace(/_/g, ' ')}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.map((row, i) => (
                  <tr key={i} className="hover:bg-slate-50/70">
                    {Object.keys(data[0]).map(col => (
                      <td key={col} className="py-2.5 px-4 whitespace-nowrap text-slate-800 font-medium">
                        {String(row[col] ?? '-')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
