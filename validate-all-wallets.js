/**
 * Validate canonical VSR governance power API for all 20 citizen wallets
 */

const wallets = [
  '2NZ9hwrGNitbGTjt4p4py2m6iwAjJ9Bzs8vXeWs1QpHT',
  '2qYMBZwJhu8zpyEK29Dy5Hf9WrWWe1LkDzrUDiuVzBnk',
  '37TGrYNu56AxaeojgtAok8tQAsBSxGhvFKXqCYFAbBrA',
  '3PKhzE9wuEkGPHHu2sNCvG86xNtDJduAcyBPXpE6cSNt',
  '3s6VUe21HFVEC6j12bPXLcrBHMkTZ66847853pXWXspr',
  '4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4',
  '6aJo6zRiC5CFnuE7cqw4sTtHHknrr69NE7LKxPAfFY9U',
  '7pPJt2xoEoPy8x8Hf2D6U6oLfNa5uKmHHRwkENVoaxmA',
  '9RSpFWGntExNNa6puTVtynmrNAJZRso6w4gFWuMr1o3n',
  '9WW4oiMyW6A9oP4R8jvxJLMZ3RUss18qsM4yBBHJPj94',
  'ADjG92YTwGUxTB3r9SY6Gip4q4xoUQdKq3DA1actaDUd',
  'B93csAjDr4sbgLvYmY1iNcHQ1wLe9abEiodJDcn8K7ST',
  'BPmVp1b4vbT2YUHfcFrtErA67nNsJ5LGAJ2BLg5ds9kz',
  'CdCAQnq13hTUiBxganRXYKw418uUTfZdmosqef2vu1bM',
  'DraTvYwqwySZ4kvzxsiYtKF2K6mp4FE3VbjTdPsJzpXt',
  'EViz4YGrY6GZtfu35Y1Q3PoFWAhoXY6YMHFrcneMbdCF',
  'Fgv1zrwB6VF3jc45PaNT5t9AnSsJrwb8r7aMNip5fRY1',
  'Fywb7YDCXxtD7pNKThJ36CAtVe23dEeEPf7HqKzJs1VG',
  'GJdRQcsyz49FMM4LvPqpaM2QA3yWFr8WamJ95hkwCBAh',
  'kruHL3zJ1Mcbdibsna5xM6yMp7PZZ4BsNTpj2UMgvZC'
];

// Expected values for validation
const expectedValues = {
  '7pPJt2xoEoPy8x8Hf2D6U6oLfNa5uKmHHRwkENVoaxmA': { native: 8709019.78, name: 'Takisoul' },
  'GJdRQcsyz49FMM4LvPqpaM2QA3yWFr8WamJ95hkwCBAh': { native: 144708.98, name: 'GJdR' },
  'Fywb7YDCXxtD7pNKThJ36CAtVe23dEeEPf7HqKzJs1VG': { native: 3360000, delegated: 1600000, total: 4960000, name: 'Fywb' },
  '3PKhzE9wuEkGPHHu2sNCvG86xNtDJduAcyBPXpE6cSNt': { native: 1, delegated: 1260000, name: '3PKh' },
  'Fgv1zrwB6VF3jc45PaNT5t9AnSsJrwb8r7aMNip5fRY1': { native: 0, delegated: 0, name: 'Fgv1' },
  '4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4': { native: 0, name: '4pT6' }
};

async function fetchGovernancePower(wallet) {
  try {
    const response = await fetch(`http://localhost:3001/api/governance-power?wallet=${wallet}`);
    const data = await response.json();
    return data;
  } catch (error) {
    console.error(`Error fetching governance power for ${wallet}:`, error.message);
    return null;
  }
}

function validateAccuracy(wallet, result) {
  const expected = expectedValues[wallet];
  if (!expected) return { valid: true, message: 'No validation data' };
  
  const tolerance = 0.005; // 0.5%
  const validations = [];
  
  if (expected.native !== undefined) {
    const nativeDiff = Math.abs(result.nativeGovernancePower - expected.native) / Math.max(expected.native, 1);
    const nativeValid = nativeDiff <= tolerance;
    validations.push(`Native: ${nativeValid ? '✅' : '❌'} ${result.nativeGovernancePower.toLocaleString()} (expected ${expected.native.toLocaleString()}, diff: ${(nativeDiff * 100).toFixed(2)}%)`);
  }
  
  if (expected.delegated !== undefined) {
    const delegatedDiff = Math.abs(result.delegatedGovernancePower - expected.delegated) / Math.max(expected.delegated, 1);
    const delegatedValid = delegatedDiff <= tolerance;
    validations.push(`Delegated: ${delegatedValid ? '✅' : '❌'} ${result.delegatedGovernancePower.toLocaleString()} (expected ${expected.delegated.toLocaleString()}, diff: ${(delegatedDiff * 100).toFixed(2)}%)`);
  }
  
  if (expected.total !== undefined) {
    const totalDiff = Math.abs(result.totalGovernancePower - expected.total) / Math.max(expected.total, 1);
    const totalValid = totalDiff <= tolerance;
    validations.push(`Total: ${totalValid ? '✅' : '❌'} ${result.totalGovernancePower.toLocaleString()} (expected ${expected.total.toLocaleString()}, diff: ${(totalDiff * 100).toFixed(2)}%)`);
  }
  
  const allValid = !validations.some(v => v.includes('❌'));
  return { valid: allValid, validations, name: expected.name };
}

async function validateAllWallets() {
  console.log('🔍 Validating canonical VSR governance power API for all 20 citizen wallets\n');
  
  const results = [];
  let totalValid = 0;
  let totalTested = 0;
  
  for (const wallet of wallets) {
    console.log(`Testing wallet: ${wallet}`);
    
    const result = await fetchGovernancePower(wallet);
    if (!result) {
      console.log('❌ Failed to fetch data\n');
      continue;
    }
    
    console.log(`Wallet: ${wallet}`);
    console.log(`Native: ${result.nativeGovernancePower.toLocaleString()}`);
    console.log(`Delegated: ${result.delegatedGovernancePower.toLocaleString()}`);
    console.log(`Total: ${result.totalGovernancePower.toLocaleString()}`);
    
    if (result.deposits && result.deposits.length > 0) {
      console.log('Deposits:');
      result.deposits.forEach(deposit => {
        console.log(`  [${deposit.amount.toLocaleString()}, ${deposit.multiplier}, ${deposit.votingPower.toLocaleString()}]`);
      });
    }
    
    // Validate against expected values
    const validation = validateAccuracy(wallet, result);
    if (validation.validations) {
      console.log('\nValidation:');
      validation.validations.forEach(v => console.log(`  ${v}`));
      if (validation.valid) totalValid++;
      totalTested++;
    }
    
    results.push({ wallet, result, validation });
    console.log('\n' + '='.repeat(80) + '\n');
  }
  
  // Summary
  console.log('\n🏆 VALIDATION SUMMARY');
  console.log('='.repeat(80));
  
  const testWallets = results.filter(r => r.validation.validations);
  
  if (testWallets.length > 0) {
    console.log(`\n📊 Test Results: ${totalValid}/${totalTested} wallets passed validation\n`);
    
    testWallets.forEach(({ wallet, validation }) => {
      const status = validation.valid ? '✅ PASS' : '❌ FAIL';
      const name = validation.name ? ` (${validation.name})` : '';
      console.log(`${status} ${wallet}${name}`);
    });
    
    const overallSuccess = totalValid === totalTested;
    console.log(`\n🎯 Overall Result: ${overallSuccess ? '✅ SUCCESS' : '❌ FAILED'}`);
    console.log(`All canonical VSR governance power calculations ${overallSuccess ? 'PASSED' : 'FAILED'} within 0.5% tolerance`);
  } else {
    console.log('\n⚠️  No test wallets with expected values found');
  }
  
  // Additional statistics
  const totalNative = results.reduce((sum, r) => sum + r.result.nativeGovernancePower, 0);
  const totalDelegated = results.reduce((sum, r) => sum + r.result.delegatedGovernancePower, 0);
  const walletsWithPower = results.filter(r => r.result.totalGovernancePower > 0);
  
  console.log(`\n📈 Statistics:`);
  console.log(`  Total Native Power: ${totalNative.toLocaleString()} ISLAND`);
  console.log(`  Total Delegated Power: ${totalDelegated.toLocaleString()} ISLAND`);
  console.log(`  Wallets with Power: ${walletsWithPower.length}/${results.length}`);
}

validateAllWallets();