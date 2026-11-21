import React from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight, X } from 'lucide-react';
import { toneForStatus } from '../../lib/format';

export function cx(...values) {
  return values.filter(Boolean).join(' ');
}

export function Badge({ tone = 'neutral', children, className }) {
  return <span className={cx('badge', `badge-${tone}`, className)}>{children}</span>;
}

export function StatusBadge({ status, label }) {
  const tone = toneForStatus(status);
  return (
    <Badge tone={tone}>
      <span
        className={cx(
          'h-1.5 w-1.5 rounded-full',
          tone === 'green' && 'bg-emerald-500',
          tone === 'yellow' && 'bg-amber-500',
          tone === 'red' && 'bg-rose-500',
          tone === 'info' && 'bg-sky-500',
          tone === 'neutral' && 'bg-slate-400',
        )}
      />
      {label || (status || 'UNKNOWN').replaceAll('_', ' ')}
    </Badge>
  );
}

export function Panel({ title, subtitle, actions, children, className, bodyClassName }) {
  return (
    <section className={cx('panel flex flex-col', className)}>
      {(title || actions) && (
        <header className="panel-head">
          <div>
            {title && <h2 className="panel-title">{title}</h2>}
            {subtitle && <p className="panel-sub mt-0.5">{subtitle}</p>}
          </div>
          {actions && <div className="flex flex-shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={cx('flex-1', bodyClassName || 'p-5')}>{children}</div>
    </section>
  );
}

/**
 * Summary KPI Card styled exactly like the user's reference image:
 * Rounded pastel container with top-border/background accent, title, large value, and right chevron arrow.
 */
export function Kpi({ label, value, hint, tone = 'neutral', onClick }) {
  // Preset palettes matching the reference screenshot:
  // soft green, soft pink/red, soft yellow/orange, soft blue/cyan, soft slate
  const colorMap = {
    green: 'bg-[#EAF8F1] border-[#CDEEDF] text-[#1E7453]',
    red: 'bg-[#FDF0ED] border-[#FBDCD3] text-[#B83E28]',
    yellow: 'bg-[#FEF8EC] border-[#FCEECF] text-[#A66C1E]',
    info: 'bg-[#EEF9FD] border-[#D6F1FA] text-[#1C7393]',
    neutral: 'bg-[#F8FAFC] border-[#E2E8F0] text-[#475569]',
  };

  const currentTheme = colorMap[tone] || colorMap.neutral;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        'group relative flex w-full items-center justify-between rounded-2xl border p-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card',
        currentTheme,
        onClick ? 'cursor-pointer' : 'cursor-default'
      )}
    >
      <div className="min-w-0 pr-2">
        <span className="block text-xs font-semibold text-slate-700 truncate">
          {label}
        </span>
        <span className="mt-1 block text-xl font-bold tracking-tight text-slate-900 tabular-nums">
          {value}
        </span>
        {hint && (
          <span className="mt-0.5 block text-[10px] text-slate-600 truncate">
            {hint}
          </span>
        )}
      </div>
      <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-white/70 text-slate-400 shadow-sm transition-transform group-hover:translate-x-0.5">
        <ChevronRight size={14} />
      </div>
    </button>
  );
}

export function Button({ variant = 'default', size, className, ...props }) {
  const variantClass =
    variant === 'primary'
      ? 'btn-primary'
      : variant === 'danger'
        ? 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100'
        : variant === 'ghost'
          ? 'btn-ghost'
          : '';
  return <button className={cx('btn', variantClass, size === 'sm' && 'btn-sm', className)} {...props} />;
}

export function Modal({ open, onClose, title, subtitle, children, footer, wide }) {
  if (!open) return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <div
        className={cx(
          'panel max-h-[90vh] w-full overflow-hidden shadow-2xl animate-slide-in',
          wide ? 'max-w-5xl' : 'max-w-lg',
        )}
      >
        <header className="panel-head border-b border-line bg-slate-50/50">
          <div>
            <h2 className="panel-title">{title}</h2>
            {subtitle && <p className="panel-sub mt-0.5">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} className="btn btn-ghost btn-sm" aria-label="Close">
            <X size={14} />
          </button>
        </header>
        <div className="max-h-[68vh] overflow-y-auto p-5">{children}</div>
        {footer && (
          <footer className="flex items-center justify-end gap-2 border-t border-line bg-slate-50/80 px-5 py-3.5">
            {footer}
          </footer>
        )}
      </div>
    </div>,
    document.body,
  );
}

export function Field({ label, children, hint }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[10px] text-muted">{hint}</span>}
    </label>
  );
}

export function EmptyState({ title = 'Nothing to report', hint }) {
  return (
    <div className="grid place-items-center gap-1 py-10 text-center">
      <p className="text-xs font-bold text-slate-700">{title}</p>
      {hint && <p className="text-[11px] text-muted">{hint}</p>}
    </div>
  );
}

export function Spinner({ label }) {
  return (
    <div className="flex items-center gap-2 text-xs text-muted">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-200 border-t-primary" />
      {label || 'Loading…'}
    </div>
  );
}

export function ErrorBanner({ message, onDismiss }) {
  if (!message) return null;
  return (
    <div className="flex items-start justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700 shadow-sm">
      <span className="flex items-center gap-2">
        <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
        {message}
      </span>
      {onDismiss && (
        <button type="button" className="text-rose-500 hover:text-rose-700" onClick={onDismiss}>
          <X size={14} />
        </button>
      )}
    </div>
  );
}

export function ProgressBar({ value = 0, tone = 'green' }) {
  const pct = Math.max(0, Math.min(100, Math.round(value * 100)));
  const toneClass =
    tone === 'red'
      ? 'bg-rose-500'
      : tone === 'yellow'
        ? 'bg-amber-400'
        : 'bg-emerald-500';
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
      <div
        className={cx('h-full rounded-full transition-all duration-300', toneClass)}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function RagDot({ status = 'GREEN' }) {
  const tone = (status || '').toUpperCase();
  return (
    <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider">
      <span
        className={cx(
          'h-2 w-2 rounded-full',
          tone === 'RED' && 'bg-rose-500 animate-pulse',
          tone === 'YELLOW' && 'bg-amber-400',
          tone === 'GREEN' && 'bg-emerald-500',
        )}
      />
      <span
        className={cx(
          tone === 'RED' ? 'text-rose-600' : tone === 'YELLOW' ? 'text-amber-600' : 'text-emerald-600',
        )}
      >
        {status}
      </span>
    </span>
  );
}
