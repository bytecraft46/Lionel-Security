import React, { useCallback, useEffect, useState } from 'react';
import {
  Bell,
  Calendar,
  ChevronDown,
  LayoutDashboard,
  LogOut,
  MapPin,
  Radio,
  Search,
  Shield,
  ShieldAlert,
  Users,
} from 'lucide-react';
import { api } from '../../lib/http';
import { NAV_BY_ROLE, fmtDateTime, initials, roleLabel } from '../../lib/format';
import { useSocketEvent, useSocketStatus } from '../../lib/socket';
import { Button, EmptyState, Modal, StatusBadge, cx } from '../ui';
import ApkDownloadButton from './ApkDownloadButton';

const APK_ROLES = ['CEO', 'OPS_MANAGER', 'SUPERVISOR'];
const ALERT_LIMIT = 50;

const isGuardAlert = (row) => Boolean(row && row.reported_by_role === 'GUARD');

const byNewest = (a, b) =>
  new Date(b.occurred_at || 0).getTime() - new Date(a.occurred_at || 0).getTime();

// Icons mapping matching the vertical icon sidebar in screenshot
const ICON_MAP = {
  posture: LayoutDashboard,
  control: LayoutDashboard,
  locations: MapPin,
  checkins: Calendar,
  zones: MapPin,
  risk: ShieldAlert,
  incidents: ShieldAlert,
  alerts: Bell,
  weapons: Shield,
  inspections: Shield,
  armoury: Shield,
  team: Users,
};

export default function AppShell({ user, onSignOut, children }) {
  const navItems = NAV_BY_ROLE[user.role] || NAV_BY_ROLE.OPS_MANAGER;
  const [activeTab, setActiveTab] = useState(navItems[0]?.id || 'posture');
  const [searchQuery, setSearchQuery] = useState('');
  const [connected, setConnected] = useState(false);
  const [alerts, setAlerts] = useState([]);
  const [unread, setUnread] = useState(0);
  const [alertsOpen, setAlertsOpen] = useState(false);
  useSocketStatus(setConnected);

  const mergeAlerts = useCallback((rows) => {
    setAlerts((previous) => {
      const merged = new Map(previous.map((row) => [row.id, row]));
      rows.filter(isGuardAlert).forEach((row) => merged.set(row.id, row));
      return [...merged.values()].sort(byNewest).slice(0, ALERT_LIMIT);
    });
  }, []);

  const refreshAlerts = useCallback(async () => {
    try {
      const data = await api('/api/incidents');
      mergeAlerts(data.incidents || []);
    } catch {
      /* the header must never break the shell */
    }
  }, [mergeAlerts]);

  useEffect(() => {
    let active = true;
    api('/api/incidents')
      .then((data) => {
        if (!active) return;
        const rows = (data.incidents || []).filter(isGuardAlert);
        setAlerts([...rows].sort(byNewest).slice(0, ALERT_LIMIT));
        setUnread(rows.filter((row) => row.status === 'OPEN').length);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  useSocketEvent('INCIDENT_BROADCAST', (incident) => {
    if (!isGuardAlert(incident)) return;
    mergeAlerts([incident]);
    setUnread((count) => (alertsOpen ? 0 : count + 1));
  });

  const openAlerts = () => {
    setAlertsOpen(true);
    setUnread(0);
    refreshAlerts();
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-base text-ink font-sans">
      {/* 1. Left Vertical Icon Sidebar (Exact Match to Screenshot) */}
      <aside className="flex w-[118px] flex-shrink-0 flex-col items-center border-r border-line bg-white py-4 z-30 shadow-[1px_0_10px_rgba(0,0,0,0.02)]">
        {/* Brand Crest Icon in Top Circle */}
        <div className="mb-6 flex h-11 w-11 items-center justify-center rounded-2xl bg-primaryLight p-2 shadow-sm">
          <img
            src="/brand/lionel-crest.webp"
            alt="Lionel"
            className="h-full w-full object-contain"
          />
        </div>

        {/* Navigation Items Stacked Vertically with Soft Purple Rounded Active Indicator */}
        <nav className="flex flex-1 flex-col items-center gap-3 w-full px-2">
          {navItems.map((item) => {
            const Icon = ICON_MAP[item.id] || LayoutDashboard;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                title={item.label}
                className={cx(
                  'group relative flex h-14 w-full flex-col items-center justify-center gap-1 rounded-2xl px-2 py-1.5 transition-all duration-150',
                  isActive
                    ? 'bg-primaryLight text-primary font-bold shadow-sm'
                    : 'text-muted hover:bg-slate-50 hover:text-ink'
                )}
              >
                <Icon size={18} className={isActive ? 'text-primary' : 'text-slate-400 group-hover:text-slate-600'} />
                <span className="block w-full text-center text-[10px] font-medium leading-[1.15] tracking-tight break-words">
                  {item.label}
                </span>
                {isActive && (
                  <span className="absolute left-0 top-3 bottom-3 w-1 rounded-r-full bg-primary" />
                )}
              </button>
            );
          })}
        </nav>

        {/* Bottom Sign-Out Button */}
        <div className="mt-auto pt-2">
          <button
            type="button"
            onClick={onSignOut}
            className="flex h-10 w-10 items-center justify-center rounded-xl text-muted hover:bg-rose-50 hover:text-rose-600 transition-colors"
            title="Sign out"
          >
            <LogOut size={16} />
          </button>
        </div>
      </aside>

      {/* 2. Main Content Area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top Header Bar matching screenshot: Search bar with Ctrl+K shortcut, Real-time status, Profile */}
        <header className="flex h-16 flex-shrink-0 items-center justify-between border-b border-line bg-white px-6 z-20 shadow-sm">
          {/* Search Box */}
          <div className="flex items-center w-full max-w-md">
            <div className="relative w-full">
              <Search
                size={15}
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search guards, locations, incidents or arms..."
                className="w-full rounded-2xl border border-line bg-slate-50/70 pl-10 pr-20 py-2 text-xs text-ink placeholder:text-muted focus:border-primary focus:bg-white focus:outline-none transition-all"
              />
              <div className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-muted shadow-xs">
                <span>Ctrl</span>
                <span>+</span>
                <span>K</span>
              </div>
            </div>
          </div>

          {/* Right Header: APK, Status, Notifications bell & User Avatar */}
          <div className="flex items-center gap-4">
            {APK_ROLES.includes(user.role) && <ApkDownloadButton />}

            <div className="hidden sm:flex items-center gap-2 rounded-full border border-line bg-slate-50 px-3 py-1.5 shadow-xs">
              <Radio size={12} className={connected ? 'text-emerald-500 animate-pulse' : 'text-rose-500'} />
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600">
                {connected ? 'Live Connected' : 'Connecting'}
              </span>
            </div>

            <div className="h-5 w-px bg-line hidden sm:block" />

            {/* Notification Bell with live guard-alert badge */}
            <button
              type="button"
              onClick={openAlerts}
              aria-label="Guard alerts"
              title="Guard alerts"
              className="relative flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-50 hover:text-ink transition-colors"
            >
              <Bell size={17} />
              {unread > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white ring-2 ring-white">
                  {unread > 9 ? '9+' : unread}
                </span>
              )}
            </button>

            {/* User Profile Pill */}
            <div className="flex items-center gap-2.5 pl-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet to-primary text-xs font-bold text-white shadow-sm">
                {initials(user.full_name)}
              </div>
              <div className="hidden leading-tight md:block text-left">
                <p className="text-xs font-bold text-slate-800">{user.full_name}</p>
                <p className="text-[10px] text-muted font-medium">{roleLabel(user.role)}</p>
              </div>
            </div>
          </div>
        </header>

        {/* Scrollable Dashboard View */}
        <main className="flex-1 overflow-y-auto p-6 bg-base">
          {children({ tab: activeTab, searchQuery })}
        </main>
      </div>

      <Modal
        open={alertsOpen}
        onClose={() => setAlertsOpen(false)}
        title="Guard alerts"
        subtitle={
          alerts.length
            ? `${alerts.length} alert${alerts.length === 1 ? '' : 's'} received from field guards`
            : 'Alerts raised from the guard handset appear here in real time'
        }
        footer={
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              setActiveTab('incidents');
              setAlertsOpen(false);
            }}
          >
            Open incident register
          </Button>
        }
      >
        {alerts.length === 0 ? (
          <EmptyState
            title="No guard alerts yet"
            hint="SOS and field incidents raised by guards will appear here in real time."
          />
        ) : (
          <ul className="space-y-2">
            {alerts.map((incident) => (
              <li key={incident.id}>
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('incidents');
                    setAlertsOpen(false);
                  }}
                  className="w-full rounded-xl border border-line bg-white px-3.5 py-3 text-left transition-colors hover:bg-slate-50"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-bold text-slate-800">
                        {(incident.incident_type || 'ALERT').replaceAll('_', ' ')}
                        {incident.post_name ? ` · ${incident.post_name}` : ''}
                      </p>
                      <p className="mt-0.5 truncate text-[11px] text-muted">
                        {incident.reported_by_name || 'Field guard'}
                        {incident.zone_name ? ` · ${incident.zone_name}` : ''}
                        {incident.occurred_at ? ` · ${fmtDateTime(incident.occurred_at)}` : ''}
                      </p>
                    </div>
                    <StatusBadge status={incident.status} />
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Modal>
    </div>
  );
}
