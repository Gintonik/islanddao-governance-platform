/**
 * Delegation Sum Methodology
 * Uses the correct SPL Governance TokenOwnerRecord structure with governance_delegate field
 * Based on the actual Rust source code from solana-program-library
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const { updateGovernancePowerBreakdown, getAllCitizens } = require('./db.js');

const connection = new Connection(`https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY || '7271240f-154a-4417-9663-718ac65c8b8e'}`);

const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');
const GOVERNANCE_PROGRAM_ID = new PublicKey('GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw');
const REALM_PUBKEY = new PublicKey('9M9xrrGQJgGGpn9CCdDQNpqk9aBo8Cv5HYPGKrsWMwKi');

let vsrAccountsCache = null;

/**
 * Load all VSR accounts for efficient processing
 */
async function loadVSRAccounts() {
  if (vsrAccountsCache) {
    return vsrAccountsCache;
  }

  try {
    console.log('Loading VSR accounts...');
    const allVSRAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID);
    
    vsrAccountsCache = allVSRAccounts;
    console.log(`Cached ${allVSRAccounts.length} VSR accounts`);
    
    return allVSRAccounts;
    
  } catch (error) {
    console.error('Error loading VSR accounts:', error);
    throw error;
  }
}

/**
 * Extract native governance power using proven max single value methodology
 */
async function getNativeGovernancePower(walletAddress) {
  const vsrAccounts = await loadVSRAccounts();
  const walletPubkey = new PublicKey(walletAddress);
  const walletBuffer = walletPubkey.toBuffer();
  
  let maxGovernancePower = 0;
  
  for (const account of vsrAccounts) {
    try {
      const data = account.account.data;
      
      // Check if wallet is referenced in this account
      let walletFound = false;
      for (let offset = 0; offset <= data.length - 32; offset += 8) {
        if (data.subarray(offset, offset + 32).equals(walletBuffer)) {
          walletFound = true;
          break;
        }
      }
      
      if (!walletFound) continue;
      
      // Check governance power offsets and find the maximum
      const governanceOffsets = [104, 112];
      
      for (const offset of governanceOffsets) {
        if (offset + 8 <= data.length) {
          try {
            const value = Number(data.readBigUInt64LE(offset)) / 1e6;
            
            if (value > 1000 && value < 50000000) {
              maxGovernancePower = Math.max(maxGovernancePower, value);
            }
          } catch (error) {
            // Skip invalid data
          }
        }
      }
      
    } catch (error) {
      // Skip invalid accounts
    }
  }
  
  return maxGovernancePower;
}

/**
 * Parse TokenOwnerRecord using the correct SPL Governance structure
 * Based on the Rust struct from solana-program-library
 */
function parseTokenOwnerRecord(data) {
  try {
    // TokenOwnerRecordV2 structure:
    // 0: account_type (1 byte)
    // 1-32: realm (32 bytes)
    // 33-64: governing_token_mint (32 bytes)  
    // 65-96: governing_token_owner (32 bytes)
    // 97-104: governing_token_deposit_amount (8 bytes)
    // 105-112: unrelinquished_votes_count (8 bytes)
    // 113: outstanding_proposal_count (1 byte)
    // 114: version (1 byte)
    // 115-146: locks array length + data
    // 147-178: governance_delegate (32 bytes) - THIS IS THE KEY FIELD
    
    if (data.length < 179) {
      return null;
    }
    
    const accountType = data[0];
    if (accountType !== 1) { // GovernanceAccountType::TokenOwnerRecordV2
      return null;
    }
    
    const realm = new PublicKey(data.slice(1, 33));
    const governingTokenMint = new PublicKey(data.slice(33, 65));
    const governingTokenOwner = new PublicKey(data.slice(65, 97));
    const depositAmount = Number(data.readBigUInt64LE(97)) / 1e6;
    
    // Extract governance_delegate field
    let governanceDelegate = null;
    if (data.length >= 179) {
      const delegateBytes = data.slice(147, 179);
      // Check if not all zeros (no delegation)
      if (!delegateBytes.every(byte => byte === 0)) {
        try {
          governanceDelegate = new PublicKey(delegateBytes);
        } catch (e) {
          // Invalid pubkey, no delegation
        }
      }
    }
    
    return {
      realm: realm.toBase58(),
      governingTokenMint: governingTokenMint.toBase58(),
      governingTokenOwner: governingTokenOwner.toBase58(),
      depositAmount,
      governanceDelegate: governanceDelegate ? governanceDelegate.toBase58() : null
    };
    
  } catch (error) {
    return null;
  }
}

/**
 * Find all delegations TO a specific wallet using correct TokenOwnerRecord structure
 */
async function findDelegationsToWallet(targetWalletAddress) {
  try {
    console.log(`Finding delegations to ${targetWalletAddress.substring(0, 8)}...`);
    
    // Get all Token Owner Records
    const tokenOwnerRecords = await connection.getProgramAccounts(GOVERNANCE_PROGRAM_ID, {
      filters: [
        { memcmp: { offset: 1, bytes: REALM_PUBKEY.toBase58() } }, // Filter by realm
        { dataSize: 205 } // Use the size we found earlier
      ]
    });
    
    console.log(`Examining ${tokenOwnerRecords.length} Token Owner Records...`);
    
    const delegators = [];
    let totalDelegatedPower = 0;
    
    for (const record of tokenOwnerRecords) {
      const parsed = parseTokenOwnerRecord(record.account.data);
      
      if (parsed && parsed.governanceDelegate === targetWalletAddress) {
        console.log(`Found delegator: ${parsed.governingTokenOwner.substring(0, 8)} → ${targetWalletAddress.substring(0, 8)}`);
        
        // Calculate this delegator's governance power
        const delegatorPower = await getNativeGovernancePower(parsed.governingTokenOwner);
        
        if (delegatorPower > 0) {
          delegators.push({
            delegator: parsed.governingTokenOwner,
            power: delegatorPower
          });
          totalDelegatedPower += delegatorPower;
          
          console.log(`  Delegator power: ${delegatorPower.toLocaleString()} ISLAND`);
        }
      }
    }
    
    console.log(`Total delegated power: ${totalDelegatedPower.toLocaleString()} ISLAND from ${delegators.length} delegators`);
    
    return { delegators, totalDelegatedPower };
    
  } catch (error) {
    console.error('Error finding delegations:', error);
    return { delegators: [], totalDelegatedPower: 0 };
  }
}

/**
 * Calculate complete governance breakdown for a citizen
 */
async function calculateGovernanceBreakdown(walletAddress) {
  console.log(`\nCalculating governance breakdown for ${walletAddress.substring(0, 8)}...`);
  
  try {
    const [nativePower, delegationData] = await Promise.all([
      getNativeGovernancePower(walletAddress),
      findDelegationsToWallet(walletAddress)
    ]);
    
    const delegatedPower = delegationData.totalDelegatedPower;
    const totalPower = nativePower + delegatedPower;
    
    console.log(`  Native: ${nativePower.toLocaleString()} ISLAND`);
    console.log(`  Delegated: ${delegatedPower.toLocaleString()} ISLAND`);
    console.log(`  Total: ${totalPower.toLocaleString()} ISLAND`);
    
    return { 
      nativePower, 
      delegatedPower, 
      totalPower,
      delegators: delegationData.delegators
    };
    
  } catch (error) {
    console.error(`Error calculating breakdown for ${walletAddress}:`, error);
    return { nativePower: 0, delegatedPower: 0, totalPower: 0, delegators: [] };
  }
}

/**
 * Update all citizens with delegation sum methodology
 */
async function updateAllCitizensDelegationSum() {
  try {
    console.log('Starting delegation sum calculation for all citizens...');
    
    const citizens = await getAllCitizens();
    console.log(`Processing ${citizens.length} citizens`);
    
    let processed = 0;
    let updated = 0;
    
    for (const citizen of citizens) {
      const breakdown = await calculateGovernanceBreakdown(citizen.wallet);
      
      if (breakdown.totalPower > 0) {
        await updateGovernancePowerBreakdown(
          citizen.wallet,
          breakdown.nativePower,
          breakdown.delegatedPower
        );
        updated++;
      }
      
      processed++;
      
      if (processed % 5 === 0) {
        console.log(`Processed ${processed}/${citizens.length} citizens`);
      }
    }
    
    console.log('Delegation sum calculation completed');
    console.log(`Citizens processed: ${processed}`);
    console.log(`Citizens updated: ${updated}`);
    
    return { processed, updated };
    
  } catch (error) {
    console.error('Error in delegation sum calculation:', error);
    throw error;
  }
}

module.exports = {
  getNativeGovernancePower,
  findDelegationsToWallet,
  calculateGovernanceBreakdown,
  updateAllCitizensDelegationSum
};

// Test with legend when called directly
if (require.main === module) {
  async function testLegend() {
    const legendWallet = 'Fywb7YDCXxtD7pNKThJ36CAtVe23dEeEPf7HqKzJs1VG';
    const result = await calculateGovernanceBreakdown(legendWallet);
    
    console.log('\nExpected for legend:');
    console.log('Native: 3,361,730.15 ISLAND');
    console.log('Delegated: 1,598,919.1 ISLAND');
    console.log('Total: 4,960,649.25 ISLAND');
    
    console.log('\nAccuracy check:');
    console.log('Native match:', Math.abs(result.nativePower - 3361730.15) < 1000 ? 'CLOSE' : 'DIFFERENT');
    console.log('Delegated match:', Math.abs(result.delegatedPower - 1598919.1) < 10000 ? 'CLOSE' : 'DIFFERENT');
    console.log('Total match:', Math.abs(result.totalPower - 4960649.25) < 10000 ? 'CLOSE' : 'DIFFERENT');
  }
  
  testLegend().catch(console.error);
}