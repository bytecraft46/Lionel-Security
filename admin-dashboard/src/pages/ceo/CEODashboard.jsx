import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, RefreshCw, ShieldAlert } from 'lucide-react';
import { api, downloadFile } from '../../lib/http';
import { useSocketEvent } from '../../lib/socket';
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
import AttendanceDetailModal from '../../components/ui/AttendanceDetailModal';
import RosterDrawer from '../shared/RosterDrawer';
import GuardZoneMap from '../../components/map/GuardZoneMap';
import IncidentPanel from '../ops/IncidentPanel';
import ArmouryPanel from '../ops/ArmouryPanel';
import TeamPanel from '../shared/TeamPanel';
import AuditLogPanel from '../shared/AuditLogPanel';
import RiskCompliancePanel from '../shared/RiskCompliancePanel';
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
  const [modalType, setModalType] = useState(null);
  const [toast, setToast] = useState(null);
  const refreshTimer = useRef(null);

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

  const scheduleRefresh = useCallback(() => {
    if (refreshTimer.current) return;
    refreshTimer.current = setTimeout(() => {
      refreshTimer.current = null;
      load();
    }, 400);
  }, [load]);

  useEffect(
    () => () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    },
    [],
  );

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(null), 8000);
    return () => clearTimeout(timer);
  }, [toast]);

  useSocketEvent('INCIDENT_BROADCAST', (incident) => {
    const alert = incident.alert || {};
    const nearby = alert.nearby_guard_count ?? 0;
    const radius = alert.radius_km ?? 10;
    setToast(
      `🚨 ${(incident.incident_type || 'ALERT').replaceAll('_', ' ')} at ${
        incident.post_name || 'deployed site'
      } — ${nearby} guard${nearby === 1 ? '' : 's'} within ${radius} km alerted`,
    );
    scheduleRefresh();
  });

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
  const unacknowledged = broadcasts.filter(
    (broadcast) => broadcast.priority === 'CRITICAL' && broadcast.not_received_count > 0,
  );

  if (loading) {
    return (
      <div className="p-8">
        <Spinner label="Loading operational posture…" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      {(tab === 'posture' || !tab) && (
        <>
      {/* Top Banner / Actions Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-800">Operational Overview</h2>
          <p className="text-xs text-muted">
            {fmtDate(overview?.date)} · Status across {kpis.total_locations ?? 0} active deployment locations
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <Button variant="ghost" onClick={load} className="border border-line bg-white hover:bg-slate-50">
            <RefreshCw size={13} /> Refresh
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
            <Download size={13} /> Export Daily SITREP
          </Button>
        </div>
      </div>

      <OverdueCheckInAlerts />

      {(kpis.active_emergencies > 0 || kpis.vacant_posts > 0) && (
        <div className="flex items-center gap-3 rounded-2xl border border-rose-200 bg-[#FDF0ED] px-4 py-3 text-rose-800">
          <ShieldAlert size={18} className="text-rose-600 flex-shrink-0" />
          <p className="text-xs font-semibold">
            Action Needed: {kpis.active_emergencies || 0} active incident{(kpis.active_emergencies || 0) === 1 ? '' : 's'} · {kpis.vacant_posts || 0} vacant post{(kpis.vacant_posts || 0) === 1 ? '' : 's'} across Karachi sectors
          </p>
        </div>
      )}

      {/* Attendance / Strength Summary Header matching user's screenshot */}
      <div>
        <div className="flex items-center justify-between pb-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">Attendance Summary</h3>
          <span className="text-xs font-medium text-muted">Active Month · 2026</span>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7">
          <Kpi
            label="Registered Strength"
            value={kpis.total_guards ?? '—'}
            tone="green"
            onClick={() => setModalType('SHIFTS')}
          />
          <Kpi
            label="Guards On Duty"
            value={kpis.on_duty ?? '0'}
            tone="green"
            onClick={() => setModalType('ON_DUTY')}
          />
          <Kpi
            label="Vacant Posts"
            value={kpis.vacant_posts ?? '0'}
            tone={kpis.vacant_posts > 0 ? "red" : "green"}
            onClick={() => setModalType('VACANT')}
          />
          <Kpi
            label="Absent"
            value={kpis.absent ?? '0'}
            tone={kpis.absent > 0 ? "yellow" : "neutral"}
            onClick={() => setModalType('ABSENT')}
          />
          <Kpi
            label="On Leave"
            value={kpis.on_leave ?? '0'}
            tone="info"
            onClick={() => setModalType('LEAVE')}
          />
          <Kpi
            label="Weapons Issued"
            value={kpis.weapons_issued ?? '0'}
            tone="neutral"
            onClick={() => setModalType('WEAPONS')}
          />
          <Kpi
            label="Emergencies"
            value={kpis.active_emergencies ?? '0'}
            tone={kpis.active_emergencies > 0 ? "red" : "neutral"}
            onClick={() => setModalType('EMERGENCIES')}
          />
        </div>
      </div>

      {showLeave && (
        <Panel title="Guards on approved leave today">
          {leaveRows.length === 0 ? (
            <p className="text-xs text-muted">No approved leave today.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {leaveRows.map((row) => (
                <Badge key={row.id} tone="info">
                  {row.guard_name} · {row.leave_type.replaceAll('_', ' ')}
                </Badge>
              ))}
            </div>
          )}
        </Panel>
      )}

        </>
      )}

      {(tab === 'posture' || !tab) && (
        <>
          {/* Guard Deployment Map */}
          <Panel
            title="Guard Deployment Map"
            subtitle="Live locations plotted across Karachi zones"
            actions={<Badge tone="neutral">{guards.length} guards · {zones.length} zones</Badge>}
          >
            <GuardZoneMap guards={guards} locations={locations} zones={zones} />
          </Panel>

          {/* Zone & Location Matrix */}
          <Panel
            title="Zone & Location Status Matrix"
            subtitle="Select any site for full deployment roster"
            actions={<Badge tone="neutral">{locations.length} sites</Badge>}
          >
            <div className="space-y-4">
              {zones.map((zone) => (
                <div key={zone.id} className="rounded-2xl border border-line bg-slate-50/40 overflow-hidden">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-slate-50/80 px-4 py-3">
                    <div>
                      <p className="text-xs font-bold text-slate-800 tracking-wide">{zone.name}</p>
                      <p className="text-[11px] text-muted">
                        Supervisor: <span className="font-semibold text-slate-700">{zone.supervisor_name || 'Unassigned'}</span> · {zone.present_count}/{zone.required_strength} on shift · {zone.assigned_guards ?? '—'} assigned
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-32">
                        <ProgressBar
                          value={zone.required_strength ? zone.present_count / zone.required_strength : 0}
                          tone={zone.status === 'RED' ? 'red' : zone.status === 'YELLOW' ? 'yellow' : 'green'}
                        />
                      </div>
                      <RagDot status={zone.status} />
                    </div>
                  </div>
                  <div className="grid gap-px bg-line sm:grid-cols-2 xl:grid-cols-3">
                    {locations
                      .filter((site) => site.zone_id === zone.id)
                      .map((site) => (
                        <button
                          key={site.id}
                          type="button"
                          onClick={() => setRosterSite(site)}
                          className="flex items-center justify-between gap-2 bg-white px-4 py-3 text-left transition-colors hover:bg-slate-50 group"
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-xs font-semibold text-slate-800 group-hover:text-primary transition-colors">
                              {site.name}
                            </span>
                            <span className="block truncate text-[10px] text-muted font-medium">
                              {site.client_name || 'Client site'}
                            </span>
                          </span>
                          <span className="flex flex-shrink-0 items-center gap-2">
                            <span className="font-mono text-xs font-bold text-slate-700">
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

          {/* Attention & Weapons */}
          <div className="grid gap-6 lg:grid-cols-3">
            <Panel title="Locations Requiring Attention" className="lg:col-span-2">
              {attention.length === 0 && <EmptyState title="No attention flags" />}
              <ul className="divide-y divide-line">
                {attention.slice(0, 8).map((item, index) => (
                  <li key={`${item.kind}-${index}`} className="flex items-start justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-slate-800">{item.location_name}</p>
                      <p className="text-[11px] text-muted">{item.reason}</p>
                    </div>
                    <Badge tone={toneForStatus(item.severity)}>{item.kind.replaceAll('_', ' ')}</Badge>
                  </li>
                ))}
              </ul>
            </Panel>

            <Panel title="Weapons Issued by Location" subtitle={`${Object.keys(weaponsByLocation).length} sites armed`}>
              {Object.keys(weaponsByLocation).length === 0 && <EmptyState title="No weapons issued" />}
              <ul className="space-y-2">
                {Object.entries(weaponsByLocation).map(([name, count]) => (
                  <li key={name} className="flex items-center justify-between text-xs py-1">
                    <span className="truncate text-muted">{name}</span>
                    <span className="font-mono font-bold text-slate-800">{count}</span>
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

      {tab === 'zones' && (
        <Panel title="Deployment Register" subtitle="Every active location with verified strength">
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
                    <td className="font-semibold text-slate-800">{site.name}</td>
                    <td className="text-muted">{site.client_name || '—'}</td>
                    <td>{site.zone_name}</td>
                    <td>{site.supervisor_name || '—'}</td>
                    <td className="font-mono font-bold">
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
      )}

      {tab === 'risk' && (
        <RiskCompliancePanel overview={overview} broadcasts={broadcasts} onRefresh={load} />
      )}

      {tab === 'armoury' && (
        <Panel title="Armoury Register" subtitle="Overview of operational firearms and ammunition">
          <ArmouryPanel weapons={weapons} locations={locations} onChanged={load} canManage={false} />
        </Panel>
      )}

      {tab === 'team' && (
        <div className="space-y-6">
          <TeamPanel role="CEO" zones={zones} locations={locations} onChanged={load} />
          <AuditLogPanel />
        </div>
      )}

      {tab === 'incidents' && (
        <Panel title="Active Emergencies" subtitle="Field incidents and actions taken">
          {activeEmergencies.length === 0 ? (
            <EmptyState title="No active emergencies" />
          ) : (
            <IncidentPanel incidents={activeEmergencies} canManage={false} />
          )}
        </Panel>
      )}

      <RosterDrawer
        locationId={rosterSite?.id}
        open={Boolean(rosterSite)}
        onClose={() => setRosterSite(null)}
      />

      <AttendanceDetailModal
        type={modalType}
        onClose={() => setModalType(null)}
        guards={guards}
        locations={locations}
        zones={zones}
        weapons={weapons}
        incidents={incidents}
        leave={leaveRows}
        onDutyIds={overview?.on_duty_ids || []}
        absentIds={overview?.absent_ids || []}
      />

      {toast && (
        <div className="fixed bottom-5 right-5 z-[1200] max-w-sm rounded-2xl border border-slate-200 bg-white p-4 shadow-xl transition-all">
          <div className="flex items-start gap-3">
            <StatusBadge status="PRESENT" label="Live" />
            <p className="flex-1 text-xs font-semibold text-slate-800">{toast}</p>
          </div>
        </div>
      )}
    </div>
  );
}
