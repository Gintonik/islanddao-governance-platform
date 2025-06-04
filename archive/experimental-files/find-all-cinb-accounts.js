/**
 * Find All CinHb Accounts and Check for 4pT6ESa Delegations
 */

import { Connection, PublicKey } from '@solana/web3.js';
import dotenv from 'dotenv';

dotenv.config();

const connection = new Connection(process.env.HELIUS_RPC_URL);
const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');

const CINB_WALLET = 'CinHb6Xt2PnqKUkmhRo9hwUkixCcsH1uviuQqaTxwT9i';
const TARGET_DELEGATEE = '4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4';

function parseVoterAuthorities(data) {
  try {
    const authority = new PublicKey(data.slice(8, 40)).toBase58();
    const voterAuthority = new PublicKey(data.slice(72, 104)).toBase58();
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

async function findAllCinbAccounts() {
  console.log('🔍 SEARCHING FOR ALL CINB ACCOUNTS AND 4PT6ESA DELEGATIONS');
  console.log('=========================================================');
  
  // Method 1: Find all accounts where CinHb is authority
  console.log(`\n📊 Finding all Voter accounts where CinHb is authority...`);
  const cinbAuthorityAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
    filters: [
      { dataSize: 2728 },
      { memcmp: { offset: 8, bytes: CINB_WALLET } }
    ]
  });
  
  console.log(`Found ${cinbAuthorityAccounts.length} accounts where CinHb is authority:`);
  
  for (const { pubkey, account } of cinbAuthorityAccounts) {
    const authorities = parseVoterAuthorities(account.data);
    const depositPower = extractDepositPower(account.data);
    
    if (authorities) {
      const { authority, voterAuthority } = authorities;
      const delegatesTo4pT6 = voterAuthority === TARGET_DELEGATEE;
      
      console.log(`\n📋 Account: ${pubkey.toBase58()}`);
      console.log(`   💰 Power: ${depositPower.toLocaleString()} ISLAND`);
      console.log(`   👤 Authority: ${authority.substring(0,8)}...`);
      console.log(`   🗳️  VoterAuth: ${voterAuthority.substring(0,8)}...`);
      console.log(`   ✅ Delegates to 4pT6ESa: ${delegatesTo4pT6 ? 'YES' : 'NO'}`);
      
      if (delegatesTo4pT6) {
        console.log(`   ⭐ FOUND DELEGATION TO 4PT6ESA: ${depositPower.toLocaleString()} ISLAND`);
      }
    }
  }
  
  // Method 2: Find all accounts where 4pT6ESa is voterAuthority
  console.log(`\n📊 Finding all accounts where 4pT6ESa is voterAuthority...`);
  const delegatedTo4pT6Accounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
    filters: [
      { dataSize: 2728 },
      { memcmp: { offset: 72, bytes: TARGET_DELEGATEE } }
    ]
  });
  
  console.log(`Found ${delegatedTo4pT6Accounts.length} accounts where 4pT6ESa is voterAuthority:`);
  
  let totalDelegatedTo4pT6 = 0;
  for (const { pubkey, account } of delegatedTo4pT6Accounts) {
    const authorities = parseVoterAuthorities(account.data);
    const depositPower = extractDepositPower(account.data);
    
    if (authorities && depositPower > 0) {
      const { authority, voterAuthority } = authorities;
      const isFromCinb = authority === CINB_WALLET;
      
      console.log(`\n📋 Account: ${pubkey.toBase58()}`);
      console.log(`   💰 Power: ${depositPower.toLocaleString()} ISLAND`);
      console.log(`   👤 Authority: ${authority.substring(0,8)}...`);
      console.log(`   🗳️  VoterAuth: ${voterAuthority.substring(0,8)}...`);
      console.log(`   ✅ From CinHb: ${isFromCinb ? 'YES' : 'NO'}`);
      
      totalDelegatedTo4pT6 += depositPower;
      
      if (isFromCinb) {
        console.log(`   ⭐ CINB → 4PT6ESA DELEGATION: ${depositPower.toLocaleString()} ISLAND`);
      }
    }
  }
  
  console.log(`\n📊 SUMMARY:`);
  console.log(`Total power delegated to 4pT6ESa: ${totalDelegatedTo4pT6.toLocaleString()} ISLAND`);
  console.log(`CinHb authority accounts: ${cinbAuthorityAccounts.length}`);
  console.log(`Accounts delegating to 4pT6ESa: ${delegatedTo4pT6Accounts.length}`);
}

async function run() {
  try {
    await findAllCinbAccounts();
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

run();