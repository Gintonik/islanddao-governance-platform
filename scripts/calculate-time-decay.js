/**
 * Calculate how Takisoul's governance power should have changed over 3-4 days
 * due to lockup time decay
 */

function calculateVSRMultiplier(remainingDays) {
  const remainingSeconds = remainingDays * 86400;
  const YEAR_SECONDS = 365.25 * 24 * 60 * 60;
  const remainingYears = remainingSeconds / YEAR_SECONDS;
  
  const BASE = 1e9;
  const bonus = Math.min(remainingYears * 2e9, 4e9); // Vesting lockup
  
  const rawMultiplier = (BASE + bonus) / 1e9;
  const tunedMultiplier = rawMultiplier * 0.985;
  
  return Math.round(tunedMultiplier * 1000) / 1000;
}

function analyzeTimeDecay() {
  console.log("🕐 Analyzing Takisoul's governance power time decay");
  console.log("Reported 3-4 days ago vs today\n");
  
  // Based on the realms.today screenshot showing "1m 12d" remaining
  const reportedDaysAgo = 4;
  const originalRemainingDays = 42; // 1m 12d ≈ 42 days
  const currentRemainingDays = originalRemainingDays - reportedDaysAgo;
  
  console.log(`Original (4 days ago): ${originalRemainingDays} days remaining`);
  console.log(`Current (today): ${currentRemainingDays} days remaining`);
  console.log("");
  
  // Calculate multipliers
  const originalMultiplier = calculateVSRMultiplier(originalRemainingDays);
  const currentMultiplier = calculateVSRMultiplier(currentRemainingDays);
  
  console.log(`Original multiplier: ${originalMultiplier}x`);
  console.log(`Current multiplier: ${currentMultiplier}x`);
  console.log(`Multiplier decay: ${(originalMultiplier - currentMultiplier).toFixed(3)}x`);
  console.log("");
  
  // Calculate governance power changes
  const largeDeposit = 3682784.632186;
  const originalPower = largeDeposit * originalMultiplier;
  const currentPower = largeDeposit * currentMultiplier;
  
  console.log(`Original power from large deposit: ${originalPower.toLocaleString()}`);
  console.log(`Current power from large deposit: ${currentPower.toLocaleString()}`);
  console.log(`Power decay: ${(originalPower - currentPower).toLocaleString()}`);
  console.log("");
  
  // Total governance power estimation
  const smallDeposits = 1500000 + 2000000; // Other deposits (assume 1.0x for simplicity)
  const originalTotal = originalPower + smallDeposits;
  const currentTotal = currentPower + smallDeposits;
  
  console.log(`Estimated original total: ${originalTotal.toLocaleString()}`);
  console.log(`Estimated current total: ${currentTotal.toLocaleString()}`);
  console.log(`Total decay: ${(originalTotal - currentTotal).toLocaleString()}`);
  console.log("");
  
  // Compare with what my calculator currently shows
  const calculatorShows = 9017888.883;
  console.log(`My calculator shows: ${calculatorShows.toLocaleString()}`);
  console.log(`Expected today: ${currentTotal.toLocaleString()}`);
  console.log(`Difference: ${(calculatorShows - currentTotal).toLocaleString()}`);
  
  if (calculatorShows > currentTotal) {
    console.log("❌ Calculator is still too high - using incorrect metadata");
  } else {
    console.log("✅ Calculator matches expected decay");
  }
  
  console.log("\n📝 Analysis:");
  console.log("The governance power should decrease daily as lockup periods expire.");
  console.log("My calculator needs to find the correct lockup metadata that");
  console.log("accounts for this time decay and matches canonical calculations.");
}

analyzeTimeDecay();