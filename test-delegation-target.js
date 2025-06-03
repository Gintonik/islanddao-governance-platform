/**
 * Test Delegation Target
 * Test the canonical VSR scanner with a wallet that actually receives delegations
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function testDelegationTarget() {
  // Test with DezXAZ8zqzHuQM5tLGPXdEDpqet8TyrFt9CtaKKWJ43 (receives 7,910 delegations)
  const targetWallet = 'DezXAZ8zqzHuQM5tLGPXdEDpqet8TyrFt9CtaKKWJ43';
  
  console.log('🎯 TESTING CANONICAL VSR SCANNER WITH ACTUAL DELEGATION TARGET');
  console.log(`Target: ${targetWallet} (should receive ~7,910 delegations)`);
  
  try {
    const { stdout, stderr } = await execAsync(`node canonical-vwr-scan.js --wallet ${targetWallet} --verbose`);
    
    if (stderr) {
      console.error('❌ Error:', stderr);
    }
    
    console.log(stdout);
    
    // Extract delegation information from output
    const lines = stdout.split('\n');
    const delegatedLine = lines.find(line => line.includes('🟡 Delegated from Others:'));
    
    if (delegatedLine) {
      const delegatedAmount = delegatedLine.match(/🟡 Delegated from Others: ([\d,]+\.?\d*)/)?.[1];
      console.log(`\n📊 DELEGATION TEST RESULT:`);
      console.log(`   Target Wallet: ${targetWallet}`);
      console.log(`   Delegated Power Detected: ${delegatedAmount} ISLAND`);
      
      if (delegatedAmount && parseFloat(delegatedAmount.replace(/,/g, '')) > 0) {
        console.log(`✅ SUCCESS: Delegation detection working!`);
      } else {
        console.log(`❌ ISSUE: No delegated power detected despite expected delegations`);
      }
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testDelegationTarget();