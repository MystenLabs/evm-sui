import 'server-only';

import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { SuiGrpcClient } from '@mysten/sui/grpc';
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

// Cache holds the resolved server on success and the validation error on
// failure, so bad env fails fast on every subsequent call.
let cache: WalrusServer | Error | undefined;

export function getWalrusServer(): WalrusServer {
  if (cache instanceof Error) throw cache;
  if (cache) return cache;
  try {
    cache = loadWalrusServer();
    return cache;
  } catch (err) {
    cache = err as Error;
    throw cache;
  }
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
  const baseUrl = process.env.SUI_RPC_URL ?? DEFAULT_TESTNET_GRPC_URL;

  return { walrusClient: buildClient(network, baseUrl), keypair };
}
