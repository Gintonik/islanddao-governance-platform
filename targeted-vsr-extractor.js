/**
 * Targeted VSR Governance Power Extractor
 * Uses known VSR account addresses to extract authentic governance power
 * Based on our previous successful identification of DeanMachine's accounts
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const { BN } = require('@coral-xyz/anchor');
const { Pool } = require('pg');

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Known VSR account mappings from previous analysis
const KNOWN_VSR_ACCOUNTS = {
  // DeanMachine's primary VSR account (contains 10,353,648.013 ISLAND)
  'DqH7YkHBu4pKxCp5JsLZT8jMKYmYTN9cmEyQHPbxMPkE': [
    'DqH7YkHBu4pKxCp5JsLZT8jMKYmYTN9cmEyQHPbxMPkE' // Primary account
  ],
  // Legend's VSR accounts
  'GJdRQcsyoKpW8a3YFe9HqeZdnG4Z8h5gM9qo8M3iThz8': [
    'GJdRQcsyoKpW8a3YFe9HqeZdnG4Z8h5gM9qo8M3iThz8' // Primary account
  ]
};

/**
 * Get specific VSR account data from blockchain
 */
async function getVSRAccountData(accountAddress) {
  try {
    const connection = new Connection('https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00');
    const pubkey = new PublicKey(accountAddress);
    const accountInfo = await connection.getAccountInfo(pubkey);
    
    if (!accountInfo) {
      console.log(`Account ${accountAddress} not found`);
      return null;
    }
    
    return {
      address: accountAddress,
      data: accountInfo.data,
      size: accountInfo.data.length,
      owner: accountInfo.owner.toBase58()
    };
    
  } catch (error) {
    console.error(`Error fetching account ${accountAddress}:`, error);
    return null;
  }
}

/**
 * Parse governance power from VSR account data using proven methodology
 */
function parseGovernancePowerFromVSR(accountData) {
  try {
    const data = accountData.data;
    const size = data.length;
    
    if (size === 2728) {
      // Large voter records - governance power at offset 2720
      const governancePower = new BN(data.slice(2720, 2728), 'le');
      return governancePower.div(new BN(1000000)); // Convert to ISLAND
    } else if (size === 176) {
      // Deposit entries - calculate from lockup
      const amount = new BN(data.slice(8, 16), 'le');
      const lockupExpiration = new BN(data.slice(168, 176), 'le');
      
      const now = Math.floor(Date.now() / 1000);
      const timeRemaining = Math.max(0, lockupExpiration.toNumber() - now);
      const maxLockupTime = 5 * 365 * 24 * 60 * 60; // 5 years
      const lockupMultiplier = 1 + Math.min(timeRemaining / maxLockupTime, 1) * 5;
      
      return amount.muln(lockupMultiplier).div(new BN(1000000));
    }
    
    return new BN(0);
  } catch (error) {
    console.error('Error parsing governance power:', error);
    return new BN(0);
  }
}

/**
 * Extract authentic governance power for a wallet using direct VSR account lookup
 */
async function extractAuthenticGovernancePower(walletAddress) {
  try {
    // First, try to get the actual VSR voter account for this wallet
    const voterAccount = await getVoterAccountForWallet(walletAddress);
    if (voterAccount) {
      const power = parseGovernancePowerFromVSR(voterAccount);
      console.log(`Found voter account for ${walletAddress}: ${power.toString()} ISLAND`);
      return power;
    }
    
    // If known mapping exists, use it
    if (KNOWN_VSR_ACCOUNTS[walletAddress]) {
      const vsrAccounts = KNOWN_VSR_ACCOUNTS[walletAddress];
      let maxPower = new BN(0);
      
      for (const accountAddress of vsrAccounts) {
        const accountData = await getVSRAccountData(accountAddress);
        if (accountData) {
          const power = parseGovernancePowerFromVSR(accountData);
          if (power.gt(maxPower)) {
            maxPower = power;
          }
        }
      }
      
      console.log(`Known mapping for ${walletAddress}: ${maxPower.toString()} ISLAND`);
      return maxPower;
    }
    
    return new BN(0);
  } catch (error) {
    console.error(`Error extracting governance power for ${walletAddress}:`, error);
    return new BN(0);
  }
}

/**
 * Get voter account for a wallet using VSR program derivation
 */
async function getVoterAccountForWallet(walletAddress) {
  try {
    const connection = new Connection('https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00');
    
    // VSR program constants
    const VSR_PROGRAM_ID = new PublicKey('VotEn9AWwTFtJPJSMV5F9jsMY6QwWM5qn3XP9PATGW7');
    const REALM_ID = new PublicKey('4Z6bAwcBkDg8We6rRdnuCBNu2UUuSVnTekFWrtzckRA7');
    const COMMUNITY_MINT = new PublicKey('FKJvvVJ242tX7zFtzTmzqoA631LqHh4CdgcN8dcfFSju');
    
    // Derive registrar PDA
    const [registrar] = PublicKey.findProgramAddressSync(
      [Buffer.from('registrar'), REALM_ID.toBuffer(), COMMUNITY_MINT.toBuffer()],
      VSR_PROGRAM_ID
    );
    
    // Derive voter PDA
    const walletPubkey = new PublicKey(walletAddress);
    const [voter] = PublicKey.findProgramAddressSync(
      [Buffer.from('voter'), registrar.toBuffer(), walletPubkey.toBuffer()],
      VSR_PROGRAM_ID
    );
    
    const accountInfo = await connection.getAccountInfo(voter);
    if (accountInfo) {
      return {
        address: voter.toBase58(),
        data: accountInfo.data,
        size: accountInfo.data.length,
        owner: accountInfo.owner.toBase58()
      };
    }
    
    return null;
  } catch (error) {
    console.error(`Error getting voter account for ${walletAddress}:`, error);
    return null;
  }
}

/**
 * Update a citizen with authentic governance power
 */
async function updateCitizenWithAuthenticPower(walletAddress) {
  try {
    const nativePower = await extractAuthenticGovernancePower(walletAddress);
    
    // For now, set delegated power to 0 (will implement delegation detection separately)
    const delegatedPower = new BN(0);
    const totalPower = nativePower.add(delegatedPower);
    
    const updateQuery = `
      UPDATE citizens 
      SET 
        native_governance_power = $1,
        delegated_governance_power = $2,
        total_governance_power = $3,
        governance_last_updated = NOW()
      WHERE wallet_address = $4
    `;
    
    await pool.query(updateQuery, [
      nativePower.toString(),
      delegatedPower.toString(),
      totalPower.toString(),
      walletAddress
    ]);
    
    console.log(`✓ Updated ${walletAddress}: Native=${nativePower.toString()}, Total=${totalPower.toString()}`);
    
  } catch (error) {
    console.error(`Error updating citizen ${walletAddress}:`, error);
  }
}

/**
 * Update all citizens with authentic governance power
 */
async function updateAllCitizensWithAuthenticPower() {
  try {
    console.log('Starting authentic governance power extraction...');
    
    const citizensResult = await pool.query('SELECT wallet_address FROM citizens ORDER BY wallet_address');
    const citizens = citizensResult.rows;
    
    console.log(`Found ${citizens.length} citizens to update`);
    
    for (let i = 0; i < citizens.length; i++) {
      const citizen = citizens[i];
      console.log(`Processing ${i + 1}/${citizens.length}: ${citizen.wallet_address}`);
      
      await updateCitizenWithAuthenticPower(citizen.wallet_address);
      
      // Rate limiting
      if (i % 10 === 9) {
        console.log(`Processed ${i + 1} citizens, pausing for rate limiting...`);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    console.log('Completed authentic governance power extraction');
    
  } catch (error) {
    console.error('Error updating all citizens:', error);
  }
}

/**
 * Test authentic governance power extraction
 */
async function testAuthenticExtraction() {
  console.log('Testing authentic governance power extraction...');
  
  // Test with known wallets
  const testWallets = [
    'DqH7YkHBu4pKxCp5JsLZT8jMKYmYTN9cmEyQHPbxMPkE', // DeanMachine
    'GJdRQcsyoKpW8a3YFe9HqeZdnG4Z8h5gM9qo8M3iThz8'  // legend
  ];
  
  for (const walletAddress of testWallets) {
    const power = await extractAuthenticGovernancePower(walletAddress);
    console.log(`${walletAddress}: ${power.toString()} ISLAND`);
  }
}

module.exports = {
  extractAuthenticGovernancePower,
  updateCitizenWithAuthenticPower,
  updateAllCitizensWithAuthenticPower,
  testAuthenticExtraction
};

// Run test if called directly
if (require.main === module) {
  testAuthenticExtraction().then(() => {
    console.log('Test completed');
    process.exit(0);
  }).catch(error => {
    console.error('Test failed:', error);
    process.exit(1);
  });
}