/**
 * Analyze VSR Ownership Patterns
 * Understand the canonical relationship between authority and voter_authority
 */

import * as anchor from '@coral-xyz/anchor';
import { Connection, PublicKey } from '@solana/web3.js';
import dotenv from 'dotenv';

dotenv.config();

const connection = new Connection(process.env.HELIUS_RPC_URL);
const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');

async function analyzeOwnershipPatterns() {
  console.log('ANALYZING VSR OWNERSHIP PATTERNS');
  console.log('================================');
  
  // Test wallets with known VSR power
  const testWallets = [
    '4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4', // Whale's Friend
    '7pPJt2xoEoPy8x8Hf2D6U6oLfNa5uKmHHRwkENVoaxmA', // Takisoul
    '3PKhzE9wuEkGPHHu2sNCvG86xNtDJduAcyBPXpE6cSNt'  // Top holder
  ];
  
  const accounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
    filters: [{ dataSize: 2728 }]
  });
  
  console.log(`Analyzing ${accounts.length} VSR accounts...\n`);
  
  for (const walletAddress of testWallets) {
    console.log(`=== WALLET: ${walletAddress.slice(0, 8)}... ===`);
    const walletPubkey = new PublicKey(walletAddress);
    
    let authorityMatches = 0;
    let voterAuthorityMatches = 0;
    let bothMatch = 0;
    let foundAccounts = [];
    
    for (const account of accounts) {
      try {
        const data = account.account.data;
        const authority = new PublicKey(data.slice(8, 40));
        const voterAuthority = new PublicKey(data.slice(72, 104));
        
        const authMatches = authority.equals(walletPubkey);
        const voterMatches = voterAuthority.equals(walletPubkey);
        
        if (authMatches) authorityMatches++;
        if (voterMatches) voterAuthorityMatches++;
        if (authMatches && voterMatches) bothMatch++;
        
        if (authMatches || voterMatches) {
          foundAccounts.push({
            account: account.pubkey.toString(),
            authority: authority.toString(),
            voterAuthority: voterAuthority.toString(),
            authMatches,
            voterMatches,
            pattern: authMatches && voterMatches ? 'BOTH_MATCH' : 
                    authMatches ? 'AUTH_ONLY' : 'VOTER_ONLY'
          });
        }
        
      } catch (error) {
        continue;
      }
    }
    
    console.log(`Authority matches: ${authorityMatches}`);
    console.log(`Voter authority matches: ${voterAuthorityMatches}`);
    console.log(`Both match: ${bothMatch}`);
    console.log(`Total related accounts: ${foundAccounts.length}`);
    
    console.log('\nAccount details:');
    foundAccounts.forEach((acc, i) => {
      console.log(`  ${i + 1}. ${acc.account}`);
      console.log(`     Authority: ${acc.authority.slice(0, 8)}...`);
      console.log(`     Voter Auth: ${acc.voterAuthority.slice(0, 8)}...`);
      console.log(`     Pattern: ${acc.pattern}`);
    });
    
    console.log('\n' + '-'.repeat(50) + '\n');
  }
  
  console.log('PATTERNS ANALYSIS:');
  console.log('- AUTH_ONLY: Wallet owns the VSR account (native deposits)');
  console.log('- VOTER_ONLY: Wallet has voting rights but not ownership (delegated)');
  console.log('- BOTH_MATCH: Wallet owns and votes (full native control)');
  console.log('\nFor native power calculation, use AUTH_ONLY + BOTH_MATCH patterns');
}

analyzeOwnershipPatterns().catch(console.error);