/**
 * Canonical VoterWeightRecord Scanner
 * Computes governance power for each wallet using VoterWeightRecord accounts
 * Derives PDAs using ['voter-weight-record', registrar, realm, wallet] seeds
 */

import { Connection, PublicKey } from '@solana/web3.js';
import fs from 'fs';
import 'dotenv/config';

const connection = new Connection(process.env.HELIUS_RPC_URL, "confirmed");
const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');

// IslandDAO configuration
const REGISTRAR = new PublicKey('F3xgZXtJ19F7Yk6gdZ2muwErg7wdGzbpjNQDD4rqFBLq');
const REALM = new PublicKey('8reJkQsfbAZPNTixFLE2TYvCvULjv3o8VVdANs1YAUai');

const WALLETS = [
  "3PKhzE9wuEkGPHHu2sNCvG86xNtDJduAcyBPXpE6cSNt",
  "GJdRQcsyz49FMM4LvPqpaM2QA3yWFr8WamJ95hkwCBAh",
  "Fywb7YDCXxtD7pNKThJ36CAtVe23dEeEPf7HqKzWEHRo",
  "C9UJ9H2ACqMMJ4xvXBMV9LzKZgHViFNPX5z7mKHKnMKW",
  "8Rh1sy7vKpQhZcbb2cwSKRtQegVE3vnNYrcNAmHZ5WSd",
  "7Jx45L2GhPh8sQ6r4pvJxgRiKVRs5DsQwN9jW9Zj43Mt",
  "CSJKkYqEm9XYrCuL8Fg9DNDGLA2ZkUJDMVLaeUJmGJK5",
  "CEpTX6QuD7qHTwFoQzRfSpRQ8vY94fZ3QQMgbK7YGbZg",
  "FknAoDH1aytzsWPKm6YzZyyEKzZfBNnFAAMydWu3SYAf",
  "8d8Z6GiYooZ1swZRHccA29XTxEQxM98Ty57c6ZQEV2rP",
  "9ZBFwPV7fJrBYTZjvKRXLKDg3CkHik1snMgScXx1aT3G",
  "5oykeWnU3RCGdvWxMBEnZNm6gHpQQfwFcEPBuGeKNXzU",
  "5Ev8dRFe7oD3TYJjDkEERyk3QQzj1sVJ2vWdyTRGPuYz",
  "AJ7p5ChZfdSYD8jXVy69q2n97wDQ6EMHhRha46c2cob5",
  "9G3V1isDhf72fdFP9w6mXo8JBoNWem3LFmKCrpAaSkaB",
  "D1AbzYoXB5oEU3xTPQZBPAqLhRj2o7sJDVJzz1gNKR3p",
  "EXrzoTvmUutMB5B25qtbyWcymViKmMdwLMQv9kGJ4iQs",
  "91kMo3JQrgkXZFVbkV8Jr3s8MRfFtLbMfXj6eT2gRCCn",
  "BszUnfNqyeKvKRRbyXPoaV46Zfncv6vF1YeyxYuDJf3f",
  "ChP3bm9yqjPtxS4Bz3xEkSbMbpZpUTKVEjc5a37pM8jU"
];

/**
 * Derive VoterWeightRecord PDA for a wallet
 */
function deriveVoterWeightRecordPDA(walletPubkey) {
  const seeds = [
    Buffer.from('voter-weight-record'),
    REGISTRAR.toBuffer(),
    REALM.toBuffer(),
    walletPubkey.toBuffer()
  ];
  
  const [pda] = PublicKey.findProgramAddressSync(seeds, VSR_PROGRAM_ID);
  return pda;
}

/**
 * Fetch governance power for a single wallet using verified approach
 */
async function fetchWalletGovernancePower(walletAddress, verbose = false) {
  try {
    if (verbose) {
      console.log(`🔍 ${walletAddress}`);
    }
    
    // Use the verified approach: search 176-byte VSR accounts with wallet at offset 72
    const voterWeightRecords = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
      filters: [
        { dataSize: 176 },
        { memcmp: { offset: 72, bytes: walletAddress } }
      ]
    });
    
    if (voterWeightRecords.length === 0) {
      if (verbose) {
        console.log(`   ⏭️  No VoterWeightRecord found`);
      }
      return {
        wallet: walletAddress,
        governancePower: 0,
        source: "No VoterWeightRecord found",
        vwrPDA: null
      };
    }
    
    let totalGovernancePower = 0;
    const sources = [];
    
    for (const { pubkey, account } of voterWeightRecords) {
      const data = account.data;
      
      // Read governance power from offset 104
      const powerRaw = Number(data.readBigUInt64LE(104));
      const power = powerRaw / 1e6;
      
      if (power > 0) {
        totalGovernancePower += power;
        sources.push({
          account: pubkey.toBase58(),
          power: power
        });
        
        if (verbose) {
          console.log(`   ✅ ${power.toLocaleString()} ISLAND from ${pubkey.toBase58()}`);
        }
      }
    }
    
    return {
      wallet: walletAddress,
      governancePower: totalGovernancePower,
      source: totalGovernancePower > 0 ? "VoterWeightRecord" : "No governance power found",
      sources: sources,
      accountCount: voterWeightRecords.length
    };
    
  } catch (error) {
    if (verbose) {
      console.log(`   ❌ Error: ${error.message}`);
    }
    return {
      wallet: walletAddress,
      governancePower: 0,
      source: `Error: ${error.message}`,
      sources: []
    };
  }
}

/**
 * Run canonical VoterWeightRecord scan for all wallets
 */
async function runCanonicalVWRScan(verbose = false) {
  console.log('🏛️ CANONICAL VOTERWEIGHTRECORD GOVERNANCE SCANNER');
  console.log('=================================================');
  console.log(`📊 Scanning ${WALLETS.length} wallets`);
  console.log(`📡 Helius RPC: ${process.env.HELIUS_RPC_URL ? 'Connected' : 'Not configured'}`);
  console.log(`🏛️ VSR Program: ${VSR_PROGRAM_ID.toBase58()}`);
  console.log(`📋 Registrar: ${REGISTRAR.toBase58()}`);
  console.log(`🏛️ Realm: ${REALM.toBase58()}`);
  
  if (verbose) {
    console.log('\n🔍 Processing wallets:');
  }
  
  const results = [];
  let walletsWithPower = 0;
  let totalGovernancePower = 0;
  
  for (const [index, walletAddress] of WALLETS.entries()) {
    if (!verbose) {
      process.stdout.write(`\r[${(index + 1).toString().padStart(2)}/${WALLETS.length}] Processing...`);
    }
    
    const result = await fetchWalletGovernancePower(walletAddress, verbose);
    results.push(result);
    
    if (result.governancePower > 0) {
      walletsWithPower++;
      totalGovernancePower += result.governancePower;
    }
  }
  
  if (!verbose) {
    console.log(`\r✅ Completed scanning ${WALLETS.length} wallets`);
  }
  
  // Summary
  console.log(`\n📊 SCAN RESULTS SUMMARY`);
  console.log('======================');
  console.log(`Total wallets scanned: ${WALLETS.length}`);
  console.log(`Wallets with governance power: ${walletsWithPower}`);
  console.log(`Total governance power: ${totalGovernancePower.toLocaleString()} ISLAND`);
  
  if (walletsWithPower > 0) {
    console.log(`Average power per active wallet: ${(totalGovernancePower / walletsWithPower).toLocaleString()} ISLAND`);
  }
  
  // Detailed results
  console.log(`\n📋 DETAILED RESULTS:`);
  console.log('===================');
  
  results
    .sort((a, b) => b.governancePower - a.governancePower)
    .forEach((result, index) => {
      const rank = (index + 1).toString().padStart(2);
      const status = result.governancePower > 0 ? '✅' : '⏭️ ';
      const power = result.governancePower > 0 ? 
        `${result.governancePower.toLocaleString()} ISLAND` : 
        'No power';
      const source = result.source;
      
      console.log(`${status} ${rank}. ${power} (${source})`);
      console.log(`      ${result.wallet}`);
      
      if (verbose && result.vwrPDA) {
        console.log(`      VWR PDA: ${result.vwrPDA}`);
      }
    });
  
  // Save results to JSON file
  const timestamp = new Date().toISOString().split('T')[0];
  const filename = `vwr-governance-scan-${timestamp}.json`;
  
  const outputData = {
    scanDate: new Date().toISOString(),
    summary: {
      totalWallets: WALLETS.length,
      walletsWithPower: walletsWithPower,
      totalGovernancePower: totalGovernancePower,
      averagePowerPerActiveWallet: walletsWithPower > 0 ? totalGovernancePower / walletsWithPower : 0
    },
    configuration: {
      vsrProgram: VSR_PROGRAM_ID.toBase58(),
      registrar: REGISTRAR.toBase58(),
      realm: REALM.toBase58(),
      rpcEndpoint: process.env.HELIUS_RPC_URL ? 'Configured' : 'Not configured'
    },
    results: results
  };
  
  fs.writeFileSync(filename, JSON.stringify(outputData, null, 2));
  console.log(`\n💾 Results saved to: ${filename}`);
  
  // Benchmark comparison if applicable
  const knownBenchmarks = [
    { wallet: 'GJdRQcsyz49FMM4LvPqpaM2QA3yWFr8WamJ95hkwCBAh', expected: 144708.98, name: 'GJdR' },
    { wallet: '3PKhzE9wuEkGPHHu2sNCvG86xNtDJduAcyBPXpE6cSNt', expected: 11271548.09, name: '3PKh' }
  ];
  
  const benchmarkResults = knownBenchmarks
    .map(benchmark => {
      const result = results.find(r => r.wallet === benchmark.wallet);
      if (result) {
        const error = result.governancePower > 0 ? 
          Math.abs(result.governancePower - benchmark.expected) / benchmark.expected * 100 : 100;
        return { ...benchmark, calculated: result.governancePower, error };
      }
      return null;
    })
    .filter(Boolean);
  
  if (benchmarkResults.length > 0) {
    console.log(`\n🎯 BENCHMARK VALIDATION:`);
    console.log('========================');
    
    let accurateCount = 0;
    for (const benchmark of benchmarkResults) {
      const accuracy = benchmark.error < 5.0 ? 'ACCURATE' : 'FAILED';
      const status = accuracy === 'ACCURATE' ? '✅' : '❌';
      
      console.log(`${status} ${benchmark.name}: ${benchmark.calculated.toLocaleString()} vs ${benchmark.expected.toLocaleString()} (${benchmark.error.toFixed(1)}% error)`);
      
      if (accuracy === 'ACCURATE') accurateCount++;
    }
    
    const benchmarkAccuracy = (accurateCount / benchmarkResults.length * 100).toFixed(1);
    console.log(`\n🏆 Benchmark Accuracy: ${accurateCount}/${benchmarkResults.length} (${benchmarkAccuracy}%)`);
  }
  
  return results;
}

// Parse CLI arguments
const args = process.argv.slice(2);
const verbose = args.includes('--verbose') || args.includes('-v');

// Run the scan
runCanonicalVWRScan(verbose).catch(console.error);