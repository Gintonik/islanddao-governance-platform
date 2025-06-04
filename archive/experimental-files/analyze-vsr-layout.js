/**
 * Analyze VSR Layout
 * Deep analysis of the actual VSR account structure to understand correct parsing
 */

const { Connection, PublicKey } = require('@solana/web3.js');

const HELIUS_RPC = 'https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00';
const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');
const REGISTRAR_ADDRESS = new PublicKey('5ZnjJjALX8xs7zuM6t6m7XVkPV3fY3NqxwHvDLhwpShM');

const connection = new Connection(HELIUS_RPC, 'confirmed');

async function analyzeVSRLayout() {
  console.log('=== VSR Account Structure Analysis ===');
  console.log('Analyzing Legend wallet to understand correct deposit parsing');
  console.log('');
  
  const legendWallet = new PublicKey('Fywb7YDCXxtD7pNKThJ36CAtVe23dEeEPf7HqKzJs1VG');
  
  // Get all VSR accounts for Legend
  const accounts = [];
  
  const authAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
    filters: [
      { memcmp: { offset: 8, bytes: legendWallet.toBase58() } }
    ]
  });
  accounts.push(...authAccounts);
  
  const [voterPDA] = PublicKey.findProgramAddressSync(
    [
      REGISTRAR_ADDRESS.toBuffer(),
      Buffer.from('voter'),
      legendWallet.toBuffer()
    ],
    VSR_PROGRAM_ID
  );
  
  const voterAccount = await connection.getAccountInfo(voterPDA);
  if (voterAccount) {
    accounts.push({ pubkey: voterPDA, account: voterAccount });
  }
  
  console.log(`Found ${accounts.length} VSR accounts for Legend wallet`);
  
  for (let accountIndex = 0; accountIndex < accounts.length; accountIndex++) {
    const account = accounts[accountIndex];
    const data = account.account.data;
    const address = account.pubkey.toBase58();
    
    console.log(`\n--- Account ${accountIndex + 1}: ${address} ---`);
    console.log(`Data length: ${data.length} bytes`);
    
    // Check discriminator
    const VSR_DISCRIMINATOR = '14560581792603266545';
    if (data.length >= 8) {
      const discriminator = data.readBigUInt64LE(0);
      if (discriminator.toString() === VSR_DISCRIMINATOR) {
        console.log('✅ Valid VSR discriminator');
        
        // Parse header
        if (data.length >= 80) {
          const registrar = data.subarray(8, 40);
          const authority = data.subarray(40, 72);
          const voterBump = data.readUInt8(72);
          const voterWeightRecordBump = data.readUInt8(73);
          
          console.log(`Registrar: ${new PublicKey(registrar).toBase58()}`);
          console.log(`Authority: ${new PublicKey(authority).toBase58()}`);
          console.log(`Voter bump: ${voterBump}`);
          console.log(`VWR bump: ${voterWeightRecordBump}`);
          
          // Look for the target 3,361,730.15 ISLAND amount
          const targetAmount = BigInt(3361730150000); // in micro-lamports
          
          console.log(`\nSearching for target amount ${targetAmount.toString()} (3,361,730.15 ISLAND):`);
          
          let foundTarget = false;
          
          // Scan through all possible offsets
          for (let offset = 80; offset <= data.length - 8; offset += 8) {
            try {
              const value = data.readBigUInt64LE(offset);
              
              if (value === targetAmount) {
                console.log(`✅ FOUND TARGET at offset ${offset}!`);
                foundTarget = true;
                
                // Analyze surrounding context to understand structure
                console.log(`Context analysis around offset ${offset}:`);
                
                // Check if this fits a deposit entry pattern
                const entryStartGuess = Math.floor((offset - 80) / 72) * 72 + 80;
                const entryIndex = Math.floor((offset - 80) / 72);
                
                console.log(`  Possible entry ${entryIndex} starting at offset ${entryStartGuess}`);
                
                if (entryStartGuess + 72 <= data.length) {
                  try {
                    const startTs = Number(data.readBigUInt64LE(entryStartGuess + 0));
                    const endTs = Number(data.readBigUInt64LE(entryStartGuess + 8));
                    const lockupKind = data.readUInt8(entryStartGuess + 16);
                    const amountDeposited = Number(data.readBigUInt64LE(entryStartGuess + 24));
                    const amountInitiallyLocked = Number(data.readBigUInt64LE(entryStartGuess + 32));
                    const isUsed = data.readUInt8(entryStartGuess + 40);
                    const allowClawback = data.readUInt8(entryStartGuess + 41);
                    const votingMintConfigIdx = data.readUInt8(entryStartGuess + 42);
                    
                    console.log(`    startTs: ${startTs} (${startTs > 1600000000 ? new Date(startTs * 1000).toISOString() : 'invalid'})`);
                    console.log(`    endTs: ${endTs} (${endTs > 1600000000 ? new Date(endTs * 1000).toISOString() : endTs === 0 ? 'no lockup' : 'invalid'})`);
                    console.log(`    lockupKind: ${lockupKind}`);
                    console.log(`    amountDeposited: ${amountDeposited} (${(amountDeposited / 1e6).toLocaleString()} ISLAND)`);
                    console.log(`    amountInitiallyLocked: ${amountInitiallyLocked} (${(amountInitiallyLocked / 1e6).toLocaleString()} ISLAND)`);
                    console.log(`    isUsed: ${isUsed} (${isUsed === 1 ? 'true' : 'false'})`);
                    console.log(`    allowClawback: ${allowClawback}`);
                    console.log(`    votingMintConfigIdx: ${votingMintConfigIdx}`);
                    
                    if (amountDeposited === Number(targetAmount) && isUsed === 1) {
                      console.log(`    🎯 PERFECT MATCH: This is the correct deposit entry!`);
                    }
                  } catch (error) {
                    console.log(`    Parse error: ${error.message}`);
                  }
                }
              }
            } catch (error) {
              // Continue scanning
            }
          }
          
          if (!foundTarget) {
            console.log('❌ Target amount not found in this account');
          }
          
        } else {
          console.log('❌ Insufficient data length for VSR header');
        }
      } else {
        console.log('❌ Invalid VSR discriminator');
      }
    }
  }
}

if (require.main === module) {
  analyzeVSRLayout().catch((error) => {
    console.error('Analysis failed:', error.message);
    process.exit(1);
  });
}