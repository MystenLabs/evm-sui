'use client';

import { useState } from 'react';
import type { NFTMetadata } from '@/lib/metadata';
import { walruscanUrl } from '@/lib/walruscan';
import { aggregatorUrl } from '@/lib/walrus';
import { CONTRACT_ADDRESS } from '@/lib/contract';

export interface NFTCardProps {
  tokenId: bigint;
  metadata: NFTMetadata | null;
  owner: `0x${string}` | null;
  blobIdImage: string | null;
  blobIdMetadata: string | null;
  isLoading: boolean;
  error: string | null;
}

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  async function onCopy(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // ignore
    }
  }
  return (
    <div className="flex flex-col gap-0.5">
      <div className="text-[10px] uppercase tracking-wide text-neutral-400">{label}</div>
      <div className="flex items-center gap-1">
        <code className="font-mono text-[10px] text-neutral-700 dark:text-neutral-300 break-all flex-1">{value}</code>
        <button
          type="button"
          onClick={onCopy}
          className="text-[9px] px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200 shrink-0"
        >
          {copied ? '✓' : 'copy'}
        </button>
      </div>
    </div>
  );
}

export function NFTCard({ tokenId, metadata, owner, blobIdImage, blobIdMetadata, isLoading, error }: NFTCardProps) {
  const imageExplorer = blobIdImage ? walruscanUrl(blobIdImage) : null;
  const metaExplorer = blobIdMetadata ? walruscanUrl(blobIdMetadata) : null;
  const ownerShort = owner ? `${owner.slice(0, 6)}…${owner.slice(-4)}` : null;
  const onChainTokenURI = blobIdMetadata ? aggregatorUrl(blobIdMetadata) : null;

  const card = (
    <article
      data-testid="nft-card"
      className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 overflow-hidden shadow-sm flex flex-col hover:shadow-md transition"
    >
      <a
        href={imageExplorer ?? '#'}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => { if (!imageExplorer) e.preventDefault(); }}
        className="aspect-square w-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center cursor-pointer"
        aria-label={imageExplorer ? 'View image blob on Walruscan' : 'No image'}
      >
        {isLoading ? (
          <div className="text-sm text-neutral-400">Loading…</div>
        ) : error ? (
          <div className="text-sm text-red-500 p-4 text-center">Failed: {error}</div>
        ) : metadata?.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={metadata.image} alt={metadata.name} className="w-full h-full object-cover" />
        ) : (
          <div className="text-sm text-neutral-400">No image</div>
        )}
      </a>
      <div className="p-4 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="text-xs text-neutral-400 font-mono">#{tokenId.toString()}</div>
          {ownerShort && <div className="text-xs text-neutral-400 font-mono">{ownerShort}</div>}
        </div>
        <div className="font-semibold">{metadata?.name ?? '…'}</div>
        <div className="text-sm text-neutral-500 line-clamp-2">{metadata?.description ?? ''}</div>
        {metadata?.attributes && metadata.attributes.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {metadata.attributes
              .filter((a) => a.value !== '' && a.value !== undefined && a.trait_type !== 'Created')
              .map((a) => (
                <span
                  key={a.trait_type}
                  className="text-[10px] px-2 py-0.5 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300"
                >
                  {a.trait_type}: {String(a.value)}
                </span>
              ))}
          </div>
        )}
        <div className="flex items-center gap-2 flex-wrap mt-1">
          <span className="text-[11px] text-neutral-400">on Walruscan:</span>
          {imageExplorer ? (
            <a
              href={imageExplorer}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] text-neutral-700 dark:text-neutral-200 hover:text-neutral-900 dark:hover:text-white underline"
            >
              image ↗
            </a>
          ) : (
            <span className="text-[11px] text-neutral-300 dark:text-neutral-600">image —</span>
          )}
          <span className="text-[11px] text-neutral-300 dark:text-neutral-600">·</span>
          {metaExplorer ? (
            <a
              href={metaExplorer}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] text-neutral-700 dark:text-neutral-200 hover:text-neutral-900 dark:hover:text-white underline"
            >
              metadata ↗
            </a>
          ) : (
            <span className="text-[11px] text-neutral-300 dark:text-neutral-600">metadata —</span>
          )}
        </div>

        <details className="mt-2 border-t border-neutral-200 dark:border-neutral-800 pt-2">
          <summary className="cursor-pointer text-[11px] text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200 select-none">
            on-chain details
          </summary>
          <div className="mt-2 flex flex-col gap-2">
            <CopyRow label="contract" value={CONTRACT_ADDRESS} />
            <CopyRow label="token id" value={tokenId.toString()} />
            {owner && <CopyRow label="owner" value={owner} />}
            {onChainTokenURI && <CopyRow label="tokenURI (on-chain)" value={onChainTokenURI} />}
            {blobIdMetadata && <CopyRow label="blobId metadata" value={blobIdMetadata} />}
            {blobIdImage && <CopyRow label="blobId image" value={blobIdImage} />}
            <p className="text-[10px] text-neutral-400 leading-snug">
              The contract&apos;s <code>tokenURI({tokenId.toString()})</code> returns the aggregator URL above —
              its last segment is the metadata blobId, and the metadata JSON&apos;s <code>image</code> field
              ends in the image blobId. Both should match the Walruscan links above.
            </p>
          </div>
        </details>
      </div>
    </article>
  );

  return card;
}
