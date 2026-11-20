import { useState } from 'react';
import type { DeskCommand, DeskSnapshot } from '../../../shared/types';
import { Field } from '../components/Field';

export function SettingsScreen({
  snapshot,
  pending,
  dispatch,
}: {
  snapshot: DeskSnapshot;
  pending: boolean;
  dispatch: (command: DeskCommand) => Promise<unknown>;
}) {
  const settings = snapshot.settings;
  const [appName, setAppName] = useState(settings.appName);
  const [accentColor, setAccentColor] = useState(settings.accentColor);
  const [logoPath, setLogoPath] = useState('');
  const [markdownHub, setMarkdownHub] = useState(settings.markdownHub);
  const [webhookUrl, setWebhookUrl] = useState(settings.webhookUrl);
  const [webhookSecret, setWebhookSecret] = useState('');

  return (
    <section className="stack">
      <div>
        <h1>Settings</h1>
        <p className="muted">Local only. Closing the window leaves the app in the tray. Quit from the tray menu.</p>
      </div>
      <form
        className="card stack"
        onSubmit={(event) => {
          event.preventDefault();
          void dispatch({
            type: 'updateSettings',
            appName,
            accentColor,
            logoPath: logoPath || undefined,
          }).then(() => setLogoPath(''));
        }}
      >
        <h2>Appearance</h2>
        <Field label="App name">
          <input value={appName} onChange={(event) => setAppName(event.target.value)} required />
        </Field>
        <Field label="Accent colour">
          <input type="color" value={accentColor} onChange={(event) => setAccentColor(event.target.value)} />
        </Field>
        <Field label="Replace logo" help="Leave blank to keep the current logo.">
          <input value={logoPath} placeholder="Path to an image file" onChange={(event) => setLogoPath(event.target.value)} />
        </Field>
        <div className="row">
          <button className="primary" type="submit" disabled={pending}>
            Save appearance
          </button>
          {settings.hasLogo ? (
            <button type="button" disabled={pending} onClick={() => void dispatch({ type: 'updateSettings', clearLogo: true })}>
              Remove logo
            </button>
          ) : null}
        </div>
      </form>
      <form
        className="card stack"
        onSubmit={(event) => {
          event.preventDefault();
          void dispatch({ type: 'updateSettings', markdownHub });
        }}
      >
        <h2>Markdown hub</h2>
        <p className="muted">
          Paste a Google Drive folder link, or a local folder path, for the markdown files your assistants share.
        </p>
        <Field label="Folder link or path" help="Leave blank if you do not share markdown yet.">
          <input
            value={markdownHub}
            placeholder="https://drive.google.com/drive/folders/…"
            onChange={(event) => setMarkdownHub(event.target.value)}
          />
        </Field>
        <p className="help">
          Instructions for assistants are written to <span className="mono">{settings.instructionsPath}</span>
          {settings.markdownHubKind === 'local-path' ? ', and into that folder when it exists.' : '.'}
        </p>
        <button className="primary" type="submit" disabled={pending}>
          Save markdown hub
        </button>
      </form>
      <form
        className="card stack"
        onSubmit={(event) => {
          event.preventDefault();
          void dispatch({
            type: 'updateSettings',
            webhookUrl,
            webhookSecret: webhookSecret || undefined,
          }).then(() => setWebhookSecret(''));
        }}
      >
        <h2>Alerts</h2>
        <p className="muted">
          When a connector fails, Desk can POST a JSON alert to your own bot. A test button sends one immediately.
        </p>
        <Field label="Webhook URL">
          <input
            value={webhookUrl}
            placeholder="https://example.com/hooks/desk"
            onChange={(event) => setWebhookUrl(event.target.value)}
          />
        </Field>
        <Field
          label="Authorization header"
          help={
            settings.hasWebhookSecret
              ? 'A header is already saved in the OS keychain. Enter a new one to replace it.'
              : 'Optional. Stored in the OS keychain, not in the settings file.'
          }
        >
          <input
            value={webhookSecret}
            autoComplete="off"
            placeholder="Bearer …"
            onChange={(event) => setWebhookSecret(event.target.value)}
          />
        </Field>
        <div className="row">
          <button className="primary" type="submit" disabled={pending}>
            Save alert webhook
          </button>
          <button type="button" disabled={pending || !settings.webhookUrl} onClick={() => void dispatch({ type: 'sendTestAlert' })}>
            Send test alert
          </button>
          {settings.hasWebhookSecret ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => void dispatch({ type: 'updateSettings', clearWebhookSecret: true })}
            >
              Clear saved header
            </button>
          ) : null}
        </div>
      </form>
      <div className="card stack">
        <h2>This computer</h2>
        <label className="check">
          <input
            type="checkbox"
            checked={settings.autostart}
            disabled={pending || !settings.autostartSupported}
            onChange={(event) => void dispatch({ type: 'updateSettings', autostart: event.target.checked })}
          />
          <span>Start when I log in</span>
        </label>
        {!settings.autostartSupported ? <p className="help">This environment cannot register a login item.</p> : null}
        <label className="check">
          <input
            type="checkbox"
            checked={settings.autoInstallInbox}
            disabled={pending}
            onChange={(event) => void dispatch({ type: 'updateSettings', autoInstallInbox: event.target.checked })}
          />
          <span>Automatically install and smoke-test packages dropped in the inbox</span>
        </label>
        <Field label="Check connectors every (seconds)" help="Between 15 and 3600.">
          <input
            type="number"
            min={15}
            max={3600}
            defaultValue={settings.checkIntervalSec}
            key={settings.checkIntervalSec}
            onBlur={(event) => {
              const value = Number(event.target.value);
              if (value !== settings.checkIntervalSec) {
                void dispatch({ type: 'updateSettings', checkIntervalSec: value });
              }
            }}
          />
        </Field>
        <p>
          Data folder <span className="mono">{settings.dataDir}</span>
        </p>
        <p>
          Inbox <span className="mono">{settings.inboxDir}</span>
        </p>
        <p>
          Credentials{' '}
          {settings.secretsMode === 'os-keychain'
            ? 'OS keychain (encrypted before they touch disk)'
            : 'OS keychain is unavailable, so Desk will refuse to store secrets'}
        </p>
      </div>
      <div className="card stack">
        <h2>About</h2>
        <p>
          Built by <a href="https://lotusmirk.com" target="_blank" rel="noreferrer">Lotusmirk</a>.
        </p>
        <p className="help">Free local software. It is not tied to an account.</p>
      </div>
      <div className="card stack">
        <h2>Recent log</h2>
        {snapshot.logs.length === 0 ? <p className="muted">No log lines yet.</p> : null}
        <pre>{snapshot.logs.map((line) => `${line.at} ${line.level.toUpperCase()} ${line.message}`).join('\n')}</pre>
      </div>
    </section>
  );
}
