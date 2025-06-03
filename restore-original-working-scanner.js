/**
 * Restore Original Working Scanner
 * Uses the exact method that correctly detected all unlocked governance power
 * Before we switched to authority-based parsing that lost detection
 */

import { Connection, PublicKey } from '@solana/web3.js';
import { config } from 'dotenv';
import pkg from 'pg';
config();

const { Pool } = pkg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');
const connection = new Connection(process.env.HELIUS_RPC_URL);

// ORIGINAL WORKING METHOD: Direct wallet buffer search
async function extractGovernancePowerForWallet(walletAddress) {
  try {
    console.log(`Extracting governance power for ${walletAddress}...`);
    
    const walletPubkey = new PublicKey(walletAddress);
    const walletBuffer = walletPubkey.toBuffer();
    
    const allVSRAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID);
    
    const governanceAmounts = [];
    
    for (const account of allVSRAccounts) {
      const data = account.account.data;
      
      // Search for wallet reference in account data
      for (let walletOffset = 0; walletOffset <= data.length - 32; walletOffset += 8) {
        if (data.subarray(walletOffset, walletOffset + 32).equals(walletBuffer)) {
          
          // Check governance power at discovered offsets
          const checkOffsets = [
            walletOffset + 32,  // Standard: 32 bytes after wallet
            104,                // Alternative offset in larger accounts
            112                 // Secondary alternative offset
          ];
          
          for (const checkOffset of checkOffsets) {
            if (checkOffset + 8 <= data.length) {
              try {
                const rawAmount = data.readBigUInt64LE(checkOffset);
                const tokenAmount = Number(rawAmount) / Math.pow(10, 6); // 6 decimals
                
                // Filter for realistic governance amounts
                if (tokenAmount >= 1000 && tokenAmount <= 20000000) {
                  governanceAmounts.push({
                    amount: tokenAmount,
                    account: account.pubkey.toString(),
                    offset: checkOffset
                  });
                }
              } catch (error) {
                continue;
              }
            }
          }
          break; // Move to next account
        }
      }
    }
    
    if (governanceAmounts.length === 0) {
      return 0;
    }
    
    // Aggregate all governance deposits for this wallet
    const uniqueAmounts = new Map();
    for (const item of governanceAmounts) {
      const key = `${item.account}-${item.offset}`;
      uniqueAmounts.set(key, item.amount);
    }
    
    const totalGovernancePower = Array.from(uniqueAmounts.values())
      .reduce((sum, amount) => sum + amount, 0);
    
    console.log(`Total governance power: ${totalGovernancePower.toLocaleString()} tokens`);
    return totalGovernancePower;
    
  } catch (error) {
    console.error(`Error extracting governance power:`, error.message);
    return 0;
  }
}

// Batch processing for all citizens
async function batchExtractGovernancePower() {
  try {
    // Get all citizen wallets from database
    const client = await pool.connect();
    const result = await client.query('SELECT wallet FROM citizens ORDER BY wallet');
    const citizenWallets = result.rows.map(row => row.wallet);
    client.release();
    
    console.log('Loading all VSR accounts...');
    const allVSRAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID);
    console.log(`Loaded ${allVSRAccounts.length} VSR accounts`);
    
    const results = {};
    
    for (const walletAddress of citizenWallets) {
      console.log(`Processing ${walletAddress}...`);
      
      const walletPubkey = new PublicKey(walletAddress);
      const walletBuffer = walletPubkey.toBuffer();
      
      const governanceAmounts = [];
      
      // Search through pre-loaded VSR accounts
      for (const account of allVSRAccounts) {
        const data = account.account.data;
        
        // Look for wallet reference
        for (let walletOffset = 0; walletOffset <= data.length - 32; walletOffset += 8) {
          if (data.subarray(walletOffset, walletOffset + 32).equals(walletBuffer)) {
            
            // Check for governance amounts at discovered offsets
            const checkOffsets = [walletOffset + 32, 104, 112];
            
            for (const checkOffset of checkOffsets) {
              if (checkOffset + 8 <= data.length) {
                try {
                  const rawAmount = data.readBigUInt64LE(checkOffset);
                  const tokenAmount = Number(rawAmount) / Math.pow(10, 6);
                  
                  if (tokenAmount >= 1000 && tokenAmount <= 20000000) {
                    governanceAmounts.push({
                      amount: tokenAmount,
                      account: account.pubkey.toString(),
                      offset: checkOffset
                    });
                  }
                } catch (error) {
                  continue;
                }
              }
            }
            break;
          }
        }
      }
      
      // Calculate total governance power
      let totalGovernancePower = 0;
      if (governanceAmounts.length > 0) {
        const uniqueAmounts = new Map();
        for (const item of governanceAmounts) {
          const key = `${item.account}-${item.offset}`;
          uniqueAmounts.set(key, item.amount);
        }
        
        totalGovernancePower = Array.from(uniqueAmounts.values())
          .reduce((sum, amount) => sum + amount, 0);
      }
      
      results[walletAddress] = totalGovernancePower;
      
      if (totalGovernancePower > 0) {
        console.log(`✅ ${totalGovernancePower.toLocaleString()} tokens`);
      } else {
        console.log(`○ No governance power`);
      }
    }
    
    return results;
    
  } catch (error) {
    console.error('Error in batch processing:', error.message);
    return {};
  }
}

// Update database with original working method results
async function updateDatabaseWithOriginalResults() {
  console.log('RESTORING ORIGINAL WORKING SCANNER RESULTS');
  console.log('==========================================');
  console.log('Using direct wallet buffer search method');
  console.log('');
  
  const results = await batchExtractGovernancePower();
  
  // Update database
  const client = await pool.connect();
  try {
    for (const [wallet, power] of Object.entries(results)) {
      await client.query(
        'UPDATE citizens SET governance_power = $1 WHERE wallet = $2',
        [power, wallet]
      );
    }
    
    console.log('\nDatabase updated with original working method results');
    
    // Display results
    const citizensWithPower = Object.entries(results)
      .filter(([wallet, power]) => power > 0)
      .sort((a, b) => b[1] - a[1]);
    
    console.log('\nCITIZENS WITH GOVERNANCE POWER (ORIGINAL METHOD):');
    console.log('=================================================');
    
    citizensWithPower.forEach(([wallet, power], index) => {
      console.log(`${index + 1}. ${wallet}: ${power.toLocaleString()} ISLAND`);
    });
    
    const totalPower = Object.values(results).reduce((sum, power) => sum + power, 0);
    
    console.log('\nSUMMARY:');
    console.log(`Citizens with governance power: ${citizensWithPower.length}/20`);
    console.log(`Total governance power: ${totalPower.toLocaleString()} ISLAND`);
    
    // Test specific wallets
    const fgv1Power = results['Fgv1zrwB6VF3jc45PaNT5t9AnSsJrwb8r7aMNip5fRY1'] || 0;
    const whale4Power = results['4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4'] || 0;
    
    console.log('\nKEY WALLET VALIDATION:');
    console.log(`Fgv1zrwB6VF3jc45PaNT5t9AnSsJrwb8r7aMNip5fRY1: ${fgv1Power.toLocaleString()} ISLAND`);
    console.log(`4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4: ${whale4Power.toLocaleString()} ISLAND`);
    
    if (fgv1Power >= 200000) {
      console.log('✅ Fgv1 200k+ detection restored');
    } else {
      console.log('❌ Fgv1 detection still missing');
    }
    
    return results;
    
  } finally {
    client.release();
  }
}

// Test individual wallets first
async function testKeyWallets() {
  console.log('TESTING KEY WALLETS WITH ORIGINAL METHOD');
  console.log('=========================================');
  
  const testWallets = [
    'Fgv1zrwB6VF3jc45PaNT5t9AnSsJrwb8r7aMNip5fRY1',
    '4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4',
    '7pPJt2xoEoPy8x8Hf2D6U6oLfNa5uKmHHRwkENVoaxmA'
  ];
  
  for (const wallet of testWallets) {
    console.log(`\nTesting ${wallet.substring(0, 8)}...`);
    const power = await extractGovernancePowerForWallet(wallet);
    console.log(`Result: ${power.toLocaleString()} ISLAND`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  testKeyWallets()
    .then(() => updateDatabaseWithOriginalResults())
    .catch(console.error);
}