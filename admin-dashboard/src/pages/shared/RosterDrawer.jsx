import React, { useEffect, useState } from 'react';
import { QrCode, RefreshCw } from 'lucide-react';
import { api } from '../../lib/http';
import { fmtTime } from '../../lib/format';
import {
  Badge,
  Button,
  EmptyState,
  ErrorBanner,
  Modal,
  Spinner,
  StatusBadge,
  cx,
} from '../../components/ui';

export default function RosterDrawer({ locationId, open, onClose, canVerify = false, guards = [], onChanged }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [qrToken, setQrToken] = useState(null);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ status: 'PRESENT', overtime_hours: 0, replacement_guard_id: '' });
  const [saving, setSaving] = useState(false);

  async function load() {
    if (!locationId) return;
    setLoading(true);
    setError(null);
    try {
      setData(await api(`/api/locations/${locationId}/roster`));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open && locationId) {
      setData(null);
      setQrToken(null);
      setEditing(null);
      load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, locationId]);

  async function revealQr() {
    try {
      const response = await api(`/api/locations/${locationId}/qr-token`);
      setQrToken(response.qr_token);
    } catch (err) {
      setError(err.message);
    }
  }

  async function applyVerification(row) {
    setSaving(true);
    setError(null);
    try {
      if (row.attendance_id) {
        await api(`/api/attendance/${row.attendance_id}/verify`, {
          method: 'POST',
          body: {
            status: form.status,
            overtime_hours: Number(form.overtime_hours) || 0,
            replacement_guard_id: form.replacement_guard_id || null,
          },
        });
      } else {
        const created = await api('/api/attendance/manual', {
          method: 'POST',
          body: {
            guard_id: row.guard_id,
            post_id: locationId,
            status: form.status,
            overtime_hours: Number(form.overtime_hours) || 0,
            notes: 'Supervisor roster verification',
          },
        });
        if (form.replacement_guard_id) {
          await api(`/api/attendance/${created.attendance.id}/verify`, {
            method: 'POST',
            body: { status: form.status, replacement_guard_id: form.replacement_guard_id },
          });
        }
      }
      setEditing(null);
      await load();
      onChanged?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const roster = data?.roster || [];

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title={data?.location?.name || 'Deployment roster'}
      subtitle={
        data
          ? `${data.location?.client_name || 'Client site'} · ${data.location?.zone_name || ''} · Strength ${data.present_count}/${data.required_strength}`
          : undefined
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button onClick={load}>
            <RefreshCw size={12} /> Refresh
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <ErrorBanner message={error} onDismiss={() => setError(null)} />

        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={data?.location?.computed_status === 'RED' ? 'red' : data?.location?.computed_status === 'YELLOW' ? 'yellow' : 'green'}>
            {data?.location?.computed_status || 'GREEN'} SITE
          </Badge>
          <Badge tone="neutral">
            Required {data?.required_strength ?? '—'} · Present {data?.present_count ?? 0}
          </Badge>
          <Badge tone="neutral">{data?.date || ''}</Badge>
          <div className="ml-auto flex items-center gap-2">
            <Button size="sm" onClick={revealQr}>
              <QrCode size={12} /> QR token
            </Button>
            {qrToken && (
              <code className="rounded-lg border border-line bg-panelAlt px-2 py-1 font-mono text-[10px] text-accent">
                {qrToken}
              </code>
            )}
          </div>
        </div>

        {loading && <Spinner label="Loading roster…" />}
        {!loading && roster.length === 0 && (
          <EmptyState title="No roster published" hint="Assign guards to this site to build a roster." />
        )}

        {!loading && roster.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-line">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Guard</th>
                  <th>Rank</th>
                  <th>Shift / Timing</th>
                  <th>Reporting</th>
                  <th>Attendance</th>
                  <th>Verified by</th>
                  <th>Weapon</th>
                  <th>Replacement</th>
                  {canVerify && <th />}
                </tr>
              </thead>
              <tbody>
                {roster.map((row) => (
                  <tr key={`${row.guard_id}-${row.duty_shift}`}>
                    <td>
                      <p className="font-semibold text-ink">{row.guard_name}</p>
                      <p className="text-[10px] text-muted">{row.employee_id || row.guard_id.slice(0, 8)}</p>
                    </td>
                    <td>{row.guard_rank || '—'}</td>
                    <td>
                      <p className="font-medium">{row.duty_shift}</p>
                      <p className="font-mono text-[10px] text-muted">{row.duty_timing}</p>
                    </td>
                    <td className="font-mono">{fmtTime(row.attendance_time)}</td>
                    <td>
                      <StatusBadge status={row.attendance_status} />
                    </td>
                    <td>
                      {row.verification_source ? (
                        <Badge tone={row.verification_source === 'APP_GPS_QR' ? 'green' : 'info'}>
                          {row.verification_source.replaceAll('_', ' ')}
                        </Badge>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="font-mono">{row.weapon_serial || '—'}</td>
                    <td>{row.replacement_guard_name || '—'}</td>
                    {canVerify && (
                      <td>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setEditing(row.guard_id);
                            setForm({
                              status: row.attendance_status === 'ABSENT' ? 'PRESENT' : row.attendance_status,
                              overtime_hours: 0,
                              replacement_guard_id: row.replacement_guard_id || '',
                            });
                          }}
                        >
                          Verify
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {editing && (
          <div className="rounded-xl border border-accent/30 bg-accent/5 p-3">
            <p className="mb-2 text-[11px] font-bold text-ink">
              Verify attendance · {roster.find((row) => row.guard_id === editing)?.guard_name}
            </p>
            <div className="grid gap-2 sm:grid-cols-4">
              <select
                className="input"
                value={form.status}
                onChange={(event) => setForm({ ...form, status: event.target.value })}
              >
                {['PRESENT', 'LATE', 'ABSENT', 'EARLY_DEPARTURE', 'ON_LEAVE', 'ON_REST', 'FLAGGED_ANOMALY'].map(
                  (status) => (
                    <option key={status} value={status}>
                      {status.replaceAll('_', ' ')}
                    </option>
                  ),
                )}
              </select>
              <input
                type="number"
                min="0"
                step="0.5"
                className="input"
                placeholder="Overtime hours"
                value={form.overtime_hours}
                onChange={(event) => setForm({ ...form, overtime_hours: event.target.value })}
              />
              <select
                className="input"
                value={form.replacement_guard_id}
                onChange={(event) => setForm({ ...form, replacement_guard_id: event.target.value })}
              >
                <option value="">No replacement</option>
                {guards.map((guard) => (
                  <option key={guard.id} value={guard.id}>
                    {guard.full_name}
                  </option>
                ))}
              </select>
              <div className="flex gap-2">
                <Button
                  variant="primary"
                  className={cx('flex-1')}
                  disabled={saving}
                  onClick={() => applyVerification(roster.find((row) => row.guard_id === editing))}
                >
                  {saving ? 'Saving…' : 'Apply'}
                </Button>
                <Button variant="ghost" onClick={() => setEditing(null)}>
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
