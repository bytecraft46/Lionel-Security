import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { api } from '../../lib/http';
import { useSocketEvent } from '../../lib/socket';
import { fmtTime } from '../../lib/format';
import { Badge } from '../../components/ui';

/**
 * Live overdue check-in banner. The API is already zone scoped, so the CEO and
 * Operations Manager see every guard while a supervisor only sees their zone.
 */
export default function OverdueCheckInAlerts() {
  const [alerts, setAlerts] = useState([]);
  const [grace, setGrace] = useState(5);

  const load = useCallback(async () => {
    try {
      const data = await api('/api/attendance/overdue');
      setAlerts(data.alerts || []);
      setGrace(data.grace_minutes ?? 5);
    } catch {
      /* the banner stays hidden while the API is unreachable */
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
    <div className="rounded-xl border border-rose-200 bg-rose-50">
      <div className="flex items-center gap-3 border-b border-rose-200/70 px-4 py-2.5">
        <span className="grid h-8 w-8 flex-shrink-0 animate-pulse place-items-center rounded-full bg-rose-100 text-rose-600">
          <AlertTriangle size={16} />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-black uppercase tracking-wide text-rose-700">
            {alerts.length} guard{alerts.length === 1 ? '' : 's'} have not checked in
          </p>
          <p className="text-[10px] text-rose-700/80">
            Duty start missed by more than {grace} minutes · refreshes automatically
          </p>
        </div>
      </div>
      <ul className="max-h-44 divide-y divide-rose-200/60 overflow-y-auto">
        {alerts.map((alert) => (
          <li
            key={alert.guard_id}
            className="flex flex-wrap items-center justify-between gap-2 px-4 py-2"
          >
            <div className="min-w-0">
              <p className="text-[11px] font-semibold text-rose-800">
                {alert.guard_name}{' '}
                <span className="font-normal text-rose-700/80">
                  · {alert.employee_id || 'No ID'}
                </span>
              </p>
              <p className="truncate text-[10px] text-rose-700/80">
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
              <span className="font-mono text-[10px] text-rose-700">
                due {fmtTime(alert.shift_start)}
              </span>
              <Badge tone="red">{alert.minutes_late} min late</Badge>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
