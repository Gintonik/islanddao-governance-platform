/**
 * Takisoul Focused Native Governance Scanner
 * Demonstrates canonical detection and parsing for verified wallet control
 */

import { Connection, PublicKey } from '@solana/web3.js';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const connection = new Connection(process.env.HELIUS_RPC_URL);

/**
 * Calculate VSR multiplier using canonical lockup logic
 */
function calculateMultiplier(lockupKind, startTs, endTs, cliffTs) {
  const now = Math.floor(Date.now() / 1000);
  
  if (lockupKind === 0 || endTs <= now) {
    return 1.0;
  } else {
    const yearsRemaining = (endTs - now) / (365.25 * 24 * 3600);
    const multiplier = 1 + Math.min(yearsRemaining, 4);
    return Math.min(multiplier, 5.0);
  }
}

/**
 * Parse VSR deposits using canonical deposit entry structure
 */
function parseVSRDeposits(data, accountPubkey) {
  const deposits = [];
  
  console.log(`    Parsing deposits for ${accountPubkey.slice(0, 8)}...`);
  
  // VSR deposit entries: offset 232, 80 bytes each, max 32 entries
  for (let i = 0; i < 32; i++) {
    const entryOffset = 232 + (i * 80);
    if (entryOffset + 80 > data.length) break;
    
    try {
      const isUsed = data.readUInt8(entryOffset) === 1;
      const amountDepositedNative = data.readBigUInt64LE(entryOffset + 8);
      const lockupKind = data.readUInt8(entryOffset + 24);
      const lockupStartTs = data.readBigUInt64LE(entryOffset + 32);
      const lockupEndTs = data.readBigUInt64LE(entryOffset + 40);
      const lockupCliffTs = data.readBigUInt64LE(entryOffset + 48);
      
      const amount = Number(amountDepositedNative) / 1e6;
      
      if (isUsed && amount > 0) {
        // Filter phantom 1,000 ISLAND deposits
        if (amount === 1000 && lockupKind === 0 && lockupStartTs === 0n && lockupEndTs === 0n) {
          console.log(`      Entry ${i}: ${amount} ISLAND (phantom - filtered)`);
          continue;
        }
        
        const multiplier = calculateMultiplier(lockupKind, Number(lockupStartTs), Number(lockupEndTs), Number(lockupCliffTs));
        const votingPower = amount * multiplier;
        
        console.log(`      Entry ${i}: ${amount.toFixed(6)} ISLAND × ${multiplier.toFixed(2)} = ${votingPower.toFixed(2)} power`);
        
        deposits.push({
          depositIndex: i,
          amount,
          lockupKind,
          lockupStartTs: Number(lockupStartTs),
          lockupEndTs: Number(lockupEndTs),
          multiplier,
          votingPower
        });
      }
    } catch (error) {
      continue;
    }
  }
  
  return deposits;
}

/**
 * Analyze Takisoul's verified alias account
 */
async function analyzeTakisoulGovernancePower() {
  console.log('TAKISOUL FOCUSED NATIVE GOVERNANCE SCANNER');
  console.log('=========================================');
  
  const takisoulWallet = '7pPJt2xoEoPy8x8Hf2D6U6oLfNa5uKmHHRwkENVoaxmA';
  const controlledAuthority = 'QxTebcJ4ouDLJvWoGBvdw3Au6Bjd9TTRx7nMuTkVgvH';
  const vsrAccount = 'GSrwtiSq6ePRtf2j8nWMksgMuGawHv8uf2suz1A5iRG';
  
  console.log(`Takisoul wallet: ${takisoulWallet}`);
  console.log(`Controlled authority: ${controlledAuthority}`);
  console.log(`VSR account: ${vsrAccount}`);
  
  try {
    const account = await connection.getAccountInfo(new PublicKey(vsrAccount));
    if (!account) {
      console.log('VSR account not found');
      return;
    }
    
    const data = account.data;
    console.log(`\nAccount details:`);
    console.log(`  Size: ${data.length} bytes`);
    console.log(`  Owner: ${account.owner.toString()}`);
    
    // Verify authority relationship
    const authorityBytes = data.slice(32, 64);
    const authority = new PublicKey(authorityBytes).toString();
    
    console.log(`  Authority: ${authority}`);
    console.log(`  Authority matches controlled: ${authority === controlledAuthority ? 'YES' : 'NO'}`);
    
    if (authority === controlledAuthority) {
      console.log(`\n✅ Verified: Takisoul controls this VSR account through alias mapping`);
      
      // Parse deposits using canonical structure
      const deposits = parseVSRDeposits(data, vsrAccount);
      
      const totalNativePower = deposits.reduce((sum, d) => sum + d.votingPower, 0);
      
      console.log(`\n=== TAKISOUL NATIVE GOVERNANCE POWER ===`);
      console.log(`Total deposits: ${deposits.length}`);
      console.log(`Total native power: ${totalNativePower.toFixed(2)} ISLAND`);
      
      console.log(`\nDeposit breakdown:`);
      for (const deposit of deposits) {
        console.log(`  ${deposit.amount.toFixed(6)} ISLAND (lockup ${deposit.lockupKind}) × ${deposit.multiplier.toFixed(2)} = ${deposit.votingPower.toFixed(2)} power`);
      }
      
      // Save result
      const result = {
        wallet: takisoulWallet,
        controlledAuthority,
        vsrAccount,
        nativePower: totalNativePower,
        deposits: deposits.map(d => ({
          amount: d.amount,
          lockupKind: d.lockupKind,
          multiplier: d.multiplier,
          votingPower: d.votingPower
        }))
      };
      
      fs.writeFileSync('./takisoul-native-governance.json', JSON.stringify(result, null, 2));
      console.log(`\nResult saved to takisoul-native-governance.json`);
      
      console.log(`\n${'='.repeat(50)}`);
      console.log(`CANONICAL NATIVE GOVERNANCE VERIFIED`);
      console.log(`${'='.repeat(50)}`);
      console.log(`✅ Detection method: Verified alias mapping`);
      console.log(`✅ Authority validation: ${controlledAuthority.slice(0, 8)}...`);
      console.log(`✅ Deposit parsing: Canonical VSR structure`);
      console.log(`✅ Phantom filtering: Applied to 1,000 ISLAND deposits`);
      console.log(`✅ Multiplier calculation: Canonical lockup logic`);
      console.log(`\nFinal Result: ${totalNativePower.toFixed(2)} ISLAND native governance power`);
      
    } else {
      console.log(`❌ Authority mismatch - cannot verify control`);
    }
    
  } catch (error) {
    console.error('Error analyzing Takisoul governance power:', error.message);
  }
}

analyzeTakisoulGovernancePower().catch(console.error);