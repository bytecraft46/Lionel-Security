import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ChevronDown, Download, RefreshCw, ShieldAlert } from 'lucide-react';
import { api, downloadFile } from '../../lib/http';
import { fmtDate, toneForStatus } from '../../lib/format';
import {
  Badge,
  Button,
  EmptyState,
  ErrorBanner,
  Kpi,
  Panel,
  ProgressBar,
  RagDot,
  Spinner,
  StatusBadge,
} from '../../components/ui';
import RosterDrawer from '../shared/RosterDrawer';
import GuardZoneMap from '../../components/map/GuardZoneMap';
import IncidentPanel from '../ops/IncidentPanel';
import ArmouryPanel from '../ops/ArmouryPanel';
import TeamPanel from '../shared/TeamPanel';
import AuditLogPanel from '../shared/AuditLogPanel';
import CheckInOutPanel from '../shared/CheckInOutPanel';
import OverdueCheckInAlerts from '../shared/OverdueCheckInAlerts';

export default function CEODashboard({ tab }) {
  const [overview, setOverview] = useState(null);
  const [weapons, setWeapons] = useState([]);
  const [guards, setGuards] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [broadcasts, setBroadcasts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [rosterSite, setRosterSite] = useState(null);
  const [showLeave, setShowLeave] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [overviewData, weaponData, incidentData, broadcastData, guardData] = await Promise.all([
        api('/api/dashboard/overview'),
        api('/api/weapons'),
        api('/api/incidents'),
        api('/api/broadcasts'),
        api('/api/guards'),
      ]);
      setOverview(overviewData);
      setWeapons(weaponData.weapons || []);
      setIncidents(incidentData.incidents || []);
      setBroadcasts(broadcastData.broadcasts || []);
      setGuards(guardData.guards || []);
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
  const locations = overview?.locations || [];
  const zones = overview?.zones || [];
  const attention = overview?.attention || [];
  const leaveRows = overview?.leave || [];
  const expiring = overview?.expiring || {};

  const weaponsByLocation = useMemo(
    () =>
      weapons
        .filter((weapon) => weapon.armoury_status === 'ISSUED')
        .reduce((accumulator, weapon) => {
          const key = weapon.assigned_post_name || 'Unassigned';
          accumulator[key] = (accumulator[key] || 0) + 1;
          return accumulator;
        }, {}),
    [weapons],
  );

  const activeEmergencies = incidents.filter((incident) => incident.status !== 'RESOLVED');
  const complaints = incidents.filter((incident) => incident.incident_type === 'CLIENT_COMPLAINT');
  const unacknowledged = broadcasts.filter(
    (broadcast) => broadcast.priority === 'CRITICAL' && broadcast.not_received_count > 0,
  );

  if (loading) {
    return (
      <div className="p-6">
        <Spinner label="Loading executive posture…" />
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 lg:p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-black uppercase tracking-[0.16em] text-ink">
            Executive Posture & Risk Command
          </h2>
          <p className="text-[11px] text-muted">
            {fmtDate(overview?.date)} · 30–60 second decision view across {' '}
            {kpis.total_locations ?? 0} deployment locations
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={load}>
            <RefreshCw size={12} /> Refresh
          </Button>
          <Button
            variant="primary"
            onClick={() =>
              downloadFile(
                '/api/reports/sitrep?format=text',
                `Lionel-SITREP-${overview?.date || 'today'}.txt`,
              ).catch((err) => setError(err.message))
            }
          >
            <Download size={12} /> Export daily SITREP
          </Button>
        </div>
      </div>

      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      <OverdueCheckInAlerts />

      {(kpis.active_emergencies > 0 || kpis.vacant_posts > 0) && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5">
          <ShieldAlert size={16} className="text-rose-500" />
          <p className="text-[11px] font-bold uppercase tracking-wide text-rose-700">
            Management attention: {kpis.active_emergencies || 0} active emergenc
            {(kpis.active_emergencies || 0) === 1 ? 'y' : 'ies'} · {kpis.vacant_posts || 0} vacant post
            {(kpis.vacant_posts || 0) === 1 ? '' : 's'}
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-6">
        <Kpi label="Total guards" value={kpis.total_guards ?? '—'} hint="Registered strength" />
        <Kpi label="Deployment sites" value={kpis.total_locations ?? '—'} hint="Active locations" />
        <Kpi label="Guards on duty" value={kpis.on_duty ?? '—'} tone="green" />
        <Kpi label="Absent" value={kpis.absent ?? '—'} tone={(kpis.absent || 0) > 0 ? 'yellow' : 'neutral'} />
        <Kpi
          label="On leave"
          value={kpis.on_leave ?? '—'}
          hint="Click to list names"
          onClick={() => setShowLeave((value) => !value)}
        />
        <Kpi label="On rest" value={kpis.on_rest ?? '—'} />
        <Kpi label="Vacant posts" value={kpis.vacant_posts ?? '—'} tone={(kpis.vacant_posts || 0) > 0 ? 'red' : 'green'} />
        <Kpi label="Weapons issued" value={kpis.weapons_issued ?? '—'} />
        <Kpi label="Weapons in armoury" value={kpis.weapons_in_armoury ?? '—'} />
        <Kpi
          label="Active emergencies"
          value={kpis.active_emergencies ?? '—'}
          tone={(kpis.active_emergencies || 0) > 0 ? 'red' : 'green'}
        />
        <Kpi label="Zones in red" value={kpis.zones_in_red ?? '—'} tone={(kpis.zones_in_red || 0) > 0 ? 'red' : 'green'} />
        <Kpi
          label="Unacked critical"
          value={kpis.unacknowledged_critical ?? '—'}
          tone={(kpis.unacknowledged_critical || 0) > 0 ? 'yellow' : 'green'}
        />
      </div>

      {showLeave && (
        <Panel title="Guards on leave today" bodyClassName="p-3">
          {leaveRows.length === 0 ? (
            <p className="text-[11px] text-muted">No approved leave today.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {leaveRows.map((row) => (
                <Badge key={row.id} tone={row.leave_type === 'WEEKLY_REST' ? 'info' : 'yellow'}>
                  {row.guard_name} · {row.leave_type.replaceAll('_', ' ')}
                </Badge>
              ))}
            </div>
          )}
        </Panel>
      )}

      {(tab === 'posture' || !tab) && (
        <>
          <Panel
            title="Guard deployment map"
            subtitle="Guards plotted by zone colour · hover a marker for name, supervisor and location"
            actions={<Badge tone="neutral">{guards.length} guards · {zones.length} zones</Badge>}
          >
            <GuardZoneMap guards={guards} locations={locations} zones={zones} />
          </Panel>

          <Panel
            title="Zone & location status matrix"
            subtitle="Click any location for the read-only deployment roster"
            actions={<Badge tone="neutral">{locations.length} sites</Badge>}
          >
            <div className="space-y-3">
              {zones.map((zone) => (
                <div key={zone.id} className="rounded-xl border border-line">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-panelAlt/50 px-3 py-2">
                    <div>
                      <p className="text-[11px] font-bold text-ink">{zone.name}</p>
                      <p className="text-[10px] text-muted">
                        {zone.supervisor_name || 'Unassigned'} · {zone.present_count}/{zone.required_strength} deployed
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-28">
                        <ProgressBar
                          value={zone.required_strength ? zone.present_count / zone.required_strength : 0}
                          tone={zone.status === 'RED' ? 'red' : zone.status === 'YELLOW' ? 'yellow' : 'green'}
                        />
                      </div>
                      <RagDot status={zone.status} />
                    </div>
                  </div>
                  <div className="grid gap-px bg-line/40 sm:grid-cols-2 xl:grid-cols-3">
                    {locations
                      .filter((site) => site.zone_id === zone.id)
                      .map((site) => (
                        <button
                          key={site.id}
                          type="button"
                          onClick={() => setRosterSite(site)}
                          className="flex items-center justify-between gap-2 bg-panel px-3 py-2 text-left hover:bg-panelAlt/70"
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-[11px] font-semibold text-ink">{site.name}</span>
                            <span className="block truncate text-[10px] text-muted">
                              {site.client_name || 'Client site'}
                            </span>
                          </span>
                          <span className="flex flex-shrink-0 items-center gap-2">
                            <span className="font-mono text-[10px] text-muted">
                              {site.present_count}/{site.required_strength}
                            </span>
                            <RagDot status={site.computed_status} />
                          </span>
                        </button>
                      ))}
                  </div>
                </div>
              ))}
            </div>
          </Panel>

          <div className="grid gap-4 lg:grid-cols-3">
            <Panel title="Locations requiring management attention" className="lg:col-span-2">
              {attention.length === 0 && <EmptyState title="No attention flags" />}
              <ul className="divide-y divide-line/60">
                {attention.slice(0, 8).map((item, index) => (
                  <li key={`${item.kind}-${index}`} className="flex items-start justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-[11px] font-semibold text-ink">{item.location_name}</p>
                      <p className="text-[10px] text-muted">{item.reason}</p>
                    </div>
                    <Badge tone={toneForStatus(item.severity)}>{item.kind.replaceAll('_', ' ')}</Badge>
                  </li>
                ))}
              </ul>
            </Panel>

            <Panel title="Weapons issued by location" subtitle={`${weaponsByLocation && Object.keys(weaponsByLocation).length} locations armed`}>
              {Object.keys(weaponsByLocation).length === 0 && <EmptyState title="No weapons issued" />}
              <ul className="space-y-1.5">
                {Object.entries(weaponsByLocation).map(([name, count]) => (
                  <li key={name} className="flex items-center justify-between text-[11px]">
                    <span className="truncate text-muted">{name}</span>
                    <span className="font-mono font-bold text-ink">{count}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          </div>
        </>
      )}

      {tab === 'checkins' && (
        <CheckInOutPanel role="CEO" zones={zones} locations={locations} />
      )}

      {(tab === 'zones' || tab === 'risk') && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Panel
            className={tab === 'zones' ? 'lg:col-span-3' : 'lg:col-span-2'}
            title="Deployment register"
            subtitle="Every active site with verified strength"
          >
            <div className="overflow-x-auto rounded-xl border border-line">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Location</th>
                    <th>Client</th>
                    <th>Zone</th>
                    <th>Supervisor</th>
                    <th>Present / Required</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {locations.map((site) => (
                    <tr key={site.id}>
                      <td className="font-semibold">{site.name}</td>
                      <td className="text-muted">{site.client_name || '—'}</td>
                      <td>{site.zone_name}</td>
                      <td>{site.supervisor_name || '—'}</td>
                      <td className="font-mono">
                        {site.present_count}/{site.required_strength}
                      </td>
                      <td>
                        <StatusBadge status={site.computed_status} />
                      </td>
                      <td>
                        <Button size="sm" variant="ghost" onClick={() => setRosterSite(site)}>
                          Roster
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          {tab === 'risk' && (
            <Panel title="Expiry & compliance risk" subtitle="Within 30 days or unactioned">
              <div className="space-y-3">
                <div>
                  <p className="label">CNIC expiry</p>
                  {(expiring.cnic || []).length === 0 ? (
                    <p className="text-[10px] text-muted">None within 30 days.</p>
                  ) : (
                    <ul className="space-y-1">
                      {expiring.cnic.map((row) => (
                        <li key={row.guard_id} className="flex justify-between text-[10px]">
                          <span className="text-ink">{row.guard_name}</span>
                          <span className="font-mono text-amber-600">{row.expiry}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="stat-divider" />
                <div>
                  <p className="label">Weapon licences</p>
                  {(expiring.weapon_licences || []).length === 0 ? (
                    <p className="text-[10px] text-muted">All licences current.</p>
                  ) : (
                    <ul className="space-y-1">
                      {expiring.weapon_licences.map((row) => (
                        <li key={row.weapon_id} className="flex justify-between text-[10px]">
                          <span className="text-ink">{row.serial_number}</span>
                          <span className="font-mono text-amber-600">{row.expiry}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="stat-divider" />
                <div>
                  <p className="label">Unacknowledged critical broadcasts</p>
                  {unacknowledged.length === 0 ? (
                    <p className="text-[10px] text-muted">All critical broadcasts acknowledged.</p>
                  ) : (
                    <ul className="space-y-1">
                      {unacknowledged.map((broadcast) => (
                        <li key={broadcast.id} className="text-[10px]">
                          <span className="font-semibold text-ink">{broadcast.title}</span>
                          <span className="ml-1 text-rose-600">
                            ({broadcast.not_received_count} not received)
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="stat-divider" />
                <div>
                  <p className="label">Training / medical</p>
                  <p className="text-[10px] text-muted">
                    {(expiring.training || []).length} training · {(expiring.medical || []).length} medical
                    certificate(s) expiring within 30 days.
                  </p>
                </div>
              </div>
            </Panel>
          )}
        </div>
      )}

      {tab === 'armoury' && (
        <Panel title="Armoury register" subtitle="Read-only overview · allotment is handled by the Operations Manager">
          <ArmouryPanel weapons={weapons} locations={locations} onChanged={load} canManage={false} />
        </Panel>
      )}

      {tab === 'team' && (
        <div className="space-y-4">
          <TeamPanel role="CEO" zones={zones} locations={locations} onChanged={load} />
          <AuditLogPanel />
        </div>
      )}

      {tab === 'incidents' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Active emergencies" subtitle="Action taken is tracked per incident">
            {activeEmergencies.length === 0 ? (
              <EmptyState title="No active emergencies" />
            ) : (
              <IncidentPanel incidents={activeEmergencies} canManage={false} />
            )}
          </Panel>
          <Panel title="Client complaints" subtitle="Complaints and management follow-up">
            {complaints.length === 0 ? (
              <EmptyState title="No client complaints" />
            ) : (
              <IncidentPanel incidents={complaints} canManage={false} />
            )}
          </Panel>
        </div>
      )}

      {tab === 'posture' && activeEmergencies.length > 0 && (
        <Panel
          title="Active emergencies & client complaints"
          subtitle="Action-taken visibility for the executive desk"
          actions={<AlertTriangle size={14} className="text-rose-500" />}
        >
          <IncidentPanel incidents={activeEmergencies.slice(0, 6)} canManage={false} compact />
        </Panel>
      )}

      <RosterDrawer
        locationId={rosterSite?.id}
        open={Boolean(rosterSite)}
        onClose={() => setRosterSite(null)}
      />
    </div>
  );
}
