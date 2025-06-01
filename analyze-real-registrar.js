/**
 * Analyze Real Registrar Structure
 * Fetch actual registrar used by citizens and decode its structure
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const { AnchorProvider, Program } = require('@coral-xyz/anchor');

const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');

// Known registrars from DeanMachine's accounts
const KNOWN_REGISTRARS = [
  '3xJZ38FE31xVcsYnGpeHy36N7YwkBUsGi8Y5aPFNr4s9',
  '6YGuFEQnMtHfRNn6hgmnYVdEk6yMLGGeESRgLikSdLgP',
  '5vVAxag6WVUWn1Yq2hqKrWUkNtSJEefJmBLtk5syLZJ5',
  'Du7fEQExVrmNKDWjctgA4vbn2CnVSDvH2AoXsBpPcYvd',
  'FYGUd8h7mNt7QKyEZeCKA69heM85YNfuFKqFWvAtiVar'
];

// Simplified VSR IDL for registrar
const VSR_IDL = {
  version: "0.2.4",
  name: "voter_stake_registry",
  accounts: [
    {
      name: "registrar",
      type: {
        kind: "struct",
        fields: [
          { name: "governanceProgramId", type: "publicKey" },
          { name: "realm", type: "publicKey" },
          { name: "governingTokenMint", type: "publicKey" },
          { name: "votingMints", type: { vec: { defined: "VotingMintConfig" } } }
        ]
      }
    }
  ],
  types: [
    {
      name: "VotingMintConfig",
      type: {
        kind: "struct",
        fields: [
          { name: "mint", type: "publicKey" },
          { name: "grantAuthority", type: { option: "publicKey" } },
          { name: "baselineVoteWeightScaledFactor", type: "u64" },
          { name: "maxExtraLockupVoteWeightScaledFactor", type: "u64" },
          { name: "lockupSaturationSecs", type: "u64" },
          { name: "digitShift", type: "i8" }
        ]
      }
    }
  ]
};

function createDummyWallet() {
  return {
    publicKey: new PublicKey('11111111111111111111111111111112'),
    signTransaction: () => Promise.reject('Read-only wallet'),
    signAllTransactions: () => Promise.reject('Read-only wallet'),
  };
}

async function analyzeRealRegistrar() {
  try {
    console.log('🔍 Analyzing real registrar structures used by citizens...\n');
    
    const connection = new Connection(process.env.HELIUS_RPC_URL || 'https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00');
    const wallet = createDummyWallet();
    const provider = new AnchorProvider(connection, wallet, {});
    const program = new Program(VSR_IDL, VSR_PROGRAM_ID, provider);
    
    // Test each known registrar
    for (const registrarAddress of KNOWN_REGISTRARS) {
      try {
        console.log(`📋 Analyzing registrar: ${registrarAddress}`);
        
        const registrarPubkey = new PublicKey(registrarAddress);
        
        // Try Anchor deserialization first
        let registrarAccount = null;
        try {
          registrarAccount = await program.account.registrar.fetch(registrarPubkey);
          console.log('✅ Successfully decoded with Anchor');
        } catch (anchorError) {
          console.log(`❌ Anchor decode failed: ${anchorError.message}`);
          
          // Fall back to manual parsing
          const accountInfo = await connection.getAccountInfo(registrarPubkey);
          if (accountInfo) {
            console.log(`📏 Account size: ${accountInfo.data.length} bytes`);
            registrarAccount = parseRegistrarManually(accountInfo.data);
          }
        }
        
        if (registrarAccount) {
          console.log('📊 Registrar details:');
          console.log(`   Governance Program: ${registrarAccount.governanceProgramId || 'Unknown'}`);
          console.log(`   Realm: ${registrarAccount.realm || 'Unknown'}`);
          console.log(`   Governing Token Mint: ${registrarAccount.governingTokenMint || 'Unknown'}`);
          
          if (registrarAccount.votingMints && registrarAccount.votingMints.length > 0) {
            console.log(`   Voting Mints: ${registrarAccount.votingMints.length}`);
            
            registrarAccount.votingMints.forEach((mint, index) => {
              console.log(`\n   Voting Mint ${index}:`);
              console.log(`      Mint: ${mint.mint}`);
              console.log(`      Baseline Factor: ${mint.baselineVoteWeightScaledFactor}`);
              console.log(`      Max Extra Factor: ${mint.maxExtraLockupVoteWeightScaledFactor}`);
              console.log(`      Saturation Secs: ${mint.lockupSaturationSecs}`);
              console.log(`      Digit Shift: ${mint.digitShift}`);
              
              // Check if this is the ISLAND token
              if (mint.mint === '4SLdYJzqbRUzwKJSvBdoFiY24KjTMvKMCpWcBAdTQrby') {
                console.log(`      🏝️  THIS IS THE ISLAND TOKEN CONFIG!`);
              }
            });
          }
        }
        
        console.log(''); // Blank line between registrars
        
      } catch (error) {
        console.log(`❌ Error analyzing ${registrarAddress}: ${error.message}\n`);
      }
    }
    
  } catch (error) {
    console.error('Error in registrar analysis:', error);
  }
}

function parseRegistrarManually(data) {
  try {
    // Manual parsing of registrar structure
    let offset = 8; // Skip discriminator
    
    // Read governance program ID (32 bytes)
    const governanceProgramId = new PublicKey(data.slice(offset, offset + 32)).toBase58();
    offset += 32;
    
    // Read realm (32 bytes)
    const realm = new PublicKey(data.slice(offset, offset + 32)).toBase58();
    offset += 32;
    
    // Read governing token mint (32 bytes)
    const governingTokenMint = new PublicKey(data.slice(offset, offset + 32)).toBase58();
    offset += 32;
    
    // Read voting mints vector
    const votingMintsCount = data.readUInt32LE(offset);
    offset += 4;
    
    console.log(`   Manual parsing - Voting mints count: ${votingMintsCount}`);
    
    const votingMints = [];
    
    for (let i = 0; i < votingMintsCount && i < 10; i++) { // Limit to 10 for safety
      try {
        // Parse voting mint config
        const mint = new PublicKey(data.slice(offset, offset + 32)).toBase58();
        offset += 32;
        
        // Grant authority option (1 + 32 bytes)
        const hasGrantAuthority = data.readUInt8(offset);
        offset += 1;
        if (hasGrantAuthority) {
          offset += 32; // Skip grant authority pubkey
        }
        
        // Read scaled factors and settings
        const baselineVoteWeightScaledFactor = data.readBigUInt64LE(offset);
        offset += 8;
        
        const maxExtraLockupVoteWeightScaledFactor = data.readBigUInt64LE(offset);
        offset += 8;
        
        const lockupSaturationSecs = data.readBigUInt64LE(offset);
        offset += 8;
        
        const digitShift = data.readInt8(offset);
        offset += 1;
        
        votingMints.push({
          mint,
          baselineVoteWeightScaledFactor: baselineVoteWeightScaledFactor.toString(),
          maxExtraLockupVoteWeightScaledFactor: maxExtraLockupVoteWeightScaledFactor.toString(),
          lockupSaturationSecs: lockupSaturationSecs.toString(),
          digitShift
        });
        
      } catch (error) {
        console.log(`   Error parsing voting mint ${i}: ${error.message}`);
        break;
      }
    }
    
    return {
      governanceProgramId,
      realm,
      governingTokenMint,
      votingMints
    };
    
  } catch (error) {
    console.log(`❌ Manual parsing failed: ${error.message}`);
    return null;
  }
}

analyzeRealRegistrar();