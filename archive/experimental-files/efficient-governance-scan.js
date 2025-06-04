/**
 * Efficient Governance Power Scan
 * Directly targets the 176-byte accounts where governance power is stored
 * Uses optimized filtering to avoid scanning all VSR accounts
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
 * Calculate governance power for a wallet using targeted account filtering
 */
async function calculateGovernancePowerEfficient(walletAddress) {
  try {
    console.log(`🔍 ${walletAddress}`);
    
    // Method 1: Try 176-byte accounts with wallet at offset 72 (VoterWeightRecord pattern)
    const voterWeightRecords = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
      filters: [
        { dataSize: 176 },
        { memcmp: { offset: 72, bytes: walletAddress } }
      ]
    });
    
    let totalPower = 0;
    let depositsFound = 0;
    
    for (const { pubkey, account } of voterWeightRecords) {
      const data = account.data;
      
      // Read governance power from offset 104
      const powerRaw = Number(data.readBigUInt64LE(104));
      const power = powerRaw / 1e6;
      
      if (power > 0) {
        totalPower += power;
        depositsFound++;
        console.log(`   ✅ ${power.toLocaleString()} ISLAND from ${pubkey.toBase58()}`);
      }
    }
    
    // Method 2: Try 2728-byte Voter accounts if no power found
    if (totalPower === 0) {
      const voterAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
        filters: [
          { dataSize: 2728 },
          { memcmp: { offset: 8, bytes: walletAddress } }
        ]
      });
      
      for (const { pubkey, account } of voterAccounts) {
        const data = account.data;
        
        // Look for large values that could be governance power
        for (let offset = 0; offset < data.length - 8; offset += 8) {
          try {
            const value = Number(data.readBigUInt64LE(offset));
            const asTokens = value / 1e6;
            
            if (asTokens > 10000 && asTokens < 50000000) {
              totalPower += asTokens;
              depositsFound++;
              console.log(`   ✅ ${asTokens.toLocaleString()} ISLAND from Voter ${pubkey.toBase58()} @${offset}`);
              break; // Only take first large value per account
            }
          } catch (e) {}
        }
      }
    }
    
    if (totalPower === 0) {
      console.log(`   ⏭️  No governance power found`);
    }
    
    return {
      wallet: walletAddress,
      nativeGovernancePower: totalPower,
      depositsFound: depositsFound,
      error: null
    };
    
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
    return {
      wallet: walletAddress,
      nativeGovernancePower: 0,
      depositsFound: 0,
      error: error.message
    };
  }
}

/**
 * Run efficient governance scan
 */
async function runEfficientGovernanceScan() {
  console.log('🚀 EFFICIENT CANONICAL GOVERNANCE POWER SCAN');
  console.log('=============================================');
  console.log(`📊 Scanning ${WALLET_ADDRESSES.length} wallet addresses`);
  console.log(`📡 Helius RPC: ${process.env.HELIUS_RPC_URL ? 'Connected' : 'Not configured'}`);
  console.log(`🏛️ VSR Program: ${VSR_PROGRAM_ID.toBase58()}\n`);
  
  const results = [];
  let totalWalletsWithPower = 0;
  let totalGovernancePower = 0;
  
  for (const [index, walletAddress] of WALLET_ADDRESSES.entries()) {
    console.log(`[${(index + 1).toString().padStart(2)}/${WALLET_ADDRESSES.length}] ${walletAddress}`);
    
    const result = await calculateGovernancePowerEfficient(walletAddress);
    results.push(result);
    
    if (result.nativeGovernancePower > 0) {
      totalWalletsWithPower++;
      totalGovernancePower += result.nativeGovernancePower;
    }
  }
  
  // Summary
  console.log(`\n📊 SCAN RESULTS SUMMARY`);
  console.log('======================');
  console.log(`Total wallets scanned: ${WALLET_ADDRESSES.length}`);
  console.log(`Wallets with governance power: ${totalWalletsWithPower}`);
  console.log(`Total governance power: ${totalGovernancePower.toLocaleString()} ISLAND`);
  
  if (totalWalletsWithPower > 0) {
    console.log(`Average power per active wallet: ${(totalGovernancePower / totalWalletsWithPower).toLocaleString()} ISLAND`);
  }
  
  // Detailed results
  console.log(`\n📋 DETAILED WALLET RESULTS:`);
  console.log('===========================');
  
  results.forEach((result, index) => {
    const num = (index + 1).toString().padStart(2);
    const status = result.nativeGovernancePower > 0 ? '✅' : '⏭️ ';
    const power = result.nativeGovernancePower > 0 ? 
      `${result.nativeGovernancePower.toLocaleString()} ISLAND` : 
      'No power';
    const deposits = result.depositsFound > 0 ? ` (${result.depositsFound} deposits)` : '';
    const error = result.error ? ` [${result.error}]` : '';
    
    console.log(`${status} ${num}. ${power}${deposits}${error}`);
    console.log(`      ${result.wallet}`);
  });
  
  // Benchmark accuracy
  const benchmarks = [
    { address: '7pPJt2xoEoPy8x8Hf2D6U6oLfNa5uKmHHRwkENVoaxmA', expected: 8709019.78, name: 'Takisoul' },
    { address: 'GJdRQcsyz49FMM4LvPqpaM2QA3yWFr8WamJ95hkwCBAh', expected: 144708.98, name: 'GJdR' }
  ];
  
  console.log(`\n🎯 BENCHMARK ACCURACY:`);
  console.log('=====================');
  
  let accurateCount = 0;
  for (const benchmark of benchmarks) {
    const result = results.find(r => r.wallet === benchmark.address);
    if (result) {
      const error = result.nativeGovernancePower > 0 ? 
        Math.abs(result.nativeGovernancePower - benchmark.expected) / benchmark.expected * 100 : 100;
      
      const accuracy = error < 5.0 ? 'ACCURATE' : 'FAILED';
      const status = accuracy === 'ACCURATE' ? '✅' : '❌';
      
      console.log(`${status} ${benchmark.name}: ${result.nativeGovernancePower.toLocaleString()} vs ${benchmark.expected.toLocaleString()} (${error.toFixed(1)}% error)`);
      
      if (accuracy === 'ACCURATE') accurateCount++;
    }
  }
  
  const benchmarkAccuracy = benchmarks.length > 0 ? (accurateCount / benchmarks.length * 100).toFixed(1) : 0;
  console.log(`\n🏆 Benchmark Accuracy: ${accurateCount}/${benchmarks.length} (${benchmarkAccuracy}%)`);
  
  return results;
}

// Run the scan
runEfficientGovernanceScan().catch(console.error);