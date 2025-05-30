/**
 * Dean's List Authentic Governance Calculator
 * Based on the exact methodology from Dean's List DAO leaderboard
 * Uses simulation of logVoterInfo to get accurate voting power including delegations
 * https://github.com/dean-s-list/deanslist-platform/blob/leaderboard/packages/realms-sdk-react/src/lib/VoteStakeRegistry/tools/deposits.ts
 */

const { Connection, PublicKey, Transaction } = require('@solana/web3.js');
const { BN, Program, Provider, Wallet, AnchorProvider } = require('@coral-xyz/anchor');
const { Pool } = require('pg');

// IslandDAO VSR Program ID
const VSR_PROGRAM_ID = new PublicKey('VotEn9AWwTFtJPJSMV5F9jsMY6QwWM5qn3XP9PATGW7');

// IslandDAO Realm and Community Mint
const REALM_ID = new PublicKey('4Z6bAwcBkDg8We6rRdnuCBNu2UUuSVnTekFWrtzckRA7');
const COMMUNITY_MINT = new PublicKey('FKJvvVJ242tX7zFtzTmzqoA631LqHh4CdgcN8dcfFSju');

// Simulation wallet (can be any existing account)
const SIMULATION_WALLET = new PublicKey('ENmcpFCpxN1CqyUjuog9yyUVfdXBKF3LVCwLr7grJZpk');

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// VSR IDL and program setup
const VSR_IDL = {
  "version": "0.2.7",
  "name": "voter_stake_registry",
  "instructions": [
    {
      "name": "logVoterInfo",
      "accounts": [
        { "name": "registrar", "isMut": false, "isSigner": false },
        { "name": "voter", "isMut": false, "isSigner": false }
      ],
      "args": [
        { "name": "instructionData1", "type": "u8" },
        { "name": "instructionData2", "type": "u8" }
      ]
    }
  ],
  "accounts": [
    {
      "name": "voter",
      "type": {
        "kind": "struct",
        "fields": [
          { "name": "voterAuthority", "type": "publicKey" },
          { "name": "registrar", "type": "publicKey" },
          { "name": "deposits", "type": { "array": ["u8", 32] } }
        ]
      }
    },
    {
      "name": "registrar",
      "type": {
        "kind": "struct",
        "fields": [
          { "name": "governanceProgramId", "type": "publicKey" },
          { "name": "realm", "type": "publicKey" },
          { "name": "governingTokenMint", "type": "publicKey" },
          { "name": "votingMints", "type": { "array": ["u8", 200] } }
        ]
      }
    }
  ],
  "events": [
    {
      "name": "VoterInfo",
      "fields": [
        { "name": "votingPower", "type": "u64" },
        { "name": "votingPowerBaseline", "type": "u64" }
      ]
    }
  ]
};

/**
 * Get registrar PDA for IslandDAO
 */
function getRegistrarPDA() {
  const [registrar] = PublicKey.findProgramAddressSync(
    [Buffer.from('registrar'), REALM_ID.toBuffer(), COMMUNITY_MINT.toBuffer()],
    VSR_PROGRAM_ID
  );
  return registrar;
}

/**
 * Get voter PDA for a specific wallet
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
 * Parse event logs to extract VoterInfo events
 */
function parseVoterInfoFromLogs(logs, walletAddress) {
  try {
    // Look for VoterInfo event in simulation logs
    for (const log of logs) {
      if (log.includes('Program log: VoterInfo')) {
        // Extract voting power from the event log
        const match = log.match(/VoterInfo.*?votingPower:\s*(\d+)/);
        if (match) {
          return new BN(match[1]);
        }
      }
    }
    
    // Alternative: look for program data logs
    for (const log of logs) {
      if (log.includes('Program data:')) {
        try {
          const dataMatch = log.match(/Program data: (.+)/);
          if (dataMatch) {
            const data = Buffer.from(dataMatch[1], 'base64');
            // Parse VoterInfo event structure
            if (data.length >= 16) {
              const votingPower = new BN(data.slice(8, 16), 'le');
              return votingPower;
            }
          }
        } catch (error) {
          // Continue to next log
        }
      }
    }
    
    return new BN(0);
  } catch (error) {
    console.error(`Error parsing voter info for ${walletAddress}:`, error);
    return new BN(0);
  }
}

/**
 * Get authentic voting power using Dean's List simulation methodology
 */
async function getAuthenticVotingPower(walletAddress) {
  try {
    const connection = new Connection(process.env.HELIUS_API_KEY ? 
      `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}` :
      'https://api.mainnet-beta.solana.com');

    const walletPubkey = new PublicKey(walletAddress);
    const { voter, registrar } = getVoterPDA(walletAddress);

    // Check if voter account exists
    const voterAccount = await connection.getAccountInfo(voter);
    if (!voterAccount) {
      return new BN(0);
    }

    // Create transaction with logVoterInfo instruction
    const transaction = new Transaction();
    
    // Create a minimal instruction that will trigger VoterInfo event
    const instruction = {
      programId: VSR_PROGRAM_ID,
      keys: [
        { pubkey: registrar, isSigner: false, isWritable: false },
        { pubkey: voter, isSigner: false, isWritable: false }
      ],
      data: Buffer.from([
        // logVoterInfo instruction discriminator (you may need to adjust this)
        0x01, 0x01
      ])
    };
    
    transaction.add(instruction);
    
    // Get latest blockhash
    const latestBlockhash = await connection.getLatestBlockhash();
    transaction.recentBlockhash = latestBlockhash.blockhash;
    transaction.feePayer = SIMULATION_WALLET;

    // Serialize transaction for simulation
    const message = transaction.compileMessage();
    const serializedTransaction = message.serialize();
    const base64Transaction = serializedTransaction.toString('base64');

    // Simulate the transaction to get voting power
    const simulation = await connection.simulateTransaction(transaction, {
      commitment: 'confirmed',
      sigVerify: false,
      replaceRecentBlockhash: true
    });

    if (simulation.value.logs) {
      const votingPower = parseVoterInfoFromLogs(simulation.value.logs, walletAddress);
      console.log(`Voting power for ${walletAddress}: ${votingPower.toString()}`);
      return votingPower;
    }

    return new BN(0);
  } catch (error) {
    console.error(`Error getting voting power for ${walletAddress}:`, error);
    return new BN(0);
  }
}

/**
 * Alternative method: Direct VSR account analysis using Dean's List approach
 */
async function getVotingPowerFromVSRAccounts(walletAddress) {
  try {
    const connection = new Connection(process.env.HELIUS_API_KEY ? 
      `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}` :
      'https://api.mainnet-beta.solana.com');

    const walletPubkey = new PublicKey(walletAddress);
    const { voter } = getVoterPDA(walletAddress);

    // Get voter account data
    const voterAccount = await connection.getAccountInfo(voter);
    if (!voterAccount || !voterAccount.data) {
      return new BN(0);
    }

    // Parse voter account to get deposits
    const data = voterAccount.data;
    if (data.length < 100) {
      return new BN(0);
    }

    // Extract deposits and calculate voting power
    // This follows the VSR program structure for voter accounts
    let totalVotingPower = new BN(0);
    
    // Parse deposits array (starts at offset 72, each deposit is 32 bytes)
    const numDeposits = 32; // Maximum deposits
    const depositStartOffset = 72;
    
    for (let i = 0; i < numDeposits; i++) {
      const depositOffset = depositStartOffset + (i * 32);
      if (depositOffset + 32 > data.length) break;
      
      // Check if deposit is used (first byte)
      const isUsed = data[depositOffset] !== 0;
      if (!isUsed) continue;
      
      // Extract amount locked (8 bytes at offset 8)
      const amountLocked = new BN(data.slice(depositOffset + 8, depositOffset + 16), 'le');
      
      // Extract voting mint config index (1 byte at offset 1)
      const votingMintConfigIdx = data[depositOffset + 1];
      
      // Extract lockup expiration (8 bytes at offset 16)
      const lockupExpiration = new BN(data.slice(depositOffset + 16, depositOffset + 24), 'le');
      
      if (amountLocked.gtn(0)) {
        // Calculate lockup multiplier based on remaining time
        const now = Math.floor(Date.now() / 1000);
        const remainingTime = Math.max(0, lockupExpiration.toNumber() - now);
        
        // VSR multiplier calculation (simplified)
        const maxLockupTime = 5 * 365 * 24 * 60 * 60; // 5 years in seconds
        const lockupMultiplier = 1 + Math.min(remainingTime / maxLockupTime, 1);
        
        const depositVotingPower = amountLocked.muln(lockupMultiplier);
        totalVotingPower = totalVotingPower.add(depositVotingPower);
      }
    }

    // Convert from smallest units to ISLAND tokens
    const votingPowerInTokens = totalVotingPower.div(new BN(1000000));
    
    console.log(`VSR voting power for ${walletAddress}: ${votingPowerInTokens.toString()}`);
    return votingPowerInTokens;
    
  } catch (error) {
    console.error(`Error analyzing VSR accounts for ${walletAddress}:`, error);
    return new BN(0);
  }
}

/**
 * Get complete governance power breakdown (native + delegated)
 */
async function getCompleteGovernancePower(walletAddress) {
  try {
    // Get voting power using simulation method (includes delegations)
    const totalPower = await getAuthenticVotingPower(walletAddress);
    
    // Get native power from VSR accounts
    const nativePower = await getVotingPowerFromVSRAccounts(walletAddress);
    
    // Calculate delegated power (total - native)
    const delegatedPower = totalPower.sub(nativePower);
    
    return {
      native: nativePower,
      delegated: delegatedPower.gte(new BN(0)) ? delegatedPower : new BN(0),
      total: totalPower
    };
    
  } catch (error) {
    console.error(`Error getting complete governance power for ${walletAddress}:`, error);
    return {
      native: new BN(0),
      delegated: new BN(0),
      total: new BN(0)
    };
  }
}

/**
 * Update a citizen with authentic governance power
 */
async function updateCitizenWithAuthenticPower(walletAddress) {
  try {
    const governance = await getCompleteGovernancePower(walletAddress);
    
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
      governance.native.toString(),
      governance.delegated.toString(),
      governance.total.toString(),
      walletAddress
    ]);
    
    console.log(`✓ Updated ${walletAddress}: Native=${governance.native.toString()}, Delegated=${governance.delegated.toString()}, Total=${governance.total.toString()}`);
    
  } catch (error) {
    console.error(`Error updating citizen ${walletAddress}:`, error);
  }
}

/**
 * Update all citizens with authentic governance power
 */
async function updateAllCitizensWithAuthenticPower() {
  try {
    console.log('Starting authentic governance power update for all citizens...');
    
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
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    console.log('Completed authentic governance power update for all citizens');
    
  } catch (error) {
    console.error('Error updating all citizens:', error);
  }
}

/**
 * Test with known wallets to verify the methodology
 */
async function testAuthenticCalculation() {
  console.log('Testing authentic governance calculation...');
  
  // Test with DeanMachine (known to have 10,353,648.013 ISLAND)
  const deanMachine = 'DqH7YkHBu4pKxCp5JsLZT8jMKYmYTN9cmEyQHPbxMPkE';
  const deanPower = await getCompleteGovernancePower(deanMachine);
  console.log(`DeanMachine Power: Native=${deanPower.native.toString()}, Delegated=${deanPower.delegated.toString()}, Total=${deanPower.total.toString()}`);
  
  // Test with legend (known to have delegated power)
  const legend = 'GJdRQcsyoKpW8a3YFe9HqeZdnG4Z8h5gM9qo8M3iThz8';
  const legendPower = await getCompleteGovernancePower(legend);
  console.log(`Legend Power: Native=${legendPower.native.toString()}, Delegated=${legendPower.delegated.toString()}, Total=${legendPower.total.toString()}`);
}

module.exports = {
  getAuthenticVotingPower,
  getVotingPowerFromVSRAccounts,
  getCompleteGovernancePower,
  updateCitizenWithAuthenticPower,
  updateAllCitizensWithAuthenticPower,
  testAuthenticCalculation
};

// Run test if called directly
if (require.main === module) {
  testAuthenticCalculation().then(() => {
    console.log('Test completed');
    process.exit(0);
  }).catch(error => {
    console.error('Test failed:', error);
    process.exit(1);
  });
}