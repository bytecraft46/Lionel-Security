import React, { useMemo, useState } from 'react';
import { Search, ShieldAlert, Users, MapPin, Shield, Calendar, Clock, AlertTriangle } from 'lucide-react';
import { Modal, Badge, Button, StatusBadge } from './index';
import { fmtDate, fmtDateTime, fmtTime } from '../../lib/format';

/**
 * AttendanceDetailModal: Opens when clicking any KPI box in the Attendance Summary row.
 * Handles:
 * - SHIFTS (All registered guards / rosters)
 * - ON_DUTY (Guards currently present / checked in)
 * - VACANT (Posts / locations with vacant positions)
 * - ABSENT (Guards expected on shift without a check-in)
 * - LEAVE (Guards on approved leave)
 * - WEAPONS (Issued weapons & locations)
 * - EMERGENCIES (Active incidents, alerts, complaints)
 */
export default function AttendanceDetailModal({
  type,
  onClose,
  guards = [],
  locations = [],
  zones = [],
  weapons = [],
  incidents = [],
  leave = [],
  onDutyIds = null,
  absentIds = null,
}) {
  const [search, setSearch] = useState('');

  const modalConfig = useMemo(() => {
    switch (type) {
      case 'SHIFTS':
        return {
          title: 'Registered Strength',
          subtitle: `${guards.length} registered guards assigned across Karachi locations`,
          icon: Users,
        };
      case 'ON_DUTY':
        return {
          title: 'Guards Currently On Duty',
          subtitle: 'Verified present & active on post',
          icon: Clock,
        };
      case 'VACANT':
        return {
          title: 'Vacant Posts & Deployment Gaps',
          subtitle: 'Locations where deployed strength is below required quota',
          icon: AlertTriangle,
        };
      case 'ABSENT':
        return {
          title: 'Absent Guard Records',
          subtitle: 'Guards expected on the current shift with no verified check-in',
          icon: Users,
        };
      case 'LEAVE':
        return {
          title: 'Guards On Approved Leave',
          subtitle: 'Rest days, annual leave & medical leaves active today',
          icon: Calendar,
        };
      case 'WEAPONS':
        return {
          title: 'Weapons Issued & Post Armoury',
          subtitle: 'Firearms currently allocated to duty guards and posts',
          icon: Shield,
        };
      case 'EMERGENCIES':
        return {
          title: 'Active Incidents & Emergency Situations',
          subtitle: 'Unresolved security reports, intruder warnings & client complaints',
          icon: ShieldAlert,
        };
      default:
        return {
          title: 'Deployment Details',
          subtitle: 'Operational summary',
          icon: Users,
        };
    }
  }, [type, guards.length]);

  const filteredContent = useMemo(() => {
    const q = search.trim().toLowerCase();

    if (type === 'SHIFTS') {
      return guards.filter(
        (g) =>
          !q ||
          g.full_name?.toLowerCase().includes(q) ||
          g.employee_id?.toLowerCase().includes(q) ||
          g.phone_number?.toLowerCase().includes(q) ||
          g.assigned_post_name?.toLowerCase().includes(q)
      );
    }

    if (type === 'ON_DUTY') {
      return guards
        .filter((g) =>
          Array.isArray(onDutyIds)
            ? onDutyIds.includes(g.id)
            : g.employment_status === 'ACTIVE' && g.assigned_post_id,
        )
        .filter(
          (g) =>
            !q ||
            g.full_name?.toLowerCase().includes(q) ||
            g.assigned_post_name?.toLowerCase().includes(q)
        );
    }

    if (type === 'VACANT') {
      return locations
        .filter((loc) => loc.vacant > 0 || loc.present_count < loc.required_strength)
        .filter(
          (loc) =>
            !q ||
            loc.name?.toLowerCase().includes(q) ||
            loc.client_name?.toLowerCase().includes(q) ||
            loc.zone_name?.toLowerCase().includes(q)
        );
    }

    if (type === 'ABSENT') {
      return guards
        .filter((g) =>
          Array.isArray(absentIds)
            ? absentIds.includes(g.id)
            : g.employment_status === 'SUSPENDED' || !g.assigned_post_id,
        )
        .filter(
          (g) =>
            !q ||
            g.full_name?.toLowerCase().includes(q) ||
            g.employee_id?.toLowerCase().includes(q)
        );
    }

    if (type === 'LEAVE') {
      return leave.filter(
        (l) =>
          !q ||
          l.guard_name?.toLowerCase().includes(q) ||
          l.leave_type?.toLowerCase().includes(q)
      );
    }

    if (type === 'WEAPONS') {
      return weapons
        .filter((w) => w.armoury_status === 'ISSUED')
        .filter(
          (w) =>
            !q ||
            w.serial_number?.toLowerCase().includes(q) ||
            w.assigned_guard_name?.toLowerCase().includes(q) ||
            w.assigned_post_name?.toLowerCase().includes(q)
        );
    }

    if (type === 'EMERGENCIES') {
      return incidents.filter(
        (inc) =>
          !q ||
          inc.incident_type?.toLowerCase().includes(q) ||
          inc.post_name?.toLowerCase().includes(q) ||
          inc.immediate_action?.toLowerCase().includes(q)
      );
    }

    return [];
  }, [type, guards, locations, leave, weapons, incidents, onDutyIds, absentIds, search]);

  if (!type) return null;

  return (
    <Modal
      open={Boolean(type)}
      onClose={onClose}
      wide
      title={modalConfig.title}
      subtitle={modalConfig.subtitle}
      footer={
        <div className="flex items-center justify-between w-full">
          <span className="text-xs text-muted">
            Total records: <strong className="text-slate-800">{filteredContent.length}</strong>
          </span>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Search input inside modal */}
        <div className="relative">
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter records..."
            className="input pl-9"
            autoFocus
          />
        </div>

        {filteredContent.length === 0 ? (
          <div className="py-12 text-center text-xs text-muted">
            No matching entries found.
          </div>
        ) : (
          <div className="max-h-[55vh] overflow-auto rounded-xl border border-line">
            {/* 1. SHIFTS / ALL GUARDS */}
            {type === 'SHIFTS' && (
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Guard Name</th>
                    <th>Employee ID</th>
                    <th>Assigned Post</th>
                    <th>Duty Hours</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredContent.map((guard) => (
                    <tr key={guard.id}>
                      <td className="font-semibold text-slate-800">{guard.full_name}</td>
                      <td className="font-mono text-xs text-muted">{guard.employee_id || '—'}</td>
                      <td>{guard.assigned_post_name || 'Standby / Pool'}</td>
                      <td className="font-mono text-xs text-slate-700">
                        {(guard.profile?.duty_start || guard.duty_start) && (guard.profile?.duty_end || guard.duty_end)
                          ? `${guard.profile?.duty_start || guard.duty_start} - ${guard.profile?.duty_end || guard.duty_end}`
                          : '12h Shift'}
                      </td>
                      <td>
                        <StatusBadge status={guard.employment_status || guard.status || 'ACTIVE'} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {/* 2. ON DUTY */}
            {type === 'ON_DUTY' && (
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Guard</th>
                    <th>Post / Site</th>
                    <th>Zone</th>
                    <th>Shift Timing</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredContent.map((guard) => (
                    <tr key={guard.id}>
                      <td className="font-semibold text-slate-800">{guard.full_name}</td>
                      <td>{guard.assigned_post_name || 'General Post'}</td>
                      <td>{guard.zone_name || 'Zone 1'}</td>
                      <td className="font-mono text-xs">
                        {guard.profile?.duty_start || guard.duty_start || '08:00'} - {guard.profile?.duty_end || guard.duty_end || '20:00'}
                      </td>
                      <td>
                        <Badge tone="green">ON DUTY</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {/* 3. VACANT POSTS */}
            {type === 'VACANT' && (
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Location / Site</th>
                    <th>Client</th>
                    <th>Zone</th>
                    <th>Shift Required</th>
                    <th>Present</th>
                    <th>Vacancies</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredContent.map((site) => (
                    <tr key={site.id}>
                      <td className="font-semibold text-slate-800">{site.name}</td>
                      <td className="text-muted">{site.client_name || 'Commercial Client'}</td>
                      <td>{site.zone_name}</td>
                      <td className="font-mono font-bold">{site.required_strength}</td>
                      <td className="font-mono font-bold text-emerald-700">{site.present_count}</td>
                      <td>
                        <Badge tone="red">{site.vacant || (site.required_strength - site.present_count)} VACANT</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {/* 4. ABSENT */}
            {type === 'ABSENT' && (
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Guard</th>
                    <th>Employee ID</th>
                    <th>Phone</th>
                    <th>Assigned Sector</th>
                    <th>Incident Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredContent.map((guard) => (
                    <tr key={guard.id}>
                      <td className="font-semibold text-slate-800">{guard.full_name}</td>
                      <td className="font-mono text-xs">{guard.employee_id || '—'}</td>
                      <td>{guard.phone_number || '—'}</td>
                      <td>{guard.zone_name || 'Karachi HQ Pool'}</td>
                      <td>
                        <Badge tone="yellow">MISSED SHIFT</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {/* 5. LEAVE */}
            {type === 'LEAVE' && (
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Guard Name</th>
                    <th>Leave Type</th>
                    <th>Start Date</th>
                    <th>End Date</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredContent.map((l) => (
                    <tr key={l.id}>
                      <td className="font-semibold text-slate-800">{l.guard_name}</td>
                      <td>
                        <Badge tone="info">{l.leave_type?.replaceAll('_', ' ')}</Badge>
                      </td>
                      <td className="font-mono text-xs">{fmtDate(l.start_date)}</td>
                      <td className="font-mono text-xs">{fmtDate(l.end_date)}</td>
                      <td>
                        <Badge tone="green">APPROVED</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {/* 6. WEAPONS ISSUED */}
            {type === 'WEAPONS' && (
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Serial Number</th>
                    <th>Weapon Type</th>
                    <th>Assigned Guard</th>
                    <th>Assigned Post</th>
                    <th>Condition</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredContent.map((w) => (
                    <tr key={w.id}>
                      <td className="font-mono font-bold text-slate-800">{w.serial_number}</td>
                      <td>{w.weapon_type}</td>
                      <td>{w.assigned_guard_name || '—'}</td>
                      <td>{w.assigned_post_name || 'Site Armoury'}</td>
                      <td>
                        <StatusBadge status={w.condition || 'SERVICEABLE'} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {/* 7. EMERGENCIES / INCIDENTS */}
            {type === 'EMERGENCIES' && (
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Incident Type</th>
                    <th>Location / Post</th>
                    <th>Reported Time</th>
                    <th>Immediate Action Taken</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredContent.map((inc) => (
                    <tr key={inc.id}>
                      <td>
                        <Badge tone={inc.incident_type === 'FIRE' || inc.incident_type === 'ATTEMPTED_INTRUSION' ? 'red' : 'yellow'}>
                          {inc.incident_type?.replaceAll('_', ' ')}
                        </Badge>
                      </td>
                      <td className="font-semibold text-slate-800">{inc.post_name}</td>
                      <td className="font-mono text-xs text-muted">{fmtDateTime(inc.occurred_at)}</td>
                      <td className="text-xs text-slate-600 max-w-xs truncate">{inc.immediate_action || 'Reported to supervisor'}</td>
                      <td>
                        <StatusBadge status={inc.status || 'OPEN'} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
