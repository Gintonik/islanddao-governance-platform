/**
 * Investigate how the canonical VSR program calculates the 1.35x multiplier
 * Reverse engineer from realms.today expected results
 */

import { Connection, PublicKey } from "@solana/web3.js";
import { config } from "dotenv";

config();

const connection = new Connection(process.env.HELIUS_RPC_URL);

// Test different multiplier calculation approaches
function testMultiplierCalculations(remainingDays, totalDays, lockupType) {
  const results = [];
  
  // Method 1: Standard VSR calculation
  const remainingSeconds = remainingDays * 86400;
  const YEAR_SECONDS = 365.25 * 24 * 60 * 60;
  const remainingYears = remainingSeconds / YEAR_SECONDS;
  
  let bonus1 = 0;
  if (lockupType === 3) { // Vesting
    bonus1 = remainingYears * 2e9;
  }
  bonus1 = Math.min(bonus1, 4e9);
  const multiplier1 = ((1e9 + bonus1) / 1e9) * 0.985;
  results.push({ method: "Standard VSR", multiplier: Math.round(multiplier1 * 1000) / 1000 });
  
  // Method 2: Different tuning factor
  const multiplier2 = ((1e9 + bonus1) / 1e9) * 1.0;
  results.push({ method: "No tuning", multiplier: Math.round(multiplier2 * 1000) / 1000 });
  
  // Method 3: Different bonus calculation
  let bonus3 = 0;
  if (lockupType === 3) {
    bonus3 = remainingYears * 1.5e9; // Different rate
  }
  bonus3 = Math.min(bonus3, 4e9);
  const multiplier3 = ((1e9 + bonus3) / 1e9) * 0.985;
  results.push({ method: "1.5x rate", multiplier: Math.round(multiplier3 * 1000) / 1000 });
  
  // Method 4: Based on total duration not remaining
  const totalYears = totalDays / 365.25;
  let bonus4 = 0;
  if (lockupType === 3) {
    bonus4 = totalYears * 2e9;
  }
  bonus4 = Math.min(bonus4, 4e9);
  const multiplier4 = ((1e9 + bonus4) / 1e9) * 0.985;
  results.push({ method: "Total duration", multiplier: Math.round(multiplier4 * 1000) / 1000 });
  
  return results;
}

async function investigateVSRCalculation() {
  console.log("🔍 Investigating VSR multiplier calculation methods");
  console.log("Target: 1.35x multiplier for Takisoul's 3,682,784.632186 ISLAND deposit");
  console.log("Time left: 1m 12d (approximately 42 days)");
  console.log("");
  
  // Test various scenarios
  const scenarios = [
    { remainingDays: 42, totalDays: 60, desc: "42 days remaining, 60 day total" },
    { remainingDays: 42, totalDays: 90, desc: "42 days remaining, 90 day total" },
    { remainingDays: 42, totalDays: 120, desc: "42 days remaining, 120 day total" },
    { remainingDays: 72, totalDays: 90, desc: "72 days remaining, 90 day total" }
  ];
  
  for (const scenario of scenarios) {
    console.log(`📊 Testing: ${scenario.desc}`);
    const results = testMultiplierCalculations(scenario.remainingDays, scenario.totalDays, 3);
    
    for (const result of results) {
      console.log(`  ${result.method}: ${result.multiplier}x`);
      if (Math.abs(result.multiplier - 1.35) < 0.05) {
        console.log(`    🎯 CLOSE to target 1.35x!`);
      }
    }
    console.log("");
  }
  
  // Calculate what parameters would give exactly 1.35x
  console.log("🎯 Reverse engineering for exact 1.35x multiplier:");
  
  const targetMultiplier = 1.35;
  const targetBonus = (targetMultiplier / 0.985 - 1) * 1e9;
  const requiredYears = targetBonus / (2e9); // For vesting lockup
  const requiredDays = requiredYears * 365.25;
  
  console.log(`Required bonus: ${targetBonus.toLocaleString()}`);
  console.log(`Required years: ${requiredYears.toFixed(3)}`);
  console.log(`Required days: ${Math.round(requiredDays)}`);
  
  // Check if this matches any known lockup patterns
  console.log("\n📝 Analysis:");
  console.log("The 1.35x multiplier suggests either:");
  console.log("1. A different calculation method than standard VSR");
  console.log("2. Different lockup parameters than detected");
  console.log("3. Additional multiplier factors not accounted for");
  
  // Test realms.today calculation approach
  console.log("\n🔬 Testing realms.today approach:");
  console.log("If total governance power is 8,709,019.78 ISLAND:");
  
  const expectedTotal = 8709019.78;
  const deposit1 = 1500000; // Assume 1.0x for simplicity
  const deposit2 = 2000000; // Assume 1.0x for simplicity  
  const deposit3 = 3682784.632186;
  
  const powerFrom3 = expectedTotal - deposit1 - deposit2;
  const impliedMultiplier = powerFrom3 / deposit3;
  
  console.log(`Power from deposit 3: ${powerFrom3.toLocaleString()}`);
  console.log(`Implied multiplier: ${impliedMultiplier.toFixed(3)}x`);
  console.log("");
  
  console.log("✅ RECOMMENDATION:");
  console.log("Need to investigate the exact VSR program implementation");
  console.log("or find the correct metadata offsets that produce 1.35x multiplier.");
}

investigateVSRCalculation().catch(console.error);