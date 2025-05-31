/**
 * Debug Titanmaker VSR Account Discovery
 * Check why the 200,000 ISLAND deposit isn't being found
 */

const { Connection, PublicKey } = require('@solana/web3.js');

const HELIUS_RPC = 'https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00';
const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');
const REGISTRAR_ADDRESS = new PublicKey('5ZnjJjALX8xs7zuM6t6m7XVkPV3fY3NqxwHvDLhwpShM');
const TITANMAKER_WALLET = 'Fgv1zrwB6VF3jc45PaNT5t9AnSsJrwb8r7aMNip5fRY1';

const connection = new Connection(HELIUS_RPC, 'confirmed');

async function debugTitanmakerAccounts() {
  console.log('=== Debug Titanmaker VSR Account Discovery ===');
  console.log(`Titanmaker wallet: ${TITANMAKER_WALLET}`);
  console.log(`Looking for 200,000 ISLAND deposit`);
  console.log('');
  
  const titanmakerPubkey = new PublicKey(TITANMAKER_WALLET);
  
  // Method 1: Search by authority at offset 40
  console.log('Method 1: Search by authority at offset 40');
  try {
    const auth40Accounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
      filters: [
        { memcmp: { offset: 40, bytes: titanmakerPubkey.toBase58() } }
      ]
    });
    console.log(`Found ${auth40Accounts.length} accounts`);
    for (const account of auth40Accounts) {
      console.log(`  ${account.pubkey.toBase58()}`);
    }
  } catch (error) {
    console.log(`Error: ${error.message}`);
  }
  
  // Method 2: Search by authority at offset 8
  console.log('\nMethod 2: Search by authority at offset 8');
  try {
    const auth8Accounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
      filters: [
        { memcmp: { offset: 8, bytes: titanmakerPubkey.toBase58() } }
      ]
    });
    console.log(`Found ${auth8Accounts.length} accounts`);
    for (const account of auth8Accounts) {
      console.log(`  ${account.pubkey.toBase58()}`);
    }
  } catch (error) {
    console.log(`Error: ${error.message}`);
  }
  
  // Method 3: Voter PDA
  console.log('\nMethod 3: Voter PDA derivation');
  try {
    const [voterPDA] = PublicKey.findProgramAddressSync(
      [
        REGISTRAR_ADDRESS.toBuffer(),
        Buffer.from('voter'),
        titanmakerPubkey.toBuffer()
      ],
      VSR_PROGRAM_ID
    );
    
    console.log(`Derived PDA: ${voterPDA.toBase58()}`);
    
    const voterAccount = await connection.getAccountInfo(voterPDA);
    if (voterAccount) {
      console.log(`✅ PDA account exists, ${voterAccount.data.length} bytes`);
    } else {
      console.log(`❌ PDA account does not exist`);
    }
  } catch (error) {
    console.log(`Error: ${error.message}`);
  }
  
  // Method 4: All VSR accounts for analysis
  console.log('\nMethod 4: All VSR accounts containing target amount');
  try {
    const allVSRAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID);
    console.log(`Total VSR accounts: ${allVSRAccounts.length}`);
    
    const targetAmount = BigInt(200000000000); // 200,000 ISLAND in micro-lamports
    let foundAccounts = 0;
    
    for (const account of allVSRAccounts) {
      const data = account.account.data;
      
      // Search for the target amount in the data
      for (let offset = 0; offset <= data.length - 8; offset += 1) {
        try {
          const value = data.readBigUInt64LE(offset);
          if (value === targetAmount) {
            console.log(`✅ Found 200,000 ISLAND in account ${account.pubkey.toBase58()} at offset ${offset}`);
            foundAccounts++;
            
            // Check if this account relates to Titanmaker
            const VSR_DISCRIMINATOR = '14560581792603266545';
            if (data.length >= 8) {
              const discriminator = data.readBigUInt64LE(0);
              if (discriminator.toString() === VSR_DISCRIMINATOR && data.length >= 72) {
                const authority = new PublicKey(data.subarray(40, 72));
                console.log(`  Authority: ${authority.toBase58()}`);
                
                if (authority.toBase58() === TITANMAKER_WALLET) {
                  console.log(`  🎯 This is Titanmaker's account!`);
                  
                  // Check isUsed flag around this offset
                  const possibleEntryStart = 80 + Math.floor((offset - 80) / 72) * 72;
                  if (possibleEntryStart >= 80 && possibleEntryStart + 72 <= data.length) {
                    const isUsed = data.readUInt8(possibleEntryStart + 40);
                    console.log(`  isUsed flag at entry offset ${possibleEntryStart + 40}: ${isUsed}`);
                  }
                }
              }
            }
            break; // Found in this account, move to next
          }
        } catch (error) {
          // Continue scanning
        }
      }
    }
    
    console.log(`\nFound ${foundAccounts} accounts containing 200,000 ISLAND`);
    
  } catch (error) {
    console.log(`Error: ${error.message}`);
  }
}

if (require.main === module) {
  debugTitanmakerAccounts().catch((error) => {
    console.error('Debug failed:', error.message);
    process.exit(1);
  });
}