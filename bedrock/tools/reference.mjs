import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { appendFile, copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { recordAttempt, readAttempts, summarizeAttempts } from './evidence.mjs';
import { hashFile, stableJson } from './source-files.mjs';
import { assertOwnedPath, assertRuntimeSource, buildAttestation, verifyBuildForExport, verifyPinnedInputs } from './reference-inputs.mjs';

const workspace = fileURLToPath(new URL('../', import.meta.url));
const reference = path.join(workspace, '.work/java-reference');

async function executeRecorded(command, args, cwd, env, logPath) {
  const log = createWriteStream(logPath, { flags: 'a' });
  const child = spawn(command, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let failure = null;
  child.stdout.on('data', bytes => { log.write(bytes); process.stdout.write(bytes); });
  child.stderr.on('data', bytes => { log.write(bytes); process.stderr.write(bytes); });
  child.on('error', error => { failure = error.message; });
  log.on('error', error => { failure = error.message; child.kill(); });
  const timer = setTimeout(() => { failure = 'Reference operation exceeded its execution deadline'; child.kill(); }, 600000);
  const exit = await new Promise(resolve => child.once('close', (code, signal) => resolve({ code, signal })));
  clearTimeout(timer);
  await new Promise(resolve => log.end(resolve));
  return { ...exit, failure };
}

async function main(args) {
  const mode = args[0];
  if (args.length !== 1 || !['build', 'export'].includes(mode)) throw new Error('Usage: node tools/reference.mjs build|export');
  const lock = JSON.parse(await readFile(path.join(workspace, 'upstream/java-dependencies.lock.json'), 'utf8'));
  const javaHome = path.join(reference, 'jdk', `jdk-${lock.java.version}`);
  const java = path.join(javaHome, 'bin', process.platform === 'win32' ? 'java.exe' : 'java');
  const env = {
    ...process.env, JAVA_HOME: javaHome, GRADLE_USER_HOME: path.join(reference, 'gradle-user-home'),
    TEMP: path.join(reference, 'tmp'), TMP: path.join(reference, 'tmp'),
    JAVA_TOOL_OPTIONS: `-Duser.home="${path.join(reference, 'home').replaceAll('\\', '/')}" -Djava.io.tmpdir="${path.join(reference, 'tmp').replaceAll('\\', '/')}"`,
  };
  const gateId = mode === 'build' ? 'JAVA-001' : 'JAVA-002';
  const attempts = await readAttempts(workspace);
  if (summarizeAttempts(attempts, gateId).requiresUserDecision) throw new Error(`${gateId} requires user intervention`);
  const runId = `${new Date().toISOString().replaceAll(':', '-')}-${randomUUID().slice(0, 8)}`;
  const logRelative = `evidence/java/${mode}-${runId}.log`;
  const receiptRelative = `evidence/java/${mode}-${runId}.json`;
  const logPath = path.join(workspace, logRelative);
  await mkdir(path.dirname(logPath), { recursive: true });
  await writeFile(logPath, '', { flag: 'wx' });
  let commandArgs = [];
  let cwd = null;
  let outputFile = null;
  let exit = null;
  let failure = null;
  let runtime = null;
  let retainedOutput = null;
  let manifest = null;
  let manifestRelative = null;
  try {
    await assertOwnedPath(workspace, java);
    if (mode === 'build') {
      cwd = path.join(reference, 'source');
      const inputs = await verifyPinnedInputs(workspace, cwd, lock.sourceCommit);
      commandArgs = [
        '-Xmx128m', '-classpath', 'gradle/wrapper/gradle-wrapper.jar', 'org.gradle.wrapper.GradleWrapperMain',
        '--offline', '--no-daemon', '--gradle-user-home', path.join(reference, 'gradle-user-home'),
        '--project-cache-dir', path.join(reference, 'project-cache'), '--init-script', path.join(workspace, 'tools/java-reference.init.gradle'),
        `-PbedrockWorkspace=${workspace}`, `-PwunderVaultDir=${path.join(reference, 'empty-vault')}`,
        ':jar', ':bedrockReferenceExporterJar', ':bedrockReferenceClasspath',
      ];
      exit = await executeRecorded(java, commandArgs, cwd, env, logPath);
      if (exit.failure || exit.code !== 0) throw new Error(exit.failure ?? `Build exited ${exit.code} (${exit.signal ?? 'no signal'})`);
      manifest = await buildAttestation(workspace, inputs, lock.sourceCommit);
      manifestRelative = `evidence/java/build-${runId}.inputs.json`;
      await writeFile(path.join(workspace, manifestRelative), stableJson(manifest), { flag: 'wx' });
    } else {
      manifest = await verifyBuildForExport(workspace, attempts, lock.sourceCommit);
      cwd = await assertOwnedPath(workspace, path.join(reference, 'server'));
      const marker = JSON.parse(await readFile(path.join(cwd, '.betterend-disposable.json'), 'utf8'));
      if (marker.kind !== 'betterend-java-reference' || marker.existingPlayerWorld !== false || marker.worldName !== 'betterend-reference' || marker.sourceCommit !== lock.sourceCommit) throw new Error('Java server is not the owned reference fixture');
      for (const file of ['whitelist.json', 'ops.json']) {
        const entries = JSON.parse(await readFile(await assertOwnedPath(workspace, path.join(cwd, file)), 'utf8'));
        if (!Array.isArray(entries) || entries.length !== 0) throw new Error('Reference whitelist and operator list must remain empty');
      }
      for (const file of ['server.properties', 'eula.txt']) await assertOwnedPath(workspace, path.join(cwd, file));
      const guard = await executeRecorded(java, [path.join(workspace, 'java-exporter/src/main/java/dev/baitian/betterend/reference/ServerPropertiesGuard.java'), cwd], cwd, env, logPath);
      if (guard.failure || guard.code !== 0) throw new Error('Java rejected the effective reference server properties or EULA state');
      for (const artifact of [manifest.artifacts.betterEnd, manifest.artifacts.exporter]) {
        const destination = await assertOwnedPath(workspace, path.join(cwd, 'mods', path.basename(artifact.path)));
        await copyFile(path.join(workspace, artifact.path), destination);
      }
      outputFile = path.join(reference, 'exports', `runtime-${runId}.json`);
      commandArgs = ['-Xms512m', '-Xmx4g', `-Dbetterend.reference.workspace=${workspace}`, `-Dbetterend.reference.output=${outputFile}`, '-jar', 'fabric-server-launch.jar', 'nogui'];
      exit = await executeRecorded(java, commandArgs, cwd, env, logPath);
      if (exit.failure || exit.code !== 0) throw new Error(exit.failure ?? `Server exited ${exit.code} (${exit.signal ?? 'no signal'})`);
      const bytes = await readFile(outputFile);
      runtime = JSON.parse(bytes);
      retainedOutput = `evidence/java/runtime-${runId}.json.gz`;
      await writeFile(path.join(workspace, retainedOutput), gzipSync(bytes, { level: 9 }), { flag: 'wx' });
      if (!runtime.complete || runtime.issues.length || !runtime.environment.productionProfile || runtime.environment.minecraftVersion !== '26.3') throw new Error('Runtime export is incomplete or not the required production/version profile');
      if (runtime.environment.players !== 0) throw new Error('Reference server contains players');
      assertRuntimeSource(runtime, manifest, lock);
      const logText = await readFile(logPath, 'utf8');
      const markers = [...logText.matchAll(/BETTEREND_REFERENCE_EXPORT (\{[^\r\n]+\})/gu)];
      const markerResult = markers.length === 1 ? JSON.parse(markers[0][1]) : null;
      if (!markerResult || markerResult.status !== 'complete' || markerResult.sha256 !== await hashFile(outputFile)) throw new Error('Missing or inconsistent explicit exporter receipt');
      if (/\[[^\r\n]*\/ERROR\]/u.test(logText)) throw new Error('Reference server emitted an error; inspect the retained log');
    }
  } catch (error) {
    failure = error.message;
    await appendFile(logPath, `\nREFERENCE_RUNNER_REJECTED ${failure}\n`);
  }
  const receipt = {
    schemaVersion: 2, mode, sourceCommit: lock.sourceCommit, command: [java, ...commandArgs], cwd, exit,
    output: outputFile ? path.relative(workspace, outputFile).replaceAll('\\', '/') : null,
    outputSha256: runtime ? await hashFile(outputFile) : null, retainedOutput, referenceManifest: manifestRelative,
    inputFingerprint: manifest?.sourceFingerprint ?? null,
    counts: runtime ? { blocks: runtime.blocks.length, items: runtime.items.length, entities: runtime.entities.length, biomes: runtime.biomes.length, issues: runtime.issues.length } : null,
    failure, portComplete: false,
  };
  await writeFile(path.join(workspace, receiptRelative), stableJson(receipt), { flag: 'wx' });
  await recordAttempt(workspace, {
    gateId, result: failure ? 'fail' : 'pass', method: 'automated', profile: 'java-26.3-production-no-vault',
    scenario: mode === 'build' ? 'Compile immutable source inputs and attest both reference artifacts' : 'Export actual production registry defaults and intrinsic components',
    observed: failure ?? 'Explicit operation result and input/artifact identity validated', command: ['node', 'bedrock/tools/reference.mjs', mode], exitCode: failure ? 1 : 0,
    referenceManifest: manifestRelative,
    artifacts: [logRelative, receiptRelative, ...(retainedOutput ? [retainedOutput] : []), ...(manifestRelative ? [manifestRelative] : [])],
  });
  console.log(JSON.stringify({ mode, result: failure ? 'fail' : 'pass', receipt: receiptRelative, counts: receipt.counts, failure }, null, 2));
  if (failure) process.exitCode = 1;
}

main(process.argv.slice(2)).catch(error => { console.error(error.stack ?? String(error)); process.exitCode = 1; });
