import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/http';
import { EmptyState, ErrorBanner, Spinner } from '../../components/ui';
import TrendChart from '../../components/ui/TrendChart';

function dayLabel(iso) {
  const parsed = new Date(`${iso}T00:00:00`);
  return parsed.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

function rangeLabel(trend) {
  if (!trend?.start_date || !trend?.end_date) return 'This month';
  const first = new Date(`${trend.start_date}T00:00:00`);
  const last = new Date(`${trend.end_date}T00:00:00`);
  const fmt = (value) =>
    value.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  return `${fmt(first)} – ${fmt(last)}`;
}

const selectClass = 'input w-full';

export default function GuardTrendPanel({ role, locations = [], guards = [], zones = [] }) {
  const isSupervisor = role === 'SUPERVISOR';
  const [zoneId, setZoneId] = useState('');
  const [siteId, setSiteId] = useState('');
  const [guardId, setGuardId] = useState('');
  const [trend, setTrend] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const siteOptions = useMemo(
    () => (isSupervisor || !zoneId ? locations : locations.filter((site) => site.zone_id === zoneId)),
    [locations, zoneId, isSupervisor],
  );

  const guardOptions = useMemo(
    () => (siteId ? guards.filter((guard) => guard.assigned_post_id === siteId) : []),
    [guards, siteId],
  );

  const selectedGuard = useMemo(
    () => guards.find((guard) => guard.id === guardId) || null,
    [guards, guardId],
  );
  const selectedSite = useMemo(
    () => locations.find((site) => site.id === siteId) || null,
    [locations, siteId],
  );

  useEffect(() => {
    if (!guardId) {
      setTrend(null);
      setError(null);
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    api(`/api/attendance/trend?guard_id=${encodeURIComponent(guardId)}`)
      .then((data) => {
        if (!cancelled) setTrend(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [guardId]);

  function handleZoneChange(value) {
    setZoneId(value);
    setSiteId('');
    setGuardId('');
  }

  function handleSiteChange(value) {
    setSiteId(value);
    setGuardId('');
  }

  const series = trend?.series || [];
  const chartLabels = series.map((item) => dayLabel(item.date));
  const chartData = series.map((item) => item.count);
  const guardName = trend?.guard_name || selectedGuard?.full_name;
  const subtitle = guardName
    ? `${guardName}${selectedSite ? ` · ${selectedSite.name}` : ''} · daily check-ins`
    : 'Select a site and guard to see daily check-ins';

  return (
    <div className="rounded-2xl border border-line bg-white p-5 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3 pb-4">
        <div>
          <h3 className="text-sm font-bold text-slate-800">Check In Trends</h3>
          <p className="mt-0.5 text-[11px] text-muted">{subtitle}</p>
        </div>
        <span className="text-xs font-medium text-slate-500">{rangeLabel(trend)}</span>
      </div>

      <div className="grid gap-3 pb-4 sm:grid-cols-2 lg:grid-cols-3">
        {!isSupervisor && (
          <label className="block">
            <span className="label">Zone</span>
            <select
              className={selectClass}
              value={zoneId}
              onChange={(event) => handleZoneChange(event.target.value)}
            >
              <option value="">All zones</option>
              {zones.map((zone) => (
                <option key={zone.id} value={zone.id}>
                  {zone.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="block">
          <span className="label">Site</span>
          <select
            className={selectClass}
            value={siteId}
            disabled={!isSupervisor && !zoneId}
            onChange={(event) => handleSiteChange(event.target.value)}
          >
            <option value="">
              {!isSupervisor && !zoneId ? 'Select a zone first' : 'Select a site'}
            </option>
            {siteOptions.map((site) => (
              <option key={site.id} value={site.id}>
                {site.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="label">Guard</span>
          <select
            className={selectClass}
            value={guardId}
            disabled={!siteId}
            onChange={(event) => setGuardId(event.target.value)}
          >
            <option value="">{siteId ? 'Select a guard' : 'Select a site first'}</option>
            {guardOptions.map((guard) => (
              <option key={guard.id} value={guard.id}>
                {guard.full_name}
                {guard.employee_id ? ` · ${guard.employee_id}` : ''}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      {loading && (
        <div className="py-6">
          <Spinner label="Loading check-in history…" />
        </div>
      )}

      {!loading && !error && !guardId && (
        <EmptyState
          title="No guard selected"
          hint={
            isSupervisor
              ? 'Pick a site in your zone, then a guard, to plot their check-in trend.'
              : 'Pick a zone, then a site, then a guard to plot their check-in trend.'
          }
        />
      )}

      {!loading && !error && guardId && chartData.length > 0 && (
        <TrendChart
          data={chartData}
          labels={chartLabels}
          unit=""
          pointLabel="check-ins"
          height={240}
        />
      )}

      {!loading && !error && guardId && chartData.length === 0 && (
        <EmptyState title="No check-ins recorded" hint="This guard has no punches in the selected period." />
      )}
    </div>
  );
}
