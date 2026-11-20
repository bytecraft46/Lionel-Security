import React, { useMemo, useState } from 'react';
import { RotateCcw, ShieldCheck, UserCheck } from 'lucide-react';
import { api } from '../../lib/http';
import { fmtDate } from '../../lib/format';
import {
  Badge,
  Button,
  EmptyState,
  ErrorBanner,
  Field,
  Modal,
  StatusBadge,
} from '../../components/ui';

export default function ArmouryPanel({
  weapons = [],
  guards = [],
  locations = [],
  onChanged,
  compact,
  canManage = true,
  canIssue = true,
}) {
  const [verifyTarget, setVerifyTarget] = useState(null);
  const [issueTarget, setIssueTarget] = useState(null);
  const [assignMode, setAssignMode] = useState('GUARD');
  const [assignForm, setAssignForm] = useState({ guard_id: '', post_id: '', notes: '' });
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [form, setForm] = useState({ condition: 'SERVICEABLE', ammunition_count: 0, discrepancy: false, notes: '' });

  const guardOptions = useMemo(
    () =>
      [...guards].sort((a, b) => (a.full_name || '').localeCompare(b.full_name || '')),
    [guards],
  );

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      await api(`/api/weapons/${verifyTarget.id}/verify`, {
        method: 'POST',
        body: {
          condition: form.condition,
          ammunition_count: Number(form.ammunition_count),
          discrepancy: form.discrepancy,
          notes: form.notes,
        },
      });
      setVerifyTarget(null);
      onChanged?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function openIssue(weapon) {
    setIssueTarget(weapon);
    setAssignMode('GUARD');
    setAssignForm({
      guard_id: guardOptions[0]?.id || '',
      post_id: locations[0]?.id || '',
      notes: '',
    });
  }

  async function submitIssue() {
    setSaving(true);
    setError(null);
    try {
      const body = { notes: assignForm.notes };
      if (assignMode === 'GUARD') {
        if (!assignForm.guard_id) {
          setError('Select a guard.');
          return;
        }
        body.guard_id = assignForm.guard_id;
      } else {
        if (!assignForm.post_id) {
          setError('Select a location.');
          return;
        }
        body.post_id = assignForm.post_id;
      }
      await api(`/api/weapons/${issueTarget.id}/issue`, { method: 'POST', body });
      setIssueTarget(null);
      onChanged?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function returnWeapon(weapon) {
    setBusyId(weapon.id);
    setError(null);
    try {
      await api(`/api/weapons/${weapon.id}/return`, { method: 'POST', body: {} });
      onChanged?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  if (!weapons.length) return <EmptyState title="No weapons in scope" />;

  return (
    <div className="space-y-2">
      <ErrorBanner message={error} onDismiss={() => setError(null)} />
      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="table-base">
          <thead>
            <tr>
              <th>Serial</th>
              <th>Type</th>
              <th>Status</th>
              <th>Allotted to</th>
              <th>Location</th>
              <th>Ammo</th>
              <th>Licence</th>
              {canManage && <th />}
            </tr>
          </thead>
          <tbody>
            {weapons.slice(0, compact ? 5 : 200).map((weapon) => (
              <tr key={weapon.id}>
                <td className="font-mono">{weapon.serial_number}</td>
                <td>
                  {weapon.weapon_type}
                  <span className="block text-[10px] text-muted">{weapon.make_model}</span>
                </td>
                <td>
                  <StatusBadge status={weapon.armoury_status} />
                </td>
                <td>{weapon.issued_to_name || (weapon.armoury_status === 'ISSUED' ? 'Location only' : '—')}</td>
                <td>{weapon.assigned_post_name || '—'}</td>
                <td className="font-mono">{weapon.ammunition_count}</td>
                <td>
                  <span className="font-mono text-[10px]">{fmtDate(weapon.licence_expiry_date)}</span>
                  {weapon.licence_expiring_soon && (
                    <Badge tone="yellow" className="ml-1">
                      Expiring
                    </Badge>
                  )}
                </td>
                {canManage && (
                <td>
                  <div className="flex flex-wrap items-center gap-1">
                    {weapon.armoury_status === 'ISSUED' ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => returnWeapon(weapon)}
                        disabled={busyId === weapon.id}
                      >
                        <RotateCcw size={12} /> {busyId === weapon.id ? 'Returning…' : 'Return'}
                      </Button>
                    ) : (
                      canIssue && (
                        <Button size="sm" variant="ghost" onClick={() => openIssue(weapon)}>
                          <UserCheck size={12} /> Allot
                        </Button>
                      )
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setVerifyTarget(weapon);
                        setForm({
                          condition: weapon.condition,
                          ammunition_count: weapon.ammunition_count,
                          discrepancy: false,
                          notes: '',
                        });
                      }}
                    >
                      <ShieldCheck size={12} /> Verify
                    </Button>
                  </div>
                </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal
        open={Boolean(issueTarget)}
        onClose={() => setIssueTarget(null)}
        title={`Allot weapon — ${issueTarget?.serial_number || ''}`}
        subtitle="Allot to a guard, or directly to a location/site."
        footer={
          <>
            <Button variant="ghost" onClick={() => setIssueTarget(null)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={submitIssue} disabled={saving}>
              {saving ? 'Saving…' : 'Allot weapon'}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="flex gap-1 rounded-lg border border-line p-1">
            {[
              { id: 'GUARD', label: 'Guard' },
              { id: 'LOCATION', label: 'Location' },
            ].map((option) => (
              <button
                key={option.id}
                type="button"
                className={`flex-1 rounded-md px-3 py-1.5 text-[11px] font-medium ${
                  assignMode === option.id ? 'bg-accent text-white' : 'text-muted hover:text-ink'
                }`}
                onClick={() => setAssignMode(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>

          {assignMode === 'GUARD' ? (
            <Field label="Guard" hint="The guard's assigned site is recorded as the location.">
              <select
                className="input"
                value={assignForm.guard_id}
                onChange={(event) => setAssignForm({ ...assignForm, guard_id: event.target.value })}
              >
                <option value="">Select a guard…</option>
                {guardOptions.map((guard) => (
                  <option key={guard.id} value={guard.id}>
                    {guard.full_name}
                    {guard.employee_id ? ` · ${guard.employee_id}` : ''}
                    {guard.assigned_post_name ? ` · ${guard.assigned_post_name}` : ''}
                  </option>
                ))}
              </select>
            </Field>
          ) : (
            <Field label="Location" hint="Weapon is held at this site without a named guard.">
              <select
                className="input"
                value={assignForm.post_id}
                onChange={(event) => setAssignForm({ ...assignForm, post_id: event.target.value })}
              >
                <option value="">Select a location…</option>
                {locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                    {location.zone_name ? ` · ${location.zone_name}` : ''}
                  </option>
                ))}
              </select>
            </Field>
          )}

          <Field label="Notes">
            <textarea
              className="input min-h-20"
              value={assignForm.notes}
              onChange={(event) => setAssignForm({ ...assignForm, notes: event.target.value })}
            />
          </Field>
        </div>
      </Modal>

      <Modal
        open={Boolean(verifyTarget)}
        onClose={() => setVerifyTarget(null)}
        title={`Physical verification — ${verifyTarget?.serial_number || ''}`}
        subtitle="Recorded in the weapon audit trail."
        footer={
          <>
            <Button variant="ghost" onClick={() => setVerifyTarget(null)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={submit} disabled={saving}>
              {saving ? 'Saving…' : 'Record verification'}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Condition">
              <select
                className="input"
                value={form.condition}
                onChange={(event) => setForm({ ...form, condition: event.target.value })}
              >
                <option>SERVICEABLE</option>
                <option>UNSERVICEABLE</option>
              </select>
            </Field>
            <Field label="Ammunition counted">
              <input
                type="number"
                min="0"
                className="input"
                value={form.ammunition_count}
                onChange={(event) => setForm({ ...form, ammunition_count: event.target.value })}
              />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-[11px] text-ink">
            <input
              type="checkbox"
              checked={form.discrepancy}
              onChange={(event) => setForm({ ...form, discrepancy: event.target.checked })}
            />
            Log a stock discrepancy
          </label>
          <Field label="Notes">
            <textarea
              className="input min-h-20"
              value={form.notes}
              onChange={(event) => setForm({ ...form, notes: event.target.value })}
            />
          </Field>
        </div>
      </Modal>
    </div>
  );
}
