import { type ChildProcess, execFile, spawn } from 'node:child_process';

export interface RunOptions {
  cwd?: string;
  timeoutMs?: number;
  env?: NodeJS.ProcessEnv;
  shell?: boolean;
}

export interface RunResult {
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

export interface ProcessRunner {
  run(command: string, args: string[], options?: RunOptions): Promise<RunResult>;
  spawnDetached(command: string, args: string[], options?: { cwd?: string }): Promise<void>;
}

export function createProcessRunner(): ProcessRunner {
  return {
    run(command, args, options = {}) {
      return new Promise((resolve) => {
        execFile(
          command,
          args,
          {
            cwd: options.cwd,
            env: options.env,
            timeout: options.timeoutMs ?? 120_000,
            maxBuffer: 512 * 1024,
            encoding: 'utf8',
            windowsHide: true,
            shell: options.shell ?? false,
            killSignal: 'SIGKILL',
          },
          (error, stdout, stderr) => {
            const err = error as NodeJS.ErrnoException & { killed?: boolean } | null;
            const timedOut = Boolean(err?.killed);
            let code: number | null = 0;
            if (err) {
              if (timedOut) code = null;
              else if (typeof err.code === 'number') code = err.code;
              else if (err.code === 'ENOENT') code = 127;
              else code = 1;
            }
            resolve({
              code,
              stdout: stdout ?? '',
              stderr: stderr ?? '',
              timedOut,
            });
          },
        );
      });
    },
    spawnDetached(command, args, options) {
      return new Promise((resolve, reject) => {
        const child: ChildProcess = spawn(command, args, {
          cwd: options?.cwd,
          detached: true,
          stdio: 'ignore',
          windowsHide: true,
        });
        child.once('error', reject);
        child.once('spawn', () => {
          child.unref();
          resolve();
        });
      });
    },
  };
}
