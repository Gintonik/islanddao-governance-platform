import { Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { GovernanceIdl } from "../idl/idl";
import ixFilter from "../ix_filter";
import { PdaClient } from "../pda";

export default async function _finalizeVoteContext(
    realmAccount: PublicKey,
    governanceAccount: PublicKey,
    proposalAccount: PublicKey,
    tokenOwnerRecord: PublicKey,
    governingTokenMint: PublicKey,
    program: Program<GovernanceIdl>,
    pda: PdaClient,
    maxVoterWeightRecord?: PublicKey
) {

    const realmConfig = pda.realmConfigAccount({realmAccount}).publicKey

    const defaultIx = await program.methods.finalizeVote()
    .accounts({
        realmAccount,
        governanceAccount,
        proposalAccount,
        tokenOwnerRecord,
        governingTokenMint,
        realmConfig,
        maxVoterWeightRecord: maxVoterWeightRecord ?? null
    }).instruction()

    return ixFilter(defaultIx, "finalizeVote", program);

}