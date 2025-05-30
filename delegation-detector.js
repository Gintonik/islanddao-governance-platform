/**
 * Delegation Detector
 * Finds delegation relationships by examining governance accounts systematically
 * Looks for wallet addresses that delegate to specific targets
 */

const { Connection, PublicKey } = require('@solana/web3.js');

const connection = new Connection(`https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY || '7271240f-154a-4417-9663-718ac65c8b8e'}`);

const GOVERNANCE_PROGRAM_ID = new PublicKey('GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw');

/**
 * Search for accounts that delegate to a specific target wallet
 */
async function findDelegatorsTo(targetWallet) {
  console.log(`Searching for delegators to ${targetWallet.substring(0, 8)}...`);
  
  const targetPubkey = new PublicKey(targetWallet);
  const targetBuffer = targetPubkey.toBuffer();
  
  const delegators = [];
  
  try {
    // Get all governance accounts
    const allAccounts = await connection.getProgramAccounts(GOVERNANCE_PROGRAM_ID);
    console.log(`Examining ${allAccounts.length} governance accounts...`);
    
    for (const account of allAccounts) {
      try {
        const data = account.account.data;
        
        // Look for target wallet address in the account data
        let foundTarget = false;
        let targetOffset = -1;
        
        for (let offset = 0; offset <= data.length - 32; offset += 32) {
          if (data.subarray(offset, offset + 32).equals(targetBuffer)) {
            foundTarget = true;
            targetOffset = offset;
            break;
          }
        }
        
        if (foundTarget) {
          // Try to find the owner/delegator in this account
          // Check common owner positions relative to the target
          const ownerCandidateOffsets = [
            targetOffset - 32,  // Owner before delegate
            targetOffset + 32,  // Owner after delegate
            64,                 // Standard owner position
            0,                  // First position
            32                  // Second position
          ];
          
          for (const ownerOffset of ownerCandidateOffsets) {
            if (ownerOffset >= 0 && ownerOffset + 32 <= data.length) {
              try {
                const ownerBytes = data.slice(ownerOffset, ownerOffset + 32);
                
                // Skip if it's the same as target or all zeros
                if (!ownerBytes.equals(targetBuffer) && !ownerBytes.every(byte => byte === 0)) {
                  const ownerPubkey = new PublicKey(ownerBytes);
                  const ownerAddress = ownerPubkey.toBase58();
                  
                  // Validate this looks like a real wallet address
                  if (ownerAddress.length === 44 && ownerAddress !== targetWallet) {
                    delegators.push({
                      delegator: ownerAddress,
                      delegate: targetWallet,
                      account: account.pubkey.toBase58(),
                      accountSize: data.length,
                      targetOffset: targetOffset,
                      ownerOffset: ownerOffset
                    });
                    
                    console.log(`Found delegator: ${ownerAddress.substring(0, 8)} → ${targetWallet.substring(0, 8)}`);
                    break; // Found owner for this account
                  }
                }
              } catch (e) {
                // Invalid pubkey, continue
              }
            }
          }
        }
        
      } catch (error) {
        // Skip invalid accounts
      }
    }
    
  } catch (error) {
    console.error('Error searching for delegators:', error);
  }
  
  // Remove duplicates (same delegator might appear in multiple accounts)
  const uniqueDelegators = [];
  const seen = new Set();
  
  for (const del of delegators) {
    if (!seen.has(del.delegator)) {
      seen.add(del.delegator);
      uniqueDelegators.push(del);
    }
  }
  
  console.log(`Found ${uniqueDelegators.length} unique delegators to ${targetWallet.substring(0, 8)}`);
  
  return uniqueDelegators;
}

/**
 * Test delegation detection for legend wallet
 */
async function testLegendDelegation() {
  const legendWallet = 'Fywb7YDCXxtD7pNKThJ36CAtVe23dEeEPf7HqKzJs1VG';
  
  console.log('Testing delegation detection for legend...');
  console.log('Expected delegators: 253Do...yhkb2, HMsn...KMvWT, 3zxtS...eRsof, Dt2Yp...X9SxW');
  
  const delegators = await findDelegatorsTo(legendWallet);
  
  console.log('\\nResults:');
  delegators.forEach((del, i) => {
    console.log(`${i + 1}. ${del.delegator.substring(0, 5)}...${del.delegator.substring(-5)} → legend`);
    console.log(`   Account: ${del.account.substring(0, 8)}... (${del.accountSize} bytes)`);
  });
  
  // Check if we found the expected delegators
  const expectedPrefixes = ['253Do', 'HMsn', '3zxtS', 'Dt2Yp'];
  const foundPrefixes = delegators.map(d => d.delegator.substring(0, 5));
  
  console.log('\\nExpected vs Found:');
  expectedPrefixes.forEach(prefix => {
    const found = foundPrefixes.includes(prefix);
    console.log(`${prefix}...: ${found ? 'FOUND' : 'MISSING'}`);
  });
  
  return delegators;
}

module.exports = {
  findDelegatorsTo,
  testLegendDelegation
};

// Run test when called directly
if (require.main === module) {
  testLegendDelegation().catch(console.error);
}