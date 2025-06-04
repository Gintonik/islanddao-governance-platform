/**
 * Canonical Native VSR Governance Power Calculator
 * Fetches native governance power from Voter accounts using Anchor-compatible layout
 * Processes DepositEntry structs with proper multiplier calculations
 */

import { Connection, PublicKey } from '@solana/web3.js';
import 'dotenv/config';

const connection = new Connection(process.env.HELIUS_RPC_URL, "confirmed");
const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');

// Verified wallet list from previous scan
const VERIFIED_WALLETS = [
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
 * Parse DepositEntry using Anchor-compatible layout
 */
function parseDepositEntry(data, entryOffset, entryIndex) {
  try {
    // offset +0: isUsed (bool)
    const isUsed = data[entryOffset] === 1;
    if (!isUsed) {
      return { status: 'unused', entryIndex };
    }
    
    // offset +8: amountDepositedNative (u64)
    const amountRaw = Number(data.readBigUInt64LE(entryOffset + 8));
    const amount = amountRaw / 1e6; // Convert from micro-ISLAND
    
    if (amount === 0) {
      return { status: 'zero_amount', entryIndex };
    }
    
    // offset +16: lockup startTs (i64)
    const startTs = Number(data.readBigInt64LE(entryOffset + 16));
    
    // offset +24: lockup endTs (i64)
    const endTs = Number(data.readBigInt64LE(entryOffset + 24));
    
    // offset +48: multiplier numerator (u64)
    const multiplierNumerator = Number(data.readBigUInt64LE(entryOffset + 48));
    
    // offset +56: multiplier denominator (u64)
    const multiplierDenominator = Number(data.readBigUInt64LE(entryOffset + 56));
    
    let multiplier = 1.0;
    if (multiplierDenominator > 0) {
      multiplier = multiplierNumerator / multiplierDenominator;
    }
    
    const votingPower = amount * multiplier;
    
    return {
      status: 'valid',
      entryIndex,
      amount,
      multiplier,
      votingPower,
      startTs,
      endTs,
      multiplierNumerator,
      multiplierDenominator
    };
    
  } catch (error) {
    return { status: 'parse_error', entryIndex, error: error.message };
  }
}

/**
 * Calculate native governance power for a wallet from Voter accounts
 */
async function calculateNativeGovernancePower(walletAddress) {
  console.log(`\n🔍 Calculating native governance power for: ${walletAddress}`);
  
  // Find all Voter accounts (2728 bytes) where authority = wallet (offset 8)
  const voterAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
    filters: [
      { dataSize: 2728 },
      { memcmp: { offset: 8, bytes: walletAddress } }
    ]
  });
  
  console.log(`📊 Found ${voterAccounts.length} Voter accounts`);
  
  let totalNativeGovernancePower = 0;
  const allDeposits = [];
  let totalValidDeposits = 0;
  let totalSkippedDeposits = 0;
  
  for (const [accountIndex, { pubkey, account }] of voterAccounts.entries()) {
    console.log(`\n📋 Processing Voter account ${accountIndex + 1}: ${pubkey.toBase58()}`);
    
    const data = account.data;
    let accountValidDeposits = 0;
    let accountSkippedDeposits = 0;
    
    // Parse up to 32 DepositEntry structs starting from offset 72
    for (let i = 0; i < 32; i++) {
      const entryOffset = 72 + (i * 88); // Each DepositEntry is 88 bytes
      
      if (entryOffset + 88 > data.length) break;
      
      const deposit = parseDepositEntry(data, entryOffset, i);
      
      if (deposit.status === 'valid') {
        allDeposits.push(deposit);
        totalNativeGovernancePower += deposit.votingPower;
        accountValidDeposits++;
        totalValidDeposits++;
        
        // Format timestamps for display
        const startDate = deposit.startTs > 0 ? new Date(deposit.startTs * 1000).toISOString().split('T')[0] : 'N/A';
        const endDate = deposit.endTs > 0 ? new Date(deposit.endTs * 1000).toISOString().split('T')[0] : 'N/A';
        
        console.log(`  ✅ [${i}] ${deposit.amount.toLocaleString()} ISLAND × ${deposit.multiplier.toFixed(6)}x = ${deposit.votingPower.toLocaleString()} power`);
        console.log(`       Multiplier: ${deposit.multiplierNumerator}/${deposit.multiplierDenominator}`);
        console.log(`       Lockup: ${startDate} → ${endDate}`);
        
      } else if (deposit.status === 'unused') {
        // Skip logging unused entries to reduce noise
        accountSkippedDeposits++;
        totalSkippedDeposits++;
      } else {
        console.log(`  ⏭️  [${i}] Skipped: ${deposit.status}`);
        accountSkippedDeposits++;
        totalSkippedDeposits++;
      }
    }
    
    console.log(`📈 Account ${accountIndex + 1}: ${accountValidDeposits} valid, ${accountSkippedDeposits} skipped`);
  }
  
  console.log(`\n✅ Total native governance power: ${totalNativeGovernancePower.toLocaleString()} ISLAND`);
  console.log(`📊 Summary: ${totalValidDeposits} valid deposits, ${totalSkippedDeposits} skipped`);
  
  return {
    wallet: walletAddress,
    nativeGovernancePower: totalNativeGovernancePower,
    deposits: allDeposits,
    voterAccountCount: voterAccounts.length,
    validDeposits: totalValidDeposits,
    skippedDeposits: totalSkippedDeposits
  };
}

/**
 * Run canonical native governance power scan
 */
async function runCanonicalNativeGovernanceScan() {
  console.log('🏛️ CANONICAL NATIVE VSR GOVERNANCE POWER CALCULATOR');
  console.log('====================================================');
  console.log(`📊 Scanning ${VERIFIED_WALLETS.length} verified wallet addresses`);
  console.log(`📡 Helius RPC: ${process.env.HELIUS_RPC_URL ? 'Connected' : 'Not configured'}`);
  console.log(`🏛️ VSR Program: ${VSR_PROGRAM_ID.toBase58()}`);
  
  const results = [];
  let totalWalletsWithPower = 0;
  let totalGovernancePower = 0;
  let totalValidDeposits = 0;
  
  for (const [index, walletAddress] of VERIFIED_WALLETS.entries()) {
    console.log(`\n${'='.repeat(100)}`);
    console.log(`[${(index + 1).toString().padStart(2)}/${VERIFIED_WALLETS.length}] Processing wallet: ${walletAddress}`);
    
    try {
      const result = await calculateNativeGovernancePower(walletAddress);
      results.push(result);
      
      if (result.nativeGovernancePower > 0) {
        totalWalletsWithPower++;
        totalGovernancePower += result.nativeGovernancePower;
        totalValidDeposits += result.validDeposits;
      }
      
    } catch (error) {
      console.error(`❌ Error processing ${walletAddress}: ${error.message}`);
      results.push({
        wallet: walletAddress,
        nativeGovernancePower: 0,
        deposits: [],
        voterAccountCount: 0,
        validDeposits: 0,
        skippedDeposits: 0,
        error: error.message
      });
    }
  }
  
  // Summary report
  console.log(`\n\n📊 CANONICAL NATIVE GOVERNANCE SCAN SUMMARY`);
  console.log('============================================');
  console.log(`Total wallets scanned: ${VERIFIED_WALLETS.length}`);
  console.log(`Wallets with native governance power: ${totalWalletsWithPower}`);
  console.log(`Total native governance power: ${totalGovernancePower.toLocaleString()} ISLAND`);
  console.log(`Total valid deposits found: ${totalValidDeposits}`);
  
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
      'No native power';
    const deposits = result.validDeposits > 0 ? ` (${result.validDeposits} deposits)` : '';
    const accounts = result.voterAccountCount > 0 ? ` [${result.voterAccountCount} accounts]` : '';
    const error = result.error ? ` [ERROR: ${result.error}]` : '';
    
    console.log(`${status} ${num}. ${power}${deposits}${accounts}${error}`);
  });
  
  // Benchmark comparison with known values
  const benchmarks = [
    { address: '7pPJt2xoEoPy8x8Hf2D6U6oLfNa5uKmHHRwkENVoaxmA', expected: 8709019.78, name: 'Takisoul' },
    { address: 'GJdRQcsyz49FMM4LvPqpaM2QA3yWFr8WamJ95hkwCBAh', expected: 144708.98, name: 'GJdR' },
    { address: '3PKhzE9wuEkGPHHu2sNCvG86xNtDJduAcyBPXpE6cSNt', expected: 11271548.09, name: '3PKh (from previous scan)' }
  ];
  
  console.log(`\n🎯 BENCHMARK ACCURACY COMPARISON:`);
  console.log('=================================');
  
  let accurateCount = 0;
  for (const benchmark of benchmarks) {
    const result = results.find(r => r.wallet === benchmark.address);
    if (result) {
      const error = result.nativeGovernancePower > 0 ? 
        Math.abs(result.nativeGovernancePower - benchmark.expected) / benchmark.expected * 100 : 100;
      
      const accuracy = error < 5.0 ? 'ACCURATE' : error < 20.0 ? 'CLOSE' : 'FAILED';
      const status = accuracy === 'ACCURATE' ? '✅' : accuracy === 'CLOSE' ? '🟡' : '❌';
      
      console.log(`${status} ${benchmark.name}:`);
      console.log(`   Calculated: ${result.nativeGovernancePower.toLocaleString()} ISLAND`);
      console.log(`   Expected:   ${benchmark.expected.toLocaleString()} ISLAND`);
      console.log(`   Error:      ${error.toFixed(1)}%`);
      
      if (accuracy === 'ACCURATE') accurateCount++;
    } else {
      console.log(`❌ ${benchmark.name}: No result found`);
    }
  }
  
  const benchmarkAccuracy = benchmarks.length > 0 ? (accurateCount / benchmarks.length * 100).toFixed(1) : 0;
  console.log(`\n🏆 Benchmark Accuracy: ${accurateCount}/${benchmarks.length} (${benchmarkAccuracy}%)`);
  
  return results;
}

// Run the canonical native governance scan
runCanonicalNativeGovernanceScan().catch(console.error);