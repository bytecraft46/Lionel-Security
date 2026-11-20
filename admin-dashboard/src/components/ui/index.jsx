import React from 'react';
import { X } from 'lucide-react';
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
          tone === 'green' && 'bg-emerald-400',
          tone === 'yellow' && 'bg-amber-400',
          tone === 'red' && 'bg-rose-500',
          tone === 'info' && 'bg-sky-400',
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
      <div className={cx('flex-1', bodyClassName || 'p-4')}>{children}</div>
    </section>
  );
}

export function Kpi({ label, value, hint, tone = 'neutral', onClick }) {
  const toneClass =
    tone === 'red'
      ? 'border-rose-200 bg-rose-50'
      : tone === 'yellow'
        ? 'border-amber-200 bg-amber-50'
        : tone === 'green'
          ? 'border-emerald-200 bg-emerald-50'
          : '';
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx('kpi text-left', toneClass, onClick ? 'cursor-pointer hover:border-accent/60' : 'cursor-default')}
    >
      <span className="kpi-label">{label}</span>
      <span className="kpi-value">{value}</span>
      {hint && <span className="mt-0.5 block text-[10px] text-muted">{hint}</span>}
    </button>
  );
}

export function Button({ variant = 'default', size, className, ...props }) {
  const variantClass =
    variant === 'primary'
      ? 'btn-primary'
      : variant === 'danger'
        ? 'btn-danger'
        : variant === 'ghost'
          ? 'btn-ghost'
          : '';
  return <button className={cx('btn', variantClass, size === 'sm' && 'btn-sm', className)} {...props} />;
}

export function Modal({ open, onClose, title, subtitle, children, footer, wide }) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <div
        className={cx(
          'panel max-h-[90vh] w-full overflow-hidden animate-slide-in',
          wide ? 'max-w-5xl' : 'max-w-lg',
        )}
      >
        <header className="panel-head">
          <div>
            <h2 className="panel-title">{title}</h2>
            {subtitle && <p className="panel-sub mt-0.5">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} className="btn btn-ghost btn-sm" aria-label="Close">
            <X size={14} />
          </button>
        </header>
        <div className="max-h-[68vh] overflow-y-auto p-4">{children}</div>
        {footer && (
          <footer className="flex items-center justify-end gap-2 border-t border-line px-4 py-3">
            {footer}
          </footer>
        )}
      </div>
    </div>
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
    <div className="grid place-items-center gap-1 py-8 text-center">
      <p className="text-xs font-bold text-muted">{title}</p>
      {hint && <p className="text-[11px] text-muted/70">{hint}</p>}
    </div>
  );
}

export function Spinner({ label }) {
  return (
    <div className="flex items-center gap-2 text-[11px] text-muted">
      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-line border-t-accent" />
      {label || 'Loading…'}
    </div>
  );
}

export function ErrorBanner({ message, onDismiss }) {
  if (!message) return null;
  return (
    <div className="flex items-start justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] text-rose-700">
      <span>{message}</span>
      {onDismiss && (
        <button type="button" className="text-rose-500 hover:text-rose-700" onClick={onDismiss}>
          <X size={13} />
        </button>
      )}
    </div>
  );
}

export function ProgressBar({ value = 0, tone = 'green' }) {
  const pct = Math.max(0, Math.min(100, Math.round(value * 100)));
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-line">
      <div
        className={cx(
          'h-full rounded-full',
          tone === 'red' ? 'bg-rose-500' : tone === 'yellow' ? 'bg-amber-400' : 'bg-emerald-400',
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function RagDot({ status = 'GREEN' }) {
  const tone = (status || '').toUpperCase();
  return (
    <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide">
      <span
        className={cx(
          'h-2 w-2 rounded-full',
          tone === 'RED' && 'animate-pulse bg-rose-500',
          tone === 'YELLOW' && 'bg-amber-400',
          tone === 'GREEN' && 'bg-emerald-400',
        )}
      />
      <span
        className={cx(
          tone === 'RED' ? 'text-rose-600' : tone === 'YELLOW' ? 'text-amber-600' : 'text-emerald-600',
        )}
      >
        {tone}
      </span>
    </span>
  );
}
