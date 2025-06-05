/**
 * Investigate citizen withdrawal discrepancy
 * Decode raw VSR account data to understand current state
 */

import { Connection, PublicKey } from '@solana/web3.js';
import { config } from 'dotenv';

config();

async function investigateWithdrawal() {
  console.log('INVESTIGATING CITIZEN WITHDRAWAL DISCREPANCY');
  console.log('============================================');
  
  const walletAddress = 'Fywb7YDCXxtD7pNKThJ36CAtVe23dEeEPf7HqKzJs1VG';
  const vsrAccount = 'CUmwUPKCZTHQ8MUPmB7CRyDNwTAjEe5iojkqyyFDoGFY';
  
  console.log(`Wallet: ${walletAddress}`);
  console.log(`VSR Account: ${vsrAccount}`);
  
  // Connect to multiple RPC endpoints to verify data
  const connections = [
    new Connection('https://api.mainnet-beta.solana.com'),
    new Connection(process.env.HELIUS_RPC_URL)
  ];
  
  for (let i = 0; i < connections.length; i++) {
    const connection = connections[i];
    const rpcName = i === 0 ? 'Official Solana RPC' : 'Helius RPC';
    
    console.log(`\n--- ${rpcName} ---`);
    
    try {
      const accountInfo = await connection.getAccountInfo(new PublicKey(vsrAccount));
      
      if (!accountInfo) {
        console.log('❌ Account not found');
        continue;
      }
      
      console.log(`✅ Account exists - ${accountInfo.data.length} bytes`);
      console.log(`Owner: ${accountInfo.owner.toBase58()}`);
      console.log(`Lamports: ${accountInfo.lamports}`);
      
      // Check if account has been closed/zeroed
      const isZeroed = accountInfo.data.every(byte => byte === 0);
      console.log(`Is account zeroed: ${isZeroed}`);
      
      if (!isZeroed) {
        // Parse deposits manually
        const data = accountInfo.data;
        
        // VSR Voter struct offsets:
        // 8-40: registrar
        // 40-72: authority  
        // 72: voter_bump
        // 73: voter_weight_record_bump
        // 74-82: voter_weight (u64)
        // 82+: deposits (32 entries × 105 bytes each)
        
        const authority = new PublicKey(data.slice(40, 72));
        const voterWeight = data.readBigUInt64LE(74);
        
        console.log(`Authority: ${authority.toBase58()}`);
        console.log(`Voter Weight: ${voterWeight.toString()}`);
        
        // Check deposits
        let activeDeposits = 0;
        let totalAmount = 0;
        
        for (let i = 0; i < 32; i++) {
          const depositOffset = 82 + (i * 105);
          
          if (data.length < depositOffset + 105) break;
          
          const isUsed = data[depositOffset] === 1;
          if (!isUsed) continue;
          
          // Read deposit amount (u64 at offset +1)
          const amount = Number(data.readBigUInt64LE(depositOffset + 1)) / 1e6;
          
          if (amount > 0) {
            activeDeposits++;
            totalAmount += amount;
            console.log(`  Deposit ${i}: ${amount.toLocaleString()} ISLAND`);
          }
        }
        
        console.log(`Active deposits: ${activeDeposits}`);
        console.log(`Total deposited: ${totalAmount.toLocaleString()} ISLAND`);
        
        // Check account slot/timestamp
        const slot = await connection.getSlot();
        console.log(`Current slot: ${slot}`);
        
      } else {
        console.log('✅ Account data is completely zeroed - withdrawal completed');
      }
      
    } catch (error) {
      console.error(`❌ Error with ${rpcName}: ${error.message}`);
    }
  }
  
  // Also check the citizen's regular token balance
  console.log('\n--- CHECKING REGULAR TOKEN BALANCE ---');
  
  try {
    const connection = new Connection(process.env.HELIUS_RPC_URL);
    const walletPubkey = new PublicKey(walletAddress);
    const islandMint = new PublicKey('Ds52CDgqdWbTWsua1hgT3AuSSy4FNx2Ezge1br3jQ14a');
    
    // Get token accounts
    const tokenAccounts = await connection.getTokenAccountsByOwner(walletPubkey, {
      mint: islandMint
    });
    
    if (tokenAccounts.value.length > 0) {
      for (const tokenAccount of tokenAccounts.value) {
        const accountInfo = await connection.getAccountInfo(tokenAccount.pubkey);
        
        if (accountInfo && accountInfo.data.length >= 64) {
          // Parse token account data
          const amount = Number(accountInfo.data.readBigUInt64LE(64)) / 1e6;
          console.log(`Token Account ${tokenAccount.pubkey.toBase58()}: ${amount.toLocaleString()} ISLAND`);
        }
      }
    } else {
      console.log('No ISLAND token accounts found');
    }
    
  } catch (error) {
    console.error(`❌ Error checking token balance: ${error.message}`);
  }
}

// Run investigation
investigateWithdrawal().catch(console.error);