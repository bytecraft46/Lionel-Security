import React, { useState } from 'react';
import { Eye, EyeOff, Lock, User } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { ErrorBanner, Field } from '../components/ui';

export default function SignInPage() {
  const { signIn, notice, clearNotice } = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    clearNotice?.();
    try {
      await signIn(identifier.trim(), password);
    } catch (err) {
      setError(err.message || 'Sign in failed.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app-bg relative grid min-h-screen w-screen place-items-center overflow-hidden px-4">
      <div className="pointer-events-none absolute -left-40 top-1/4 h-96 w-96 rounded-full bg-violet/10 blur-3xl" />
      <div className="pointer-events-none absolute -right-32 bottom-0 h-96 w-96 rounded-full bg-cyan/10 blur-3xl" />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage:
            'linear-gradient(#7c3aed 1px, transparent 1px), linear-gradient(90deg, #7c3aed 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
      />

      <div className="relative z-10 w-full max-w-sm">
        <div className="mb-5 flex flex-col items-center text-center">
          <img
            src="/brand/lionel-logo.webp"
            alt="Lionel Security (Pvt) Ltd"
            className="h-24 w-auto object-contain drop-shadow-sm"
          />
          <p className="mt-3 text-[10px] uppercase tracking-[0.18em] text-muted">
            Central Operations Control
          </p>
        </div>

        <div className="panel p-6">
          <div className="mb-4">
            <h2 className="text-sm font-bold text-ink">Command sign in</h2>
            <p className="mt-0.5 text-[11px] text-muted">
              CEO, Operations, Supervisor and Administrative personnel only.
            </p>
          </div>

          <div className="space-y-3">
            <ErrorBanner message={error || notice} onDismiss={() => setError(null)} />
            <form onSubmit={handleSubmit} className="space-y-3">
              <Field label="Email / phone / CNIC / employee ID">
                <div className="relative">
                  <User size={14} className="pointer-events-none absolute left-3 top-2.5 text-muted" />
                  <input
                    className="input pl-9"
                    value={identifier}
                    onChange={(event) => setIdentifier(event.target.value)}
                    placeholder="ops@lionel.pk"
                    autoComplete="username"
                    required
                    autoFocus
                  />
                </div>
              </Field>

              <Field label="Password">
                <div className="relative">
                  <Lock size={14} className="pointer-events-none absolute left-3 top-2.5 text-muted" />
                  <input
                    className="input pl-9 pr-9"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="••••••••••"
                    autoComplete="current-password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    className="absolute right-2.5 top-2 text-muted hover:text-ink"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </Field>

              <button type="submit" className="btn btn-primary w-full py-2.5 text-xs" disabled={loading}>
                {loading ? (
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                ) : (
                  'Sign in to command'
                )}
              </button>
            </form>
          </div>

          <p className="mt-5 border-t border-line pt-3 text-[10px] leading-relaxed text-muted/80">
            Access is logged and role-scoped. Guards record attendance through the Lionel Field
            app; this console is restricted to command and supervisory staff.
          </p>
        </div>

        <p className="mt-4 text-center text-[10px] uppercase tracking-wider text-muted/60">
          Lionel Security (Pvt) Ltd · Karachi
        </p>
      </div>
    </div>
  );
}
