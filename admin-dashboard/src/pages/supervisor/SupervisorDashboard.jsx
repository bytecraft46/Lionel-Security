import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, ClipboardCheck, RefreshCw } from 'lucide-react';
import { api } from '../../lib/http';
import { useSocketEvent } from '../../lib/socket';
import { fmtDate, fmtDateTime, toneForStatus } from '../../lib/format';
import {
  Badge,
  Button,
  EmptyState,
  ErrorBanner,
  Field,
  Kpi,
  Modal,
  Panel,
  ProgressBar,
  RagDot,
  Spinner,
  StatusBadge,
} from '../../components/ui';
import RosterDrawer from '../shared/RosterDrawer';
import TeamPanel from '../shared/TeamPanel';
import IncidentPanel from '../ops/IncidentPanel';
import ArmouryPanel from '../ops/ArmouryPanel';

const INCIDENT_TYPES = [
  'THEFT',
  'BURGLARY',
  'ATTEMPTED_INTRUSION',
  'FIRE',
  'MEDICAL_EMERGENCY',
  'SUSPICIOUS_ACTIVITY',
  'GUARD_MISCONDUCT',
  'CLIENT_COMPLAINT',
  'WEAPON_INCIDENT',
];

export default function SupervisorDashboard({ tab, user }) {
  const [overview, setOverview] = useState(null);
  const [guards, setGuards] = useState([]);
  const [broadcasts, setBroadcasts] = useState([]);
  const [inspections, setInspections] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [weapons, setWeapons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);
  const [rosterSite, setRosterSite] = useState(null);
  const [ackTarget, setAckTarget] = useState(null);
  const [ackNotes, setAckNotes] = useState('');
  const [incidentForm, setIncidentForm] = useState({
    post_id: '',
    incident_type: 'SUSPICIOUS_ACTIVITY',
    immediate_action: '',
  });
  const [inspectionForm, setInspectionForm] = useState({
    post_id: '',
    inspection_type: 'DAILY',
    score: 4,
    turnout_uniform_ok: true,
    attendance_verified: true,
    security_preparedness: 'ADEQUATE',
    client_feedback: '',
    deficiencies: '',
    corrective_action: '',
  });
  const [saving, setSaving] = useState(false);

  const loadSeq = useRef(0);
  const refreshTimer = useRef(null);

  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    setError(null);
    try {
      const [overviewData, guardData, broadcastData, inspectionData, incidentData, weaponData] =
        await Promise.all([
          api('/api/dashboard/overview'),
          api('/api/guards'),
          api('/api/broadcasts'),
          api('/api/inspections'),
          api('/api/incidents'),
          api('/api/weapons'),
        ]);
      if (seq !== loadSeq.current) return;
      setOverview(overviewData);
      setGuards(guardData.guards || []);
      setBroadcasts(broadcastData.broadcasts || []);
      setInspections(inspectionData.inspections || []);
      setIncidents(incidentData.incidents || []);
      setWeapons(weaponData.weapons || []);
      const firstSite = overviewData.locations?.[0]?.id || '';
      setIncidentForm((form) => ({ ...form, post_id: form.post_id || firstSite }));
      setInspectionForm((form) => ({ ...form, post_id: form.post_id || firstSite }));
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
    const timer = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(timer);
  }, [toast]);

  useSocketEvent('BROADCAST_ALERT', (broadcast) => {
    setToast(`📣 Command broadcast: ${broadcast.title}`);
    scheduleRefresh();
  });
  useSocketEvent('ATTENDANCE_PUNCHED', () => scheduleRefresh());
  useSocketEvent('INCIDENT_BROADCAST', () => scheduleRefresh());

  const kpis = overview?.kpis || {};
  const locations = overview?.locations || [];

  async function acknowledge(broadcast, actionTaken) {
    setSaving(true);
    try {
      await api(`/api/broadcasts/${broadcast.id}/ack`, {
        method: 'POST',
        body: {
          ack_status: 'RECEIVED',
          compliance_status: actionTaken ? 'ACTION_TAKEN' : 'PENDING',
          action_notes: ackNotes || undefined,
        },
      });
      setAckTarget(null);
      setAckNotes('');
      setToast(actionTaken ? 'Action recorded against command broadcast.' : 'Receipt acknowledged.');
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function submitIncident(event) {
    event.preventDefault();
    setSaving(true);
    try {
      await api('/api/incidents', { method: 'POST', body: incidentForm });
      setIncidentForm({ ...incidentForm, immediate_action: '' });
      setToast('Incident reported to command.');
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function submitInspection(event) {
    event.preventDefault();
    setSaving(true);
    try {
      await api('/api/inspections', {
        method: 'POST',
        body: { ...inspectionForm, score: Number(inspectionForm.score) },
      });
      setToast('Site inspection logged.');
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <Spinner label="Loading zone roster…" />
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 lg:p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-black uppercase tracking-[0.16em] text-ink">
            Zone & Site Roster Execution
          </h2>
          <p className="text-[11px] text-muted">
            {user.zone_names?.join(' · ') || 'Assigned zone'} · {fmtDate(overview?.date)}
          </p>
        </div>
        <Button variant="ghost" onClick={load}>
          <RefreshCw size={12} /> Refresh
        </Button>
      </div>

      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-6">
        <Kpi label="My locations" value={kpis.total_locations ?? '—'} />
        <Kpi label="Guards in zone" value={kpis.total_guards ?? '—'} />
        <Kpi label="On duty" value={kpis.on_duty ?? '—'} tone="green" />
        <Kpi label="Absent" value={kpis.absent ?? '—'} tone={(kpis.absent || 0) > 0 ? 'yellow' : 'neutral'} />
        <Kpi label="Vacant posts" value={kpis.vacant_posts ?? '—'} tone={(kpis.vacant_posts || 0) > 0 ? 'red' : 'green'} />
        <Kpi
          label="Active emergencies"
          value={kpis.active_emergencies ?? '—'}
          tone={(kpis.active_emergencies || 0) > 0 ? 'red' : 'green'}
        />
      </div>

      {(tab === 'locations' || !tab) && (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {locations.map((site) => (
            <Panel key={site.id} bodyClassName="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-[12px] font-bold text-ink">{site.name}</p>
                  <p className="truncate text-[10px] text-muted">{site.client_name || 'Client site'}</p>
                </div>
                <RagDot status={site.computed_status} />
              </div>
              <div className="mt-3 flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-wide text-muted">
                  Present / required
                </span>
                <span className="font-mono text-sm font-bold text-ink">
                  {site.present_count}/{site.required_strength}
                </span>
              </div>
              <div className="mt-1.5">
                <ProgressBar
                  value={site.required_strength ? site.present_count / site.required_strength : 0}
                  tone={site.computed_status === 'RED' ? 'red' : site.computed_status === 'YELLOW' ? 'yellow' : 'green'}
                />
              </div>
              <div className="mt-3 flex items-center justify-between">
                <div className="flex gap-1">
                  <Badge tone={site.vacant > 0 ? 'red' : 'green'}>{site.vacant} vacant</Badge>
                  <Badge tone="info">{site.on_leave_count} leave</Badge>
                </div>
                <Button size="sm" variant="primary" onClick={() => setRosterSite(site)}>
                  <ClipboardCheck size={12} /> Roster
                </Button>
              </div>
            </Panel>
          ))}
          {locations.length === 0 && (
            <Panel className="md:col-span-2 xl:col-span-3">
              <EmptyState title="No locations assigned to your zone" />
            </Panel>
          )}
        </div>
      )}

      {tab === 'alerts' && (
        <div className="space-y-3">
          {broadcasts.length === 0 && (
            <Panel>
              <EmptyState title="No command alerts received" />
            </Panel>
          )}
          {broadcasts.map((broadcast) => {
            const ack = broadcast.my_ack;
            return (
              <Panel key={broadcast.id} bodyClassName="p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[12px] font-bold text-ink">{broadcast.title}</p>
                      <Badge
                        tone={
                          broadcast.priority === 'CRITICAL'
                            ? 'red'
                            : broadcast.priority === 'IMPORTANT'
                              ? 'yellow'
                              : 'neutral'
                        }
                      >
                        {broadcast.priority}
                      </Badge>
                      <Badge tone="info">{broadcast.category.replaceAll('_', ' ')}</Badge>
                    </div>
                    <p className="mt-1 text-[11px] leading-relaxed text-ink/80">{broadcast.message}</p>
                    <p className="mt-1 text-[10px] text-muted">
                      {broadcast.issued_by_name || 'Command'} · {fmtDateTime(broadcast.created_at)}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge tone={ack?.ack_status === 'RECEIVED' ? 'green' : 'yellow'}>
                      {ack?.ack_status === 'RECEIVED' ? 'Receipt acknowledged' : 'Receipt pending'}
                    </Badge>
                    <Badge tone={ack?.compliance_status === 'ACTION_TAKEN' ? 'green' : 'neutral'}>
                      {ack?.compliance_status?.replaceAll('_', ' ') || 'PENDING'}
                    </Badge>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {ack?.ack_status !== 'RECEIVED' && (
                    <Button variant="primary" onClick={() => acknowledge(broadcast, false)} disabled={saving}>
                      <CheckCircle2 size={12} /> Acknowledge receipt
                    </Button>
                  )}
                  {ack?.compliance_status !== 'ACTION_TAKEN' && (
                    <Button
                      onClick={() => {
                        setAckTarget(broadcast);
                        setAckNotes(ack?.action_notes || '');
                      }}
                    >
                      Mark action taken
                    </Button>
                  )}
                  {ack?.action_notes && (
                    <p className="w-full text-[10px] text-muted">Notes: {ack.action_notes}</p>
                  )}
                </div>
              </Panel>
            );
          })}
        </div>
      )}

      {tab === 'inspections' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Record site inspection" subtitle="Daily or surprise supervisory visit">
            <form onSubmit={submitInspection} className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Location">
                  <select
                    className="input"
                    required
                    value={inspectionForm.post_id}
                    onChange={(event) =>
                      setInspectionForm({ ...inspectionForm, post_id: event.target.value })
                    }
                  >
                    <option value="">Select location</option>
                    {locations.map((site) => (
                      <option key={site.id} value={site.id}>
                        {site.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Type">
                  <select
                    className="input"
                    value={inspectionForm.inspection_type}
                    onChange={(event) =>
                      setInspectionForm({ ...inspectionForm, inspection_type: event.target.value })
                    }
                  >
                    <option value="DAILY">DAILY</option>
                    <option value="SURPRISE">SURPRISE</option>
                  </select>
                </Field>
                <Field label="Score (1–5)">
                  <input
                    type="number"
                    min="1"
                    max="5"
                    className="input"
                    value={inspectionForm.score}
                    onChange={(event) =>
                      setInspectionForm({ ...inspectionForm, score: event.target.value })
                    }
                  />
                </Field>
                <Field label="Security preparedness">
                  <select
                    className="input"
                    value={inspectionForm.security_preparedness}
                    onChange={(event) =>
                      setInspectionForm({
                        ...inspectionForm,
                        security_preparedness: event.target.value,
                      })
                    }
                  >
                    <option value="EXCELLENT">EXCELLENT</option>
                    <option value="ADEQUATE">ADEQUATE</option>
                    <option value="NEEDS_IMPROVEMENT">NEEDS IMPROVEMENT</option>
                  </select>
                </Field>
              </div>
              <div className="flex flex-wrap gap-4 text-[11px] text-ink">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={inspectionForm.turnout_uniform_ok}
                    onChange={(event) =>
                      setInspectionForm({ ...inspectionForm, turnout_uniform_ok: event.target.checked })
                    }
                  />
                  Turnout / uniform correct
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={inspectionForm.attendance_verified}
                    onChange={(event) =>
                      setInspectionForm({ ...inspectionForm, attendance_verified: event.target.checked })
                    }
                  />
                  Attendance verified
                </label>
              </div>
              <Field label="Client feedback">
                <input
                  className="input"
                  value={inspectionForm.client_feedback}
                  onChange={(event) =>
                    setInspectionForm({ ...inspectionForm, client_feedback: event.target.value })
                  }
                />
              </Field>
              <Field label="Deficiencies identified">
                <textarea
                  className="input min-h-16"
                  value={inspectionForm.deficiencies}
                  onChange={(event) =>
                    setInspectionForm({ ...inspectionForm, deficiencies: event.target.value })
                  }
                />
              </Field>
              <Field label="Corrective action taken">
                <textarea
                  className="input min-h-16"
                  value={inspectionForm.corrective_action}
                  onChange={(event) =>
                    setInspectionForm({ ...inspectionForm, corrective_action: event.target.value })
                  }
                />
              </Field>
              <Button type="submit" variant="primary" disabled={saving}>
                {saving ? 'Saving…' : 'Log inspection'}
              </Button>
            </form>
          </Panel>

          <Panel title="Inspection log" subtitle="Recent supervisory visits in your zone">
            {inspections.length === 0 && <EmptyState title="No inspections recorded" />}
            <ul className="divide-y divide-line/60">
              {inspections.slice(0, 10).map((inspection) => (
                <li key={inspection.id} className="py-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] font-semibold text-ink">{inspection.post_name}</p>
                    <Badge tone={inspection.score >= 4 ? 'green' : inspection.score >= 3 ? 'yellow' : 'red'}>
                      {inspection.score ?? '—'}/5
                    </Badge>
                  </div>
                  <p className="text-[10px] text-muted">
                    {inspection.inspection_type} · {fmtDateTime(inspection.inspected_at)} ·{' '}
                    {inspection.supervisor_name || 'Supervisor'}
                  </p>
                  {inspection.deficiencies && (
                    <p className="text-[10px] text-amber-700">{inspection.deficiencies}</p>
                  )}
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      )}

      {tab === 'incidents' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Report incident / client complaint">
            <form onSubmit={submitIncident} className="space-y-3">
              <Field label="Location">
                <select
                  className="input"
                  required
                  value={incidentForm.post_id}
                  onChange={(event) => setIncidentForm({ ...incidentForm, post_id: event.target.value })}
                >
                  <option value="">Select location</option>
                  {locations.map((site) => (
                    <option key={site.id} value={site.id}>
                      {site.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Incident type">
                <select
                  className="input"
                  value={incidentForm.incident_type}
                  onChange={(event) =>
                    setIncidentForm({ ...incidentForm, incident_type: event.target.value })
                  }
                >
                  {INCIDENT_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type.replaceAll('_', ' ')}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Immediate action taken">
                <textarea
                  className="input min-h-20"
                  required
                  value={incidentForm.immediate_action}
                  onChange={(event) =>
                    setIncidentForm({ ...incidentForm, immediate_action: event.target.value })
                  }
                />
              </Field>
              <Button type="submit" variant="primary" disabled={saving}>
                {saving ? 'Reporting…' : 'Report to command'}
              </Button>
            </form>
          </Panel>
          <Panel title="Zone incident register">
            <IncidentPanel incidents={incidents} onChanged={load} compact />
          </Panel>
        </div>
      )}

      {tab === 'team' && (
        <TeamPanel role="SUPERVISOR" locations={locations} onChanged={load} />
      )}

      {tab === 'weapons' && (
        <Panel title="Zone weapons — physical verification" subtitle="Verify serial, condition and ammunition count">
          <ArmouryPanel
            weapons={weapons}
            guards={guards}
            locations={locations}
            onChanged={load}
            canIssue={false}
          />
        </Panel>
      )}

      <RosterDrawer
        locationId={rosterSite?.id}
        open={Boolean(rosterSite)}
        onClose={() => setRosterSite(null)}
        canVerify
        guards={guards}
        onChanged={load}
      />

      <Modal
        open={Boolean(ackTarget)}
        onClose={() => setAckTarget(null)}
        title="Mark action taken"
        subtitle={ackTarget?.title}
        footer={
          <>
            <Button variant="ghost" onClick={() => setAckTarget(null)}>
              Cancel
            </Button>
            <Button variant="primary" disabled={saving} onClick={() => acknowledge(ackTarget, true)}>
              {saving ? 'Saving…' : 'Confirm action taken'}
            </Button>
          </>
        }
      >
        <Field label="Action notes" hint="What was done at site level?">
          <textarea
            className="input min-h-24"
            value={ackNotes}
            onChange={(event) => setAckNotes(event.target.value)}
          />
        </Field>
      </Modal>

      {toast && (
        <div className="fixed bottom-4 right-4 z-[1200] max-w-sm animate-slide-in rounded-xl border border-accent/40 bg-panel px-3 py-2 text-[11px] text-ink shadow-xl">
          {toast}
        </div>
      )}
    </div>
  );
}
