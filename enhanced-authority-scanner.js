/**
 * Enhanced Authority VSR Scanner
 * Discovers VSR accounts through comprehensive authority patterns beyond limited aliases
 * Uses direct account inspection and authority derivation to restore full citizen detection
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
    console.log(`Loaded ${citizens.length} citizen wallets for enhanced discovery`);
    return citizens;
  } catch (error) {
    console.warn('citizen-wallets.json not found');
    return [];
  }
}

/**
 * Read utilities
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
 * Extract lockup timestamp
 */
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

/**
 * Calculate canonical multiplier
 */
function calculateMultiplier(lockupEndTs) {
  const now = Date.now() / 1000;
  
  if (lockupEndTs <= 0 || lockupEndTs <= now) {
    return 1.0;
  }
  
  const yearsRemaining = Math.max(0, (lockupEndTs - now) / SECONDS_PER_YEAR);
  return Math.min(5, 1 + Math.min(yearsRemaining, 4));
}

/**
 * Parse VSR account and extract all deposits
 */
function parseVSRAccount(accountData, accountPubkey) {
  try {
    // Extract voter authority from offset 32
    const voterAuthority = readPublicKey(accountData, 32);
    if (!voterAuthority) return null;
    
    const deposits = [];
    
    // Parse using verified offsets
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
        
        // Extract lockup timestamp
        const lockupEndTs = extractLockupTimestamp(accountData, offset);
        
        // Enhanced phantom filtering
        if (Math.abs(amount - 1000) < 0.01 && lockupEndTs === 0) {
          const configStart = offset + 32;
          const configEnd = Math.min(configStart + 96, accountData.length);
          if (configEnd > configStart) {
            const configBytes = accountData.slice(configStart, configEnd);
            if (configBytes.every(byte => byte === 0)) {
              continue; // Skip phantom
            }
          }
        }
        
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
      deposits,
      accountPubkey
    };
  } catch (error) {
    return null;
  }
}

/**
 * Build VSR authority index for efficient citizen matching
 */
async function buildVSRAuthorityIndex() {
  console.log('Building comprehensive VSR authority index...');
  
  // Fetch all VSR accounts
  const allAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
    commitment: "confirmed"
  });
  
  console.log(`Indexing ${allAccounts.length} VSR accounts by authority...`);
  
  const authorityIndex = new Map(); // authority -> [VSR account data]
  let indexedCount = 0;
  
  for (const account of allAccounts) {
    const vsrData = parseVSRAccount(account.account.data, account.pubkey.toBase58());
    
    if (vsrData && vsrData.voterAuthority && vsrData.deposits.length > 0) {
      if (!authorityIndex.has(vsrData.voterAuthority)) {
        authorityIndex.set(vsrData.voterAuthority, []);
      }
      
      authorityIndex.get(vsrData.voterAuthority).push({
        accountPubkey: account.pubkey.toBase58(),
        deposits: vsrData.deposits,
        totalDeposits: vsrData.deposits.length
      });
      
      indexedCount++;
    }
  }
  
  console.log(`Indexed ${indexedCount} VSR accounts across ${authorityIndex.size} unique authorities`);
  return authorityIndex;
}

/**
 * Discover citizen authorities using multiple strategies
 */
function discoverCitizenAuthorities(citizenWallets, authorityIndex) {
  console.log('Discovering citizen authorities through multiple strategies...');
  
  const citizenToAuthorities = new Map();
  const discoveredMatches = new Map(); // citizen -> authority matches
  
  // Load known aliases
  let aliases = {};
  try {
    aliases = JSON.parse(fs.readFileSync('./wallet_aliases_expanded.json', 'utf8'));
  } catch (error) {
    console.log('No aliases file found, using direct matching only');
  }
  
  for (const citizenWallet of citizenWallets) {
    const authorities = new Set();
    const matches = [];
    
    // Strategy 1: Direct authority match
    if (authorityIndex.has(citizenWallet)) {
      authorities.add(citizenWallet);
      matches.push({ strategy: 'direct', authority: citizenWallet });
    }
    
    // Strategy 2: Known aliases
    if (aliases[citizenWallet]) {
      for (const alias of aliases[citizenWallet]) {
        if (authorityIndex.has(alias)) {
          authorities.add(alias);
          matches.push({ strategy: 'known_alias', authority: alias });
        }
      }
    }
    
    // Strategy 3: Reverse alias lookup
    for (const [mainWallet, walletAliases] of Object.entries(aliases)) {
      if (walletAliases.includes(citizenWallet)) {
        if (authorityIndex.has(mainWallet)) {
          authorities.add(mainWallet);
          matches.push({ strategy: 'reverse_alias', authority: mainWallet });
        }
        
        // Check other aliases of the main wallet
        for (const alias of walletAliases) {
          if (authorityIndex.has(alias)) {
            authorities.add(alias);
            matches.push({ strategy: 'cross_alias', authority: alias });
          }
        }
      }
    }
    
    // Strategy 4: Similar address pattern matching (for potential typos)
    const citizenPrefix = citizenWallet.slice(0, 12);
    const citizenSuffix = citizenWallet.slice(-12);
    
    for (const authority of authorityIndex.keys()) {
      if (authority !== citizenWallet && 
          (authority.startsWith(citizenPrefix) || authority.endsWith(citizenSuffix))) {
        authorities.add(authority);
        matches.push({ strategy: 'pattern_match', authority: authority });
      }
    }
    
    citizenToAuthorities.set(citizenWallet, Array.from(authorities));
    discoveredMatches.set(citizenWallet, matches);
  }
  
  // Log discovery results
  const citizensWithAuthorities = Array.from(citizenToAuthorities.entries())
    .filter(([_, authorities]) => authorities.length > 0);
  
  console.log(`Authority discovery results:`);
  console.log(`  Citizens with authorities: ${citizensWithAuthorities.length}/${citizenWallets.length}`);
  
  for (const [citizen, authorities] of citizensWithAuthorities) {
    const matches = discoveredMatches.get(citizen);
    console.log(`  ${citizen.slice(0, 8)}: ${authorities.length} authorities`);
    
    for (const match of matches.slice(0, 3)) { // Show first 3 matches
      console.log(`    ${match.strategy}: ${match.authority.slice(0, 8)}...`);
    }
  }
  
  return { citizenToAuthorities, discoveredMatches };
}

/**
 * Calculate governance power for discovered citizens
 */
function calculateCitizenGovernancePower(citizenToAuthorities, authorityIndex) {
  console.log('\nCalculating governance power for discovered citizens...');
  
  const results = {};
  
  for (const [citizenWallet, authorities] of citizenToAuthorities) {
    let totalPower = 0;
    let totalAccounts = 0;
    let allDeposits = [];
    
    for (const authority of authorities) {
      const vsrAccounts = authorityIndex.get(authority) || [];
      
      for (const vsrAccount of vsrAccounts) {
        totalAccounts++;
        
        for (const deposit of vsrAccount.deposits) {
          const multiplier = calculateMultiplier(deposit.lockupEndTs);
          const votingPower = deposit.amount * multiplier;
          totalPower += votingPower;
          
          allDeposits.push({
            amount: deposit.amount,
            lockupEndTs: deposit.lockupEndTs,
            multiplier,
            votingPower,
            accountPubkey: vsrAccount.accountPubkey,
            depositIndex: deposit.depositIndex,
            offset: deposit.offset
          });
        }
      }
    }
    
    if (totalPower > 0) {
      results[citizenWallet] = {
        wallet: citizenWallet,
        name: citizenWallet.slice(0, 8),
        nativePower: totalPower,
        matchedAccounts: totalAccounts,
        deposits: allDeposits,
        authorities: authorities
      };
    }
  }
  
  return results;
}

/**
 * Main enhanced scanner execution
 */
async function runEnhancedAuthorityScanner() {
  try {
    console.log('ENHANCED AUTHORITY VSR SCANNER');
    console.log('===============================');
    
    // Load citizen wallets
    const citizenWallets = loadCitizenWallets();
    if (citizenWallets.length === 0) {
      console.log('No citizen wallets to process');
      return;
    }
    
    // Build VSR authority index
    const authorityIndex = await buildVSRAuthorityIndex();
    
    // Discover citizen authorities
    const { citizenToAuthorities, discoveredMatches } = discoverCitizenAuthorities(citizenWallets, authorityIndex);
    
    // Calculate governance power
    const results = calculateCitizenGovernancePower(citizenToAuthorities, authorityIndex);
    
    // Display results
    const citizensWithPower = Object.values(results);
    const sortedCitizens = citizensWithPower.sort((a, b) => b.nativePower - a.nativePower);
    
    console.log('\nENHANCED DISCOVERY RESULTS:');
    console.log('===========================');
    console.log(`Citizens with governance power: ${citizensWithPower.length}/${citizenWallets.length}`);
    
    console.log('\nTop citizens by governance power:');
    for (let i = 0; i < Math.min(15, sortedCitizens.length); i++) {
      const citizen = sortedCitizens[i];
      console.log(`${i + 1}. ${citizen.name}: ${citizen.nativePower.toLocaleString()} ISLAND`);
      console.log(`   Accounts: ${citizen.matchedAccounts}, Deposits: ${citizen.deposits.length}, Authorities: ${citizen.authorities.length}`);
      
      // Show discovery strategies for this citizen
      const matches = discoveredMatches.get(citizen.wallet) || [];
      const strategies = [...new Set(matches.map(m => m.strategy))];
      console.log(`   Discovery: ${strategies.join(', ')}`);
    }
    
    // Save comprehensive results
    const outputData = {
      timestamp: new Date().toISOString(),
      scannerVersion: 'enhanced-authority-scanner',
      totalCitizens: citizenWallets.length,
      citizensWithPower: citizensWithPower.length,
      discoveryStrategies: ['direct', 'known_alias', 'reverse_alias', 'cross_alias', 'pattern_match'],
      results: sortedCitizens.map(citizen => ({
        wallet: citizen.wallet,
        name: citizen.name,
        nativePower: citizen.nativePower,
        matchedAccounts: citizen.matchedAccounts,
        totalDeposits: citizen.deposits.length,
        authorities: citizen.authorities,
        discoveryMethods: discoveredMatches.get(citizen.wallet)?.map(m => m.strategy) || []
      }))
    };
    
    fs.writeFileSync('./enhanced-authority-results.json', JSON.stringify(outputData, null, 2));
    
    console.log(`\nResults saved to: enhanced-authority-results.json`);
    console.log(`Enhanced discovery found ${citizensWithPower.length} citizens with governance power`);
    
    if (citizensWithPower.length >= 10) {
      console.log('Successfully restored comprehensive citizen detection');
    } else {
      console.log(`Partial restoration: ${citizensWithPower.length} citizens detected`);
    }
    
  } catch (error) {
    console.error('Enhanced scanner execution failed:', error);
    console.error('Stack trace:', error.stack);
  }
}

// Execute enhanced scanner
runEnhancedAuthorityScanner();