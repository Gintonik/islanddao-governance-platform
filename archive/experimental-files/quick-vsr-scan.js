/**
 * Quick VSR Scan - Complete the canonical scan efficiently
 */

import { scanAllCitizenGovernancePower, updateDatabaseWithResults } from './canonical-island-vsr-scanner.js';

console.log('Completing canonical VSR scan...');

scanAllCitizenGovernancePower()
  .then(async (results) => {
    await updateDatabaseWithResults(results);
    
    const withPower = results.filter(r => r.nativeGovernancePower > 0);
    
    console.log('\nFinal Results:');
    console.log(`Citizens with governance power: ${withPower.length}/20`);
    
    // Show top results
    withPower.slice(0, 10).forEach((result, i) => {
      console.log(`${i + 1}. ${result.wallet.substring(0, 8)}: ${result.nativeGovernancePower.toLocaleString()} ISLAND`);
    });
    
    process.exit(0);
  })
  .catch(error => {
    console.error('Scan failed:', error.message);
    process.exit(1);
  });