import { Program } from "@coral-xyz/anchor";
import BN from "bn.js";
import {PublicKey } from "@solana/web3.js";
import { GovernanceIdl } from "../idl/idl";
import ixFilter from "../ix_filter";
import { PdaClient } from "../pda";

export default async function _revokeGoverningTokensContext(
    amount: BN | number,
    realmAccount: PublicKey,
    tokenOwnerRecord: PublicKey,
    governingTokenMint: PublicKey,
    revokeAuthority: PublicKey,
    program: Program<GovernanceIdl>,
    pda: PdaClient,
) {
    const governingTokenHoldingAccount = pda.communityTokenHoldingAccount({
        realmAccount, communityMint: governingTokenMint
    }).publicKey

    const realmConfigAccount = pda.realmConfigAccount({realmAccount}).publicKey

    const revokeAmount = typeof amount === "number" ?
        new BN(amount) :
        amount

    const defaultIx = await program.methods.revokeGoverningTokens(revokeAmount)
    .accounts({
        realmAccount,
        governingTokenMint,
        tokenOwnerRecord,
        governingTokenHoldingAccount,
        governingTokenMintAuthorityOrTokenOwner: revokeAuthority,
        realmConfigAccount
    })
    .instruction()

    return ixFilter(defaultIx, "revokeGoverningTokens", program);

}