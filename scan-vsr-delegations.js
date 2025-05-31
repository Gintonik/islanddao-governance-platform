/**
 * Scan VSR Delegations for IslandDAO
 * Finds native delegation relationships within the Voter Stake Registry
 * Run with: node scan-vsr-delegations.js
 */

const { Connection, PublicKey } = require('@solana/web3.js');

// Configuration
const HELIUS_RPC = 'https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00';
const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');
const ISLANDDAO_REALM = new PublicKey('4zJdDtxL1xW9sPZLDrUD4VefPSZdYkDbb8c8k1t54Mfu');
const ISLAND_MINT = new PublicKey('Ds52CDgqdWbTWsua1hgT3AuSSy4FNx2Ezge1br3jQ14a');

const connection = new Connection(HELIUS_RPC, 'confirmed');

/**
 * Derive the Registrar PDA for IslandDAO
 */
function deriveRegistrarPDA() {
  const [registrarPDA] = PublicKey.findProgramAddressSync(
    [
      Buffer.from('registrar'),
      ISLANDDAO_REALM.toBuffer(),
      ISLAND_MINT.toBuffer()
    ],
    VSR_PROGRAM_ID
  );
  return registrarPDA;
}

/**
 * Parse Voter account data to extract delegation information
 */
function parseVoterAccount(data) {
  try {
    // VSR Voter account structure (approximate offsets):
    // 0-8: discriminator
    // 8-40: registrar
    // 40-72: voter authority (wallet owner)
    // 72-104: delegate (if delegated, otherwise zeros)
    // Plus additional fields including delegated power
    
    const voterAuthority = new PublicKey(data.slice(40, 72));
    const delegateBytes = data.slice(72, 104);
    
    // Check if delegate field is set (not all zeros)
    const hasDelegate = !delegateBytes.every(byte => byte === 0);
    
    if (hasDelegate) {
      const delegate = new PublicKey(delegateBytes);
      
      // Try to extract delegated power from various possible offsets
      let delegatedPower = 0;
      const powerOffsets = [104, 112, 120, 128, 136];
      
      for (const offset of powerOffsets) {
        if (offset + 8 <= data.length) {
          try {
            const rawPower = data.readBigUInt64LE(offset);
            const power = Number(rawPower) / 1e6; // Convert from micro-tokens
            
            if (power > 0 && power < 50000000) {
              delegatedPower = Math.max(delegatedPower, power);
            }
          } catch (e) {
            // Skip invalid data
          }
        }
      }
      
      return {
        voterAuthority: voterAuthority.toBase58(),
        delegate: delegate.toBase58(),
        delegatedPower,
        hasDelegate: true
      };
    }
    
    return {
      voterAuthority: voterAuthority.toBase58(),
      delegate: null,
      delegatedPower: 0,
      hasDelegate: false
    };
    
  } catch (error) {
    console.error(`Error parsing voter account: ${error.message}`);
    return null;
  }
}

/**
 * Scan all VSR Voter accounts for delegation relationships
 */
async function scanVSRDelegations() {
  try {
    console.log('Scanning VSR for IslandDAO delegation relationships...');
    console.log(`VSR Program: ${VSR_PROGRAM_ID.toBase58()}`);
    console.log(`IslandDAO Realm: ${ISLANDDAO_REALM.toBase58()}`);
    console.log(`ISLAND Mint: ${ISLAND_MINT.toBase58()}`);
    
    // Derive the Registrar PDA
    const registrarPDA = deriveRegistrarPDA();
    console.log(`\nRegistrar PDA: ${registrarPDA.toBase58()}`);
    
    // Fetch all Voter accounts that belong to this registrar
    console.log('\nFetching VSR Voter accounts...');
    
    const voterAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
      filters: [
        // Filter by registrar (IslandDAO VSR registrar)
        { memcmp: { offset: 8, bytes: registrarPDA.toBase58() } }
      ]
    });
    
    console.log(`Found ${voterAccounts.length} VSR Voter accounts for IslandDAO`);
    
    const delegations = [];
    let votersProcessed = 0;
    let delegationsFound = 0;
    
    console.log('\nAnalyzing Voter accounts for delegations...');
    
    for (const account of voterAccounts) {
      const voterData = parseVoterAccount(account.account.data);
      
      if (voterData) {
        votersProcessed++;
        
        if (voterData.hasDelegate) {
          delegationsFound++;
          delegations.push(voterData);
          
          console.log(`\nDELEGATION FOUND:`);
          console.log(`  Wallet ${voterData.voterAuthority.substring(0, 8)} delegated to ${voterData.delegate.substring(0, 8)}`);
          console.log(`  Delegated Power: ${voterData.delegatedPower.toLocaleString()} ISLAND`);
        }
      }
    }
    
    // Summary report
    console.log('\n' + '='.repeat(70));
    console.log('VSR DELEGATION SCAN RESULTS');
    console.log('='.repeat(70));
    console.log(`Total VSR Voter accounts scanned: ${votersProcessed}`);
    console.log(`Delegation relationships found: ${delegationsFound}`);
    
    if (delegations.length > 0) {
      console.log('\nFULL DELEGATION LIST:');
      console.log('-'.repeat(50));
      
      let totalDelegatedPower = 0;
      
      delegations.forEach((delegation, index) => {
        console.log(`${index + 1}. ${delegation.voterAuthority} → ${delegation.delegate}`);
        console.log(`   Power: ${delegation.delegatedPower.toLocaleString()} ISLAND`);
        totalDelegatedPower += delegation.delegatedPower;
      });
      
      console.log('-'.repeat(50));
      console.log(`Total Delegated Power: ${totalDelegatedPower.toLocaleString()} ISLAND`);
      
    } else {
      console.log('\nNo VSR delegation relationships found in IslandDAO');
    }
    
    return delegations;
    
  } catch (error) {
    console.error('Error scanning VSR delegations:', error.message);
    throw error;
  }
}

/**
 * Main execution function
 */
async function run() {
  try {
    console.log('Starting VSR delegation scan for IslandDAO...');
    
    const delegations = await scanVSRDelegations();
    
    console.log('\n✅ VSR delegation scan completed successfully');
    
    return delegations;
    
  } catch (error) {
    console.error('\nVSR delegation scan failed:', error.message);
    throw error;
  }
}

// Execute when run directly
if (require.main === module) {
  run()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

module.exports = { run, scanVSRDelegations };