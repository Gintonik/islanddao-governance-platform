/**
 * Debug Delegation Analysis
 * Investigates specific wallets to understand delegation structures
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const BN = require('bn.js');

// Configuration
const connection = new Connection(process.env.HELIUS_RPC_URL || 'https://api.mainnet-beta.solana.com');
const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');

/**
 * Parse authority and voterAuthority from Voter account
 */
function parseVoterAuthorities(data) {
  try {
    // Standard Voter account layout:
    // 8 bytes: discriminator
    // 32 bytes: registrar (offset 8)
    // 32 bytes: authority (offset 40)
    // 32 bytes: voterAuthority (offset 72)
    
    if (data.length < 104) return null;
    
    const authority = new PublicKey(data.slice(40, 72)).toBase58();
    const voterAuthority = new PublicKey(data.slice(72, 104)).toBase58();
    
    return { authority, voterAuthority };
  } catch (error) {
    return null;
  }
}

/**
 * Analyze delegation patterns for specific wallets
 */
async function analyzeDelegationPatterns(targetWallets) {
  console.log('🔍 DELEGATION PATTERN ANALYSIS');
  console.log('==============================');
  
  // Load all Voter accounts
  console.log('📡 Loading all Voter accounts...');
  const allVoterAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
    filters: [
      { dataSize: 3312 } // Voter account size
    ]
  });
  
  console.log(`   Found ${allVoterAccounts.length} Voter accounts\n`);
  
  for (const targetWallet of targetWallets) {
    console.log(`🔍 Analyzing ${targetWallet}:`);
    
    let foundAsAuthority = 0;
    let foundAsVoterAuthority = 0;
    let delegationsToWallet = 0;
    let delegationsFromWallet = 0;
    
    for (const { pubkey, account } of allVoterAccounts) {
      const data = account.data;
      const authorities = parseVoterAuthorities(data);
      
      if (!authorities) continue;
      
      const { authority, voterAuthority } = authorities;
      
      // Check if wallet appears as authority (owns deposits)
      if (authority === targetWallet) {
        foundAsAuthority++;
        
        // Check if this wallet has delegated to someone else
        if (voterAuthority !== targetWallet) {
          delegationsFromWallet++;
          console.log(`   📤 Delegates TO: ${voterAuthority.substring(0,8)}... (account: ${pubkey.toBase58().substring(0,8)}...)`);
        }
      }
      
      // Check if wallet appears as voterAuthority (receives delegation)
      if (voterAuthority === targetWallet) {
        foundAsVoterAuthority++;
        
        // Check if this is a delegation FROM someone else
        if (authority !== targetWallet) {
          delegationsToWallet++;
          console.log(`   📥 Receives FROM: ${authority.substring(0,8)}... (account: ${pubkey.toBase58().substring(0,8)}...)`);
        }
      }
    }
    
    console.log(`   📊 Summary:`);
    console.log(`      Authority in ${foundAsAuthority} accounts`);
    console.log(`      VoterAuthority in ${foundAsVoterAuthority} accounts`);
    console.log(`      Delegations TO wallet: ${delegationsToWallet}`);
    console.log(`      Delegations FROM wallet: ${delegationsFromWallet}`);
    console.log('');
  }
}

/**
 * Check VoterWeightRecord totals vs calculated deposits
 */
async function analyzeVWRDiscrepancies(targetWallets) {
  console.log('📊 VWR DISCREPANCY ANALYSIS');
  console.log('============================');
  
  for (const targetWallet of targetWallets) {
    console.log(`🔍 Analyzing ${targetWallet}:`);
    
    // Get VWR total
    const voterWeightRecords = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
      filters: [
        { dataSize: 176 },
        { memcmp: { offset: 72, bytes: targetWallet } }
      ]
    });
    
    let vwrTotal = 0;
    for (const { account } of voterWeightRecords) {
      const powerRaw = Number(account.data.readBigUInt64LE(104));
      vwrTotal += powerRaw / 1e6;
    }
    
    // Get calculated deposits (simplified - just count owned accounts)
    const ownedAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
      filters: [
        { dataSize: 3312 },
        { memcmp: { offset: 40, bytes: targetWallet } }
      ]
    });
    
    console.log(`   📊 VWR Total: ${vwrTotal.toLocaleString()} ISLAND`);
    console.log(`   📊 Owned Voter accounts: ${ownedAccounts.length}`);
    console.log(`   📊 Discrepancy suggests: ${vwrTotal > 50000 ? 'Possible mixed power' : 'Simple ownership'}`);
    console.log('');
  }
}

/**
 * Main analysis function
 */
async function runDelegationAnalysis() {
  const testWallets = [
    'kruHL3zJ1Mcbdibsna5xM6yMp7PZZ4BsNTpj2UMgvZC', // Expected: 31k native + 1.34M delegated
    '4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4', // Expected: 12k native + 4.19M delegated  
    'Fywb7YDCXxtD7pNKThJ36CAtVe23dEeEPf7HqKzJs1VG', // Expected: 3.36M native + 1.6M delegated
    '3PKhzE9wuEkGPHHu2sNCvG86xNtDJduAcyBPXpE6cSNt'  // Expected: 10.35M native + 1.27M delegated
  ];
  
  await analyzeDelegationPatterns(testWallets);
  await analyzeVWRDiscrepancies(testWallets);
}

// Run analysis
runDelegationAnalysis().catch(console.error);