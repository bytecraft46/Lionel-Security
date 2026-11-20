export const RAG = {
  GREEN: { label: 'Operational', dot: 'bg-emerald-400', text: 'text-emerald-300', chip: 'badge-green' },
  YELLOW: { label: 'Attention', dot: 'bg-amber-400', text: 'text-amber-300', chip: 'badge-yellow' },
  RED: { label: 'Emergency', dot: 'bg-rose-500', text: 'text-rose-300', chip: 'badge-red' },
};

export function toneForStatus(status) {
  switch ((status || '').toUpperCase()) {
    case 'GREEN':
    case 'PRESENT':
    case 'SERVICEABLE':
    case 'ACTION_TAKEN':
    case 'RECEIVED':
    case 'ISSUED':
    case 'APPROVED':
      return 'green';
    case 'YELLOW':
    case 'LATE':
    case 'PENDING':
    case 'NOT_RECEIVED':
    case 'MAINTENANCE':
    case 'IMPORTANT':
      return 'yellow';
    case 'RED':
    case 'ABSENT':
    case 'FLAGGED_ANOMALY':
    case 'EARLY_DEPARTURE':
    case 'CRITICAL':
    case 'UNSERVICEABLE':
    case 'OPEN':
      return 'red';
    case 'ON_LEAVE':
    case 'ON_REST':
      return 'info';
    default:
      return 'neutral';
  }
}

/**
 * Backend timestamps are naive UTC, so "2026-11-19T15:00:00" must be read as
 * UTC rather than the viewer's local clock. Date-only values stay local.
 */
export function parseApiDate(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const raw = String(value);
  const hasTime = raw.includes('T');
  const hasOffset = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw);
  const date = new Date(hasTime && !hasOffset ? `${raw}Z` : raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function fmtTime(value) {
  const date = parseApiDate(value);
  if (!date) return '—';
  return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

export function fmtDateTime(value) {
  const date = parseApiDate(value);
  if (!date) return '—';
  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function fmtDate(value) {
  const date = parseApiDate(value);
  if (!date) return '—';
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function initials(name) {
  return (name || 'LS')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');
}

export function roleLabel(role) {
  return (
    {
      CEO: 'Chief Executive Officer',
      OPS_MANAGER: 'Operations Manager',
      SUPERVISOR: 'Zone Supervisor',
      GUARD: 'Security Guard',
    }[role] || role || 'Operator'
  );
}

export const NAV_BY_ROLE = {
  CEO: [
    { id: 'posture', label: 'Posture' },
    { id: 'zones', label: 'Zones & Sites' },
    { id: 'risk', label: 'Risk & Compliance' },
    { id: 'incidents', label: 'Emergencies' },
    { id: 'armoury', label: 'Armoury' },
    { id: 'team', label: 'Team & Access' },
  ],
  OPS_MANAGER: [
    { id: 'control', label: 'Control Room' },
    { id: 'zones', label: 'Zones & Sites' },
    { id: 'weapons', label: 'Armoury' },
    { id: 'incidents', label: 'Incident Triage' },
    { id: 'team', label: 'Team' },
  ],
  SUPERVISOR: [
    { id: 'locations', label: 'My Locations' },
    { id: 'alerts', label: 'Command Alerts' },
    { id: 'inspections', label: 'Inspections' },
    { id: 'incidents', label: 'Incidents' },
    { id: 'weapons', label: 'Weapons Check' },
    { id: 'team', label: 'My Guards' },
  ],
};
