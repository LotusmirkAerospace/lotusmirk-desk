export function StatusPill({ tone, label }: { tone: 'ok' | 'bad' | 'warn' | 'info' | 'neutral'; label: string }) {
  return <span className={`pill pill-${tone}`}>{label}</span>;
}
