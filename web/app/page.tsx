'use client';

import { useState } from 'react';
import { ConnectButton } from '@/components/ConnectButton';
import { AllNFTsView } from '@/components/AllNFTsView';
import { MyNFTsView } from '@/components/MyNFTsView';
import { MintForm } from '@/components/MintForm';
import { Tabs } from '@/components/Tabs';

const TABS = [
  { key: 'all', label: 'All NFTs' },
  { key: 'mine', label: 'My NFTs' },
  { key: 'mint', label: 'Mint' },
];

export default function Home() {
  const [tab, setTab] = useState<string>('all');

  return (
    <main className="flex-1 flex flex-col">
      <header className="flex items-center justify-between px-6 py-4 border-b border-neutral-200 dark:border-neutral-800">
        <div>
          <h1 className="text-xl font-semibold">EvmWal NFT</h1>
          <p className="text-xs text-neutral-500">Sample dApp · NFT metadata stored on Walrus testnet</p>
        </div>
        <ConnectButton />
      </header>
      <div className="px-6 pt-4">
        <Tabs items={TABS} selected={tab} onSelect={setTab} />
      </div>
      <section className="flex-1 p-6">
        {tab === 'all' && <AllNFTsView />}
        {tab === 'mine' && <MyNFTsView />}
        {tab === 'mint' && <MintForm />}
      </section>
    </main>
  );
}
