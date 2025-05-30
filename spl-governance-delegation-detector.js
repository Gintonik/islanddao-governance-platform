/**
 * SPL Governance Delegation Detector
 * Based on TokenOwnerRecord structure from SPL Governance IDL
 * Properly detects delegation relationships for multiple delegators to one account
 */

const { Connection, PublicKey } = require('@solana/web3.js');

const connection = new Connection(`https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY || '7271240f-154a-4417-9663-718ac65c8b8e'}`);

const GOVERNANCE_PROGRAM_ID = new PublicKey('GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw');
const REALM_PUBKEY = new PublicKey('9M9xrrGQJgGGpn9CCdDQNpqk9aBo8Cv5HYPGKrsWMwKi');

/**
 * Parse TokenOwnerRecord based on SPL Governance structure
 * Structure: accountType(1) + realm(32) + governingTokenMint(32) + governingTokenOwner(32) + ... + delegate(32)
 */
function parseTokenOwnerRecord(data) {
  try {
    if (data.length < 97) return null;
    
    const accountType = data[0];
    const realm = new PublicKey(data.slice(1, 33)).toBase58();
    const governingTokenMint = new PublicKey(data.slice(33, 65)).toBase58();
    const governingTokenOwner = new PublicKey(data.slice(65, 97)).toBase58();
    
    let governanceDelegate = null;
    
    // Check for delegate at various possible positions
    // TokenOwnerRecordV2 has delegate at different offset than V1
    const delegatePositions = [97, 105, 113, 121, 129];
    
    for (const pos of delegatePositions) {
      if (pos + 32 <= data.length) {
        try {
          const delegateBytes = data.slice(pos, pos + 32);
          if (!delegateBytes.every(byte => byte === 0)) {
            const delegate = new PublicKey(delegateBytes).toBase58();
            if (delegate !== governingTokenOwner) {
              governanceDelegate = delegate;
              break;
            }
          }
        } catch (e) {
          // Continue checking other positions
        }
      }
    }
    
    return {
      accountType,
      realm,
      governingTokenMint,
      governingTokenOwner,
      governanceDelegate,
      hasDelegation: !!governanceDelegate
    };
    
  } catch (error) {
    return null;
  }
}

/**
 * Find all Token Owner Records that delegate to a specific wallet
 */
async function findDelegatorsToWallet(targetWallet) {
  console.log(`Searching for delegators to ${targetWallet.substring(0, 8)}...`);
  
  try {
    // Get all governance accounts without strict filters to examine structure
    const allGovernanceAccounts = await connection.getProgramAccounts(GOVERNANCE_PROGRAM_ID);
    console.log(`Examining ${allGovernanceAccounts.length} governance accounts...`);
    
    const delegators = [];
    let tokenOwnerRecords = 0;
    
    for (const account of allGovernanceAccounts) {
      const data = account.account.data;
      
      // Parse as TokenOwnerRecord
      const record = parseTokenOwnerRecord(data);
      
      if (record && record.realm === REALM_PUBKEY.toBase58()) {
        tokenOwnerRecords++;
        
        // Check if this record delegates to our target wallet
        if (record.governanceDelegate === targetWallet) {
          delegators.push({
            delegator: record.governingTokenOwner,
            delegate: targetWallet,
            account: account.pubkey.toBase58(),
            mint: record.governingTokenMint
          });
          
          console.log(`Found delegator: ${record.governingTokenOwner.substring(0, 8)} → ${targetWallet.substring(0, 8)}`);
        }
      }
    }
    
    console.log(`Found ${tokenOwnerRecords} Token Owner Records in realm`);
    console.log(`Found ${delegators.length} delegations to ${targetWallet.substring(0, 8)}`);
    
    return delegators;
    
  } catch (error) {
    console.error('Error finding delegators:', error);
    return [];
  }
}

/**
 * Test delegation detection for legend wallet
 */
async function testLegendDelegation() {
  const legendWallet = 'Fywb7YDCXxtD7pNKThJ36CAtVe23dEeEPf7HqKzJs1VG';
  
  console.log('Testing delegation detection for legend...');
  console.log('Expected: 4 delegators (253Do, HMsn, 3zxtS, Dt2Yp)');
  
  const delegators = await findDelegatorsToWallet(legendWallet);
  
  console.log('\\nResults:');
  delegators.forEach((del, i) => {
    const prefix = del.delegator.substring(0, 5);
    console.log(`${i + 1}. ${prefix}...${del.delegator.substring(-5)} → legend`);
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
  parseTokenOwnerRecord,
  findDelegatorsToWallet,
  testLegendDelegation
};

// Run test when called directly
if (require.main === module) {
  testLegendDelegation().catch(console.error);
}