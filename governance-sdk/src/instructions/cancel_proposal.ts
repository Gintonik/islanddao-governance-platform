import { Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { GovernanceIdl } from "../idl/idl";
import ixFilter from "../ix_filter";

export default async function _cancelProposalContext(
    realmAccount: PublicKey,
    governanceAccount: PublicKey,
    proposalAccount: PublicKey,
    tokenOwnerRecord: PublicKey,
    governanceAuthority: PublicKey,
    program: Program<GovernanceIdl>,
) {
    const defaultIx = await program.methods.cancelProposal()
    .accounts({
        realmAccount,
        governanceAccount,
        proposalAccount,
        tokenOwnerRecord,
        governanceAuthority,
    }).instruction()

    return ixFilter(defaultIx, "cancelProposal", program);

}