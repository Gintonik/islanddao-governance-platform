import { Program, BN } from "@coral-xyz/anchor";
import {PublicKey } from "@solana/web3.js";
import { GovernanceIdl } from "../idl/idl";
import ixFilter from "../ix_filter";
import { PdaClient } from "../pda";

export default async function _refundProposalDepositContext(
    proposalAccount: PublicKey,
    depositPayer: PublicKey,
    program: Program<GovernanceIdl>,
    pda: PdaClient,
) {
    const proposalDepositAccount = pda.proposalDepositAccount({
        proposal: proposalAccount, depositPayer
    }).publicKey

    const defaultIx = await program.methods.refundProposalDeposit()
    .accounts({
        proposalAccount,
        proposalDepositAccount,
        proposalDepositPayer: depositPayer
    })
    .instruction()

    return ixFilter(defaultIx, "refundProposalDeposit", program);

}