/**
 * Quick Citizens Governance Test - Optimized Version
 * Loads VSR accounts once and tests all citizens efficiently
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const { Pool } = require('pg');

const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');

async function quickTestAllCitizens() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL
  });

  try {
    console.log('🚀 Quick governance power test for all citizens...\n');
    
    // Get all citizens
    const citizensResult = await pool.query(`
      SELECT wallet, COALESCE(nickname, 'No nickname') as nickname 
      FROM citizens 
      ORDER BY nickname
    `);
    
    const citizens = citizensResult.rows;
    console.log(`Testing ${citizens.length} citizens\n`);
    
    // Load VSR accounts once
    console.log('Loading all VSR accounts from blockchain...');
    const connection = new Connection(process.env.HELIUS_RPC_URL || 'https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00');
    const allVSRAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID);
    console.log(`Loaded ${allVSRAccounts.length} VSR accounts\n`);
    
    const results = [];
    
    // Process each citizen
    for (const citizen of citizens) {
      try {
        const walletPubkey = new PublicKey(citizen.wallet);
        const walletBuffer = walletPubkey.toBuffer();
        
        let totalGovernancePower = 0;
        let accountsFound = 0;
        
        // Search through VSR accounts for this wallet
        for (const account of allVSRAccounts) {
          try {
            const data = account.account.data;
            
            // Check if wallet is referenced in this account
            let walletFound = false;
            for (let offset = 0; offset <= data.length - 32; offset += 8) {
              if (data.subarray(offset, offset + 32).equals(walletBuffer)) {
                walletFound = true;
                break;
              }
            }
            
            if (!walletFound) continue;
            
            accountsFound++;
            
            // Extract governance power from proven offsets
            let maxAccountPower = 0;
            const governanceOffsets = [104, 112];
            
            for (const offset of governanceOffsets) {
              if (offset + 8 <= data.length) {
                try {
                  const value = Number(data.readBigUInt64LE(offset)) / 1e6;
                  if (value > 1000 && value < 50000000) {
                    maxAccountPower = Math.max(maxAccountPower, value);
                  }
                } catch (error) {
                  // Skip invalid data
                }
              }
            }
            
            if (maxAccountPower > 0) {
              totalGovernancePower += maxAccountPower;
            }
            
          } catch (error) {
            // Skip problematic accounts
          }
        }
        
        results.push({
          nickname: citizen.nickname,
          wallet: citizen.wallet,
          governancePower: totalGovernancePower,
          vsrAccounts: accountsFound
        });
        
        if (totalGovernancePower > 0) {
          console.log(`✅ ${citizen.nickname}: ${totalGovernancePower.toLocaleString()} ISLAND (${accountsFound} VSR accounts)`);
        } else {
          console.log(`⭕ ${citizen.nickname}: No governance power`);
        }
        
      } catch (error) {
        console.error(`❌ ${citizen.nickname}: Error - ${error.message}`);
        results.push({
          nickname: citizen.nickname,
          wallet: citizen.wallet,
          governancePower: 0,
          vsrAccounts: 0,
          error: error.message
        });
      }
    }
    
    // Summary
    console.log('\n📊 FINAL GOVERNANCE POWER SUMMARY');
    console.log('='.repeat(60));
    
    results.sort((a, b) => b.governancePower - a.governancePower);
    
    let totalPower = 0;
    let citizensWithPower = 0;
    
    results.forEach(result => {
      if (result.governancePower > 0) {
        console.log(`${result.nickname.padEnd(20)} | ${result.governancePower.toLocaleString().padStart(15)} ISLAND`);
        totalPower += result.governancePower;
        citizensWithPower++;
      }
    });
    
    console.log('='.repeat(60));
    console.log(`Citizens with Power: ${citizensWithPower}/${results.length}`);
    console.log(`Total Power: ${totalPower.toLocaleString()} ISLAND`);
    console.log(`Average Power: ${citizensWithPower > 0 ? Math.round(totalPower / citizensWithPower).toLocaleString() : 0} ISLAND`);
    
  } catch (error) {
    console.error('Error in governance test:', error);
  } finally {
    await pool.end();
  }
}

quickTestAllCitizens();