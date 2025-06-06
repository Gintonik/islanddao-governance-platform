import { Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { GovernanceIdl } from "../idl/idl";
import ixFilter from "../ix_filter";

export default async function _removeTransactionContext(
    proposalAccount: PublicKey,
    tokenOwnerRecord: PublicKey,
    governanceAuthority: PublicKey,
    proposalTransactionAccount: PublicKey,
    beneficiaryAccount: PublicKey,
    program: Program<GovernanceIdl>,
) {
    const defaultIx = await program.methods.removeTransaction()
    .accounts({
        proposalAccount,
        tokenOwnerRecord,
        governanceAuthority,
        proposalTransactionAccount,
        beneficiaryAccount
    }).instruction()

    return ixFilter(defaultIx, "removeTransaction", program);

}