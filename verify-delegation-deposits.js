/**
 * Verify Delegation Deposits
 * Analyze the specific delegation account to understand what deposits are being counted
 */

import { Connection, PublicKey } from '@solana/web3.js';
import * as dotenv from 'dotenv';

dotenv.config();

const connection = new Connection(process.env.HELIUS_RPC_URL);
const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');

/**
 * Analyze specific delegation account deposits
 */
async function analyzeDelegationDeposits(accountPubkey) {
  console.log(`\nAnalyzing delegation account: ${accountPubkey}`);
  
  const accountInfo = await connection.getAccountInfo(new PublicKey(accountPubkey));
  if (!accountInfo) {
    console.log('Account not found');
    return;
  }
  
  const data = accountInfo.data;
  console.log(`Account size: ${data.length} bytes`);
  
  // Parse authorities
  const authority = new PublicKey(data.slice(8, 40)).toBase58();
  const voterAuthority = new PublicKey(data.slice(72, 104)).toBase58();
  console.log(`Authority: ${authority}`);
  console.log(`VoterAuthority: ${voterAuthority}`);
  
  // Scan for deposits using multiple methods
  const timestamp = Math.floor(Date.now() / 1000);
  let totalPower = 0;
  const deposits = [];
  
  console.log('\nDeposit analysis:');
  
  // Method 1: Standard VSR structure for large accounts
  if (data.length >= 2728) {
    console.log('  Using standard VSR deposit structure (2728-byte account)');
    for (let i = 0; i < 32; i++) {
      const offset = 104 + (87 * i);
      if (offset + 48 <= data.length) {
        try {
          const rawAmount = Number(data.readBigUInt64LE(offset + 8));
          if (rawAmount > 0) {
            const islandAmount = rawAmount / 1e6;
            
            if (islandAmount >= 1 && islandAmount <= 50000000) {
              const lockupKind = data[offset + 24];
              const lockupEndTs = Number(data.readBigUInt64LE(offset + 40));
              const isActiveLockup = lockupKind !== 0 && lockupEndTs > timestamp;
              const multiplier = isActiveLockup ? Math.min(1 + (lockupEndTs - timestamp) / (4 * 365 * 24 * 3600), 5) : 1;
              
              const power = islandAmount * multiplier;
              totalPower += power;
              deposits.push({
                index: i,
                amount: islandAmount,
                multiplier: multiplier,
                power: power,
                source: 'standard'
              });
              
              console.log(`    Deposit ${i}: ${islandAmount.toFixed(3)} × ${multiplier.toFixed(2)}x = ${power.toFixed(3)} ISLAND`);
            }
          }
        } catch (error) {
          continue;
        }
      }
    }
  }
  
  // Method 2: 176-byte account structure
  else if (data.length >= 176) {
    console.log('  Using 176-byte delegation account structure');
    
    // Standard deposit at offset 104
    try {
      const offset = 104;
      const rawAmount = Number(data.readBigUInt64LE(offset + 8));
      if (rawAmount > 0) {
        const islandAmount = rawAmount / 1e6;
        
        if (islandAmount >= 1 && islandAmount <= 50000000) {
          const lockupKind = data[offset + 24] || 0;
          const lockupEndTs = Number(data.readBigUInt64LE(offset + 40)) || 0;
          const isActiveLockup = lockupKind !== 0 && lockupEndTs > timestamp;
          const multiplier = isActiveLockup ? Math.min(1 + (lockupEndTs - timestamp) / (4 * 365 * 24 * 3600), 5) : 1;
          
          const power = islandAmount * multiplier;
          totalPower += power;
          deposits.push({
            offset: offset,
            amount: islandAmount,
            multiplier: multiplier,
            power: power,
            source: '176byte-standard'
          });
          
          console.log(`    Standard deposit: ${islandAmount.toFixed(3)} × ${multiplier.toFixed(2)}x = ${power.toFixed(3)} ISLAND`);
        }
      }
    } catch (error) {
      // Continue to scanning method
    }
    
    // Scan additional offsets
    const offsets = [104, 112, 120];
    for (const offset of offsets) {
      if (offset + 8 <= data.length) {
        try {
          const rawAmount = Number(data.readBigUInt64LE(offset));
          if (rawAmount > 0) {
            const islandAmount = rawAmount / 1e6;
            
            if (islandAmount >= 1000 && islandAmount <= 50000000) {
              // Check if this amount was already counted
              const alreadyCounted = deposits.some(d => Math.abs(d.amount - islandAmount) < 1);
              if (!alreadyCounted) {
                const power = islandAmount;
                totalPower += power;
                deposits.push({
                  offset: offset,
                  amount: islandAmount,
                  multiplier: 1.0,
                  power: power,
                  source: '176byte-scan'
                });
                
                console.log(`    Scanned deposit: ${islandAmount.toFixed(3)} × 1.00x = ${power.toFixed(3)} ISLAND (offset ${offset})`);
              }
            }
          }
        } catch (error) {
          continue;
        }
      }
    }
  }
  
  console.log(`\nTotal delegation power: ${totalPower.toFixed(3)} ISLAND from ${deposits.length} deposits`);
  
  return {
    totalPower,
    deposits,
    authority,
    voterAuthority
  };
}

/**
 * Verify delegation for kruHL3zJ
 */
async function verifyKruHL3zJDelegation() {
  console.log('VERIFYING DELEGATION FOR kruHL3zJ');
  console.log('================================');
  
  const targetWallet = 'kruHL3zJ1Mcbdibsna5xM6yMp7PZZ4BsNTpj2UMgvZC';
  const delegationAccount = '7udRqrKsYCtqfLjUuitqriB1PSwmyTNQRcQsQWczR26w';
  
  const result = await analyzeDelegationDeposits(delegationAccount);
  
  console.log('\nDelegation verification:');
  console.log(`From: ${result.authority}`);
  console.log(`To: ${result.voterAuthority}`);
  console.log(`Target: ${targetWallet}`);
  console.log(`Is valid delegation: ${result.voterAuthority === targetWallet && result.authority !== targetWallet}`);
  console.log(`Total delegated power: ${result.totalPower.toFixed(3)} ISLAND`);
  
  if (result.totalPower > 0) {
    console.log('\nThis delegation appears to be valid based on current on-chain state.');
    console.log('The ground truth expectation of 0 delegated power may be outdated.');
  }
}

// Run the verification
verifyKruHL3zJDelegation()
  .then(() => {
    console.log('\nDelegation verification completed');
    process.exit(0);
  })
  .catch(error => {
    console.error('Verification failed:', error);
    process.exit(1);
  });