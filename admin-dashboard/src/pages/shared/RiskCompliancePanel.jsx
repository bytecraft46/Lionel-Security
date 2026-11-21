import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { api } from '../../lib/http';
import { fmtDate, fmtDateTime } from '../../lib/format';
import { Badge, Button, EmptyState, ErrorBanner, Kpi, Panel } from '../../components/ui';

export default function RiskCompliancePanel({ overview, broadcasts = [], onRefresh }) {
  const [overdue, setOverdue] = useState({ alerts: [], grace_minutes: 5 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await api('/api/attendance/overdue');
      setOverdue({
        alerts: data.alerts || [],
        grace_minutes: data.grace_minutes ?? 5,
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const kpis = overview?.kpis || {};
  const attention = overview?.attention || [];
  const flagged = attention.filter((item) => item.kind === 'FLAGGED_ATTENDANCE');
  const pendingActions = broadcasts.reduce(
    (total, broadcast) => total + (broadcast.pending_count || 0),
    0,
  );
  const criticalUnack = kpis.unacknowledged_critical || 0;
  const overdueAlerts = overdue.alerts;

  function refresh() {
    load();
    onRefresh?.();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-800">Risk & Compliance</h2>
          <p className="text-xs text-muted">
            Attendance integrity and command acknowledgement — {fmtDate(overview?.date)}
          </p>
        </div>
        <Button variant="ghost" onClick={refresh} className="border border-line bg-white hover:bg-slate-50">
          <RefreshCw size={13} /> Refresh
        </Button>
      </div>

      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="Overdue Check-ins"
          value={overdueAlerts.length}
          hint={`${overdue.grace_minutes}+ min past duty start`}
          tone={overdueAlerts.length ? 'red' : 'green'}
        />
        <Kpi
          label="Critical Unacknowledged"
          value={criticalUnack}
          hint="Broadcast recipients"
          tone={criticalUnack ? 'red' : 'green'}
        />
        <Kpi
          label="Actions Pending"
          value={pendingActions}
          hint="Broadcast compliance"
          tone={pendingActions ? 'yellow' : 'green'}
        />
        <Kpi
          label="Flagged Attendance"
          value={flagged.length}
          hint="Geofence / mock GPS punches today"
          tone={flagged.length ? 'red' : 'neutral'}
        />
      </div>

      <Panel
        title="Overdue check-ins"
        subtitle="Guards past their duty start without a verified punch"
        actions={<Badge tone={overdueAlerts.length ? 'red' : 'green'}>{overdueAlerts.length}</Badge>}
      >
        {loading ? (
          <p className="text-[11px] text-muted">Loading attendance compliance…</p>
        ) : overdueAlerts.length === 0 ? (
          <EmptyState title="No overdue check-ins" hint="Every guard on duty has punched in on time." />
        ) : (
          <div className="max-h-80 overflow-auto rounded-xl border border-line">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Guard</th>
                  <th>Site / Zone</th>
                  <th>Duty window</th>
                  <th className="text-right">Late</th>
                </tr>
              </thead>
              <tbody>
                {overdueAlerts.map((alert) => (
                  <tr key={alert.guard_id}>
                    <td>
                      <span className="font-semibold">{alert.guard_name}</span>
                      <span className="block text-[10px] text-muted">{alert.employee_id || 'No employee ID'}</span>
                    </td>
                    <td className="text-muted">
                      {alert.post_name || 'Unassigned post'}
                      <span className="block text-[10px]">{alert.zone_name || '—'}</span>
                    </td>
                    <td className="whitespace-nowrap font-mono text-[10px]">
                      {alert.duty_start && alert.duty_end
                        ? `${alert.duty_start}–${alert.duty_end}`
                        : '—'}
                    </td>
                    <td className="text-right">
                      <Badge tone="red">{alert.minutes_late}m</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel
        title="Broadcast compliance"
        subtitle="Acknowledgement and action recorded against each command broadcast"
        actions={<Badge tone="neutral">{broadcasts.length} broadcasts</Badge>}
      >
        {broadcasts.length === 0 ? (
          <EmptyState title="No command broadcasts" />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-line">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Broadcast</th>
                  <th>Priority</th>
                  <th>Issued</th>
                  <th>Received</th>
                  <th>Action taken</th>
                  <th className="text-right">Pending</th>
                </tr>
              </thead>
              <tbody>
                {broadcasts.map((broadcast) => (
                  <tr key={broadcast.id}>
                    <td>
                      <span className="font-semibold">{broadcast.title}</span>
                      <span className="block text-[10px] text-muted">
                        {(broadcast.category || '').replaceAll('_', ' ')} ·{' '}
                        {broadcast.target_scope === 'ALL'
                          ? 'All zones'
                          : `${(broadcast.target_zone_ids || []).length} zone(s)`}
                      </span>
                    </td>
                    <td>
                      <Badge tone={broadcast.priority === 'CRITICAL' ? 'red' : 'neutral'}>
                        {broadcast.priority}
                      </Badge>
                    </td>
                    <td className="whitespace-nowrap font-mono text-[10px] text-muted">
                      {fmtDateTime(broadcast.created_at)}
                    </td>
                    <td className="font-mono">
                      {broadcast.received_count}/{broadcast.recipient_count}
                    </td>
                    <td className="font-mono">
                      {broadcast.action_taken_count}/{broadcast.recipient_count}
                    </td>
                    <td className="text-right">
                      <Badge tone={broadcast.pending_count ? 'yellow' : 'green'}>
                        {broadcast.pending_count}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
