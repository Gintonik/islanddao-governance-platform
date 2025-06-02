/**
 * Batch Validation for Canonical VSR Governance Power Calculator
 * Tests all 20 wallets against the canonical API with accuracy validation
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

// Known ground truth values for accuracy validation
const groundTruth = {
  '7pPJt2xoEoPy8x8Hf2D6U6oLfNa5uKmHHRwkENVoaxmA': { native: 8709019.78, name: 'Takisoul' },
  'GJdRQcsyz49FMM4LvPqpaM2QA3yWFr8WamJ95hkwCBAh': { native: 144708.98, name: 'GJdR' },
  'Fgv1zrwB6VF3jc45PaNT5t9AnSsJrwb8r7aMNip5fRY1': { native: 0, name: 'Fgv1 (unlocked)' },
  'Fywb7YDCXxtD7pNKThJ36CAtVe23dEeEPf7HqKzJs1VG': { native: 3360000, delegated: 1600000, name: 'Fywb' },
  '3PKhzE9wuEkGPHHu2sNCvG86xNtDJduAcyBPXpE6cSNt': { native: 1, delegated: 1260000, name: '3PKh' }
};

async function fetchGovernancePower(wallet) {
  try {
    const response = await fetch(`http://localhost:3001/api/governance-power?wallet=${wallet}`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    console.error(`❌ Error fetching data for ${wallet}: ${error.message}`);
    return null;
  }
}

function validateAccuracy(wallet, result) {
  const expected = groundTruth[wallet];
  if (!expected) {
    return { isGroundTruth: false, valid: true, message: 'No ground truth data available' };
  }
  
  const tolerance = 0.005; // 0.5%
  const validations = [];
  let allValid = true;
  
  // Validate native governance power
  if (expected.native !== undefined) {
    if (expected.native === 0) {
      const nativeValid = result.nativeGovernancePower === 0;
      validations.push({
        type: 'Native',
        expected: expected.native,
        actual: result.nativeGovernancePower,
        valid: nativeValid,
        difference: nativeValid ? 0 : 100
      });
      if (!nativeValid) allValid = false;
    } else {
      const difference = Math.abs(result.nativeGovernancePower - expected.native) / expected.native;
      const nativeValid = difference <= tolerance;
      validations.push({
        type: 'Native',
        expected: expected.native,
        actual: result.nativeGovernancePower,
        valid: nativeValid,
        difference: difference * 100
      });
      if (!nativeValid) allValid = false;
    }
  }
  
  // Validate delegated governance power
  if (expected.delegated !== undefined) {
    if (expected.delegated === 0) {
      const delegatedValid = result.delegatedGovernancePower === 0;
      validations.push({
        type: 'Delegated',
        expected: expected.delegated,
        actual: result.delegatedGovernancePower,
        valid: delegatedValid,
        difference: delegatedValid ? 0 : 100
      });
      if (!delegatedValid) allValid = false;
    } else {
      const difference = Math.abs(result.delegatedGovernancePower - expected.delegated) / expected.delegated;
      const delegatedValid = difference <= tolerance;
      validations.push({
        type: 'Delegated',
        expected: expected.delegated,
        actual: result.delegatedGovernancePower,
        valid: delegatedValid,
        difference: difference * 100
      });
      if (!delegatedValid) allValid = false;
    }
  }
  
  return {
    isGroundTruth: true,
    valid: allValid,
    validations: validations,
    name: expected.name
  };
}

async function batchValidateAllWallets() {
  console.log('🧪 Canonical VSR Governance Power Batch Validation');
  console.log('Testing all 20 citizen wallets with accuracy validation\n');
  
  const results = [];
  let groundTruthCount = 0;
  let passedCount = 0;
  
  for (let i = 0; i < wallets.length; i++) {
    const wallet = wallets[i];
    console.log(`[${i + 1}/20] Testing wallet: ${wallet}`);
    
    const result = await fetchGovernancePower(wallet);
    if (!result) {
      console.log('❌ Failed to fetch governance power\n');
      continue;
    }
    
    console.log(`Native: ${result.nativeGovernancePower.toLocaleString()}`);
    console.log(`Delegated: ${result.delegatedGovernancePower.toLocaleString()}`);
    console.log(`Total: ${result.totalGovernancePower.toLocaleString()}`);
    
    if (result.deposits && result.deposits.length > 0) {
      console.log(`Deposits: ${result.deposits.length} entries`);
      result.deposits.slice(0, 3).forEach((deposit, idx) => {
        console.log(`  [${idx + 1}] ${deposit.amount.toLocaleString()} × ${deposit.multiplier.toFixed(3)} = ${deposit.votingPower.toLocaleString()}`);
      });
      if (result.deposits.length > 3) {
        console.log(`  ... and ${result.deposits.length - 3} more deposits`);
      }
    }
    
    // Validate against ground truth
    const validation = validateAccuracy(wallet, result);
    
    if (validation.isGroundTruth) {
      groundTruthCount++;
      console.log(`\nAccuracy Validation (${validation.name}):`);
      
      validation.validations.forEach(v => {
        const status = v.valid ? '✅ PASS' : '❌ FAIL';
        console.log(`  ${v.type}: ${status} - Expected: ${v.expected.toLocaleString()}, Actual: ${v.actual.toLocaleString()}, Diff: ${v.difference.toFixed(2)}%`);
      });
      
      if (validation.valid) {
        passedCount++;
        console.log(`Overall: ✅ PASSED (within 0.5% tolerance)`);
      } else {
        console.log(`Overall: ❌ FAILED (exceeded 0.5% tolerance)`);
      }
    }
    
    results.push({ wallet, result, validation });
    console.log('\n' + '─'.repeat(80) + '\n');
  }
  
  // Final summary
  console.log('🏆 BATCH VALIDATION SUMMARY');
  console.log('═'.repeat(80));
  
  console.log(`\n📊 Overall Statistics:`);
  console.log(`  Total Wallets Tested: ${results.length}`);
  console.log(`  Ground Truth Wallets: ${groundTruthCount}`);
  console.log(`  Accuracy Validation: ${passedCount}/${groundTruthCount} passed`);
  
  const walletsWithPower = results.filter(r => r.result && r.result.totalGovernancePower > 0);
  const totalNative = results.reduce((sum, r) => sum + (r.result ? r.result.nativeGovernancePower : 0), 0);
  const totalDelegated = results.reduce((sum, r) => sum + (r.result ? r.result.delegatedGovernancePower : 0), 0);
  
  console.log(`  Wallets with Power: ${walletsWithPower.length}/${results.length}`);
  console.log(`  Total Native Power: ${totalNative.toLocaleString()} ISLAND`);
  console.log(`  Total Delegated Power: ${totalDelegated.toLocaleString()} ISLAND`);
  
  // Ground truth validation summary
  if (groundTruthCount > 0) {
    console.log(`\n🎯 Ground Truth Validation Results:`);
    
    results.filter(r => r.validation.isGroundTruth).forEach(({ wallet, validation }) => {
      const status = validation.valid ? '✅ PASS' : '❌ FAIL';
      console.log(`  ${status} ${validation.name} (${wallet})`);
    });
    
    const accuracyRate = (passedCount / groundTruthCount) * 100;
    const overallStatus = passedCount === groundTruthCount ? '✅ SUCCESS' : '❌ FAILED';
    
    console.log(`\n🏁 Final Result: ${overallStatus}`);
    console.log(`Canonical VSR governance power calculation achieved ${accuracyRate.toFixed(1)}% accuracy`);
    
    if (passedCount === groundTruthCount) {
      console.log('All ground truth wallets passed the <0.5% tolerance requirement');
    } else {
      console.log(`${groundTruthCount - passedCount} ground truth wallet(s) failed accuracy validation`);
    }
  }
  
  return passedCount === groundTruthCount;
}

// Execute the batch validation
batchValidateAllWallets();