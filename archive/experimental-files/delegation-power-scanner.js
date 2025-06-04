/**
 * Delegation Power Scanner for IslandDAO Citizens
 * Calculates delegated governance power separate from native power
 */

import fs from 'fs';

// Load locked native governance power results
const nativeResults = JSON.parse(fs.readFileSync('./native-results-latest.json', 'utf8'));

const nativePowerMap = {};
nativeResults.results.forEach(entry => {
  nativePowerMap[entry.wallet] = entry.nativePower;
});

// Print total native power snapshot
console.log("DELEGATION POWER SCANNER INITIALIZATION");
console.log("=====================================");
console.log("Total wallets with native power:", Object.keys(nativePowerMap).filter(wallet => nativePowerMap[wallet] > 0).length);
console.log("Example wallet:", Object.keys(nativePowerMap)[0], "→ Native:", nativePowerMap[Object.keys(nativePowerMap)[0]]);

const totalNativePower = Object.values(nativePowerMap).reduce((sum, power) => sum + power, 0);
console.log("Total native governance power:", totalNativePower.toFixed(2), "ISLAND");

// Delegation logic to be implemented separately here
console.log("\n🛠️ Delegation power calculation logic will be implemented here");
console.log("📊 Native power baseline established from locked scanner results");

export { nativePowerMap, totalNativePower };