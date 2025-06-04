/**
 * Investigate Metadata Precision for VSR Multiplier Accuracy
 * Testing assumptions about kind bytes, timestamps, and multiplier constants
 */

import { Connection, PublicKey } from '@solana/web3.js';
import { config } from 'dotenv';
config();

const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');
const connection = new Connection(process.env.HELIUS_RPC_URL);

// Test different multiplier formulations
function testMultiplierVariations(lockup, now = Date.now() / 1000) {
  const { kind, startTs, endTs } = lockup;
  if (kind === 0) return { standard: 1.0, variation1: 1.0, variation2: 1.0 };

  const duration = Math.max(endTs - startTs, 1);
  const remaining = Math.max(endTs - now, 0);

  // Standard formula (current)
  const BASE = 1_000_000_000;
  const MAX_EXTRA = 3_000_000_000;
  const SATURATION_SECS = 31_536_000;

  let standardBonus = 0;
  if (kind === 1 || kind === 4) {
    const ratio = Math.min(1, remaining / SATURATION_SECS);
    standardBonus = MAX_EXTRA * ratio;
  } else if (kind === 2 || kind === 3) {
    const unlockedRatio = Math.min(1, Math.max(0, (now - startTs) / duration));
    const lockedRatio = 1 - unlockedRatio;
    const ratio = Math.min(1, (lockedRatio * duration) / SATURATION_SECS);
    standardBonus = MAX_EXTRA * ratio;
  }
  const standard = (BASE + standardBonus) / 1e9;

  // Variation 1: Different saturation by lock type
  let variation1Bonus = 0;
  let saturation1 = SATURATION_SECS;
  if (kind === 1) saturation1 = SATURATION_SECS; // Cliff - same
  if (kind === 2) saturation1 = SATURATION_SECS * 0.9; // Constant - slightly shorter
  if (kind === 3) saturation1 = SATURATION_SECS * 1.1; // Vesting - slightly longer  
  if (kind === 4) saturation1 = SATURATION_SECS * 0.8; // Monthly - shorter

  if (kind === 1 || kind === 4) {
    const ratio = Math.min(1, remaining / saturation1);
    variation1Bonus = MAX_EXTRA * ratio;
  } else if (kind === 2 || kind === 3) {
    const unlockedRatio = Math.min(1, Math.max(0, (now - startTs) / duration));
    const lockedRatio = 1 - unlockedRatio;
    const ratio = Math.min(1, (lockedRatio * duration) / saturation1);
    variation1Bonus = MAX_EXTRA * ratio;
  }
  const variation1 = (BASE + variation1Bonus) / 1e9;

  // Variation 2: Precision rounding like UI
  let variation2Bonus = 0;
  if (kind === 1 || kind === 4) {
    const ratio = Math.min(1, remaining / SATURATION_SECS);
    variation2Bonus = MAX_EXTRA * ratio;
  } else if (kind === 2 || kind === 3) {
    const unlockedRatio = Math.min(1, Math.max(0, (now - startTs) / duration));
    const lockedRatio = 1 - unlockedRatio;
    const ratio = Math.min(1, (lockedRatio * duration) / SATURATION_SECS);
    variation2Bonus = MAX_EXTRA * ratio;
  }
  const variation2Raw = (BASE + variation2Bonus) / 1e9;
  const variation2 = Math.round(variation2Raw * 1000) / 1000; // Round to 3 decimals

  return { standard, variation1, variation2 };
}

async function investigateGJdRQcsyPrecision() {
  console.log('INVESTIGATING METADATA PRECISION FOR GJDRQCSY');
  console.log('===========================================');
  console.log('Target wallet: GJdRQcsyz49FMM4LvPqpaM2QA3yWFr8WamJ95hkwCBAh');
  console.log('Expected total: ~144,708 ISLAND');
  console.log('Current total: 146,932 ISLAND (98.5% accuracy)\n');

  const targetWallet = 'GJdRQcsyz49FMM4LvPqpaM2QA3yWFr8WamJ95hkwCBAh';
  const allVSR = await connection.getProgramAccounts(VSR_PROGRAM_ID, { 
    filters: [{ dataSize: 2728 }] 
  });
  
  const currentTime = Date.now() / 1000;
  
  for (const account of allVSR) {
    const data = account.account.data;
    
    try {
      const authority = new PublicKey(data.slice(8, 40)).toBase58();
      if (authority !== targetWallet) continue;
      
      console.log(`Found VSR account: ${account.pubkey.toBase58()}\n`);
      
      // Known amounts from UI
      const knownAmounts = [37627, 25739, 10000, 3913];
      
      // Test different metadata offset patterns
      const lockupMappings = [
        { amountOffset: 184, metadataOffsets: [152, 168, 232, 248] },
        { amountOffset: 264, metadataOffsets: [232, 248, 312, 328] },
        { amountOffset: 344, metadataOffsets: [312, 328, 392, 408] },
        { amountOffset: 424, metadataOffsets: [392, 408] }
      ];

      for (const mapping of lockupMappings) {
        if (mapping.amountOffset + 8 <= data.length) {
          try {
            const rawAmount = Number(data.readBigUInt64LE(mapping.amountOffset));
            const amount = rawAmount / 1e6;
            const rounded = Math.round(amount);
            
            if (knownAmounts.includes(rounded)) {
              console.log(`\n=== ANALYZING ${amount.toLocaleString()} ISLAND at offset ${mapping.amountOffset} ===`);
              
              // Test all metadata offset combinations
              for (let i = 0; i < mapping.metadataOffsets.length - 1; i += 2) {
                const startOffset = mapping.metadataOffsets[i];
                const endOffset = mapping.metadataOffsets[i];
                
                try {
                  console.log(`\nTesting metadata pattern: start=${startOffset}, end=${startOffset+8}`);
                  
                  // Try different kind byte positions
                  for (let kindOffset = startOffset + 16; kindOffset <= startOffset + 32; kindOffset++) {
                    if (kindOffset < data.length) {
                      const startTs = Number(data.readBigUInt64LE(startOffset));
                      const endTs = Number(data.readBigUInt64LE(startOffset + 8));
                      const kind = data[kindOffset];
                      
                      if (kind >= 1 && kind <= 4 && startTs > 1577836800 && startTs < endTs && 
                          endTs > 1577836800 && endTs < 1893456000) {
                        
                        const lockup = { kind, startTs, endTs };
                        const multipliers = testMultiplierVariations(lockup, currentTime);
                        
                        const remaining = Math.max(endTs - currentTime, 0);
                        const duration = endTs - startTs;
                        const lockupTypes = ['None', 'Cliff', 'Constant', 'Vesting', 'Monthly'];
                        
                        console.log(`    Kind ${kind} (${lockupTypes[kind]}) at offset ${kindOffset}:`);
                        console.log(`      Duration: ${Math.ceil(duration / 86400)}d total, ${Math.ceil(remaining / 86400)}d remaining`);
                        console.log(`      Standard multiplier: ${multipliers.standard.toFixed(3)}x → ${(amount * multipliers.standard).toLocaleString()} ISLAND`);
                        console.log(`      Variation 1 (type-specific saturation): ${multipliers.variation1.toFixed(3)}x → ${(amount * multipliers.variation1).toLocaleString()} ISLAND`);
                        console.log(`      Variation 2 (UI rounding): ${multipliers.variation2.toFixed(3)}x → ${(amount * multipliers.variation2).toLocaleString()} ISLAND`);
                      }
                    }
                  }
                } catch (e) {
                  continue;
                }
              }
            }
          } catch (e) {
            continue;
          }
        }
      }
      
      // Calculate what total would be with different approaches
      console.log('\n=== TOTAL POWER COMPARISON ===');
      
      // Current approach total
      const currentTotal = 146932;
      const expectedTotal = 144708;
      const difference = currentTotal - expectedTotal;
      
      console.log(`Current total: ${currentTotal.toLocaleString()} ISLAND`);
      console.log(`Expected total: ${expectedTotal.toLocaleString()} ISLAND`);
      console.log(`Difference: ${difference.toLocaleString()} ISLAND (${((difference / expectedTotal) * 100).toFixed(1)}% over)`);
      
      // What adjustment would get us to exact match?
      const adjustmentFactor = expectedTotal / currentTotal;
      console.log(`Adjustment factor needed: ${adjustmentFactor.toFixed(6)}x`);
      console.log(`This suggests multipliers should be reduced by ${((1 - adjustmentFactor) * 100).toFixed(2)}%`);
      
      break;
    } catch (e) {
      continue;
    }
  }
}

investigateGJdRQcsyPrecision().catch(console.error);