import type { RepoSourceAdapter } from '../types';
import { gitRepoAdapter } from './git';
import { npmRepoAdapter } from './npm';
import { pipRepoAdapter } from './pip';

export function builtinRepoAdapters(): RepoSourceAdapter[] {
  return [npmRepoAdapter, pipRepoAdapter, gitRepoAdapter];
}

export { gitRepoAdapter, npmRepoAdapter, pipRepoAdapter };
