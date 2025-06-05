/**
 * Blockchain Validation Report
 * Generate detailed table showing live blockchain data validation for all citizens
 * Including addresses, governance power, VSR account counts, and validation timestamps
 */

const fs = require('fs');

async function generateBlockchainValidationReport() {
  console.log('BLOCKCHAIN VALIDATION REPORT');
  console.log('============================');
  console.log('Testing all citizen addresses against live Solana blockchain');
  console.log('This will take time as each calculation scans the actual blockchain\n');
  
  // Load all citizens from the map
  const governanceData = JSON.parse(fs.readFileSync('citizen-map/data/governance-power.json', 'utf8'));
  
  const validationResults = [];
  
  console.log('Validating each citizen against live blockchain...\n');
  
  for (let i = 0; i < governanceData.citizens.length; i++) {
    const citizen = governanceData.citizens[i];
    
    console.log(`[${i + 1}/${governanceData.citizens.length}] Validating ${citizen.nickname}...`);
    
    const startTime = Date.now();
    
    try {
      // Call live API which scans actual blockchain
      const response = await fetch(`http://localhost:3001/api/governance-power?wallet=${citizen.wallet}`);
      const data = await response.json();
      
      const endTime = Date.now();
      const processingTime = endTime - startTime;
      
      // Extract VSR account count from response (if available in logs)
      const vsrAccountCount = 'Unknown'; // Would need to modify API to return this
      
      validationResults.push({
        rank: i + 1,
        nickname: citizen.nickname,
        wallet: citizen.wallet.slice(0, 8) + '...' + citizen.wallet.slice(-4),
        fullWallet: citizen.wallet,
        nativeGovernancePower: data.nativeGovernancePower || 0,
        vsrAccountCount: vsrAccountCount,
        validationTimestamp: new Date().toISOString(),
        processingTimeMs: processingTime,
        dataSource: data.source || 'vsr_api',
        blockchainScanConfirmed: processingTime > 1000 // Real blockchain calls take time
      });
      
      console.log(`  Result: ${(data.nativeGovernancePower || 0).toLocaleString()} ISLAND (${processingTime}ms)`);
      
    } catch (error) {
      validationResults.push({
        rank: i + 1,
        nickname: citizen.nickname,
        wallet: citizen.wallet.slice(0, 8) + '...' + citizen.wallet.slice(-4),
        fullWallet: citizen.wallet,
        nativeGovernancePower: 0,
        vsrAccountCount: 'Error',
        validationTimestamp: new Date().toISOString(),
        processingTimeMs: 0,
        dataSource: 'error',
        blockchainScanConfirmed: false,
        error: error.message
      });
      
      console.log(`  Error: ${error.message}`);
    }
    
    // Small delay between calls to avoid overwhelming
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  
  // Generate detailed table
  console.log('\n\nDETAILED BLOCKCHAIN VALIDATION TABLE');
  console.log('=====================================\n');
  
  console.log('Rank | Nickname        | Wallet Address  | Native Power   | VSR Accounts | Validation Time      | Processing | Blockchain');
  console.log('-----|-----------------|-----------------|----------------|--------------|----------------------|------------|----------');
  
  validationResults.forEach(result => {
    const nickname = result.nickname.padEnd(15);
    const wallet = result.wallet.padEnd(15);
    const power = result.nativeGovernancePower.toLocaleString().padStart(14);
    const vsrCount = result.vsrAccountCount.toString().padEnd(12);
    const timestamp = result.validationTimestamp.split('T')[1].slice(0, 8).padEnd(20);
    const processing = `${result.processingTimeMs}ms`.padEnd(10);
    const blockchain = result.blockchainScanConfirmed ? 'LIVE' : 'CACHED?';
    
    console.log(`${result.rank.toString().padStart(4)} | ${nickname} | ${wallet} | ${power} | ${vsrCount} | ${timestamp} | ${processing} | ${blockchain}`);
  });
  
  // Summary statistics
  const withGovernancePower = validationResults.filter(r => r.nativeGovernancePower > 0);
  const fastResponses = validationResults.filter(r => r.processingTimeMs < 1000);
  const slowResponses = validationResults.filter(r => r.processingTimeMs >= 1000);
  
  console.log('\n\nVALIDATION SUMMARY');
  console.log('==================');
  console.log(`Total citizens validated: ${validationResults.length}`);
  console.log(`Citizens with governance power: ${withGovernancePower.length}`);
  console.log(`Fast responses (<1s): ${fastResponses.length} - SUSPICIOUS for blockchain calls`);
  console.log(`Slow responses (≥1s): ${slowResponses.length} - Expected for live blockchain scanning`);
  
  if (fastResponses.length > slowResponses.length) {
    console.log('\n⚠️  WARNING: High number of fast responses suggests cached/pre-computed data');
    console.log('   Real blockchain scanning should take 1-3 seconds per wallet');
  }
  
  // Save detailed report
  const report = {
    generatedAt: new Date().toISOString(),
    totalCitizens: validationResults.length,
    citizensWithPower: withGovernancePower.length,
    dataIntegrityFlags: {
      fastResponseCount: fastResponses.length,
      slowResponseCount: slowResponses.length,
      suspiciouslyFastData: fastResponses.length > slowResponses.length
    },
    validationResults: validationResults
  };
  
  fs.writeFileSync('blockchain-validation-report.json', JSON.stringify(report, null, 2));
  console.log('\nDetailed report saved to: blockchain-validation-report.json');
  
  return report;
}

generateBlockchainValidationReport().catch(console.error);