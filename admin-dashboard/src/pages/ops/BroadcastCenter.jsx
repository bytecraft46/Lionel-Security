import React, { useState } from 'react';
import { Megaphone, Send } from 'lucide-react';
import { api } from '../../lib/http';
import { fmtDateTime } from '../../lib/format';
import {
  Badge,
  Button,
  EmptyState,
  ErrorBanner,
  Field,
  Modal,
  ProgressBar,
} from '../../components/ui';

const PRIORITIES = ['NORMAL', 'IMPORTANT', 'CRITICAL'];
const CATEGORIES = [
  'EMERGENCY',
  'THREAT_WARNING',
  'WEATHER',
  'POSTURE_CHANGE',
  'VIP_MOVEMENT',
  'REINFORCEMENT',
];

export default function BroadcastCenter({ broadcasts = [], zones = [], locations = [], onChanged, compact }) {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState(null);
  const [sending, setSending] = useState(false);
  const [form, setForm] = useState({
    title: '',
    message: '',
    priority: 'IMPORTANT',
    category: 'POSTURE_CHANGE',
    target_scope: 'ALL',
    zoneIds: [],
    postIds: [],
  });

  async function submit(event) {
    event.preventDefault();
    setSending(true);
    setError(null);
    try {
      await api('/api/broadcasts', {
        method: 'POST',
        body: {
          title: form.title,
          message: form.message,
          priority: form.priority,
          category: form.category,
          target_scope: form.target_scope,
          target_zone_ids: form.zoneIds,
          target_post_ids: form.postIds,
        },
      });
      setOpen(false);
      setForm({ ...form, title: '', message: '' });
      onChanged?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  async function openDetail(broadcast) {
    try {
      const response = await api(`/api/broadcasts/${broadcast.id}`);
      setDetail(response.broadcast);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted">
          Command messaging
        </p>
        <Button size="sm" variant="primary" onClick={() => setOpen(true)}>
          <Megaphone size={12} /> Broadcast
        </Button>
      </div>

      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      <div className="mt-2 flex-1 space-y-2 overflow-y-auto pr-1">
        {broadcasts.length === 0 && <EmptyState title="No broadcasts issued" />}
        {broadcasts.slice(0, compact ? 4 : 20).map((broadcast) => {
          const total = broadcast.recipient_count || 0;
          const received = broadcast.received_count || 0;
          const acted = broadcast.action_taken_count || 0;
          return (
            <button
              key={broadcast.id}
              type="button"
              onClick={() => openDetail(broadcast)}
              className="w-full rounded-xl border border-line bg-panelAlt/50 p-2.5 text-left transition-colors hover:border-accent/40"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-[11px] font-bold text-ink">{broadcast.title}</p>
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
              </div>
              <p className="mt-0.5 line-clamp-2 text-[10px] text-muted">{broadcast.message}</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <div>
                  <p className="mb-1 flex justify-between text-[9px] uppercase tracking-wide text-muted">
                    <span>Received</span>
                    <span className="font-mono">
                      {received}/{total}
                    </span>
                  </p>
                  <ProgressBar value={total ? received / total : 0} tone="green" />
                </div>
                <div>
                  <p className="mb-1 flex justify-between text-[9px] uppercase tracking-wide text-muted">
                    <span>Action taken</span>
                    <span className="font-mono">
                      {acted}/{total}
                    </span>
                  </p>
                  <ProgressBar value={total ? acted / total : 0} tone={acted < total ? 'yellow' : 'green'} />
                </div>
              </div>
              <p className="mt-1.5 text-[9px] text-muted/70">
                {broadcast.category.replaceAll('_', ' ')} · {fmtDateTime(broadcast.created_at)}
              </p>
            </button>
          );
        })}
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Issue command broadcast"
        subtitle="Delivered only to supervisors and guards inside the target scope."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={submit} disabled={sending}>
              <Send size={12} /> {sending ? 'Dispatching…' : 'Dispatch'}
            </Button>
          </>
        }
      >
        <form onSubmit={submit} className="space-y-3">
          <Field label="Title">
            <input
              className="input"
              required
              value={form.title}
              onChange={(event) => setForm({ ...form, title: event.target.value })}
              placeholder="Threat warning — heightened posture"
            />
          </Field>
          <Field label="Message">
            <textarea
              className="input min-h-24"
              required
              value={form.message}
              onChange={(event) => setForm({ ...form, message: event.target.value })}
              placeholder="Instructions for field units…"
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Priority">
              <select
                className="input"
                value={form.priority}
                onChange={(event) => setForm({ ...form, priority: event.target.value })}
              >
                {PRIORITIES.map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </Field>
            <Field label="Category">
              <select
                className="input"
                value={form.category}
                onChange={(event) => setForm({ ...form, category: event.target.value })}
              >
                {CATEGORIES.map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Target scope">
            <select
              className="input"
              value={form.target_scope}
              onChange={(event) => setForm({ ...form, target_scope: event.target.value })}
            >
              <option value="ALL">All personnel</option>
              <option value="ZONES">Selected zones</option>
              <option value="POSTS">Selected locations</option>
            </select>
          </Field>
          {form.target_scope === 'ZONES' && (
            <Field label="Zones" hint="Ctrl/Cmd-click to select more than one.">
              <select
                multiple
                className="input min-h-24"
                value={form.zoneIds}
                onChange={(event) =>
                  setForm({
                    ...form,
                    zoneIds: Array.from(event.target.selectedOptions, (option) => option.value),
                  })
                }
              >
                {zones.map((zone) => (
                  <option key={zone.id} value={zone.id}>
                    {zone.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {form.target_scope === 'POSTS' && (
            <Field label="Locations" hint="Ctrl/Cmd-click to select more than one.">
              <select
                multiple
                className="input min-h-24"
                value={form.postIds}
                onChange={(event) =>
                  setForm({
                    ...form,
                    postIds: Array.from(event.target.selectedOptions, (option) => option.value),
                  })
                }
              >
                {locations.map((site) => (
                  <option key={site.id} value={site.id}>
                    {site.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </form>
      </Modal>

      <Modal
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        wide
        title={detail?.title}
        subtitle={detail ? `${detail.category} · ${detail.priority} · ${fmtDateTime(detail.created_at)}` : ''}
      >
        {detail && (
          <div className="space-y-3">
            <p className="rounded-xl border border-line bg-panelAlt/60 p-3 text-[11px] leading-relaxed text-ink/90">
              {detail.message}
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="kpi">
                <span className="kpi-label">Recipients</span>
                <span className="kpi-value">{detail.recipient_count}</span>
              </div>
              <div className="kpi">
                <span className="kpi-label">Received</span>
                <span className="kpi-value">{detail.received_count}</span>
              </div>
              <div className="kpi">
                <span className="kpi-label">Action taken</span>
                <span className="kpi-value">{detail.action_taken_count}</span>
              </div>
              <div className="kpi">
                <span className="kpi-label">Pending</span>
                <span className="kpi-value">{detail.pending_count}</span>
              </div>
            </div>
            <div className="overflow-x-auto rounded-xl border border-line">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Recipient</th>
                    <th>Role</th>
                    <th>Receipt</th>
                    <th>Compliance</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {(detail.acks || []).map((ack) => (
                    <tr key={ack.id}>
                      <td>{ack.user_name}</td>
                      <td>{ack.role}</td>
                      <td>
                        <Badge tone={ack.ack_status === 'RECEIVED' ? 'green' : 'yellow'}>
                          {ack.ack_status}
                        </Badge>
                      </td>
                      <td>
                        <Badge tone={ack.compliance_status === 'ACTION_TAKEN' ? 'green' : 'neutral'}>
                          {ack.compliance_status.replaceAll('_', ' ')}
                        </Badge>
                      </td>
                      <td className="text-muted">{ack.action_notes || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
