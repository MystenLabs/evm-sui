'use client';

import { useAccount } from 'wagmi';
import { useAllTokens } from '@/hooks/useAllTokens';
import { NFTCard } from './NFTCard';
import { anvil } from '@/lib/chains';

export function MyNFTsView() {
  const { address, isConnected, chain } = useAccount();
  const { tokens, isLoading, totalSupply } = useAllTokens();

  if (!isConnected || !address) {
    return (
      <div className="rounded-md border border-neutral-300 dark:border-neutral-700 p-6 text-sm text-neutral-500">
        Connect a wallet to see your NFTs.
      </div>
    );
  }
  if (chain?.id !== anvil.id) {
    return (
      <div className="rounded-md border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/40 p-6 text-sm">
        Switch to Anvil (chain {anvil.id}) to see your NFTs.
      </div>
    );
  }

  const owned = tokens.filter((t) => t.owner && t.owner.toLowerCase() === address.toLowerCase());

  if (isLoading && owned.length === 0) {
    return <div className="text-sm text-neutral-500">Loading your collection…</div>;
  }
  if (totalSupply === 0) {
    return <div className="text-sm text-neutral-500">No NFTs minted yet.</div>;
  }
  if (owned.length === 0) {
    return <div className="text-sm text-neutral-500">You don&apos;t own any NFTs yet. Switch to the <strong>Mint</strong> tab to mint one.</div>;
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
      {owned.map((t) => (
        <NFTCard
          key={t.tokenId.toString()}
          tokenId={t.tokenId}
          metadata={t.metadata}
          owner={t.owner}
          blobIdImage={t.blobIdImage}
          blobIdMetadata={t.blobIdMetadata}
          isLoading={t.isLoading}
          error={t.error}
        />
      ))}
    </div>
  );
}
