'use client'

import { ReactNode, useMemo } from 'react'
import { WagmiProvider } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react'
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base'
import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets'
import { clusterApiUrl } from '@solana/web3.js'
import { config } from '@/lib/web3/wagmi'

// Create a client
const queryClient = new QueryClient()

export default function Web3Provider({ children }: { children: ReactNode }) {
    // Solana config
    const network = WalletAdapterNetwork.Mainnet
    const endpoint = useMemo(() => clusterApiUrl(network), [network])
    const wallets = useMemo(
        () => [
            new PhantomWalletAdapter(),
            new SolflareWalletAdapter(),
        ],
        []
    )

    return (
        <WagmiProvider config={config}>
            <QueryClientProvider client={queryClient}>
                <ConnectionProvider endpoint={endpoint}>
                    <WalletProvider wallets={wallets} autoConnect>
                        {children}
                    </WalletProvider>
                </ConnectionProvider>
            </QueryClientProvider>
        </WagmiProvider>
    )
}
