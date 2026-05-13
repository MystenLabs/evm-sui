'use client';

import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useWriteContract, useWaitForTransactionReceipt, useAccount } from 'wagmi';
import { decodeEventLog } from 'viem';
import { CONTRACT_ABI, CONTRACT_ADDRESS } from '@/lib/contract';
import { uploadWalrusBlob } from '@/lib/walrus-upload';
import { uploadWalrusBlobViaBackend } from '@/lib/walrus-upload-backend';
import { aggregatorUrl } from '@/lib/walrus';
import { buildMetadata, type Category } from '@/lib/metadata';
import { anvil } from '@/lib/chains';

// Pick the Walrus write path once at module load. NEXT_PUBLIC_* env vars are
// inlined at build time, so this becomes a static reference. Unset / unknown
// values fall through to the backend path — that's the default architecture.
const uploadBlob =
  process.env.NEXT_PUBLIC_WALRUS_UPLOAD_MODE === 'publisher'
    ? uploadWalrusBlob
    : uploadWalrusBlobViaBackend;

export type MintStatus =
  | 'idle'
  | 'uploading-image'
  | 'uploading-metadata'
  | 'awaiting-signature'
  | 'awaiting-confirmation'
  | 'success'
  | 'error';

export interface MintInput {
  name: string;
  description: string;
  category: Category;
  vibe: string;
  file: File;
}

export interface MintHandle {
  status: MintStatus;
  error: string | null;
  txHash: `0x${string}` | null;
  mintedTokenId: bigint | null;
  blobIdImage: string | null;
  blobIdMetadata: string | null;
  // On-Sui Blob object ids, populated only when the operator-backend write
  // path is in use. Null when the public-publisher path was taken (the
  // publisher owns the Blob object in that case, not the operator).
  suiObjectIdImage: string | null;
  suiObjectIdMetadata: string | null;
  submit: (input: MintInput) => Promise<void>;
  reset: () => void;
}

export function useMint(): MintHandle {
  const [status, setStatus] = useState<MintStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<`0x${string}` | null>(null);
  const [mintedTokenId, setMintedTokenId] = useState<bigint | null>(null);
  const [blobIdImage, setBlobIdImage] = useState<string | null>(null);
  const [blobIdMetadata, setBlobIdMetadata] = useState<string | null>(null);
  const [suiObjectIdImage, setSuiObjectIdImage] = useState<string | null>(null);
  const [suiObjectIdMetadata, setSuiObjectIdMetadata] = useState<string | null>(null);

  const queryClient = useQueryClient();
  const { chain } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const { data: receipt } = useWaitForTransactionReceipt({ hash: txHash ?? undefined });

  // When the receipt arrives, decode the Minted event for the tokenId and
  // invalidate every read query that touches the contract.
  if (receipt && status === 'awaiting-confirmation') {
    let tokenId: bigint | null = null;
    for (const log of receipt.logs) {
      try {
        const decoded = decodeEventLog({ abi: CONTRACT_ABI, data: log.data, topics: log.topics });
        if (decoded.eventName === 'Minted') {
          tokenId = (decoded.args as { tokenId: bigint }).tokenId;
          break;
        }
      } catch {
        // not our event
      }
    }
    setMintedTokenId(tokenId);
    // Invalidate every key prefix the gallery + my-nfts hooks use.
    void queryClient.invalidateQueries({ predicate: (q) => {
      const k = String(q.queryKey?.[0] ?? '');
      return k === 'totalSupply' || k === 'tokenURI' || k === 'ownerOf' || k === 'metadata';
    }});
    setStatus('success');
  }

  const reset = useCallback(() => {
    setStatus('idle');
    setError(null);
    setTxHash(null);
    setMintedTokenId(null);
    setBlobIdImage(null);
    setBlobIdMetadata(null);
    setSuiObjectIdImage(null);
    setSuiObjectIdMetadata(null);
  }, []);

  const submit = useCallback(
    async (input: MintInput) => {
      try {
        if (!chain || chain.id !== anvil.id) {
          throw new Error(`Switch your wallet to Anvil (chain ${anvil.id}) before minting.`);
        }
        setError(null);
        setStatus('uploading-image');
        const bytes = new Uint8Array(await input.file.arrayBuffer());
        const imageRes = await uploadBlob(bytes, input.file.type);
        setBlobIdImage(imageRes.blobId);
        setSuiObjectIdImage(imageRes.suiObjectId ?? null);

        setStatus('uploading-metadata');
        const metaJson = buildMetadata({
          name: input.name,
          description: input.description,
          blobIdImage: imageRes.blobId,
          category: input.category,
          vibe: input.vibe,
          createdAt: Math.floor(Date.now() / 1000),
        });
        const metaRes = await uploadBlob(JSON.stringify(metaJson), 'application/json');
        setBlobIdMetadata(metaRes.blobId);
        setSuiObjectIdMetadata(metaRes.suiObjectId ?? null);

        const tokenURI = aggregatorUrl(metaRes.blobId);

        setStatus('awaiting-signature');
        const hash = await writeContractAsync({
          address: CONTRACT_ADDRESS,
          abi: CONTRACT_ABI,
          functionName: 'mint',
          args: [tokenURI],
          chainId: anvil.id,
        });
        setTxHash(hash);
        setStatus('awaiting-confirmation');
        // success state is set in the receipt-observation block above
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setStatus('error');
      }
    },
    [chain, writeContractAsync],
  );

  return {
    status,
    error,
    txHash,
    mintedTokenId,
    blobIdImage,
    blobIdMetadata,
    suiObjectIdImage,
    suiObjectIdMetadata,
    submit,
    reset,
  };
}
