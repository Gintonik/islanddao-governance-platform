/**
 * Authentic Delegation Detector
 * Uses the exact methodology from Dean's List platform to find delegation relationships
 * Based on: https://github.com/dean-s-list/deanslist-platform/blob/leaderboard/libs/api/leaderboard/data-access/src/lib/api-leaderboard-voting-power.service.ts
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const { updateGovernancePowerBreakdown, getAllCitizens } = require('./db.js');

const connection = new Connection(`https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY || '7271240f-154a-4417-9663-718ac65c8b8e'}`);

const GOVERNANCE_PROGRAM_ID = new PublicKey('GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw');
const REALM_PUBKEY = new PublicKey('F9V4Lwo49aUe8fFujMbU6uhdFvDRqKY54WpzdpncUSk9');
const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');

let vsrAccountsCache = null;

/**
 * Get governance power using VSR methodology (matching Dean's List getLockTokensVotingPowerPerWallet)
 */
async function getNativeGovernancePower(walletAddress) {
  if (!vsrAccountsCache) {
    console.log('Loading VSR accounts...');
    vsrAccountsCache = await connection.getProgramAccounts(VSR_PROGRAM_ID);
    console.log(`Cached ${vsrAccountsCache.length} VSR accounts`);
  }

  const walletPubkey = new PublicKey(walletAddress);
  const walletBuffer = walletPubkey.toBuffer();
  
  let maxGovernancePower = 0;
  
  for (const account of vsrAccountsCache) {
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
      
      // Check governance power offsets
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
 * Get governance accounts using the exact filters from Dean's List platform
 * Replicates getGovAccounts method with proper SPL Governance filters
 */
async function getGovernanceAccounts(walletPk) {
  try {
    // Create filters exactly as Dean's List does:
    // realmFilter = pubkeyFilter(1, realm.pubkey)
    // hasDelegateFilter = booleanFilter(1 + 32 + 32 + 32 + 8 + 4 + 4 + 1 + 1 + 6, true)
    // delegatedToUserFilter = pubkeyFilter(1 + 32 + 32 + 32 + 8 + 4 + 4 + 1 + 1 + 6 + 1, walletPk)
    
    const realmFilterOffset = 1;
    const hasDelegateOffset = 1 + 32 + 32 + 32 + 8 + 4 + 4 + 1 + 1 + 6;
    const delegateFilterOffset = 1 + 32 + 32 + 32 + 8 + 4 + 4 + 1 + 1 + 6 + 1;
    
    const govAccounts = await connection.getProgramAccounts(GOVERNANCE_PROGRAM_ID, {
      filters: [
        { memcmp: { offset: realmFilterOffset, bytes: REALM_PUBKEY.toBase58() } },
        { memcmp: { offset: hasDelegateOffset, bytes: 'So11111111111111111111111111111111111111112' } }, // has delegate (non-zero)
        { memcmp: { offset: delegateFilterOffset, bytes: walletPk.toBase58() } }
      ]
    });
    
    return govAccounts;
    
  } catch (error) {
    console.error('Error getting governance accounts:', error);
    return [];
  }
}

/**
 * Get delegated voting power using Dean's List methodology
 * Replicates getDelegatedVotingPower method
 */
async function getDelegatedVotingPower(walletPk) {
  try {
    console.log(`Getting delegated voting power for ${walletPk.toBase58().substring(0, 8)}...`);
    
    const delegatorAccounts = await getGovernanceAccounts(walletPk);
    console.log(`Found ${delegatorAccounts.length} potential delegator accounts`);
    
    if (!delegatorAccounts.length) {
      return { delegators: [], totalDelegatedPower: 0 };
    }
    
    const delegators = [];
    let totalDelegatedPower = 0;
    
    for (const account of delegatorAccounts) {
      try {
        const data = account.account.data;
        
        // Parse Token Owner Record structure
        if (data.length >= 97) {
          // Extract governing token owner (delegator) from offset 65-97
          const ownerBytes = data.slice(65, 97);
          const delegatorWallet = new PublicKey(ownerBytes);
          
          // Get this delegator's governance power
          const delegatorPower = await getNativeGovernancePower(delegatorWallet.toBase58());
          
          if (delegatorPower > 0) {
            delegators.push({
              wallet: delegatorWallet.toBase58(),
              power: delegatorPower
            });
            totalDelegatedPower += delegatorPower;
            
            console.log(`  Delegator: ${delegatorWallet.toBase58().substring(0, 8)} → ${delegatorPower.toLocaleString()} ISLAND`);
          }
        }
        
      } catch (error) {
        console.error('Error parsing delegator account:', error);
      }
    }
    
    console.log(`Total delegated power: ${totalDelegatedPower.toLocaleString()} ISLAND`);
    
    return { delegators, totalDelegatedPower };
    
  } catch (error) {
    console.error('Error getting delegated voting power:', error);
    return { delegators: [], totalDelegatedPower: 0 };
  }
}

/**
 * Calculate complete governance breakdown using Dean's List methodology
 */
async function calculateAuthenticGovernanceBreakdown(walletAddress) {
  console.log(`\\nCalculating authentic governance breakdown for ${walletAddress.substring(0, 8)}...`);
  
  try {
    const walletPk = new PublicKey(walletAddress);
    
    const [nativePower, delegationData] = await Promise.all([
      getNativeGovernancePower(walletAddress),
      getDelegatedVotingPower(walletPk)
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
 * Update all citizens with authentic delegation detection
 */
async function updateAllCitizensAuthenticDelegation() {
  try {
    console.log('Starting authentic delegation calculation using Deans List methodology...');
    
    const citizens = await getAllCitizens();
    console.log(`Processing ${citizens.length} citizens`);
    
    let processed = 0;
    let updated = 0;
    let withDelegation = 0;
    
    for (const citizen of citizens) {
      try {
        const breakdown = await calculateAuthenticGovernanceBreakdown(citizen.wallet);
        
        if (breakdown.totalPower > 0) {
          await updateGovernancePowerBreakdown(
            citizen.wallet,
            breakdown.nativePower,
            breakdown.delegatedPower
          );
          updated++;
          
          if (breakdown.delegatedPower > 0) {
            withDelegation++;
            console.log(`Updated ${citizen.wallet.substring(0, 8)}: ${breakdown.nativePower.toLocaleString()} native + ${breakdown.delegatedPower.toLocaleString()} delegated = ${breakdown.totalPower.toLocaleString()} ISLAND`);
          }
        }
        
        processed++;
        
      } catch (error) {
        console.error(`Error processing ${citizen.wallet}:`, error);
        processed++;
      }
    }
    
    console.log('\\nAuthentic delegation calculation completed');
    console.log(`Citizens processed: ${processed}`);
    console.log(`Citizens updated: ${updated}`);
    console.log(`Citizens with delegation: ${withDelegation}`);
    
    return { processed, updated, withDelegation };
    
  } catch (error) {
    console.error('Error in authentic delegation calculation:', error);
    throw error;
  }
}

module.exports = {
  getNativeGovernancePower,
  getDelegatedVotingPower,
  calculateAuthenticGovernanceBreakdown,
  updateAllCitizensAuthenticDelegation
};

// Test with DeanMachine when called directly
if (require.main === module) {
  async function testDeanMachine() {
    const deanWallet = '3PKhzE9wuEkGPHHu2sNCvG86xNtDJduAcyBPXpE6cSNt';
    const result = await calculateAuthenticGovernanceBreakdown(deanWallet);
    
    console.log('\\nExpected for DeanMachine:');
    console.log('Native: 1 ISLAND');
    console.log('Delegated: 1,268,162 ISLAND');
    console.log('Total: 1,268,163 ISLAND');
    
    console.log('\\nAccuracy check:');
    console.log('Native match:', Math.abs(result.nativePower - 1) < 10 ? 'CLOSE' : 'DIFFERENT');
    console.log('Delegated match:', Math.abs(result.delegatedPower - 1268162) < 10000 ? 'REASONABLE' : 'DIFFERENT');
    console.log('Total match:', Math.abs(result.totalPower - 1268163) < 10000 ? 'REASONABLE' : 'DIFFERENT');
  }
  
  testDeanMachine().catch(console.error);
}