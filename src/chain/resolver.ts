import { createWalletClient, createPublicClient, http, Hex, Address, encodeFunctionData, getFunctionSelector } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { bscTestnet } from 'viem/chains'
import resolverAbi from '../../../Hitcastor_Contracts_Resolver/out/Resolver.sol/Resolver.json' assert { type: 'json' }

const rpc = process.env.RPC_URL!
const pk  = (process.env.ADMIN_PRIVATE_KEY || process.env.PRIVATE_KEY) as Hex
const resolver = process.env.RESOLVER_ADDRESS as Address
const commitFn = (process.env.RESOLVER_COMMIT_FN || 'commitResolve') as string

const account = privateKeyToAccount(pk)
const pc = createPublicClient({ chain: bscTestnet, transport: http(rpc) })
const wc = createWalletClient({ chain: bscTestnet, transport: http(rpc), account })

type CommitArgs = {
  marketId: number
  t0Url: string, t0Sha: `0x${string}`
  t1Url: string, t1Sha: `0x${string}`
  t0Rank: number, t1Rank: number
  outcome: number
}

function assertHex32(x: string, name: string){
  if (!/^0x[0-9a-fA-F]{64}$/.test(x)) throw new Error(`${name} must be 0x + 32 bytes`)
}

export async function commitOnChain(ev: CommitArgs){
  // Guardrails
  if (!ev.t0Url || !ev.t1Url) throw new Error('evidence URLs missing')
  assertHex32(ev.t0Sha, 't0Sha'); assertHex32(ev.t1Sha, 't1Sha')

  const fn = (resolverAbi as any[]).find(x => x.type==='function' && x.name===commitFn)
  if (!fn) throw new Error(`Resolver ABI missing function ${commitFn}`)

  const byName: Record<string, any> = {
    marketId: BigInt(ev.marketId), id: BigInt(ev.marketId), _marketId: BigInt(ev.marketId),
    t0Url: ev.t0Url, t1Url: ev.t1Url,
    t0Sha: ev.t0Sha, t1Sha: ev.t1Sha,
    t0_rank: BigInt(ev.t0Rank), t1_rank: BigInt(ev.t1Rank),
    t0Rank: BigInt(ev.t0Rank), t1Rank: BigInt(ev.t1Rank),
    outcome: BigInt(ev.outcome)
  }
  const args = (fn.inputs||[]).map((i:any)=>{
    const v = byName[i.name]
    if (v===undefined) throw new Error(`Missing arg ${commitFn}::${i.name}`)
    if (i.type.startsWith('uint')||i.type.startsWith('int')) return BigInt(v)
    return v
  })

  // Log selector + calldata for forensic clarity
  const calldata = encodeFunctionData({ abi: resolverAbi as any, functionName: commitFn as any, args })
  const selector = calldata.slice(0,10)
  console.log(`[resolver] committing via ${commitFn} selector=${selector} args=`, args)

  const hash = await wc.writeContract({ address: resolver, abi: resolverAbi as any, functionName: commitFn as any, args })
  await pc.waitForTransactionReceipt({ hash })
  return hash
}

export async function finalizeOnChain(marketId: number){
  const hash = await wc.writeContract({ address: resolver, abi: resolverAbi as any, functionName: 'finalize', args: [BigInt(marketId)] })
  await pc.waitForTransactionReceipt({ hash })
  return hash
}