import { useState } from 'react';
import type { DeskCommand } from '../../../shared/types';
import { Field } from '../components/Field';

export function OnboardingScreen({
  pending,
  dispatch,
}: {
  pending: boolean;
  dispatch: (command: DeskCommand) => Promise<unknown>;
}) {
  const [appName, setAppName] = useState('Desk');
  const [accentColor, setAccentColor] = useState('#2f5d8c');
  const [logoPath, setLogoPath] = useState('');
  const [autostart, setAutostart] = useState(false);
  const [seedSample, setSeedSample] = useState(true);

  return (
    <form
      className="onboarding stack"
      onSubmit={(event) => {
        event.preventDefault();
        void dispatch({
          type: 'completeOnboarding',
          autostart,
          seedSample,
          appName,
          accentColor,
          logoPath: logoPath || undefined,
        });
      }}
    >
      <div>
        <h1>{appName || 'Desk'}</h1>
        <p className="muted">One place for the local AI tools on this computer</p>
      </div>
      <p>
        Connect the MCP servers and local tools your assistants use, such as Desktop Commander, Serena, or anything else
        you run. {appName || 'Desk'} checks that each one is up, and tells you when one drops.
      </p>
      <p>Nothing is tied to an account. The name, colour, and logo below stay on this machine.</p>
      <Field label="App name">
        <input value={appName} onChange={(event) => setAppName(event.target.value)} required />
      </Field>
      <Field label="Accent colour">
        <input type="color" value={accentColor} onChange={(event) => setAccentColor(event.target.value)} />
      </Field>
      <Field label="Logo file" help="Optional. A PNG, JPG, WEBP, GIF, or SVG path on this computer.">
        <input
          value={logoPath}
          placeholder="/home/you/logo.png"
          onChange={(event) => setLogoPath(event.target.value)}
        />
      </Field>
      <label className="check">
        <input type="checkbox" checked={autostart} onChange={(event) => setAutostart(event.target.checked)} />
        <span>Start when I log in. The window stays closed and the tray icon remains.</span>
      </label>
      <label className="check">
        <input type="checkbox" checked={seedSample} onChange={(event) => setSeedSample(event.target.checked)} />
        <span>Add two sample connections so you can see a health check immediately. You can delete them.</span>
      </label>
      <button className="primary" type="submit" disabled={pending}>
        {pending ? 'Starting…' : `Use ${appName || 'Desk'} on this computer`}
      </button>
    </form>
  );
}
