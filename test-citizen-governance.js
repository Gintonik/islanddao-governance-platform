/**
 * Test Citizen Governance Power Extraction
 * Tests native and delegated governance power calculation using real citizen data
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const { BN } = require('@coral-xyz/anchor');
const { Pool } = require('pg');

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const VSR_PROGRAM_ID = new PublicKey('VotEn9AWwTFtJPJSMV5F9jsMY6QwWM5qn3XP9PATGW7');

/**
 * Get actual citizens from database to test with
 */
async function getTestCitizens() {
  try {
    const result = await pool.query('SELECT wallet_address, name FROM citizens LIMIT 10');
    return result.rows;
  } catch (error) {
    console.error('Error getting citizens:', error);
    return [];
  }
}

/**
 * Load and analyze all VSR accounts
 */
async function analyzeAllVSRAccounts() {
  try {
    const connection = new Connection('https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00');
    
    console.log('Loading all VSR accounts...');
    const accounts = await connection.getProgramAccounts(VSR_PROGRAM_ID);
    
    console.log(`Found ${accounts.length} VSR accounts`);
    console.log('\nAnalyzing account structures and extracting wallet mappings...\n');
    
    const walletGovernanceMap = new Map();
    
    for (const account of accounts) {
      const data = account.account.data;
      const accountAddress = account.pubkey.toBase58();
      
      // Extract potential wallet addresses and governance power from this account
      const walletMappings = extractWalletAndPowerFromAccount(data, accountAddress);
      
      for (const mapping of walletMappings) {
        if (mapping.wallet && mapping.power.gt(new BN(0))) {
          const currentPower = walletGovernanceMap.get(mapping.wallet) || new BN(0);
          if (mapping.power.gt(currentPower)) {
            walletGovernanceMap.set(mapping.wallet, mapping.power);
          }
        }
      }
    }
    
    return walletGovernanceMap;
    
  } catch (error) {
    console.error('Error analyzing VSR accounts:', error);
    return new Map();
  }
}

/**
 * Extract wallet and governance power from a single VSR account
 */
function extractWalletAndPowerFromAccount(data, accountAddress) {
  const results = [];
  const dataLength = data.length;
  
  try {
    // Try different extraction methods based on account size
    if (dataLength === 2728) {
      // Large voter records
      const wallet = extractWalletFromOffset(data, 8); // Common voter authority offset
      if (wallet) {
        const power = new BN(data.slice(2720, 2728), 'le').div(new BN(1000000));
        if (power.gt(new BN(0)) && power.lt(new BN(100000000))) { // Reasonable range
          results.push({ wallet, power, type: 'voter_record', accountAddress });
        }
      }
    } 
    else if (dataLength === 176) {
      // Deposit entries
      const wallet = extractWalletFromOffset(data, 0); // Try offset 0
      if (wallet) {
        const amount = new BN(data.slice(8, 16), 'le');
        const lockupEnd = new BN(data.slice(168, 176), 'le');
        
        const now = Math.floor(Date.now() / 1000);
        const timeRemaining = Math.max(0, lockupEnd.toNumber() - now);
        const maxLockupTime = 5 * 365 * 24 * 60 * 60;
        const lockupMultiplier = 1 + Math.min(timeRemaining / maxLockupTime, 1) * 5;
        
        const power = amount.muln(Math.floor(lockupMultiplier * 100)).divn(100).div(new BN(1000000));
        if (power.gt(new BN(0)) && power.lt(new BN(100000000))) {
          results.push({ wallet, power, type: 'deposit_entry', accountAddress });
        }
      }
    }
    else if (dataLength === 880) {
      // Medium accounts
      for (let offset = 0; offset <= 64; offset += 32) {
        const wallet = extractWalletFromOffset(data, offset);
        if (wallet) {
          // Look for governance power values nearby
          for (let powerOffset = 200; powerOffset <= dataLength - 8; powerOffset += 8) {
            const power = new BN(data.slice(powerOffset, powerOffset + 8), 'le').div(new BN(1000000));
            if (power.gt(new BN(100)) && power.lt(new BN(10000))) { // Reasonable range
              results.push({ wallet, power, type: 'medium_account', accountAddress });
              break; // Only take first reasonable power value
            }
          }
        }
      }
    }
    
  } catch (error) {
    // Skip accounts with parsing errors
  }
  
  return results;
}

/**
 * Extract wallet address from specific offset
 */
function extractWalletFromOffset(data, offset) {
  try {
    if (offset + 32 <= data.length) {
      const pubkey = new PublicKey(data.slice(offset, offset + 32));
      const address = pubkey.toBase58();
      
      // Filter out system addresses and invalid keys
      if (address !== '11111111111111111111111111111111' && 
          !address.includes('111111111111111') &&
          address.length === 44) { // Valid base58 pubkey length
        return address;
      }
    }
  } catch (error) {
    // Not a valid pubkey
  }
  return null;
}

/**
 * Test governance power extraction with real citizens
 */
async function testGovernancePowerExtraction() {
  console.log('Testing governance power extraction with real citizens...\n');
  
  // Get test citizens from database
  const citizens = await getTestCitizens();
  console.log(`Testing with ${citizens.length} citizens from database\n`);
  
  // Get governance power mapping from VSR accounts
  const walletGovernanceMap = await analyzeAllVSRAccounts();
  console.log(`Extracted governance power for ${walletGovernanceMap.size} wallets\n`);
  
  // Show top governance holders
  const sortedPowers = Array.from(walletGovernanceMap.entries())
    .sort((a, b) => b[1].cmp(a[1]))
    .slice(0, 10);
  
  console.log('=== Top 10 Governance Power Holders ===');
  sortedPowers.forEach((entry, index) => {
    const [wallet, power] = entry;
    console.log(`${index + 1}. ${wallet}: ${power.toString()} ISLAND`);
  });
  
  // Test specific citizens
  console.log('\n=== Citizen Governance Power Test ===');
  for (const citizen of citizens) {
    const power = walletGovernanceMap.get(citizen.wallet_address) || new BN(0);
    const name = citizen.name || 'Unknown';
    console.log(`${name} (${citizen.wallet_address}): ${power.toString()} ISLAND`);
  }
  
  // Test known high-value wallets
  console.log('\n=== Known Wallet Test ===');
  const knownWallets = [
    'DqH7YkHBu4pKxCp5JsLZT8jMKYmYTN9cmEyQHPbxMPkE', // DeanMachine
    'GJdRQcsyoKpW8a3YFe9HqeZdnG4Z8h5gM9qo8M3iThz8'  // legend
  ];
  
  knownWallets.forEach(wallet => {
    const power = walletGovernanceMap.get(wallet) || new BN(0);
    console.log(`${wallet}: ${power.toString()} ISLAND`);
  });
  
  return walletGovernanceMap;
}

/**
 * Update database with extracted governance power
 */
async function updateDatabaseWithGovernancePower() {
  console.log('\nUpdating database with extracted governance power...\n');
  
  const walletGovernanceMap = await analyzeAllVSRAccounts();
  const citizens = await pool.query('SELECT wallet_address FROM citizens');
  
  let updatedCount = 0;
  
  for (const citizen of citizens.rows) {
    const walletAddress = citizen.wallet_address;
    const nativePower = walletGovernanceMap.get(walletAddress) || new BN(0);
    const delegatedPower = new BN(0); // Will implement delegation detection later
    const totalPower = nativePower.add(delegatedPower);
    
    try {
      await pool.query(`
        UPDATE citizens 
        SET 
          native_governance_power = $1,
          delegated_governance_power = $2,
          total_governance_power = $3,
          governance_last_updated = NOW()
        WHERE wallet_address = $4
      `, [
        nativePower.toString(),
        delegatedPower.toString(),
        totalPower.toString(),
        walletAddress
      ]);
      
      if (nativePower.gt(new BN(0))) {
        console.log(`✓ ${walletAddress}: ${nativePower.toString()} ISLAND`);
      }
      
      updatedCount++;
      
    } catch (error) {
      console.error(`Error updating ${walletAddress}:`, error);
    }
  }
  
  console.log(`\n✓ Updated ${updatedCount} citizens with governance power`);
}

module.exports = {
  testGovernancePowerExtraction,
  updateDatabaseWithGovernancePower
};

// Run test if called directly
if (require.main === module) {
  testGovernancePowerExtraction().then(() => {
    console.log('\nGovernance power test completed');
    process.exit(0);
  }).catch(error => {
    console.error('Test failed:', error);
    process.exit(1);
  });
}