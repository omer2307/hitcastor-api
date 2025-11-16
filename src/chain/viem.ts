import { createPublicClient, createWalletClient, http, parseAbi, encodePacked, keccak256, parseEther, formatEther } from 'viem'
import { bscTestnet } from 'viem/chains'
import { privateKeyToAccount } from 'viem/accounts'
import { env } from '../env.js'
import { resolverAbi, factoryAbi, ammAbi, erc20Abi } from './abis.js'

export const publicClient = createPublicClient({
  chain: bscTestnet,
  transport: http(env.RPC_URL),
})

export const walletClient = createWalletClient({
  chain: bscTestnet,
  transport: http(env.RPC_URL),
  account: env.PRIVATE_KEY ? privateKeyToAccount(env.PRIVATE_KEY as `0x${string}`) : undefined,
})

export interface Evidence {
  csvUrl: string
  csvSha256: string
  jsonUrl: string
  jsonSha256: string
  ipfsCid: string
}

export interface MarketReserves {
  reserveYes: bigint
  reserveNo: bigint
  reserveQuote: bigint
  priceYes: number
  priceNo: number
  poolUSD: number
}

export async function getDisputeWindow(): Promise<number> {
  const result = await publicClient.readContract({
    address: env.RESOLVER_ADDRESS as `0x${string}`,
    abi: resolverAbi,
    functionName: 'disputeWindow',
  })
  return Number(result)
}

export async function readMarketReserves(ammAddress: string): Promise<MarketReserves> {
  const [reserves, quoteVault] = await publicClient.multicall({
    contracts: [
      {
        address: ammAddress as `0x${string}`,
        abi: ammAbi,
        functionName: 'reserves',
      },
      {
        address: ammAddress as `0x${string}`,
        abi: ammAbi,
        functionName: 'quoteVault',
      },
    ],
  })

  if (reserves.status === 'failure') {
    throw new Error(`Failed to read reserves: ${reserves.error}`)
  }

  if (quoteVault.status === 'failure') {
    throw new Error(`Failed to read quote vault: ${quoteVault.error}`)
  }

  const [reserveYes, reserveNo] = reserves.result
  const reserveQuote = quoteVault.result

  // Calculate prices (YES token per quote token)
  const totalReserve = reserveYes + reserveNo
  const priceYes = totalReserve > 0n ? Number(reserveYes) / Number(totalReserve) : 0.5
  const priceNo = 1 - priceYes

  // Estimate pool USD value (assuming quote token is approximately $1)
  const poolUSD = Number(formatEther(reserveQuote))

  return {
    reserveYes,
    reserveNo,
    reserveQuote,
    priceYes,
    priceNo,
    poolUSD,
  }
}

export async function sendCommitResolve(
  marketId: bigint,
  commitment: string,
  evidence: Evidence
): Promise<string> {
  if (!walletClient.account) {
    throw new Error('No wallet account configured')
  }

  const hash = await walletClient.writeContract({
    address: env.RESOLVER_ADDRESS as `0x${string}`,
    abi: resolverAbi,
    functionName: 'commitResolve',
    args: [
      marketId,
      commitment as `0x${string}`,
      {
        csvUrl: evidence.csvUrl,
        csvSha256: evidence.csvSha256 as `0x${string}`,
        jsonUrl: evidence.jsonUrl,
        jsonSha256: evidence.jsonSha256 as `0x${string}`,
        ipfsCid: evidence.ipfsCid,
      },
    ],
  })

  return hash
}

export async function sendFinalizeResolve(
  marketId: bigint,
  outcome: number,
  t0Rank: number,
  t1Rank: number,
  t0Evidence: Evidence,
  t1Evidence: Evidence,
  nonce: bigint
): Promise<string> {
  if (!walletClient.account) {
    throw new Error('No wallet account configured')
  }

  const hash = await walletClient.writeContract({
    address: env.RESOLVER_ADDRESS as `0x${string}`,
    abi: resolverAbi,
    functionName: 'finalizeResolve',
    args: [
      marketId,
      outcome,
      t0Rank,
      t1Rank,
      {
        csvUrl: t0Evidence.csvUrl,
        csvSha256: t0Evidence.csvSha256 as `0x${string}`,
        jsonUrl: t0Evidence.jsonUrl,
        jsonSha256: t0Evidence.jsonSha256 as `0x${string}`,
        ipfsCid: t0Evidence.ipfsCid,
      },
      {
        csvUrl: t1Evidence.csvUrl,
        csvSha256: t1Evidence.csvSha256 as `0x${string}`,
        jsonUrl: t1Evidence.jsonUrl,
        jsonSha256: t1Evidence.jsonSha256 as `0x${string}`,
        ipfsCid: t1Evidence.ipfsCid,
      },
      nonce,
    ],
  })

  return hash
}

export function computeCommitment(
  marketId: bigint,
  t0Rank: number,
  t1Rank: number,
  outcome: number,
  t0Evidence: Evidence,
  t1Evidence: Evidence,
  nonce: bigint = 0n
): string {
  // Pack all parameters according to the resolver contract commitment scheme
  const packed = encodePacked(
    ['uint256', 'uint16', 'uint16', 'uint8', 'string', 'bytes32', 'string', 'bytes32', 'string', 'string', 'bytes32', 'string', 'bytes32', 'string', 'uint256'],
    [
      marketId,
      t0Rank,
      t1Rank,
      outcome,
      t0Evidence.csvUrl,
      t0Evidence.csvSha256 as `0x${string}`,
      t0Evidence.jsonUrl,
      t0Evidence.jsonSha256 as `0x${string}`,
      t0Evidence.ipfsCid,
      t1Evidence.csvUrl,
      t1Evidence.csvSha256 as `0x${string}`,
      t1Evidence.jsonUrl,
      t1Evidence.jsonSha256 as `0x${string}`,
      t1Evidence.ipfsCid,
      nonce,
    ]
  )

  return keccak256(packed)
}

export async function getChainInfo() {
  const chainId = await publicClient.getChainId()
  return {
    chainId,
    resolver: env.RESOLVER_ADDRESS,
    factory: env.FACTORY_ADDRESS,
    treasury: env.TREASURY_ADDRESS,
  }
}