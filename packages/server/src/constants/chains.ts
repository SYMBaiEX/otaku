import { base, mainnet, polygon, baseSepolia, sepolia, arbitrum, optimism, scroll } from 'viem/chains';
import type { Chain } from 'viem/chains';

/**
 * Supported blockchain networks
 */
export type SupportedNetwork = 'base' | 'ethereum' | 'polygon' | 'arbitrum' | 'optimism' | 'scroll' | 'base-sepolia' | 'ethereum-sepolia';

/**
 * Chain configuration interface
 */
export interface ChainConfig {
  name: string;
  chain: Chain;
  rpcUrl: (alchemyKey: string) => string;
  explorerUrl: string;
  nativeToken: {
    symbol: string;
    name: string;
    coingeckoId: string;
    decimals: number;
  };
  coingeckoPlatform: string;
}

/**
 * Centralized chain configurations
 * Add new chains here to support them across the entire application
 */
export const CHAIN_CONFIGS: Record<SupportedNetwork, ChainConfig> = {
  'base': {
    name: 'Base',
    chain: base,
    rpcUrl: (alchemyKey: string) => `https://base-mainnet.g.alchemy.com/v2/${alchemyKey}`,
    explorerUrl: 'https://basescan.org',
    nativeToken: {
      symbol: 'ETH',
      name: 'Ethereum',
      coingeckoId: 'ethereum',
      decimals: 18,
    },
    coingeckoPlatform: 'base',
  },
  'ethereum': {
    name: 'Ethereum',
    chain: mainnet,
    rpcUrl: (alchemyKey: string) => `https://eth-mainnet.g.alchemy.com/v2/${alchemyKey}`,
    explorerUrl: 'https://etherscan.io',
    nativeToken: {
      symbol: 'ETH',
      name: 'Ethereum',
      coingeckoId: 'ethereum',
      decimals: 18,
    },
    coingeckoPlatform: 'ethereum',
  },
  'polygon': {
    name: 'Polygon',
    chain: polygon,
    rpcUrl: (alchemyKey: string) => `https://polygon-mainnet.g.alchemy.com/v2/${alchemyKey}`,
    explorerUrl: 'https://polygonscan.com',
    nativeToken: {
      symbol: 'MATIC',
      name: 'Polygon',
      coingeckoId: 'matic-network',
      decimals: 18,
    },
    coingeckoPlatform: 'polygon-pos',
  },
  'arbitrum': {
    name: 'Arbitrum',
    chain: arbitrum,
    rpcUrl: (alchemyKey: string) => `https://arb-mainnet.g.alchemy.com/v2/${alchemyKey}`,
    explorerUrl: 'https://arbiscan.io',
    nativeToken: {
      symbol: 'ETH',
      name: 'Ethereum',
      coingeckoId: 'ethereum',
      decimals: 18,
    },
    coingeckoPlatform: 'arbitrum-one',
  },
  'optimism': {
    name: 'Optimism',
    chain: optimism,
    rpcUrl: (alchemyKey: string) => `https://opt-mainnet.g.alchemy.com/v2/${alchemyKey}`,
    explorerUrl: 'https://optimistic.etherscan.io',
    nativeToken: {
      symbol: 'ETH',
      name: 'Ethereum',
      coingeckoId: 'ethereum',
      decimals: 18,
    },
    coingeckoPlatform: 'optimistic-ethereum',
  },
  'scroll': {
    name: 'Scroll',
    chain: scroll,
    rpcUrl: (alchemyKey: string) => `https://scroll-mainnet.g.alchemy.com/v2/${alchemyKey}`,
    explorerUrl: 'https://scrollscan.com',
    nativeToken: {
      symbol: 'ETH',
      name: 'Ethereum',
      coingeckoId: 'ethereum',
      decimals: 18,
    },
    coingeckoPlatform: 'scroll',
  },
  'base-sepolia': {
    name: 'Base Sepolia',
    chain: baseSepolia,
    rpcUrl: (alchemyKey: string) => `https://base-sepolia.g.alchemy.com/v2/${alchemyKey}`,
    explorerUrl: 'https://sepolia.basescan.org',
    nativeToken: {
      symbol: 'ETH',
      name: 'Ethereum',
      coingeckoId: 'ethereum',
      decimals: 18,
    },
    coingeckoPlatform: 'base',
  },
  'ethereum-sepolia': {
    name: 'Ethereum Sepolia',
    chain: sepolia,
    rpcUrl: (alchemyKey: string) => `https://eth-sepolia.g.alchemy.com/v2/${alchemyKey}`,
    explorerUrl: 'https://sepolia.etherscan.io',
    nativeToken: {
      symbol: 'ETH',
      name: 'Ethereum',
      coingeckoId: 'ethereum',
      decimals: 18,
    },
    coingeckoPlatform: 'ethereum',
  },
};

/**
 * Get mainnet networks only (excludes testnets)
 */
export const MAINNET_NETWORKS: SupportedNetwork[] = ['base', 'ethereum', 'polygon', 'arbitrum', 'optimism', 'scroll'];

/**
 * Get testnet networks only
 */
export const TESTNET_NETWORKS: SupportedNetwork[] = ['base-sepolia', 'ethereum-sepolia'];

/**
 * Get all supported networks
 */
export const ALL_NETWORKS: SupportedNetwork[] = Object.keys(CHAIN_CONFIGS) as SupportedNetwork[];

/**
 * Helper: Get chain config by network name
 */
export function getChainConfig(network: string): ChainConfig | null {
  return CHAIN_CONFIGS[network as SupportedNetwork] || null;
}

/**
 * Helper: Get viem chain object by network name
 */
export function getViemChain(network: string): Chain | null {
  const config = getChainConfig(network);
  return config?.chain || null;
}

/**
 * Helper: Get RPC URL for a network
 */
export function getRpcUrl(network: string, alchemyKey: string): string | null {
  const config = getChainConfig(network);
  return config ? config.rpcUrl(alchemyKey) : null;
}

/**
 * Helper: Get explorer URL for a network
 */
export function getExplorerUrl(network: string): string | null {
  const config = getChainConfig(network);
  return config?.explorerUrl || null;
}

/**
 * Helper: Get transaction explorer URL
 */
export function getTxExplorerUrl(network: string, txHash: string): string | null {
  const explorerUrl = getExplorerUrl(network);
  return explorerUrl ? `${explorerUrl}/tx/${txHash}` : null;
}

/**
 * Helper: Get address explorer URL
 */
export function getAddressExplorerUrl(network: string, address: string): string | null {
  const explorerUrl = getExplorerUrl(network);
  return explorerUrl ? `${explorerUrl}/address/${address}` : null;
}

/**
 * Helper: Get native token info for a network
 */
export function getNativeTokenInfo(network: string) {
  const config = getChainConfig(network);
  return config?.nativeToken || null;
}

/**
 * Helper: Get CoinGecko platform ID for a network
 */
export function getCoingeckoPlatform(network: string): string | null {
  const config = getChainConfig(network);
  return config?.coingeckoPlatform || null;
}

/**
 * Helper: Check if a network is supported
 */
export function isSupportedNetwork(network: string): network is SupportedNetwork {
  return network in CHAIN_CONFIGS;
}

/**
 * Helper: Check if a network is a mainnet
 */
export function isMainnet(network: string): boolean {
  return MAINNET_NETWORKS.includes(network as SupportedNetwork);
}

/**
 * Helper: Check if a network is a testnet
 */
export function isTestnet(network: string): boolean {
  return TESTNET_NETWORKS.includes(network as SupportedNetwork);
}

