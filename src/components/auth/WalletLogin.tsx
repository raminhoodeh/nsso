import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useConnect, useSignMessage, useAccount } from 'wagmi'
import { useWallet } from '@solana/wallet-adapter-react'
import { WalletName } from '@solana/wallet-adapter-base'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/components/ui/Toast'
import GlassButton from '@/components/ui/GlassButton'

export default function WalletLogin() {
    const [loading, setLoading] = useState<'ethereum' | 'solana' | null>(null)

    // Ethereum (Wagmi)
    const { connectors, connectAsync: connectEth } = useConnect()

    // Solana
    const { select, wallets, connect: connectSol } = useWallet()

    const handleEthereumLogin = async () => {
        setLoading('ethereum')
        try {
            // Connector selection strategy:
            // 1. Try 'injected' (e.g., MetaMask extension) first
            // 2. Fallback to 'walletConnect' (supports mobile + QR code)
            const injectedConnector = connectors.find(c => c.id === 'injected')
            const wcConnector = connectors.find(c => c.id === 'walletConnect')

            const connectorToUse = injectedConnector || wcConnector || connectors[0]

            if (connectorToUse) {
                await connectEth({ connector: connectorToUse })
                // TODO: Implement SIWE (Sign In With Ethereum) here
                console.log('Connected Ethereum wallet')
            }
        } catch (error) {
            console.error('Ethereum login failed:', error)
        } finally {
            setLoading(null)
        }
    }

    const handleSolanaLogin = async () => {
        setLoading('solana')
        try {
            // For simplicity, select Phantom if available, or just the first one
            // In a real modal we'd show a list
            const phantom = wallets.find(w => w.adapter.name === 'Phantom')
            if (phantom) {
                select(phantom.adapter.name as WalletName)
                await connectSol()
                // TODO: Implement SIWS (Sign In With Solana) here
                console.log('Connected Solana wallet')
            } else {
                alert('Phantom wallet not found. Please install it.')
            }
        } catch (error) {
            console.error('Solana login failed:', error)
        } finally {
            setLoading(null)
        }
    }

    return (
        <div className="space-y-3">
            <GlassButton
                variant="secondary"
                fullWidth
                onClick={handleEthereumLogin}
                disabled={loading === 'ethereum'}
                className="justify-center relative overflow-hidden group"
            >
                <span className="relative z-10 flex items-center gap-2">
                    {/* Ethereum Icon (Simple/Abstract) */}
                    <svg width="20" height="20" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" className="opacity-80">
                        <path d="M15.925 23.96L16 24.075L16.08 23.96L23.515 13.56L16 0L8.485 13.56L15.925 23.96ZM16.08 25.12L16 25.005L15.925 25.12L8.485 14.72L16 32L23.515 14.72L16.08 25.12Z" fill="white" />
                    </svg>
                    Continue with Ethereum
                </span>
            </GlassButton>

            <GlassButton
                variant="secondary"
                fullWidth
                onClick={handleSolanaLogin}
                disabled={loading === 'solana'}
                className="justify-center relative overflow-hidden group"
            >
                <span className="relative z-10 flex items-center gap-2">
                    {/* Solana Icon */}
                    <svg width="20" height="20" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" className="opacity-80">
                        <path d="M4.76 22.8H21.5C21.72 22.8 21.92 22.68 22.02 22.5L27.18 13.5C27.28 13.32 27.28 13.1 27.18 12.92L22.02 3.92C21.92 3.74 21.72 3.62 21.5 3.62H4.76C4.54 3.62 4.34 3.74 4.24 3.92L-0.92 12.92C-1.02 13.1 -1.02 13.32 -0.92 13.5L4.24 22.5C4.34 22.68 4.54 22.8 4.76 22.8Z" fill="transparent" /> {/* Replacing official full logo with abstract shape for now or just generic wallet icon */}
                        <path d="M26.96 6.80005L26.34 7.50005C26.16 7.70005 25.76 7.70005 25.56 7.50005L21.36 4.60005H5.80005L8.74005 7.60005H21.34L26.96 6.80005ZM26.2 11.2H13.6L10.66 8.20005H26.2V11.2ZM5.80005 17.8H21.36L25.56 14.9C25.76 14.7 26.16 14.7 26.34 14.9L26.96 15.6L21.34 14.8H8.74005L5.80005 17.8Z" fill="white" />
                    </svg>
                    Continue with Solana
                </span>
            </GlassButton>

            <p className="text-center text-[11px] text-white/50 px-4 leading-tight">
                Login via web3 to access crypto payments for your products & services
            </p>
        </div>
    )
}
