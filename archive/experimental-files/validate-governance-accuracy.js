/**
 * Validate VSR Governance Power Accuracy
 * Test all reference wallets against expected values with 0.5% tolerance
 */

const testWallets = [
  {
    wallet: "3PKhzE9wuEkGPHHu2sNCvG86xNtDJduAcyBPXpE6cSNt",
    expectedNative: 1,
    expectedDelegated: 1268162,
    notes: "All tokens withdrawn, 1 expired lockup, only delegation remains",
  },
  {
    wallet: "GJdRQcsyz49FMM4LvPqpaM2QA3yWFr8WamJ95hkwCBAh",
    expectedNative: 144708.98,
    expectedDelegated: 0,
    notes: "Four deposits with known lockups and multipliers",
  },
  {
    wallet: "Fywb7YDCXxtD7pNKThJ36CAtVe23dEeEPf7HqKzJs1VG",
    expectedNative: 3361730.15,
    expectedDelegated: 1598919.1,
    expectedTotal: 4960649.25,
    notes: "Reported by user, total must match",
  },
  {
    wallet: "Fgv1zrwB6VF3jc45PaNT5t9AnSsJrwb8r7aMNip5fRY1",
    expectedNative: 200000,
    expectedDelegated: 0,
    notes: "Single unlocked deposit with multiplier = 1.0 (should be skipped)",
  },
  {
    wallet: "4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4",
    expectedNative: 12625.58,
    notes: "User never locked up, only delegated from CinHb6Xt2PnqKUkmhRo9hwUkixCcsH1uviuQqaTxwT9i",
  },
  {
    wallet: "7pPJt2xoEoPy8x8Hf2D6U6oLfNa5uKmHHRwkENVoaxmA",
    expectedNative: 8709019.78,
    notes: "Canonical test case, all deposits must match to this exact amount",
  }
];

async function validateGovernanceAccuracy() {
  console.log('🧪 Validating VSR Governance Power Accuracy');
  console.log('Target tolerance: ±0.5%\n');
  
  for (const testCase of testWallets) {
    console.log(`\n🔍 Testing: ${testCase.wallet}`);
    console.log(`Expected native: ${testCase.expectedNative.toLocaleString()} ISLAND`);
    console.log(`Notes: ${testCase.notes}`);
    
    try {
      const response = await fetch(`http://localhost:3001/api/governance-power?wallet=${testCase.wallet}`);
      const result = await response.json();
      
      const actualNative = result.nativeGovernancePower;
      const actualDelegated = result.delegatedGovernancePower;
      const actualTotal = result.totalGovernancePower;
      
      // Calculate accuracy for native power
      const nativeError = Math.abs(actualNative - testCase.expectedNative);
      const nativeErrorPercent = (nativeError / testCase.expectedNative) * 100;
      const nativeAccurate = nativeErrorPercent <= 0.5;
      
      console.log(`\n📊 Results:`);
      console.log(`  Native: ${actualNative.toFixed(2)} ISLAND (expected: ${testCase.expectedNative})`);
      console.log(`  Error: ${nativeError.toFixed(2)} ISLAND (${nativeErrorPercent.toFixed(3)}%)`);
      console.log(`  Status: ${nativeAccurate ? '✅ PASS' : '❌ FAIL'} - ${nativeAccurate ? 'Within 0.5% tolerance' : 'Exceeds 0.5% tolerance'}`);
      
      if (result.breakdown && result.breakdown.length > 0) {
        console.log(`\n📋 Deposit breakdown (${result.breakdown.length} deposits):`);
        result.breakdown.forEach((deposit, index) => {
          const [amount, multiplier, power] = deposit;
          console.log(`    ${index + 1}. ${amount.toLocaleString()} ISLAND × ${multiplier.toFixed(6)} = ${power.toLocaleString()} power`);
        });
      }
      
      // Check delegated power if expected
      if (testCase.expectedDelegated !== undefined) {
        const delegatedError = Math.abs(actualDelegated - testCase.expectedDelegated);
        const delegatedErrorPercent = testCase.expectedDelegated > 0 ? (delegatedError / testCase.expectedDelegated) * 100 : 0;
        const delegatedAccurate = delegatedErrorPercent <= 0.5;
        
        console.log(`\n  Delegated: ${actualDelegated.toFixed(2)} ISLAND (expected: ${testCase.expectedDelegated})`);
        console.log(`  Delegated Error: ${delegatedError.toFixed(2)} ISLAND (${delegatedErrorPercent.toFixed(3)}%)`);
        console.log(`  Delegated Status: ${delegatedAccurate ? '✅ PASS' : '❌ FAIL'}`);
      }
      
      // Check total if expected
      if (testCase.expectedTotal !== undefined) {
        const totalError = Math.abs(actualTotal - testCase.expectedTotal);
        const totalErrorPercent = (totalError / testCase.expectedTotal) * 100;
        const totalAccurate = totalErrorPercent <= 0.5;
        
        console.log(`\n  Total: ${actualTotal.toFixed(2)} ISLAND (expected: ${testCase.expectedTotal})`);
        console.log(`  Total Error: ${totalError.toFixed(2)} ISLAND (${totalErrorPercent.toFixed(3)}%)`);
        console.log(`  Total Status: ${totalAccurate ? '✅ PASS' : '❌ FAIL'}`);
      }
      
    } catch (error) {
      console.log(`❌ ERROR: ${error.message}`);
    }
    
    console.log('─'.repeat(80));
  }
}

// Run validation
validateGovernanceAccuracy().catch(console.error);