/**
 * Fresh Canonical Governance Power Scan
 * Scans 20 wallet addresses for native governance power using VSR Voter accounts
 * Uses only authentic on-chain data from Solana mainnet
 */

import { Connection, PublicKey } from '@solana/web3.js';
import 'dotenv/config';

const connection = new Connection(process.env.HELIUS_RPC_URL, "confirmed");
const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');

const WALLET_ADDRESSES = [
  "Fywb7YDCXxtD7pNKThJ36CAtVe23dEeEPf7HqKzjs9SE",
  "GJdRQcsyz49FMM4LvPqpaM2QA3yWFr8WamJ95hkwCBAh",
  "Fgv1yAgxAg9m3X4zPRFajYDPaA3EujjAZeyuTYCQ9AfJ",
  "4pT6a8yyYrPoDWAKW5Xc6f6T1jsFbZVA97sAgxyq1FtK",
  "5xVWFXrMuCwEqS2RTVUg5mrd2fsHKY7azpGuXnR9xG6M",
  "EWBHZK3vA8jN3mXYtwZ9yxV73DFmB2GDApprQ1K1eWcT",
  "XhXE8EJWS4oMaPXUtTxfGmGSHFf5ZTbZNd6rfqr3FD3",
  "A6e3XdvNMGHYMLqZbtaNCHewZcAcJQLXKcGBnYQ4S9Yo",
  "7pPJt2xoEoPy8x8Hf2D6U6oLfNa5uKmHHRwkENVoaxmA",
  "7NN9To5g5MCEmYMJBEU3jY3SopB6e1oU9JYVEBh1G8Ar",
  "3PKhzE9wuEkGPHHu2sNCvG86xNtDJduAcyBPXpE6cSNt",
  "3zJf1XqFoUUNzRzjx6w3QZz7aEo9xNEfqKN2UdGhspLA",
  "B5eCZnStWCh25Vi7DMYZF9yy8r8MyjcKxtvFvdiZxNsD",
  "HhPrJST8p1NZ3DoBuAf1pC6UqkpLsfPeHXP7EBjCFgNK",
  "HgAp2HgZjL7DQE2A1GiEG7iXz9fGDu2Py9VLjScLAdWq",
  "7QZqHLzYMH3iJx7ABgph5TvJopD5HX3pErd3ZWpiUtHF",
  "HYRheghxGfqZ1qN2qEzk6qACSK3cYdkEV1Z9cpWdpR7h",
  "DeS8QoZDX59Eqc3TZhFsmCBN3w7qbYcABcA5yr5j7vn8",
  "2RxX3mDCN1u7YqFZGbKj86AZFwBqESdbRHw3rWx8Rbf2",
  "HR3P7ZykZGQQxBzR2WZcdLCHT3Kr3xLHVj6ZYAvQMdRQ"
];

/**
 * Calculate governance power for a single wallet using comprehensive VSR account scanning
 */
async function calculateWalletGovernancePower(walletAddress) {
  try {
    console.log(`🔍 Scanning governance power for: ${walletAddress}`);
    
    // Get all VSR program accounts to search for governance power
    const allVSRAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID);
    
    let totalGovernancePower = 0;
    let depositsFound = 0;
    const powerSources = [];
    
    // Search for accounts that reference this wallet
    const walletPubkey = new PublicKey(walletAddress);
    const walletBytes = walletPubkey.toBytes();
    
    for (const { pubkey, account } of allVSRAccounts) {
      const data = account.data;
      
      // Check if this account contains a reference to the target wallet
      let hasWalletReference = false;
      for (let i = 0; i <= data.length - 32; i++) {
        if (data.slice(i, i + 32).equals(walletBytes)) {
          hasWalletReference = true;
          break;
        }
      }
      
      if (!hasWalletReference) continue;
      
      // Scan for governance power values in this account
      for (let offset = 0; offset < data.length - 8; offset += 8) {
        try {
          const value = Number(data.readBigUInt64LE(offset));
          const asTokens = value / 1e6; // Convert from micro-ISLAND
          
          // Look for reasonable governance power values (> 1000 ISLAND)
          if (asTokens > 1000 && asTokens < 50000000) {
            // Validate this is likely a governance power value by checking context
            const isLikelyGovernancePower = (
              offset === 104 || // Known offset from previous analysis
              (asTokens > 10000 && account.data.length === 176) || // Large value in 176-byte account
              (asTokens > 100000) // Very large value anywhere
            );
            
            if (isLikelyGovernancePower) {
              totalGovernancePower += asTokens;
              depositsFound++;
              powerSources.push({
                account: pubkey.toBase58(),
                offset: offset,
                power: asTokens
              });
              
              // Only take the first significant value per account to avoid double counting
              break;
            }
          }
        } catch (e) {}
      }
    }
    
    return {
      wallet: walletAddress,
      nativeGovernancePower: totalGovernancePower,
      depositsFound: depositsFound,
      sources: powerSources,
      error: null
    };
    
  } catch (error) {
    console.log(`❌ Error scanning ${walletAddress}: ${error.message}`);
    return {
      wallet: walletAddress,
      nativeGovernancePower: 0,
      depositsFound: 0,
      sources: [],
      error: error.message
    };
  }
}

/**
 * Run fresh governance scan for all wallets
 */
async function runFreshGovernanceScan() {
  console.log('🚀 FRESH CANONICAL GOVERNANCE POWER SCAN');
  console.log('=========================================');
  console.log(`📊 Scanning ${WALLET_ADDRESSES.length} wallet addresses`);
  console.log(`📡 Using Helius RPC: ${process.env.HELIUS_RPC_URL ? 'Connected' : 'Missing'}`);
  console.log(`🏛️ VSR Program: ${VSR_PROGRAM_ID.toBase58()}`);
  
  const results = [];
  let totalWalletsWithPower = 0;
  let totalGovernancePower = 0;
  
  for (const [index, walletAddress] of WALLET_ADDRESSES.entries()) {
    console.log(`\n[${index + 1}/${WALLET_ADDRESSES.length}] Processing: ${walletAddress}`);
    
    const result = await calculateWalletGovernancePower(walletAddress);
    results.push(result);
    
    if (result.nativeGovernancePower > 0) {
      totalWalletsWithPower++;
      totalGovernancePower += result.nativeGovernancePower;
      
      console.log(`✅ Found ${result.nativeGovernancePower.toLocaleString()} ISLAND (${result.depositsFound} deposits)`);
      
      // Show power sources
      for (const source of result.sources) {
        console.log(`   Source: ${source.account} @${source.offset} → ${source.power.toLocaleString()} ISLAND`);
      }
    } else {
      console.log(`⏭️  No governance power found`);
    }
    
    if (result.error) {
      console.log(`⚠️  Error: ${result.error}`);
    }
  }
  
  // Final summary
  console.log(`\n\n📊 FRESH GOVERNANCE SCAN SUMMARY`);
  console.log('================================');
  console.log(`Total wallets scanned: ${WALLET_ADDRESSES.length}`);
  console.log(`Wallets with governance power: ${totalWalletsWithPower}`);
  console.log(`Total governance power found: ${totalGovernancePower.toLocaleString()} ISLAND`);
  console.log(`Average power per active wallet: ${totalWalletsWithPower > 0 ? (totalGovernancePower / totalWalletsWithPower).toLocaleString() : 0} ISLAND`);
  
  // Detailed results table
  console.log(`\n📋 DETAILED RESULTS:`);
  console.log('===================');
  
  results.forEach((result, index) => {
    const status = result.nativeGovernancePower > 0 ? '✅' : '⏭️ ';
    const powerText = result.nativeGovernancePower > 0 ? 
      `${result.nativeGovernancePower.toLocaleString()} ISLAND` : 
      'No power';
    const depositsText = result.depositsFound > 0 ? ` (${result.depositsFound} deposits)` : '';
    const errorText = result.error ? ` [ERROR: ${result.error}]` : '';
    
    console.log(`${status} ${index + 1}. ${result.wallet}: ${powerText}${depositsText}${errorText}`);
  });
  
  // Check against known benchmarks
  const knownBenchmarks = [
    { address: '7pPJt2xoEoPy8x8Hf2D6U6oLfNa5uKmHHRwkENVoaxmA', expected: 8709019.78, name: 'Takisoul' },
    { address: 'GJdRQcsyz49FMM4LvPqpaM2QA3yWFr8WamJ95hkwCBAh', expected: 144708.98, name: 'GJdR' }
  ];
  
  console.log(`\n🎯 BENCHMARK ACCURACY CHECK:`);
  console.log('============================');
  
  let benchmarkMatches = 0;
  for (const benchmark of knownBenchmarks) {
    const result = results.find(r => r.wallet === benchmark.address);
    if (result) {
      const errorPercent = result.nativeGovernancePower > 0 ? 
        Math.abs(result.nativeGovernancePower - benchmark.expected) / benchmark.expected * 100 : 100;
      
      const accuracy = errorPercent < 5.0 ? 'ACCURATE' : 'FAILED';
      const status = accuracy === 'ACCURATE' ? '✅' : '❌';
      
      console.log(`${status} ${benchmark.name}: ${result.nativeGovernancePower.toLocaleString()} / ${benchmark.expected.toLocaleString()} (${errorPercent.toFixed(1)}% error)`);
      
      if (accuracy === 'ACCURATE') {
        benchmarkMatches++;
      }
    }
  }
  
  const benchmarkAccuracy = knownBenchmarks.length > 0 ? 
    (benchmarkMatches / knownBenchmarks.length * 100).toFixed(1) : 0;
  
  console.log(`\n🏆 Benchmark accuracy: ${benchmarkMatches}/${knownBenchmarks.length} (${benchmarkAccuracy}%)`);
  
  return results;
}

// Run the fresh governance scan
runFreshGovernanceScan().catch(console.error);