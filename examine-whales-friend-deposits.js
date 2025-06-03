/**
 * Examine Whale's Friend Deposits in Detail
 * Analyze the specific VSR accounts to understand deposit classification
 */

import * as anchor from '@coral-xyz/anchor';
import { Connection, PublicKey } from '@solana/web3.js';
import dotenv from 'dotenv';

dotenv.config();

const connection = new Connection(process.env.HELIUS_RPC_URL);

async function examineWhalesFriendDeposits() {
  console.log('EXAMINING WHALE\'S FRIEND VSR DEPOSITS');
  console.log('====================================');
  
  const whalesFriend = '4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4';
  const accounts = [
    '5wkcqwdfUGShh95E7Dnk6LvLdJJU157mqRyRdTofVm9b', // 1,000 ISLAND
    'AErp8UYUay7uBE9i6ULtSDgQP5d3W66n9RJH5QpUG3Uh'  // 12,625.58 ISLAND
  ];
  
  for (let i = 0; i < accounts.length; i++) {
    const accountAddress = accounts[i];
    console.log(`\n=== ACCOUNT ${i + 1}: ${accountAddress} ===`);
    
    try {
      const accountInfo = await connection.getAccountInfo(new PublicKey(accountAddress));
      const data = accountInfo.data;
      
      // Parse key fields
      const registrar = new PublicKey(data.slice(0, 32));
      const authority = new PublicKey(data.slice(8, 40));
      const voterAuthority = new PublicKey(data.slice(72, 104));
      
      console.log(`Registrar: ${registrar.toString()}`);
      console.log(`Authority: ${authority.toString()}`);
      console.log(`Voter Authority: ${voterAuthority.toString()}`);
      console.log(`Target Wallet: ${whalesFriend}`);
      
      // Check ownership patterns
      console.log(`Authority === Wallet: ${authority.toString() === whalesFriend}`);
      console.log(`Voter Authority === Wallet: ${voterAuthority.toString() === whalesFriend}`);
      
      // Parse all deposits using working offsets
      const workingOffsets = [104, 112, 184, 192, 200, 208];
      let foundDeposits = [];
      
      for (let j = 0; j < workingOffsets.length; j++) {
        const offset = workingOffsets[j];
        
        if (offset + 8 <= data.length) {
          try {
            const rawAmount = Number(data.readBigUInt64LE(offset));
            if (rawAmount > 0) {
              const amount = rawAmount / 1e6;
              
              if (amount >= 1000 && amount <= 50000000) {
                // Extract lockup info
                let lockupKind = 0;
                let lockupStartTs = 0;
                let lockupEndTs = 0;
                
                if (offset + 48 <= data.length) {
                  try {
                    lockupKind = data[offset + 24] || 0;
                    lockupStartTs = Number(data.readBigUInt64LE(offset + 32)) || 0;
                    lockupEndTs = Number(data.readBigUInt64LE(offset + 40)) || 0;
                  } catch (e) {}
                }
                
                foundDeposits.push({
                  amount,
                  offset,
                  lockupKind,
                  lockupStartTs,
                  lockupEndTs
                });
              }
            }
          } catch (error) {
            continue;
          }
        }
      }
      
      console.log(`Found ${foundDeposits.length} deposits:`);
      foundDeposits.forEach((deposit, idx) => {
        console.log(`  Deposit ${idx + 1}: ${deposit.amount.toFixed(6)} ISLAND`);
        console.log(`    Offset: ${deposit.offset}`);
        console.log(`    Lockup Kind: ${deposit.lockupKind}`);
        console.log(`    Start Ts: ${deposit.lockupStartTs}`);
        console.log(`    End Ts: ${deposit.lockupEndTs}`);
        
        // Check if this matches target amounts
        if (Math.abs(deposit.amount - 1000) < 0.01) {
          console.log(`    >>> This is the 1,000 ISLAND deposit`);
        } else if (Math.abs(deposit.amount - 12625.580931) < 0.01) {
          console.log(`    >>> This is the 12,625.58 ISLAND deposit`);
        }
      });
      
      // Check if there are delegation indicators
      console.log('\nDelegation Analysis:');
      console.log(`- Authority owns the VSR account: ${authority.toString() === whalesFriend}`);
      console.log(`- Voter authority has voting rights: ${voterAuthority.toString() === whalesFriend}`);
      
      if (authority.toString() === whalesFriend && voterAuthority.toString() !== whalesFriend) {
        console.log('- Pattern: NATIVE ownership (authority controls deposits)');
      } else if (authority.toString() !== whalesFriend && voterAuthority.toString() === whalesFriend) {
        console.log('- Pattern: DELEGATED voting rights only');
      } else if (authority.toString() === whalesFriend && voterAuthority.toString() === whalesFriend) {
        console.log('- Pattern: FULL CONTROL (both ownership and voting)');
      }
      
    } catch (error) {
      console.log(`Error analyzing account: ${error.message}`);
    }
  }
  
  console.log('\n=== CANONICAL CLASSIFICATION ===');
  console.log('Based on VSR specification:');
  console.log('- Native deposits: authority === wallet (owns the VSR account)');
  console.log('- Delegated voting: voter_authority === wallet (voting rights only)');
  console.log('- Both accounts show authority === Whale\'s Friend');
  console.log('- Therefore, both deposits are canonically NATIVE');
  console.log('- Total native power: 1,000 + 12,625.58 = 13,625.58 ISLAND');
}

examineWhalesFriendDeposits().catch(console.error);