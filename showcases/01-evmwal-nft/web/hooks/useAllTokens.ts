'use client';

import { useReadContract, useReadContracts } from 'wagmi';
import { useQueries } from '@tanstack/react-query';
import { CONTRACT_ABI, CONTRACT_ADDRESS } from '@/lib/contract';
import { anvil } from '@/lib/chains';
import { blobIdFromAggregatorUrl } from '@/lib/walruscan';
import type { NFTMetadata } from '@/lib/metadata';

const contract = {
  address: CONTRACT_ADDRESS,
  abi: CONTRACT_ABI,
  chainId: anvil.id,
} as const;

export interface TokenRow {
  tokenId: bigint;
  tokenURI: string;
  owner: `0x${string}` | null;
  metadata: NFTMetadata | null;
  blobIdImage: string | null;
  blobIdMetadata: string | null;
  isLoading: boolean;
  error: string | null;
}

export interface UseAllTokensResult {
  tokens: TokenRow[];
  isLoading: boolean;
  error: string | null;
  totalSupply: number;
}

export function useAllTokens(): UseAllTokensResult {
  const totalQ = useReadContract({ ...contract, functionName: 'totalSupply' });

  const total = totalQ.data ? Number(totalQ.data as bigint) : 0;
  const ids = Array.from({ length: total }, (_, i) => BigInt(i + 1));

  const uriContracts = ids.map((id) => ({
    ...contract,
    functionName: 'tokenURI' as const,
    args: [id] as const,
  }));
  const ownerContracts = ids.map((id) => ({
    ...contract,
    functionName: 'ownerOf' as const,
    args: [id] as const,
  }));

  const urisQ = useReadContracts({ contracts: uriContracts, query: { enabled: total > 0 } });
  const ownersQ = useReadContracts({ contracts: ownerContracts, query: { enabled: total > 0 } });

  const uriResults = (urisQ.data ?? []) as Array<{ result?: string }>;

  const metaQs = useQueries({
    queries: ids.map((_, idx) => {
      const uri = uriResults[idx]?.result as string | undefined;
      return {
        queryKey: ['metadata', uri ?? `tokenURI-pending-${idx}`],
        enabled: typeof uri === 'string' && uri.length > 0,
        staleTime: 1000 * 60 * 60,
        queryFn: async (): Promise<NFTMetadata> => {
          const res = await fetch(uri as string);
          if (!res.ok) throw new Error(`metadata fetch ${res.status}`);
          return (await res.json()) as NFTMetadata;
        },
      };
    }),
  });

  const tokens: TokenRow[] = ids.map((id, idx) => {
    const uri = uriResults[idx]?.result as string | undefined;
    const ownerResults = (ownersQ.data ?? []) as Array<{ result?: `0x${string}` }>;
    const owner = ownerResults[idx]?.result ?? null;
    const metaQ = metaQs[idx];
    const metadata = (metaQ?.data as NFTMetadata | undefined) ?? null;
    const blobIdMetadata = uri ? blobIdFromAggregatorUrl(uri) : null;
    const blobIdImage = metadata?.image ? blobIdFromAggregatorUrl(metadata.image) : null;
    return {
      tokenId: id,
      tokenURI: uri ?? '',
      owner,
      metadata,
      blobIdImage,
      blobIdMetadata,
      isLoading: !uri || !owner || metaQ?.isLoading === true,
      error: metaQ?.error instanceof Error ? metaQ.error.message : null,
    };
  });

  return {
    tokens,
    isLoading: totalQ.isLoading || urisQ.isLoading || ownersQ.isLoading,
    error: totalQ.error?.message ?? urisQ.error?.message ?? ownersQ.error?.message ?? null,
    totalSupply: total,
  };
}
