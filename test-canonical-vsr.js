/**
 * Test canonical VSR implementation against validation requirements
 */

import { Connection, PublicKey } from '@solana/web3.js';
import dotenv from 'dotenv';

dotenv.config();

const connection = new Connection(process.env.HELIUS_RPC_URL);
const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');

// Test cases from validation requirements
const TEST_WALLETS = [
  'GJdRQcsyz49FMM4LvPqpaM2QA3yWFr8WamJ95hkwCBAh', // Expected: 144,708 native
  'Fgv1zrwB6VF3jc45PaNT5t9AnSsJrwb8r7aMNip5fRY1', // Expected: 200,000 native
  '3PKhzE9wuEkGPHHu2sNCvG86xNtDJduAcyBPXpE6cSNt'  // Expected: 10.35M native + 1.27M delegated
];

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
    const isUsed = data.readUInt8(offset + 16) !== 0;
    const lockupStartTs = Number(data.readBigUInt64LE(offset + 32));
    const lockupEndTs = Number(data.readBigUInt64LE(offset + 40));
    
    return {
      amountDepositedNative,
      isUsed,
      lockupStartTs,
      lockupEndTs
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
    return 1.0; // Unlocked tokens
  }
  
  const remainingSeconds = deposit.lockupEndTs - currentTimestamp;
  const remainingYears = remainingSeconds / (365.25 * 24 * 60 * 60);
  
  if (remainingYears <= 0) return 1.0;
  if (remainingYears >= 4) return 5.0;
  
  return 1.0 + (remainingYears / 4.0) * 4.0;
}

async function analyzeWalletVSR(walletAddress) {
  console.log(`\n🔍 Analyzing: ${walletAddress}`);
  
  // Find all Voter accounts where this wallet is authority
  const voterAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
    filters: [
      { dataSize: 2728 },
      { memcmp: { offset: 8, bytes: walletAddress } }
    ]
  });
  
  console.log(`   Found ${voterAccounts.length} Voter accounts as authority`);
  
  let totalNativePower = 0;
  const currentTimestamp = Math.floor(Date.now() / 1000);
  
  for (const { pubkey, account } of voterAccounts) {
    const data = account.data;
    const authorities = parseVoterAuthorities(data);
    
    if (!authorities || authorities.authority !== walletAddress) continue;
    
    console.log(`   📋 Account: ${pubkey.toBase58()}`);
    console.log(`      Authority: ${authorities.authority.substring(0,8)}...`);
    console.log(`      VoterAuth: ${authorities.voterAuthority.substring(0,8)}...`);
    
    // Parse deposits
    const maxDeposits = 32;
    const depositSize = 72;
    const baseOffset = 200;
    
    for (let i = 0; i < maxDeposits; i++) {
      const offset = baseOffset + (i * depositSize);
      
      if (offset + depositSize > data.length) break;
      
      const deposit = parseDepositEntry(data, offset);
      
      if (deposit && deposit.isUsed && deposit.amountDepositedNative > 0) {
        const multiplier = calculateLockupMultiplier(deposit, currentTimestamp);
        const power = (deposit.amountDepositedNative * multiplier) / 1e6;
        
        if (power > 0) {
          totalNativePower += power;
          
          const lockupStatus = currentTimestamp < deposit.lockupEndTs ? 'ACTIVE' : 'EXPIRED';
          const endDate = new Date(deposit.lockupEndTs * 1000).toISOString().split('T')[0];
          
          console.log(`      Deposit ${i}: ${(deposit.amountDepositedNative / 1e6).toLocaleString()} ISLAND × ${multiplier.toFixed(2)}x = ${power.toLocaleString()} (${lockupStatus} until ${endDate})`);
        }
      }
    }
  }
  
  console.log(`   📊 Total Native Power: ${totalNativePower.toLocaleString()} ISLAND`);
  return totalNativePower;
}

async function testCanonicalVSR() {
  console.log('🧪 TESTING CANONICAL VSR IMPLEMENTATION');
  console.log('======================================');
  
  for (const wallet of TEST_WALLETS) {
    await analyzeWalletVSR(wallet);
  }
}

await testCanonicalVSR();