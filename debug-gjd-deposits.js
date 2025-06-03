/**
 * Debug GJdRQcsy deposit parsing to understand why we're only getting 3,913 instead of 144,708
 */

import { Connection, PublicKey } from '@solana/web3.js';
import dotenv from 'dotenv';

dotenv.config();

const connection = new Connection(process.env.HELIUS_RPC_URL);
const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');

const GJD_WALLET = 'GJdRQcsyz49FMM4LvPqpaM2QA3yWFr8WamJ95hkwCBAh';

function parseVoterAuthorities(data) {
  try {
    const authority = new PublicKey(data.slice(8, 40)).toBase58();
    const voterAuthority = new PublicKey(data.slice(72, 104)).toBase58();
    return { authority, voterAuthority };
  } catch (error) {
    return null;
  }
}

function parseDepositEntry(data, offset) {
  try {
    const amountDepositedNative = Number(data.readBigUInt64LE(offset));
    const amountInitiallyLocked = Number(data.readBigUInt64LE(offset + 8));
    const isUsed = data.readUInt8(offset + 16) !== 0;
    const lockupStartTs = Number(data.readBigUInt64LE(offset + 32));
    const lockupEndTs = Number(data.readBigUInt64LE(offset + 40));
    const lockupKind = data.readUInt32LE(offset + 48);
    
    return {
      amountDepositedNative,
      amountInitiallyLocked,
      isUsed,
      lockupStartTs,
      lockupEndTs,
      lockupKind
    };
  } catch (error) {
    return null;
  }
}

function calculateLockupMultiplier(deposit, currentTimestamp) {
  if (!deposit.isUsed || deposit.amountDepositedNative === 0) {
    return 0;
  }
  
  if (currentTimestamp >= deposit.lockupEndTs) {
    return 1.0; // Unlocked
  }
  
  const remainingSeconds = deposit.lockupEndTs - currentTimestamp;
  const remainingYears = remainingSeconds / (365.25 * 24 * 60 * 60);
  
  if (remainingYears <= 0) return 1.0;
  if (remainingYears >= 4) return 5.0;
  
  return 1.0 + (remainingYears / 4.0) * 4.0;
}

async function debugGJDDeposits() {
  console.log('🔍 DEBUGGING GJdRQcsy DEPOSIT PARSING');
  console.log('====================================');
  console.log(`Target: ${GJD_WALLET}`);
  console.log(`Expected: ~144,708 ISLAND native power from 4 active lockups\n`);

  // Find all Voter accounts where GJdRQcsy is authority
  const voterAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
    filters: [
      { dataSize: 2728 },
      { memcmp: { offset: 8, bytes: GJD_WALLET } }
    ]
  });

  console.log(`Found ${voterAccounts.length} Voter accounts where GJdRQcsy is authority\n`);

  const currentTimestamp = Math.floor(Date.now() / 1000);
  let totalPower = 0;

  for (const [index, { pubkey, account }] of voterAccounts.entries()) {
    console.log(`📋 Account ${index + 1}: ${pubkey.toBase58()}`);
    
    const data = account.data;
    const authorities = parseVoterAuthorities(data);
    
    if (authorities) {
      console.log(`   Authority: ${authorities.authority.substring(0,8)}...`);
      console.log(`   VoterAuth: ${authorities.voterAuthority.substring(0,8)}...`);
    }

    // Method 1: Try structured VSR deposit parsing
    console.log(`\n   🏗️  STRUCTURED VSR DEPOSIT PARSING:`);
    const maxDeposits = 32;
    const depositSize = 72;
    const baseOffset = 200;
    
    let accountPower = 0;
    let foundDeposits = 0;
    
    for (let i = 0; i < maxDeposits; i++) {
      const offset = baseOffset + (i * depositSize);
      
      if (offset + depositSize > data.length) break;
      
      const deposit = parseDepositEntry(data, offset);
      
      if (deposit && deposit.isUsed && deposit.amountDepositedNative > 0) {
        foundDeposits++;
        const multiplier = calculateLockupMultiplier(deposit, currentTimestamp);
        const power = (deposit.amountDepositedNative * multiplier) / 1e6;
        
        accountPower += power;
        
        const lockupStatus = currentTimestamp < deposit.lockupEndTs ? 'ACTIVE' : 'EXPIRED';
        const endDate = new Date(deposit.lockupEndTs * 1000).toISOString().split('T')[0];
        const remainingYears = Math.max(0, (deposit.lockupEndTs - currentTimestamp) / (365.25 * 24 * 60 * 60));
        
        console.log(`   Deposit ${i}: ${(deposit.amountDepositedNative / 1e6).toLocaleString()} ISLAND × ${multiplier.toFixed(2)}x = ${power.toLocaleString()}`);
        console.log(`              Status: ${lockupStatus} until ${endDate} (${remainingYears.toFixed(2)} years remaining)`);
        console.log(`              LockupKind: ${deposit.lockupKind}, StartTs: ${deposit.lockupStartTs}, EndTs: ${deposit.lockupEndTs}`);
      }
    }
    
    console.log(`   📊 Structured parsing found ${foundDeposits} deposits totaling ${accountPower.toLocaleString()} ISLAND\n`);

    // Method 2: Try fallback offsets
    console.log(`   🔄 FALLBACK OFFSET PARSING:`);
    const fallbackOffsets = [112, 144, 176, 208, 240];
    
    for (const offset of fallbackOffsets) {
      try {
        const rawValue = Number(data.readBigUInt64LE(offset));
        const islandAmount = rawValue / 1e6;
        
        if (islandAmount >= 1000 && islandAmount <= 50000000 && rawValue !== 4294967296) {
          console.log(`   Offset ${offset}: ${islandAmount.toLocaleString()} ISLAND (raw: ${rawValue})`);
        }
      } catch (error) {
        continue;
      }
    }
    
    totalPower += accountPower;
    console.log(`\n   💰 Account total: ${accountPower.toLocaleString()} ISLAND`);
    console.log(`   📈 Running total: ${totalPower.toLocaleString()} ISLAND\n`);
  }

  console.log(`🎯 FINAL ANALYSIS:`);
  console.log(`Expected: 144,708 ISLAND`);
  console.log(`Found: ${totalPower.toLocaleString()} ISLAND`);
  console.log(`Difference: ${(144708 - totalPower).toLocaleString()} ISLAND`);
  
  if (totalPower < 144708) {
    console.log(`\n❌ MISSING POWER SOURCES:`);
    console.log(`- Lockup multipliers may not be calculated correctly`);
    console.log(`- VSR deposit structure parsing may need adjustment`);
    console.log(`- Some deposits may be at different offsets than expected`);
  }
}

await debugGJDDeposits();