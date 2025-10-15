import {
  type Action,
  type IAgentRuntime,
  type Memory,
  type State,
  type HandlerCallback,
  type ActionResult,
  logger
} from "@elizaos/core";
import { getEntityWallet } from "../../../utils/entity";
import { CdpService } from "../services/cdp.service";
import { formatUnits, createPublicClient, http } from 'viem';
import { base, mainnet, polygon } from 'viem/chains';

// Supported chains
type ChainNetwork = 'base' | 'ethereum' | 'polygon';

interface ChainConfig {
  name: string;
  rpcUrl: string;
  nativeToken: {
    symbol: string;
    name: string;
    coingeckoId: string;
  };
  coingeckoPlatform: string;
}

const CHAIN_CONFIGS: Record<ChainNetwork, ChainConfig> = {
  base: {
    name: 'Base',
    rpcUrl: 'BASE_RPC_URL',
    nativeToken: { symbol: 'ETH', name: 'Ethereum', coingeckoId: 'ethereum' },
    coingeckoPlatform: 'base',
  },
  ethereum: {
    name: 'Ethereum',
    rpcUrl: 'ETHEREUM_RPC_URL',
    nativeToken: { symbol: 'ETH', name: 'Ethereum', coingeckoId: 'ethereum' },
    coingeckoPlatform: 'ethereum',
  },
  polygon: {
    name: 'Polygon',
    rpcUrl: 'POLYGON_RPC_URL',
    nativeToken: { symbol: 'MATIC', name: 'Polygon', coingeckoId: 'matic-network' },
    coingeckoPlatform: 'polygon-pos',
  },
};

const VIEM_CHAINS = {
  base,
  ethereum: mainnet,
  polygon,
};

// ERC20 ABI for token metadata
const ERC20_METADATA_ABI = [
  {
    name: 'symbol',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
  },
  {
    name: 'decimals',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
  },
  {
    name: 'name',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
  },
] as const;

interface TokenBalance {
  symbol: string;
  name: string;
  balance: string;
  usdValue: number;
  contractAddress?: string;
  chain: ChainNetwork;
  decimals: number;
}

// Fetch token info from CoinGecko or DexScreener
async function getTokenInfo(contractAddress: string, chain: ChainNetwork): Promise<{
  symbol: string;
  name: string;
  decimals: number;
  price: number;
} | null> {
  const apiKey = process.env.COINGECKO_API_KEY;
  
  // Try CoinGecko first if API key is available
  if (apiKey) {
    try {
      const platform = CHAIN_CONFIGS[chain].coingeckoPlatform;
      const baseUrl = 'https://pro-api.coingecko.com/api/v3';
      const url = `${baseUrl}/coins/${platform}/contract/${contractAddress}`;
      
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'x-cg-pro-api-key': apiKey,
        },
        signal: controller.signal,
      });
      
      clearTimeout(timeout);

      if (response.ok) {
        const data = await response.json();
        
        return {
          symbol: (data.symbol || '').toUpperCase(),
          name: data.name || 'Unknown Token',
          decimals: data.detail_platforms?.[platform]?.decimal_place || 18,
          price: data.market_data?.current_price?.usd || 0,
        };
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.warn(`CoinGecko error for ${contractAddress}: ${errorMsg}`);
    }
  }

  // Fallback: Try to fetch on-chain metadata
  try {
    const viemChain = VIEM_CHAINS[chain];
    const publicClient = createPublicClient({
      chain: viemChain,
      transport: http(),
    });

    const [symbol, name, decimals] = await Promise.all([
      publicClient.readContract({
        address: contractAddress as `0x${string}`,
        abi: ERC20_METADATA_ABI,
        functionName: 'symbol',
      }),
      publicClient.readContract({
        address: contractAddress as `0x${string}`,
        abi: ERC20_METADATA_ABI,
        functionName: 'name',
      }),
      publicClient.readContract({
        address: contractAddress as `0x${string}`,
        abi: ERC20_METADATA_ABI,
        functionName: 'decimals',
      }),
    ]);

    return {
      symbol: (symbol || 'UNKNOWN').toUpperCase(),
      name: name || 'Unknown Token',
      decimals: decimals || 18,
      price: 0, // No price data available
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.warn(`Failed to fetch on-chain metadata for ${contractAddress}: ${errorMsg}`);
  }

  return null;
}

// Fetch token balances for a specific chain
async function fetchChainBalances(address: string, chain: ChainNetwork): Promise<TokenBalance[]> {
  const chainConfig = CHAIN_CONFIGS[chain];
  const rpcUrlKey = chainConfig.rpcUrl;
  const rpcUrl = process.env[rpcUrlKey] as string | undefined;
  
  if (!rpcUrl) {
    logger.warn(`${chainConfig.rpcUrl} not configured, skipping ${chain}`);
    return [];
  }

  try {
    // Fetch ERC20 token balances from Alchemy
    const tokensResponse = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'alchemy_getTokenBalances',
        params: [address],
      }),
    });

    if (!tokensResponse.ok) {
      logger.warn(`${chain} chain returned ${tokensResponse.status}`);
      return [];
    }

    const tokensJson = await tokensResponse.json();
    
    if (tokensJson.error) {
      logger.warn(`${chain} RPC error:`, tokensJson.error);
      return [];
    }

    const tokenBalances = tokensJson?.result?.tokenBalances || [];

    // Fetch native token balance
    const nativeResponse = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'eth_getBalance',
        params: [address, 'latest'],
      }),
    });
    const nativeJson = await nativeResponse.json();
    const nativeBalance = BigInt(nativeJson.result || '0');

    const balances: TokenBalance[] = [];

    // Add native token balance if > 0
    if (nativeBalance > 0n) {
      const amount = Number(formatUnits(nativeBalance, 18));
      
      // Get native token price
      let price = 0;
      try {
        const apiKey = process.env.COINGECKO_API_KEY;
        const priceResponse = await fetch(
          `https://pro-api.coingecko.com/api/v3/simple/price?ids=${chainConfig.nativeToken.coingeckoId}&vs_currencies=usd`,
          {
            headers: apiKey ? { 'x-cg-pro-api-key': apiKey } : {},
          }
        );
        const priceData = await priceResponse.json();
        price = priceData[chainConfig.nativeToken.coingeckoId]?.usd || 0;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        logger.error(`Failed to fetch ${chainConfig.nativeToken.symbol} price: ${errorMsg}`);
      }

      balances.push({
        symbol: chainConfig.nativeToken.symbol,
        name: chainConfig.nativeToken.name,
        balance: amount.toFixed(6),
        usdValue: amount * price,
        chain,
        decimals: 18,
      });
    }

    // Process ERC20 tokens
    for (const { contractAddress, tokenBalance } of tokenBalances) {
      try {
        // Skip tokens with 0 balance
        if (BigInt(tokenBalance) === 0n) continue;

        const info = await getTokenInfo(contractAddress, chain);
        if (info) {
          const amount = Number(formatUnits(BigInt(tokenBalance), info.decimals));
          const usdValue = amount * info.price;

          balances.push({
            symbol: info.symbol,
            name: info.name,
            balance: amount.toFixed(6),
            usdValue,
            contractAddress,
            chain,
            decimals: info.decimals,
          });
        }
      } catch (err) {
        logger.warn(`Skipping token ${contractAddress} on ${chain}:`, err instanceof Error ? err.message : String(err));
      }
    }

    return balances;
  } catch (err: any) {
    logger.error(`Failed to fetch balances for ${chain}:`, err);
    return [];
  }
}

export const cdpWalletInfo: Action = {
  name: "WALLET_INFO",
  similes: [
    "WALLET_DETAILS",
    "ADDRESS",
    "COINBASE_WALLET_INFO",
    "WALLET_BALANCE",
    "CHECK_BALANCE",
    "SHOW_TOKENS",
    "LIST_TOKENS",
    "MY_WALLET",
    "WALLET_ASSETS",
    "PORTFOLIO_BALANCE"
  ],
  description: "Use this action when the user wants to check their wallet balance, see their tokens, view wallet address, or get any wallet-related information. This will show the complete wallet portfolio including total balance and all tokens across different chains (Base, Ethereum, Polygon).",
  validate: async (_runtime: IAgentRuntime, message: Memory) => {
    try {
      const cdpService = _runtime.getService(
        CdpService.serviceType,
      ) as CdpService;

      if (!cdpService) {
        logger.warn("CDP service not available for wallet info");
        return false;
      }

      return true;
    } catch (error) {
      logger.error(
        "Error validating wallet info action:",
        error instanceof Error ? error.message : String(error),
      );
      return false;
    }
  },
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state?: State,
    _options?: any,
    callback?: HandlerCallback,
  ): Promise<ActionResult> => {
    const wallet = await getEntityWallet(
      runtime,
      message,
      "WALLET_INFO",
      callback,
    );

    if (wallet.success === false) {
      return wallet.result;
    }

    const address = wallet.walletAddress;

    try {
      callback?.({ text: "🔍 Fetching your wallet information across all chains..." });

      // Fetch balances from all chains in parallel
      const chains: ChainNetwork[] = ['base', 'ethereum', 'polygon'];
      const allBalancesArrays = await Promise.all(
        chains.map(chain => fetchChainBalances(address, chain))
      );
      
      // Flatten and combine all balances
      const allBalances = allBalancesArrays.flat();
      
      // Calculate total portfolio value
      const totalUsdValue = allBalances.reduce((sum, token) => sum + token.usdValue, 0);
      
      // Sort by USD value descending
      allBalances.sort((a, b) => b.usdValue - a.usdValue);

      // Group by chain for better readability
      const byChain: Record<string, TokenBalance[]> = {};
      allBalances.forEach(token => {
        if (!byChain[token.chain]) byChain[token.chain] = [];
        byChain[token.chain].push(token);
      });

      // Format the response
      let text = `💼 **Wallet Portfolio**\n\n`;
      text += `**Address:** \`${address.slice(0, 6)}...${address.slice(-4)}\`\n`;
      text += `**Total Balance:** $${totalUsdValue.toFixed(2)}\n\n`;
      
      if (allBalances.length === 0) {
        text += `No tokens found in your wallet.`;
      } else {
        text += `**Assets (${allBalances.length} tokens):**\n\n`;
        
        for (const [chainName, tokens] of Object.entries(byChain)) {
          text += `**${chainName.toUpperCase()}**\n`;
          tokens.forEach(token => {
            text += `• ${token.balance} ${token.symbol}`;
            if (token.usdValue > 0) {
              text += ` ($${token.usdValue.toFixed(2)})`;
            }
            text += `\n`;
          });
          text += `\n`;
        }
      }

      // Prepare structured data for the response
      const data = {
        actionName: 'WALLET_INFO',
        address,
        totalBalance: totalUsdValue,
        totalBalanceUsd: `$${totalUsdValue.toFixed(2)}`,
        tokenCount: allBalances.length,
        tokens: allBalances.map(token => ({
          symbol: token.symbol,
          name: token.name,
          balance: token.balance,
          usdValue: token.usdValue,
          chain: token.chain,
          contractAddress: token.contractAddress,
        })),
      };
      callback?.({ text, content: data });
      return { text, success: true, data, values: data };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error("Error fetching wallet info:", errorMessage);
      
      const fallbackText = 
        `🏦 CDP Wallet Info\n\n` +
        `Address: \`${address}\`\n\n` +
        `⚠️ Could not fetch detailed balance information. Please try again later.`;
      
      callback?.({ text: fallbackText, content: { address, error: errorMessage } });
      return { 
        text: fallbackText, 
        success: false, 
        data: { address, error: errorMessage } 
      };
    }
  },
  examples: [
    [
      { name: "{{user}}", content: { text: "show my wallet balance" } },
      { name: "{{agent}}", content: { text: "Fetching...", action: "WALLET_INFO" } },
    ],
    [
      { name: "{{user}}", content: { text: "what tokens do I have?" } },
      { name: "{{agent}}", content: { text: "Fetching...", action: "WALLET_INFO" } },
    ],
    [
      { name: "{{user}}", content: { text: "check my wallet" } },
      { name: "{{agent}}", content: { text: "Fetching...", action: "WALLET_INFO" } },
    ],
    [
      { name: "{{user}}", content: { text: "what's my address?" } },
      { name: "{{agent}}", content: { text: "Fetching...", action: "WALLET_INFO" } },
    ],
    [
      { name: "{{user}}", content: { text: "show my portfolio" } },
      { name: "{{agent}}", content: { text: "Fetching...", action: "WALLET_INFO" } },
    ],
  ],
};

export default cdpWalletInfo;
