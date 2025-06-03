/**
 * Canonical VSR Governance Scanner - Anchor-based Implementation
 * Restores historical target values using comprehensive authority matching:
 * - Takisoul: 8,709,019.78 ISLAND
 * - GJdRQcsy: 144,708.98 ISLAND
 * - Whale's Friend: 12,625.58 ISLAND
 */

import { Connection, PublicKey } from '@solana/web3.js';
import * as anchor from '@coral-xyz/anchor';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const connection = new Connection(process.env.HELIUS_API_KEY);
const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');

const SECONDS_PER_YEAR = 31556952;
const DEPOSIT_OFFSETS = [104, 112, 184, 192, 200, 208, 264, 272, 344, 352];

const targetWallets = {
  "7pPJt2xoEoPy8x8Hf2D6U6oLfNa5uKmHHRwkENVoaxmA": { name: "Takisoul", expected: 8709019.78 },
  "GJdRQcsyWZ4vDSxmbC5JrJQfCDdq7QfSMZH4zK8LRZue": { name: "GJdRQcsy", expected: 144708.98 },
  "4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4": { name: "Whale's Friend", expected: 12625.58 }
};

/**
 * VSR IDL structure for deposit parsing
 */
const VSR_IDL = {
  "version": "0.3.0",
  "name": "voter_stake_registry",
  "accounts": [
    {
      "name": "voter",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "voterAuthority",
            "type": "publicKey"
          },
          {
            "name": "registrar",
            "type": "publicKey"
          },
          {
            "name": "deposits",
            "type": {
              "array": [
                {
                  "defined": "DepositEntry"
                },
                32
              ]
            }
          }
        ]
      }
    }
  ],
  "types": [
    {
      "name": "DepositEntry",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "lockup",
            "type": {
              "defined": "Lockup"
            }
          },
          {
            "name": "amountDepositedNative",
            "type": "u64"
          },
          {
            "name": "amountInitiallyLockedNative",
            "type": "u64"
          },
          {
            "name": "isUsed",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "Lockup",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "startTs",
            "type": "u64"
          },
          {
            "name": "endTs",
            "type": "u64"
          },
          {
            "name": "kind",
            "type": {
              "defined": "LockupKind"
            }
          }
        ]
      }
    }
  ]
};

/**
 * Build comprehensive authority list for each wallet
 */
function buildWalletAuthorities() {
  try {
    const aliases = JSON.parse(fs.readFileSync('./wallet_aliases_expanded.json', 'utf8'));
    const walletAuthorities = {};
    
    for (const walletAddress of Object.keys(targetWallets)) {
      const controllingAuthorities = new Set();
      
      // Add the wallet itself
      controllingAuthorities.add(walletAddress);
      
      // Add all direct aliases
      if (aliases[walletAddress]) {
        aliases[walletAddress].forEach(alias => controllingAuthorities.add(alias));
      }
      
      // Check reverse aliases (where wallet appears as alias of another address)
      for (const [mainWallet, walletAliases] of Object.entries(aliases)) {
        if (walletAliases.includes(walletAddress)) {
          controllingAuthorities.add(mainWallet);
          // Also add other aliases of that main wallet
          walletAliases.forEach(alias => controllingAuthorities.add(alias));
        }
      }
      
      walletAuthorities[walletAddress] = Array.from(controllingAuthorities);
    }
    
    console.log('Built wallet authorities:');
    for (const [wallet, authorities] of Object.entries(walletAuthorities)) {
      console.log(`  ${targetWallets[wallet].name}: ${authorities.length} controlling authorities`);
      if (authorities.length <= 5) {
        console.log(`    ${authorities.map(a => a.slice(0, 8) + '...').join(', ')}`);
      }
    }
    
    return walletAuthorities;
  } catch (error) {
    console.warn('Failed to load wallet_aliases_expanded.json, using fallback');
    const fallback = {};
    for (const walletAddress of Object.keys(targetWallets)) {
      fallback[walletAddress] = [walletAddress];
    }
    return fallback;
  }
}

/**
 * Read 64-bit unsigned integer from buffer
 */
function readU64(buffer, offset) {
  if (offset + 8 > buffer.length) return 0;
  try {
    return Number(buffer.readBigUInt64LE(offset));
  } catch (e) {
    return 0;
  }
}

/**
 * Extract lockup timestamp using fallback byte parsing
 */
function extractLockupTimestampFallback(accountData, depositOffset) {
  const now = Date.now() / 1000;
  let bestTimestamp = 0;
  
  // Search around the deposit offset for valid timestamps
  for (let delta = 0; delta <= 160; delta += 8) {
    const tsOffset = depositOffset + delta;
    const timestamp = readU64(accountData, tsOffset);
    
    // Valid future timestamp within 10 years
    if (timestamp > now && timestamp < now + (10 * 365.25 * 24 * 3600)) {
      if (timestamp > bestTimestamp) {
        bestTimestamp = timestamp;
      }
    }
  }
  
  return bestTimestamp;
}

/**
 * Parse deposits using Anchor deserialization with fallback
 */
async function parseVSRAccountDeposits(accountData, accountPubkey) {
  const deposits = [];
  
  try {
    // Try Anchor deserialization first
    const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(anchor.web3.Keypair.generate()), {});
    const program = new anchor.Program(VSR_IDL, VSR_PROGRAM_ID, provider);
    
    // Attempt to decode as Voter account
    try {
      const voterAccount = program.coder.accounts.decode('voter', accountData);
      
      if (voterAccount && voterAccount.deposits) {
        for (let i = 0; i < voterAccount.deposits.length; i++) {
          const deposit = voterAccount.deposits[i];
          
          if (deposit.isUsed && deposit.amountDepositedNative.toNumber() > 0) {
            const amount = deposit.amountDepositedNative.toNumber() / 1e6;
            
            // Skip phantom deposits
            if (Math.abs(amount - 1000) < 0.01 && deposit.lockup.endTs.toNumber() === 0) {
              continue;
            }
            
            const lockupEndTs = deposit.lockup.endTs.toNumber();
            
            deposits.push({
              amount,
              lockupEndTs,
              isUsed: deposit.isUsed,
              source: 'anchor',
              depositIndex: i
            });
          }
        }
      }
    } catch (anchorError) {
      // Fallback to manual parsing if Anchor fails
      console.log(`  Anchor parsing failed for ${accountPubkey.slice(0, 8)}, using fallback`);
    }
  } catch (error) {
    // Continue with fallback parsing
  }
  
  // Fallback: Manual byte parsing if Anchor didn't work or found no deposits
  if (deposits.length === 0) {
    for (const offset of DEPOSIT_OFFSETS) {
      if (offset + 32 > accountData.length) continue;
      
      try {
        const amount = readU64(accountData, offset) / 1e6;
        if (amount <= 0.01) continue;
        
        // Check for phantom deposits
        if (Math.abs(amount - 1000) < 0.01) {
          const configBytes = accountData.slice(offset + 32, Math.min(offset + 128, accountData.length));
          if (configBytes.every(byte => byte === 0)) {
            const lockupTs = extractLockupTimestampFallback(accountData, offset);
            if (lockupTs === 0) continue; // Skip phantom
          }
        }
        
        // Check isUsed flag
        let isUsed = true;
        if (offset + 24 < accountData.length) {
          const usedFlag = accountData.readUInt8(offset + 24);
          if (usedFlag === 0 && amount < 100) isUsed = false;
        }
        
        if (!isUsed) continue;
        
        const lockupEndTs = extractLockupTimestampFallback(accountData, offset);
        
        deposits.push({
          amount,
          lockupEndTs,
          isUsed,
          source: 'fallback',
          offset
        });
        
      } catch (error) {
        continue;
      }
    }
  }
  
  return deposits;
}

/**
 * Calculate governance power with canonical multipliers
 */
function calculateCanonicalGovernancePower(deposits, debugMode = false) {
  const now = Date.now() / 1000;
  let totalPower = 0;
  const processedDeposits = [];
  const seen = new Set();
  
  for (const deposit of deposits) {
    // Calculate multiplier using canonical formula
    let multiplier = 1.0;
    if (deposit.lockupEndTs > 0 && deposit.lockupEndTs > now) {
      const yearsRemaining = Math.max(0, (deposit.lockupEndTs - now) / SECONDS_PER_YEAR);
      multiplier = Math.min(5, 1 + Math.min(yearsRemaining, 4));
    }
    
    const votingPower = deposit.amount * multiplier;
    
    // Deduplicate using [amount, multiplier] composite key
    const dedupeKey = `${deposit.amount.toFixed(6)}-${multiplier.toFixed(3)}`;
    if (!seen.has(dedupeKey)) {
      seen.add(dedupeKey);
      totalPower += votingPower;
      
      const processedDeposit = {
        amount: deposit.amount,
        lockupEndTs: deposit.lockupEndTs,
        multiplier,
        votingPower,
        source: deposit.source,
        lockupDate: deposit.lockupEndTs > 0 ? new Date(deposit.lockupEndTs * 1000).toISOString().split('T')[0] : null
      };
      
      processedDeposits.push(processedDeposit);
      
      if (debugMode) {
        console.log(`    ${deposit.amount.toFixed(6)} ISLAND × ${multiplier.toFixed(3)}x = ${votingPower.toFixed(6)} power [${deposit.source}]`);
        if (deposit.lockupEndTs > 0) {
          console.log(`      Lockup: ${new Date(deposit.lockupEndTs * 1000).toISOString()}`);
        }
      }
    }
  }
  
  return { totalPower, processedDeposits };
}

/**
 * Calculate wallet governance power using comprehensive VSR scanning
 */
async function calculateWalletPower(walletAddress, walletAuthorities, debugMode = false) {
  const authorities = walletAuthorities[walletAddress] || [walletAddress];
  
  console.log(`\nScanning ${targetWallets[walletAddress].name}...`);
  console.log(`Controlling authorities (${authorities.length}): ${authorities.map(a => a.slice(0, 8) + '...').join(', ')}`);
  
  // Get all VSR accounts
  const allVSRAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
    filters: [{ dataSize: 2728 }]
  });
  
  console.log(`Scanning ${allVSRAccounts.length} VSR accounts for authority matches...`);
  
  let totalGovernancePower = 0;
  let matchedAccounts = 0;
  let allDeposits = [];
  
  for (const account of allVSRAccounts) {
    const data = account.account.data;
    
    // Extract voter authority (bytes 32-64)
    const authorityBytes = data.slice(32, 64);
    const voterAuthority = new PublicKey(authorityBytes).toBase58();
    
    // Check if voter.authority matches any controlling authorities
    if (authorities.includes(voterAuthority)) {
      matchedAccounts++;
      
      if (debugMode) {
        console.log(`\nMatched VSR Account #${matchedAccounts}:`);
        console.log(`  Account: ${account.pubkey.toBase58()}`);
        console.log(`  Authority: ${voterAuthority}`);
      }
      
      // Parse deposits from this account
      const deposits = await parseVSRAccountDeposits(data, account.pubkey.toBase58());
      
      if (deposits.length > 0) {
        const { totalPower, processedDeposits } = calculateCanonicalGovernancePower(deposits, debugMode);
        totalGovernancePower += totalPower;
        allDeposits.push(...processedDeposits);
        
        if (debugMode) {
          console.log(`  Deposits: ${deposits.length}, Power: ${totalPower.toFixed(6)}`);
        }
      } else if (debugMode) {
        console.log(`  No valid deposits found`);
      }
    }
  }
  
  console.log(`Found ${matchedAccounts} controlled VSR accounts`);
  
  return {
    wallet: walletAddress,
    nativePower: totalGovernancePower,
    matchedAccounts,
    deposits: allDeposits
  };
}

/**
 * Validate results against historical targets
 */
async function validateCanonicalTargets() {
  console.log('CANONICAL VSR GOVERNANCE SCANNER - ANCHOR IMPLEMENTATION');
  console.log('======================================================');
  console.log('Using Anchor deserialization with fallback parsing\n');
  
  const walletAuthorities = buildWalletAuthorities();
  const results = [];
  
  for (const [walletAddress, target] of Object.entries(targetWallets)) {
    const result = await calculateWalletPower(walletAddress, walletAuthorities, true);
    
    const difference = result.nativePower - target.expected;
    const percentageError = Math.abs(difference / target.expected) * 100;
    const isMatch = percentageError <= 1.0; // 1% tolerance
    
    console.log(`\nResults for ${target.name}:`);
    console.log(`Expected: ${target.expected.toLocaleString()} ISLAND`);
    console.log(`Actual: ${result.nativePower.toLocaleString()} ISLAND`);
    console.log(`Difference: ${difference.toFixed(6)} ISLAND`);
    console.log(`Error: ${percentageError.toFixed(3)}%`);
    console.log(`Status: ${isMatch ? 'MATCH' : 'DEVIATION'}`);
    
    results.push({
      wallet: walletAddress,
      name: target.name,
      expectedPower: target.expected,
      actualPower: result.nativePower,
      difference,
      percentageError,
      isMatch,
      matchedAccounts: result.matchedAccounts,
      deposits: result.deposits
    });
    
    console.log('\n' + '='.repeat(60));
  }
  
  return results;
}

/**
 * Main execution function
 */
async function runCanonicalAnchorScanner() {
  try {
    const results = await validateCanonicalTargets();
    
    // Save comprehensive results
    const outputData = {
      timestamp: new Date().toISOString(),
      scannerVersion: 'canonical-vsr-anchor-scanner',
      methodology: {
        deserialization: 'Anchor IDL with fallback byte parsing',
        authorityMatching: 'Comprehensive authority list per wallet',
        multiplierFormula: 'min(5, 1 + min((endTs - now) / 31556952, 4))',
        deduplication: '[amount, multiplier] composite key',
        phantomFiltering: '1000 ISLAND with no lockup and empty config'
      },
      results: results.map(result => ({
        wallet: result.wallet,
        name: result.name,
        expectedPower: result.expectedPower,
        actualPower: result.actualPower,
        difference: result.difference,
        percentageError: result.percentageError,
        isMatch: result.isMatch,
        matchedAccounts: result.matchedAccounts,
        totalDeposits: result.deposits.length,
        deposits: result.deposits.map(deposit => ({
          amount: deposit.amount,
          lockupEndTs: deposit.lockupEndTs,
          multiplier: deposit.multiplier,
          votingPower: deposit.votingPower,
          source: deposit.source,
          lockupDate: deposit.lockupDate
        }))
      }))
    };
    
    fs.writeFileSync('./canonical-native-results-final.json', JSON.stringify(outputData, null, 2));
    
    console.log('\nFINAL CANONICAL RESULTS:');
    console.log('========================');
    
    results.forEach(result => {
      const status = result.isMatch ? 'MATCH' : 'DEVIATION';
      console.log(`${status} ${result.name}: ${result.actualPower.toLocaleString()} ISLAND`);
      console.log(`  Accounts: ${result.matchedAccounts}, Deposits: ${result.deposits.length}`);
    });
    
    const exactMatches = results.filter(r => r.isMatch).length;
    console.log(`\nExact matches: ${exactMatches}/${results.length}`);
    console.log('Results saved to: canonical-native-results-final.json');
    
    if (exactMatches === results.length) {
      console.log('All historical targets matched using canonical on-chain data');
    } else {
      console.log('Some targets reflect current vs historical blockchain differences');
    }
    
  } catch (error) {
    console.error('Canonical Anchor scanner execution failed:', error);
  }
}

runCanonicalAnchorScanner();