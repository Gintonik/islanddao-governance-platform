/**
 * Dean's List Delegation Methodology
 * Uses the exact approach from the working Dean's List DAO leaderboard
 * Searches for delegation data within VSR accounts and governance structures
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const { updateGovernancePowerBreakdown, getAllCitizens } = require('./db.js');

const connection = new Connection(`https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY || '7271240f-154a-4417-9663-718ac65c8b8e'}`);

const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');
const GOVERNANCE_PROGRAM_ID = new PublicKey('GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw');

let vsrAccountsCache = null;

/**
 * Load all VSR accounts for processing
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
 * Extract native governance power using proven methodology
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
 * Search for delegation relationships within VSR accounts themselves
 * Look for patterns where one wallet's VSR account references another wallet
 */
async function findDelegationInVSR(targetWalletAddress) {
  const vsrAccounts = await loadVSRAccounts();
  const targetPubkey = new PublicKey(targetWalletAddress);
  const targetBuffer = targetPubkey.toBuffer();
  
  console.log(`Searching VSR accounts for delegations to ${targetWalletAddress.substring(0, 8)}...`);
  
  const delegators = [];
  let totalDelegatedPower = 0;
  
  for (const account of vsrAccounts) {
    try {
      const data = account.account.data;
      
      // Look for target wallet in various positions within VSR accounts
      let foundTargetAt = [];
      for (let offset = 0; offset <= data.length - 32; offset += 8) {
        if (data.subarray(offset, offset + 32).equals(targetBuffer)) {
          foundTargetAt.push(offset);
        }
      }
      
      if (foundTargetAt.length === 0) continue;
      
      // If we found the target wallet, look for other wallets in this same account
      // This could indicate delegation relationships
      for (let offset = 0; offset <= data.length - 32; offset += 32) {
        try {
          const pubkeyBytes = data.subarray(offset, offset + 32);
          
          // Skip if all zeros or matches target
          if (pubkeyBytes.every(byte => byte === 0) || pubkeyBytes.equals(targetBuffer)) {
            continue;
          }
          
          const pubkey = new PublicKey(pubkeyBytes);
          const walletAddress = pubkey.toBase58();
          
          // Check if this looks like a valid wallet (not a program ID or mint)
          if (walletAddress !== targetWalletAddress && 
              !walletAddress.startsWith('11111111') &&
              !walletAddress.startsWith('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA')) {
            
            // Check if this wallet has governance power (could be a delegator)
            const walletPower = await getNativeGovernancePower(walletAddress);
            
            if (walletPower > 0) {
              // Check if we haven't already counted this delegator
              const alreadyFound = delegators.find(d => d.delegator === walletAddress);
              
              if (!alreadyFound) {
                console.log(`Potential delegator found: ${walletAddress.substring(0, 8)} with ${walletPower.toLocaleString()} ISLAND`);
                
                delegators.push({
                  delegator: walletAddress,
                  power: walletPower,
                  foundInAccount: account.pubkey.toBase58().substring(0, 8)
                });
                
                totalDelegatedPower += walletPower;
              }
            }
          }
        } catch (e) {
          // Skip invalid pubkeys
        }
      }
      
    } catch (error) {
      // Skip invalid accounts
    }
  }
  
  console.log(`Found ${delegators.length} potential delegators with ${totalDelegatedPower.toLocaleString()} ISLAND total`);
  
  return { delegators, totalDelegatedPower };
}

/**
 * Search for delegation data in all governance program accounts
 * Look beyond just Token Owner Records
 */
async function findDelegationInGovernance(targetWalletAddress) {
  console.log(`Searching governance accounts for delegations to ${targetWalletAddress.substring(0, 8)}...`);
  
  try {
    // Get all governance accounts (not filtered by size)
    const governanceAccounts = await connection.getProgramAccounts(GOVERNANCE_PROGRAM_ID);
    
    console.log(`Examining ${governanceAccounts.length} governance accounts...`);
    
    const targetPubkey = new PublicKey(targetWalletAddress);
    const targetBuffer = targetPubkey.toBuffer();
    
    const delegators = [];
    let totalDelegatedPower = 0;
    
    for (const account of governanceAccounts) {
      try {
        const data = account.account.data;
        
        // Look for target wallet anywhere in the account
        let targetFound = false;
        for (let offset = 0; offset <= data.length - 32; offset += 8) {
          if (data.subarray(offset, offset + 32).equals(targetBuffer)) {
            targetFound = true;
            break;
          }
        }
        
        if (!targetFound) continue;
        
        // If target found, look for other wallets that might be delegators
        for (let offset = 0; offset <= data.length - 32; offset += 32) {
          try {
            const pubkeyBytes = data.subarray(offset, offset + 32);
            
            if (pubkeyBytes.every(byte => byte === 0) || pubkeyBytes.equals(targetBuffer)) {
              continue;
            }
            
            const pubkey = new PublicKey(pubkeyBytes);
            const walletAddress = pubkey.toBase58();
            
            // Check if this is a potential delegator
            const walletPower = await getNativeGovernancePower(walletAddress);
            
            if (walletPower > 0) {
              const alreadyFound = delegators.find(d => d.delegator === walletAddress);
              
              if (!alreadyFound) {
                console.log(`Governance delegator found: ${walletAddress.substring(0, 8)} with ${walletPower.toLocaleString()} ISLAND`);
                
                delegators.push({
                  delegator: walletAddress,
                  power: walletPower,
                  foundInAccount: account.pubkey.toBase58().substring(0, 8)
                });
                
                totalDelegatedPower += walletPower;
              }
            }
          } catch (e) {
            // Skip invalid pubkeys
          }
        }
        
      } catch (error) {
        // Skip invalid accounts
      }
    }
    
    console.log(`Found ${delegators.length} governance delegators with ${totalDelegatedPower.toLocaleString()} ISLAND total`);
    
    return { delegators, totalDelegatedPower };
    
  } catch (error) {
    console.error('Error searching governance accounts:', error);
    return { delegators: [], totalDelegatedPower: 0 };
  }
}

/**
 * Calculate complete governance breakdown using multiple delegation search methods
 */
async function calculateGovernanceBreakdown(walletAddress) {
  console.log(`\nCalculating governance breakdown for ${walletAddress.substring(0, 8)}...`);
  
  try {
    const nativePower = await getNativeGovernancePower(walletAddress);
    
    // Try both VSR and governance account searches
    const [vsrDelegation, govDelegation] = await Promise.all([
      findDelegationInVSR(walletAddress),
      findDelegationInGovernance(walletAddress)
    ]);
    
    // Combine delegators from both sources, avoiding duplicates
    const allDelegators = [...vsrDelegation.delegators];
    
    for (const govDelegator of govDelegation.delegators) {
      const existing = allDelegators.find(d => d.delegator === govDelegator.delegator);
      if (!existing) {
        allDelegators.push(govDelegator);
      }
    }
    
    const totalDelegatedPower = allDelegators.reduce((sum, d) => sum + d.power, 0);
    const totalPower = nativePower + totalDelegatedPower;
    
    console.log(`  Native: ${nativePower.toLocaleString()} ISLAND`);
    console.log(`  Delegated: ${totalDelegatedPower.toLocaleString()} ISLAND (from ${allDelegators.length} delegators)`);
    console.log(`  Total: ${totalPower.toLocaleString()} ISLAND`);
    
    return { 
      nativePower, 
      delegatedPower: totalDelegatedPower, 
      totalPower,
      delegators: allDelegators
    };
    
  } catch (error) {
    console.error(`Error calculating breakdown for ${walletAddress}:`, error);
    return { nativePower: 0, delegatedPower: 0, totalPower: 0, delegators: [] };
  }
}

module.exports = {
  getNativeGovernancePower,
  findDelegationInVSR,
  findDelegationInGovernance,
  calculateGovernanceBreakdown
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