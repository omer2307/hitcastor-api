// Resolver ABI - commit-reveal scheme for market resolution
export const resolverAbi = [
  {
    type: 'function',
    name: 'commitResolve',
    inputs: [
      { name: 'marketId', type: 'uint256' },
      { name: 'commitment', type: 'bytes32' },
      { name: 'evidence', type: 'tuple', components: [
        { name: 'csvUrl', type: 'string' },
        { name: 'csvSha256', type: 'bytes32' },
        { name: 'jsonUrl', type: 'string' },
        { name: 'jsonSha256', type: 'bytes32' },
        { name: 'ipfsCid', type: 'string' }
      ]}
    ],
    outputs: [],
    stateMutability: 'nonpayable'
  },
  {
    type: 'function',
    name: 'finalizeResolve',
    inputs: [
      { name: 'marketId', type: 'uint256' },
      { name: 'outcome', type: 'uint8' },
      { name: 't0Rank', type: 'uint16' },
      { name: 't1Rank', type: 'uint16' },
      { name: 't0Evidence', type: 'tuple', components: [
        { name: 'csvUrl', type: 'string' },
        { name: 'csvSha256', type: 'bytes32' },
        { name: 'jsonUrl', type: 'string' },
        { name: 'jsonSha256', type: 'bytes32' },
        { name: 'ipfsCid', type: 'string' }
      ]},
      { name: 't1Evidence', type: 'tuple', components: [
        { name: 'csvUrl', type: 'string' },
        { name: 'csvSha256', type: 'bytes32' },
        { name: 'jsonUrl', type: 'string' },
        { name: 'jsonSha256', type: 'bytes32' },
        { name: 'ipfsCid', type: 'string' }
      ]},
      { name: 'nonce', type: 'uint256' }
    ],
    outputs: [],
    stateMutability: 'nonpayable'
  },
  {
    type: 'function',
    name: 'disputeWindow',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view'
  },
  {
    type: 'event',
    name: 'ResolutionCommitted',
    inputs: [
      { name: 'marketId', type: 'uint256', indexed: true },
      { name: 'commitment', type: 'bytes32', indexed: false },
      { name: 'disputeUntil', type: 'uint256', indexed: false }
    ]
  },
  {
    type: 'event',
    name: 'Resolved',
    inputs: [
      { name: 'marketId', type: 'uint256', indexed: true },
      { name: 'outcome', type: 'uint8', indexed: false },
      { name: 't0Rank', type: 'uint16', indexed: false },
      { name: 't1Rank', type: 'uint16', indexed: false }
    ]
  }
] as const

// Factory ABI - for reading market data
export const factoryAbi = [
  {
    type: 'function',
    name: 'getMarket',
    inputs: [{ name: 'marketId', type: 'uint256' }],
    outputs: [
      { name: 'amm', type: 'address' },
      { name: 'yesToken', type: 'address' },
      { name: 'noToken', type: 'address' },
      { name: 'songId', type: 'uint256' },
      { name: 't0Rank', type: 'uint16' },
      { name: 'cutoff', type: 'uint256' },
      { name: 'status', type: 'uint8' }
    ],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 'getMarketCount',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view'
  }
] as const

// AMM ABI - for reading reserves and prices  
export const ammAbi = [
  {
    type: 'function',
    name: 'reserves',
    inputs: [],
    outputs: [
      { name: 'yes', type: 'uint256' },
      { name: 'no', type: 'uint256' }
    ],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 'quoteVault',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 'quoteYesOut',
    inputs: [{ name: 'quoteIn', type: 'uint256' }],
    outputs: [
      { name: 'yesOut', type: 'uint256' },
      { name: 'priceAfter', type: 'uint256' }
    ],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 'quoteNoOut', 
    inputs: [{ name: 'quoteIn', type: 'uint256' }],
    outputs: [
      { name: 'noOut', type: 'uint256' },
      { name: 'priceAfter', type: 'uint256' }
    ],
    stateMutability: 'view'
  }
] as const

// ERC20 ABI - for token info
export const erc20Abi = [
  {
    type: 'function',
    name: 'name',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 'symbol',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 'decimals',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 'totalSupply',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 'balanceOf',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view'
  }
] as const