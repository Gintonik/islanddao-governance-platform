import { Program } from "@coral-xyz/anchor";
import {PublicKey } from "@solana/web3.js";
import { GovernanceIdl } from "../idl/idl";
import ixFilter from "../ix_filter";

export default async function _completeProposalContext(
    proposalAccount: PublicKey,
    tokenOwnerRecord: PublicKey,
    completeProposalAuthority: PublicKey,
    program: Program<GovernanceIdl>,
) {
    const defaultIx = await program.methods.completeProposal()
    .accounts({
        proposalAccount,
        tokenOwnerRecord,
        completeProposalAuthority
    })
    .instruction()

    return ixFilter(defaultIx, "completeProposal", program);

}