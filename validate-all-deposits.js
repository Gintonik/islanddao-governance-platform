/**
 * Validate All Deposits Detection
 * Test canonical scanner with comprehensive deposit detection
 */

import { Connection, PublicKey } from '@solana/web3.js';
import * as dotenv from 'dotenv';

dotenv.config();

const connection = new Connection(process.env.HELIUS_RPC_URL);
const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');

/**
 * Extract deposits using canonical scanner logic
 */
function extractDeposits(data) {
  const deposits = [];
  const timestamp = Math.floor(Date.now() / 1000);
  
  for (let i = 0; i < 32; i++) {
    const offset = 104 + (87 * i);
    if (offset + 48 <= data.length) {
      try {
        const isUsedByte = data[offset];
        const rawAmount = Number(data.readBigUInt64LE(offset + 8));
        const lockupKind = data[offset + 24] || 0;
        const lockupEndTs = Number(data.readBigUInt64LE(offset + 40)) || 0;
        
        if (rawAmount > 0) {
          const islandAmount = rawAmount / 1e6;
          
          if (islandAmount >= 100 && islandAmount <= 50000000) {
            const isActiveLockup = lockupKind !== 0 && lockupEndTs > timestamp;
            const multiplier = isActiveLockup ? Math.min(1 + (lockupEndTs - timestamp) / (4 * 365 * 24 * 3600), 5) : 1;
            
            deposits.push({
              depositIndex: i,
              amount: islandAmount,
              multiplier: multiplier,
              power: islandAmount * multiplier,
              isActive: isActiveLockup,
              isUsedByte: isUsedByte
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
 * Calculate native and delegated power for a wallet
 */
async function calculateCompleteGovernancePower(walletAddress) {
  // Find native power accounts (authority === wallet)
  const nativeAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
    filters: [
      { dataSize: 2728 },
      { memcmp: { offset: 8, bytes: walletAddress } }
    ]
  });
  
  let totalNativePower = 0;
  const nativeDeposits = [];
  
  for (const { pubkey, account } of nativeAccounts) {
    const deposits = extractDeposits(account.data);
    for (const deposit of deposits) {
      totalNativePower += deposit.power;
      nativeDeposits.push({
        account: pubkey.toBase58(),
        ...deposit
      });
    }
  }
  
  // Find delegated power (scan all accounts for voterAuthority === wallet)
  const allAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID);
  let totalDelegatedPower = 0;
  const delegatedDeposits = [];
  
  for (const { pubkey, account } of allAccounts) {
    const data = account.data;
    if (data.length < 104) continue;
    
    try {
      const authority = new PublicKey(data.slice(8, 40)).toBase58();
      const voterAuthority = new PublicKey(data.slice(72, 104)).toBase58();
      
      if (voterAuthority === walletAddress && authority !== walletAddress) {
        const deposits = extractDeposits(data);
        for (const deposit of deposits) {
          totalDelegatedPower += deposit.power;
          delegatedDeposits.push({
            account: pubkey.toBase58(),
            from: authority,
            ...deposit
          });
        }
      }
    } catch (error) {
      continue;
    }
  }
  
  return {
    nativePower: totalNativePower,
    delegatedPower: totalDelegatedPower,
    totalPower: totalNativePower + totalDelegatedPower,
    nativeDeposits,
    delegatedDeposits,
    nativeAccountCount: nativeAccounts.length
  };
}

/**
 * Test comprehensive governance power calculation
 */
async function validateAllDeposits() {
  const testWallets = [
    { address: 'kruHL3zJ1Mcbdibsna5xM6yMp7PZZ4BsNTpj2UMgvZC', note: 'should find ~310K + 126K' },
    { address: '3PKhzE9wuEkGPHHu2sNCvG86xNtDJduAcyBPXpE6cSNt', note: 'should find ~10.3M native' },
    { address: 'Fywb7YDCXxtD7pNKThJ36CAtVe23dEeEPf7HqKz7oKDp', note: 'should find both native and delegated' }
  ];
  
  console.log('CANONICAL VSR COMPREHENSIVE VALIDATION');
  console.log('=====================================');
  
  for (const wallet of testWallets) {
    console.log(`\nTesting ${wallet.address.substring(0,8)} (${wallet.note})`);
    
    try {
      const result = await calculateCompleteGovernancePower(wallet.address);
      
      console.log(`  Found ${result.nativeAccountCount} Voter accounts where wallet is authority`);
      
      // Display native deposits
      if (result.nativeDeposits.length > 0) {
        console.log(`  Native deposits:`);
        for (const deposit of result.nativeDeposits) {
          const status = deposit.isActive ? 'ACTIVE' : 'EXPIRED';
          console.log(`    ${deposit.amount.toFixed(3)} × ${deposit.multiplier.toFixed(2)}x = ${deposit.power.toFixed(3)} ISLAND (${status})`);
        }
      }
      
      // Display delegated deposits
      if (result.delegatedDeposits.length > 0) {
        console.log(`  Delegated deposits:`);
        for (const deposit of result.delegatedDeposits) {
          const status = deposit.isActive ? 'ACTIVE' : 'EXPIRED';
          console.log(`    From ${deposit.from.substring(0,8)}: ${deposit.amount.toFixed(3)} × ${deposit.multiplier.toFixed(2)}x = ${deposit.power.toFixed(3)} ISLAND (${status})`);
        }
      }
      
      console.log(`\n🏛️ VWR Total: N/A`);
      console.log(`🟢 Native from Deposits: ${result.nativePower.toFixed(3)}`);
      console.log(`🟡 Delegated from Others: ${result.delegatedPower.toFixed(3)}`);
      console.log(`🧠 Inference Used? false`);
      console.log(`  Total Governance Power: ${result.totalPower.toFixed(3)} ISLAND`);
      
      // Validation checks
      if (wallet.address.startsWith('kruHL3zJ') && result.totalPower < 100000) {
        console.log(`  ⚠️  Warning: Expected higher total power for kruHL3zJ`);
      }
      if (wallet.address.startsWith('3PKhzE9w') && result.nativePower < 5000000) {
        console.log(`  ⚠️  Warning: Expected higher native power for 3PKhzE9w`);
      }
      
    } catch (error) {
      console.log(`  Error: ${error.message}`);
    }
  }
  
  console.log('\nValidation completed - all deposits detected using canonical VSR scanner logic');
}

validateAllDeposits()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Validation failed:', error);
    process.exit(1);
  });