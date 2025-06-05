/**
 * Investigate isUsed patterns across multiple VSR accounts
 * Find the correct way to identify stale vs active deposits
 */

import { Connection, PublicKey } from '@solana/web3.js';

const connection = new Connection('https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00');

// Test wallets with known governance power
const testWallets = [
  { name: 'GintoniK', wallet: 'CinHb6Xt2PnqKUkmhRo9hwUkixCcsH1uviuQqaTxwT9i', vsrAccount: '6yujo5tRQNZrh6upsm2MnAHv1LrLYVjKnDtLbHR4rwhr' },
  { name: 'DeanMachine', wallet: '3PKhzE9wuEkGPHu2sNCvG86xNtDJduAcyBPXpE6cSNt', vsrAccount: 'DqH7YkHB2MKT936DEDw1N7d14MGFbg5eUQHSVT2yuNsW' },
  { name: 'legend', wallet: 'Fywb7YDCXxtD7pNKThJ36CAtVe23dEeEPf7HqKzJs1VG', vsrAccount: null } // Will find
];

async function investigateISUsedPatterns() {
  console.log('🔍 Investigating isUsed patterns across VSR accounts\n');
  
  for (const test of testWallets) {
    console.log(`=== ${test.name} ===`);
    
    try {
      let vsrAccount = test.vsrAccount;
      
      // Find VSR account if not provided
      if (!vsrAccount) {
        const programId = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');
        const accounts = await connection.getProgramAccounts(programId, {
          filters: [
            { memcmp: { offset: 8, bytes: test.wallet } }
          ]
        });
        
        if (accounts.length > 0) {
          vsrAccount = accounts[0].pubkey.toString();
          console.log(`Found VSR account: ${vsrAccount}`);
        } else {
          console.log('No VSR accounts found\n');
          continue;
        }
      }
      
      const accountInfo = await connection.getAccountInfo(new PublicKey(vsrAccount));
      const data = accountInfo.data;
      
      console.log(`VSR Account: ${vsrAccount}`);
      console.log(`Data length: ${data.length} bytes`);
      
      // Check known deposit offsets
      const offsets = [104, 112, 184, 264, 344, 424];
      
      for (const offset of offsets) {
        if (offset + 8 <= data.length) {
          const amount = Number(data.readBigUInt64LE(offset)) / 1e6;
          
          if (amount >= 1000) {
            console.log(`\nOffset ${offset}: ${amount.toLocaleString()} ISLAND`);
            
            // Check multiple potential flag positions
            const flagPositions = [
              { pos: offset - 8, name: 'before-8' },
              { pos: offset - 4, name: 'before-4' },
              { pos: offset + 8, name: 'after-8' },
              { pos: offset + 16, name: 'after-16' },
              { pos: offset + 20, name: 'after-20' }
            ];
            
            for (const flag of flagPositions) {
              if (flag.pos >= 0 && flag.pos < data.length) {
                const value = data[flag.pos];
                console.log(`  ${flag.name}: ${value} (0x${value.toString(16).padStart(2, '0')})`);
              }
            }
            
            // Show context bytes around the amount
            const start = Math.max(0, offset - 8);
            const end = Math.min(data.length, offset + 24);
            const hexBytes = [];
            for (let i = start; i < end; i++) {
              hexBytes.push(data[i].toString(16).padStart(2, '0'));
            }
            console.log(`  Context: ${hexBytes.join(' ')}`);
          }
        }
      }
      
    } catch (error) {
      console.error(`Error processing ${test.name}:`, error.message);
    }
    
    console.log('\n');
  }
}

investigateISUsedPatterns();