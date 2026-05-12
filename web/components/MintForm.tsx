'use client';

import { useState } from 'react';
import { useAccount } from 'wagmi';
import { useMint } from '@/hooks/useMint';
import { anvil } from '@/lib/chains';
import type { Category } from '@/lib/metadata';

const NAME_MAX = 64;
const DESCRIPTION_MAX = 500;
const VIBE_MAX = 32;
const FILE_MAX = 5 * 1024 * 1024;
const CATEGORIES: Category[] = ['Art', 'Photo', 'Meme', 'Other'];
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;

function isAllowedType(t: string): boolean {
  return (ALLOWED_TYPES as readonly string[]).includes(t);
}

export function MintForm() {
  const { isConnected, chain } = useAccount();
  const onAnvil = chain?.id === anvil.id;
  const { status, error, mintedTokenId, submit, reset } = useMint();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<Category>('Art');
  const [vibe, setVibe] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  const busy =
    status === 'uploading-image' ||
    status === 'uploading-metadata' ||
    status === 'awaiting-signature' ||
    status === 'awaiting-confirmation';

  const trimmedName = name.trim();
  const trimmedDesc = description.trim();
  const valid =
    trimmedName.length > 0 && trimmedName.length <= NAME_MAX &&
    trimmedDesc.length > 0 && trimmedDesc.length <= DESCRIPTION_MAX &&
    vibe.length <= VIBE_MAX &&
    file !== null && fileError === null;

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    if (!f) { setFileError(null); return; }
    if (!isAllowedType(f.type)) {
      setFileError('PNG, JPEG, or WebP only.');
      return;
    }
    if (f.size > FILE_MAX) {
      setFileError(`Max 5 MiB (got ${(f.size / 1024 / 1024).toFixed(2)} MiB).`);
      return;
    }
    setFileError(null);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !valid) return;
    await submit({ name: trimmedName, description: trimmedDesc, category, vibe, file });
  }

  if (!isConnected) {
    return (
      <div className="rounded-md border border-neutral-300 dark:border-neutral-700 p-6 text-sm text-neutral-500">
        Connect a wallet to mint.
      </div>
    );
  }
  if (!onAnvil) {
    return (
      <div className="rounded-md border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/40 p-6 text-sm">
        Switch to Anvil (chain {anvil.id}) to mint.
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4 max-w-xl">
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">name <span className="text-neutral-400 text-xs">({trimmedName.length}/{NAME_MAX})</span></span>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={NAME_MAX}
          disabled={busy}
          className="rounded border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2"
          required
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">description <span className="text-neutral-400 text-xs">({trimmedDesc.length}/{DESCRIPTION_MAX})</span></span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={DESCRIPTION_MAX}
          rows={3}
          disabled={busy}
          className="rounded border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2"
          required
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">category</span>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as Category)}
          disabled={busy}
          className="rounded border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2"
        >
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">vibe <span className="text-neutral-400 text-xs">({vibe.length}/{VIBE_MAX}, optional)</span></span>
        <input
          type="text"
          value={vibe}
          onChange={(e) => setVibe(e.target.value)}
          maxLength={VIBE_MAX}
          disabled={busy}
          className="rounded border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">image (PNG, JPEG, WebP, max 5 MiB)</span>
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={onPickFile}
          disabled={busy}
          className="text-sm"
        />
        {fileError && <span className="text-xs text-red-500">{fileError}</span>}
      </label>

      <button
        type="submit"
        disabled={!valid || busy}
        className="rounded-md bg-black text-white dark:bg-white dark:text-black px-4 py-2 text-sm font-medium disabled:opacity-50"
      >
        {status === 'idle' && 'Mint'}
        {status === 'uploading-image' && 'Uploading image to Walrus…'}
        {status === 'uploading-metadata' && 'Uploading metadata to Walrus…'}
        {status === 'awaiting-signature' && 'Confirm in your wallet…'}
        {status === 'awaiting-confirmation' && 'Awaiting on-chain confirmation…'}
        {status === 'success' && `Minted! token #${mintedTokenId?.toString() ?? '?'} ✓`}
        {status === 'error' && 'Try again'}
      </button>

      {status === 'success' && (
        <div className="text-sm text-emerald-600">
          Your NFT has been minted. It should appear in the Gallery and My NFTs tabs shortly.{' '}
          <button type="button" onClick={reset} className="underline">Mint another</button>
        </div>
      )}

      {error && (
        <div className="text-sm text-red-500 whitespace-pre-wrap">{error}</div>
      )}
    </form>
  );
}
