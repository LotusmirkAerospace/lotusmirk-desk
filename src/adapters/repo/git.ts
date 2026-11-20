import { rm } from 'node:fs/promises';
import { DeskError } from '../../core/errors';
import type { RepoSourceAdapter } from '../types';

const NOT_READY = 'Git installs are not in this version. Add the package with npm or pip, or clone it yourself and point a process check at it.';

export const gitRepoAdapter: RepoSourceAdapter = {
  id: 'git',
  label: 'Git repository',
  description: 'Planned: clone a repository into a sandbox and run a smoke command from the project. Not available yet.',
  implemented: false,
  locatorLabel: 'Repository URL',
  versionLabel: 'Commit or tag',
  async install() {
    throw new DeskError(NOT_READY, 'not_implemented');
  },
  async smoke() {
    throw new DeskError(NOT_READY, 'not_implemented');
  },
  async uninstall(sandboxDir) {
    await rm(sandboxDir, { recursive: true, force: true });
  },
};
