import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, RefreshCw } from 'lucide-react';
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
  Spinner,
  StatusBadge,
} from '../../components/ui';
import OperationsMap from '../../components/map/OperationsMap';
import RosterDrawer from '../shared/RosterDrawer';
import TeamPanel from '../shared/TeamPanel';
import DeploymentTree from './DeploymentTree';
import AttendanceFeed from './AttendanceFeed';
import BroadcastCenter from './BroadcastCenter';
import ArmouryPanel from './ArmouryPanel';
import IncidentPanel from './IncidentPanel';
import ZonesSitesPanel from '../shared/ZonesSitesPanel';

export default function OpsDashboard({ tab }) {
  const [overview, setOverview] = useState(null);
  const [stream, setStream] = useState([]);
  const [broadcasts, setBroadcasts] = useState([]);
  const [weapons, setWeapons] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [leave, setLeave] = useState([]);
  const [guards, setGuards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);
  const [rosterSite, setRosterSite] = useState(null);
  const [selectedSite, setSelectedSite] = useState(null);

  const loadSeq = useRef(0);
  const refreshTimer = useRef(null);

  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    setError(null);
    try {
      const [overviewData, streamData, broadcastData, weaponData, incidentData, leaveData, guardData] =
        await Promise.all([
          api('/api/dashboard/overview'),
          api('/api/attendance/stream?limit=25'),
          api('/api/broadcasts'),
          api('/api/weapons'),
          api('/api/incidents'),
          api('/api/leave?status=PENDING'),
          api('/api/guards'),
        ]);
      if (seq !== loadSeq.current) return;
      setOverview(overviewData);
      setStream(streamData.attendance || []);
      setBroadcasts(broadcastData.broadcasts || []);
      setWeapons(weaponData.weapons || []);
      setIncidents(incidentData.incidents || []);
      setLeave(leaveData.leave_requests || []);
      setGuards(guardData.guards || []);
    } catch (err) {
      if (seq === loadSeq.current) setError(err.message);
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }, []);

  // Coalesce bursts of socket events into one trailing refresh.
  const scheduleRefresh = useCallback(() => {
    if (refreshTimer.current) return;
    refreshTimer.current = setTimeout(() => {
      refreshTimer.current = null;
      load();
    }, 800);
  }, [load]);

  useEffect(() => {
    load();
    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    };
  }, [load]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(timer);
  }, [toast]);

  useSocketEvent('ATTENDANCE_PUNCHED', (record) => {
    setStream((previous) => [record, ...previous.filter((row) => row.id !== record.id)].slice(0, 30));
    setToast(
      record.status === 'FLAGGED_ANOMALY'
        ? `⚠️ ${record.guard_name} flagged at ${record.post_name}`
        : `${record.punch_type === 'IN' ? '🟢' : '⚪'} ${record.guard_name} punched ${record.punch_type} at ${record.post_name}`,
    );
  });
  useSocketEvent('ATTENDANCE_FLAGGED', (payload) => {
    setToast(`🚨 Attendance anomaly: ${payload.guard_name} — ${(payload.reasons || []).join(', ')}`);
  });
  useSocketEvent('BROADCAST_ALERT', (broadcast) => {
    setToast(`📣 ${broadcast.priority} broadcast: ${broadcast.title}`);
    scheduleRefresh();
  });
  useSocketEvent('BROADCAST_ACK_UPDATED', () => scheduleRefresh());
  useSocketEvent('INCIDENT_BROADCAST', (incident) => {
    setToast(`🚨 ${incident.incident_type.replaceAll('_', ' ')} at ${incident.post_name}`);
    scheduleRefresh();
  });
  useSocketEvent('INSPECTION_RECORDED', () => scheduleRefresh());

  const kpis = overview?.kpis || {};
  const zones = overview?.zones || [];
  const locations = overview?.locations || [];
  const attention = overview?.attention || [];

  const weaponSummary = useMemo(() => {
    const issued = weapons.filter((weapon) => weapon.armoury_status === 'ISSUED');
    const available = weapons.filter((weapon) => weapon.armoury_status === 'AVAILABLE');
    const byLocation = issued.reduce((accumulator, weapon) => {
      const key = weapon.assigned_post_name || 'Unassigned';
      accumulator[key] = (accumulator[key] || 0) + 1;
      return accumulator;
    }, {});
    return { issued, available, byLocation };
  }, [weapons]);

  async function decideLeave(row, status) {
    try {
      await api(`/api/leave/${row.id}/decision`, { method: 'POST', body: { status } });
      setLeave((previous) => previous.filter((item) => item.id !== row.id));
      setToast(`Leave ${status.toLowerCase()} for ${row.guard_name}`);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <Spinner label="Connecting to central operations…" />
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 lg:p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-black uppercase tracking-[0.16em] text-ink">
            Central Operations Control Room
          </h2>
          <p className="text-[11px] text-muted">
            {fmtDate(overview?.date)} · Live deployment, attendance and command messaging
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={load}>
            <RefreshCw size={12} /> Refresh
          </Button>
          <Button
            onClick={() =>
              downloadFile(
                '/api/reports/sitrep?format=text',
                `Lionel-SITREP-${overview?.date || 'today'}.txt`,
              ).catch((err) => setError(err.message))
            }
          >
            <Download size={12} /> SITREP
          </Button>
        </div>
      </div>

      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-6">
        <Kpi label="Registered guards" value={kpis.total_guards ?? '—'} />
        <Kpi label="Guard on duty" value={kpis.on_duty ?? '—'} tone="green" />
        <Kpi label="Absent" value={kpis.absent ?? '—'} tone={(kpis.absent || 0) > 0 ? 'yellow' : 'neutral'} />
        <Kpi label="Vacant posts" value={kpis.vacant_posts ?? '—'} tone={(kpis.vacant_posts || 0) > 0 ? 'red' : 'green'} />
        <Kpi
          label="Active emergencies"
          value={kpis.active_emergencies ?? '—'}
          tone={(kpis.active_emergencies || 0) > 0 ? 'red' : 'green'}
        />
        <Kpi label="Weapons issued" value={kpis.weapons_issued ?? '—'} hint={`${kpis.weapons_in_armoury ?? 0} in armoury`} />
      </div>

      {(tab === 'control' || !tab) && (
        <>
          <div className="grid gap-4 xl:grid-cols-12">
            <Panel
              className="xl:col-span-3"
              title="Deployment tree"
              subtitle={`${zones.length} zones · ${locations.length} sites`}
            >
              <div className="max-h-[520px] overflow-y-auto pr-1">
                <DeploymentTree
                  zones={zones}
                  locations={locations}
                  onSelect={(site) => {
                    setSelectedSite(site);
                    setRosterSite(site);
                  }}
                />
              </div>
            </Panel>

            <div className="space-y-4 xl:col-span-6">
              <Panel
                title="Live operations map"
                subtitle="Colour-coded geofences · click a pin for the roster"
                actions={<Badge tone="info">{locations.length} sites</Badge>}
                bodyClassName="p-3"
              >
                <OperationsMap
                  locations={locations}
                  selectedId={selectedSite?.id}
                  onSelect={(site) => {
                    setSelectedSite(site);
                    setRosterSite(site);
                  }}
                  className="h-72"
                />
              </Panel>

              <Panel
                title="Live attendance stream"
                subtitle="GPS/QR verified vs supervisor verified"
                actions={<Badge tone="green">{stream.length} recent</Badge>}
              >
                <div className="max-h-64 overflow-y-auto pr-1">
                  <AttendanceFeed records={stream} limit={20} />
                </div>
              </Panel>
            </div>

            <Panel className="xl:col-span-3" title="Command & emergency messaging">
              <BroadcastCenter
                broadcasts={broadcasts}
                zones={zones}
                locations={locations}
                compact
                onChanged={load}
              />
            </Panel>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Panel
              title="Weapons & ammunition"
              subtitle={`${weaponSummary.issued.length} issued · ${weaponSummary.available.length} in armoury`}
            >
              {Object.entries(weaponSummary.byLocation).length === 0 && (
                <EmptyState title="No weapons issued" hint="All serials accounted for in the armoury." />
              )}
              <ul className="space-y-1.5">
                {Object.entries(weaponSummary.byLocation).map(([location, count]) => (
                  <li key={location} className="flex items-center justify-between text-[11px]">
                    <span className="truncate text-muted">{location}</span>
                    <span className="font-mono font-bold text-ink">{count}</span>
                  </li>
                ))}
              </ul>
            </Panel>

            <Panel title="Pending leave" subtitle="Approved leave reduces available manpower">
              {leave.length === 0 && <EmptyState title="No pending leave" />}
              <ul className="divide-y divide-line/60">
                {leave.slice(0, 5).map((row) => (
                  <li key={row.id} className="py-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-[11px] font-semibold text-ink">{row.guard_name}</p>
                        <p className="text-[10px] text-muted">
                          {row.leave_type.replaceAll('_', ' ')} · {fmtDate(row.start_date)} →{' '}
                          {fmtDate(row.end_date)}
                        </p>
                      </div>
                      <div className="flex gap-1">
                        <Button size="sm" variant="primary" onClick={() => decideLeave(row, 'APPROVED')}>
                          Approve
                        </Button>
                        <Button size="sm" variant="danger" onClick={() => decideLeave(row, 'REJECTED')}>
                          Reject
                        </Button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </Panel>

            <Panel title="Attention required" subtitle="Weakest sites & flagged activity">
              {attention.length === 0 && <EmptyState title="All sites within tolerance" />}
              <ul className="max-h-52 space-y-1.5 overflow-y-auto pr-1">
                {attention.slice(0, 6).map((item, index) => (
                  <li
                    key={`${item.kind}-${item.location_id}-${index}`}
                    className="rounded-lg border border-line bg-panelAlt/50 px-2 py-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-[10px] font-bold text-ink">{item.location_name}</p>
                      <Badge tone={toneForStatus(item.severity)}>{item.kind.replaceAll('_', ' ')}</Badge>
                    </div>
                    <p className="text-[10px] text-muted">{item.reason}</p>
                  </li>
                ))}
              </ul>
            </Panel>
          </div>
        </>
      )}

      {tab === 'zones' && (
        <ZonesSitesPanel zones={zones} locations={locations} onChanged={load} />
      )}

      {tab === 'weapons' && (
        <Panel title="Armoury register" subtitle="Issue, verify and reconcile weapons">
          <ArmouryPanel weapons={weapons} guards={guards} locations={locations} onChanged={load} />
        </Panel>
      )}

      {tab === 'team' && (
        <TeamPanel role="OPS_MANAGER" zones={zones} locations={locations} onChanged={load} />
      )}

      {tab === 'incidents' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Incident triage" subtitle="All incidents in your command scope">
            <IncidentPanel incidents={incidents} onChanged={load} />
          </Panel>
          <Panel title="Emergencies & client complaints" subtitle="Severity feeds from active sites">
            <IncidentPanel
              incidents={incidents.filter((incident) =>
                ['CLIENT_COMPLAINT', 'FIRE', 'ATTEMPTED_INTRUSION', 'WEAPON_INCIDENT'].includes(
                  incident.incident_type,
                ),
              )}
              onChanged={load}
              compact
            />
          </Panel>
        </div>
      )}

      <RosterDrawer
        locationId={rosterSite?.id}
        open={Boolean(rosterSite)}
        onClose={() => setRosterSite(null)}
        canVerify
        guards={guards}
        onChanged={load}
      />

      {toast && (
        <div className="fixed bottom-4 right-4 z-[1200] max-w-sm animate-slide-in rounded-xl border border-accent/40 bg-panel px-3 py-2 text-[11px] text-ink shadow-xl">
          <div className="flex items-start gap-3">
            <StatusBadge status="PRESENT" label="Live" />
            <p className="flex-1">{toast}</p>
          </div>
        </div>
      )}
    </div>
  );
}
