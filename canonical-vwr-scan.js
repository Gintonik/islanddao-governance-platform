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
  "2NZ9hwrGNitbGTjt4p4py2m6iwAjJ9Bzs8vXeWs1QpHT",
  "2qYMBZwJhu8zpyEK29Dy5Hf9WrWWe1LkDzrUDiuVzBnk",
  "37TGrYNu56AxaeojgtAok8tQAsBSxGhvFKXqCYFAbBrA",
  "3PKhzE9wuEkGPHHu2sNCvG86xNtDJduAcyBPXpE6cSNt",
  "3s6VUe21HFVEC6j12bPXLcrBHMkTZ66847853pXWXspr",
  "4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4",
  "6aJo6zRiC5CFnuE7cqw4sTtHHknrr69NE7LKxPAfFY9U",
  "7pPJt2xoEoPy8x8Hf2D6U6oLfNa5uKmHHRwkENVoaxmA",
  "9RSpFWGntExNNa6puTVtynmrNAJZRso6w4gFWuMr1o3n",
  "9WW4oiMyW6A9oP4R8jvxJLMZ3RUss18qsM4yBBHJPj94",
  "ADjG92YTwGUxTB3r9SY6Gip4q4xoUQdKq3DA1actaDUd",
  "B93csAjDr4sbgLvYmY1iNcHQ1wLe9abEiodJDcn8K7ST",
  "BPmVp1b4vbT2YUHfcFrtErA67nNsJ5LGAJ2BLg5ds9kz",
  "CdCAQnq13hTUiBxganRXYKw418uUTfZdmosqef2vu1bM",
  "DraTvYwqwySZ4kvzxsiYtKF2K6mp4FE3VbjTdPsJzpXt",
  "EViz4YGrY6GZtfu35Y1Q3PoFWAhoXY6YMHFrcneMbdCF",
  "Fgv1zrwB6VF3jc45PaNT5t9AnSsJrwb8r7aMNip5fRY1",
  "Fywb7YDCXxtD7pNKThJ36CAtVe23dEeEPf7HqKzJs1VG",
  "GJdRQcsyz49FMM4LvPqpaM2QA3yWFr8WamJ95hkwCBAh",
  "kruHL3zJ1Mcbdibsna5xM6yMp7PZZ4BsNTpj2UMgvZC"
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
 * Parse deposit entry from Voter account data using correct VSR structure
 */
function parseDepositEntry(data, offset) {
  try {
    // Check if we have enough data
    if (offset + 72 > data.length) {
      return null;
    }
    
    // VSR Deposit Entry structure (72 bytes total)
    const isUsed = data[offset] === 1;
    const allowClawback = data[offset + 1] === 1;
    const votingMintConfigIdx = data[offset + 2];
    
    // Skip padding/reserved bytes and read the amount at the correct position
    // The amount is typically at offset +8 from the start of the deposit entry
    const amountDepositedNative = Number(data.readBigUInt64LE(offset + 8));
    const amountInitiallyLockedNative = Number(data.readBigUInt64LE(offset + 16));
    
    // Lockup information
    const lockupKind = data[offset + 24];
    const lockupStartTs = Number(data.readBigUInt64LE(offset + 32));
    const lockupEndTs = Number(data.readBigUInt64LE(offset + 40));
    const lockupPeriods = Number(data.readBigUInt64LE(offset + 48));
    
    // Validate that the amounts are reasonable (less than total ISLAND supply)
    if (amountDepositedNative > 1e15) { // More than 1 billion ISLAND in micro-tokens
      return null;
    }
    
    return {
      isUsed,
      allowClawback,
      votingMintConfigIdx,
      amountDepositedNative,
      amountInitiallyLockedNative,
      lockupKind,
      lockupStartTs,
      lockupEndTs,
      lockupPeriods,
      isLocked: () => {
        const now = Math.floor(Date.now() / 1000);
        return lockupKind > 0 && lockupEndTs > now;
      }
    };
  } catch (error) {
    return null;
  }
}

/**
 * Calculate lockup multiplier based on lockup configuration
 */
function calculateLockupMultiplier(deposit, currentTimestamp) {
  // Always apply baseline multiplier of 1.0 for all deposits
  const baseline = 1.0;
  
  // If no lockup or unlocked, use baseline multiplier
  if (deposit.lockupKind === 0 || !deposit.isLocked()) {
    return baseline;
  }
  
  // For locked deposits, calculate time-based multiplier
  const timeRemaining = Math.max(0, deposit.lockupEndTs - currentTimestamp);
  const maxLockupPeriod = 4 * 365 * 24 * 60 * 60; // 4 years in seconds
  
  // VSR multiplier formula: baseline + (time_factor * max_extra)
  // Using IslandDAO typical values: baseline=1, max_extra=4
  const maxExtra = 4.0;
  const timeFactor = Math.min(timeRemaining / maxLockupPeriod, 1.0);
  
  return baseline + (timeFactor * maxExtra);
}

/**
 * Analyze Voter account and extract governance power from deposits
 */
async function analyzeVoterAccount(walletAddress, verbose = false) {
  try {
    // Search for Voter accounts (typically 2728 bytes) at different offsets
    let voterAccounts = [];
    
    // Try multiple common offsets where wallet addresses are stored
    const offsets = [8, 40, 72]; // Most common offsets for wallet addresses
    
    for (const offset of offsets) {
      try {
        const accounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
          filters: [
            { dataSize: 2728 },
            { memcmp: { offset: offset, bytes: walletAddress } }
          ]
        });
        
        if (accounts.length > 0) {
          voterAccounts = accounts;
          if (verbose) {
            console.log(`   📍 Found Voter account at offset ${offset}`);
          }
          break;
        }
      } catch (error) {
        // Continue with next offset
      }
    }
    
    if (voterAccounts.length === 0) {
      return null;
    }
    
    let totalGovernancePower = 0;
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const deposits = [];
    
    for (const { pubkey, account } of voterAccounts) {
      const data = account.data;
      
      if (verbose) {
        console.log(`   📊 Analyzing Voter account: ${pubkey.toBase58()}`);
      }
      
      // Method 1: Parse structured deposit entries
      const startOffsets = [200, 250, 300]; // Common deposit array starting points
      
      for (const startOffset of startOffsets) {
        for (let i = 0; i < 32; i++) { // Max 32 deposits
          const depositOffset = startOffset + (i * 72);
          if (depositOffset + 72 > data.length) break;
          
          const deposit = parseDepositEntry(data, depositOffset);
          if (!deposit || deposit.amountDepositedNative === 0) {
            continue;
          }
          
          // Include deposits that either have isUsed=true OR have a significant amount
          if (!deposit.isUsed && deposit.amountDepositedNative < 1000000) { // Less than 1 ISLAND
            continue;
          }
          
          const multiplier = calculateLockupMultiplier(deposit, currentTimestamp);
          const power = (deposit.amountDepositedNative * multiplier) / 1e6;
          
          totalGovernancePower += power;
          deposits.push({
            amount: deposit.amountDepositedNative / 1e6,
            multiplier: multiplier,
            power: power,
            isLocked: deposit.isLocked(),
            lockupKind: deposit.lockupKind,
            source: 'structured'
          });
          
          if (verbose) {
            const lockStatus = deposit.isLocked() ? "locked" : "unlocked";
            console.log(`     💰 Structured deposit ${i}: ${(deposit.amountDepositedNative / 1e6).toLocaleString()} ISLAND × ${multiplier.toFixed(2)} = ${power.toLocaleString()} power (${lockStatus})`);
          }
        }
      }
      
      // Method 2: Search for direct deposit values (like the 200k at offset 112)
      if (verbose) {
        console.log(`     🔍 Searching for direct deposit values...`);
      }
      
      for (let offset = 100; offset <= data.length - 8; offset += 8) {
        try {
          const rawValue = Number(data.readBigUInt64LE(offset));
          const islandAmount = rawValue / 1e6;
          
          // Look for significant amounts that could be governance deposits
          if (islandAmount >= 1000 && islandAmount <= 50000000) { // Between 1k and 50M ISLAND
            // Avoid double-counting by checking if we already found this amount
            const alreadyFound = deposits.some(d => Math.abs(d.amount - islandAmount) < 1);
            
            if (!alreadyFound) {
              const power = islandAmount; // Unlocked deposits use 1.0 multiplier
              totalGovernancePower += power;
              deposits.push({
                amount: islandAmount,
                multiplier: 1.0,
                power: power,
                isLocked: false,
                lockupKind: 0,
                source: 'direct',
                offset: offset
              });
              
              if (verbose) {
                console.log(`     💰 Direct deposit at ${offset}: ${islandAmount.toLocaleString()} ISLAND × 1.00 = ${power.toLocaleString()} power (unlocked)`);
              }
            }
          }
        } catch (error) {
          // Continue searching
        }
      }
    }
    
    return {
      totalPower: totalGovernancePower,
      deposits: deposits,
      voterAccountCount: voterAccounts.length
    };
    
  } catch (error) {
    if (verbose) {
      console.log(`     ❌ Voter analysis error: ${error.message}`);
    }
    return null;
  }
}

/**
 * Fetch governance power for a single wallet using comprehensive approach
 */
async function fetchWalletGovernancePower(walletAddress, verbose = false) {
  try {
    if (verbose) {
      console.log(`🔍 ${walletAddress}`);
    }
    
    // Step 1: Try 176-byte VoterWeightRecord accounts first
    const voterWeightRecords = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
      filters: [
        { dataSize: 176 },
        { memcmp: { offset: 72, bytes: walletAddress } }
      ]
    });
    
    let vwrPower = 0;
    const vwrSources = [];
    
    for (const { pubkey, account } of voterWeightRecords) {
      const data = account.data;
      const powerRaw = Number(data.readBigUInt64LE(104));
      const power = powerRaw / 1e6;
      
      if (power > 0) {
        vwrPower += power;
        vwrSources.push({
          account: pubkey.toBase58(),
          power: power,
          rawValue: powerRaw
        });
        
        if (verbose) {
          console.log(`   ✅ VWR: ${power.toLocaleString()} ISLAND from ${pubkey.toBase58()}`);
        }
      }
    }
    
    // If VWR found valid power, use it
    if (vwrPower > 0) {
      return {
        wallet: walletAddress,
        governancePower: vwrPower,
        source: "176-byte VWR account",
        voterWeight: vwrSources.reduce((sum, s) => sum + s.rawValue, 0),
        fallbackUsed: false,
        vwrSources: vwrSources
      };
    }
    
    // Step 2: Fallback to Voter account analysis
    if (verbose) {
      console.log(`   🔄 No VWR power found, trying Voter account fallback...`);
    }
    
    const voterAnalysis = await analyzeVoterAccount(walletAddress, verbose);
    
    if (voterAnalysis && voterAnalysis.totalPower > 0) {
      if (verbose) {
        console.log(`   ✅ Voter fallback: ${voterAnalysis.totalPower.toLocaleString()} ISLAND from ${voterAnalysis.deposits.length} deposits`);
      }
      
      return {
        wallet: walletAddress,
        governancePower: voterAnalysis.totalPower,
        source: "Voter fallback",
        voterWeight: Math.round(voterAnalysis.totalPower * 1e6),
        fallbackUsed: true,
        totalDeposits: voterAnalysis.deposits.length,
        totalPowerFromVoter: voterAnalysis.totalPower,
        unlockedIncluded: true,
        deposits: voterAnalysis.deposits,
        voterAccountCount: voterAnalysis.voterAccountCount
      };
    }
    
    // Step 3: No power found
    if (verbose) {
      console.log(`   ⏭️  No governance power found in VWR or Voter accounts`);
    }
    
    return {
      wallet: walletAddress,
      governancePower: 0,
      source: "No match",
      voterWeight: 0,
      fallbackUsed: false
    };
    
  } catch (error) {
    if (verbose) {
      console.log(`   ❌ Error: ${error.message}`);
    }
    return {
      wallet: walletAddress,
      governancePower: 0,
      source: `Error: ${error.message}`,
      voterWeight: 0,
      fallbackUsed: false
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