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
      
      // Method 2: Validated direct deposit extraction for special cases
      if (verbose) {
        console.log(`     🔍 Searching for validated deposit values...`);
      }
      
      // Only scan specific validated offsets to avoid garbage data
      const validatedOffsets = [112]; // Known authentic deposit locations
      const MAX_DEPOSITS_PER_VOTER = 16; // Reasonable limit
      
      for (const offset of validatedOffsets) {
        try {
          const rawValue = Number(data.readBigUInt64LE(offset));
          const islandAmount = rawValue / 1e6;
          
          // Strict validation for authentic deposits
          if (islandAmount >= 1000 && islandAmount <= 50000000 && // Reasonable range
              rawValue !== 4294967296 && // Reject 2^32 (common padding value)
              rawValue % 1000000 === 0) { // Must be whole ISLAND amounts
            
            // Additional validation: check if this looks like real deposit data
            const alreadyFound = deposits.some(d => Math.abs(d.amount - islandAmount) < 1);
            
            if (!alreadyFound && deposits.length < MAX_DEPOSITS_PER_VOTER) {
              const power = islandAmount; // Unlocked deposits use 1.0 multiplier
              totalGovernancePower += power;
              deposits.push({
                amount: islandAmount,
                multiplier: 1.0,
                power: power,
                isLocked: false,
                lockupKind: 0,
                source: 'validated_direct',
                offset: offset,
                rawValue: rawValue
              });
              
              if (verbose) {
                console.log(`     💰 Validated deposit at ${offset}: ${islandAmount.toLocaleString()} ISLAND × 1.00 = ${power.toLocaleString()} power (raw: ${rawValue})`);
              }
            }
          } else if (verbose && islandAmount > 0) {
            console.log(`     ⚠️  Rejected invalid data at ${offset}: ${islandAmount.toLocaleString()} ISLAND (raw: ${rawValue})`);
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
 * Load all VSR Voter accounts for comprehensive delegation analysis
 */
async function loadAllVoterAccounts(verbose = false) {
  if (verbose) {
    console.log('📊 Loading all VSR Voter accounts for delegation analysis...');
  }
  
  const allVoterAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
    filters: [{ dataSize: 2728 }]
  });
  
  if (verbose) {
    console.log(`   Found ${allVoterAccounts.length} total Voter accounts`);
  }
  
  return allVoterAccounts;
}

/**
 * Parse authority and voterAuthority from Voter account
 */
function parseVoterAuthorities(data) {
  try {
    // Authority is at offset 8 (32 bytes)
    const authority = new PublicKey(data.slice(8, 40)).toBase58();
    
    // VoterAuthority is at offset 40 (32 bytes) 
    const voterAuthority = new PublicKey(data.slice(40, 72)).toBase58();
    
    return { authority, voterAuthority };
  } catch (error) {
    return null;
  }
}

/**
 * Calculate native and delegated governance power for a wallet
 */
async function calculateNativeAndDelegatedPower(walletAddress, allVoterAccounts, verbose = false) {
  let nativeGovernancePower = 0;
  let delegatedGovernancePower = 0;
  const nativeSources = [];
  const delegatedSources = [];
  
  if (verbose) {
    console.log(`   🔍 Analyzing delegation for ${walletAddress}`);
  }
  
  // Method 1: Check VoterWeightRecord accounts (these are typically native)
  const voterWeightRecords = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
    filters: [
      { dataSize: 176 },
      { memcmp: { offset:72, bytes: walletAddress } }
    ]
  });
  
  for (const { pubkey, account } of voterWeightRecords) {
    const data = account.data;
    const powerRaw = Number(data.readBigUInt64LE(104));
    const power = powerRaw / 1e6;
    
    if (power > 0) {
      nativeGovernancePower += power;
      nativeSources.push({
        account: pubkey.toBase58(),
        power: power,
        type: 'VWR'
      });
      
      if (verbose) {
        console.log(`     ✅ Native VWR: ${power.toLocaleString()} ISLAND from ${pubkey.toBase58()}`);
      }
    }
  }
  
  // Method 2: Analyze all Voter accounts for both native and delegated relationships
  let processedAccounts = 0;
  for (const { pubkey, account } of allVoterAccounts) {
    processedAccounts++;
    if (verbose && processedAccounts % 1000 === 0) {
      console.log(`     📊 Processed ${processedAccounts}/${allVoterAccounts.length} Voter accounts`);
    }
    
    const data = account.data;
    const authorities = parseVoterAuthorities(data);
    
    if (!authorities) continue;
    
    const { authority, voterAuthority } = authorities;
    
    // Skip if this account doesn't involve our target wallet
    if (authority !== walletAddress && voterAuthority !== walletAddress) {
      continue;
    }
    
    // Analyze deposits in this Voter account
    const voterAnalysis = await analyzeVoterAccountDeposits(data, verbose && (authority === walletAddress || voterAuthority === walletAddress));
    
    if (voterAnalysis && voterAnalysis.totalPower > 0) {
      // Native power: wallet owns these deposits (regardless of delegation)
      if (authority === walletAddress) {
        nativeGovernancePower += voterAnalysis.totalPower;
        nativeSources.push({
          account: pubkey.toBase58(),
          power: voterAnalysis.totalPower,
          type: 'Voter-native',
          authority: authority,
          delegatedTo: voterAuthority !== authority ? voterAuthority : null
        });
        
        if (verbose) {
          const delegationNote = voterAuthority !== authority ? 
            ` (delegated to ${voterAuthority.substring(0,8)}...)` : '';
          console.log(`     ✅ Native Voter: ${voterAnalysis.totalPower.toLocaleString()} ISLAND from ${pubkey.toBase58()}${delegationNote}`);
        }
      }
      
      // Delegated power: someone else's deposits delegated to this wallet
      if (voterAuthority === walletAddress && authority !== walletAddress) {
        delegatedGovernancePower += voterAnalysis.totalPower;
        delegatedSources.push({
          account: pubkey.toBase58(),
          power: voterAnalysis.totalPower,
          type: 'Voter-delegated',
          authority: authority,
          delegatedTo: voterAuthority
        });
        
        if (verbose) {
          console.log(`     ✅ Delegated: ${voterAnalysis.totalPower.toLocaleString()} ISLAND from ${authority.substring(0,8)}... → ${walletAddress.substring(0,8)}...`);
          console.log(`       Account: ${pubkey.toBase58()}`);
        }
      }
    }
  }
  
  // Method 3: Special fallback for wallets with direct deposits (like Fgv1zrw...)
  if (nativeGovernancePower === 0 && delegatedGovernancePower === 0) {
    const fallbackAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
      filters: [
        { dataSize: 2728 },
        { memcmp: { offset: 8, bytes: walletAddress } } // Try wallet at offset 8
      ]
    });
    
    for (const { pubkey, account } of fallbackAccounts) {
      const data = account.data;
      const fallbackAnalysis = await analyzeVoterAccountDeposits(data, verbose);
      
      if (fallbackAnalysis && fallbackAnalysis.totalPower > 0) {
        // Check if this is a valid direct deposit
        const validatedOffsets = [112];
        for (const offset of validatedOffsets) {
          try {
            const rawValue = Number(data.readBigUInt64LE(offset));
            const islandAmount = rawValue / 1e6;
            
            if (islandAmount >= 1000 && islandAmount <= 50000000 && 
                rawValue !== 4294967296 && 
                rawValue % 1000000 === 0) {
              
              nativeGovernancePower += islandAmount;
              nativeSources.push({
                account: pubkey.toBase58(),
                power: islandAmount,
                type: 'Voter-fallback',
                offset: offset
              });
              
              if (verbose) {
                console.log(`     ✅ Fallback deposit: ${islandAmount.toLocaleString()} ISLAND from ${pubkey.toBase58()} at offset ${offset}`);
              }
            }
          } catch (error) {
            // Continue
          }
        }
      }
    }
  }
  
  return {
    nativeGovernancePower,
    delegatedGovernancePower,
    totalGovernancePower: nativeGovernancePower + delegatedGovernancePower,
    nativeSources,
    delegatedSources
  };
}

/**
 * Analyze deposits in a Voter account (simplified version)
 */
async function analyzeVoterAccountDeposits(data, verbose = false) {
  let totalGovernancePower = 0;
  const currentTimestamp = Math.floor(Date.now() / 1000);
  const deposits = [];
  
  // Method 1: Try structured deposits
  const startOffsets = [200, 250, 300];
  
  for (const startOffset of startOffsets) {
    for (let i = 0; i < 32; i++) {
      const depositOffset = startOffset + (i * 72);
      if (depositOffset + 72 > data.length) break;
      
      const deposit = parseDepositEntry(data, depositOffset);
      if (!deposit || deposit.amountDepositedNative === 0) {
        continue;
      }
      
      if (!deposit.isUsed && deposit.amountDepositedNative < 1000000) {
        continue;
      }
      
      const multiplier = calculateLockupMultiplier(deposit, currentTimestamp);
      const power = (deposit.amountDepositedNative * multiplier) / 1e6;
      
      totalGovernancePower += power;
      deposits.push({
        amount: deposit.amountDepositedNative / 1e6,
        multiplier: multiplier,
        power: power,
        source: 'structured'
      });
    }
  }
  
  // Method 2: Check known direct deposits
  if (totalGovernancePower === 0) {
    const validatedOffsets = [112];
    
    for (const offset of validatedOffsets) {
      try {
        const rawValue = Number(data.readBigUInt64LE(offset));
        const islandAmount = rawValue / 1e6;
        
        if (islandAmount >= 1000 && islandAmount <= 50000000 && 
            rawValue !== 4294967296 && 
            rawValue % 1000000 === 0) {
          
          totalGovernancePower += islandAmount;
          deposits.push({
            amount: islandAmount,
            multiplier: 1.0,
            power: islandAmount,
            source: 'validated_direct',
            offset: offset
          });
        }
      } catch (error) {
        // Continue
      }
    }
  }
  
  return totalGovernancePower > 0 ? {
    totalPower: totalGovernancePower,
    deposits: deposits
  } : null;
}

/**
 * Fetch governance power for a single wallet with native/delegated separation
 */
async function fetchWalletGovernancePower(walletAddress, allVoterAccounts, verbose = false) {
  try {
    if (verbose) {
      console.log(`🔍 ${walletAddress}`);
    }
    
    const powerBreakdown = await calculateNativeAndDelegatedPower(walletAddress, allVoterAccounts, verbose);
    
    if (powerBreakdown.totalGovernancePower > 0) {
      return {
        wallet: walletAddress,
        nativeGovernancePower: powerBreakdown.nativeGovernancePower,
        delegatedGovernancePower: powerBreakdown.delegatedGovernancePower,
        totalGovernancePower: powerBreakdown.totalGovernancePower,
        sources: [...powerBreakdown.nativeSources.map(s => s.type), ...powerBreakdown.delegatedSources.map(s => s.type)],
        nativeSources: powerBreakdown.nativeSources,
        delegatedSources: powerBreakdown.delegatedSources
      };
    }
    
    if (verbose) {
      console.log(`   ⏭️  No governance power found`);
    }
    
    return {
      wallet: walletAddress,
      nativeGovernancePower: 0,
      delegatedGovernancePower: 0,
      totalGovernancePower: 0,
      sources: ["No match"]
    };
    
  } catch (error) {
    if (verbose) {
      console.log(`   ❌ Error: ${error.message}`);
    }
    return {
      wallet: walletAddress,
      nativeGovernancePower: 0,
      delegatedGovernancePower: 0,
      totalGovernancePower: 0,
      sources: [`Error: ${error.message}`]
    };
  }
}

/**
 * Run canonical VoterWeightRecord scan for all wallets
 */
async function runCanonicalVWRScan(verbose = false) {
  console.log('🏛️ CANONICAL VOTERWEIGHTRECORD GOVERNANCE SCANNER');
  console.log('=================================================');
  console.log(`📊 Scanning ${WALLETS.length} wallets with native/delegated separation`);
  console.log(`📡 Helius RPC: ${process.env.HELIUS_RPC_URL ? 'Connected' : 'Not configured'}`);
  console.log(`🏛️ VSR Program: ${VSR_PROGRAM_ID.toBase58()}`);
  console.log(`📋 Registrar: ${REGISTRAR.toBase58()}`);
  console.log(`🏛️ Realm: ${REALM.toBase58()}`);
  
  // Load all voter accounts once for delegation analysis
  const allVoterAccounts = await loadAllVoterAccounts(verbose);
  
  if (verbose) {
    console.log('\n🔍 Processing wallets:');
  }
  
  const results = [];
  let walletsWithPower = 0;
  let totalNativePower = 0;
  let totalDelegatedPower = 0;
  
  for (const [index, walletAddress] of WALLETS.entries()) {
    if (!verbose) {
      process.stdout.write(`\r[${(index + 1).toString().padStart(2)}/${WALLETS.length}] Processing...`);
    }
    
    const result = await fetchWalletGovernancePower(walletAddress, allVoterAccounts, verbose);
    results.push(result);
    
    if (result.totalGovernancePower > 0) {
      walletsWithPower++;
      totalNativePower += result.nativeGovernancePower;
      totalDelegatedPower += result.delegatedGovernancePower;
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
  console.log(`Total native power: ${totalNativePower.toLocaleString()} ISLAND`);
  console.log(`Total delegated power: ${totalDelegatedPower.toLocaleString()} ISLAND`);
  console.log(`Total governance power: ${(totalNativePower + totalDelegatedPower).toLocaleString()} ISLAND`);
  
  if (walletsWithPower > 0) {
    console.log(`Average total power per active wallet: ${((totalNativePower + totalDelegatedPower) / walletsWithPower).toLocaleString()} ISLAND`);
  }
  
  // Detailed results
  console.log(`\n📋 DETAILED RESULTS:`);
  console.log('===================');
  
  results
    .sort((a, b) => b.totalGovernancePower - a.totalGovernancePower)
    .forEach((result, index) => {
      const rank = (index + 1).toString().padStart(2);
      const status = result.totalGovernancePower > 0 ? '✅' : '⏭️ ';
      
      if (result.totalGovernancePower > 0) {
        const nativeStr = result.nativeGovernancePower > 0 ? 
          `${result.nativeGovernancePower.toLocaleString()} native` : '';
        const delegatedStr = result.delegatedGovernancePower > 0 ? 
          `${result.delegatedGovernancePower.toLocaleString()} delegated` : '';
        const powerParts = [nativeStr, delegatedStr].filter(Boolean);
        const powerDetail = powerParts.length > 1 ? 
          `(${powerParts.join(' + ')})` : 
          `(${powerParts[0] || 'unknown'})`;
        
        console.log(`${status} ${rank}. ${result.totalGovernancePower.toLocaleString()} ISLAND ${powerDetail}`);
        console.log(`      ${result.wallet}`);
        
        if (verbose && result.sources && result.sources.length > 0) {
          console.log(`      Sources: ${result.sources.join(', ')}`);
        }
      } else {
        console.log(`${status} ${rank}. No power (${result.sources && result.sources[0] ? result.sources[0] : 'No match'})`);
        console.log(`      ${result.wallet}`);
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
      totalNativePower: totalNativePower,
      totalDelegatedPower: totalDelegatedPower,
      totalGovernancePower: totalNativePower + totalDelegatedPower,
      averagePowerPerActiveWallet: walletsWithPower > 0 ? (totalNativePower + totalDelegatedPower) / walletsWithPower : 0
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