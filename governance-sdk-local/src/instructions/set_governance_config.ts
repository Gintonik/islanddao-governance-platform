import { Program } from "@coral-xyz/anchor";
import {PublicKey } from "@solana/web3.js";
import { GovernanceIdl } from "../idl/idl";
import ixFilter from "../ix_filter";
import { GovernanceConfig, GovernanceConfigMut } from "../types";
import { BN } from "bn.js";

export default async function _setGovernanceConfigContext(
    config: GovernanceConfig,
    governanceAccount: PublicKey,
    program: Program<GovernanceIdl>,
) {
    const govConfig = {...config}

    govConfig.minCommunityWeightToCreateProposal = 
        typeof govConfig.minCommunityWeightToCreateProposal === "number" ?
            new BN(govConfig.minCommunityWeightToCreateProposal) :
            govConfig.minCommunityWeightToCreateProposal
    
    govConfig.minCouncilWeightToCreateProposal = 
        typeof govConfig.minCouncilWeightToCreateProposal === "number" ?
            new BN(govConfig.minCouncilWeightToCreateProposal) :
            govConfig.minCouncilWeightToCreateProposal
        
    const defaultIx = await program.methods.setGovernanceConfig(govConfig as GovernanceConfigMut)
    .accounts({
        governanceAccount,
    })
    .instruction()

    return ixFilter(defaultIx, "setGovernanceConfig", program);

}