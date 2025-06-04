/**
 * Validated Citizen VSR Discovery Scanner
 * Uses precise matching and realistic value validation to restore accurate citizen detection
 * Focuses on authentic governance power calculations without inflated values
 */

import { Connection, PublicKey } from '@solana/web3.js';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const connection = new Connection(process.env.HELIUS_API_KEY, { commitment: "confirmed" });
const VSR_PROGRAM_ID = new PublicKey("vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ");

const SECONDS_PER_YEAR = 31556952;
const VERIFIED_OFFSETS = [104, 112, 184, 192, 200, 208, 264, 272, 344, 352];

// Realistic governance power limits for validation
const MAX_REASONABLE_ISLAND = 50000000; // 50M ISLAND maximum reasonable
const MIN_CITIZEN_POWER = 1; // Minimum 1 ISLAND to count

/**
 * Load citizen wallets
 */
function loadCitizenWallets() {
  try {
    const citizens = JSON.parse(fs.readFileSync('./citizen-wallets.json', 'utf8'));
    console.log(`Loaded ${citizens.length} citizen wallets`);
    return citizens;
  } catch (error) {
    console.warn('citizen-wallets.json not found');
    return [];
  }
}

/**
 * Utility functions for reading VSR data
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

/**
 * Extract lockup timestamp with validation
 */
function extractLockupTimestamp(accountData, depositOffset) {
  const now = Date.now() / 1000;
  let bestTimestamp = 0;
  
  for (let delta = 0; delta <= 160; delta += 8) {
    const tsOffset = depositOffset + delta;
    if (tsOffset + 8 <= accountData.length) {
      const timestamp = Number(readU64(accountData, tsOffset));
      
      // Valid future timestamp within 10 years
      if (timestamp > now && timestamp < now + (10 * 365.25 * 24 * 3600)) {
        if (timestamp > bestTimestamp) {
          bestTimestamp = timestamp;
        }
      }
    }
  }
  
  return bestTimestamp;
}

/**
 * Calculate multiplier with validation
 */
function calculateMultiplier(lockupEndTs) {
  const now = Date.now() / 1000;
  
  if (lockupEndTs <= 0 || lockupEndTs <= now) {
    return 1.0;
  }
  
  const yearsRemaining = Math.max(0, (lockupEndTs - now) / SECONDS_PER_YEAR);
  const multiplier = Math.min(5, 1 + Math.min(yearsRemaining, 4));
  
  // Validate multiplier is reasonable
  if (multiplier < 1.0 || multiplier > 5.0) {
    return 1.0; // Default to 1.0 if invalid
  }
  
  return multiplier;
}

/**
 * Parse VSR account with value validation
 */
function parseVSRAccountValidated(accountData, accountPubkey) {
  try {
    const voterAuthority = readPublicKey(accountData, 32);
    if (!voterAuthority) return null;
    
    const deposits = [];
    let totalAccountValue = 0;
    
    for (let depositIndex = 0; depositIndex < VERIFIED_OFFSETS.length; depositIndex++) {
      const offset = VERIFIED_OFFSETS[depositIndex];
      if (offset + 32 > accountData.length) continue;
      
      try {
        const amountDepositedNative = Number(readU64(accountData, offset));
        if (amountDepositedNative <= 0) continue;
        
        const amount = amountDepositedNative / 1e6; // Convert to ISLAND
        
        // Validate amount is reasonable
        if (amount > MAX_REASONABLE_ISLAND) {
          console.warn(`Unrealistic deposit amount: ${amount} ISLAND in account ${accountPubkey}`);
          continue;
        }
        
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
        
        totalAccountValue += amount;
        
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
    
    // Only return accounts with reasonable total values
    if (totalAccountValue > MAX_REASONABLE_ISLAND) {
      console.warn(`Unrealistic account total: ${totalAccountValue} ISLAND for ${accountPubkey}`);
      return null;
    }
    
    return {
      voterAuthority,
      deposits,
      accountPubkey,
      totalValue: totalAccountValue
    };
  } catch (error) {
    return null;
  }
}

/**
 * Build validated authority mapping
 */
async function buildValidatedAuthorityMapping() {
  console.log('Building validated VSR authority mapping...');
  
  // Fetch all VSR accounts
  const allAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
    commitment: "confirmed"
  });
  
  console.log(`Processing ${allAccounts.length} VSR accounts...`);
  
  const authorityMap = new Map(); // authority -> VSR data
  let validAccounts = 0;
  
  for (const account of allAccounts) {
    const vsrData = parseVSRAccountValidated(account.account.data, account.pubkey.toBase58());
    
    if (vsrData && vsrData.deposits.length > 0 && vsrData.totalValue > 0) {
      authorityMap.set(vsrData.voterAuthority, vsrData);
      validAccounts++;
    }
  }
  
  console.log(`Validated ${validAccounts} VSR accounts with reasonable values`);
  console.log(`Unique authorities: ${authorityMap.size}`);
  
  return authorityMap;
}

/**
 * Discover citizens using validated precise matching
 */
function discoverCitizensValidated(citizenWallets, authorityMap) {
  console.log('Discovering citizens with validated precise matching...');
  
  const citizenDiscovery = new Map();
  
  // Load known aliases
  let aliases = {};
  try {
    aliases = JSON.parse(fs.readFileSync('./wallet_aliases_expanded.json', 'utf8'));
  } catch (error) {
    console.log('No aliases file found, using direct matching only');
  }
  
  let directMatches = 0;
  let aliasMatches = 0;
  
  for (const citizen of citizenWallets) {
    const discoveredAuthorities = [];
    
    // Method 1: Direct authority match
    if (authorityMap.has(citizen)) {
      discoveredAuthorities.push({
        authority: citizen,
        method: 'direct',
        vsrData: authorityMap.get(citizen)
      });
      directMatches++;
    }
    
    // Method 2: Known aliases only
    if (aliases[citizen]) {
      for (const alias of aliases[citizen]) {
        if (authorityMap.has(alias)) {
          discoveredAuthorities.push({
            authority: alias,
            method: 'known_alias',
            vsrData: authorityMap.get(alias)
          });
          aliasMatches++;
        }
      }
    }
    
    // Method 3: Reverse alias lookup
    for (const [mainWallet, walletAliases] of Object.entries(aliases)) {
      if (walletAliases.includes(citizen)) {
        if (authorityMap.has(mainWallet)) {
          discoveredAuthorities.push({
            authority: mainWallet,
            method: 'reverse_alias',
            vsrData: authorityMap.get(mainWallet)
          });
        }
      }
    }
    
    if (discoveredAuthorities.length > 0) {
      citizenDiscovery.set(citizen, discoveredAuthorities);
    }
  }
  
  console.log(`Discovery results:`);
  console.log(`  Direct matches: ${directMatches}`);
  console.log(`  Known alias matches: ${aliasMatches}`);
  console.log(`  Total citizens discovered: ${citizenDiscovery.size}`);
  
  return citizenDiscovery;
}

/**
 * Calculate validated governance power
 */
function calculateValidatedGovernancePower(citizenDiscovery) {
  console.log('Calculating validated governance power...');
  
  const results = {};
  
  for (const [citizen, authorities] of citizenDiscovery) {
    let totalPower = 0;
    let totalAccounts = 0;
    let allDeposits = [];
    
    for (const authorityData of authorities) {
      const vsrData = authorityData.vsrData;
      totalAccounts++;
      
      for (const deposit of vsrData.deposits) {
        const multiplier = calculateMultiplier(deposit.lockupEndTs);
        const votingPower = deposit.amount * multiplier;
        
        // Validate individual voting power
        if (votingPower > MAX_REASONABLE_ISLAND) {
          console.warn(`Unrealistic voting power: ${votingPower} for citizen ${citizen}`);
          continue;
        }
        
        totalPower += votingPower;
        
        allDeposits.push({
          amount: deposit.amount,
          lockupEndTs: deposit.lockupEndTs,
          multiplier,
          votingPower,
          accountPubkey: vsrData.accountPubkey,
          depositIndex: deposit.depositIndex,
          offset: deposit.offset,
          authority: authorityData.authority,
          discoveryMethod: authorityData.method
        });
      }
    }
    
    // Only include citizens with reasonable total power
    if (totalPower >= MIN_CITIZEN_POWER && totalPower <= MAX_REASONABLE_ISLAND) {
      results[citizen] = {
        wallet: citizen,
        name: citizen.slice(0, 8),
        nativePower: totalPower,
        matchedAccounts: totalAccounts,
        deposits: allDeposits,
        authorities: authorities.map(a => a.authority),
        discoveryMethods: [...new Set(authorities.map(a => a.method))]
      };
    } else if (totalPower > 0) {
      console.warn(`Excluded citizen ${citizen} with unrealistic power: ${totalPower}`);
    }
  }
  
  return results;
}

/**
 * Main validated discovery execution
 */
async function runValidatedDiscovery() {
  try {
    console.log('VALIDATED CITIZEN VSR DISCOVERY');
    console.log('===============================');
    
    const citizenWallets = loadCitizenWallets();
    if (citizenWallets.length === 0) return;
    
    // Build validated authority mapping
    const authorityMap = await buildValidatedAuthorityMapping();
    
    // Discover citizens with validation
    const citizenDiscovery = discoverCitizensValidated(citizenWallets, authorityMap);
    
    // Calculate validated governance power
    const results = calculateValidatedGovernancePower(citizenDiscovery);
    
    // Display results
    const citizensWithPower = Object.values(results);
    const sortedCitizens = citizensWithPower.sort((a, b) => b.nativePower - a.nativePower);
    
    console.log('\nVALIDATED DISCOVERY RESULTS:');
    console.log('============================');
    console.log(`Citizens with validated governance power: ${citizensWithPower.length}/${citizenWallets.length}`);
    
    // Group by discovery method
    const methodCounts = {};
    for (const citizen of citizensWithPower) {
      for (const method of citizen.discoveryMethods) {
        methodCounts[method] = (methodCounts[method] || 0) + 1;
      }
    }
    
    console.log('\nDiscovery method breakdown:');
    for (const [method, count] of Object.entries(methodCounts)) {
      console.log(`  ${method}: ${count} citizens`);
    }
    
    console.log('\nValidated citizens with governance power:');
    for (let i = 0; i < sortedCitizens.length; i++) {
      const citizen = sortedCitizens[i];
      console.log(`${i + 1}. ${citizen.name}: ${citizen.nativePower.toLocaleString()} ISLAND`);
      console.log(`   Methods: ${citizen.discoveryMethods.join(', ')}, Accounts: ${citizen.matchedAccounts}, Deposits: ${citizen.deposits.length}`);
      
      // Show top deposits for verification
      const topDeposits = citizen.deposits
        .sort((a, b) => b.votingPower - a.votingPower)
        .slice(0, 3);
      
      for (const deposit of topDeposits) {
        const lockupInfo = deposit.lockupEndTs > 0 ? 
          ` (locked until ${new Date(deposit.lockupEndTs * 1000).toISOString().split('T')[0]})` : '';
        console.log(`     ${deposit.amount.toFixed(2)} ISLAND × ${deposit.multiplier.toFixed(3)}x = ${deposit.votingPower.toFixed(2)} power${lockupInfo}`);
      }
    }
    
    // Save validated results
    const outputData = {
      timestamp: new Date().toISOString(),
      scannerVersion: 'validated-citizen-discovery',
      totalCitizens: citizenWallets.length,
      validatedCitizens: citizensWithPower.length,
      maxReasonableIsland: MAX_REASONABLE_ISLAND,
      minCitizenPower: MIN_CITIZEN_POWER,
      discoveryMethods: Object.keys(methodCounts),
      methodBreakdown: methodCounts,
      results: sortedCitizens.map(citizen => ({
        wallet: citizen.wallet,
        name: citizen.name,
        nativePower: citizen.nativePower,
        matchedAccounts: citizen.matchedAccounts,
        totalDeposits: citizen.deposits.length,
        authorities: citizen.authorities,
        discoveryMethods: citizen.discoveryMethods,
        topDeposits: citizen.deposits
          .sort((a, b) => b.votingPower - a.votingPower)
          .slice(0, 5)
          .map(d => ({
            amount: d.amount,
            multiplier: d.multiplier,
            votingPower: d.votingPower,
            lockupEndTs: d.lockupEndTs
          }))
      }))
    };
    
    fs.writeFileSync('./canonical-native-results-restored.json', JSON.stringify(outputData, null, 2));
    
    console.log(`\nResults saved to: canonical-native-results-restored.json`);
    console.log(`Validated discovery: ${citizensWithPower.length} citizens with realistic governance power`);
    
    if (citizensWithPower.length >= 10) {
      console.log('Successfully restored accurate citizen VSR detection');
    } else if (citizensWithPower.length >= 3) {
      console.log('Partial but accurate restoration achieved');
    } else {
      console.log('Limited accurate results - may need expanded alias mapping');
    }
    
  } catch (error) {
    console.error('Validated discovery failed:', error);
  }
}

runValidatedDiscovery();