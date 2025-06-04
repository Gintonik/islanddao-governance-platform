/**
 * Validate current scanner results against expected test cases
 */

import fs from 'fs/promises';

const EXPECTED_RESULTS = {
  'GJdRQcsyz49FMM4LvPqpaM2QA3yWFr8WamJ95hkwCBAh': {
    native: 144708.981722,
    delegated: 0,
    description: '4 active lockups with multipliers'
  },
  'Fgv1zrwB6VF3jc45PaNT5t9AnSsJrwb8r7aMNip5fRY1': {
    native: 200000,
    delegated: 0,
    description: 'Simple 200k deposit'
  },
  '3PKhzE9wuEkGPHHu2sNCvG86xNtDJduAcyBPXpE6cSNt': {
    native: 10353647.013,
    delegated: 1268162,
    description: 'Large native + significant delegated'
  },
  'Fywb7YDCXxtD7pNKThJ36CAtVe23dEeEPf7HqKzJs1VG': {
    native: 3361730.15,
    delegated: 1598919.1,
    description: 'High native + high delegated'
  },
  '4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4': {
    native: 12625.580931,
    delegated: 4190000, // Expected delegation from CinHb
    description: 'Small native + large delegation from CinHb'
  },
  '7pPJt2xoEoPy8x8Hf2D6U6oLfNa5uKmHHRwkENVoaxmA': {
    native: 8709019.78,
    delegated: null, // Not specified
    description: 'Complex lockups'
  },
  'kruHL3zJ1Mcbdibsna5xM6yMp7PZZ4BsNTpj2UMgvZC': {
    native: 30999,
    delegated: 1337238,
    description: 'Small native + delegated'
  }
};

async function validateTestCases() {
  console.log('🧪 VALIDATING TEST CASES AGAINST CURRENT RESULTS');
  console.log('='.repeat(60));
  
  try {
    // Read current scan results
    const data = await fs.readFile('vwr-governance-scan-2025-06-03.json', 'utf8');
    const scanData = JSON.parse(data);
    const results = scanData.results || scanData;
    
    let validationsPassed = 0;
    let validationsFailed = 0;
    
    for (const [wallet, expected] of Object.entries(EXPECTED_RESULTS)) {
      console.log(`\n📋 Testing: ${wallet.substring(0,8)}...`);
      console.log(`Expected: ${expected.description}`);
      
      const actualResult = results.find(r => r.wallet === wallet);
      
      if (!actualResult) {
        console.log(`❌ FAIL: Wallet not found in results`);
        validationsFailed++;
        continue;
      }
      
      const actual = {
        native: actualResult.nativeGovernancePower,
        delegated: actualResult.delegatedGovernancePower,
        total: actualResult.totalGovernancePower
      };
      
      // Validate native power (within 1% tolerance)
      const nativeError = Math.abs(actual.native - expected.native) / expected.native * 100;
      const nativePass = nativeError <= 1.0;
      
      console.log(`Native: Expected ${expected.native.toLocaleString()}, Got ${actual.native.toLocaleString()}`);
      console.log(`        Error: ${nativeError.toFixed(2)}% ${nativePass ? '✅' : '❌'}`);
      
      // Validate delegated power if specified
      let delegatedPass = true;
      if (expected.delegated !== null) {
        const delegatedError = Math.abs(actual.delegated - expected.delegated) / Math.max(expected.delegated, 1) * 100;
        delegatedPass = delegatedError <= 10.0; // 10% tolerance for delegation detection
        
        console.log(`Delegated: Expected ${expected.delegated.toLocaleString()}, Got ${actual.delegated.toLocaleString()}`);
        console.log(`           Error: ${delegatedError.toFixed(2)}% ${delegatedPass ? '✅' : '❌'}`);
      } else {
        console.log(`Delegated: Not specified (got ${actual.delegated.toLocaleString()})`);
      }
      
      if (nativePass && delegatedPass) {
        console.log(`✅ PASS: ${wallet.substring(0,8)}...`);
        validationsPassed++;
      } else {
        console.log(`❌ FAIL: ${wallet.substring(0,8)}...`);
        validationsFailed++;
      }
    }
    
    console.log(`\n📊 VALIDATION SUMMARY:`);
    console.log(`✅ Passed: ${validationsPassed}`);
    console.log(`❌ Failed: ${validationsFailed}`);
    console.log(`📈 Success Rate: ${(validationsPassed / (validationsPassed + validationsFailed) * 100).toFixed(1)}%`);
    
    if (validationsFailed > 0) {
      console.log(`\n🔧 ISSUES TO ADDRESS:`);
      console.log(`- Native power calculations may need multiplier adjustments`);
      console.log(`- Delegation detection may be missing some relationships`);
      console.log(`- Lockup expiration logic may need validation`);
    }
    
  } catch (error) {
    console.error('❌ Error reading scan results:', error.message);
  }
}

await validateTestCases();