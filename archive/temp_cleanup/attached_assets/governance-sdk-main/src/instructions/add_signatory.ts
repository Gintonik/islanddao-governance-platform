import { Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { GovernanceIdl } from "../idl/idl";
import ixFilter from "../ix_filter";
import { PdaClient } from "../pda";

export default async function _addSignatoryContext(
    signatory: PublicKey,
    proposalAccount: PublicKey,
    tokenOwnerRecord: PublicKey,
    governanceAuthority: PublicKey,
    payer: PublicKey,
    program: Program<GovernanceIdl>,
    pda: PdaClient,

) {
    const signatoryRecordAccount = pda.signatoryRecordAccount({proposal: proposalAccount, signatory}).publicKey

    const defaultIx = await program.methods.addSignatory(signatory)
    .accounts({
        proposalAccount,
        tokenOwnerRecord,
        governanceAuthority,
        payer,
        signatoryRecordAccount
    }).instruction()

    return ixFilter(defaultIx, "addSignatory", program);

}