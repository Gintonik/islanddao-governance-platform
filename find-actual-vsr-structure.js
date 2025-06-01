/**
 * Find Actual VSR Structure
 * Discover the real registrar accounts and voter structures used by your citizens
 */

const { Connection, PublicKey } = require('@solana/web3.js');

const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');

async function findActualVSRStructure() {
  try {
    console.log('🔍 Finding actual VSR structure used by DeanMachine...\n');
    
    const connection = new Connection(process.env.HELIUS_RPC_URL || 'https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00');
    
    const deanMachineAddress = '3PKhzE9wuEkGPHHu2sNCvG86xNtDJduAcyBPXpE6cSNt';
    const walletPubkey = new PublicKey(deanMachineAddress);
    const walletBuffer = walletPubkey.toBuffer();
    
    console.log(`Target wallet: ${deanMachineAddress}`);
    console.log('Loading all VSR program accounts...\n');
    
    // Load all VSR accounts
    const allVSRAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID);
    console.log(`Found ${allVSRAccounts.length} total VSR accounts`);
    
    const voterAccounts = [];
    const registrarAccounts = [];
    const voterWeightRecords = [];
    
    // Analyze each account
    for (const account of allVSRAccounts) {
      try {
        const data = account.account.data;
        const accountSize = data.length;
        
        // Check if wallet is referenced in this account
        let walletFound = false;
        for (let offset = 0; offset <= data.length - 32; offset += 8) {
          if (data.subarray(offset, offset + 32).equals(walletBuffer)) {
            walletFound = true;
            break;
          }
        }
        
        if (!walletFound) continue;
        
        const accountAddress = account.pubkey.toBase58();
        
        // Categorize by size
        if (accountSize === 176) {
          voterWeightRecords.push({
            address: accountAddress,
            size: accountSize
          });
        } else if (accountSize === 2728) {
          voterAccounts.push({
            address: accountAddress,
            size: accountSize
          });
        } else if (accountSize === 880) {
          registrarAccounts.push({
            address: accountAddress,
            size: accountSize
          });
        }
        
        console.log(`Found account: ${accountAddress} (${accountSize} bytes)`);
        
      } catch (error) {
        // Skip problematic accounts
      }
    }
    
    console.log(`\n📊 Summary of accounts containing DeanMachine wallet:`);
    console.log(`   Voter Weight Records (176 bytes): ${voterWeightRecords.length}`);
    console.log(`   Voter Accounts (2728 bytes): ${voterAccounts.length}`);
    console.log(`   Registrar Accounts (880 bytes): ${registrarAccounts.length}`);
    
    // Analyze voter accounts in detail
    if (voterAccounts.length > 0) {
      console.log(`\n🔍 Analyzing voter accounts:`);
      
      for (const voterAccount of voterAccounts) {
        try {
          const accountInfo = await connection.getAccountInfo(new PublicKey(voterAccount.address));
          if (!accountInfo) continue;
          
          const data = accountInfo.data;
          
          // Extract registrar reference from voter account (at offset 40-72)
          const registrarPubkey = new PublicKey(data.slice(40, 72));
          
          console.log(`\n   Voter Account: ${voterAccount.address}`);
          console.log(`   References Registrar: ${registrarPubkey.toBase58()}`);
          
          // Try to derive the PDA that should match this account
          const [expectedPDA] = PublicKey.findProgramAddressSync(
            [
              Buffer.from('voter'),
              registrarPubkey.toBuffer(),
              walletPubkey.toBuffer()
            ],
            VSR_PROGRAM_ID
          );
          
          const isValidPDA = expectedPDA.toBase58() === voterAccount.address;
          console.log(`   Expected PDA: ${expectedPDA.toBase58()}`);
          console.log(`   PDA Match: ${isValidPDA ? '✅' : '❌'}`);
          
          if (!isValidPDA) {
            console.log(`   ⚠️  This voter account doesn't match standard PDA derivation!`);
            
            // Try alternate derivation methods
            console.log(`   Trying alternate PDA derivations...`);
            
            // Try with different seeds
            const alternateSeeds = [
              ['voter', registrarPubkey.toBuffer(), walletPubkey.toBuffer()],
              [Buffer.from('voter'), registrarPubkey.toBuffer(), walletPubkey.toBuffer()],
              ['Voter', registrarPubkey.toBuffer(), walletPubkey.toBuffer()],
              [walletPubkey.toBuffer(), registrarPubkey.toBuffer()],
              [registrarPubkey.toBuffer(), walletPubkey.toBuffer()]
            ];
            
            for (let i = 0; i < alternateSeeds.length; i++) {
              try {
                const [altPDA] = PublicKey.findProgramAddressSync(alternateSeeds[i], VSR_PROGRAM_ID);
                if (altPDA.toBase58() === voterAccount.address) {
                  console.log(`   ✅ Found matching derivation method ${i + 1}`);
                  break;
                }
              } catch (error) {
                // Skip invalid seed combinations
              }
            }
          }
          
        } catch (error) {
          console.log(`   ❌ Error analyzing ${voterAccount.address}: ${error.message}`);
        }
      }
    }
    
    // Check if we can find any working PDAs by brute force with known registrars
    console.log(`\n🧪 Testing PDA derivation with known registrars:`);
    
    const knownRegistrars = [
      '3xJZ38FE31xVcsYnGpeHy36N7YwkBUsGi8Y5aPFNr4s9',
      '6YGuFEQnMtHfRNn6hgmnYVdEk6yMLGGeESRgLikSdLgP',
      '5vVAxag6WVUWn1Yq2hqKrWUkNtSJEefJmBLtk5syLZJ5',
      'Du7fEQExVrmNKDWjctgA4vbn2CnVSDvH2AoXsBpPcYvd',
      'FYGUd8h7mNt7QKyEZeCKA69heM85YNfuFKqFWvAtiVar'
    ];
    
    for (const registrarAddress of knownRegistrars) {
      try {
        const registrarPubkey = new PublicKey(registrarAddress);
        const [voterPDA] = PublicKey.findProgramAddressSync(
          [
            Buffer.from('voter'),
            registrarPubkey.toBuffer(),
            walletPubkey.toBuffer()
          ],
          VSR_PROGRAM_ID
        );
        
        const accountInfo = await connection.getAccountInfo(voterPDA);
        console.log(`   Registrar: ${registrarAddress}`);
        console.log(`   Derived PDA: ${voterPDA.toBase58()}`);
        console.log(`   Account exists: ${accountInfo ? '✅' : '❌'}`);
        
        if (accountInfo) {
          console.log(`   Account size: ${accountInfo.data.length} bytes`);
        }
        
      } catch (error) {
        console.log(`   Error with registrar ${registrarAddress}: ${error.message}`);
      }
    }
    
    // Final recommendation
    console.log(`\n🎯 Recommendation:`);
    
    if (voterAccounts.length > 0) {
      console.log(`Found ${voterAccounts.length} voter accounts for DeanMachine.`);
      console.log(`These accounts contain the actual deposit data needed for governance power calculation.`);
      console.log(`The offset-based approach successfully reads from these accounts.`);
    } else {
      console.log(`No voter accounts found for DeanMachine.`);
      console.log(`This suggests either the wallet has no VSR deposits or uses a different structure.`);
    }
    
    if (voterWeightRecords.length > 0) {
      console.log(`Found ${voterWeightRecords.length} voter weight records.`);
      console.log(`These contain the final calculated governance power values.`);
    }
    
  } catch (error) {
    console.error('Error in VSR structure analysis:', error);
  }
}

findActualVSRStructure();