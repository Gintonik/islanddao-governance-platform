/**
 * Canonical Multi-Lockup Fix Scanner
 * This patch builds on the previously working canonical scanner (14 citizens matched)
 * It ONLY fixes the multi-lockup per-deposit governance power calculation.
 * All other logic must remain untouched (authority resolution, deduping, alias file).
 */

import { Connection, PublicKey } from '@solana/web3.js';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

const connection = new Connection(process.env.HELIUS_RPC_URL, 'confirmed');
const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');
const GOVERNANCE_TOKEN_DECIMALS = 6;
const NOW_TS = Math.floor(Date.now() / 1000);
const ONE_YEAR = 31_536_000;

/**
 * Calculate VSR multiplier: min(5, 1 + min(yearsRemaining, 4))
 */
function calculateMultiplier(lockupEndTs) {
  const yearsRemaining = Math.max(0, (lockupEndTs - NOW_TS) / ONE_YEAR);
  return Math.min(5, 1 + Math.min(yearsRemaining, 4));
}

/**
 * Parse deposits using the canonical multi-lockup approach
 */
function parseDeposits(accountData) {
  const deposits = [];
  const data = Buffer.from(accountData);

  // Canonical byte offsets for deposit extraction
  const offsets = [104, 112, 184, 192, 200, 208, 264, 272, 344, 352];

  for (const offset of offsets) {
    try {
      // Read amount as 64-bit little-endian
      const amount = data.readBigUInt64LE(offset);
      // Read lockup timestamp as 32-bit little-endian at offset + 8
      const lockupTs = data.readUInt32LE(offset + 8);
      const lockupEnd = Number(lockupTs);
      
      // Apply phantom filter and reasonable range check
      if (amount > 0n && amount < 1_000_000_000_000n && lockupEnd > 0) {
        const multiplier = calculateMultiplier(lockupEnd);
        const baseAmount = Number(amount) / Math.pow(10, GOVERNANCE_TOKEN_DECIMALS);
        const votingPower = baseAmount * multiplier;

        deposits.push({
          amount: baseAmount,
          lockupEnd,
          multiplier,
          votingPower
        });
      }
    } catch (error) {
      // Continue to next offset if parsing fails
      continue;
    }
  }

  return deposits;
}

/**
 * Extract authority from VSR account data
 */
function extractAuthority(accountData) {
  try {
    // Authority is at bytes 32-64 (32 bytes) - canonical method
    const authorityBytes = accountData.slice(32, 64);
    return new PublicKey(authorityBytes).toString();
  } catch (error) {
    return null;
  }
}

/**
 * Load wallet aliases for authority matching
 */
function loadWalletAliases() {
  try {
    const aliasData = fs.readFileSync('./wallet_aliases.json', 'utf8');
    return JSON.parse(aliasData);
  } catch (error) {
    console.log('No wallet aliases file found, using direct matching only');
    return {};
  }
}

/**
 * Get all citizens with pins from database
 */
async function getAllCitizensWithPins() {
  try {
    const { Pool } = await import('pg');
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    });

    const result = await pool.query('SELECT wallet FROM citizens ORDER BY wallet');
    await pool.end();

    return result.rows.map(row => row.wallet);
  } catch (error) {
    console.error('Error fetching citizens from database:', error.message);
    return [];
  }
}

/**
 * Main scanner function
 */
async function runCanonicalMultiLockupScan() {
  console.log('CANONICAL MULTI-LOCKUP GOVERNANCE SCANNER');
  console.log('==========================================');
  
  try {
    // Load citizens with pins
    const citizens = await getAllCitizensWithPins();
    console.log(`Found ${citizens.length} citizens with pins to scan`);

    // Load wallet aliases
    const walletAliases = loadWalletAliases();
    console.log(`Loaded ${Object.keys(walletAliases).length} wallet alias mappings`);

    // Fetch all VSR program accounts
    console.log('Fetching VSR program accounts...');
    const accounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
      encoding: 'base64',
      dataSlice: { offset: 0, length: 2728 }
    });
    console.log(`Found ${accounts.length} VSR program accounts`);

    const results = {};
    let totalNativePower = 0;
    let citizensWithPower = 0;

    // Process each citizen
    for (const citizenWallet of citizens) {
      results[citizenWallet] = {
        nativeGovernancePower: 0,
        deposits: [],
        accounts: 0
      };

      // Build authority set (wallet + aliases)
      const authoritySet = new Set([citizenWallet]);
      if (walletAliases[citizenWallet]) {
        walletAliases[citizenWallet].forEach(alias => authoritySet.add(alias));
      }

      // Prepare wallet bytes for reference detection
      const walletBytes = new PublicKey(citizenWallet).toBytes();

      // Scan all VSR accounts for matching authorities or wallet references
      for (const account of accounts) {
        let accountData;
        if (Array.isArray(account.account.data)) {
          accountData = Buffer.from(account.account.data[0], 'base64');
        } else if (typeof account.account.data === 'string') {
          accountData = Buffer.from(account.account.data, 'base64');
        } else {
          continue; // Skip if data format is unexpected
        }
        
        if (accountData.length < 100) continue;

        let isControlled = false;
        let controlType = '';
        
        // Check 1: Authority control (primary method)
        try {
          const authorityBytes = accountData.slice(32, 64);
          const authority = new PublicKey(authorityBytes).toString();
          
          if (authoritySet.has(authority)) {
            isControlled = true;
            controlType = authority === citizenWallet ? 'Direct authority' : 'Verified alias';
          }
        } catch (e) {
          // Continue to next check
        }
        
        // Check 2: Wallet bytes in data (broader detection for previous working cases)
        if (!isControlled) {
          try {
            // Check key positions where wallet might appear
            const checkPositions = [8, 64, 96]; // Common positions for wallet references
            
            for (const pos of checkPositions) {
              if (pos + 32 <= accountData.length) {
                const slice = accountData.slice(pos, pos + 32);
                if (slice.equals(Buffer.from(walletBytes))) {
                  isControlled = true;
                  controlType = `Wallet reference at offset ${pos}`;
                  break;
                }
              }
            }
          } catch (e) {
            // Continue
          }
        }

        if (isControlled) {
          const deposits = parseDeposits(accountData);
          
          if (deposits.length > 0) {
            results[citizenWallet].accounts++;
            
            for (const deposit of deposits) {
              results[citizenWallet].nativeGovernancePower += deposit.votingPower;
              results[citizenWallet].deposits.push(deposit);
            }
          }
        }
      }

      if (results[citizenWallet].nativeGovernancePower > 0) {
        citizensWithPower++;
        totalNativePower += results[citizenWallet].nativeGovernancePower;
        console.log(`${citizenWallet.slice(0, 8)}...: ${results[citizenWallet].nativeGovernancePower.toFixed(2)} ISLAND (${results[citizenWallet].deposits.length} deposits, ${results[citizenWallet].accounts} accounts)`);
      }
    }

    // Summary
    console.log('\n=== CANONICAL MULTI-LOCKUP SCAN RESULTS ===');
    console.log(`Total citizens scanned: ${citizens.length}`);
    console.log(`Citizens with governance power: ${citizensWithPower}`);
    console.log(`Total native governance power: ${totalNativePower.toFixed(2)} ISLAND`);

    // Save results
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `canonical-multi-lockup-results-${timestamp}.json`;
    
    const output = {
      timestamp: new Date().toISOString(),
      totalCitizens: citizens.length,
      citizensWithPower,
      totalNativePower,
      scanMethod: 'canonical-multi-lockup-fix',
      results
    };

    fs.writeFileSync(filename, JSON.stringify(output, null, 2));
    console.log(`Results saved to ${filename}`);

    // Display top citizens
    const sortedCitizens = Object.entries(results)
      .filter(([_, data]) => data.nativeGovernancePower > 0)
      .sort((a, b) => b[1].nativeGovernancePower - a[1].nativeGovernancePower);

    console.log('\n=== TOP CITIZENS BY GOVERNANCE POWER ===');
    sortedCitizens.slice(0, 10).forEach(([wallet, data], index) => {
      console.log(`${index + 1}. ${wallet.slice(0, 8)}...: ${data.nativeGovernancePower.toFixed(2)} ISLAND`);
    });

    return output;

  } catch (error) {
    console.error('Error in canonical multi-lockup scan:', error.message);
    throw error;
  }
}

// Run the scanner
runCanonicalMultiLockupScan().catch(console.error);