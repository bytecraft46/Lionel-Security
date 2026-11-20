import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { api } from '../../lib/http';
import { useSocketEvent } from '../../lib/socket';
import { fmtTime } from '../../lib/format';
import {
  Badge,
  Button,
  EmptyState,
  ErrorBanner,
  Kpi,
  Panel,
  Spinner,
} from '../../components/ui';

const STATUS_OPTIONS = [
  { value: 'ALL', label: 'All guards' },
  { value: 'ON_DUTY', label: 'Checked in (on duty)' },
  { value: 'CHECKED_OUT', label: 'Checked out' },
  { value: 'NOT_CHECKED_IN', label: 'Not checked in' },
  { value: 'FLAGGED', label: 'Flagged punches' },
];

function todayISO() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate(),
  ).padStart(2, '0')}`;
}

function punchTone(punch) {
  if (punch.status === 'FLAGGED_ANOMALY') return 'red';
  if (punch.status === 'LATE' || punch.status === 'EARLY_DEPARTURE') return 'yellow';
  return 'green';
}

function PunchCell({ punch, emptyLabel }) {
  if (!punch) return <span className="text-[10px] text-muted">{emptyLabel}</span>;
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-mono text-[11px] font-bold tabular-nums text-ink">
        {fmtTime(punch.time)}
      </span>
      <div className="flex flex-wrap items-center gap-1">
        <Badge tone={punchTone(punch)}>{punch.status.replaceAll('_', ' ')}</Badge>
        {!punch.is_geofence_valid && <Badge tone="red">Out of fence</Badge>}
        {punch.is_mock_location && <Badge tone="red">Mock GPS</Badge>}
      </div>
      <span className="text-[10px] text-muted">
        {(punch.source || '').replaceAll('_', ' ')}
        {punch.distance_meters != null ? ` · ${punch.distance_meters} m` : ''}
      </span>
    </div>
  );
}

function statusBadge(row) {
  if (row.flagged) return <Badge tone="red">FLAGGED</Badge>;
  if (row.status === 'ON_DUTY') return <Badge tone="green">ON DUTY</Badge>;
  if (row.status === 'CHECKED_OUT') return <Badge tone="info">CHECKED OUT</Badge>;
  return <Badge tone="yellow">NOT CHECKED IN</Badge>;
}

function formatHours(hours) {
  if (hours == null) return '—';
  const whole = Math.floor(hours);
  const minutes = Math.round((hours - whole) * 60);
  return `${whole}h ${String(minutes).padStart(2, '0')}m`;
}

export default function CheckInOutPanel({ role, zones = [], locations = [] }) {
  const [date, setDate] = useState(todayISO);
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [zoneFilter, setZoneFilter] = useState('');
  const [siteFilter, setSiteFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api(`/api/attendance/register?date=${date}`);
      setRows(data.rows || []);
      setSummary(data.summary || {});
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    load();
  }, [load]);

  useSocketEvent('ATTENDANCE_PUNCHED', () => load());

  const siteOptions = useMemo(
    () => locations.filter((site) => !zoneFilter || site.zone_id === zoneFilter),
    [locations, zoneFilter],
  );

  const visibleRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (zoneFilter && row.zone_id !== zoneFilter) return false;
      if (siteFilter && row.post_id !== siteFilter) return false;
      if (statusFilter === 'FLAGGED' && !row.flagged) return false;
      if (statusFilter !== 'ALL' && statusFilter !== 'FLAGGED' && row.status !== statusFilter) {
        return false;
      }
      if (!term) return true;
      return [
        row.guard_name,
        row.employee_id,
        row.phone_number,
        row.zone_name,
        row.post_name,
        row.area,
        row.client_name,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term));
    });
  }, [rows, zoneFilter, siteFilter, statusFilter, search]);

  const scopeLabel =
    role === 'SUPERVISOR' ? 'Guards in your zone(s)' : 'All guards across every zone';

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
        <Kpi label="Guards in scope" value={summary.total ?? '—'} />
        <Kpi label="Checked in / on duty" value={summary.on_duty ?? '—'} tone="green" />
        <Kpi label="Checked out" value={summary.checked_out ?? '—'} />
        <Kpi
          label="Not checked in"
          value={summary.not_checked_in ?? '—'}
          tone={(summary.not_checked_in || 0) > 0 ? 'yellow' : 'green'}
        />
        <Kpi
          label="Flagged punches"
          value={summary.flagged ?? '—'}
          tone={(summary.flagged || 0) > 0 ? 'red' : 'green'}
        />
      </div>

      <Panel
        title="Check-in / check-out register"
        subtitle={scopeLabel}
        actions={
          <Button size="sm" variant="ghost" onClick={load}>
            <RefreshCw size={12} /> Refresh
          </Button>
        }
      >
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-5">
          <label className="block">
            <span className="label">Date</span>
            <input
              type="date"
              className="input"
              value={date}
              max={todayISO()}
              onChange={(event) => setDate(event.target.value || todayISO())}
            />
          </label>
          <label className="block">
            <span className="label">Zone</span>
            <select
              className="input"
              value={zoneFilter}
              onChange={(event) => {
                setZoneFilter(event.target.value);
                setSiteFilter('');
              }}
            >
              <option value="">All zones</option>
              {zones.map((zone) => (
                <option key={zone.id} value={zone.id}>
                  {zone.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="label">Site</span>
            <select
              className="input"
              value={siteFilter}
              onChange={(event) => setSiteFilter(event.target.value)}
            >
              <option value="">All sites</option>
              {siteOptions.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="label">Status</span>
            <select
              className="input"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="label">Search</span>
            <input
              className="input"
              placeholder="Guard, ID, phone or site"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
        </div>

        <div className="mt-3">
          <ErrorBanner message={error} onDismiss={() => setError(null)} />
        </div>

        {loading ? (
          <div className="py-8">
            <Spinner label="Loading attendance register…" />
          </div>
        ) : visibleRows.length === 0 ? (
          <EmptyState
            title="No guards match this view"
            hint="Try another date, site or status filter."
          />
        ) : (
          <div className="mt-3 max-h-[68vh] overflow-auto rounded-xl border border-line">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Guard</th>
                  <th>Zone / Area</th>
                  <th>Site</th>
                  <th>Check-in</th>
                  <th>Check-out</th>
                  <th>Hours</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => (
                  <tr key={row.guard_id}>
                    <td>
                      <p className="text-[11px] font-semibold text-ink">{row.guard_name}</p>
                      <p className="text-[10px] text-muted">
                        {row.employee_id || 'No ID'} · {row.phone_number || '—'}
                      </p>
                    </td>
                    <td>
                      <p className="text-[11px] text-ink">{row.zone_name || '—'}</p>
                      <p className="text-[10px] text-muted">{row.area || '—'}</p>
                    </td>
                    <td>
                      <p className="text-[11px] text-ink">{row.post_name || 'Unassigned'}</p>
                      <p className="text-[10px] text-muted">{row.client_name || '—'}</p>
                    </td>
                    <td>
                      <PunchCell punch={row.check_in} emptyLabel="Not checked in" />
                    </td>
                    <td>
                      <PunchCell punch={row.check_out} emptyLabel="—" />
                    </td>
                    <td className="font-mono text-[11px] tabular-nums">
                      {formatHours(row.hours)}
                    </td>
                    <td>{statusBadge(row)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-2 text-[10px] text-muted">
          {visibleRows.length} of {rows.length} guards shown · {date}
        </p>
      </Panel>
    </div>
  );
}
