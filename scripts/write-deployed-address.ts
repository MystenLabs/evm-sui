// Parses Foundry's broadcast artifact and writes the deployed address to
// repo-root .deployed-address. Cycle 5.
//
// Deliberately writes ONLY to .deployed-address at the repo root. The
// frontend package directory is NOT touched here; Cycle 6 owns that.

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const BROADCAST = path.join(REPO_ROOT, 'contracts', 'broadcast', 'Deploy.s.sol', '31337', 'run-latest.json');
const OUT = path.join(REPO_ROOT, '.deployed-address');

function main() {
  const raw = readFileSync(BROADCAST, 'utf8');
  const broadcast = JSON.parse(raw);
  const txs = broadcast.transactions || [];
  const deploy = txs.find((t: { transactionType?: string; contractAddress?: string }) =>
    t.transactionType === 'CREATE' && typeof t.contractAddress === 'string',
  );
  if (!deploy || !deploy.contractAddress) {
    throw new Error('No CREATE tx with contractAddress in broadcast artifact');
  }
  const addr = String(deploy.contractAddress);
  if (!/^0x[0-9a-fA-F]{40}$/.test(addr)) {
    throw new Error(`bad address shape: ${addr}`);
  }
  writeFileSync(OUT, addr + '\n', 'utf8');
  process.stdout.write(`[write-deployed-address] wrote ${OUT}: ${addr}\n`);
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    main();
  } catch (err) {
    process.stderr.write(`write-deployed-address failed: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  }
}
