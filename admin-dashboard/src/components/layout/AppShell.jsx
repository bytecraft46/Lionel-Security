import React, { useEffect, useState } from 'react';
import { LogOut, Radio } from 'lucide-react';
import { NAV_BY_ROLE, initials, roleLabel } from '../../lib/format';
import { useSocketStatus } from '../../lib/socket';
import { cx } from '../ui';

function LiveClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  return (
    <div className="hidden text-right sm:block">
      <p className="font-mono text-sm font-bold tabular-nums text-ink">
        {now.toLocaleTimeString('en-GB', { hour12: false })}
      </p>
      <p className="text-[10px] uppercase tracking-wider text-muted">
        {now.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' })} · PKT
      </p>
    </div>
  );
}

export default function AppShell({ user, onSignOut, children }) {
  const navItems = NAV_BY_ROLE[user.role] || NAV_BY_ROLE.OPS_MANAGER;
  const [activeTab, setActiveTab] = useState(navItems[0].id);
  const [connected, setConnected] = useState(false);
  useSocketStatus(setConnected);

  useEffect(() => {
    setActiveTab(navItems[0].id);
  }, [user.role]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="app-bg flex h-screen w-screen flex-col overflow-hidden">
      <header className="flex h-16 flex-shrink-0 items-center justify-between border-b border-line bg-panel/85 px-4 shadow-sm backdrop-blur-xl lg:px-6">
        <div className="flex items-center gap-3">
          <img
            src="/brand/lionel-crest.webp"
            alt="Lionel Security crest"
            className="h-11 w-11 flex-shrink-0 object-contain drop-shadow-sm"
          />
          <div>
            <h1 className="text-sm font-black uppercase tracking-[0.16em] text-ink">
              Lionel Security
            </h1>
            <p className="text-[10px] uppercase tracking-[0.14em] text-muted">
              Central Guard Deployment & Security Operations
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden items-center gap-2 rounded-full border border-line bg-panelAlt/70 px-3 py-1.5 md:flex">
            <Radio size={12} className={connected ? 'text-emerald-500' : 'text-rose-500'} />
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted">
              {connected ? 'Live link' : 'Reconnecting'}
            </span>
          </div>
          <LiveClock />
          <div className="flex items-center gap-2 border-l border-line pl-3">
            <div className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-violet to-cyan text-[11px] font-black text-white shadow-md shadow-violet/30">
              {initials(user.full_name)}
            </div>
            <div className="hidden leading-tight lg:block">
              <p className="text-[11px] font-bold text-ink">{user.full_name}</p>
              <p className="text-[10px] text-muted">{roleLabel(user.role)}</p>
            </div>
            <button
              type="button"
              onClick={onSignOut}
              className="btn btn-ghost btn-sm ml-1"
              title="Sign out"
            >
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <aside className="flex w-16 flex-col gap-1 border-r border-line bg-panel px-2 py-3 lg:w-56">
          <p className="mb-1 hidden px-2 text-[9px] font-bold uppercase tracking-[0.18em] text-muted/70 lg:block">
            {roleLabel(user.role)} Desk
          </p>
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
              className={cx('nav-item', activeTab === item.id && 'nav-item-active')}
            >
              <span className="grid h-5 w-5 place-items-center rounded-lg bg-line/60 text-[9px] font-black text-muted">
                {item.label.slice(0, 1)}
              </span>
              <span className="hidden lg:block">{item.label}</span>
            </button>
          ))}
          <div className="mt-auto hidden rounded-xl border border-line bg-panelAlt/60 p-3 lg:block">
            <p className="text-[9px] font-bold uppercase tracking-wider text-muted">
              Organisation
            </p>
            <p className="mt-1 text-[10px] leading-relaxed text-muted/80">
              Lionel Security (Pvt) Ltd — Karachi operations command.
            </p>
          </div>
        </aside>

        <main className="flex-1 overflow-y-auto">{children({ tab: activeTab })}</main>
      </div>
    </div>
  );
}
