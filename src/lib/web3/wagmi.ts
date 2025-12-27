import { http, createConfig } from 'wagmi'
import { mainnet, sepolia } from 'wagmi/chains'
import { walletConnect, injected } from 'wagmi/connectors'

// Fallback project ID for development/testing if env var is missing
// NOTE: This should be replaced with a proper ID from cloud.walletconnect.com
const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || 'public_testing_id'

export const config = createConfig({
    chains: [mainnet, sepolia],
    transports: {
        [mainnet.id]: http(),
        [sepolia.id]: http(),
    },
    connectors: [
        injected(),
        walletConnect({ projectId, showQrModal: true, metadata: { name: 'NSSO', description: 'NSSO Web3 Auth', url: 'https://nsso.me', icons: ['https://nsso.me/assets/nsso-logo.png'] } }),
    ],
})
