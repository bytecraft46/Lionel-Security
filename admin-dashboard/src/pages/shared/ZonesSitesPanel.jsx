import React, { useCallback, useEffect, useState } from 'react';
import { Pencil, Plus, RefreshCw, Trash2, Users, X } from 'lucide-react';
import { api } from '../../lib/http';
import { Badge, Button, EmptyState, ErrorBanner, Field, Modal, Panel, RagDot, StatusBadge } from '../../components/ui';

const EMPTY_FORM = { name: '', code: '', areas: [], supervisor_id: '' };
const EMPTY_SITE_FORM = {
  name: '',
  client_name: '',
  area: '',
  required_strength: '1',
  zone_id: '',
  lat: '',
  lng: '',
};

function formFromZone(zone) {
  const areas = Array.isArray(zone.areas) && zone.areas.length
    ? zone.areas
    : zone.description
      ? [zone.description]
      : [];
  return {
    name: zone.name || '',
    code: zone.code || '',
    areas,
    supervisor_id: zone.supervisor_id || '',
  };
}

export default function ZonesSitesPanel({ zones = [], locations = [], onChanged }) {
  const [supervisors, setSupervisors] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [areaDraft, setAreaDraft] = useState('');
  const [editingZone, setEditingZone] = useState(null);
  const [saving, setSaving] = useState(false);
  const [busyZone, setBusyZone] = useState(null);
  const [siteForm, setSiteForm] = useState(EMPTY_SITE_FORM);
  const siteAreas = zones.find((zone) => zone.id === siteForm.zone_id)?.areas || [];
  const [showSiteForm, setShowSiteForm] = useState(false);
  const [siteSaving, setSiteSaving] = useState(false);
  const [guardSite, setGuardSite] = useState(null);
  const [guardList, setGuardList] = useState([]);
  const [guardBusyId, setGuardBusyId] = useState(null);
  const [guardSearch, setGuardSearch] = useState('');
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  const loadSupervisors = useCallback(async () => {
    try {
      const data = await api('/api/users');
      setSupervisors((data.users || []).filter((user) => user.role === 'SUPERVISOR'));
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    loadSupervisors();
  }, [loadSupervisors]);

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function resetForm() {
    setForm(EMPTY_FORM);
    setAreaDraft('');
    setEditingZone(null);
  }

  function addArea() {
    const area = areaDraft.trim();
    if (!area) return;
    setForm((current) =>
      current.areas.some((row) => row.toLowerCase() === area.toLowerCase())
        ? current
        : { ...current, areas: [...current.areas, area] },
    );
    setAreaDraft('');
  }

  function removeArea(area) {
    setForm((current) =>
      ({ ...current, areas: current.areas.filter((row) => row !== area) }),
    );
  }

  function startEdit(zone) {
    setEditingZone(zone);
    setForm(formFromZone(zone));
    setAreaDraft('');
    setError(null);
    setNotice(null);
  }

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);
    const payload = {
      name: form.name,
      code: form.code,
      areas: form.areas,
      supervisor_id: form.supervisor_id || null,
    };
    try {
      if (editingZone) {
        await api(`/api/zones/${editingZone.id}`, { method: 'PATCH', body: payload });
        setNotice(`Zone "${form.name.trim()}" updated.`);
      } else {
        await api('/api/zones', { method: 'POST', body: payload });
        setNotice(`Zone "${form.name.trim()}" created.`);
      }
      resetForm();
      onChanged?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function assignSupervisor(zone, supervisorId) {
    setBusyZone(zone.id);
    setError(null);
    setNotice(null);
    try {
      await api(`/api/zones/${zone.id}`, {
        method: 'PATCH',
        body: { supervisor_id: supervisorId || null },
      });
      setNotice(
        supervisorId
          ? `${zone.name} assigned to ${supervisors.find((row) => row.id === supervisorId)?.full_name || 'supervisor'}.`
          : `${zone.name} unassigned.`,
      );
      onChanged?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyZone(null);
    }
  }

  function updateSite(field, value) {
    setSiteForm((current) => ({ ...current, [field]: value }));
  }

  async function submitSite(event) {
    event.preventDefault();
    setSiteSaving(true);
    setError(null);
    setNotice(null);
    try {
      const result = await api('/api/locations', {
        method: 'POST',
        body: {
          zone_id: siteForm.zone_id,
          name: siteForm.name,
          client_name: siteForm.client_name,
          area: siteForm.area,
          required_strength: Number(siteForm.required_strength) || 0,
          lat: siteForm.lat === '' ? null : Number(siteForm.lat),
          lng: siteForm.lng === '' ? null : Number(siteForm.lng),
        },
      });
      setNotice(result?.message || `Site "${siteForm.name}" added.`);
      setSiteForm(EMPTY_SITE_FORM);
      setShowSiteForm(false);
      onChanged?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSiteSaving(false);
    }
  }

  async function openSiteGuards(site) {
    setGuardSite(site);
    setGuardSearch('');
    setError(null);
    try {
      const data = await api('/api/guards');
      setGuardList(data.guards || []);
    } catch (err) {
      setError(err.message);
    }
  }

  async function setGuardSiteAssignment(guard, site) {
    setGuardBusyId(guard.id);
    setError(null);
    setNotice(null);
    try {
      await api(`/api/guards/${guard.id}`, {
        method: 'PUT',
        body: site
          ? { assigned_post_id: site.id, zone_id: site.zone_id }
          : { assigned_post_id: null },
      });
      const data = await api('/api/guards');
      setGuardList(data.guards || []);
      setNotice(
        site
          ? `${guard.full_name} added to ${site.name}.`
          : `${guard.full_name} moved to the relief pool.`,
      );
      onChanged?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardBusyId(null);
    }
  }

  async function deleteSite(site) {
    if (!window.confirm(`Delete site "${site.name}"? Its rosters and attendance go with it.`)) return;
    setError(null);
    setNotice(null);
    try {
      const result = await api(`/api/locations/${site.id}`, { method: 'DELETE' });
      setNotice(result?.message || `Site "${site.name}" deleted.`);
      onChanged?.();
    } catch (err) {
      setError(err.message);
    }
  }

  async function deleteZone(zone) {
    const sites = zone.location_count ?? 0;
    const confirmed = window.confirm(
      sites
        ? `Delete ${zone.name} and its ${sites} site(s)? Rosters and attendance for those sites go with it. This cannot be undone.`
        : `Delete ${zone.name}? This cannot be undone.`,
    );
    if (!confirmed) return;

    setBusyZone(zone.id);
    setError(null);
    setNotice(null);
    try {
      const result = await api(`/api/zones/${zone.id}`, { method: 'DELETE' });
      if (editingZone?.id === zone.id) resetForm();
      setNotice(result?.message || `Zone "${zone.name}" deleted.`);
      onChanged?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyZone(null);
    }
  }

  return (
    <div className="space-y-4">
      <ErrorBanner message={error} onDismiss={() => setError(null)} />
      {notice && (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] text-emerald-700">
          {notice}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel
          title={editingZone ? `Edit ${editingZone.name}` : 'Create zone'}
          subtitle={
            editingZone
              ? 'Rename the zone, change its areas or supervisor'
              : 'Add an operational zone and hand it to a supervisor'
          }
          actions={
            editingZone ? (
              <Button size="sm" variant="ghost" onClick={resetForm}>
                <X size={12} /> Cancel
              </Button>
            ) : (
              <Plus size={14} className="text-muted" />
            )
          }
        >
          <form className="space-y-3" onSubmit={submit}>
            <Field label="Zone name" hint="Short label, e.g. Zone 4">
              <input
                className="input"
                required
                value={form.name}
                onChange={(event) => update('name', event.target.value)}
              />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Code" hint="Optional">
                <input
                  className="input"
                  value={form.code}
                  onChange={(event) => update('code', event.target.value)}
                />
              </Field>
            </div>
            <Field label="Areas" hint="Areas covered by this zone">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    className="input"
                    placeholder="e.g. Korangi"
                    value={areaDraft}
                    onChange={(event) => setAreaDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        addArea();
                      }
                    }}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={!areaDraft.trim()}
                    onClick={addArea}
                  >
                    Add
                  </Button>
                </div>
                {form.areas.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {form.areas.map((area) => (
                      <span
                        key={area}
                        className="inline-flex items-center gap-1 rounded-full border border-line bg-panelAlt px-2 py-0.5 text-[10px] font-semibold text-ink"
                      >
                        {area}
                        <button
                          type="button"
                          aria-label={`Remove ${area}`}
                          className="text-muted hover:text-rose-600"
                          onClick={() => removeArea(area)}
                        >
                          <X size={10} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </Field>
            <Field label="Zone supervisor" hint="Can be assigned later">
              <select
                className="input"
                value={form.supervisor_id}
                onChange={(event) => update('supervisor_id', event.target.value)}
              >
                <option value="">Unassigned</option>
                {supervisors.map((supervisor) => (
                  <option key={supervisor.id} value={supervisor.id}>
                    {supervisor.full_name}
                  </option>
                ))}
              </select>
            </Field>
            <div className="flex items-center gap-2">
              <Button type="submit" variant="primary" disabled={saving}>
                {saving
                  ? editingZone
                    ? 'Saving…'
                    : 'Creating…'
                  : editingZone
                    ? 'Save changes'
                    : 'Create zone'}
              </Button>
              {editingZone && (
                <Button type="button" variant="ghost" onClick={resetForm} disabled={saving}>
                  Discard
                </Button>
              )}
            </div>
          </form>
        </Panel>

        <Panel
          className="lg:col-span-2"
          title="Zones & supervisor assignment"
          subtitle={`${zones.length} zones · ${zones.reduce((total, zone) => total + (zone.area_count ?? 0), 0)} areas · ${locations.length} sites`}
          actions={
            <Button size="sm" variant="ghost" onClick={onChanged}>
              <RefreshCw size={12} /> Refresh
            </Button>
          }
        >
          {zones.length === 0 ? (
            <EmptyState title="No zones yet" hint="Create a zone to start deploying sites." />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-line">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Zone</th>
                    <th>Code</th>
                    <th>Areas</th>
                    <th>Sites</th>
                    <th>Strength</th>
                    <th>Status</th>
                    <th>Supervisor</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {zones.map((zone) => (
                    <tr key={zone.id}>
                      <td>
                        <span className="font-semibold">{zone.name}</span>
                      </td>
                      <td className="font-mono text-[10px] text-muted">{zone.code || '—'}</td>
                      <td className="font-mono">{zone.area_count ?? 0}</td>
                      <td className="font-mono">{zone.location_count ?? 0}</td>
                      <td className="font-mono">
                        {zone.present_count}/{zone.required_strength}
                      </td>
                      <td>
                        <span className="flex items-center gap-1.5">
                          <RagDot status={zone.status} />
                        </span>
                      </td>
                      <td>
                        <select
                          className="input h-8 min-w-[150px] py-0 text-[11px]"
                          value={zone.supervisor_id || ''}
                          disabled={busyZone === zone.id}
                          onChange={(event) => assignSupervisor(zone, event.target.value)}
                        >
                          <option value="">Unassigned</option>
                          {supervisors.map((supervisor) => (
                            <option key={supervisor.id} value={supervisor.id}>
                              {supervisor.full_name}
                            </option>
                          ))}
                          {zone.supervisor_id &&
                            !supervisors.some((row) => row.id === zone.supervisor_id) && (
                              <option value={zone.supervisor_id}>
                                {zone.supervisor_name || 'Current supervisor'}
                              </option>
                            )}
                        </select>
                      </td>
                      <td>
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            title="Edit zone"
                            disabled={busyZone === zone.id}
                            onClick={() => startEdit(zone)}
                          >
                            <Pencil size={12} /> Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            title="Delete zone"
                            className="text-rose-600"
                            disabled={busyZone === zone.id}
                            onClick={() => deleteZone(zone)}
                          >
                            <Trash2 size={12} /> Delete
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>

      <Panel
        title="Deployment register"
        subtitle="Every active site with its zone and verified strength"
        actions={
          <div className="flex items-center gap-2">
            <Badge tone="neutral">{locations.length} sites</Badge>
            <Button
              size="sm"
              variant="ghost"
              disabled={!zones.length}
              onClick={() => setShowSiteForm((open) => !open)}
            >
              <Plus size={12} /> Add site
            </Button>
          </div>
        }
      >
        {showSiteForm && (
          <form
            className="mb-3 space-y-3 rounded-xl border border-line bg-panelAlt/60 p-3"
            onSubmit={submitSite}
          >
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Site name">
                <input
                  className="input"
                  required
                  placeholder="e.g. Korangi - Al-Baraka"
                  value={siteForm.name}
                  onChange={(event) => updateSite('name', event.target.value)}
                />
              </Field>
              <Field label="Client">
                <input
                  className="input"
                  placeholder="Optional"
                  value={siteForm.client_name}
                  onChange={(event) => updateSite('client_name', event.target.value)}
                />
              </Field>
              <Field label="Zone">
                <select
                  className="input"
                  required
                  value={siteForm.zone_id}
                  onChange={(event) => {
                    setSiteForm((current) => ({
                      ...current,
                      zone_id: event.target.value,
                      area: '',
                    }));
                  }}
                >
                  <option value="">Select a zone</option>
                  {zones.map((zone) => (
                    <option key={zone.id} value={zone.id}>
                      {zone.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Area" hint={siteForm.zone_id ? 'Areas of the selected zone' : 'Select a zone first'}>
                <select
                  className="input"
                  value={siteForm.area}
                  disabled={!siteForm.zone_id}
                  onChange={(event) => updateSite('area', event.target.value)}
                >
                  <option value="">
                    {siteAreas.length ? 'Select an area' : 'No areas in this zone'}
                  </option>
                  {siteAreas.map((area) => (
                    <option key={area} value={area}>
                      {area}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Guards required">
                <input
                  className="input"
                  type="number"
                  min="0"
                  value={siteForm.required_strength}
                  onChange={(event) => updateSite('required_strength', event.target.value)}
                />
              </Field>
              <Field label="Latitude" hint="Optional">
                <input
                  className="input"
                  inputMode="decimal"
                  placeholder="Zone centre"
                  value={siteForm.lat}
                  onChange={(event) => updateSite('lat', event.target.value)}
                />
              </Field>
              <Field label="Longitude" hint="Optional">
                <input
                  className="input"
                  inputMode="decimal"
                  placeholder="Zone centre"
                  value={siteForm.lng}
                  onChange={(event) => updateSite('lng', event.target.value)}
                />
              </Field>
            </div>
            <div className="flex items-center gap-2">
              <Button type="submit" variant="primary" size="sm" disabled={siteSaving}>
                {siteSaving ? 'Adding…' : 'Add site'}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={siteSaving}
                onClick={() => {
                  setSiteForm(EMPTY_SITE_FORM);
                  setShowSiteForm(false);
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        )}
        {locations.length === 0 ? (
          <EmptyState
            title="No sites registered yet"
            hint="Press Add site above to register a deployment site."
          />
        ) : (
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
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {locations.map((site) => (
                <tr key={site.id}>
                  <td>
                    <span className="font-semibold">{site.name}</span>
                    {site.area && (
                      <span className="block text-[10px] text-muted">{site.area}</span>
                    )}
                  </td>
                  <td className="text-muted">{site.client_name || '—'}</td>
                  <td>{site.zone_name || '—'}</td>
                  <td>{site.supervisor_name || '—'}</td>
                  <td className="font-mono">
                    {site.present_count}/{site.required_strength}
                  </td>
                  <td>
                    <StatusBadge status={site.computed_status} />
                  </td>
                  <td>
                    <div className="flex justify-end gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        title="Add guards to this site"
                        onClick={() => openSiteGuards(site)}
                      >
                        <Users size={12} /> Guards
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        title="Delete site"
                        className="text-rose-600"
                        onClick={() => deleteSite(site)}
                      >
                        <Trash2 size={12} /> Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}
      </Panel>

      <Modal
        open={Boolean(guardSite)}
        onClose={() => setGuardSite(null)}
        title={`Guards — ${guardSite?.name || ''}`}
        subtitle={
          guardSite
            ? `${guardSite.zone_name || 'Zone'}${guardSite.area ? ` · ${guardSite.area}` : ''} · add guards of this zone to the site`
            : ''
        }
        footer={
          <Button variant="ghost" onClick={() => setGuardSite(null)}>
            Close
          </Button>
        }
      >
        <div className="space-y-3">
          <ErrorBanner message={error} onDismiss={() => setError(null)} />
          <input
            className="input"
            placeholder="Search guards by name or employee ID…"
            value={guardSearch}
            onChange={(event) => setGuardSearch(event.target.value)}
          />
          {(() => {
            const term = guardSearch.trim().toLowerCase();
            const rows = guardList
              .filter(
                (guard) =>
                  !guardSite?.zone_id ||
                  !guard.zone_id ||
                  guard.zone_id === guardSite.zone_id,
              )
              .filter(
                (guard) =>
                  !term ||
                  (guard.full_name || '').toLowerCase().includes(term) ||
                  (guard.employee_id || '').toLowerCase().includes(term),
              )
              .sort((a, b) => {
                const aHere = a.assigned_post_id === guardSite?.id ? 0 : 1;
                const bHere = b.assigned_post_id === guardSite?.id ? 0 : 1;
                return aHere - bHere || (a.full_name || '').localeCompare(b.full_name || '');
              });
            if (!rows.length) {
              return <EmptyState title="No guards match" hint="Try another name or employee ID." />;
            }
            return (
              <div className="max-h-80 overflow-auto rounded-xl border border-line">
                <table className="table-base">
                  <thead>
                    <tr>
                      <th>Guard</th>
                      <th>Employee ID</th>
                      <th>Site</th>
                      <th className="text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 200).map((guard) => {
                      const onThisSite = guard.assigned_post_id === guardSite?.id;
                      return (
                        <tr key={guard.id}>
                          <td className="font-semibold">{guard.full_name}</td>
                          <td className="font-mono text-[10px] text-muted">
                            {guard.employee_id || '—'}
                          </td>
                          <td>
                            {onThisSite ? (
                              <Badge tone="green">This site</Badge>
                            ) : (
                              guard.assigned_post_name || 'Relief pool'
                            )}
                          </td>
                          <td>
                            <div className="flex justify-end">
                              {onThisSite ? (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  disabled={guardBusyId === guard.id}
                                  onClick={() => setGuardSiteAssignment(guard, null)}
                                >
                                  {guardBusyId === guard.id ? 'Removing…' : 'Remove'}
                                </Button>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  disabled={guardBusyId === guard.id}
                                  onClick={() => setGuardSiteAssignment(guard, guardSite)}
                                >
                                  {guardBusyId === guard.id ? 'Adding…' : 'Add guard'}
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })()}
        </div>
      </Modal>
    </div>
  );
}
