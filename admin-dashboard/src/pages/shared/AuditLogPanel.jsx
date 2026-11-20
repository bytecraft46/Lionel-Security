import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { api } from '../../lib/http';
import { fmtDateTime } from '../../lib/format';
import { Badge, Button, EmptyState, ErrorBanner, Panel } from '../../components/ui';

export default function AuditLogPanel() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await api('/api/audit-logs?limit=50');
      setRows(data.audit_logs || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <Panel
      title="Audit trail"
      subtitle="Account provisioning, attendance and command actions"
      actions={
        <Button size="sm" variant="ghost" onClick={load}>
          <RefreshCw size={12} /> Refresh
        </Button>
      }
    >
      <ErrorBanner message={error} onDismiss={() => setError(null)} />
      {loading ? (
        <p className="text-[11px] text-muted">Loading audit trail…</p>
      ) : rows.length === 0 ? (
        <EmptyState title="No audit entries yet" />
      ) : (
        <div className="max-h-[420px] overflow-auto rounded-xl border border-line">
          <table className="table-base">
            <thead>
              <tr>
                <th>When</th>
                <th>Action</th>
                <th>Entity</th>
                <th>Role</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="whitespace-nowrap font-mono text-[10px] text-muted">
                    {fmtDateTime(row.created_at)}
                  </td>
                  <td className="font-semibold">{row.action.replaceAll('_', ' ')}</td>
                  <td className="text-muted">{row.entity_type || '—'}</td>
                  <td>
                    <Badge tone={row.role === 'CEO' ? 'info' : 'neutral'}>
                      {(row.role || 'SYSTEM').replaceAll('_', ' ')}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
