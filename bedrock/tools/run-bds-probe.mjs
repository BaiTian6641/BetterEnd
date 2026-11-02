import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { constants, createWriteStream } from 'node:fs';
import { copyFile, cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { StringDecoder } from 'node:string_decoder';
import { fileURLToPath } from 'node:url';
import { buildProbe } from './build-probe.mjs';
import { readAttempts, recordAttempt, summarizeAttempts } from './evidence.mjs';
import { hashFile, inside, stableJson } from './source-files.mjs';
import { assertCapabilityObservation } from '../probes/capabilities/verify.mjs';
import { assertInventoryObservation } from '../probes/inventory/verify.mjs';

const bedrockRoot = fileURLToPath(new URL('../', import.meta.url));

function argumentsFor(args) {
  const options = Object.create(null);
  for (let index = 0; index < args.length; index += 2) {
    if (!['--engine', '--build', '--request'].includes(args[index]) || !args[index + 1]) throw new Error('Usage: --engine .work/engines/<directory> --build <exact-version> --request <JSON-relative-path>');
    if (options[args[index]]) throw new Error(`Duplicate option ${args[index]}`);
    options[args[index]] = args[index + 1];
  }
  if (!options['--engine']?.startsWith('.work/engines/') || !/^1\.\d+\.\d+\.\d+$/u.test(options['--build'] ?? '') || !options['--request']) throw new Error('An owned engine, exact build and request file are required');
  return options;
}

export function assertObservation(request, result) {
  if (request.action.startsWith('cap-')) return assertCapabilityObservation(request, result);
  if (request.action.startsWith('inventory-')) return assertInventoryObservation(request, result);
  const id = 'betterend_probe:flavolite';
  if (result.players !== 0 || result.item?.typeId !== 'betterend_probe:thallasium_ingot' || result.item.amount !== 1) throw new Error('Incorrect headless/item readback');
  if (result.action !== request.action || result.dimension !== `minecraft:${request.dimension ?? 'the_end'}` || !Array.isArray(result.records)) throw new Error('Probe response does not match its requested scenario');
  if (request.action === 'scan') {
    const width = request.width ?? 4;
    if (result.records.length !== width * width) throw new Error('Native generation scan is incomplete');
    const excluded = location => (request.dimension ?? 'the_end') !== 'the_end' || (Math.abs(location.x) <= 1024 && Math.abs(location.z) <= 1024);
    const native = [];
    for (const record of result.records) {
      if (!Array.isArray(record.featureMatches)) throw new Error('Missing column generation evidence');
      if (excluded(record.location) && record.featureMatches.length) throw new Error('Native feature appeared in an excluded region/dimension');
      for (const feature of record.featureMatches) {
        if (feature.typeId !== id || feature.states['betterend_probe:finish'] !== 'rough') throw new Error('Native feature has the wrong block or permutation');
        native.push(feature);
      }
    }
    if (result.records.some(record => !excluded(record.location)) && native.length === 0) throw new Error('No native feature observed; this coordinate sample cannot pass the generation probe');
    return;
  }
  if (request.action === 'place') {
    const record = result.records[0];
    if (record.before.typeId !== 'minecraft:end_stone' || !record.featurePlaced || record.after.typeId !== id || record.after.states['betterend_probe:finish'] !== 'rough') throw new Error('Native feature placement did not produce the expected block and permutation');
    return;
  }
  if (request.action === 'board') {
    const finishes = result.records.map(record => record.after.states['betterend_probe:finish']);
    if (JSON.stringify(finishes) !== JSON.stringify(['rough', 'metal', 'emissive']) || result.records.some(record => record.after.typeId !== id)) throw new Error('Material-board permutations disagree');
    return;
  }
  if (request.action === 'inspect' && typeof request.expectTypeId === 'string') {
    if (result.records[0].after.typeId !== request.expectTypeId) throw new Error('Persisted block type differs from the requested assertion');
    for (const [name, value] of Object.entries(request.expectStates ?? {})) {
      if (result.records[0].after.states[name] !== value) throw new Error(`Persisted block state differs: ${name}`);
    }
    return;
  }
  throw new Error('Inspection requires an explicit expected block type');
}

async function configure(root, marker, identity) {
  const propertiesPath = path.join(root, 'server.properties');
  let properties = await readFile(propertiesPath, 'utf8');
  const settings = {
    'server-name': 'BetterEnd disposable capability probe', 'gamemode': 'creative', 'allow-cheats': 'true',
    'allow-list': 'true', 'online-mode': 'true', 'enable-lan-visibility': 'false',
    'server-port': '29140', 'server-portv6': '29141', 'level-name': marker.worldName, 'level-seed': '2640',
    'texturepack-required': 'true', 'content-log-file-enabled': 'false', 'content-log-console-output-enabled': 'true',
  };
  if (/^server-ip=|^# server-ip=/mu.test(properties)) settings['server-ip'] = '127.0.0.1';
  if (/^server-udp-ports=/mu.test(properties)) settings['server-udp-ports'] = '29140';
  for (const [key, value] of Object.entries(settings)) {
    const pattern = new RegExp(`^(?:# )?${key}=.*$`, 'mu');
    properties = pattern.test(properties) ? properties.replace(pattern, `${key}=${value}`) : `${properties}\n${key}=${value}\n`;
  }
  await writeFile(propertiesPath, properties);
  await writeFile(path.join(root, 'allowlist.json'), '[]\n');
  const worldRoot = inside(root, `worlds/${marker.worldName}`);
  await mkdir(worldRoot, { recursive: true });
  await writeFile(path.join(worldRoot, 'world_behavior_packs.json'), stableJson([{ pack_id: identity.behaviorHeader, version: identity.version }]));
  await writeFile(path.join(worldRoot, 'world_resource_packs.json'), stableJson([{ pack_id: identity.resourceHeader, version: identity.version }]));
}

async function retainBuild(outputRoot, manifest) {
  const retained = [];
  await mkdir(path.join(bedrockRoot, 'evidence/packs'), { recursive: true });
  for (const [name, extension] of [['BetterEnd-Probes.mcaddon', 'mcaddon'], ['build-manifest.json', 'manifest.json']]) {
    const relative = `evidence/packs/${manifest.archive.sha256}.${extension}`;
    const source = path.join(outputRoot, name);
    const destination = inside(bedrockRoot, relative);
    try {
      await copyFile(source, destination, constants.COPYFILE_EXCL);
    } catch (error) {
      if (error.code !== 'EEXIST' || await hashFile(source) !== await hashFile(destination)) throw new Error(`Cannot retain unchanged diagnostic artifact: ${relative}`, { cause: error });
    }
    retained.push(relative);
  }
  return retained;
}

async function main(args) {
  const options = argumentsFor(args);
  const engineRoot = inside(bedrockRoot, options['--engine']);
  const expectedBuild = options['--build'];
  const marker = JSON.parse(await readFile(path.join(engineRoot, '.betterend-disposable.json'), 'utf8'));
  if (marker.existingPlayerWorld !== false || marker.expectedBuild !== expectedBuild || typeof marker.worldName !== 'string') throw new Error('Engine ownership marker does not authorize this disposable run');
  const request = JSON.parse(await readFile(inside(bedrockRoot, options['--request']), 'utf8'));
  request.requestId = randomUUID();
  const gateId = request.action.startsWith('cap-') ? request.gateId : request.action.startsWith('inventory-') ? 'INV-001' : 'ENG-001';
  const prior = summarizeAttempts(await readAttempts(bedrockRoot), gateId);
  if (prior.requiresUserDecision) throw new Error(`${gateId} requires user intervention before another runtime probe`);
  const { outputRoot, manifest } = await buildProbe();
  const retainedPacks = await retainBuild(outputRoot, manifest);
  for (const [sourceName, destinationName] of [['behavior_pack', 'behavior_packs/betterend_probe'], ['resource_pack', 'resource_packs/betterend_probe']]) {
    const destination = inside(engineRoot, destinationName);
    await rm(destination, { recursive: true, force: true });
    await cp(path.join(outputRoot, sourceName), destination, { recursive: true });
  }
  await configure(engineRoot, marker, manifest.identity);
  const executable = path.join(engineRoot, process.platform === 'win32' ? 'bedrock_server.exe' : 'bedrock_server');
  const executableSha256 = await hashFile(executable);
  const runId = `${new Date().toISOString().replaceAll(':', '-')}-${request.requestId.slice(0, 8)}`;
  const logRelative = `evidence/engine/${runId}.log`;
  const resultRelative = `evidence/engine/${runId}.json`;
  await mkdir(path.join(bedrockRoot, 'evidence/engine'), { recursive: true });
  const log = createWriteStream(inside(bedrockRoot, logRelative), { flags: 'wx' });
  const child = spawn(executable, [], { cwd: engineRoot, stdio: ['pipe', 'pipe', 'pipe'] });
  let version = null;
  let worldLoaded = false;
  let sent = false;
  let result = null;
  let failure = null;
  let stopping = false;
  let forcedTermination = false;
  let killTimer;
  const events = [];
  function stop() {
    if (stopping) return;
    stopping = true;
    child.stdin.write('stop\r\n');
    killTimer = setTimeout(() => { forcedTermination = true; child.kill(); }, 10000);
  }
  function reject(message) {
    failure ??= String(message);
    stop();
  }
  function dispatch() {
    if (!sent && version && worldLoaded && !failure) {
      sent = true;
      child.stdin.write(`scriptevent betterend_probe:run ${JSON.stringify(request)}\r\n`);
    }
  }
  function line(text) {
    const versionMatch = /Version:\s*(\d+\.\d+\.\d+\.\d+)/u.exec(text);
    if (versionMatch) {
      version = versionMatch[1];
      if (version !== expectedBuild) reject(`Expected engine ${expectedBuild}, observed ${version}`);
    }
    const prefix = text.indexOf('BETTEREND_PROBE ');
    if (prefix >= 0) {
      let event;
      try { event = JSON.parse(text.slice(prefix + 'BETTEREND_PROBE '.length).trim()); }
      catch (error) { reject(`Invalid structured probe output: ${error.message}`); return; }
      events.push(event);
      if (event.phase === 'worldLoad') {
        worldLoaded = true;
        if (!event.blockRegistered || !event.itemRegistered || event.players !== 0) reject('Custom definitions did not register in the empty server');
      }
      if (event.phase === 'error' || event.phase === 'rejected') reject(JSON.stringify(event));
      if (event.phase === 'result' && event.requestId === request.requestId) {
        result = event;
        try { assertObservation(request, result); } catch (error) { failure ??= error.message; }
        stop();
      }
    } else if (/\bERROR\b|\[error\]/iu.test(text)) reject(`Engine/content error: ${text}`);
    dispatch();
  }
  for (const stream of [child.stdout, child.stderr]) {
    const decoder = new StringDecoder('utf8');
    let pending = '';
    stream.on('data', bytes => {
      log.write(bytes);
      pending += decoder.write(bytes);
      let end;
      while ((end = pending.indexOf('\n')) >= 0) {
        line(pending.slice(0, end).replace(/\r$/u, ''));
        pending = pending.slice(end + 1);
      }
    });
    stream.on('end', () => { pending += decoder.end(); if (pending) line(pending); });
  }
  child.stdin.on('error', error => { failure ??= `Server stdin failed: ${error.message}`; });
  child.on('error', error => { failure ??= error.message; });
  log.on('error', error => { failure ??= `Cannot retain engine log: ${error.message}`; stop(); });
  const timeout = setTimeout(() => reject('Timed out before a complete native probe result'), 90000);
  const exit = await new Promise(resolve => child.once('close', (code, signal) => resolve({ code, signal })));
  clearTimeout(timeout);
  clearTimeout(killTimer);
  await new Promise(resolve => log.end(resolve));
  if (!result) failure ??= 'Server exited without a structured result';
  if (exit.code !== 0 || forcedTermination) failure ??= 'Server did not stop cleanly';
  const receipt = { schemaVersion: 1, scope: 'supporting-server-side-evidence-not-full-capability-certification', expectedBuild, observedBuild: version, executableSha256, packageSha256: manifest.archive.sha256, request, events, exit, forcedTermination, failure, clientRenderingVerified: false, certifiesAllPlatforms: false };
  await writeFile(inside(bedrockRoot, resultRelative), stableJson(receipt));
  await recordAttempt(bedrockRoot, {
    gateId, result: failure ? 'fail' : 'pass', method: 'automated', profile: `bds-${expectedBuild}-stable-probe`,
    scenario: `${request.action} server-side capability probe; not client UI/rendering or full-gate certification`,
    observed: failure ?? 'Expected native state readback and clean BDS stop observed',
    command: ['node', 'bedrock/tools/run-bds-probe.mjs', ...args], exitCode: failure ? 1 : 0,
    artifacts: [logRelative, resultRelative, ...retainedPacks],
  });
  console.log(JSON.stringify({ result: failure ? 'fail' : 'pass', receipt: resultRelative, observedBuild: version, failure, clientRenderingVerified: false }, null, 2));
  if (failure) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(error => { console.error(error.stack ?? String(error)); process.exitCode = 1; });
}
