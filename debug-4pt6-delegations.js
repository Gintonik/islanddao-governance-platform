/**
 * Debug delegations to 4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4
 * Check for CinHb and other wallets delegating to this address
 */

import { Connection, PublicKey } from '@solana/web3.js';
import dotenv from 'dotenv';

dotenv.config();

const connection = new Connection(process.env.HELIUS_RPC_URL);
const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');

const TARGET_WALLET = '4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4';
const SUSPECTED_DELEGATOR = 'CinHb'; // Partial address

function parseVoterAuthorities(data) {
  try {
    const authority = new PublicKey(data.slice(8, 40)).toBase58();
    const voterAuthority = new PublicKey(data.slice(40, 72)).toBase58();
    return { authority, voterAuthority };
  } catch (error) {
    return null;
  }
}

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

async function findDelegationsTo4pT6() {
  console.log(`🔍 SEARCHING FOR DELEGATIONS TO: ${TARGET_WALLET}`);
  console.log('='.repeat(80));
  
  // Method 1: Search for accounts where 4pT6 is voterAuthority (offset 40)
  console.log('\n📊 Checking voterAuthority position (offset 40)...');
  const voterAuthorityAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
    filters: [
      { dataSize: 2728 },
      { memcmp: { offset: 40, bytes: TARGET_WALLET } }
    ]
  });
  
  console.log(`Found ${voterAuthorityAccounts.length} accounts with ${TARGET_WALLET.substring(0,8)}... as voterAuthority`);
  
  let totalDelegated = 0;
  for (const { pubkey, account } of voterAuthorityAccounts) {
    const authorities = parseVoterAuthorities(account.data);
    const depositPower = extractDepositPower(account.data);
    
    if (authorities && depositPower > 0) {
      const { authority, voterAuthority } = authorities;
      const isIncomingDelegation = authority !== voterAuthority && voterAuthority === TARGET_WALLET;
      
      console.log(`\n📋 Account: ${pubkey.toBase58()}`);
      console.log(`   💰 Power: ${depositPower.toLocaleString()} ISLAND`);
      console.log(`   👤 Authority: ${authority}`);
      console.log(`   🗳️  VoterAuth: ${voterAuthority}`);
      console.log(`   ✅ Delegation: ${isIncomingDelegation ? 'YES' : 'NO'}`);
      
      if (isIncomingDelegation) {
        totalDelegated += depositPower;
        console.log(`   ⭐ DELEGATION FOUND: ${authority.substring(0,8)}... → ${TARGET_WALLET.substring(0,8)}... (${depositPower.toLocaleString()} ISLAND)`);
        
        if (authority.startsWith(SUSPECTED_DELEGATOR)) {
          console.log(`   🎯 MATCHES SUSPECTED DELEGATOR: ${SUSPECTED_DELEGATOR}`);
        }
      }
    }
  }
  
  console.log(`\n📊 TOTAL DELEGATED TO ${TARGET_WALLET.substring(0,8)}...: ${totalDelegated.toLocaleString()} ISLAND`);
  
  // Method 2: Scan for CinHb wallets specifically
  console.log(`\n🔍 SEARCHING FOR WALLETS STARTING WITH "${SUSPECTED_DELEGATOR}"...`);
  
  const allVoterAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
    filters: [{ dataSize: 2728 }]
  });
  
  console.log(`📊 Scanning ${allVoterAccounts.length} Voter accounts for CinHb patterns...`);
  
  let cinHbCount = 0;
  for (const { pubkey, account } of allVoterAccounts) {
    const authorities = parseVoterAuthorities(account.data);
    
    if (authorities) {
      const { authority, voterAuthority } = authorities;
      
      if (authority.startsWith(SUSPECTED_DELEGATOR) || voterAuthority.startsWith(SUSPECTED_DELEGATOR)) {
        cinHbCount++;
        const depositPower = extractDepositPower(account.data);
        
        console.log(`\n🎯 CinHb account ${cinHbCount}:`);
        console.log(`   📋 Account: ${pubkey.toBase58()}`);
        console.log(`   💰 Power: ${depositPower.toLocaleString()} ISLAND`);
        console.log(`   👤 Authority: ${authority}`);
        console.log(`   🗳️  VoterAuth: ${voterAuthority}`);
        
        if (voterAuthority === TARGET_WALLET) {
          console.log(`   ⭐ DELEGATES TO 4pT6: YES (${depositPower.toLocaleString()} ISLAND)`);
        }
      }
    }
  }
  
  console.log(`\n📊 Found ${cinHbCount} accounts involving "${SUSPECTED_DELEGATOR}" addresses`);
}

async function run() {
  try {
    await findDelegationsTo4pT6();
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

run();