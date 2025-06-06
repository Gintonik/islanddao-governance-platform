import { Program } from "@coral-xyz/anchor";
import { AccountMeta, PublicKey } from "@solana/web3.js";
import { GovernanceIdl } from "../idl/idl";
import ixFilter from "../ix_filter";

export default async function _executeTransactionContext(
    governanceAccount: PublicKey,
    proposalAccount: PublicKey,
    proposalTransactionAccount: PublicKey,
    transactionAccounts: AccountMeta[],
    program: Program<GovernanceIdl>,
) {
    const defaultIx = await program.methods.executeTransaction()
    .accounts({
        governanceAccount,
        proposalAccount,
        proposalTransactionAccount
    }).remainingAccounts(transactionAccounts)
    .instruction()

    return ixFilter(defaultIx, "executeTransaction", program);

}