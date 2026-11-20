import React, { useState } from 'react';
import { api } from '../../lib/http';
import { fmtDateTime } from '../../lib/format';
import { Badge, Button, EmptyState, ErrorBanner, StatusBadge } from '../../components/ui';

export default function IncidentPanel({ incidents = [], onChanged, compact, canManage = true }) {
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);

  async function update(incident, status) {
    setBusy(incident.id);
    setError(null);
    try {
      await api(`/api/incidents/${incident.id}`, {
        method: 'PUT',
        body: { status },
      });
      onChanged?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  if (!incidents.length) return <EmptyState title="No incidents logged" />;

  return (
    <div className="space-y-2">
      <ErrorBanner message={error} onDismiss={() => setError(null)} />
      <ul className="divide-y divide-line/60">
        {incidents.slice(0, compact ? 5 : 100).map((incident) => (
          <li key={incident.id} className="py-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge
                tone={
                  incident.incident_type === 'FIRE' ||
                  incident.incident_type === 'ATTEMPTED_INTRUSION' ||
                  incident.incident_type === 'WEAPON_INCIDENT'
                    ? 'red'
                    : 'yellow'
                }
              >
                {incident.incident_type.replaceAll('_', ' ')}
              </Badge>
              <StatusBadge status={incident.status} />
              <span className="ml-auto font-mono text-[10px] text-muted">
                {fmtDateTime(incident.occurred_at)}
              </span>
            </div>
            <p className="mt-1 text-[11px] font-semibold text-ink">
              {incident.post_name} <span className="font-normal text-muted">· {incident.zone_name}</span>
            </p>
            <p className="text-[10px] text-muted">
              {incident.immediate_action || 'No immediate action recorded'}
            </p>
            {incident.reported_by_name && (
              <p className="text-[10px] text-muted/70">Reported by {incident.reported_by_name}</p>
            )}
            {canManage && incident.status !== 'RESOLVED' && (
              <div className="mt-1.5 flex gap-2">
                {incident.status === 'OPEN' && (
                  <Button size="sm" variant="ghost" disabled={busy === incident.id} onClick={() => update(incident, 'ACKNOWLEDGED')}>
                    Acknowledge
                  </Button>
                )}
                <Button size="sm" variant="primary" disabled={busy === incident.id} onClick={() => update(incident, 'RESOLVED')}>
                  Mark resolved
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
