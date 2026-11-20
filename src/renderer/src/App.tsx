import { useEffect, useState, type CSSProperties } from 'react';
import { ConnectionsScreen } from './screens/ConnectionsScreen';
import { OnboardingScreen } from './screens/OnboardingScreen';
import { ReposScreen } from './screens/ReposScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { useDesk } from './useDesk';

type Screen = 'connections' | 'repos' | 'settings';

export default function App() {
  const { snapshot, error, pending, dispatch, refresh } = useDesk();
  const [screen, setScreen] = useState<Screen>('connections');
  useEffect(() => {
    if (snapshot?.settings.appName) document.title = snapshot.settings.appName;
  }, [snapshot?.settings.appName]);

  if (!snapshot) {
    return (
      <main className="content stack">
        <h1>Desk</h1>
        {error ? (
          <>
            <p className="banner">{error}</p>
            <button type="button" onClick={() => void refresh()}>
              Retry
            </button>
          </>
        ) : (
          <p>Loading Desk…</p>
        )}
      </main>
    );
  }

  const accent = { '--color-accent': snapshot.settings.accentColor } as CSSProperties;
  if (!snapshot.settings.onboardingComplete) {
    return (
      <main style={accent}>
        {error ? <p className="banner">{error}</p> : null}
        <OnboardingScreen pending={pending} dispatch={dispatch} />
      </main>
    );
  }

  return (
    <div className="app" style={accent}>
      <header className="topbar">
        <p className="brand">
          {snapshot.settings.hasLogo ? <img className="logo" src="/api/logo" alt="" /> : null}
          {snapshot.settings.appName} <span>local AI connectors</span>
        </p>
        <nav>
          <NavButton current={screen} id="connections" onSelect={setScreen}>
            Connections
          </NavButton>
          <NavButton current={screen} id="repos" onSelect={setScreen}>
            Repos
          </NavButton>
          <NavButton current={screen} id="settings" onSelect={setScreen}>
            Settings
          </NavButton>
          <button type="button" disabled={pending} onClick={() => void dispatch({ type: 'checkAll' })}>
            Check all
          </button>
        </nav>
      </header>
      {error ? <p className="banner">{error}</p> : null}
      {snapshot.alerts.length > 0 ? (
        <div className="alerts">
          {snapshot.alerts.map((alert) => (
            <div key={alert.id} className={`alert alert-${alert.level}`} role="status">
              <span>{alert.message}</span>
              <button type="button" onClick={() => void dispatch({ type: 'dismissAlert', id: alert.id })}>
                Dismiss
              </button>
            </div>
          ))}
        </div>
      ) : null}
      <main className="content">{renderScreen(screen, snapshot, pending, dispatch)}</main>
    </div>
  );
}

function renderScreen(
  screen: Screen,
  snapshot: NonNullable<ReturnType<typeof useDesk>['snapshot']>,
  pending: boolean,
  dispatch: ReturnType<typeof useDesk>['dispatch'],
) {
  switch (screen) {
    case 'connections':
      return <ConnectionsScreen snapshot={snapshot} pending={pending} dispatch={dispatch} />;
    case 'repos':
      return <ReposScreen snapshot={snapshot} pending={pending} dispatch={dispatch} />;
    case 'settings':
      return <SettingsScreen snapshot={snapshot} pending={pending} dispatch={dispatch} />;
    default: {
      const neverScreen: never = screen;
      return neverScreen;
    }
  }
}

function NavButton({
  current,
  id,
  onSelect,
  children,
}: {
  current: Screen;
  id: Screen;
  onSelect: (screen: Screen) => void;
  children: string;
}) {
  return (
    <button type="button" aria-current={current === id ? 'page' : undefined} onClick={() => onSelect(id)}>
      {children}
    </button>
  );
}
