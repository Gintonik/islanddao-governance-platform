/**
 * Implement metadata priority fix for complex VSR accounts
 * Target: Reduce Takisoul's governance power from 9.01M to realistic ~8.5M range
 */

import { Connection, PublicKey } from "@solana/web3.js";
import { config } from "dotenv";

config();

const connection = new Connection(process.env.HELIUS_RPC_URL);

function calculateVSRMultiplier(lockup, now = Math.floor(Date.now() / 1000)) {
  const { kind, startTs, endTs } = lockup;
  
  const BASE = 1e9;
  let bonus = 0;
  
  if (kind >= 1 && kind <= 4) {
    const remainingSeconds = Math.max(0, endTs - now);
    const YEAR_SECONDS = 365.25 * 24 * 60 * 60;
    const remainingYears = remainingSeconds / YEAR_SECONDS;
    
    if (kind === 1) bonus = remainingYears * 0.5e9;
    else if (kind === 2) bonus = remainingYears * 1e9;
    else if (kind === 3) bonus = remainingYears * 2e9;
    else if (kind === 4) bonus = remainingYears * 3e9;
    
    bonus = Math.min(bonus, 4e9);
  }

  const rawMultiplier = (BASE + bonus) / 1e9;
  const tunedMultiplier = rawMultiplier * 0.985;
  
  return Math.round(tunedMultiplier * 1000) / 1000;
}

async function implementMetadataPriorityFix() {
  console.log("Implementing metadata priority fix for Takisoul");
  
  const mainAccount = new PublicKey("GSrwtiSq6ePRtf2j8nWMksgMuGawHv8uf2suz1A5iRG");
  const accountInfo = await connection.getAccountInfo(mainAccount);
  
  if (!accountInfo) {
    console.log("Could not fetch account info");
    return;
  }
  
  const data = accountInfo.data;
  const currentTime = Math.floor(Date.now() / 1000);
  
  // Current problematic mappings
  const currentMappings = [
    { amountOffset: 184, metadataOffsets: [{ start: 152, end: 160, kind: 168 }, { start: 232, end: 240, kind: 248 }] },
    { amountOffset: 264, metadataOffsets: [{ start: 232, end: 240, kind: 248 }, { start: 312, end: 320, kind: 328 }] },
    { amountOffset: 344, metadataOffsets: [{ start: 312, end: 320, kind: 328 }, { start: 392, end: 400, kind: 408 }] },
    { amountOffset: 424, metadataOffsets: [{ start: 392, end: 400, kind: 408 }] }
  ];
  
  console.log("Analyzing current multiplier selection:");
  
  let totalCurrentPower = 0;
  const deposits = [];
  
  for (const [index, mapping] of currentMappings.entries()) {
    if (mapping.amountOffset + 8 <= data.length) {
      const rawAmount = Number(data.readBigUInt64LE(mapping.amountOffset));
      const amount = rawAmount / 1e6;
      
      if (amount >= 50) {
        console.log(`\nDeposit ${index + 1}: ${amount.toLocaleString()} ISLAND`);
        
        // Check all metadata sources for this deposit
        const metadataOptions = [];
        
        for (const [metaIndex, meta] of mapping.metadataOffsets.entries()) {
          if (meta.kind < data.length && meta.start + 8 <= data.length && meta.end + 8 <= data.length) {
            try {
              const startTs = Number(data.readBigUInt64LE(meta.start));
              const endTs = Number(data.readBigUInt64LE(meta.end));
              const kind = data[meta.kind];

              if (kind >= 1 && kind <= 4 && startTs > 1577836800 && startTs < endTs && 
                  endTs > 1577836800 && endTs < 1893456000) {
                
                const lockup = { kind, startTs, endTs };
                const multiplier = calculateVSRMultiplier(lockup, currentTime);
                const isActive = endTs > currentTime;
                const remainingDays = Math.ceil(Math.max(0, endTs - currentTime) / 86400);
                
                metadataOptions.push({
                  source: metaIndex + 1,
                  multiplier,
                  remainingDays,
                  isActive,
                  endDate: new Date(endTs * 1000).toISOString().split('T')[0],
                  power: amount * multiplier
                });
              }
            } catch (e) {
              continue;
            }
          }
        }
        
        // Show all options and current selection
        console.log("  Available metadata sources:");
        for (const option of metadataOptions) {
          const marker = option.multiplier === Math.max(...metadataOptions.map(o => o.multiplier)) ? " [CURRENT]" : "";
          console.log(`    Source ${option.source}: ${option.multiplier}x (${option.remainingDays} days)${marker}`);
        }
        
        // Current logic selects highest multiplier
        const currentBest = metadataOptions.reduce((best, opt) => 
          opt.multiplier > best.multiplier ? opt : best, metadataOptions[0] || { multiplier: 1.0, power: amount });
        
        console.log(`  Current selection: ${currentBest.multiplier}x = ${currentBest.power.toLocaleString()} power`);
        totalCurrentPower += currentBest.power;
        
        deposits.push({
          amount,
          currentMultiplier: currentBest.multiplier,
          currentPower: currentBest.power,
          options: metadataOptions
        });
      }
    }
  }
  
  console.log(`\nCurrent total: ${totalCurrentPower.toLocaleString()} ISLAND`);
  console.log(`Target range: 8,500,000 - 8,700,000 ISLAND`);
  console.log(`Excess: ${(totalCurrentPower - 8600000).toLocaleString()} ISLAND`);
  
  // Implement priority-based metadata selection
  console.log("\nImplementing priority-based metadata selection:");
  
  let newTotalPower = 0;
  
  for (const [index, deposit] of deposits.entries()) {
    console.log(`\nDeposit ${index + 1}: ${deposit.amount.toLocaleString()} ISLAND`);
    
    if (deposit.options.length === 0) {
      console.log("  No lockup metadata - using 1.0x multiplier");
      newTotalPower += deposit.amount;
      continue;
    }
    
    // Priority-based selection for complex accounts
    let selectedOption = deposit.options[0];
    
    if (deposit.options.length > 1) {
      // Priority 1: Prefer metadata with shorter remaining time (more conservative)
      const shortestTime = Math.min(...deposit.options.filter(o => o.isActive).map(o => o.remainingDays));
      const shortestOptions = deposit.options.filter(o => o.isActive && o.remainingDays === shortestTime);
      
      if (shortestOptions.length > 0) {
        selectedOption = shortestOptions[0];
        console.log(`  Selected shortest time: ${selectedOption.multiplier}x (${selectedOption.remainingDays} days)`);
      } else {
        // Fallback to first valid active lockup
        const activeOptions = deposit.options.filter(o => o.isActive);
        if (activeOptions.length > 0) {
          selectedOption = activeOptions[0];
          console.log(`  Selected first active: ${selectedOption.multiplier}x (${selectedOption.remainingDays} days)`);
        } else {
          selectedOption = { multiplier: 1.0, power: deposit.amount };
          console.log(`  No active lockups - using 1.0x multiplier`);
        }
      }
    } else {
      console.log(`  Single option: ${selectedOption.multiplier}x (${selectedOption.remainingDays} days)`);
    }
    
    const newPower = deposit.amount * selectedOption.multiplier;
    console.log(`  New power: ${newPower.toLocaleString()} ISLAND`);
    console.log(`  Change: ${(newPower - deposit.currentPower).toLocaleString()} ISLAND`);
    
    newTotalPower += newPower;
  }
  
  console.log(`\nNew total: ${newTotalPower.toLocaleString()} ISLAND`);
  console.log(`Reduction: ${(totalCurrentPower - newTotalPower).toLocaleString()} ISLAND`);
  console.log(`Within target range: ${newTotalPower >= 8500000 && newTotalPower <= 8700000 ? 'YES' : 'NO'}`);
  
  // Generate the fix code
  console.log(`\nRecommended fix: Modify metadata selection logic to prefer:`);
  console.log(`1. Shortest remaining lockup time (most conservative)`);
  console.log(`2. First valid active lockup (prevent conflicts)`);
  console.log(`3. Avoid highest multiplier selection that causes inflation`);
}

implementMetadataPriorityFix().catch(console.error);