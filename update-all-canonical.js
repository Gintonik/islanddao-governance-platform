/**
 * Update All Citizens with Canonical VSR Calculator
 * Run the authentic VSR calculator on all citizens
 */

import { updateAllCitizensCanonical } from './canonical-vsr-calculator.js';

console.log('Starting canonical VSR update for all citizens...');
console.log('Using authentic IslandDAO registrar configuration');
console.log('No hardcoded values - pure blockchain data');

updateAllCitizensCanonical()
  .then(result => {
    console.log(`\nUpdate completed: ${result.withPower}/${result.total} citizens have governance power`);
    process.exit(0);
  })
  .catch(error => {
    console.error('Update failed:', error.message);
    process.exit(1);
  });