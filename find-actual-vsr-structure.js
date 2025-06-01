/**
 * Find Actual VSR Structure
 * Discover the real registrar accounts and voter structures used by your citizens
 */

const { Connection, PublicKey } = require('@solana/web3.js');

const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');

async function findActualVSRStructure() {
  try {
    console.log('🔍 Finding actual VSR structure used by citizens...\n');
    
    const connection = new Connection(process.env.HELIUS_RPC_URL || 'https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00');
    
    // Test wallet with known VSR accounts
    const testWallet = '3PKhzE9wuEkGPHHu2sNCvG86xNtDJduAcyBPXpE6cSNt'; // DeanMachine
    
    console.log(`Analyzing VSR accounts for: ${testWallet}\n`);
    
    // Load all VSR accounts
    const allVSRAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID);
    console.log(`Total VSR accounts: ${allVSRAccounts.length}`);
    
    const walletPubkey = new PublicKey(testWallet);
    const walletBuffer = walletPubkey.toBuffer();
    
    let voterAccounts = [];
    let registrarAccounts = [];
    
    // Find all VSR accounts that reference this wallet
    for (const account of allVSRAccounts) {
      try {
        const data = account.account.data;
        
        // Check if wallet is referenced
        let walletFound = false;
        for (let offset = 0; offset <= data.length - 32; offset += 8) {
          if (data.subarray(offset, offset + 32).equals(walletBuffer)) {
            walletFound = true;
            break;
          }
        }
        
        if (walletFound) {
          console.log(`\n📍 VSR Account: ${account.pubkey.toBase58()}`);
          console.log(`   Size: ${data.length} bytes`);
          console.log(`   Owner: ${account.account.owner.toBase58()}`);
          
          // Try to identify account type by size and structure
          if (data.length === 176) {
            console.log(`   Type: Likely Voter Weight Record (176 bytes)`);
            analyzeVoterWeightRecord(data, account.pubkey.toBase58());
          } else if (data.length === 2728) {
            console.log(`   Type: Likely Voter Account (2728 bytes)`);
            analyzeVoterAccount(data, account.pubkey.toBase58(), walletPubkey);
            voterAccounts.push(account);
          } else {
            console.log(`   Type: Unknown (${data.length} bytes)`);
          }
        }
      } catch (error) {
        // Skip problematic accounts
      }
    }
    
    // Look for registrar accounts (they won't reference the wallet directly)
    console.log(`\n🔍 Searching for registrar accounts...`);
    
    for (const account of allVSRAccounts) {
      const data = account.account.data;
      
      // Registrar accounts are typically larger and contain realm references
      if (data.length > 500 && data.length < 2000) {
        // Check for known realm pubkeys in the data
        const islandRealmBuffer = new PublicKey('FEbFRw7pauKbFhbgLmJ7ogbZjHFQQBUKdZ1qLw9dUYfq').toBuffer();
        const governanceRealmBuffer = new PublicKey('9M9xrrGQJgGGpn9CCdDQNpqk9aBo8Cv5HYPGKrsWMwKi').toBuffer();
        
        let foundRealm = false;
        for (let offset = 0; offset <= data.length - 32; offset += 8) {
          if (data.subarray(offset, offset + 32).equals(islandRealmBuffer) ||
              data.subarray(offset, offset + 32).equals(governanceRealmBuffer)) {
            foundRealm = true;
            break;
          }
        }
        
        if (foundRealm) {
          console.log(`\n📋 Potential Registrar: ${account.pubkey.toBase58()}`);
          console.log(`   Size: ${data.length} bytes`);
          analyzeRegistrarAccount(data, account.pubkey.toBase58());
          registrarAccounts.push(account);
        }
      }
    }
    
    console.log(`\n📊 Summary:`);
    console.log(`   Voter accounts found: ${voterAccounts.length}`);
    console.log(`   Registrar accounts found: ${registrarAccounts.length}`);
    
    // If we found voter accounts, try to extract the registrar reference
    if (voterAccounts.length > 0) {
      console.log(`\n🔗 Extracting registrar references from voter accounts...`);
      
      for (const voterAccount of voterAccounts) {
        const registrarRef = extractRegistrarFromVoter(voterAccount.account.data);
        if (registrarRef) {
          console.log(`   Voter ${voterAccount.pubkey.toBase58()} -> Registrar: ${registrarRef}`);
          
          // Fetch the referenced registrar
          try {
            const registrarInfo = await connection.getAccountInfo(new PublicKey(registrarRef));
            if (registrarInfo) {
              console.log(`   ✅ Found registrar account: ${registrarRef} (${registrarInfo.data.length} bytes)`);
              analyzeRegistrarAccount(registrarInfo.data, registrarRef);
            }
          } catch (error) {
            console.log(`   ❌ Error fetching registrar: ${error.message}`);
          }
        }
      }
    }
    
  } catch (error) {
    console.error('Error finding VSR structure:', error);
  }
}

function analyzeVoterWeightRecord(data, address) {
  try {
    console.log(`   📝 Voter Weight Record Analysis:`);
    
    // Check for VSR discriminator
    const discriminator = data.readBigUInt64LE(0);
    console.log(`      Discriminator: ${discriminator.toString()}`);
    
    // Extract voting power from known offsets
    const offsets = [104, 112, 120, 128];
    for (const offset of offsets) {
      if (offset + 8 <= data.length) {
        try {
          const value = Number(data.readBigUInt64LE(offset)) / 1e6;
          if (value > 1000 && value < 50000000) {
            console.log(`      Offset ${offset}: ${value.toLocaleString()} ISLAND`);
          }
        } catch (error) {
          // Skip invalid reads
        }
      }
    }
  } catch (error) {
    console.log(`   ❌ Error analyzing voter weight record: ${error.message}`);
  }
}

function analyzeVoterAccount(data, address, walletPubkey) {
  try {
    console.log(`   👤 Voter Account Analysis:`);
    
    // Look for voter authority at various offsets
    const commonOffsets = [8, 40, 72];
    for (const offset of commonOffsets) {
      if (offset + 32 <= data.length) {
        try {
          const pubkey = new PublicKey(data.slice(offset, offset + 32));
          if (pubkey.equals(walletPubkey)) {
            console.log(`      ✅ Voter authority found at offset ${offset}: ${pubkey.toBase58()}`);
            
            // Try to find registrar reference (usually next 32 bytes)
            if (offset + 64 <= data.length) {
              const registrarPubkey = new PublicKey(data.slice(offset + 32, offset + 64));
              console.log(`      Registrar reference: ${registrarPubkey.toBase58()}`);
            }
            
            // Try to parse deposits count
            const depositsOffset = offset + 64;
            if (depositsOffset + 4 <= data.length) {
              const depositsCount = data.readUInt32LE(depositsOffset);
              console.log(`      Deposits count: ${depositsCount}`);
            }
            
            break;
          }
        } catch (error) {
          // Skip invalid pubkey reads
        }
      }
    }
  } catch (error) {
    console.log(`   ❌ Error analyzing voter account: ${error.message}`);
  }
}

function analyzeRegistrarAccount(data, address) {
  try {
    console.log(`   📋 Registrar Account Analysis:`);
    console.log(`      Size: ${data.length} bytes`);
    
    // Look for known realm pubkeys
    const knownRealms = [
      'FEbFRw7pauKbFhbgLmJ7ogbZjHFQQBUKdZ1qLw9dUYfq', // Island DAO
      '9M9xrrGQJgGGpn9CCdDQNpqk9aBo8Cv5HYPGKrsWMwKi'  // Another realm
    ];
    
    for (const realm of knownRealms) {
      const realmBuffer = new PublicKey(realm).toBuffer();
      for (let offset = 0; offset <= data.length - 32; offset += 8) {
        if (data.subarray(offset, offset + 32).equals(realmBuffer)) {
          console.log(`      ✅ Found realm ${realm} at offset ${offset}`);
        }
      }
    }
    
    // Look for ISLAND token mint
    const islandMintBuffer = new PublicKey('4SLdYJzqbRUzwKJSvBdoFiY24KjTMvKMCpWcBAdTQrby').toBuffer();
    for (let offset = 0; offset <= data.length - 32; offset += 8) {
      if (data.subarray(offset, offset + 32).equals(islandMintBuffer)) {
        console.log(`      ✅ Found ISLAND mint at offset ${offset}`);
      }
    }
    
  } catch (error) {
    console.log(`   ❌ Error analyzing registrar: ${error.message}`);
  }
}

function extractRegistrarFromVoter(data) {
  try {
    // Common voter account structure: discriminator(8) + voter_authority(32) + registrar(32)
    if (data.length >= 72) {
      const registrarPubkey = new PublicKey(data.slice(40, 72));
      return registrarPubkey.toBase58();
    }
  } catch (error) {
    // Return null if can't extract
  }
  return null;
}

findActualVSRStructure();