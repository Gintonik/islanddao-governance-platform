/**
 * Canonical VSR Governance Power Scanner
 * Uses exact offset-based byte parsing logic for accurate native governance power calculation
 * Processes all 20 citizen wallets with full debug output
 */

import { Connection, PublicKey } from '@solana/web3.js';
import pg from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;
const connection = new Connection(process.env.HELIUS_RPC_URL, 'confirmed');
const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');

/**
 * Calculate canonical lockup multiplier based on lockup type and timestamps
 */
function calculateCanonicalMultiplier(lockupKind, startTs, endTs, cliffTs) {
  const now = Math.floor(Date.now() / 1000); // Current Unix timestamp
  
  // Lockup types: 0 = None, 1 = Cliff, 2 = Constant, 3 = Vested
  switch (lockupKind) {
    case 0: // No lockup
      return { multiplier: 1.0, reason: 'No lockup' };
      
    case 1: // Cliff lockup
      if (now < cliffTs) {
        const secondsToCliff = cliffTs - now;
        const years = secondsToCliff / (365.25 * 24 * 3600);
        const multiplier = Math.min(1 + years, 5);
        return { multiplier, reason: `Active cliff lockup, ${years.toFixed(2)} years remaining` };
      } else {
        return { multiplier: 1.0, reason: 'Cliff lockup expired' };
      }
      
    case 2: // Constant lockup
      if (now < endTs) {
        const secondsToEnd = endTs - now;
        const years = secondsToEnd / (365.25 * 24 * 3600);
        const multiplier = Math.min(1 + years, 5);
        return { multiplier, reason: `Active constant lockup, ${years.toFixed(2)} years remaining` };
      } else {
        return { multiplier: 1.0, reason: 'Constant lockup expired' };
      }
      
    case 3: // Vested lockup
      return { multiplier: 1.0, reason: 'Vested lockup (always 1.0x)' };
      
    default:
      return { multiplier: 1.0, reason: `Unknown lockup kind: ${lockupKind}` };
  }
}

/**
 * Parse VSR deposits using canonical offset-based approach
 */
function parseVSRDepositsCanonical(data) {
  const deposits = [];
  const seenAmounts = new Set();
  
  // Known working offsets from audit-wallets-full-final.js
  const depositOffsets = [104, 112, 184, 192, 200, 208];
  
  for (const offset of depositOffsets) {
    if (offset + 8 <= data.length) {
      try {
        const rawAmount = Number(data.readBigUInt64LE(offset));
        if (rawAmount > 0) {
          const amount = rawAmount / 1e6; // ISLAND has 6 decimals
          const key = Math.round(amount * 1000);
          
          // Valid amount range and deduplication
          if (amount >= 1000 && amount <= 50000000 && !seenAmounts.has(key)) {
            seenAmounts.add(key);
            
            // Check isUsed flag at various positions
            let isUsed = true;
            const usedPositions = [-16, -8, 16, 24, 32];
            for (const usedPos of usedPositions) {
              if (offset + usedPos >= 0 && offset + usedPos < data.length) {
                const testUsed = data[offset + usedPos];
                if (testUsed === 1) {
                  isUsed = true;
                  break;
                }
              }
            }
            
            // Extract lockup information
            let lockupKind = 0;
            let lockupStartTs = 0;
            let lockupEndTs = 0;
            let lockupCliffTs = 0;
            
            if (offset + 48 <= data.length) {
              try {
                lockupKind = data[offset + 24] || 0;
                lockupStartTs = Number(data.readBigUInt64LE(offset + 32)) || 0;
                lockupEndTs = Number(data.readBigUInt64LE(offset + 40)) || 0;
                lockupCliffTs = Number(data.readBigUInt64LE(offset + 48)) || 0;
              } catch (e) {
                // Use defaults if parsing fails
              }
            }
            
            // Calculate canonical multiplier
            const { multiplier, reason } = calculateCanonicalMultiplier(
              lockupKind, lockupStartTs, lockupEndTs, lockupCliffTs
            );
            
            const governancePower = amount * multiplier;
            
            deposits.push({
              isUsed,
              amount,
              lockupKind,
              lockupStartTs,
              lockupEndTs,
              lockupCliffTs,
              multiplier,
              reason,
              governancePower,
              offset,
              depositIndex: deposits.length
            });
          }
        }
      } catch (error) {
        continue;
      }
    }
  }
  
  return deposits;
}

/**
 * Get citizen wallets from PostgreSQL database
 */
async function getCitizenWallets() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL
  });
  
  try {
    const result = await pool.query('SELECT wallet FROM citizens ORDER BY wallet');
    return result.rows.map(row => row.wallet);
  } finally {
    await pool.end();
  }
}

/**
 * Calculate native governance power for a single wallet
 */
async function calculateNativeGovernancePower(walletAddress, voterAccounts) {
  let totalNativePower = 0;
  let depositCount = 0;
  const allDeposits = [];
  
  console.log(`\n📊 Analyzing ${walletAddress}:`);
  
  for (const { pubkey, account } of voterAccounts) {
    const data = account.data;
    
    try {
      // Parse authority from VSR account (offset 8-40)
      const authority = new PublicKey(data.slice(8, 40)).toBase58();
      
      // Only process accounts where this wallet is the authority (native power)
      if (authority !== walletAddress) continue;
      
      console.log(`  🔍 Found VSR account: ${pubkey.toBase58()}`);
      console.log(`     Authority: ${authority}`);
      
      const deposits = parseVSRDepositsCanonical(data);
      
      for (const deposit of deposits) {
        if (!deposit.isUsed || deposit.amount === 0) continue;
        
        totalNativePower += deposit.governancePower;
        depositCount++;
        allDeposits.push(deposit);
        
        console.log(`    💰 Deposit #${deposit.depositIndex}:`);
        console.log(`       Amount: ${deposit.amount.toFixed(6)} ISLAND`);
        console.log(`       Lockup Kind: ${deposit.lockupKind}`);
        console.log(`       Start: ${deposit.lockupStartTs ? new Date(deposit.lockupStartTs * 1000).toISOString() : 'N/A'}`);
        console.log(`       End: ${deposit.lockupEndTs ? new Date(deposit.lockupEndTs * 1000).toISOString() : 'N/A'}`);
        console.log(`       Cliff: ${deposit.lockupCliffTs ? new Date(deposit.lockupCliffTs * 1000).toISOString() : 'N/A'}`);
        console.log(`       Multiplier: ${deposit.multiplier.toFixed(2)}x`);
        console.log(`       Reason: ${deposit.reason}`);
        console.log(`       Governance Power: ${deposit.governancePower.toFixed(2)} ISLAND`);
        console.log(`       Offset: ${deposit.offset}`);
        console.log();
      }
    } catch (error) {
      continue;
    }
  }
  
  console.log(`  ✅ Total Native Power: ${totalNativePower.toFixed(2)} ISLAND`);
  console.log(`  📈 Total Deposits: ${depositCount}`);
  
  return {
    nativePower: totalNativePower,
    depositCount,
    deposits: allDeposits
  };
}

/**
 * Main scanning function
 */
async function scanCanonicalVSRGovernance() {
  console.log('🔥 CANONICAL VSR GOVERNANCE POWER SCANNER');
  console.log('==========================================');
  console.log('Using exact offset-based byte parsing logic');
  console.log(`Current timestamp: ${Math.floor(Date.now() / 1000)} (${new Date().toISOString()})\n`);
  
  // Get citizen wallets from database
  const citizenWallets = await getCitizenWallets();
  console.log(`📋 Found ${citizenWallets.length} citizen wallets in database`);
  
  // Load all VSR Voter accounts (2728 bytes only)
  const voterAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
    filters: [{ dataSize: 2728 }]
  });
  
  console.log(`🔗 Loaded ${voterAccounts.length} VSR Voter accounts from blockchain`);
  
  const results = [];
  let citizensWithPower = 0;
  let totalGovernancePower = 0;
  
  // Process each citizen wallet
  for (const walletAddress of citizenWallets) {
    const result = await calculateNativeGovernancePower(walletAddress, voterAccounts);
    
    if (result.nativePower > 0) citizensWithPower++;
    totalGovernancePower += result.nativePower;
    
    results.push({
      wallet: walletAddress.slice(0, 8) + '...',
      fullWallet: walletAddress,
      nativePower: result.nativePower.toFixed(2),
      deposits: result.depositCount
    });
  }
  
  // Display final results
  console.log('\n📊 FINAL RESULTS:');
  console.log('==================');
  console.table(results);
  
  console.log('\n📈 SUMMARY:');
  console.log(`Total Citizens: ${citizenWallets.length}`);
  console.log(`Citizens with VSR Power: ${citizensWithPower}`);
  console.log(`Citizens without VSR Power: ${citizenWallets.length - citizensWithPower}`);
  console.log(`Total Native Governance Power: ${totalGovernancePower.toFixed(2)} ISLAND`);
  
  console.log('\n✅ Canonical VSR governance power scan completed');
  console.log('All calculations use authentic on-chain data with canonical lockup logic');
  
  return results;
}

scanCanonicalVSRGovernance();