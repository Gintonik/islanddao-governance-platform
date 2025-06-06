import { Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { GovernanceIdl } from "../idl/idl";
import ixFilter from "../ix_filter";

export default async function _signOffProposalContext(
    realmAccount: PublicKey,
    governanceAccount: PublicKey,
    proposalAccount: PublicKey,
    signer: PublicKey,
    program: Program<GovernanceIdl>,
    signatoryRecordAccount?: PublicKey,
    tokenOwnerRecord?: PublicKey,
) {
    if (!signatoryRecordAccount && !tokenOwnerRecord) {
        throw new Error("One of the signatoryRecordAccount or tokenOwnerRecord is required")
    }

    const tokenOwnerOrSignatory = signatoryRecordAccount ?? tokenOwnerRecord;

    const defaultIx = await program.methods.signOffProposal()
    .accounts({
        realmAccount,
        governanceAccount,
        proposalAccount,
        tokenOwnerRecord: tokenOwnerOrSignatory,
        signatoryAccount: signer
    }).instruction()

    return ixFilter(defaultIx, "signOffProposal", program);

}