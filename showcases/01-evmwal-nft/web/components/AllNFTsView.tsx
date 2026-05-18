'use client';

import { useAllTokens } from '@/hooks/useAllTokens';
import { NFTCard } from './NFTCard';

export function AllNFTsView() {
  const { tokens, isLoading, error, totalSupply } = useAllTokens();

  if (isLoading && tokens.length === 0) {
    return <div className="text-sm text-neutral-500">Loading collection…</div>;
  }
  if (error) {
    return (
      <div className="text-sm text-red-500">
        Couldn&apos;t read contract. Start Anvil and run <code>pnpm deploy:local && pnpm extract-abi</code>.
      </div>
    );
  }
  if (totalSupply === 0) {
    return <div className="text-sm text-neutral-500">No NFTs minted yet. Switch to the <strong>Mint</strong> tab to be the first.</div>;
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
      {tokens.map((t) => (
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
