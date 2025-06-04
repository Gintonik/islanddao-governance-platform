/**
 * Find Target Delegations
 * Search specifically for Voter accounts involving our target wallets
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
 * Extract deposit power from Voter account
 */
function extractDepositPower(data) {
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
 * Search for accounts that contain our target wallets in authority fields
 */
async function findTargetWalletDelegations() {
  console.log('🎯 SEARCHING FOR TARGET WALLET DELEGATIONS');
  console.log('===========================================');
  
  for (const targetWallet of TARGET_WALLETS) {
    console.log(`\n🔍 Searching for: ${targetWallet}`);
    
    // Method 1: Look for accounts where target wallet is at offset 8 (authority)
    console.log('   📊 Checking authority position (offset 8)...');
    const authorityAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
      filters: [
        { dataSize: 2728 },
        { memcmp: { offset: 8, bytes: targetWallet } }
      ]
    });
    
    console.log(`   Found ${authorityAccounts.length} accounts with ${targetWallet.substring(0,8)}... as authority`);
    
    for (const { pubkey, account } of authorityAccounts) {
      const authorities = parseVoterAuthorities(account.data);
      const depositPower = extractDepositPower(account.data);
      
      if (authorities && depositPower > 0) {
        const { authority, voterAuthority } = authorities;
        const isDelegated = authority !== voterAuthority;
        
        console.log(`     📋 ${pubkey.toBase58()}: ${depositPower.toLocaleString()} ISLAND`);
        console.log(`        Authority: ${authority.substring(0,8)}...`);
        console.log(`        VoterAuth: ${voterAuthority.substring(0,8)}...`);
        console.log(`        Delegated: ${isDelegated ? 'YES → ' + voterAuthority.substring(0,8) + '...' : 'NO'}`);
      }
    }
    
    // Method 2: Look for accounts where target wallet is at offset 40 (voterAuthority)
    console.log('   📊 Checking voterAuthority position (offset 40)...');
    const voterAuthorityAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
      filters: [
        { dataSize: 2728 },
        { memcmp: { offset: 40, bytes: targetWallet } }
      ]
    });
    
    console.log(`   Found ${voterAuthorityAccounts.length} accounts with ${targetWallet.substring(0,8)}... as voterAuthority`);
    
    for (const { pubkey, account } of voterAuthorityAccounts) {
      const authorities = parseVoterAuthorities(account.data);
      const depositPower = extractDepositPower(account.data);
      
      if (authorities && depositPower > 0) {
        const { authority, voterAuthority } = authorities;
        const isIncomingDelegation = authority !== voterAuthority && voterAuthority === targetWallet;
        
        console.log(`     📋 ${pubkey.toBase58()}: ${depositPower.toLocaleString()} ISLAND`);
        console.log(`        Authority: ${authority.substring(0,8)}...`);
        console.log(`        VoterAuth: ${voterAuthority.substring(0,8)}...`);
        console.log(`        Incoming:  ${isIncomingDelegation ? 'YES ← ' + authority.substring(0,8) + '...' : 'NO'}`);
        
        if (isIncomingDelegation) {
          console.log(`        ⭐ FOUND INCOMING DELEGATION: ${authority.substring(0,8)}... → ${targetWallet.substring(0,8)}... (${depositPower.toLocaleString()} ISLAND)`);
        }
      }
    }
  }
}

async function run() {
  try {
    await findTargetWalletDelegations();
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

run();