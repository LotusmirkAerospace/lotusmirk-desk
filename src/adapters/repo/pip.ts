import { mkdir, rm } from 'node:fs/promises';
import { DeskError } from '../../core/errors';
import type { RunResult } from '../../core/runner';
import { tail } from '../../core/validate';
import type { AdapterContext, RepoSourceAdapter } from '../types';

const PIP_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,120}(?::[A-Za-z0-9._]+)?$/;

export function splitPipLocator(locator: string): { distribution: string; moduleName: string } {
  const [distribution, moduleName] = locator.split(':');
  if (!distribution || locator.split(':').length > 2) {
    throw new DeskError('Enter a pip package name, such as six or python-dateutil:dateutil.', 'bad_locator');
  }
  return {
    distribution,
    moduleName: moduleName || distribution.replaceAll('-', '_'),
  };
}

function pythonCommand(): string {
  return process.platform === 'win32' ? 'python' : 'python3';
}

async function pipInstall(ctx: AdapterContext, sandboxDir: string, spec: string, extra: string[]): Promise<RunResult> {
  return ctx.runner.run(
    pythonCommand(),
    [
      '-m',
      'pip',
      'install',
      '--disable-pip-version-check',
      '--no-warn-script-location',
      '--no-input',
      '--target',
      sandboxDir,
      ...extra,
      spec,
    ],
    { cwd: sandboxDir, timeoutMs: 120_000 },
  );
}

export const pipRepoAdapter: RepoSourceAdapter = {
  id: 'pip',
  label: 'pip package',
  description: 'Install a Python package into its own directory with pip --target, then import it.',
  implemented: true,
  locatorLabel: 'Package name',
  versionLabel: 'Version',
  versionHelp: 'If the import name differs, use package:module, for example python-dateutil:dateutil.',
  validate(locator) {
    if (!PIP_NAME.test(locator)) {
      throw new DeskError('Enter a pip package name, such as six or python-dateutil:dateutil.', 'bad_locator');
    }
    splitPipLocator(locator);
  },
  async install(request, ctx) {
    this.validate?.(request.locator);
    const { distribution } = splitPipLocator(request.locator);
    const spec = request.version ? `${distribution}==${request.version}` : distribution;
    await mkdir(request.sandboxDir, { recursive: true });
    let result = await pipInstall(ctx, request.sandboxDir, spec, []);
    if (
      result.code !== 0 &&
      /externally-managed-environment/.test(`${result.stderr}\n${result.stdout}`)
    ) {
      result = await pipInstall(ctx, request.sandboxDir, spec, ['--break-system-packages']);
    }
    if (result.timedOut) throw new DeskError(`pip install timed out for ${spec}.`, 'install_timeout');
    if (result.code !== 0) {
      throw new DeskError(
        `pip install failed for ${spec}. ${tail(result.stderr || result.stdout || 'pip exited with an error.')}`,
        'install_failed',
      );
    }
    return {
      resolvedVersion: request.version ?? 'latest',
      detail: `Installed ${spec} with pip --target`,
    };
  },
  async smoke(request, ctx) {
    const { moduleName } = splitPipLocator(request.locator);
    const code = [
      'import importlib, sys',
      'sys.path.insert(0, sys.argv[1])',
      'module = importlib.import_module(sys.argv[2])',
      'print("loaded", module.__name__)',
    ].join('\n');
    const result = await ctx.runner.run(pythonCommand(), ['-c', code, request.sandboxDir, moduleName], {
      cwd: request.sandboxDir,
      timeoutMs: 30_000,
      env: { ...process.env, PYTHONPATH: request.sandboxDir },
    });
    const log = `${result.stdout}\n${result.stderr}`.trim().slice(0, 4000);
    if (result.timedOut) return { ok: false, message: 'Smoke test timed out.', log };
    if (result.code === 0) return { ok: true, message: `Imported ${moduleName} from the sandbox.`, log };
    return {
      ok: false,
      message: `Smoke test failed. ${tail(result.stderr || result.stdout || 'The module did not import.')}`,
      log,
    };
  },
  async uninstall(sandboxDir) {
    await rm(sandboxDir, { recursive: true, force: true });
  },
};
