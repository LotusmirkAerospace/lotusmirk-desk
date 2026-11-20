import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { hubKind, type HubKind } from './branding';
import type { ConnectionRecord, PersistedSettings } from './records';

export interface AssistantInstructions {
  schema: 'desk.instructions.v1';
  appName: string;
  markdownHub: { kind: HubKind; location: string; available: boolean };
  connectors: Array<{
    name: string;
    adapterId: string;
    enabled: boolean;
    config: Record<string, string>;
  }>;
  guidance: string[];
}

export function instructionsDir(dataDir: string): string {
  return path.join(dataDir, 'ai');
}

export function buildInstructions(settings: PersistedSettings, connections: ConnectionRecord[]): AssistantInstructions {
  const kind = hubKind(settings.markdownHub);
  const available = kind === 'local-path' && existsSync(settings.markdownHub) && statSync(settings.markdownHub).isDirectory();
  return {
    schema: 'desk.instructions.v1',
    appName: settings.appName,
    markdownHub: { kind, location: settings.markdownHub, available },
    connectors: connections.map((connection) => ({
      name: connection.name,
      adapterId: connection.adapterId,
      enabled: connection.enabled,
      config: connection.config,
    })),
    guidance: guidanceFor(settings.appName, kind, available),
  };
}

function guidanceFor(appName: string, kind: HubKind, available: boolean): string[] {
  const lines = [
    `${appName} is the local app that keeps this computer's AI connectors healthy.`,
    'Use the shared markdown location below for notes every assistant should see.',
    'Connector credentials stay in the OS keychain. Do not copy them into chat or into markdown.',
    'If a connector is missing or down, ask the person to add or reconnect it in the app.',
  ];
  if (kind === 'unset') lines.push('No shared markdown location has been set yet.');
  if (kind === 'google-drive') lines.push('The markdown lives in a Google Drive folder. Read it from that link.');
  if (kind === 'remote-link') lines.push('The markdown lives at the remote link below.');
  if (kind === 'local-path' && available) lines.push('The markdown is a folder on this computer. Read the files there.');
  if (kind === 'local-path' && !available) lines.push('A local markdown path is set, but that folder is not on this computer yet.');
  return lines;
}

export function renderInstructionsMarkdown(instructions: AssistantInstructions): string {
  const hub = instructions.markdownHub;
  const hubLine =
    hub.kind === 'unset'
      ? 'Not set.'
      : `${hub.location}${hub.kind === 'local-path' && !hub.available ? ' (folder not found)' : ''}`;
  const connectors = instructions.connectors.length
    ? instructions.connectors
        .map((connector) => {
          const config = Object.entries(connector.config)
            .filter(([, value]) => value)
            .map(([key, value]) => `${key}=${value}`)
            .join(', ');
          return `- ${connector.name} (${connector.adapterId}${connector.enabled ? '' : ', paused'})${config ? `: ${config}` : ''}`;
        })
        .join('\n')
    : '- None yet.';
  return `# ${instructions.appName} instructions for AI assistants

${instructions.guidance.map((line) => line).join('\n\n')}

## Shared markdown

Kind: ${hub.kind}
Location: ${hubLine}

## Connectors

${connectors}
`;
}

export function writeAssistantInstructions(
  dataDir: string,
  settings: PersistedSettings,
  connections: ConnectionRecord[],
): void {
  const instructions = buildInstructions(settings, connections);
  const dir = instructionsDir(dataDir);
  mkdirSync(dir, { recursive: true });
  const markdown = renderInstructionsMarkdown(instructions);
  writeFileSync(path.join(dir, 'DESK.md'), markdown);
  writeFileSync(path.join(dir, 'desk.json'), JSON.stringify(instructions, null, 2));
  if (instructions.markdownHub.kind === 'local-path' && instructions.markdownHub.available) {
    try {
      writeFileSync(path.join(settings.markdownHub, 'DESK.md'), markdown);
    } catch {
      // The shared folder can be read-only. The copy in the app data folder still stands.
    }
  }
}
