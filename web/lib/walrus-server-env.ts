import 'server-only';

import { SuiGrpcClient } from '@mysten/sui/grpc';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { walrus } from '@mysten/walrus';

const DEFAULT_TESTNET_GRPC_URL = 'https://fullnode.testnet.sui.io:443';

type WalrusNetwork = 'testnet' | 'mainnet';

function buildClient(network: WalrusNetwork, baseUrl: string) {
  return new SuiGrpcClient({ network, baseUrl }).$extend(walrus());
}

export type WalrusServer = {
  walrusClient: ReturnType<typeof buildClient>;
  keypair: Ed25519Keypair;
};

type Cached = { ok: true; server: WalrusServer } | { ok: false; error: Error };

let cache: Cached | undefined;

// Reads SUI_PRIVATE_KEY / SUI_RPC_URL / WALRUS_NETWORK once per process,
// validates them, and returns a Walrus client + signer keypair. On bad env
// the error is cached so every subsequent call fails fast without re-running
// the validation chain.
export function getWalrusServer(): WalrusServer {
  if (cache) {
    if (!cache.ok) throw cache.error;
    return cache.server;
  }
  try {
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
    const baseUrl = process.env.SUI_RPC_URL ?? DEFAULT_TESTNET_GRPC_URL;

    const walrusClient = buildClient(network, baseUrl);
    const server: WalrusServer = { walrusClient, keypair };
    cache = { ok: true, server };
    return server;
  } catch (err) {
    cache = { ok: false, error: err instanceof Error ? err : new Error(String(err)) };
    throw cache.error;
  }
}
