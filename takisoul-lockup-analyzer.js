/**
 * Takisoul Lockup Analyzer - Deep VSR Account Structure Analysis
 * Find the exact lockup data that should yield 8,709,019.78 ISLAND
 */

import { Connection, PublicKey } from '@solana/web3.js';
import dotenv from 'dotenv';

dotenv.config();

const connection = new Connection(process.env.HELIUS_API_KEY);

async function analyzeTakisoulLockupStructure() {
  console.log('TAKISOUL LOCKUP STRUCTURE ANALYSIS');
  console.log('==================================');
  
  const takisoulWallet = '7pPJt2xoEoPy8x8Hf2D6U6oLfNa5uKmHHRwkENVoaxmA';
  const vsrAccount = 'GSrwtiSq6ePRtf2j8nWMksgMuGawHv8uf2suz1A5iRG';
  
  console.log('Target wallet:', takisoulWallet);
  console.log('VSR account:', vsrAccount);
  console.log('Expected total: 8,709,019.78 ISLAND');
  console.log('Current total: 7,183,474.63 ISLAND');
  console.log('Missing power: 1,525,545.15 ISLAND');
  
  const accountInfo = await connection.getAccountInfo(new PublicKey(vsrAccount));
  if (!accountInfo) {
    console.log('Account not found');
    return;
  }
  
  const data = accountInfo.data;
  console.log('\nAccount size:', data.length, 'bytes');
  
  // Known deposits from current scanner
  const knownDeposits = [
    { amount: 690, offset: 112 },
    { amount: 1500000, offset: 184 },
    { amount: 2000000, offset: 264 },
    { amount: 3682784.632186, offset: 344 }
  ];
  
  console.log('\n=== ANALYZING KNOWN DEPOSITS FOR LOCKUP DATA ===');
  
  for (const deposit of knownDeposits) {
    console.log(`\nDeposit: ${deposit.amount} ISLAND at offset ${deposit.offset}`);
    
    // Examine surrounding data for lockup information
    const startByte = Math.max(0, deposit.offset - 16);
    const endByte = Math.min(data.length, deposit.offset + 64);
    const contextData = data.slice(startByte, endByte);
    
    console.log(`Context bytes (${startByte}-${endByte}):`);
    console.log(contextData.toString('hex'));
    
    // Look for potential timestamps in nearby bytes
    for (let i = 8; i < contextData.length - 8; i += 4) {
      try {
        const timestamp = Number(contextData.readBigUInt64LE(i));
        const asDate = new Date(timestamp * 1000);
        const now = new Date();
        
        if (timestamp > now.getTime()/1000 && timestamp < now.getTime()/1000 + (10 * 365.25 * 24 * 3600)) {
          const yearsFromNow = (timestamp - now.getTime()/1000) / (365.25 * 24 * 3600);
          const multiplier = Math.min(5, 1 + Math.min(yearsFromNow, 4));
          const newPower = deposit.amount * multiplier;
          
          console.log(`  Potential lockup at byte ${i + startByte}:`);
          console.log(`    Timestamp: ${timestamp} (${asDate.toISOString()})`);
          console.log(`    Years remaining: ${yearsFromNow.toFixed(2)}`);
          console.log(`    Multiplier: ${multiplier.toFixed(2)}x`);
          console.log(`    New power: ${newPower.toFixed(2)} ISLAND (+${(newPower - deposit.amount).toFixed(2)})`);
        }
      } catch (e) {
        // Continue
      }
    }
  }
  
  // Calculate what multipliers would be needed to reach target
  console.log('\n=== REVERSE ENGINEERING REQUIRED MULTIPLIERS ===');
  
  const currentTotal = 7183474.63;
  const targetTotal = 8709019.78;
  const neededExtra = targetTotal - currentTotal;
  
  console.log(`Need additional: ${neededExtra.toFixed(2)} ISLAND`);
  
  knownDeposits.forEach((deposit, i) => {
    // If only this deposit had a multiplier, what would it need to be?
    const requiredMultiplier = (neededExtra + deposit.amount) / deposit.amount;
    if (requiredMultiplier <= 5 && requiredMultiplier > 1) {
      const requiredYears = Math.min(4, requiredMultiplier - 1);
      console.log(`Deposit ${i + 1} (${deposit.amount} ISLAND): needs ${requiredMultiplier.toFixed(2)}x (${requiredYears.toFixed(2)} years lockup)`);
    }
  });
  
  // Try systematic lockup combinations
  console.log('\n=== TESTING LOCKUP COMBINATIONS ===');
  
  // Test various multiplier combinations that could reach the target
  const multiplierCombinations = [
    [1.04, 1.00, 1.00, 1.21], // Small multipliers
    [1.00, 1.21, 1.00, 1.00], // 1.5M deposit gets multiplier
    [1.00, 1.00, 1.21, 1.00], // 2M deposit gets multiplier
    [1.00, 1.00, 1.00, 1.21], // Large deposit gets multiplier
    [1.21, 1.21, 1.21, 1.21], // All deposits get same multiplier
  ];
  
  multiplierCombinations.forEach((multipliers, combIndex) => {
    let totalPower = 0;
    knownDeposits.forEach((deposit, i) => {
      totalPower += deposit.amount * multipliers[i];
    });
    
    const difference = Math.abs(totalPower - targetTotal);
    if (difference < 1000) {
      console.log(`✅ Combination ${combIndex + 1} matches target!`);
      console.log(`  Multipliers: [${multipliers.map(m => m.toFixed(2)).join(', ')}]`);
      console.log(`  Total power: ${totalPower.toFixed(2)} ISLAND`);
      console.log(`  Difference: ${difference.toFixed(2)} ISLAND`);
    }
  });
}

analyzeTakisoulLockupStructure().catch(console.error);