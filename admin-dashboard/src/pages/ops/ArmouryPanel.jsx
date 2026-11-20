import React, { useMemo, useState } from 'react';
import { Plus, RotateCcw, ShieldCheck, UserCheck } from 'lucide-react';
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

const EMPTY_ALLOCATION = {
  mode: 'GUARD',
  weapon_id: '',
  zone_id: '',
  area: '',
  guard_id: '',
  location: '',
  lat: '',
  lng: '',
  client_name: '',
};

export default function ArmouryPanel({
  weapons = [],
  guards = [],
  locations = [],
  zones = [],
  onChanged,
  compact,
  canManage = true,
  canIssue = true,
  canRegister = true,
}) {
  const [showArmForm, setShowArmForm] = useState(false);
  const [armSaving, setArmSaving] = useState(false);
  const [armForm, setArmForm] = useState({ weapon_type: '', make_model: '', serial_number: '', licence_number: '' });
  const [showAllocForm, setShowAllocForm] = useState(false);
  const [allocSaving, setAllocSaving] = useState(false);
  const [allocForm, setAllocForm] = useState(EMPTY_ALLOCATION);
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

  const availableArms = useMemo(
    () => weapons.filter((weapon) => weapon.armoury_status !== 'ISSUED'),
    [weapons],
  );

  const allocZone = useMemo(
    () => zones.find((zone) => zone.id === allocForm.zone_id),
    [zones, allocForm.zone_id],
  );
  const allocAreas = Array.isArray(allocZone?.areas) && allocZone.areas.length
    ? allocZone.areas
    : [];

  const allocGuards = useMemo(() => {
    const siteArea = (guard) => {
      const site = locations.find((location) => location.id === guard.assigned_post_id);
      return site?.area || '';
    };
    return guards
      .filter((guard) => {
        if (allocForm.zone_id && guard.zone_id !== allocForm.zone_id) return false;
        if (allocForm.area && siteArea(guard) !== allocForm.area) return false;
        return true;
      })
      .sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''));
  }, [guards, locations, allocForm.zone_id, allocForm.area]);

  async function submitAllocation(event) {
    event.preventDefault();
    if (!allocForm.weapon_id) {
      setError('Select an arm to allocate.');
      return;
    }
    if (allocForm.mode === 'GUARD' && !allocForm.guard_id) {
      setError('Select a guard.');
      return;
    }
    if (allocForm.mode === 'LOCATION') {
      if (!allocForm.location.trim()) {
        setError('Enter a location or area.');
        return;
      }
      if (allocForm.lat === '' || allocForm.lng === '') {
        setError('Enter the latitude and longitude.');
        return;
      }
      if (!allocForm.client_name.trim()) {
        setError('Enter the client.');
        return;
      }
    }
    setAllocSaving(true);
    setError(null);
    try {
      const body =
        allocForm.mode === 'GUARD'
          ? { guard_id: allocForm.guard_id }
          : {
              location: allocForm.location,
              lat: Number(allocForm.lat),
              lng: Number(allocForm.lng),
              client_name: allocForm.client_name,
            };
      await api(`/api/weapons/${allocForm.weapon_id}/issue`, { method: 'POST', body });
      setAllocForm(EMPTY_ALLOCATION);
      setShowAllocForm(false);
      onChanged?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setAllocSaving(false);
    }
  }

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

  async function submitArm(event) {
    event.preventDefault();
    setArmSaving(true);
    setError(null);
    try {
      await api('/api/weapons', {
        method: 'POST',
        body: {
          weapon_type: armForm.weapon_type,
          make_model: armForm.make_model,
          serial_number: armForm.serial_number,
          licence_number: armForm.licence_number,
          ammunition_count: 0,
        },
      });
      setArmForm({ weapon_type: '', make_model: '', serial_number: '', licence_number: '' });
      setShowArmForm(false);
      onChanged?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setArmSaving(false);
    }
  }

  const canAddArm = canManage && canRegister;
  const canAllocate = canManage && canIssue;

  return (
    <div className="space-y-2">
      <ErrorBanner message={error} onDismiss={() => setError(null)} />
      {(canAddArm || canAllocate) && (
        <div className="flex flex-wrap justify-end gap-2">
          {canAllocate && (
            <Button
              size="sm"
              variant="ghost"
              disabled={!availableArms.length}
              onClick={() => setShowAllocForm((open) => !open)}
            >
              <UserCheck size={12} /> Allocate arm
            </Button>
          )}
          {canAddArm && (
            <Button size="sm" variant="ghost" onClick={() => setShowArmForm((open) => !open)}>
              <Plus size={12} /> Register arm
            </Button>
          )}
        </div>
      )}
      {canAddArm && showArmForm && (
        <form
          className="space-y-3 rounded-xl border border-line bg-panelAlt/60 p-3"
          onSubmit={submitArm}
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Arm name">
              <input
                className="input"
                required
                placeholder="e.g. AK-47"
                value={armForm.weapon_type}
                onChange={(event) => setArmForm({ ...armForm, weapon_type: event.target.value })}
              />
            </Field>
            <Field label="Make and model">
              <input
                className="input"
                required
                placeholder="e.g. Norinco Type 56"
                value={armForm.make_model}
                onChange={(event) => setArmForm({ ...armForm, make_model: event.target.value })}
              />
            </Field>
            <Field label="Registration number">
              <input
                className="input"
                required
                placeholder="e.g. LS-ARM-0001"
                value={armForm.serial_number}
                onChange={(event) => setArmForm({ ...armForm, serial_number: event.target.value })}
              />
            </Field>
            <Field label="Licence number">
              <input
                className="input"
                required
                placeholder="e.g. LIC-2026-0001"
                value={armForm.licence_number}
                onChange={(event) => setArmForm({ ...armForm, licence_number: event.target.value })}
              />
            </Field>
          </div>
          <div className="flex items-center gap-2">
            <Button type="submit" variant="primary" size="sm" disabled={armSaving}>
              {armSaving ? 'Registering…' : 'Register arm'}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={armSaving}
              onClick={() => {
                setArmForm({ weapon_type: '', make_model: '', serial_number: '', licence_number: '' });
                setShowArmForm(false);
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}
      {canAllocate && showAllocForm && (
        <form
          className="space-y-3 rounded-xl border border-line bg-panelAlt/60 p-3"
          onSubmit={submitAllocation}
        >
          <div className="flex gap-1 rounded-lg border border-line p-1">
            {[
              { id: 'GUARD', label: 'Guard' },
              { id: 'LOCATION', label: 'Location' },
            ].map((option) => (
              <button
                key={option.id}
                type="button"
                className={`flex-1 rounded-md px-3 py-1.5 text-[11px] font-medium ${
                  allocForm.mode === option.id ? 'bg-accent text-white' : 'text-muted hover:text-ink'
                }`}
                onClick={() => setAllocForm({ ...allocForm, mode: option.id })}
              >
                Allocation to {option.label.toLowerCase()}
              </button>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Arm" hint={availableArms.length ? undefined : 'Every registered arm is already allocated.'}>
              <select
                className="input"
                required
                value={allocForm.weapon_id}
                onChange={(event) => setAllocForm({ ...allocForm, weapon_id: event.target.value })}
              >
                <option value="">Select an arm…</option>
                {availableArms.map((weapon) => (
                  <option key={weapon.id} value={weapon.id}>
                    {weapon.weapon_type} · {weapon.serial_number}
                    {weapon.make_model ? ` · ${weapon.make_model}` : ''}
                  </option>
                ))}
              </select>
            </Field>

            {allocForm.mode === 'GUARD' ? (
              <>
                <Field label="Zone">
                  <select
                    className="input"
                    value={allocForm.zone_id}
                    onChange={(event) =>
                      setAllocForm({
                        ...allocForm,
                        zone_id: event.target.value,
                        area: '',
                        guard_id: '',
                      })
                    }
                  >
                    <option value="">Select a zone…</option>
                    {zones.map((zone) => (
                      <option key={zone.id} value={zone.id}>
                        {zone.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Area" hint={allocForm.zone_id ? undefined : 'Select a zone first.'}>
                  <select
                    className="input"
                    disabled={!allocForm.zone_id}
                    value={allocForm.area}
                    onChange={(event) =>
                      setAllocForm({ ...allocForm, area: event.target.value, guard_id: '' })
                    }
                  >
                    <option value="">All areas</option>
                    {allocAreas.map((area) => (
                      <option key={area} value={area}>
                        {area}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Guard" hint="Guards registered in the selected zone and area.">
                  <select
                    className="input"
                    required
                    disabled={!allocForm.zone_id}
                    value={allocForm.guard_id}
                    onChange={(event) => setAllocForm({ ...allocForm, guard_id: event.target.value })}
                  >
                    <option value="">{allocForm.zone_id ? 'Select a guard…' : 'Select a zone first…'}</option>
                    {allocGuards.map((guard) => (
                      <option key={guard.id} value={guard.id}>
                        {guard.full_name}
                        {guard.employee_id ? ` · ${guard.employee_id}` : ''}
                        {guard.assigned_post_name ? ` · ${guard.assigned_post_name}` : ''}
                      </option>
                    ))}
                  </select>
                </Field>
              </>
            ) : (
              <>
                <Field label="Location or area">
                  <input
                    className="input"
                    required
                    placeholder="e.g. DHA Phase 4-6"
                    value={allocForm.location}
                    onChange={(event) => setAllocForm({ ...allocForm, location: event.target.value })}
                  />
                </Field>
                <Field label="Latitude">
                  <input
                    className="input"
                    required
                    type="number"
                    step="any"
                    placeholder="24.8607"
                    value={allocForm.lat}
                    onChange={(event) => setAllocForm({ ...allocForm, lat: event.target.value })}
                  />
                </Field>
                <Field label="Longitude">
                  <input
                    className="input"
                    required
                    type="number"
                    step="any"
                    placeholder="67.0011"
                    value={allocForm.lng}
                    onChange={(event) => setAllocForm({ ...allocForm, lng: event.target.value })}
                  />
                </Field>
                <Field label="Client">
                  <input
                    className="input"
                    required
                    placeholder="e.g. Kings Apparel"
                    value={allocForm.client_name}
                    onChange={(event) =>
                      setAllocForm({ ...allocForm, client_name: event.target.value })
                    }
                  />
                </Field>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button type="submit" variant="primary" size="sm" disabled={allocSaving}>
              {allocSaving ? 'Allocating…' : 'Allocate arm'}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={allocSaving}
              onClick={() => {
                setAllocForm(EMPTY_ALLOCATION);
                setShowAllocForm(false);
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}
      {!weapons.length ? (
        <EmptyState
          title="No arms registered"
          hint="Register an arm with its make, model, registration and licence number."
        />
      ) : (
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
                <td>
                  {weapon.assigned_post_name || weapon.alloc_location || '—'}
                  {weapon.alloc_area && (
                    <span className="block text-[10px] text-muted">{weapon.alloc_area}</span>
                  )}
                </td>
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
      )}

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
