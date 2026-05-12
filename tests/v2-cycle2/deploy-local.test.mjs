import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import path from 'node:path';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const ANVIL = process.env.HOME + '/.foundry/bin/anvil';
const CAST = process.env.HOME + '/.foundry/bin/cast';
const RPC = 'http://127.0.0.1:8545';

test('AC-2.4 deploy:local yields an empty deployed contract', { timeout: 180000 }, async (t) => {
  const anvilProc = spawn(ANVIL, ['--port', '8545'], { stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(() => { try { anvilProc.kill('SIGKILL'); } catch {} });
  await sleep(2000);

  const probe = spawnSync(CAST, ['chain-id', '--rpc-url', RPC], { encoding: 'utf8', timeout: 10000 });
  assert.strictEqual(probe.status, 0, `anvil not ready: ${probe.stderr}`);

  const deploy = spawnSync('pnpm', ['deploy:local'], {
    cwd: REPO_ROOT, encoding: 'utf8', timeout: 90000,
  });
  assert.strictEqual(deploy.status, 0, `deploy failed:\nSTDOUT:\n${deploy.stdout}\nSTDERR:\n${deploy.stderr}`);

  const addrPath = path.join(REPO_ROOT, '.deployed-address');
  assert.ok(existsSync(addrPath), '.deployed-address must exist');
  const addr = readFileSync(addrPath, 'utf8').trim();
  assert.match(addr, /^0x[0-9a-fA-F]{40}$/, `bad address: ${addr}`);

  const ts = spawnSync(CAST, ['call', addr, 'totalSupply()(uint256)', '--rpc-url', RPC], { encoding: 'utf8', timeout: 10000 });
  assert.strictEqual(ts.status, 0, `cast totalSupply failed: ${ts.stderr}`);
  const n = ts.stdout.trim().split(/\s+/)[0];
  assert.strictEqual(n, '0', `expected totalSupply == 0 (no manifest seed), got ${n}`);
});
