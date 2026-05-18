import 'server-only';

import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { SuiGrpcClient } from '@mysten/sui/grpc';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { walrus } from '@mysten/walrus';

type WalrusNetwork = 'testnet' | 'mainnet';

const DEFAULT_GRPC_URLS: Record<WalrusNetwork, string> = {
  testnet: 'https://fullnode.testnet.sui.io:443',
  mainnet: 'https://fullnode.mainnet.sui.io:443',
};

function buildClient(network: WalrusNetwork, baseUrl: string) {
  return new SuiGrpcClient({ network, baseUrl }).$extend(walrus());
}

export type WalrusServer = {
  walrusClient: ReturnType<typeof buildClient>;
  keypair: Ed25519Keypair;
};

// Successful results are cached for the lifetime of the dev server. Errors
// are NOT cached so a typo in .env.local can be fixed without a restart.
let cache: WalrusServer | undefined;

export function getWalrusServer(): WalrusServer {
  if (cache) return cache;
  cache = loadWalrusServer();
  return cache;
}

function loadWalrusServer(): WalrusServer {
  const rawKey = process.env.SUI_PRIVATE_KEY;
  if (!rawKey) {
    throw new Error(
      'SUI_PRIVATE_KEY is required for backend Walrus uploads. ' +
        "Set it in web/.env.local (bech32 'suiprivkey...' format), or switch " +
        'NEXT_PUBLIC_WALRUS_UPLOAD_MODE=publisher to use the public publisher.',
    );
  }
  const parsed = decodeSuiPrivateKey(rawKey);
  if (parsed.scheme !== 'ED25519') {
    throw new Error(`SUI_PRIVATE_KEY must be ED25519 (got ${parsed.scheme})`);
  }
  const keypair = Ed25519Keypair.fromSecretKey(parsed.secretKey);

  const network = (process.env.WALRUS_NETWORK ?? 'testnet') as WalrusNetwork;
  if (network !== 'testnet' && network !== 'mainnet') {
    throw new Error(`WALRUS_NETWORK must be 'testnet' or 'mainnet' (got '${network}')`);
  }
  // Pick the RPC default that matches the chosen network — setting only
  // WALRUS_NETWORK=mainnet would otherwise silently keep the testnet URL.
  const baseUrl = process.env.SUI_RPC_URL ?? DEFAULT_GRPC_URLS[network];

  return { walrusClient: buildClient(network, baseUrl), keypair };
}
