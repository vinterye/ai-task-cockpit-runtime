import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const ROOT = path.resolve(decodeURIComponent(new URL('..', import.meta.url).pathname));
const WORKER = path.join(ROOT, 'scripts', 'stage-workers', 'run-worker.mjs');

function run(stage, artifactDir) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [WORKER, stage], { cwd: ROOT, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', code => {
      if (code !== 0) return reject(new Error(`${stage} exited ${code}: ${stderr}`));
      resolve(JSON.parse(stdout));
    });
    child.stdin.end(JSON.stringify({ task_id: 'TASK-WORKER-TEST', run_id: 'RUN-WORKER-TEST', requirement: 'worker contract', artifact_dir: artifactDir }));
  });
}

test('03/06/07 local workers return stage-agent-result and real artifact evidence', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'cockpit-workers-'));
  try {
    for (const [stage, agent] of [['interaction', 'interaction-agent'], ['development', 'implementation-worker'], ['testing', 'test-worker']]) {
      const result = await run(stage, dir);
      assert.equal(result.schema_version, 'stage-agent-result/v1');
      assert.equal(result.status, 'completed');
      assert.equal(result.agent_id, agent);
      assert.ok(result.structured_content);
      const artifact = result.artifact_refs?.[0];
      assert.equal(artifact.exists, true);
      assert.match(artifact.path, new RegExp(stage === 'interaction' ? '03-interaction-agent' : stage === 'development' ? '06-implementation-worker' : '07-test-worker'));
      assert.match(artifact.fingerprint, /^sha256:/);
      const content = await readFile(artifact.local_path, 'utf8');
      assert.ok(content.includes('TASK-WORKER-TEST'));
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
