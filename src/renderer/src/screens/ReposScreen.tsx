import { useState } from 'react';
import type { DeskCommand, DeskSnapshot, RepoView } from '../../../shared/types';
import { Field } from '../components/Field';
import { StatusPill } from '../components/StatusPill';

function repoTone(state: RepoView['state']): 'ok' | 'bad' | 'warn' | 'info' | 'neutral' {
  if (state === 'ready') return 'ok';
  if (state === 'smoke-failed') return 'bad';
  if (state === 'installing') return 'info';
  if (state === 'uninstalled') return 'neutral';
  return 'warn';
}

export function ReposScreen({
  snapshot,
  pending,
  dispatch,
}: {
  snapshot: DeskSnapshot;
  pending: boolean;
  dispatch: (command: DeskCommand) => Promise<unknown>;
}) {
  const adapters = snapshot.repoAdapters;
  const [sourceId, setSourceId] = useState(adapters.find((adapter) => adapter.implemented)?.id ?? 'npm');
  const adapter = adapters.find((item) => item.id === sourceId) ?? adapters[0];
  const [locator, setLocator] = useState('');
  const [version, setVersion] = useState('');

  return (
    <div className="split">
      <section className="stack">
        <div>
          <h1>Repos</h1>
          <p className="muted">Install a package in a sandbox, smoke-test it, then mark the ones you actually use.</p>
        </div>
        {snapshot.repos.length === 0 ? (
          <p>Nothing in the registry yet. A package counts after Desk installs it and records whether the smoke test passed.</p>
        ) : (
          snapshot.repos.map((repo) => <RepoCard key={repo.id} repo={repo} pending={pending} dispatch={dispatch} />)
        )}
      </section>
      <form
        className="card"
        onSubmit={(event) => {
          event.preventDefault();
          if (!adapter?.implemented) return;
          void dispatch({
            type: 'addAndInstall',
            sourceId: adapter.id,
            locator,
            version: version || undefined,
          }).then(() => {
            setLocator('');
            setVersion('');
          });
        }}
      >
        <h2>Install and test</h2>
        <Field label="Source" help={adapter?.description}>
          <select value={adapter?.id ?? ''} onChange={(event) => setSourceId(event.target.value)}>
            {adapters.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
                {item.implemented ? '' : ' (not available yet)'}
              </option>
            ))}
          </select>
        </Field>
        <Field label={adapter?.locatorLabel ?? 'Package'} help={adapter?.versionHelp}>
          <input
            value={locator}
            placeholder={adapter?.id === 'pip' ? 'six' : 'is-odd'}
            onChange={(event) => setLocator(event.target.value)}
            required
          />
        </Field>
        <Field label={adapter?.versionLabel ?? 'Version'}>
          <input value={version} placeholder="optional" onChange={(event) => setVersion(event.target.value)} />
        </Field>
        <button className="primary" type="submit" disabled={pending || !adapter?.implemented}>
          {pending ? 'Working…' : 'Install and test'}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => void dispatch({ type: 'addAndInstall', sourceId: 'npm', locator: 'is-odd', version: '3.0.1' })}
        >
          Try sample: npm is-odd
        </button>
        {!adapter?.implemented ? <p className="help">This source is a stub. Pick npm or pip to install something now.</p> : null}
      </form>
    </div>
  );
}

function RepoCard({
  repo,
  pending,
  dispatch,
}: {
  repo: RepoView;
  pending: boolean;
  dispatch: (command: DeskCommand) => Promise<unknown>;
}) {
  const busy = pending || repo.state === 'installing';
  return (
    <article className="card stack">
      <div className="row">
        <strong>
          {repo.locator}
          {repo.resolvedVersion ? `@${repo.resolvedVersion}` : ''}
        </strong>
        <StatusPill tone={repoTone(repo.state)} label={repo.state} />
        {repo.inUse ? <StatusPill tone="info" label="In use" /> : null}
      </div>
      <p className="muted">
        {repo.sourceId}
        {repo.requestedVersion ? ` · requested ${repo.requestedVersion}` : ''}
      </p>
      {repo.error ? <p>{repo.error}</p> : null}
      {repo.smoke ? <p>{repo.smoke.message}</p> : <p className="muted">No smoke test recorded yet.</p>}
      {repo.sandboxDir ? <p className="mono">{repo.sandboxDir}</p> : null}
      {repo.smoke?.log ? (
        <details>
          <summary>Smoke test log</summary>
          <pre>{repo.smoke.log}</pre>
        </details>
      ) : null}
      <div className="row">
        {repo.state !== 'ready' && repo.state !== 'installing' ? (
          <button type="button" disabled={busy} onClick={() => void dispatch({ type: 'installAndTest', id: repo.id })}>
            Install and test
          </button>
        ) : null}
        {repo.state === 'ready' ? (
          <button type="button" disabled={busy} onClick={() => void dispatch({ type: 'setInUse', id: repo.id, inUse: !repo.inUse })}>
            {repo.inUse ? 'Mark not in use' : 'Mark in use'}
          </button>
        ) : null}
        {repo.canRollback ? (
          <button type="button" disabled={busy} onClick={() => void dispatch({ type: 'rollbackRepo', id: repo.id })}>
            Roll back
          </button>
        ) : null}
        {repo.state !== 'uninstalled' && repo.state !== 'candidate' ? (
          <button type="button" disabled={busy} onClick={() => void dispatch({ type: 'uninstallRepo', id: repo.id })}>
            Uninstall
          </button>
        ) : null}
      </div>
    </article>
  );
}
