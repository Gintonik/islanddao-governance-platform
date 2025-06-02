import { PublicKey } from "@solana/web3.js";
import { Program } from "@coral-xyz/anchor";
import ixFilter from "../ix_filter";
import { GovernanceIdl } from "../idl/idl";
import { PdaClient } from "../pda";

export default async function _withdrawGoverningTokensContext(
    realmAccount: PublicKey,
    governingTokenMintAccount: PublicKey,
    governingTokenDestinationAccount: PublicKey,
    governingTokenOwner: PublicKey,
    program: Program<GovernanceIdl>,
    pda: PdaClient
) {
    const governingTokenHoldingAccount = pda.governingTokenHoldingAccount({
        realmAccount, governingTokenMintAccount
    }).publicKey

    const tokenOwnerRecord = pda.tokenOwnerRecordAccount(
        {realmAccount, governingTokenMintAccount, governingTokenOwner}
    ).publicKey

    const realmConfigAccount = pda.realmConfigAccount({realmAccount}).publicKey

    const defaultIx = await program.methods.withdrawGoverningTokens()
    .accounts({
        realmAccount,
        governingTokenHoldingAccount,
        governingTokenDestinationAccount,
        governingTokenOwnerAccount: governingTokenOwner,
        realmConfigAccount,
        tokenOwnerRecord,
    })
    .instruction();

    return ixFilter(defaultIx, "withdrawGoverningTokens", program);
}