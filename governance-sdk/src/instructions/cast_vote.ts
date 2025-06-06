import { Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { GovernanceIdl } from "../idl/idl";
import ixFilter from "../ix_filter";
import { PdaClient } from "../pda";
import { Vote } from "../types";

export default async function _castVoteContext(
    vote: Vote,
    realmAccount: PublicKey,
    governanceAccount: PublicKey,
    proposalAccount: PublicKey,
    proposalOwnerTokenOwnerRecord: PublicKey,
    voterTokenOwnerRecord: PublicKey,
    governanceAuthority: PublicKey,
    governingTokenMint: PublicKey,
    payer: PublicKey,
    program: Program<GovernanceIdl>,
    pda: PdaClient,
    voterWeightRecord?: PublicKey,
    maxVoterWeightRecord?: PublicKey
) {
    const realmConfig = pda.realmConfigAccount({realmAccount}).publicKey
    const voteRecordAccount = pda.voteRecordAccount({proposal: proposalAccount, tokenOwnerRecord: voterTokenOwnerRecord}).publicKey

    const defaultIx = await program.methods.castVote(vote)
    .accounts({
        realmAccount,
        governanceAccount,
        proposalAccount,
        proposalTokenOwnerRecord: proposalOwnerTokenOwnerRecord,
        voterTokenOwnerRecord,
        governanceAuthority,
        governingTokenMint,
        payer,
        voterWeightRecord: voterWeightRecord ?? null,
        maxVoterWeightRecord: maxVoterWeightRecord ?? null,
        realmConfigAccount: realmConfig,
        proposalVoteRecord: voteRecordAccount
    }).instruction()

    return ixFilter(defaultIx, "castVote", program);

}