/**
 * Efficient VSR Governance Power Extractor
 * Optimized to reduce RPC requests and avoid timeouts
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const { BN } = require('bn.js');

const connection = new Connection(`https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`);

// Cache VSR accounts to avoid repeated fetching
let vsrAccountsCache = null;
let cacheTimestamp = null;
const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes

/**
 * Get all VSR accounts with caching to reduce RPC calls
 */
async function getCachedVSRAccounts() {
  const now = Date.now();
  
  // Use cache if it exists and is fresh
  if (vsrAccountsCache && cacheTimestamp && (now - cacheTimestamp) < CACHE_DURATION) {
    console.log('Using cached VSR accounts...');
    return vsrAccountsCache;
  }
  
  console.log('Fetching VSR accounts from blockchain...');
  const vsrProgram = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');
  
  try {
    const allVSRAccounts = await connection.getProgramAccounts(vsrProgram);
    
    vsrAccountsCache = allVSRAccounts;
    cacheTimestamp = now;
    
    console.log(`Cached ${allVSRAccounts.length} VSR accounts`);
    return allVSRAccounts;
    
  } catch (error) {
    console.error('Error fetching VSR accounts:', error.message);
    
    // Return cached data if available, even if stale
    if (vsrAccountsCache) {
      console.log('Using stale cache due to RPC error');
      return vsrAccountsCache;
    }
    
    throw error;
  }
}

/**
 * Extract governance power for a single wallet using cached VSR data
 */
async function extractGovernancePowerEfficient(walletAddress) {
  try {
    const walletPubkey = new PublicKey(walletAddress);
    const walletBuffer = walletPubkey.toBuffer();
    
    // Get cached VSR accounts
    const allVSRAccounts = await getCachedVSRAccounts();
    
    let maxVotingPower = new BN(0);
    let accountsFound = 0;
    
    // Search through cached accounts
    for (const account of allVSRAccounts) {
      const data = account.account.data;
      
      // Check if wallet is referenced in this account
      let walletFound = false;
      for (let offset = 0; offset <= data.length - 32; offset += 8) {
        if (data.subarray(offset, offset + 32).equals(walletBuffer)) {
          walletFound = true;
          break;
        }
      }
      
      if (walletFound) {
        accountsFound++;
        
        // Extract voting power from known offsets
        const potentialOffsets = [104, 112, 96, 120, 128];
        
        for (const offset of potentialOffsets) {
          if (offset + 8 <= data.length) {
            try {
              const value = data.readBigUInt64LE(offset);
              const bnValue = new BN(value.toString());
              
              // Look for values in the governance power range
              const tokenValue = bnValue.toNumber() / Math.pow(10, 6);
              if (tokenValue > 1000 && tokenValue < 50000000) {
                if (bnValue.gt(maxVotingPower)) {
                  maxVotingPower = bnValue;
                }
              }
            } catch (error) {
              continue;
            }
          }
        }
      }
    }
    
    // Convert to token amount
    const governancePower = maxVotingPower.toNumber() / Math.pow(10, 6);
    
    return {
      walletAddress,
      votingPower: governancePower,
      accountsFound: accountsFound,
      source: 'Efficient VSR Query'
    };
    
  } catch (error) {
    console.error(`Error extracting governance power for ${walletAddress}:`, error.message);
    return {
      walletAddress,
      votingPower: 0,
      error: error.message
    };
  }
}

/**
 * Update all citizens efficiently with minimal RPC calls
 */
async function updateAllCitizensEfficient() {
  try {
    const { getAllCitizens } = require('./db.js');
    const citizens = await getAllCitizens();
    
    console.log(`Starting efficient governance power sync for ${citizens.length} citizens...`);
    
    // Pre-fetch and cache all VSR accounts once
    await getCachedVSRAccounts();
    
    const results = [];
    let successCount = 0;
    let errorCount = 0;
    
    // Process citizens in smaller batches to avoid overwhelming the system
    const batchSize = 5;
    
    for (let i = 0; i < citizens.length; i += batchSize) {
      const batch = citizens.slice(i, i + batchSize);
      
      console.log(`Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(citizens.length/batchSize)}...`);
      
      // Process batch in parallel but with limited concurrency
      const batchPromises = batch.map(async (citizen) => {
        const walletAddress = citizen.wallet;
        console.log(`Processing ${walletAddress.substring(0, 8)}...`);
        
        const result = await extractGovernancePowerEfficient(walletAddress);
        
        if (result.votingPower > 0) {
          const { updateGovernancePower } = require('./db.js');
          await updateGovernancePower(walletAddress, result.votingPower);
          
          console.log(`Updated ${walletAddress.substring(0, 8)}: ${result.votingPower.toLocaleString()} ISLAND`);
          successCount++;
        } else {
          if (result.error) {
            console.log(`Error for ${walletAddress.substring(0, 8)}: ${result.error}`);
            errorCount++;
          } else {
            console.log(`No governance power for ${walletAddress.substring(0, 8)}`);
          }
        }
        
        return result;
      });
      
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
      
      // Small delay between batches to be respectful of RPC
      if (i + batchSize < citizens.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    console.log('\n=== Efficient Governance Power Sync Complete ===');
    console.log(`Successfully updated: ${successCount} citizens`);
    console.log(`Errors encountered: ${errorCount} citizens`);
    console.log(`Total processed: ${results.length} citizens`);
    
    return results;
    
  } catch (error) {
    console.error('Error in efficient governance sync:', error.message);
    throw error;
  }
}

/**
 * Test the efficient extraction method
 */
async function testEfficientExtraction() {
  console.log('Testing efficient VSR extraction method...');
  
  const testWallets = [
    { address: 'GJdRQcsyz49FMM4LvPqpaM2QA3yWFr8WamJ95hkwCBAh', expected: 144708.20, name: 'GJdRQcsy' },
    { address: '3PKhzE9wuEkGPHHu2sNCvG86xNtDJduAcyBPXpE6cSNt', expected: 10353648, name: 'DeanMachine' }
  ];
  
  for (const testWallet of testWallets) {
    const result = await extractGovernancePowerEfficient(testWallet.address);
    
    console.log(`\n${testWallet.name}:`);
    console.log(`  Governance Power: ${result.votingPower.toLocaleString()} ISLAND`);
    console.log(`  Expected: ${testWallet.expected.toLocaleString()} ISLAND`);
    console.log(`  Accounts Found: ${result.accountsFound}`);
    
    const accuracy = ((1 - Math.abs(result.votingPower - testWallet.expected) / testWallet.expected) * 100).toFixed(2);
    console.log(`  Accuracy: ${accuracy}%`);
  }
}

module.exports = {
  extractGovernancePowerEfficient,
  updateAllCitizensEfficient,
  testEfficientExtraction,
  getCachedVSRAccounts
};

// Run test if called directly
if (require.main === module) {
  testEfficientExtraction().catch(console.error);
}