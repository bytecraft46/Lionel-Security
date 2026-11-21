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
import AttendanceDetailModal from '../../components/ui/AttendanceDetailModal';
import GuardTrendPanel from '../../components/ui/GuardTrendPanel';
import RosterDrawer from '../shared/RosterDrawer';
import TeamPanel from '../shared/TeamPanel';
import IncidentPanel from '../ops/IncidentPanel';
import ArmouryPanel from '../ops/ArmouryPanel';
import CheckInOutPanel from '../shared/CheckInOutPanel';
import OverdueCheckInAlerts from '../shared/OverdueCheckInAlerts';

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
  const [modalType, setModalType] = useState(null);
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
    setToast(`📣 Command Broadcast: ${broadcast.title}`);
    scheduleRefresh();
  });
  useSocketEvent('ATTENDANCE_PUNCHED', () => scheduleRefresh());
  useSocketEvent('INCIDENT_BROADCAST', (incident) => {
    setToast(
      `🚨 ${(incident.incident_type || 'ALERT').replaceAll('_', ' ')} at ${
        incident.post_name || 'deployed site'
      }${incident.zone_name ? ` · ${incident.zone_name}` : ''}`,
    );
    scheduleRefresh();
  });

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
      <div className="p-8">
        <Spinner label="Loading Sector Roster..." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      {(tab === 'locations' || !tab) && (
        <>
      {/* Top Banner / Actions Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-800">Zone Field Desk</h2>
          <p className="text-xs text-muted">
            Zone: <span className="font-semibold text-slate-700">{user.zone_names?.join(' · ') || 'Assigned Zone'}</span> · {fmtDate(overview?.date)}
          </p>
        </div>
        <Button variant="ghost" onClick={load} className="border border-line bg-white hover:bg-slate-50">
          <RefreshCw size={13} /> Sync Zone
        </Button>
      </div>

      <OverdueCheckInAlerts />

      {/* Attendance & Strength Summary Header (matching user's screenshot) */}
      <div>
        <div className="flex items-center justify-between pb-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">Attendance Summary</h3>
          <span className="text-xs font-medium text-muted">Sector Strength</span>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Kpi
            label="Assigned Locations"
            value={kpis.total_locations ?? '—'}
            tone="neutral"
            onClick={() => setModalType('VACANT')}
          />
          <Kpi
            label="Guards in Sector"
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
            label="Active Incidents"
            value={kpis.active_emergencies ?? '0'}
            tone={kpis.active_emergencies > 0 ? "red" : "neutral"}
            onClick={() => setModalType('EMERGENCIES')}
          />
        </div>
      </div>

        </>
      )}

      {(tab === 'locations' || !tab) && (
        <>
          <GuardTrendPanel
            role="SUPERVISOR"
            zones={overview?.zones || []}
            locations={locations}
            guards={guards}
          />

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {locations.map((site) => (
              <Panel key={site.id} bodyClassName="p-4 bg-white transition-all hover:shadow-card">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-bold text-slate-800">{site.name}</p>
                    <p className="truncate text-[10px] text-muted">{site.client_name || 'Client site'}</p>
                  </div>
                  <RagDot status={site.computed_status} />
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted">
                    Present / Shift required
                  </span>
                  <span className="font-mono text-sm font-bold text-slate-800">
                    {site.present_count}/{site.required_strength}
                  </span>
                </div>
                <div className="mt-2">
                  <ProgressBar
                    value={site.required_strength ? site.present_count / site.required_strength : 0}
                    tone={site.computed_status === 'RED' ? 'red' : site.computed_status === 'YELLOW' ? 'yellow' : 'green'}
                  />
                </div>
                <div className="mt-3.5 flex items-center justify-between border-t border-line pt-2.5">
                  <div className="flex gap-1.5">
                    <Badge tone={site.vacant > 0 ? 'red' : 'green'}>{site.vacant} Vacant</Badge>
                    <Badge tone="info">{site.on_leave_count} Leave</Badge>
                  </div>
                  <Button size="sm" variant="primary" onClick={() => setRosterSite(site)}>
                    <ClipboardCheck size={12} /> Shift Roster
                  </Button>
                </div>
              </Panel>
            ))}
            {locations.length === 0 && (
              <Panel className="md:col-span-2 xl:col-span-3">
                <EmptyState title="No locations assigned to your sector" />
              </Panel>
            )}
          </div>
        </>
      )}

      {tab === 'checkins' && (
        <CheckInOutPanel role="SUPERVISOR" zones={overview?.zones || []} locations={locations} />
      )}

      {tab === 'alerts' && (
        <div className="space-y-4">
          {broadcasts.length === 0 && (
            <Panel>
              <EmptyState title="No command alerts received" />
            </Panel>
          )}
          {broadcasts.map((broadcast) => {
            const ack = broadcast.my_ack;
            return (
              <Panel key={broadcast.id} bodyClassName="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-xs font-bold text-slate-800">{broadcast.title}</p>
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
                    <p className="mt-1 text-xs text-slate-600 leading-relaxed">{broadcast.message}</p>
                    <p className="mt-1 text-[10px] text-muted">
                      {broadcast.issued_by_name || 'Command'} · {fmtDateTime(broadcast.created_at)}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    <Badge tone={ack?.ack_status === 'RECEIVED' ? 'green' : 'yellow'}>
                      {ack?.ack_status === 'RECEIVED' ? 'Acknowledged' : 'Pending Receipt'}
                    </Badge>
                    <Badge tone={ack?.compliance_status === 'ACTION_TAKEN' ? 'green' : 'neutral'}>
                      {ack?.compliance_status?.replaceAll('_', ' ') || 'PENDING'}
                    </Badge>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {ack?.ack_status !== 'RECEIVED' && (
                    <Button variant="primary" size="sm" onClick={() => acknowledge(broadcast, false)} disabled={saving}>
                      <CheckCircle2 size={12} /> Acknowledge Receipt
                    </Button>
                  )}
                  {ack?.compliance_status !== 'ACTION_TAKEN' && (
                    <Button
                      size="sm"
                      onClick={() => {
                        setAckTarget(broadcast);
                        setAckNotes(ack?.action_notes || '');
                      }}
                    >
                      Mark Action Taken
                    </Button>
                  )}
                  {ack?.action_notes && (
                    <p className="w-full text-xs text-muted mt-1">Notes: {ack.action_notes}</p>
                  )}
                </div>
              </Panel>
            );
          })}
        </div>
      )}

      {tab === 'inspections' && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Panel title="Record Site Inspection" subtitle="Daily or surprise supervisory visit">
            <form onSubmit={submitInspection} className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Location">
                  <select
                    className="input"
                    required
                    value={inspectionForm.post_id}
                    onChange={(e) => setInspectionForm({ ...inspectionForm, post_id: e.target.value })}
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
                    onChange={(e) => setInspectionForm({ ...inspectionForm, inspection_type: e.target.value })}
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
                    onChange={(e) => setInspectionForm({ ...inspectionForm, score: e.target.value })}
                  />
                </Field>
                <Field label="Security Preparedness">
                  <select
                    className="input"
                    value={inspectionForm.security_preparedness}
                    onChange={(e) => setInspectionForm({ ...inspectionForm, security_preparedness: e.target.value })}
                  >
                    <option value="EXCELLENT">EXCELLENT</option>
                    <option value="ADEQUATE">ADEQUATE</option>
                    <option value="NEEDS_IMPROVEMENT">NEEDS IMPROVEMENT</option>
                  </select>
                </Field>
              </div>
              <div className="flex flex-wrap gap-4 text-xs text-slate-700 py-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={inspectionForm.turnout_uniform_ok}
                    onChange={(e) => setInspectionForm({ ...inspectionForm, turnout_uniform_ok: e.target.checked })}
                  />
                  Turnout / uniform correct
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={inspectionForm.attendance_verified}
                    onChange={(e) => setInspectionForm({ ...inspectionForm, attendance_verified: e.target.checked })}
                  />
                  Attendance physically verified
                </label>
              </div>
              <Field label="Client Feedback">
                <input
                  className="input"
                  value={inspectionForm.client_feedback}
                  onChange={(e) => setInspectionForm({ ...inspectionForm, client_feedback: e.target.value })}
                />
              </Field>
              <Field label="Deficiencies Identified">
                <textarea
                  className="input min-h-16"
                  value={inspectionForm.deficiencies}
                  onChange={(e) => setInspectionForm({ ...inspectionForm, deficiencies: e.target.value })}
                />
              </Field>
              <Field label="Corrective Action Taken">
                <textarea
                  className="input min-h-16"
                  value={inspectionForm.corrective_action}
                  onChange={(e) => setInspectionForm({ ...inspectionForm, corrective_action: e.target.value })}
                />
              </Field>
              <Button type="submit" variant="primary" disabled={saving}>
                {saving ? 'Saving…' : 'Log Inspection'}
              </Button>
            </form>
          </Panel>

          <Panel title="Recent Inspection Log" subtitle="Supervisor visits in your sector">
            {inspections.length === 0 && <EmptyState title="No inspections recorded" />}
            <ul className="divide-y divide-line">
              {inspections.slice(0, 10).map((inspection) => (
                <li key={inspection.id} className="py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-slate-800">{inspection.post_name}</p>
                    <Badge tone={inspection.score >= 4 ? 'green' : inspection.score >= 3 ? 'yellow' : 'red'}>
                      {inspection.score ?? '—'}/5 Score
                    </Badge>
                  </div>
                  <p className="text-[10px] text-muted mt-0.5">
                    {inspection.inspection_type} · {fmtDateTime(inspection.inspected_at)} · {inspection.supervisor_name || 'Supervisor'}
                  </p>
                  {inspection.deficiencies && (
                    <p className="text-xs text-amber-700 mt-1">{inspection.deficiencies}</p>
                  )}
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      )}

      {tab === 'incidents' && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Panel title="Report Incident / Complaint">
            <form onSubmit={submitIncident} className="space-y-3">
              <Field label="Location">
                <select
                  className="input"
                  required
                  value={incidentForm.post_id}
                  onChange={(e) => setIncidentForm({ ...incidentForm, post_id: e.target.value })}
                >
                  <option value="">Select location</option>
                  {locations.map((site) => (
                    <option key={site.id} value={site.id}>
                      {site.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Incident Type">
                <select
                  className="input"
                  value={incidentForm.incident_type}
                  onChange={(e) => setIncidentForm({ ...incidentForm, incident_type: e.target.value })}
                >
                  {INCIDENT_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type.replaceAll('_', ' ')}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Immediate Action Taken">
                <textarea
                  className="input min-h-24"
                  required
                  value={incidentForm.immediate_action}
                  onChange={(e) => setIncidentForm({ ...incidentForm, immediate_action: e.target.value })}
                />
              </Field>
              <Button type="submit" variant="primary" disabled={saving}>
                {saving ? 'Reporting…' : 'Report Incident to Command'}
              </Button>
            </form>
          </Panel>
          <Panel title="Sector Incident Register">
            <IncidentPanel incidents={incidents} onChanged={load} compact />
          </Panel>
        </div>
      )}

      {tab === 'team' && (
        <TeamPanel role="SUPERVISOR" locations={locations} onChanged={load} />
      )}

      {tab === 'weapons' && (
        <Panel title="Sector Weapons Verification" subtitle="Verify serial, condition and ammunition count">
          <ArmouryPanel
            weapons={weapons}
            guards={guards}
            locations={locations}
            onChanged={load}
            canIssue={false}
            canRegister={false}
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

      <AttendanceDetailModal
        type={modalType}
        onClose={() => setModalType(null)}
        guards={guards}
        locations={locations}
        zones={overview?.zones || []}
        weapons={weapons}
        incidents={incidents}
        leave={[]}
        onDutyIds={overview?.on_duty_ids || []}
        absentIds={overview?.absent_ids || []}
      />

      <Modal
        open={Boolean(ackTarget)}
        onClose={() => setAckTarget(null)}
        title="Mark Action Taken"
        subtitle={ackTarget?.title}
        footer={
          <>
            <Button variant="ghost" onClick={() => setAckTarget(null)}>
              Cancel
            </Button>
            <Button variant="primary" disabled={saving} onClick={() => acknowledge(ackTarget, true)}>
              {saving ? 'Saving…' : 'Confirm Action'}
            </Button>
          </>
        }
      >
        <Field label="Action Notes" hint="Detail actions executed at post">
          <textarea
            className="input min-h-24"
            value={ackNotes}
            onChange={(e) => setAckNotes(e.target.value)}
          />
        </Field>
      </Modal>

      {toast && (
        <div className="fixed bottom-5 right-5 z-[1200] max-w-sm rounded-2xl border border-slate-200 bg-white p-4 shadow-xl">
          <p className="text-xs font-semibold text-slate-800">{toast}</p>
        </div>
      )}
    </div>
  );
}
