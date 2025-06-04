/**
 * VSR SDK Integration - Exact implementation using Anchor and VSR program
 * Uses the official VSR program ID and proper Anchor setup as requested
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const { Program, AnchorProvider, Wallet } = require('@coral-xyz/anchor');
const { Keypair } = require('@solana/web3.js');

// VSR Program ID for IslandDAO
const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');

// IslandDAO Registrar PDA
const ISLAND_DAO_REGISTRAR = new PublicKey('5sGLEKcJ35UGdbHtSWMtGbhLqRycQJSCaUAyEpnz6TA2');

// VSR IDL - Official structure from the VSR program
const VSR_IDL = {
  "version": "0.1.0",
  "name": "voter_stake_registry",
  "instructions": [],
  "accounts": [
    {
      "name": "Registrar",
      "type": {
        "kind": "struct",
        "fields": [
          { "name": "governance_program_id", "type": "publicKey" },
          { "name": "realm", "type": "publicKey" },
          { "name": "governing_token_mint", "type": "publicKey" },
          { "name": "voting_mints", "type": { "vec": { "defined": "VotingMintConfig" } } },
          { "name": "time_offset", "type": "i64" },
          { "name": "bump", "type": "u8" },
          { "name": "reserved1", "type": { "array": ["u8", 7] } },
          { "name": "reserved2", "type": { "array": ["u64", 11] } }
        ]
      }
    },
    {
      "name": "Voter",
      "type": {
        "kind": "struct",
        "fields": [
          { "name": "voter_authority", "type": "publicKey" },
          { "name": "registrar", "type": "publicKey" },
          { "name": "deposits", "type": { "vec": { "defined": "DepositEntry" } } },
          { "name": "voter_bump", "type": "u8" },
          { "name": "voter_weight_record_bump", "type": "u8" },
          { "name": "reserved", "type": { "array": ["u8", 94] } }
        ]
      }
    }
  ],
  "types": [
    {
      "name": "VotingMintConfig",
      "type": {
        "kind": "struct",
        "fields": [
          { "name": "mint", "type": "publicKey" },
          { "name": "grant_authority", "type": { "option": "publicKey" } },
          { "name": "baseline_vote_weight_scaled_factor", "type": "u64" },
          { "name": "max_extra_lockup_vote_weight_scaled_factor", "type": "u64" },
          { "name": "lockup_saturation_secs", "type": "u64" },
          { "name": "digit_shift", "type": "i8" },
          { "name": "reserved1", "type": { "array": ["u8", 63] } }
        ]
      }
    },
    {
      "name": "DepositEntry",
      "type": {
        "kind": "struct",
        "fields": [
          { "name": "lockup", "type": { "defined": "Lockup" } },
          { "name": "amount_deposited_native", "type": "u64" },
          { "name": "amount_initially_locked_native", "type": "u64" },
          { "name": "is_used", "type": "bool" },
          { "name": "allow_clawback", "type": "bool" },
          { "name": "voting_mint_config_idx", "type": "u8" },
          { "name": "reserved", "type": { "array": ["u8", 29] } }
        ]
      }
    },
    {
      "name": "Lockup",
      "type": {
        "kind": "struct",
        "fields": [
          { "name": "start_ts", "type": "u64" },
          { "name": "end_ts", "type": "u64" },
          { "name": "kind", "type": { "defined": "LockupKind" } }
        ]
      }
    },
    {
      "name": "LockupKind",
      "type": {
        "kind": "enum",
        "variants": [
          { "name": "None" },
          { "name": "Daily" },
          { "name": "Monthly" },
          { "name": "Cliff" },
          { "name": "Constant" }
        ]
      }
    }
  ]
};

/**
 * Create dummy wallet for read-only operations
 */
function createDummyWallet() {
  const keypair = Keypair.generate();
  return {
    publicKey: keypair.publicKey,
    signTransaction: async () => { throw new Error('Dummy wallet cannot sign'); },
    signAllTransactions: async () => { throw new Error('Dummy wallet cannot sign'); }
  };
}

/**
 * Get lock tokens voting power per wallet - SDK implementation
 * This is the exact function signature you requested
 */
async function getLockTokensVotingPowerPerWallet(program, walletPublicKey, registrarPDA) {
  try {
    console.log(`🔍 SDK: Getting VSR power for wallet: ${walletPublicKey.toBase58()}`);
    
    // Derive the voter PDA for this wallet
    const [voterPDA] = PublicKey.findProgramAddressSync(
      [
        registrarPDA.toBuffer(),
        Buffer.from('voter'),
        walletPublicKey.toBuffer(),
      ],
      program.programId
    );
    
    console.log(`🔍 SDK: Voter PDA: ${voterPDA.toBase58()}`);
    
    try {
      // Fetch the voter account using Anchor
      const voterAccount = await program.account.voter.fetch(voterPDA);
      
      console.log(`🔍 SDK: Found voter account with ${voterAccount.deposits.length} deposits`);
      
      // Fetch registrar config for voting mint configuration
      const registrarAccount = await program.account.registrar.fetch(registrarPDA);
      
      let totalVotingPower = 0;
      const currentTime = Date.now() / 1000;
      
      // Process each deposit in the voter account
      for (let i = 0; i < voterAccount.deposits.length; i++) {
        const deposit = voterAccount.deposits[i];
        
        if (!deposit.isUsed || deposit.amountDepositedNative.eq(0)) {
          continue;
        }
        
        console.log(`🔍 SDK: Processing deposit ${i}: ${deposit.amountDepositedNative.toString()} tokens`);
        
        // Get voting mint config for this deposit
        const votingMintConfig = registrarAccount.votingMints[deposit.votingMintConfigIdx];
        if (!votingMintConfig) {
          console.log(`🔍 SDK: No voting mint config at index ${deposit.votingMintConfigIdx}`);
          continue;
        }
        
        // Calculate lockup factor
        let lockupFactor = 0;
        if (deposit.lockup.endTs > currentTime) {
          const lockupSecs = deposit.lockup.endTs - currentTime;
          lockupFactor = Math.min(lockupSecs / votingMintConfig.lockupSaturationSecs.toNumber(), 1.0);
        }
        
        // Calculate voting power using VSR formula
        const baselineWeight = votingMintConfig.baselineVoteWeightScaledFactor.toNumber();
        const maxExtraWeight = votingMintConfig.maxExtraLockupVoteWeightScaledFactor.toNumber();
        const scaledFactor = baselineWeight + (lockupFactor * maxExtraWeight);
        
        const depositAmount = deposit.amountDepositedNative.toNumber();
        const depositVotingPower = (depositAmount * scaledFactor) / 1_000_000_000; // Scale factor normalization
        
        totalVotingPower += depositVotingPower;
        
        console.log(`🔍 SDK: Deposit ${i}: ${depositAmount} tokens × ${(scaledFactor / 1_000_000_000).toFixed(6)} = ${depositVotingPower.toLocaleString()} voting power`);
      }
      
      console.log(`🔍 SDK: Total voting power: ${totalVotingPower.toLocaleString()}`);
      return totalVotingPower;
      
    } catch (fetchError) {
      if (fetchError.message.includes('Account does not exist')) {
        console.log(`🔍 SDK: No voter account found for wallet`);
        return 0;
      }
      throw fetchError;
    }
    
  } catch (error) {
    console.error(`🔍 SDK: Error getting VSR voting power: ${error.message}`);
    return 0;
  }
}

/**
 * Set up Anchor context and get governance power using exact SDK methodology
 */
async function getSDKGovernancePower(walletAddress, heliusRpcUrl) {
  try {
    const walletPublicKey = new PublicKey(walletAddress);
    
    // Set up Anchor context as requested
    const connection = new Connection(heliusRpcUrl);
    const dummyWallet = createDummyWallet();
    const provider = new AnchorProvider(connection, dummyWallet, { commitment: 'confirmed' });
    const program = new Program(VSR_IDL, VSR_PROGRAM_ID, provider);
    
    console.log(`🔍 SDK: Anchor setup complete`);
    console.log(`🔍 SDK: Program ID: ${VSR_PROGRAM_ID.toBase58()}`);
    console.log(`🔍 SDK: Registrar PDA: ${ISLAND_DAO_REGISTRAR.toBase58()}`);
    
    // Call the exact function as requested
    const votingPower = await getLockTokensVotingPowerPerWallet(
      program,
      walletPublicKey, 
      ISLAND_DAO_REGISTRAR
    );
    
    return {
      nativeGovernancePower: votingPower,
      delegatedGovernancePower: 0, // VSR doesn't handle delegation directly
      totalGovernancePower: votingPower,
      source: "vsr_sdk"
    };
    
  } catch (error) {
    console.error(`🔍 SDK: Error in SDK governance power calculation: ${error.message}`);
    return {
      nativeGovernancePower: 0,
      delegatedGovernancePower: 0,
      totalGovernancePower: 0,
      source: "vsr_sdk_error",
      error: error.message
    };
  }
}

module.exports = {
  getLockTokensVotingPowerPerWallet,
  getSDKGovernancePower,
  VSR_PROGRAM_ID,
  ISLAND_DAO_REGISTRAR
};