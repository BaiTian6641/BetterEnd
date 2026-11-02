import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import test from 'node:test';

const execute = promisify(execFile);
const moduleUrl = new URL('../tools/build-probe.mjs', import.meta.url).href;

test('pack archives have identical bytes in western, UTC and eastern build timezones', async () => {
  const script = `import {packZip} from ${JSON.stringify(moduleUrl)}; import {createHash} from 'node:crypto'; const bytes=packZip(new Map([['manifest.json',Buffer.from('{"format_version":2}')]])); console.log(createHash('sha256').update(bytes).digest('hex'));`;
  const hashes = [];
  for (const zone of ['America/Los_Angeles', 'UTC', 'Asia/Shanghai']) {
    const { stdout } = await execute(process.execPath, ['--input-type=module', '-e', script], { env: { ...process.env, TZ: zone } });
    hashes.push(stdout.trim());
  }
  assert.equal(new Set(hashes).size, 1);
});
