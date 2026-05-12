'use client';

import '@rainbow-me/rainbowkit/styles.css';
import { RainbowKitProvider, connectorsForWallets } from '@rainbow-me/rainbowkit';
import { injectedWallet, metaMaskWallet } from '@rainbow-me/rainbowkit/wallets';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createConfig, http, WagmiProvider } from 'wagmi';
import { anvil } from '@/lib/chains';
import type { ReactNode } from 'react';

// Local-only sample app. Two intentional restrictions on the wallet stack:
//
//   - No WalletConnect. The contract lives on the user's local Anvil node,
//     which mobile/WC wallets can't reach anyway, and the WC machinery would
//     require a cloud.reown.com projectId + allowlist entry per origin.
//
//   - No Coinbase Wallet. The RainbowKit coinbaseWallet connector pulls in
//     @coinbase/cdp-sdk → @base-org/account → axios, dragging in a chain of
//     transitive deps that we don't need for an injected-wallet-only demo.
//     Add it back if you ever ship to a public testnet and want CB Wallet
//     support out of the box.
const connectors = connectorsForWallets(
  [
    {
      groupName: 'Local',
      wallets: [injectedWallet, metaMaskWallet],
    },
  ],
  {
    appName: 'EvmWal NFT',
    // RainbowKit insists on a non-empty projectId at module-init even when no
    // WalletConnect-based wallets are configured. The string below never
    // actually hits Reown because the injected/MetaMask connectors don't use
    // WC. Replace with a real cloud.reown.com id if you ever add
    // walletConnectWallet to the list above.
    projectId: 'evmwal-local-dev-no-walletconnect',
  },
);

const config = createConfig({
  connectors,
  chains: [anvil],
  transports: { [anvil.id]: http() },
  ssr: true,
});

const queryClient = new QueryClient();

export function Providers({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider>{children}</RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
