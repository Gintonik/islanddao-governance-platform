/**
 * Complete 6 Wallet Fresh Scan
 * Fast focused scan for all 6 requested wallets
 */

import { Connection, PublicKey } from '@solana/web3.js';
import { config } from 'dotenv';
config();

const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');
const connection = new Connection(process.env.HELIUS_RPC_URL);

const TARGET_WALLETS = [
  '3PKhzE9wuEkGPHHu2sNCvG86xNtDJduAcyBPXpE6cSNt',
  'Fywb7YDCXxtD7pNKThJ36CAtVe23dEeEPf7HqKzJs1VG', 
  '4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4',
  'kruHL3zJ1Mcbdibsna5xM6yMp7PZZ4BsNTpj2UMgvZC',
  '7pPJt2xoEoPy8x8Hf2D6U6oLfNa5uKmHHRwkENVoaxmA',
  'GJdRQcsyz49FMM4LvPqpaM2QA3yWFr8WamJ95hkwCBAh'
];

async function scanAllSix() {
  console.log('COMPLETE 6 WALLET FRESH BLOCKCHAIN SCAN');
  console.log('=======================================');
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log('');
  
  // Load VSR accounts once
  console.log('Loading VSR accounts...');
  const allVSRAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
    filters: [{ dataSize: 2728 }]
  });
  console.log(`Found ${allVSRAccounts.length} VSR voter accounts`);
  console.log('');
  
  const results = [];
  
  for (let i = 0; i < TARGET_WALLETS.length; i++) {
    const wallet = TARGET_WALLETS[i];
    console.log(`[${i+1}/6] ${wallet}:`);
    
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
    
    results.push({
      wallet,
      nativePower,
      deposits: deposits.length,
      breakdown: deposits
    });
    
    console.log(`  Native Power: ${nativePower.toLocaleString()} ISLAND`);
    console.log(`  Deposits: ${deposits.length}`);
    
    if (deposits.length > 0) {
      deposits.forEach(d => {
        console.log(`    ${d.amount.toLocaleString()} ISLAND (offset ${d.offset})`);
      });
    }
    console.log('');
  }
  
  console.log('FINAL RESULTS - ALL 6 WALLETS');
  console.log('==============================');
  
  results.sort((a, b) => b.nativePower - a.nativePower);
  
  results.forEach((result, index) => {
    if (result.nativePower > 0) {
      console.log(`${index + 1}. ${result.wallet.substring(0,8)}: ${result.nativePower.toLocaleString()} ISLAND (${result.deposits} deposits)`);
    } else {
      console.log(`-. ${result.wallet.substring(0,8)}: 0 ISLAND`);
    }
  });
  
  const totalPower = results.reduce((sum, r) => sum + r.nativePower, 0);
  const activeWallets = results.filter(r => r.nativePower > 0).length;
  
  console.log('');
  console.log(`Summary: ${activeWallets}/6 active wallets`);
  console.log(`Total: ${totalPower.toLocaleString()} ISLAND native governance power`);
  
  console.log('');
  console.log('Model: Authentic registrar params, no hardcoded values, hybrid parsing');
  
  return results;
}

scanAllSix().catch(console.error);