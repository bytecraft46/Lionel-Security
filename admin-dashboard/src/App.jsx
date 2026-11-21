import React from 'react';
import { ShieldOff } from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import AppShell from './components/layout/AppShell';
import SignInPage from './pages/SignInPage';
import CEODashboard from './pages/ceo/CEODashboard';
import OpsDashboard from './pages/ops/OpsDashboard';
import SupervisorDashboard from './pages/supervisor/SupervisorDashboard';

function GuardNotice({ onSignOut }) {
  return (
    <div className="grid min-h-screen place-items-center bg-base px-4">
      <div className="panel max-w-sm p-6 text-center">
        <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl border border-amber-200 bg-amber-50 text-amber-600">
          <ShieldOff size={24} />
        </div>
        <h1 className="text-sm font-bold text-ink">Field role — console restricted</h1>
        <p className="mt-1 text-[11px] leading-relaxed text-muted">
          Guard accounts record attendance, GPS and SOS through the Lionel Field handset app. The
          command console is reserved for the CEO, Operations Manager and Supervisor desks.
        </p>
        <button type="button" className="btn btn-primary mt-4 w-full" onClick={onSignOut}>
          Sign out
        </button>
      </div>
    </div>
  );
}

function RoutedApp() {
  const { user, booting, signOut } = useAuth();

  if (booting) {
    return (
      <div className="grid min-h-screen place-items-center bg-base">
        <div className="flex items-center gap-2 text-[11px] text-muted">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-accent" />
          Restoring command session…
        </div>
      </div>
    );
  }

  if (!user) return <SignInPage />;
  if (!['CEO', 'OPS_MANAGER', 'SUPERVISOR'].includes(user.role)) {
    return <GuardNotice onSignOut={signOut} />;
  }

  return (
    <AppShell user={user} onSignOut={signOut}>
      {({ tab }) => {
        if (user.role === 'CEO') return <CEODashboard tab={tab} />;
        if (user.role === 'SUPERVISOR') return <SupervisorDashboard tab={tab} user={user} />;
        if (user.role === 'OPS_MANAGER') return <OpsDashboard tab={tab} />;
        return <GuardNotice onSignOut={signOut} />;
      }}
    </AppShell>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <RoutedApp />
      </AuthProvider>
    </ThemeProvider>
  );
}
