import { Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { GovernanceIdl } from "../idl/idl";
import ixFilter from "../ix_filter";
import { PdaClient } from "../pda";

export default async function _relinquishVoteContext(
    realmAccount: PublicKey,
    governanceAccount: PublicKey,
    proposalAccount: PublicKey,
    tokenOwnerRecord: PublicKey,
    governingTokenMint: PublicKey,
    program: Program<GovernanceIdl>,
    pda: PdaClient,
    governanceAuthority?: PublicKey,
    beneficiaryAccount?: PublicKey
) {
    const voteRecordAccount = pda.voteRecordAccount({proposal: proposalAccount, tokenOwnerRecord}).publicKey

    const defaultIx = await program.methods.relinquishVote()
    .accounts({
        realmAccount,
        governanceAccount,
        proposalAccount,
        tokenOwnerRecord,
        governanceAuthority: governanceAuthority ?? null,
        governingTokenMint,
        beneficiaryAccount: beneficiaryAccount ?? null,
        proposalVoteRecord: voteRecordAccount
    }).instruction()

    return ixFilter(defaultIx, "relinquishVote", program);

}