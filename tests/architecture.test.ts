import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return filesUnder(full);
    return full.endsWith('.ts') || full.endsWith('.tsx') || full.endsWith('.css') ? [full] : [];
  });
}

describe('ui boundary', () => {
  it('keeps the renderer off the core and adapters', () => {
    const sources = filesUnder('src/renderer').filter((file) => file.endsWith('.ts') || file.endsWith('.tsx'));
    expect(sources.length).toBeGreaterThan(0);
    for (const file of sources) {
      const text = readFileSync(file, 'utf8');
      expect(text, file).not.toMatch(/from ['"][^'"]*\/core\//);
      expect(text, file).not.toMatch(/from ['"][^'"]*\/adapters\//);
      expect(text, file).not.toMatch(/from ['"]node:/);
      expect(text, file).not.toMatch(/from ['"]electron['"]/);
    }
  });

  it('keeps colors in the theme token file', () => {
    const css = readFileSync('src/renderer/src/styles/app.css', 'utf8');
    const tokens = readFileSync('src/renderer/src/theme/tokens.css', 'utf8');
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}/);
    expect(tokens).toMatch(/--color-bg/);
    expect(tokens).toMatch(/--font-sans/);
  });

  it('mentions the builder only in About', () => {
    const sources = filesUnder('src').filter((file) => file.endsWith('.ts') || file.endsWith('.tsx'));
    const hits = sources.filter((file) => readFileSync(file, 'utf8').includes('Lotusmirk'));
    expect(hits.map((file) => path.relative('src', file))).toEqual(['renderer/src/screens/SettingsScreen.tsx']);
  });
});
