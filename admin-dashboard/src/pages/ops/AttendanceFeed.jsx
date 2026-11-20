import React from 'react';
import { EmptyState, StatusBadge, Badge } from '../../components/ui';
import { fmtTime } from '../../lib/format';

export default function AttendanceFeed({ records = [], limit = 12 }) {
  if (!records.length) {
    return <EmptyState title="No attendance activity yet" hint="Verified punches will stream here live." />;
  }
  return (
    <ul className="divide-y divide-line/60">
      {records.slice(0, limit).map((record) => (
        <li key={record.id} className="flex items-start justify-between gap-3 py-2">
          <div className="min-w-0">
            <p className="truncate text-[11px] font-semibold text-ink">
              {record.guard_name}{' '}
              <span className="font-normal text-muted">· {record.punch_type}</span>
            </p>
            <p className="truncate text-[10px] text-muted">{record.post_name}</p>
            <div className="mt-1 flex flex-wrap items-center gap-1">
              <Badge tone={record.verification_source === 'APP_GPS_QR' ? 'green' : 'info'}>
                {record.verification_source === 'APP_GPS_QR'
                  ? 'GPS/QR verified'
                  : record.verification_source.replaceAll('_', ' ')}
              </Badge>
              {record.is_mock_location && <Badge tone="red">Mock GPS</Badge>}
              {!record.is_geofence_valid && <Badge tone="red">Out of fence</Badge>}
            </div>
          </div>
          <div className="flex flex-shrink-0 flex-col items-end gap-1">
            <span className="font-mono text-[10px] text-muted">{fmtTime(record.punch_timestamp)}</span>
            <StatusBadge status={record.status} />
          </div>
        </li>
      ))}
    </ul>
  );
}
