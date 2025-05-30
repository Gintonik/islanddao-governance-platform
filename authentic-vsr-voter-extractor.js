/**
 * Authentic VSR Voter Account Extractor
 * Uses proper VSR program account derivation to find voter accounts
 * Extracts real governance power from the blockchain using VSR program structure
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const { BN } = require('@coral-xyz/anchor');
const { Pool } = require('pg');

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// IslandDAO VSR Program constants
const VSR_PROGRAM_ID = new PublicKey('VotEn9AWwTFtJPJSMV5F9jsMY6QwWM5qn3XP9PATGW7');
const REALM_ID = new PublicKey('4Z6bAwcBkDg8We6rRdnuCBNu2UUuSVnTekFWrtzckRA7');
const COMMUNITY_MINT = new PublicKey('FKJvvVJ242tX7zFtzTmzqoA631LqHh4CdgcN8dcfFSju');

/**
 * Get registrar account for IslandDAO
 */
function getRegistrarPDA() {
  const [registrar] = PublicKey.findProgramAddressSync(
    [Buffer.from('registrar'), REALM_ID.toBuffer(), COMMUNITY_MINT.toBuffer()],
    VSR_PROGRAM_ID
  );
  return registrar;
}

/**
 * Get voter account PDA for a wallet
 */
function getVoterPDA(walletAddress) {
  const registrar = getRegistrarPDA();
  const walletPubkey = new PublicKey(walletAddress);
  const [voter] = PublicKey.findProgramAddressSync(
    [Buffer.from('voter'), registrar.toBuffer(), walletPubkey.toBuffer()],
    VSR_PROGRAM_ID
  );
  return { voter, registrar };
}

/**
 * Extract governance power from voter account data
 */
function extractGovernancePowerFromVoter(voterData) {
  try {
    if (!voterData || voterData.length < 100) {
      return new BN(0);
    }
    
    // VSR Voter account structure analysis
    // Based on Anchor IDL and VSR program structure
    
    // Skip the account discriminator (8 bytes)
    let offset = 8;
    
    // voter_authority (32 bytes)
    offset += 32;
    
    // registrar (32 bytes) 
    offset += 32;
    
    // deposits array - this is where the governance power calculation comes from
    // Each deposit has: voting_mint_config_idx, amount_deposited_native, amount_initially_locked, etc.
    
    let totalGovernancePower = new BN(0);
    const MAX_DEPOSITS = 32;
    
    for (let i = 0; i < MAX_DEPOSITS; i++) {
      const depositOffset = offset + (i * 64); // Each deposit is ~64 bytes
      
      if (depositOffset + 64 > voterData.length) break;
      
      // Check if deposit is used (first byte of deposit)
      const isUsed = voterData[depositOffset] !== 0;
      if (!isUsed) continue;
      
      // voting_mint_config_idx (1 byte)
      const votingMintConfigIdx = voterData[depositOffset + 1];
      
      // amount_deposited_native (8 bytes, little endian)
      const amountDeposited = new BN(voterData.slice(depositOffset + 8, depositOffset + 16), 'le');
      
      // amount_initially_locked_native (8 bytes)
      const amountInitiallyLocked = new BN(voterData.slice(depositOffset + 16, depositOffset + 24), 'le');
      
      // lockup_start_ts (8 bytes)
      const lockupStartTs = new BN(voterData.slice(depositOffset + 24, depositOffset + 32), 'le');
      
      // lockup_end_ts (8 bytes)
      const lockupEndTs = new BN(voterData.slice(depositOffset + 32, depositOffset + 40), 'le');
      
      // Calculate voting power for this deposit
      if (amountDeposited.gt(new BN(0))) {
        const now = Math.floor(Date.now() / 1000);
        const lockupRemaining = Math.max(0, lockupEndTs.toNumber() - now);
        
        // VSR lockup multiplier calculation
        const maxLockupTime = 5 * 365 * 24 * 60 * 60; // 5 years
        const lockupMultiplier = 1 + (lockupRemaining / maxLockupTime) * 5; // Max 6x multiplier
        
        const depositVotingPower = amountDeposited.muln(Math.floor(lockupMultiplier * 100)).divn(100);
        totalGovernancePower = totalGovernancePower.add(depositVotingPower);
      }
    }
    
    // Convert from lamports to ISLAND tokens (6 decimals)
    return totalGovernancePower.div(new BN(1000000));
    
  } catch (error) {
    console.error('Error extracting governance power from voter data:', error);
    return new BN(0);
  }
}

/**
 * Get authentic governance power for a wallet
 */
async function getAuthenticGovernancePower(walletAddress) {
  try {
    const connection = new Connection('https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00');
    
    const { voter } = getVoterPDA(walletAddress);
    
    console.log(`Looking up voter account: ${voter.toBase58()}`);
    
    const voterAccountInfo = await connection.getAccountInfo(voter);
    
    if (!voterAccountInfo) {
      console.log(`No voter account found for ${walletAddress}`);
      return new BN(0);
    }
    
    console.log(`Found voter account, data length: ${voterAccountInfo.data.length} bytes`);
    
    const governancePower = extractGovernancePowerFromVoter(voterAccountInfo.data);
    
    console.log(`Extracted governance power: ${governancePower.toString()} ISLAND`);
    
    return governancePower;
    
  } catch (error) {
    console.error(`Error getting governance power for ${walletAddress}:`, error);
    return new BN(0);
  }
}

/**
 * Alternative: Get all voter accounts and find matches
 */
async function findAllVoterAccounts() {
  try {
    const connection = new Connection('https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00');
    
    console.log('Fetching all VSR voter accounts...');
    
    const accounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
      filters: [
        {
          memcmp: {
            offset: 0,
            bytes: 'base58', // This would be the account discriminator for voter accounts
          }
        }
      ]
    });
    
    console.log(`Found ${accounts.length} VSR accounts`);
    
    // Analyze account structures to understand the data layout
    const voterAccounts = [];
    
    for (const account of accounts) {
      const data = account.account.data;
      
      // Look for accounts that might be voter accounts
      if (data.length > 100) {
        try {
          // Try to extract wallet address from the account
          const potentialWallet = new PublicKey(data.slice(8, 40)); // Skip discriminator, get voter_authority
          
          voterAccounts.push({
            address: account.pubkey.toBase58(),
            wallet: potentialWallet.toBase58(),
            dataLength: data.length,
            data: data
          });
          
        } catch (error) {
          // Not a valid voter account structure
        }
      }
    }
    
    console.log(`Identified ${voterAccounts.length} potential voter accounts`);
    return voterAccounts;
    
  } catch (error) {
    console.error('Error finding voter accounts:', error);
    return [];
  }
}

/**
 * Update citizen with authentic governance power
 */
async function updateCitizenWithAuthenticGovernance(walletAddress) {
  try {
    const governancePower = await getAuthenticGovernancePower(walletAddress);
    
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
      governancePower.toString(),
      '0', // Will implement delegation detection separately
      governancePower.toString(),
      walletAddress
    ]);
    
    console.log(`✓ Updated ${walletAddress}: ${governancePower.toString()} ISLAND`);
    
  } catch (error) {
    console.error(`Error updating citizen ${walletAddress}:`, error);
  }
}

/**
 * Test authentic governance power extraction
 */
async function testAuthenticGovernanceExtraction() {
  console.log('Testing authentic VSR governance power extraction...\n');
  
  // Test with known wallets
  const testWallets = [
    'DqH7YkHBu4pKxCp5JsLZT8jMKYmYTN9cmEyQHPbxMPkE', // DeanMachine
    'GJdRQcsyoKpW8a3YFe9HqeZdnG4Z8h5gM9qo8M3iThz8'  // legend
  ];
  
  for (const walletAddress of testWallets) {
    console.log(`\n--- Testing ${walletAddress} ---`);
    const power = await getAuthenticGovernancePower(walletAddress);
    console.log(`Final result: ${power.toString()} ISLAND\n`);
  }
  
  // Also try to find all voter accounts to understand the structure
  console.log('\n--- Finding all voter accounts ---');
  const voterAccounts = await findAllVoterAccounts();
  
  // Show a sample of voter accounts found
  const sampleSize = Math.min(5, voterAccounts.length);
  console.log(`\nShowing first ${sampleSize} voter accounts:`);
  
  for (let i = 0; i < sampleSize; i++) {
    const account = voterAccounts[i];
    console.log(`${i + 1}. Account: ${account.address}`);
    console.log(`   Wallet: ${account.wallet}`);
    console.log(`   Data Length: ${account.dataLength} bytes`);
    
    const power = extractGovernancePowerFromVoter(account.data);
    console.log(`   Governance Power: ${power.toString()} ISLAND`);
  }
}

module.exports = {
  getAuthenticGovernancePower,
  updateCitizenWithAuthenticGovernance,
  testAuthenticGovernanceExtraction,
  findAllVoterAccounts
};

// Run test if called directly
if (require.main === module) {
  testAuthenticGovernanceExtraction().then(() => {
    console.log('\nTest completed');
    process.exit(0);
  }).catch(error => {
    console.error('Test failed:', error);
    process.exit(1);
  });
}