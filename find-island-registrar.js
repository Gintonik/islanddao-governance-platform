/**
 * Find IslandDAO VSR Registrar Account
 * Search for actual registrar accounts and find the one used by IslandDAO
 */

import { Connection, PublicKey } from '@solana/web3.js';
import { config } from 'dotenv';
import fs from 'fs';
config();

const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');
const ISLAND_DAO_REALM = new PublicKey('F9VL4wo49aUe8FufjMbU6uhdfyDRqKY54WpzdpncUSk9');
const ISLAND_GOVERNANCE_MINT = new PublicKey('Ds52CDgqdWbTWsua1hgT3AuSSy4FNx2Ezge1br3jQ14a');

async function findIslandDAORegistrar() {
  console.log('Searching for IslandDAO VSR registrar accounts...');
  
  const connection = new Connection(process.env.HELIUS_RPC_URL);
  
  try {
    // Get all VSR program accounts
    const allVSRAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID);
    console.log(`Found ${allVSRAccounts.length} VSR program accounts`);
    
    // Look for registrar accounts (typically larger accounts)
    const potentialRegistrars = allVSRAccounts.filter(account => 
      account.account.data.length > 200 && account.account.data.length < 2000
    );
    
    console.log(`Found ${potentialRegistrars.length} potential registrar accounts`);
    
    for (let i = 0; i < potentialRegistrars.length; i++) {
      const account = potentialRegistrars[i];
      console.log(`\nExamining account ${i + 1}: ${account.pubkey.toBase58()}`);
      console.log(`Data length: ${account.account.data.length} bytes`);
      
      try {
        const data = account.account.data;
        
        // Skip discriminator (8 bytes) and look for realm reference
        let offset = 8;
        
        // Check if this registrar references the IslandDAO realm
        let foundRealmReference = false;
        for (let j = offset; j <= data.length - 32; j += 4) {
          try {
            const potentialPubkey = new PublicKey(data.slice(j, j + 32));
            if (potentialPubkey.equals(ISLAND_DAO_REALM)) {
              console.log(`✅ Found IslandDAO realm reference at offset ${j}`);
              foundRealmReference = true;
              break;
            }
            if (potentialPubkey.equals(ISLAND_GOVERNANCE_MINT)) {
              console.log(`✅ Found IslandDAO governance mint reference at offset ${j}`);
              foundRealmReference = true;
            }
          } catch (e) {
            continue;
          }
        }
        
        if (foundRealmReference) {
          console.log(`🎯 This appears to be the IslandDAO registrar!`);
          
          // Parse the full configuration
          const config = parseRegistrarConfig(data, account.pubkey.toBase58());
          
          console.log('\n📋 FULL REGISTRAR CONFIG:');
          console.log('=========================');
          console.log(JSON.stringify(config, null, 2));
          
          // Save to file
          fs.writeFileSync('./island-registrar-config.json', JSON.stringify(config, null, 2));
          console.log('\n✅ Saved config to island-registrar-config.json');
          
          return config;
        }
        
      } catch (parseError) {
        console.log(`Error parsing account: ${parseError.message}`);
      }
    }
    
    console.log('❌ No IslandDAO registrar found in VSR accounts');
    return null;
    
  } catch (error) {
    console.error('Error searching for registrar:', error.message);
    throw error;
  }
}

function parseRegistrarConfig(data, pubkey) {
  const config = {
    registrarPDA: pubkey,
    dataLength: data.length,
    rawHex: data.toString('hex').slice(0, 400) + '...', // First 200 bytes
  };
  
  try {
    let offset = 8; // Skip discriminator
    
    // Parse structured fields
    const fields = [];
    
    // Extract all 32-byte values (potential pubkeys)
    const pubkeys = [];
    for (let i = offset; i <= data.length - 32; i += 4) {
      try {
        const pubkey = new PublicKey(data.slice(i, i + 32));
        pubkeys.push({
          offset: i,
          pubkey: pubkey.toBase58()
        });
      } catch (e) {
        continue;
      }
    }
    
    // Extract all 8-byte values (potential numbers/timestamps)
    const numbers = [];
    for (let i = offset; i <= data.length - 8; i += 8) {
      try {
        const value = data.readBigUInt64LE(i);
        const numberValue = Number(value);
        
        if (numberValue > 0 && numberValue < Number.MAX_SAFE_INTEGER) {
          let type = 'unknown';
          
          // Classify the number
          if (numberValue > 1000000000 && numberValue <= 10000000000) {
            type = 'scaled_factor'; // Likely 10^9 scaled values
          } else if (numberValue > 86400 && numberValue < 157680000) {
            type = 'time_seconds'; // Between 1 day and 5 years
          } else if (numberValue >= 1 && numberValue <= 100) {
            type = 'index_or_count';
          }
          
          numbers.push({
            offset: i,
            value: numberValue,
            type: type,
            scaled: numberValue / 1e9,
            years: numberValue / (365.25 * 24 * 3600)
          });
        }
      } catch (e) {
        continue;
      }
    }
    
    config.detectedPubkeys = pubkeys;
    config.detectedNumbers = numbers;
    
    // Make educated guesses for VSR parameters
    const scaledFactors = numbers.filter(n => n.type === 'scaled_factor');
    const timeValues = numbers.filter(n => n.type === 'time_seconds');
    
    if (scaledFactors.length >= 2) {
      config.baselineVoteWeightScaledFactor = scaledFactors[0].value;
      config.maxExtraLockupVoteWeightScaledFactor = scaledFactors[scaledFactors.length - 1].value;
    }
    
    if (timeValues.length > 0) {
      config.lockupSaturationSecs = Math.max(...timeValues.map(t => t.value));
    }
    
    // VSR program specifics
    config.vsrProgramId = VSR_PROGRAM_ID.toBase58();
    config.digitShift = 6; // ISLAND decimals
    
  } catch (error) {
    config.parseError = error.message;
  }
  
  return config;
}

// Export and run
export { findIslandDAORegistrar };

if (import.meta.url === `file://${process.argv[1]}`) {
  findIslandDAORegistrar().catch(console.error);
}