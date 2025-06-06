import { Program } from "@coral-xyz/anchor";
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import { GovernanceIdl } from "../idl/idl";
import ixFilter from "../ix_filter";
import { PdaClient } from "../pda";
import { InstructionData } from "../types";

export default async function _insertTransactionContext(
    instructions: TransactionInstruction[],
    optionIndex: number,
    index: number,
    holdUpTime: number,
    governanceAccount: PublicKey,
    proposalAccount: PublicKey,
    tokenOwnerRecord: PublicKey,
    governanceAuthority: PublicKey,
    payer: PublicKey,
    program: Program<GovernanceIdl>,
    pda: PdaClient,
) {
    const proposalTransactionAccount = pda.proposalTransactionAccount({proposal: proposalAccount, optionIndex, index}).publicKey
    const ixs: InstructionData[] = instructions.map(ix => ({
        programId: ix.programId,
        accounts: ix.keys,
        data: ix.data
    }))

    const defaultIx = await program.methods.insertTransaction(optionIndex, index, holdUpTime, ixs)
    .accounts({
        governanceAccount,
        proposalAccount,
        tokenOwnerRecord,
        governanceAuthority,
        proposalTransactionAccount,
        payer
    }).instruction()

    return ixFilter(defaultIx, "insertTransaction", program);

}