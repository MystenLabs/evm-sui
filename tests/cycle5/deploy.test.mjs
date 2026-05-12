import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const ANVIL = process.env.HOME + '/.foundry/bin/anvil';
const CAST = process.env.HOME + '/.foundry/bin/cast';
const RPC = 'http://127.0.0.1:8545';

test('AC-5.1 Deploy.s.sol exists and has required imports', () => {
  const p = path.join(REPO_ROOT, 'contracts/script/Deploy.s.sol');
  assert.ok(existsSync(p), `${p} must exist`);
  const src = readFileSync(p, 'utf8');
  assert.match(src, /import\s+.*Script\.sol/, 'must import forge-std/Script.sol');
  assert.match(src, /import\s+.*EvmWalNFT/, 'must import EvmWalNFT');
  assert.match(src, /function\s+run\s*\(/, 'must have run() function');
});

test('AC-5.2 write-deployed-address.ts exists', () => {
  const p = path.join(REPO_ROOT, 'scripts/write-deployed-address.ts');
  assert.ok(existsSync(p), `${p} must exist`);
});

test('AC-5.3 package.json deploy:local script references forge + write-deployed-address', () => {
  const pkg = JSON.parse(readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'));
  const dep = pkg.scripts?.['deploy:local'] ?? '';
  assert.match(dep, /forge[^a-z0-9]+script/i, 'must invoke forge script (any whitespace/quote separator allowed)');
  assert.match(dep, /write-deployed-address/, 'must run write-deployed-address');
});

test('AC-5.7 write-deployed-address.ts does not touch web/', () => {
  const src = readFileSync(path.join(REPO_ROOT, 'scripts/write-deployed-address.ts'), 'utf8');
  // Should not write to anything under web/
  assert.doesNotMatch(src, /writeFile.*web\//i, 'must not writeFile into web/');
  assert.doesNotMatch(src, /web\/\.env/i, 'must not touch web/.env');
});

test('AC-5.4/5.5/5.6 end-to-end deploy against anvil', { timeout: 180000 }, async (t) => {
  // Start anvil in background
  const anvilProc = spawn(ANVIL, ['--port', '8545'], { stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(() => { try { anvilProc.kill('SIGKILL'); } catch {} });

  // Wait for anvil to be ready (~2s)
  await sleep(2000);
  // Probe
  let probe = spawnSync(CAST, ['chain-id', '--rpc-url', RPC], { encoding: 'utf8', timeout: 10000 });
  assert.strictEqual(probe.status, 0, `anvil not ready: ${probe.stderr}`);

  // Run deploy
  const deploy = spawnSync('pnpm', ['deploy:local'], {
    cwd: REPO_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 90000,
  });
  assert.strictEqual(deploy.status, 0, `pnpm deploy:local failed:\nSTDOUT:\n${deploy.stdout}\nSTDERR:\n${deploy.stderr}`);

  // .deployed-address present + valid
  const addrPath = path.join(REPO_ROOT, '.deployed-address');
  assert.ok(existsSync(addrPath), '.deployed-address must exist');
  const addr = readFileSync(addrPath, 'utf8').trim();
  assert.match(addr, /^0x[0-9a-fA-F]{40}$/, `bad address shape: ${addr}`);

  // totalSupply() == 5
  const ts = spawnSync(CAST, ['call', addr, 'totalSupply()(uint256)', '--rpc-url', RPC], { encoding: 'utf8', timeout: 10000 });
  assert.strictEqual(ts.status, 0, `cast totalSupply failed: ${ts.stderr}`);
  const tsNum = ts.stdout.trim().split(/\s+/)[0];
  assert.strictEqual(tsNum, '5', `expected totalSupply == 5, got ${tsNum}`);

  // tokenURI(i) for each i matches manifest
  const manifest = JSON.parse(readFileSync(path.join(REPO_ROOT, 'manifest.json'), 'utf8'));
  for (const entry of manifest) {
    const r = spawnSync(CAST, ['call', addr, 'tokenURI(uint256)(string)', String(entry.tokenId), '--rpc-url', RPC], { encoding: 'utf8', timeout: 10000 });
    assert.strictEqual(r.status, 0, `cast tokenURI(${entry.tokenId}) failed: ${r.stderr}`);
    const got = r.stdout.trim().replace(/^"|"$/g, '');
    assert.strictEqual(got, entry.tokenURI, `tokenId=${entry.tokenId} mismatch`);
  }
});
