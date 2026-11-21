import React, { useState } from 'react';
import { Eye, EyeOff, Lock, Moon, Sun, User } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { ErrorBanner, Field } from '../components/ui';

export default function SignInPage() {
  const { signIn, notice, clearNotice } = useAuth();
  const { theme, toggleTheme } = useTheme();
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
    <div className="app-bg relative grid min-h-screen w-screen place-items-center overflow-hidden px-4 text-ink">
      <div className="absolute top-4 right-4 z-20">
        <button
          type="button"
          onClick={toggleTheme}
          className="btn btn-ghost btn-sm h-9 w-9 p-0 rounded-xl border border-line bg-panel text-muted hover:text-ink shadow-sm"
          title={`Switch to ${theme === 'light' ? 'Dark' : 'Light'} theme`}
          aria-label="Toggle theme"
        >
          {theme === 'light' ? <Moon size={15} /> : <Sun size={15} className="text-amber-400" />}
        </button>
      </div>

      <div className="pointer-events-none absolute -left-40 top-1/4 h-96 w-96 rounded-full bg-indigo-500/10 blur-3xl" />
      <div className="pointer-events-none absolute -right-32 bottom-0 h-96 w-96 rounded-full bg-cyan-500/10 blur-3xl" />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            'linear-gradient(#6366f1 1px, transparent 1px), linear-gradient(90deg, #6366f1 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />

      <div className="relative z-10 w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <img
            src="/brand/lionel-logo.webp"
            alt="Lionel Security (Pvt) Ltd"
            className="h-20 w-auto object-contain drop-shadow-sm"
          />
          <p className="mt-3 text-[10px] font-bold uppercase tracking-[0.22em] text-indigo-600 dark:text-indigo-400">
            Central Operations Control
          </p>
        </div>

        <div className="panel p-6 sm:p-7 shadow-xl">
          <div className="mb-5">
            <h2 className="text-base font-extrabold text-ink">Command Sign In</h2>
            <p className="mt-0.5 text-xs text-muted">
              Authorized Executive, Operations & Supervisory staff only.
            </p>
          </div>

          <div className="space-y-4">
            <ErrorBanner message={error || notice} onDismiss={() => setError(null)} />
            <form onSubmit={handleSubmit} className="space-y-3.5">
              <Field label="Email / phone / CNIC / employee ID">
                <div className="relative">
                  <User size={14} className="pointer-events-none absolute left-3 top-3 text-muted" />
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
                  <Lock size={14} className="pointer-events-none absolute left-3 top-3 text-muted" />
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
                    className="absolute right-3 top-2.5 text-muted hover:text-ink"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </Field>

              <button type="submit" className="btn btn-primary w-full py-2.5 text-xs font-bold mt-2" disabled={loading}>
                {loading ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                ) : (
                  'Authenticate & Enter Command'
                )}
              </button>
            </form>
          </div>

          <p className="mt-5 border-t border-line pt-3 text-[10px] leading-relaxed text-muted">
            Access is logged and audited. Field guards must record attendance via the Lionel Handset application.
          </p>
        </div>

        <p className="mt-4 text-center text-[10px] uppercase tracking-widest text-muted font-semibold">
          Lionel Security (Pvt) Ltd · Karachi HQ
        </p>
      </div>
    </div>
  );
}
