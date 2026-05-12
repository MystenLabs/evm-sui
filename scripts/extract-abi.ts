// Cycle 6. Reads .deployed-address + contracts/out/EvmWalNFT.sol/EvmWalNFT.json
// and produces web/.env.local + an updated web/lib/contract.ts with the live ABI.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const DEPLOYED_ADDRESS = path.join(REPO_ROOT, '.deployed-address');
const FORGE_ARTIFACT = path.join(REPO_ROOT, 'contracts', 'out', 'EvmWalNFT.sol', 'EvmWalNFT.json');
const ENV_LOCAL = path.join(REPO_ROOT, 'web', '.env.local');
const CONTRACT_TS = path.join(REPO_ROOT, 'web', 'lib', 'contract.ts');

function syncEnvLocal(): void {
  if (!existsSync(DEPLOYED_ADDRESS)) {
    throw new Error(`.deployed-address not found at ${DEPLOYED_ADDRESS}. Run pnpm deploy:local first.`);
  }
  const address = readFileSync(DEPLOYED_ADDRESS, 'utf8').trim();
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
    throw new Error(`bad address shape in .deployed-address: ${address}`);
  }

  let content = '';
  if (existsSync(ENV_LOCAL)) {
    content = readFileSync(ENV_LOCAL, 'utf8');
    const re = /^NEXT_PUBLIC_CONTRACT_ADDRESS=.*$/m;
    if (re.test(content)) {
      content = content.replace(re, `NEXT_PUBLIC_CONTRACT_ADDRESS=${address}`);
    } else {
      content = content.replace(/\n?$/, `\nNEXT_PUBLIC_CONTRACT_ADDRESS=${address}\n`);
    }
  } else {
    content = `NEXT_PUBLIC_CONTRACT_ADDRESS=${address}\n`;
  }
  writeFileSync(ENV_LOCAL, content, 'utf8');
  process.stdout.write(`[extract-abi] wrote ${ENV_LOCAL}\n`);
}

function syncContractTs(): void {
  if (!existsSync(FORGE_ARTIFACT)) {
    throw new Error(`forge artifact not found at ${FORGE_ARTIFACT}. Run forge build in contracts/ first.`);
  }
  const artifact = JSON.parse(readFileSync(FORGE_ARTIFACT, 'utf8'));
  if (!Array.isArray(artifact.abi)) {
    throw new Error('artifact.abi is not an array');
  }
  const ts = `export const CONTRACT_ADDRESS =
  (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS as \`0x\${string}\` | undefined) ??
  ('0x0000000000000000000000000000000000000000' as const);

export const CONTRACT_ABI = ${JSON.stringify(artifact.abi, null, 2)} as const;
`;
  writeFileSync(CONTRACT_TS, ts, 'utf8');
  process.stdout.write(`[extract-abi] wrote ${CONTRACT_TS} (${artifact.abi.length} ABI entries)\n`);
}

function main(): void {
  syncEnvLocal();
  syncContractTs();
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    main();
  } catch (err) {
    process.stderr.write(`extract-abi failed: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  }
}
