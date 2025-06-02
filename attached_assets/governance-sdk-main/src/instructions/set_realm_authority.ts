import { Program } from "@coral-xyz/anchor";
import {PublicKey } from "@solana/web3.js";
import { GovernanceIdl } from "../idl/idl";
import ixFilter from "../ix_filter";
import { SetRealmAuthorityAction } from "../types";

export default async function _setRealmAuthorityContext(
    realmAccount: PublicKey,
    currentRealmAuthority: PublicKey,
    action: "setChecked" | "setUnchecked" | "remove",
    program: Program<GovernanceIdl>,
    newRealmAuthority?: PublicKey
) {
    if (action !== "remove" && !newRealmAuthority) {
        throw new Error("New Realm Authority is required!")
    }

    const setRealmAuthorityAction: SetRealmAuthorityAction = action === "remove" ? {remove: {}} :
    action === "setChecked" ? {setChecked : {}} :
    {setUnchecked : {}}

    const defaultIx = await program.methods.setRealmAuthority(setRealmAuthorityAction)
    .accounts({
        realmAccount,
        realmAuthority: currentRealmAuthority,
        newRealmAuthority: newRealmAuthority ?? null
    })
    .instruction()

    return ixFilter(defaultIx, "setRealmAuthority", program);

}