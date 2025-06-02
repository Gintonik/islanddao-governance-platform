/**
 * Debug Delegation Detection
 * Examines Voter accounts to understand why delegation relationships aren't being detected
 */

import { Connection, PublicKey } from '@solana/web3.js';
import dotenv from 'dotenv';

dotenv.config();

const connection = new Connection(process.env.HELIUS_RPC_URL);
const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');

// Target wallets that should have delegation
const TARGET_WALLETS = [
  '3PKhzE9wuEkGPHHu2sNCvG86xNtDJduAcyBPXpE6cSNt', // Expected ~1.27M delegated
  'Fywb7YDCXxtD7pNKThJ36CAtVe23dEeEPf7HqKzJs1VG'  // Expected ~1.6M delegated
];

/**
 * Parse authority and voterAuthority from Voter account at different offsets
 */
function parseVoterAuthoritiesDebug(data) {
  const results = {};
  
  // Try different offset combinations
  const offsetCombinations = [
    { authOffset: 8, voterOffset: 40, name: 'Current (8,40)' },
    { authOffset: 40, voterOffset: 8, name: 'Swapped (40,8)' },
    { authOffset: 72, voterOffset: 104, name: 'Later (72,104)' },
    { authOffset: 104, voterOffset: 136, name: 'Much later (104,136)' }
  ];
  
  for (const { authOffset, voterOffset, name } of offsetCombinations) {
    try {
      const authority = new PublicKey(data.slice(authOffset, authOffset + 32)).toBase58();
      const voterAuthority = new PublicKey(data.slice(voterOffset, voterOffset + 32)).toBase58();
      
      results[name] = { authority, voterAuthority };
    } catch (error) {
      results[name] = { error: error.message };
    }
  }
  
  return results;
}

/**
 * Extract deposit power from Voter account
 */
function extractDepositPower(data) {
  // Try extracting power from various deposit offsets
  const depositOffsets = [112, 144, 176, 208, 240];
  let totalPower = 0;
  
  for (const offset of depositOffsets) {
    try {
      const rawValue = Number(data.readBigUInt64LE(offset));
      const islandAmount = rawValue / 1e6;
      
      if (islandAmount >= 1000 && islandAmount <= 50000000 && rawValue !== 4294967296) {
        totalPower += islandAmount;
      }
    } catch (error) {
      // Continue
    }
  }
  
  return totalPower;
}

/**
 * Debug specific Voter accounts for delegation patterns
 */
async function debugDelegationPatterns() {
  console.log('🔍 DEBUGGING DELEGATION DETECTION');
  console.log('==================================');
  
  // Load a sample of Voter accounts
  const voterAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
    filters: [{ dataSize: 2728 }]
  });
  
  console.log(`📊 Found ${voterAccounts.length} Voter accounts`);
  
  let potentialDelegations = 0;
  let accountsAnalyzed = 0;
  
  for (const { pubkey, account } of voterAccounts.slice(0, 100)) { // Analyze first 100
    accountsAnalyzed++;
    const data = account.data;
    
    // Parse authorities using different methods
    const authResults = parseVoterAuthoritiesDebug(data);
    const depositPower = extractDepositPower(data);
    
    if (depositPower > 0) {
      console.log(`\n📋 Account: ${pubkey.toBase58()}`);
      console.log(`💰 Deposit Power: ${depositPower.toLocaleString()} ISLAND`);
      
      for (const [method, result] of Object.entries(authResults)) {
        if (!result.error) {
          const { authority, voterAuthority } = result;
          const isDelegated = authority !== voterAuthority;
          
          console.log(`   ${method}: ${isDelegated ? '🔄' : '👤'} ${authority.substring(0,8)}... → ${voterAuthority.substring(0,8)}...`);
          
          if (isDelegated) {
            potentialDelegations++;
            
            // Check if this involves our target wallets
            for (const targetWallet of TARGET_WALLETS) {
              if (authority === targetWallet || voterAuthority === targetWallet) {
                console.log(`   ⭐ INVOLVES TARGET: ${targetWallet.substring(0,8)}...`);
                if (voterAuthority === targetWallet && authority !== targetWallet) {
                  console.log(`   ✅ INCOMING DELEGATION: ${authority.substring(0,8)}... → ${targetWallet.substring(0,8)}... (${depositPower.toLocaleString()} ISLAND)`);
                }
              }
            }
          }
        }
      }
    }
  }
  
  console.log(`\n📊 SUMMARY:`);
  console.log(`Accounts analyzed: ${accountsAnalyzed}`);
  console.log(`Potential delegations found: ${potentialDelegations}`);
}

async function run() {
  try {
    await debugDelegationPatterns();
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

run();