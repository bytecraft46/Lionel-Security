import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, UserPlus } from 'lucide-react';
import { api } from '../../lib/http';
import { Badge, Button, EmptyState, ErrorBanner, Field, Panel } from '../../components/ui';

const CREATABLE = {
  CEO: [
    { value: 'OPS_MANAGER', label: 'Operations Manager' },
    { value: 'SUPERVISOR', label: 'Zone Supervisor' },
  ],
  OPS_MANAGER: [{ value: 'SUPERVISOR', label: 'Zone Supervisor' }],
};

const EMPTY_FORM = {
  full_name: '',
  phone_number: '',
  email: '',
  employee_id: '',
  password: '',
  role: '',
  zone_id: '',
  assigned_post_id: '',
  cnic: '',
};

export default function TeamPanel({ role, zones = [], locations = [], onChanged }) {
  const isGuardDesk = role === 'SUPERVISOR';
  const options = CREATABLE[role] || [];
  const [form, setForm] = useState({ ...EMPTY_FORM, role: options[0]?.value || '' });
  const [directory, setDirectory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      if (isGuardDesk) {
        const data = await api('/api/guards');
        setDirectory(data.guards || []);
      } else {
        const data = await api('/api/users');
        setDirectory(data.users || []);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [isGuardDesk]);

  useEffect(() => {
    load();
  }, [load]);

  const staffRows = useMemo(
    () => directory.filter((row) => row.role !== 'GUARD'),
    [directory],
  );

  const activeRole = isGuardDesk ? 'GUARD' : form.role || options[0]?.value;

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      if (isGuardDesk) {
        const post = locations.find((site) => site.id === form.assigned_post_id);
        await api('/api/guards', {
          method: 'POST',
          body: {
            full_name: form.full_name,
            phone_number: form.phone_number,
            email: form.email || undefined,
            employee_id: form.employee_id || undefined,
            password: form.password,
            cnic: form.cnic || undefined,
            zone_id: post?.zone_id || undefined,
            assigned_post_id: form.assigned_post_id || undefined,
          },
        });
        setNotice(`Guard ${form.full_name} created and ready for mobile sign-in.`);
      } else {
        await api('/api/auth/register', {
          method: 'POST',
          body: {
            full_name: form.full_name,
            phone_number: form.phone_number,
            email: form.email || undefined,
            employee_id: form.employee_id || undefined,
            password: form.password,
            role: activeRole,
            zone_id: activeRole === 'SUPERVISOR' ? form.zone_id : undefined,
          },
        });
        setNotice(`${activeRole.replace('_', ' ')} account created for ${form.full_name}.`);
      }
      setForm({ ...EMPTY_FORM, role: activeRole });
      await load();
      onChanged?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-4 xl:grid-cols-5">
      <Panel
        className="xl:col-span-2"
        title={isGuardDesk ? 'Enrol a guard' : 'Provision a desk account'}
        subtitle={
          isGuardDesk
            ? 'Guards you create are scoped to your zone'
            : 'Accounts inherit the scope of the desk below you'
        }
        actions={<UserPlus size={14} className="text-accent" />}
      >
        <form onSubmit={submit} className="space-y-3">
          <Field label="Full name">
            <input
              className="input"
              required
              value={form.full_name}
              onChange={(event) => update('full_name', event.target.value)}
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Phone number">
              <input
                className="input"
                required
                placeholder="+92300…"
                value={form.phone_number}
                onChange={(event) => update('phone_number', event.target.value)}
              />
            </Field>
            <Field label="Employee ID" hint="Optional">
              <input
                className="input"
                value={form.employee_id}
                onChange={(event) => update('employee_id', event.target.value)}
              />
            </Field>
          </div>
          <Field label="Email" hint="Optional — used for sign-in recovery">
            <input
              type="email"
              className="input"
              value={form.email}
              onChange={(event) => update('email', event.target.value)}
            />
          </Field>

          {!isGuardDesk && (
            <Field label="Role">
              <select
                className="input"
                value={activeRole}
                onChange={(event) => update('role', event.target.value)}
              >
                {options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>
          )}

          {!isGuardDesk && activeRole === 'SUPERVISOR' && (
            <Field label="Zone" hint="Supervisors only see guards and sites in this zone">
              <select
                className="input"
                required
                value={form.zone_id}
                onChange={(event) => update('zone_id', event.target.value)}
              >
                <option value="">Select zone</option>
                {zones.map((zone) => (
                  <option key={zone.id} value={zone.id}>
                    {zone.name}
                  </option>
                ))}
              </select>
            </Field>
          )}

          {isGuardDesk && (
            <>
              <Field label="Assigned post">
                <select
                  className="input"
                  value={form.assigned_post_id}
                  onChange={(event) => update('assigned_post_id', event.target.value)}
                >
                  <option value="">Relief pool (unassigned)</option>
                  {locations.map((site) => (
                    <option key={site.id} value={site.id}>
                      {site.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="CNIC" hint="Optional — 13 digits">
                <input
                  className="input"
                  value={form.cnic}
                  onChange={(event) => update('cnic', event.target.value)}
                />
              </Field>
            </>
          )}

          <Field
            label="Temporary password"
            hint="At least 10 characters with upper, lower, number and symbol"
          >
            <input
              type="password"
              className="input"
              required
              minLength={10}
              value={form.password}
              onChange={(event) => update('password', event.target.value)}
            />
          </Field>

          <ErrorBanner message={error} onDismiss={() => setError(null)} />
          {notice && (
            <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] text-emerald-700">
              {notice}
            </p>
          )}
          <Button type="submit" variant="primary" disabled={saving}>
            {saving ? 'Creating…' : isGuardDesk ? 'Create guard' : 'Create account'}
          </Button>
        </form>
      </Panel>

      <Panel
        className="xl:col-span-3"
        title={isGuardDesk ? 'My zone guards' : 'Command directory'}
        subtitle={
          isGuardDesk
            ? `${directory.length} guards under your zone`
            : `${staffRows.length} desk accounts across the organisation`
        }
        actions={
          <Button size="sm" variant="ghost" onClick={load}>
            <RefreshCw size={12} /> Refresh
          </Button>
        }
      >
        {loading ? (
          <p className="text-[11px] text-muted">Loading directory…</p>
        ) : isGuardDesk ? (
          directory.length === 0 ? (
            <EmptyState title="No guards in your zone" />
          ) : (
            <div className="max-h-[520px] overflow-auto rounded-xl border border-line">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Guard</th>
                    <th>Employee ID</th>
                    <th>Phone</th>
                    <th>Post</th>
                    <th>Availability</th>
                  </tr>
                </thead>
                <tbody>
                  {directory.map((guard) => (
                    <tr key={guard.id}>
                      <td className="font-semibold">{guard.full_name}</td>
                      <td className="font-mono text-[10px] text-muted">{guard.employee_id || '—'}</td>
                      <td className="font-mono text-[10px]">{guard.phone_number || '—'}</td>
                      <td>{guard.assigned_post_name || 'Relief pool'}</td>
                      <td>
                        <Badge tone={guard.availability === 'ON_DUTY' ? 'green' : 'neutral'}>
                          {(guard.availability || 'AVAILABLE').replaceAll('_', ' ')}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : staffRows.length === 0 ? (
          <EmptyState title="No desk accounts yet" />
        ) : (
          <div className="max-h-[520px] overflow-auto rounded-xl border border-line">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Role</th>
                  <th>Phone</th>
                  <th>Email</th>
                  <th>Zone</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {staffRows.map((member) => (
                  <tr key={member.id}>
                    <td className="font-semibold">{member.full_name}</td>
                    <td>
                      <Badge tone={member.role === 'CEO' ? 'info' : 'neutral'}>
                        {member.role.replaceAll('_', ' ')}
                      </Badge>
                    </td>
                    <td className="font-mono text-[10px]">{member.phone_number || '—'}</td>
                    <td className="text-muted">{member.email || '—'}</td>
                    <td>{member.zone_name || '—'}</td>
                    <td>
                      <Badge tone={member.is_active ? 'green' : 'red'}>
                        {member.is_active ? 'ACTIVE' : 'DISABLED'}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
