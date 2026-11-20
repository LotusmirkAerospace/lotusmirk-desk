import { useMemo, useState } from 'react';
import type { AdapterSummary, ConnectionView, DeskCommand, DeskSnapshot } from '../../../shared/types';
import { Field } from '../components/Field';
import { StatusPill } from '../components/StatusPill';

function toneFor(status: string | undefined): 'ok' | 'bad' | 'warn' | 'neutral' {
  if (status === 'healthy') return 'ok';
  if (status === 'unreachable') return 'warn';
  if (status === 'error') return 'bad';
  return 'neutral';
}

export function ConnectionsScreen({
  snapshot,
  pending,
  dispatch,
}: {
  snapshot: DeskSnapshot;
  pending: boolean;
  dispatch: (command: DeskCommand) => Promise<unknown>;
}) {
  const adapters = snapshot.connectionAdapters.filter((adapter) => adapter.implemented);
  const [adapterId, setAdapterId] = useState(adapters[0]?.id ?? 'http');
  const adapter = adapters.find((item) => item.id === adapterId) ?? adapters[0];
  const [name, setName] = useState('');
  const [secret, setSecret] = useState('');
  const [config, setConfig] = useState<Record<string, string>>({});

  const fields = adapter?.fields ?? [];
  const values = useMemo(() => {
    const next: Record<string, string> = {};
    for (const field of fields) {
      next[field.key] = config[field.key] ?? (field.input === 'select' ? field.options?.[0]?.value ?? '' : '');
    }
    return next;
  }, [config, fields]);

  return (
    <div className="split">
      <section className="stack">
        <div>
          <h1>Connections</h1>
          <p className="muted">One list of the local AI tools on this computer, and whether each one is up.</p>
        </div>
        {snapshot.connections.length === 0 ? (
          <p>
            No connectors yet. Add Desktop Commander, Serena, or any other MCP server, process, or HTTP endpoint you
            want every assistant on this computer to be able to use.
          </p>
        ) : (
          snapshot.connections.map((connection) => (
            <ConnectionCard key={connection.id} connection={connection} pending={pending} dispatch={dispatch} adapters={adapters} />
          ))
        )}
      </section>
      <form
        className="card"
        onSubmit={(event) => {
          event.preventDefault();
          if (!adapter) return;
          void dispatch({
            type: 'addConnection',
            name,
            adapterId: adapter.id,
            config: values,
            secret: secret || undefined,
          }).then(() => {
            setName('');
            setSecret('');
          });
        }}
      >
        <h2>Add a connection</h2>
        <Field label="Name">
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Local MCP server" required />
        </Field>
        <Field label="Type" help={adapter?.description}>
          <select
            value={adapter?.id ?? ''}
            onChange={(event) => {
              setAdapterId(event.target.value);
              setConfig({});
              setSecret('');
            }}
          >
            {adapters.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </Field>
        {fields.map((field) => (
          <Field key={field.key} label={field.label} help={field.help}>
            {field.input === 'select' ? (
              <select
                value={values[field.key] ?? ''}
                onChange={(event) => setConfig({ ...values, [field.key]: event.target.value })}
              >
                {field.options?.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                value={values[field.key] ?? ''}
                placeholder={field.placeholder}
                required={field.required}
                onChange={(event) => setConfig({ ...values, [field.key]: event.target.value })}
              />
            )}
          </Field>
        ))}
        {adapter?.secret ? (
          <Field label={adapter.secret.label} help={adapter.secret.help}>
            <input value={secret} onChange={(event) => setSecret(event.target.value)} autoComplete="off" />
          </Field>
        ) : null}
        <button className="primary" type="submit" disabled={pending || !adapter}>
          {pending ? 'Working…' : 'Add and check'}
        </button>
      </form>
    </div>
  );
}

function ConnectionCard({
  connection,
  pending,
  dispatch,
  adapters,
}: {
  connection: ConnectionView;
  pending: boolean;
  dispatch: (command: DeskCommand) => Promise<unknown>;
  adapters: AdapterSummary[];
}) {
  const adapter = adapters.find((item) => item.id === connection.adapterId);
  const status = connection.lastReport?.status;
  return (
    <article className="card stack">
      <div className="row">
        <strong>{connection.name}</strong>
        <StatusPill
          tone={toneFor(status ?? 'unknown')}
          label={connection.lastReport ? connection.lastReport.status : 'Not checked'}
        />
        {!connection.enabled ? <StatusPill tone="neutral" label="Paused" /> : null}
        {connection.hasSecret ? <StatusPill tone="info" label="Credential saved" /> : null}
      </div>
      <p className="muted">{adapter?.label ?? connection.adapterId}</p>
      <p>{connection.lastReport?.message ?? 'Desk has not checked this yet.'}</p>
      {connection.lastReport ? (
        <p className="muted">
          {new Date(connection.lastReport.checkedAt).toLocaleString()} · {connection.lastReport.latencyMs}ms
        </p>
      ) : null}
      <div className="row">
        <button type="button" disabled={pending} onClick={() => void dispatch({ type: 'checkConnection', id: connection.id })}>
          Check
        </button>
        <button type="button" disabled={pending} onClick={() => void dispatch({ type: 'reconnectConnection', id: connection.id })}>
          Reconnect
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => void dispatch({ type: 'setConnectionEnabled', id: connection.id, enabled: !connection.enabled })}
        >
          {connection.enabled ? 'Pause' : 'Resume'}
        </button>
        <button type="button" disabled={pending} onClick={() => void dispatch({ type: 'removeConnection', id: connection.id })}>
          Remove
        </button>
      </div>
    </article>
  );
}
