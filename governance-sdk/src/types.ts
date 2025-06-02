import { IdlTypes, IdlAccounts } from "@coral-xyz/anchor";
import BN from "bn.js";
import { GovernanceIdl, ChatIdl, AddinIdl } from "./idl/idl";
import { Idl, IdlTypeDef } from "@coral-xyz/anchor/dist/cjs/idl";
import { TypeDef } from "@coral-xyz/anchor/dist/cjs/program/namespace/types";
import { PublicKey } from "@solana/web3.js";

// export type MintMaxVoteWeightSource = IdlTypes<GovernanceIdl>["MintMaxVoterWeightSource"];
export type MintMaxVoteWeightSource = {
    type: "supplyFraction" | "absolute",
    amount: BN
}

type multiChoiceOptionsType = {
    choiceType: "fullWeight" | "weighted",
    minVoterOptions: number,
    maxVoterOptions: number,
    maxWinningOptions: number
}

// export type VoteType = IdlTypes<GovernanceIdl>["VoteType"];
export type VoteType = {
    choiceType: "single" | "multi",
    multiChoiceOptions: multiChoiceOptionsType | null
}

type TypeDefDictionary<T extends IdlTypeDef[], Defined> = {
    [K in T[number]["name"]]: TypeDef<T[number] & { name: K }, Defined> & {
      publicKey: PublicKey;
    };
};
  
type IdlAccountsWithPubkey<I extends Idl> = TypeDefDictionary<
    NonNullable<I["accounts"]>,
    IdlTypes<I>
>;

export type SetRealmAuthorityAction = IdlTypes<GovernanceIdl>["SetRealmAuthorityAction"];
export type RealmConfigArgs = IdlTypes<GovernanceIdl>["RealmConfigArgs"];
export type InstructionData = IdlTypes<GovernanceIdl>["InstructionData"];
export type ProposalOption = IdlTypes<GovernanceIdl>["ProposalOption"];
export type Vote = IdlTypes<GovernanceIdl>["Vote"];
export type VoteChoice = IdlTypes<GovernanceIdl>["VoteChoice"];
export type GovernanceConfigMut = IdlTypes<GovernanceIdl>["GovernanceConfig"];
export interface GovernanceConfig extends 
    Omit<GovernanceConfigMut, 'minCommunityWeightToCreateProposal' | 'minCouncilWeightToCreateProposal'> {
    minCommunityWeightToCreateProposal: BN | number,
    minCouncilWeightToCreateProposal: BN | number
};
export type MessageBody = IdlTypes<ChatIdl>["MessageBody"];

type RealmsV2Account = IdlAccounts<GovernanceIdl>["realmV2"]

export interface RealmV2 extends RealmsV2Account { publicKey: PublicKey};
export type RealmV1 = IdlAccountsWithPubkey<GovernanceIdl>["realmV1"];
export type RealmConfig = IdlAccountsWithPubkey<GovernanceIdl>["realmConfigAccount"];
export type TokenOwnerRecord = IdlAccountsWithPubkey<GovernanceIdl>["tokenOwnerRecordV2"];
export type GovernanceAccount = IdlAccountsWithPubkey<GovernanceIdl>["governanceV2"];
export type GovernanceV1 = IdlAccountsWithPubkey<GovernanceIdl>["governanceV1"];
export type ProposalV2 = IdlAccountsWithPubkey<GovernanceIdl>["proposalV2"];
export type ProposalV1 = IdlAccountsWithPubkey<GovernanceIdl>["proposalV1"];
export type ProposalDeposit = IdlAccountsWithPubkey<GovernanceIdl>["proposalDeposit"];
export type ProposalTransaction = IdlAccountsWithPubkey<GovernanceIdl>["proposalTransactionV2"];
export type ProposalInstruction = IdlAccountsWithPubkey<GovernanceIdl>["proposalInstructionV1"];
export type SignatoryRecord = IdlAccountsWithPubkey<GovernanceIdl>["signatoryRecordV2"];
export type VoteRecord = IdlAccountsWithPubkey<GovernanceIdl>["voteRecordV2"];
export type VoteRecordV1 = IdlAccountsWithPubkey<GovernanceIdl>["voteRecordV1"];
export type ChatMessage = IdlAccountsWithPubkey<ChatIdl>["chatMessage"];
export type VoterWeightRecord = IdlAccountsWithPubkey<AddinIdl>["voterWeightRecord"];
export type MaxVoterWeightRecord = IdlAccountsWithPubkey<AddinIdl>["maxVoterWeightRecord"];
