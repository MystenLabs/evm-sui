'use client';

import '@rainbow-me/rainbowkit/styles.css';
import { RainbowKitProvider, connectorsForWallets } from '@rainbow-me/rainbowkit';
import { injectedWallet, metaMaskWallet, coinbaseWallet } from '@rainbow-me/rainbowkit/wallets';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createConfig, http, WagmiProvider } from 'wagmi';
import { anvil } from '@/lib/chains';
import type { ReactNode } from 'react';

// Local-only sample app — no WalletConnect (and therefore no Reown projectId or
// allowlist headaches). The contract lives on the user's local Anvil node, which
// mobile/WC wallets can't reach anyway. Add walletConnectWallet to this list if
// you ever deploy to a public testnet.
const connectors = connectorsForWallets(
  [
    {
      groupName: 'Local',
      wallets: [injectedWallet, metaMaskWallet, coinbaseWallet],
    },
  ],
  {
    appName: 'EvmWal NFT',
    // RainbowKit insists on a non-empty projectId at module-init even when no
    // WalletConnect-based wallets are configured. The string below never
    // actually hits Reown because the injected/MetaMask/Coinbase connectors
    // don't use WC. Replace with a real cloud.reown.com id if you ever add
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
