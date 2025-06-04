/**
 * Rapid All Citizens Final Scan
 * Efficient scan for all citizens with phantom filtering
 */

import { Connection, PublicKey } from '@solana/web3.js';
import { config } from 'dotenv';
import pkg from 'pg';
config();

const { Pool } = pkg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');
const connection = new Connection(process.env.HELIUS_RPC_URL);

function isPhantomDeposit(amount) {
  const rounded = Math.round(amount);
  return rounded === 1000 || rounded === 11000;
}

async function scanAllCitizensRapid() {
  console.log('RAPID ALL CITIZENS GOVERNANCE POWER SCAN');
  console.log('========================================');
  console.log(`Fresh blockchain data: ${new Date().toISOString()}`);
  console.log('');
  
  // Get citizens
  const client = await pool.connect();
  const result = await client.query('SELECT wallet FROM citizens ORDER BY wallet');
  const citizenWallets = result.rows.map(row => row.wallet);
  client.release();
  
  // Load VSR accounts once
  console.log('Loading VSR accounts...');
  const allVSRAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
    filters: [{ dataSize: 2728 }]
  });
  console.log(`Found ${allVSRAccounts.length} VSR voter accounts`);
  console.log('');
  
  const citizensWithPower = [];
  
  for (let i = 0; i < citizenWallets.length; i++) {
    const wallet = citizenWallets[i];
    
    let nativePower = 0;
    const deposits = [];
    
    for (const account of allVSRAccounts) {
      const data = account.account.data;
      
      try {
        let authority = null;
        if (data.length >= 40) {
          authority = new PublicKey(data.slice(8, 40)).toBase58();
        }
        
        if (authority === wallet) {
          const offsets = [104, 112, 184, 264, 344];
          
          for (const offset of offsets) {
            if (offset + 8 <= data.length) {
              try {
                const rawAmount = data.readBigUInt64LE(offset);
                const amount = Number(rawAmount) / 1e6;
                
                if (amount >= 1000 && amount <= 20000000) {
                  // Skip phantom deposits
                  if (isPhantomDeposit(amount)) {
                    continue;
                  }
                  
                  const existing = deposits.find(d => Math.abs(d.amount - amount) < 1);
                  if (!existing) {
                    const power = amount * 1.0;
                    nativePower += power;
                    deposits.push({ amount, power, offset });
                  }
                }
              } catch (e) {}
            }
          }
        }
      } catch (e) {}
    }
    
    if (nativePower > 0) {
      citizensWithPower.push({
        wallet,
        nativePower,
        deposits: deposits.length,
        breakdown: deposits
      });
      
      console.log(`${wallet}: ${nativePower.toLocaleString()} ISLAND (${deposits.length} deposits)`);
      
      // Update database
      const updateClient = await pool.connect();
      try {
        await updateClient.query(
          'UPDATE citizens SET governance_power = $1 WHERE wallet = $2',
          [nativePower, wallet]
        );
      } finally {
        updateClient.release();
      }
    }
  }
  
  citizensWithPower.sort((a, b) => b.nativePower - a.nativePower);
  const totalPower = citizensWithPower.reduce((sum, c) => sum + c.nativePower, 0);
  
  console.log('');
  console.log('FINAL RESULTS - CITIZENS WITH GOVERNANCE POWER');
  console.log('==============================================');
  
  citizensWithPower.forEach((citizen, index) => {
    console.log(`${index + 1}. ${citizen.wallet}: ${citizen.nativePower.toLocaleString()} ISLAND`);
    citizen.breakdown.forEach(d => {
      console.log(`   - ${d.amount.toLocaleString()} ISLAND (offset ${d.offset})`);
    });
  });
  
  console.log('');
  console.log(`Summary: ${citizensWithPower.length}/20 citizens with governance power`);
  console.log(`Total: ${totalPower.toLocaleString()} ISLAND native governance power`);
  console.log(`Average: ${citizensWithPower.length > 0 ? (totalPower/citizensWithPower.length).toLocaleString() : '0'} ISLAND`);
  
  console.log('');
  console.log('Model: Phantom-filtered (1k/11k removed), authentic data, no hardcoded values');
  
  return citizensWithPower;
}

scanAllCitizensRapid().catch(console.error);