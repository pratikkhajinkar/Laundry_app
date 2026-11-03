import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.tsx';
import type { AuditLog } from '../../types/index.ts';
import { ShieldCheck, RefreshCw, Clock, User } from 'lucide-react';

export const AuditLogsView: React.FC = () => {
  const { token, t } = useAuth();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLogs = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/audit-logs', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const d = await res.json();
        setLogs(d.logs || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">
              Audit Logs & Security Trail
            </h1>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-800">
              {logs.length} Events Logged
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Immutable historical record of logins, order assignments, status updates, photo uploads, payments, and settlements.
          </p>
        </div>

        <button
          type="button"
          onClick={fetchLogs}
          className="p-2.5 text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors border border-slate-200"
          title="Refresh"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        {logs.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            No audit records yet.
          </div>
        ) : (
          <div className="divide-y divide-slate-100 max-h-[600px] overflow-y-auto">
            {logs.map(log => (
              <div key={log.id} className="p-4 hover:bg-slate-50 flex items-start justify-between gap-4 text-xs">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded text-[11px] border border-emerald-200">
                      {log.action}
                    </span>
                    <span className="text-slate-500 uppercase text-[10px] font-semibold">
                      {log.entity_type} • {log.entity_id ? log.entity_id.slice(0, 8) : ''}
                    </span>
                  </div>

                  <div className="text-slate-700 font-medium">
                    {log.user_name ? (
                      <span>By <strong>{log.user_name}</strong> ({log.user_role})</span>
                    ) : (
                      <span>System event</span>
                    )}
                  </div>

                  {log.details && (
                    <p className="text-[11px] text-slate-500 font-mono bg-slate-100 p-1.5 rounded-sm overflow-x-auto max-w-xl">
                      {log.details}
                    </p>
                  )}
                </div>

                <div className="text-right text-[11px] text-slate-400 whitespace-nowrap flex items-center gap-1 shrink-0">
                  <Clock className="w-3 h-3 text-slate-300" />
                  <span>{new Date(log.created_at).toLocaleString('en-IN')}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
