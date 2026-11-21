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
import AttendanceDetailModal from '../../components/ui/AttendanceDetailModal';
import GuardTrendPanel from '../../components/ui/GuardTrendPanel';
import OperationsMap from '../../components/map/OperationsMap';
import RosterDrawer from '../shared/RosterDrawer';
import TeamPanel from '../shared/TeamPanel';
import DeploymentTree from './DeploymentTree';
import AttendanceFeed from './AttendanceFeed';
import BroadcastCenter from './BroadcastCenter';
import ArmouryPanel from './ArmouryPanel';
import IncidentPanel from './IncidentPanel';
import ZonesSitesPanel from '../shared/ZonesSitesPanel';
import CheckInOutPanel from '../shared/CheckInOutPanel';
import OverdueCheckInAlerts from '../shared/OverdueCheckInAlerts';

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
  const [modalType, setModalType] = useState(null);

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
    setStream((prev) => [record, ...prev.filter((r) => r.id !== record.id)].slice(0, 30));
    setToast(`${record.punch_type === 'IN' ? '🟢 Check-in' : '⚪ Check-out'}: ${record.guard_name} at ${record.post_name}`);
  });
  useSocketEvent('BROADCAST_ALERT', (b) => {
    setToast(`📣 Command Broadcast: ${b.title}`);
    scheduleRefresh();
  });
  useSocketEvent('INCIDENT_BROADCAST', (inc) => {
    setToast(`🚨 Incident Reported: ${inc.incident_type.replaceAll('_', ' ')}`);
    scheduleRefresh();
  });

  const kpis = overview?.kpis || {};
  const zones = overview?.zones || [];
  const locations = overview?.locations || [];
  const attention = overview?.attention || [];

  const weaponSummary = useMemo(() => {
    const issued = weapons.filter((w) => w.armoury_status === 'ISSUED');
    const available = weapons.filter((w) => w.armoury_status === 'AVAILABLE');
    const byLocation = issued.reduce((acc, w) => {
      const k = w.assigned_post_name || 'Unassigned';
      acc[k] = (acc[k] || 0) + 1;
      return acc;
    }, {});
    return { issued, available, byLocation };
  }, [weapons]);

  async function decideLeave(row, status) {
    try {
      await api(`/api/leave/${row.id}/decision`, { method: 'POST', body: { status } });
      setLeave((prev) => prev.filter((item) => item.id !== row.id));
      setToast(`Leave ${status.toLowerCase()} for ${row.guard_name}`);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  if (loading) {
    return (
      <div className="p-8">
        <Spinner label="Connecting to Central Operations..." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      {(tab === 'control' || !tab) && (
        <>
      {/* Top Banner / Actions Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-800">Operations Control Room</h2>
          <p className="text-xs text-muted">
            {fmtDate(overview?.date)} · Live Karachi guard deployment, biometric/GPS feeds & dispatch
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <Button variant="ghost" onClick={load} className="border border-line bg-white hover:bg-slate-50">
            <RefreshCw size={13} /> Refresh
          </Button>
          <Button
            onClick={() =>
              downloadFile(
                '/api/reports/sitrep?format=text',
                `Lionel-SITREP-${overview?.date || 'today'}.txt`,
              ).catch((err) => setError(err.message))
            }
          >
            <Download size={13} /> SITREP Export
          </Button>
        </div>
      </div>

      <OverdueCheckInAlerts />

      {/* Attendance & Strength Summary Header (matching user's screenshot) */}
      <div>
        <div className="flex items-center justify-between pb-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">Attendance Summary</h3>
          <span className="text-xs font-medium text-muted">Real-Time Deployed Status</span>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Kpi
            label="Total Strength"
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
            label="Absent"
            value={kpis.absent ?? '0'}
            tone={kpis.absent > 0 ? "yellow" : "neutral"}
            onClick={() => setModalType('ABSENT')}
          />
          <Kpi
            label="Vacant Posts"
            value={kpis.vacant_posts ?? '0'}
            tone={kpis.vacant_posts > 0 ? "red" : "green"}
            onClick={() => setModalType('VACANT')}
          />
          <Kpi
            label="Weapons Issued"
            value={kpis.weapons_issued ?? '0'}
            hint={`${kpis.weapons_in_armoury ?? 0} in armoury`}
            tone="info"
            onClick={() => setModalType('WEAPONS')}
          />
          <Kpi
            label="Active Incidents"
            value={kpis.active_emergencies ?? '0'}
            tone={kpis.active_emergencies > 0 ? "red" : "neutral"}
            onClick={() => setModalType('EMERGENCIES')}
          />
        </div>
      </div>

        </>
      )}

      {(tab === 'control' || !tab) && (
        <>
          <GuardTrendPanel
            role="OPS_MANAGER"
            zones={zones}
            locations={locations}
            guards={guards}
          />

          <div className="grid gap-6 xl:grid-cols-12">
            {/* Deployment Tree */}
            <Panel
              className="xl:col-span-4"
              title="Deployment Tree"
              subtitle={`${zones.length} zones · ${locations.length} sites`}
            >
              <div className="max-h-[500px] overflow-y-auto pr-1">
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

            {/* Map & Live Stream */}
            <div className="space-y-6 xl:col-span-8">
              <Panel
                title="Live Operations Map"
                subtitle="Geofences and real-time site pins"
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
                  className="h-80"
                />
              </Panel>

              <Panel
                title="Live Attendance Stream"
                subtitle="Real-time verified biometric and GPS punches"
                actions={<Badge tone="green">{stream.length} recent</Badge>}
              >
                <div className="max-h-64 overflow-y-auto pr-1">
                  <AttendanceFeed records={stream} limit={20} />
                </div>
              </Panel>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <Panel title="Command Messaging">
              <BroadcastCenter
                broadcasts={broadcasts}
                zones={zones}
                locations={locations}
                compact
                onChanged={load}
              />
            </Panel>

            <Panel title="Pending Leave Requests" subtitle="Approvals adjust live deployed strength">
              {leave.length === 0 && <EmptyState title="No pending leave" />}
              <ul className="divide-y divide-line">
                {leave.slice(0, 5).map((row) => (
                  <li key={row.id} className="py-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold text-slate-800">{row.guard_name}</p>
                        <p className="text-[10px] text-muted">
                          {row.leave_type.replaceAll('_', ' ')} · {fmtDate(row.start_date)} → {fmtDate(row.end_date)}
                        </p>
                      </div>
                      <div className="flex gap-1.5">
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

            <Panel title="Attention Flags" subtitle="Sites requiring operational support">
              {attention.length === 0 && <EmptyState title="All sites within tolerance" />}
              <ul className="max-h-60 space-y-2 overflow-y-auto pr-1">
                {attention.slice(0, 6).map((item, index) => (
                  <li
                    key={`${item.kind}-${item.location_id}-${index}`}
                    className="rounded-xl border border-line bg-slate-50 p-2.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-xs font-bold text-slate-800">{item.location_name}</p>
                      <Badge tone={toneForStatus(item.severity)}>{item.kind.replaceAll('_', ' ')}</Badge>
                    </div>
                    <p className="text-[11px] text-muted mt-0.5">{item.reason}</p>
                  </li>
                ))}
              </ul>
            </Panel>
          </div>
        </>
      )}

      {tab === 'checkins' && (
        <CheckInOutPanel role="OPS_MANAGER" zones={zones} locations={locations} />
      )}

      {tab === 'zones' && (
        <ZonesSitesPanel zones={zones} locations={locations} onChanged={load} />
      )}

      {tab === 'weapons' && (
        <Panel title="Armoury Register" subtitle="Issue, verify and reconcile weapons">
          <ArmouryPanel
            weapons={weapons}
            guards={guards}
            locations={locations}
            zones={zones}
            onChanged={load}
          />
        </Panel>
      )}

      {tab === 'team' && (
        <TeamPanel role="OPS_MANAGER" zones={zones} locations={locations} onChanged={load} />
      )}

      {tab === 'incidents' && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Panel title="Incident Triage" subtitle="Operational incidents">
            <IncidentPanel incidents={incidents} onChanged={load} />
          </Panel>
          <Panel title="Emergencies & Complaints">
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

      <AttendanceDetailModal
        type={modalType}
        onClose={() => setModalType(null)}
        guards={guards}
        locations={locations}
        zones={zones}
        weapons={weapons}
        incidents={incidents}
        leave={leave}
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
