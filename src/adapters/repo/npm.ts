import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { DeskError } from '../../core/errors';
import { tail } from '../../core/validate';
import type { AdapterContext, RepoSmokeResult, RepoSourceAdapter } from '../types';

const NPM_NAME = /^(?:@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/i;

function npmCommand(): string {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

function packageJsonPath(sandboxDir: string, locator: string): string {
  return path.join(sandboxDir, 'node_modules', ...locator.split('/'), 'package.json');
}

async function readInstalledVersion(sandboxDir: string, locator: string): Promise<string | undefined> {
  try {
    const raw = await readFile(packageJsonPath(sandboxDir, locator), 'utf8');
    const parsed = JSON.parse(raw) as { version?: unknown };
    return typeof parsed.version === 'string' ? parsed.version : undefined;
  } catch {
    return undefined;
  }
}

const CJS_SMOKE = `const name = process.argv[2];
try {
  const loaded = require(name);
  if (loaded === undefined) {
    console.error('Module loaded but exported undefined');
    process.exit(1);
  }
  console.log('loaded ' + name);
} catch (error) {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
}
`;

const ESM_SMOKE = `const name = process.argv[2];
try {
  const loaded = await import(name);
  if (!loaded) {
    console.error('Module loaded empty');
    process.exit(1);
  }
  console.log('loaded ' + name);
} catch (error) {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
}
`;

async function runNode(
  ctx: AdapterContext,
  sandboxDir: string,
  scriptName: string,
  script: string,
  locator: string,
): Promise<RepoSmokeResult> {
  const scriptPath = path.join(sandboxDir, scriptName);
  await writeFile(scriptPath, script);
  const result = await ctx.runner.run(process.execPath, [scriptPath, locator], {
    cwd: sandboxDir,
    timeoutMs: 30_000,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      NODE_PATH: path.join(sandboxDir, 'node_modules'),
    },
  });
  const log = `${result.stdout}\n${result.stderr}`.trim().slice(0, 4000);
  if (result.timedOut) {
    return { ok: false, message: 'Smoke test timed out.', log };
  }
  if (result.code === 0) {
    return { ok: true, message: `Loaded ${locator} in the sandbox.`, log };
  }
  return {
    ok: false,
    message: `Smoke test failed. ${tail(result.stderr || result.stdout || 'The module did not load.')}`,
    log,
  };
}

export const npmRepoAdapter: RepoSourceAdapter = {
  id: 'npm',
  label: 'npm package',
  description: 'Install an npm package into its own sandbox with scripts disabled, then load it with Node.',
  implemented: true,
  locatorLabel: 'Package name',
  versionLabel: 'Version',
  versionHelp: 'Leave blank for the current latest version.',
  validate(locator) {
    if (!NPM_NAME.test(locator) || locator.startsWith('-')) {
      throw new DeskError('Enter an npm package name, such as is-odd or @scope/name.', 'bad_locator');
    }
  },
  async install(request, ctx) {
    this.validate?.(request.locator);
    const spec = request.version ? `${request.locator}@${request.version}` : request.locator;
    await mkdir(request.sandboxDir, { recursive: true });
    await writeFile(
      path.join(request.sandboxDir, 'package.json'),
      JSON.stringify({ name: 'desk-sandbox', private: true, version: '0.0.0' }, null, 2),
    );
    const result = await ctx.runner.run(
      npmCommand(),
      ['install', spec, '--ignore-scripts', '--no-audit', '--no-fund', '--prefix', request.sandboxDir],
      {
        cwd: request.sandboxDir,
        timeoutMs: 120_000,
        shell: process.platform === 'win32',
      },
    );
    if (result.timedOut) throw new DeskError(`npm install timed out for ${spec}.`, 'install_timeout');
    if (result.code !== 0) {
      throw new DeskError(
        `npm install failed for ${spec}. ${tail(result.stderr || result.stdout || 'npm exited with an error.')}`,
        'install_failed',
      );
    }
    const resolvedVersion = (await readInstalledVersion(request.sandboxDir, request.locator)) ?? request.version ?? 'latest';
    return {
      resolvedVersion,
      detail: `Installed ${request.locator}@${resolvedVersion}`,
    };
  },
  async smoke(request, ctx) {
    const commonJs = await runNode(ctx, request.sandboxDir, 'desk-smoke.cjs', CJS_SMOKE, request.locator);
    if (commonJs.ok) return commonJs;
    if (!/ERR_REQUIRE_ESM|ERR_REQUIRE_ASYNC_MODULE|Cannot use import statement/.test(commonJs.log)) {
      return commonJs;
    }
    return runNode(ctx, request.sandboxDir, 'desk-smoke.mjs', ESM_SMOKE, request.locator);
  },
  async uninstall(sandboxDir) {
    await rm(sandboxDir, { recursive: true, force: true });
  },
};
