import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { SOURCE_COMMIT } from './source-files.mjs';

const execute = promisify(execFile);

export async function materializePinnedSource(repoRoot, bedrockRoot, commit = SOURCE_COMMIT) {
  if (typeof commit !== 'string' || !/^[a-f0-9]{40}$/u.test(commit)) throw new Error('A full immutable source commit is required');
  const scratchRoot = path.join(bedrockRoot, '.work', 'source-snapshots');
  await mkdir(scratchRoot, { recursive: true });
  const temporary = await mkdtemp(path.join(scratchRoot, 'snapshot-'));
  const root = path.join(temporary, 'source');
  const archive = path.join(temporary, 'source.tar');
  await mkdir(root);
  try {
    await execute('git', ['-c', 'core.autocrlf=false', '-c', 'core.eol=lf', '-C', repoRoot, 'archive', '--format=tar', `--output=${archive}`, commit], { maxBuffer: 1024 * 1024 });
    await execute('tar', ['-xf', archive, '-C', root], { maxBuffer: 1024 * 1024 });
  } catch (error) {
    await rm(temporary, { recursive: true, force: true });
    throw new Error(`Cannot materialize pinned source ${commit}: ${error.message}`, { cause: error });
  }
  return { root, commit, dispose: () => rm(temporary, { recursive: true, force: true }) };
}
