/**
 * Export clean governance leaderboard for validation
 */

import fs from 'fs/promises';

// Read the latest scan results
const timestamp = new Date().toISOString().split('T')[0];
const filename = `vwr-governance-scan-${timestamp}.json`;

try {
  const data = await fs.readFile(filename, 'utf8');
  const scanData = JSON.parse(data);
  const scanResults = scanData.results || scanData;
  
  console.log('📊 GOVERNANCE LEADERBOARD EXPORT');
  console.log('='.repeat(50));
  
  // Export clean format for validation
  const exportData = scanResults.map(result => ({
    wallet: result.wallet,
    native: result.nativeGovernancePower,
    delegated: result.delegatedGovernancePower,
    total: result.totalGovernancePower
  }));
  
  // Sort by total governance power
  exportData.sort((a, b) => b.total - a.total);
  
  console.log('\nRank | Wallet Address | Native | Delegated | Total');
  console.log('-'.repeat(80));
  
  exportData.forEach((item, index) => {
    if (item.total > 0) {
      console.log(`${(index + 1).toString().padStart(2)} | ${item.wallet.substring(0,8)}... | ${item.native.toLocaleString().padStart(12)} | ${item.delegated.toLocaleString().padStart(12)} | ${item.total.toLocaleString().padStart(12)}`);
    }
  });
  
  // Export CSV
  const csvData = exportData
    .filter(item => item.total > 0)
    .map(item => `${item.wallet},${item.native},${item.delegated},${item.total}`)
    .join('\n');
  
  await fs.writeFile(`governance-leaderboard-${timestamp}.csv`, 
    `wallet,native,delegated,total\n${csvData}`);
    
  console.log(`\n💾 Exported to: governance-leaderboard-${timestamp}.csv`);
  
  // Summary stats
  const totalNative = exportData.reduce((sum, item) => sum + item.native, 0);
  const totalDelegated = exportData.reduce((sum, item) => sum + item.delegated, 0);
  const totalGovernance = exportData.reduce((sum, item) => sum + item.total, 0);
  
  console.log('\n📈 SUMMARY:');
  console.log(`Total Native Power: ${totalNative.toLocaleString()} ISLAND`);
  console.log(`Total Delegated Power: ${totalDelegated.toLocaleString()} ISLAND`);
  console.log(`Total Governance Power: ${totalGovernance.toLocaleString()} ISLAND`);
  console.log(`Active Wallets: ${exportData.filter(item => item.total > 0).length}`);
  
} catch (error) {
  console.error('❌ Error:', error.message);
}