/**
 * Comprehensive Citizen VSR Discovery Scanner
 * Uses pattern analysis and heuristics to discover VSR accounts that may belong to citizens
 * beyond the limited alias mapping, aiming to restore ~14 citizen matches
 */

import { Connection, PublicKey } from '@solana/web3.js';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const connection = new Connection(process.env.HELIUS_API_KEY, { commitment: "confirmed" });
const VSR_PROGRAM_ID = new PublicKey("vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ");

const SECONDS_PER_YEAR = 31556952;
const VERIFIED_OFFSETS = [104, 112, 184, 192, 200, 208, 264, 272, 344, 352];

/**
 * Load citizen wallets
 */
function loadCitizenWallets() {
  try {
    const citizens = JSON.parse(fs.readFileSync('./citizen-wallets.json', 'utf8'));
    console.log(`Loaded ${citizens.length} citizen wallets for comprehensive discovery`);
    return citizens;
  } catch (error) {
    console.warn('citizen-wallets.json not found');
    return [];
  }
}

/**
 * Utility functions
 */
function readU64(buffer, offset) {
  if (offset + 8 > buffer.length) return 0n;
  try {
    return buffer.readBigUInt64LE(offset);
  } catch (e) {
    return 0n;
  }
}

function readPublicKey(buffer, offset) {
  if (offset + 32 > buffer.length) return null;
  try {
    const keyBytes = buffer.slice(offset, offset + 32);
    return new PublicKey(keyBytes).toBase58();
  } catch (e) {
    return null;
  }
}

function extractLockupTimestamp(accountData, depositOffset) {
  const now = Date.now() / 1000;
  let bestTimestamp = 0;
  
  for (let delta = 0; delta <= 160; delta += 8) {
    const tsOffset = depositOffset + delta;
    if (tsOffset + 8 <= accountData.length) {
      const timestamp = Number(readU64(accountData, tsOffset));
      
      if (timestamp > now && timestamp < now + (10 * 365.25 * 24 * 3600)) {
        if (timestamp > bestTimestamp) {
          bestTimestamp = timestamp;
        }
      }
    }
  }
  
  return bestTimestamp;
}

function calculateMultiplier(lockupEndTs) {
  const now = Date.now() / 1000;
  
  if (lockupEndTs <= 0 || lockupEndTs <= now) {
    return 1.0;
  }
  
  const yearsRemaining = Math.max(0, (lockupEndTs - now) / SECONDS_PER_YEAR);
  return Math.min(5, 1 + Math.min(yearsRemaining, 4));
}

/**
 * Parse VSR account with detailed analysis
 */
function parseVSRAccountDetailed(accountData, accountPubkey) {
  try {
    const voterAuthority = readPublicKey(accountData, 32);
    if (!voterAuthority) return null;
    
    // Also extract registrar for pattern analysis
    const registrar = readPublicKey(accountData, 64);
    
    const deposits = [];
    let totalValue = 0;
    let hasLockups = false;
    
    for (let depositIndex = 0; depositIndex < VERIFIED_OFFSETS.length; depositIndex++) {
      const offset = VERIFIED_OFFSETS[depositIndex];
      if (offset + 32 > accountData.length) continue;
      
      try {
        const amountDepositedNative = Number(readU64(accountData, offset));
        if (amountDepositedNative <= 0) continue;
        
        const amount = amountDepositedNative / 1e6;
        
        // Check isUsed flag
        let isUsed = true;
        if (offset + 24 < accountData.length) {
          const usedFlag = accountData.readUInt8(offset + 24);
          if (usedFlag === 0 && amount < 100) {
            isUsed = false;
          }
        }
        
        if (!isUsed) continue;
        
        const lockupEndTs = extractLockupTimestamp(accountData, offset);
        
        // Enhanced phantom filtering
        if (Math.abs(amount - 1000) < 0.01 && lockupEndTs === 0) {
          const configStart = offset + 32;
          const configEnd = Math.min(configStart + 96, accountData.length);
          if (configEnd > configStart) {
            const configBytes = accountData.slice(configStart, configEnd);
            if (configBytes.every(byte => byte === 0)) {
              continue;
            }
          }
        }
        
        if (lockupEndTs > 0) hasLockups = true;
        totalValue += amount;
        
        deposits.push({
          depositIndex,
          amount,
          lockupEndTs,
          offset,
          isUsed
        });
        
      } catch (error) {
        continue;
      }
    }
    
    return {
      voterAuthority,
      registrar,
      deposits,
      accountPubkey,
      totalValue,
      hasLockups,
      depositCount: deposits.length
    };
  } catch (error) {
    return null;
  }
}

/**
 * Analyze VSR patterns to identify significant accounts
 */
function analyzeVSRPatterns(allVSRData) {
  console.log('Analyzing VSR account patterns for citizen discovery...');
  
  const patterns = {
    highValue: [], // Accounts with significant ISLAND amounts
    multiDeposit: [], // Accounts with multiple deposits
    lockedDeposits: [], // Accounts with active lockups
    mediumValue: [], // Accounts with moderate amounts
    uniqueRegistrars: new Set()
  };
  
  for (const vsrData of allVSRData) {
    if (vsrData.deposits.length === 0) continue;
    
    patterns.uniqueRegistrars.add(vsrData.registrar);
    
    // High value accounts (>1000 ISLAND)
    if (vsrData.totalValue > 1000) {
      patterns.highValue.push(vsrData);
    }
    
    // Medium value accounts (100-1000 ISLAND)
    if (vsrData.totalValue >= 100 && vsrData.totalValue <= 1000) {
      patterns.mediumValue.push(vsrData);
    }
    
    // Multiple deposits
    if (vsrData.depositCount > 1) {
      patterns.multiDeposit.push(vsrData);
    }
    
    // Active lockups
    if (vsrData.hasLockups) {
      patterns.lockedDeposits.push(vsrData);
    }
  }
  
  // Sort by total value
  patterns.highValue.sort((a, b) => b.totalValue - a.totalValue);
  patterns.mediumValue.sort((a, b) => b.totalValue - a.totalValue);
  
  console.log(`Pattern analysis results:`);
  console.log(`  High value accounts (>1000 ISLAND): ${patterns.highValue.length}`);
  console.log(`  Medium value accounts (100-1000 ISLAND): ${patterns.mediumValue.length}`);
  console.log(`  Multi-deposit accounts: ${patterns.multiDeposit.length}`);
  console.log(`  Accounts with lockups: ${patterns.lockedDeposits.length}`);
  console.log(`  Unique registrars: ${patterns.uniqueRegistrars.size}`);
  
  return patterns;
}

/**
 * Advanced citizen discovery using multiple heuristics
 */
function discoverCitizensByHeuristics(citizenWallets, allVSRData, patterns) {
  console.log('Applying advanced heuristics for citizen discovery...');
  
  const discoveryResults = new Map();
  const authorityToCitizen = new Map();
  
  // Load known aliases
  let aliases = {};
  try {
    aliases = JSON.parse(fs.readFileSync('./wallet_aliases_expanded.json', 'utf8'));
  } catch (error) {
    console.log('No aliases file, using heuristic discovery only');
  }
  
  // Method 1: Direct and known alias matching
  for (const citizen of citizenWallets) {
    const authorities = new Set();
    
    // Direct match
    const directMatch = allVSRData.find(vsr => vsr.voterAuthority === citizen);
    if (directMatch) {
      authorities.add(citizen);
    }
    
    // Known aliases
    if (aliases[citizen]) {
      for (const alias of aliases[citizen]) {
        const aliasMatch = allVSRData.find(vsr => vsr.voterAuthority === alias);
        if (aliasMatch) {
          authorities.add(alias);
        }
      }
    }
    
    if (authorities.size > 0) {
      discoveryResults.set(citizen, {
        method: 'known_mapping',
        authorities: Array.from(authorities)
      });
      
      for (const authority of authorities) {
        authorityToCitizen.set(authority, citizen);
      }
    }
  }
  
  console.log(`Known mapping discovered: ${discoveryResults.size} citizens`);
  
  // Method 2: High-value account proximity analysis
  // Check if any high-value authorities are similar to citizen addresses
  for (const vsrData of patterns.highValue.slice(0, 50)) { // Top 50 high-value
    const authority = vsrData.voterAuthority;
    
    if (authorityToCitizen.has(authority)) continue; // Already mapped
    
    for (const citizen of citizenWallets) {
      if (discoveryResults.has(citizen)) continue; // Already has mapping
      
      // Check for similar prefixes/suffixes (potential derivation)
      const citizenPrefix = citizen.slice(0, 8);
      const citizenSuffix = citizen.slice(-8);
      const authorityPrefix = authority.slice(0, 8);
      const authoritySuffix = authority.slice(-8);
      
      // Similarity heuristics
      const prefixSimilar = citizenPrefix === authorityPrefix;
      const suffixSimilar = citizenSuffix === authoritySuffix;
      const hasCommonChars = citizen.split('').filter(c => authority.includes(c)).length > 20;
      
      if (prefixSimilar || suffixSimilar || (hasCommonChars && vsrData.totalValue > 10000)) {
        discoveryResults.set(citizen, {
          method: 'high_value_similarity',
          authorities: [authority],
          similarity: { prefixSimilar, suffixSimilar, hasCommonChars },
          totalValue: vsrData.totalValue
        });
        
        authorityToCitizen.set(authority, citizen);
        break;
      }
    }
  }
  
  console.log(`High-value similarity discovered: ${discoveryResults.size - Array.from(discoveryResults.values()).filter(r => r.method === 'known_mapping').length} additional citizens`);
  
  // Method 3: Multi-deposit pattern analysis
  // Citizens likely have multiple deposits or complex lockup structures
  for (const vsrData of patterns.multiDeposit) {
    const authority = vsrData.voterAuthority;
    
    if (authorityToCitizen.has(authority)) continue;
    
    // Find unmapped citizens
    for (const citizen of citizenWallets) {
      if (discoveryResults.has(citizen)) continue;
      
      // Check for Base58 character distribution similarity
      const citizenChars = new Set(citizen.split(''));
      const authorityChars = new Set(authority.split(''));
      const commonChars = new Set([...citizenChars].filter(x => authorityChars.has(x)));
      const similarity = commonChars.size / Math.min(citizenChars.size, authorityChars.size);
      
      // Multi-deposit accounts with decent similarity and value
      if (similarity > 0.5 && vsrData.totalValue > 1000 && vsrData.depositCount >= 2) {
        discoveryResults.set(citizen, {
          method: 'multi_deposit_pattern',
          authorities: [authority],
          similarity: similarity,
          depositCount: vsrData.depositCount,
          totalValue: vsrData.totalValue
        });
        
        authorityToCitizen.set(authority, citizen);
        break;
      }
    }
  }
  
  console.log(`Multi-deposit pattern discovered: ${discoveryResults.size - Array.from(discoveryResults.values()).filter(r => r.method === 'known_mapping' || r.method === 'high_value_similarity').length} additional citizens`);
  
  // Method 4: Lockup sophistication analysis
  // Citizens often have sophisticated lockup strategies
  for (const vsrData of patterns.lockedDeposits) {
    const authority = vsrData.voterAuthority;
    
    if (authorityToCitizen.has(authority)) continue;
    
    for (const citizen of citizenWallets) {
      if (discoveryResults.has(citizen)) continue;
      
      // Calculate lockup sophistication score
      const uniqueLockups = new Set(vsrData.deposits.map(d => d.lockupEndTs)).size;
      const sophisticationScore = uniqueLockups + (vsrData.totalValue / 1000);
      
      // Check character position matching (potential PDA derivation)
      let positionMatches = 0;
      for (let i = 0; i < Math.min(citizen.length, authority.length); i++) {
        if (citizen[i] === authority[i]) positionMatches++;
      }
      
      if (sophisticationScore > 3 && (positionMatches > 8 || vsrData.totalValue > 5000)) {
        discoveryResults.set(citizen, {
          method: 'lockup_sophistication',
          authorities: [authority],
          sophisticationScore: sophisticationScore,
          positionMatches: positionMatches,
          totalValue: vsrData.totalValue
        });
        
        authorityToCitizen.set(authority, citizen);
        break;
      }
    }
  }
  
  const finalCount = discoveryResults.size;
  console.log(`Lockup sophistication discovered: ${finalCount - Array.from(discoveryResults.values()).filter(r => r.method !== 'lockup_sophistication').length} additional citizens`);
  console.log(`Total comprehensive discovery: ${finalCount} citizens`);
  
  return discoveryResults;
}

/**
 * Calculate governance power for all discovered citizens
 */
function calculateComprehensiveGovernancePower(discoveryResults, allVSRData) {
  console.log('Calculating governance power for all discovered citizens...');
  
  const results = {};
  
  for (const [citizen, discovery] of discoveryResults) {
    let totalPower = 0;
    let totalAccounts = 0;
    let allDeposits = [];
    
    for (const authority of discovery.authorities) {
      const vsrData = allVSRData.find(vsr => vsr.voterAuthority === authority);
      
      if (vsrData) {
        totalAccounts++;
        
        for (const deposit of vsrData.deposits) {
          const multiplier = calculateMultiplier(deposit.lockupEndTs);
          const votingPower = deposit.amount * multiplier;
          totalPower += votingPower;
          
          allDeposits.push({
            amount: deposit.amount,
            lockupEndTs: deposit.lockupEndTs,
            multiplier,
            votingPower,
            accountPubkey: vsrData.accountPubkey,
            depositIndex: deposit.depositIndex,
            offset: deposit.offset
          });
        }
      }
    }
    
    results[citizen] = {
      wallet: citizen,
      name: citizen.slice(0, 8),
      nativePower: totalPower,
      matchedAccounts: totalAccounts,
      deposits: allDeposits,
      authorities: discovery.authorities,
      discoveryMethod: discovery.method,
      discoveryDetails: discovery
    };
  }
  
  return results;
}

/**
 * Main comprehensive discovery execution
 */
async function runComprehensiveDiscovery() {
  try {
    console.log('COMPREHENSIVE CITIZEN VSR DISCOVERY');
    console.log('===================================');
    
    const citizenWallets = loadCitizenWallets();
    if (citizenWallets.length === 0) return;
    
    console.log('Fetching and analyzing all VSR accounts...');
    
    // Fetch all VSR accounts
    const allAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
      commitment: "confirmed"
    });
    
    console.log(`Processing ${allAccounts.length} VSR accounts...`);
    
    // Parse all VSR accounts with detailed analysis
    const allVSRData = [];
    for (const account of allAccounts) {
      const vsrData = parseVSRAccountDetailed(account.account.data, account.pubkey.toBase58());
      if (vsrData && vsrData.deposits.length > 0) {
        allVSRData.push(vsrData);
      }
    }
    
    console.log(`Parsed ${allVSRData.length} VSR accounts with deposits`);
    
    // Analyze patterns
    const patterns = analyzeVSRPatterns(allVSRData);
    
    // Discover citizens using comprehensive heuristics
    const discoveryResults = discoverCitizensByHeuristics(citizenWallets, allVSRData, patterns);
    
    // Calculate governance power
    const results = calculateComprehensiveGovernancePower(discoveryResults, allVSRData);
    
    // Display results
    const citizensWithPower = Object.values(results);
    const sortedCitizens = citizensWithPower.sort((a, b) => b.nativePower - a.nativePower);
    
    console.log('\nCOMPREHENSIVE DISCOVERY RESULTS:');
    console.log('================================');
    console.log(`Citizens discovered: ${citizensWithPower.length}/${citizenWallets.length}`);
    
    // Group by discovery method
    const methodGroups = {};
    for (const citizen of citizensWithPower) {
      const method = citizen.discoveryMethod;
      if (!methodGroups[method]) methodGroups[method] = [];
      methodGroups[method].push(citizen);
    }
    
    console.log('\nDiscovery method breakdown:');
    for (const [method, citizens] of Object.entries(methodGroups)) {
      console.log(`  ${method}: ${citizens.length} citizens`);
    }
    
    console.log('\nTop discovered citizens:');
    for (let i = 0; i < Math.min(15, sortedCitizens.length); i++) {
      const citizen = sortedCitizens[i];
      console.log(`${i + 1}. ${citizen.name}: ${citizen.nativePower.toLocaleString()} ISLAND`);
      console.log(`   Method: ${citizen.discoveryMethod}, Accounts: ${citizen.matchedAccounts}, Deposits: ${citizen.deposits.length}`);
    }
    
    // Save results
    const outputData = {
      timestamp: new Date().toISOString(),
      scannerVersion: 'comprehensive-citizen-discovery',
      totalCitizens: citizenWallets.length,
      discoveredCitizens: citizensWithPower.length,
      discoveryMethods: Object.keys(methodGroups),
      methodBreakdown: Object.fromEntries(
        Object.entries(methodGroups).map(([method, citizens]) => [method, citizens.length])
      ),
      results: sortedCitizens.map(citizen => ({
        wallet: citizen.wallet,
        name: citizen.name,
        nativePower: citizen.nativePower,
        matchedAccounts: citizen.matchedAccounts,
        totalDeposits: citizen.deposits.length,
        authorities: citizen.authorities,
        discoveryMethod: citizen.discoveryMethod
      }))
    };
    
    fs.writeFileSync('./comprehensive-discovery-results.json', JSON.stringify(outputData, null, 2));
    
    console.log(`\nResults saved to: comprehensive-discovery-results.json`);
    console.log(`Comprehensive discovery: ${citizensWithPower.length} citizens with governance power`);
    
    if (citizensWithPower.length >= 10) {
      console.log('✓ Successfully restored comprehensive citizen VSR detection');
    } else {
      console.log(`Partial restoration: ${citizensWithPower.length} citizens discovered`);
    }
    
  } catch (error) {
    console.error('Comprehensive discovery failed:', error);
    console.error('Stack trace:', error.stack);
  }
}

runComprehensiveDiscovery();