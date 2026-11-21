import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import { api } from '../../lib/http';
import { useSocketEvent } from '../../lib/socket';
import { fmtTime } from '../../lib/format';
import { Badge } from '../../components/ui';

export default function OverdueCheckInAlerts() {
  const [alerts, setAlerts] = useState([]);
  const [grace, setGrace] = useState(5);
  const [collapsed, setCollapsed] = useState(true);

  const load = useCallback(async () => {
    try {
      const data = await api('/api/attendance/overdue');
      setAlerts(data.alerts || []);
      setGrace(data.grace_minutes ?? 5);
    } catch {
      /* unreachable */
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, 30000);
    return () => clearInterval(timer);
  }, [load]);

  useSocketEvent('ATTENDANCE_PUNCHED', load);
  useSocketEvent('CHECKIN_OVERDUE', load);

  if (!alerts.length) return null;

  return (
    <div className="rounded-2xl border border-rose-200 bg-[#FDF2F0] overflow-hidden shadow-xs">
      <div className="flex items-center justify-between px-4 py-3 border-b border-rose-100">
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-white text-rose-600 shadow-xs">
            <AlertTriangle size={16} />
          </span>
          <div>
            <p className="text-xs font-bold text-rose-800">
              {alerts.length} Guard{alerts.length === 1 ? '' : 's'} Overdue for Check-In
            </p>
            <p className="text-[11px] text-rose-600/80">
              Duty start missed by {grace}+ minutes
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-2.5 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50 shadow-xs"
        >
          <span>{collapsed ? `View All (${alerts.length})` : 'Collapse'}</span>
          {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
        </button>
      </div>

      {!collapsed && (
        <ul className="max-h-48 divide-y divide-rose-100 overflow-y-auto bg-white/60">
          {alerts.map((alert) => (
            <li
              key={alert.guard_id}
              className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 hover:bg-white/90"
            >
              <div className="min-w-0">
                <p className="text-xs font-bold text-slate-800">
                  {alert.guard_name}{' '}
                  <span className="font-normal text-muted">
                    · {alert.employee_id || 'No ID'}
                  </span>
                </p>
                <p className="truncate text-[10px] text-muted">
                  {[
                    alert.post_name,
                    alert.zone_name,
                    alert.duty_start && alert.duty_end
                      ? `${alert.duty_start}–${alert.duty_end}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
              <div className="flex flex-shrink-0 items-center gap-2">
                <span className="font-mono text-xs text-rose-600 font-medium">
                  Due {fmtTime(alert.shift_start)}
                </span>
                <Badge tone="red">{alert.minutes_late}m late</Badge>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
