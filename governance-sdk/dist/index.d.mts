import { PublicKey, Connection, TransactionInstruction, AccountMeta } from '@solana/web3.js';
import { IdlTypes, IdlAccounts, Program } from '@coral-xyz/anchor';
import BN from 'bn.js';
import { Idl, IdlTypeDef } from '@coral-xyz/anchor/dist/cjs/idl';
import { TypeDef } from '@coral-xyz/anchor/dist/cjs/program/namespace/types';

type GovernanceIdl = {
    "version": "3.1.1";
    "name": "spl_governance";
    "instructions": [
        {
            "name": "createRealm";
            "accounts": [
                {
                    "name": "realmAccount";
                    "isMut": true;
                    "isSigner": false;
                    "docs": [
                        "Governance Realm account"
                    ];
                },
                {
                    "name": "realmAuthority";
                    "isMut": false;
                    "isSigner": false;
                    "docs": [
                        "The authority of the Realm"
                    ];
                },
                {
                    "name": "communityTokenMint";
                    "isMut": false;
                    "isSigner": false;
                    "docs": [
                        "The mint address of the token to be used as the community mint"
                    ];
                },
                {
                    "name": "communityTokenHoldingAccount";
                    "isMut": true;
                    "isSigner": false;
                    "docs": [
                        "The account to hold the community tokens.\n    PDA seeds=['governance', realm, community_mint]"
                    ];
                },
                {
                    "name": "payer";
                    "isMut": false;
                    "isSigner": true;
                    "docs": [
                        "the payer of this transaction"
                    ];
                },
                {
                    "name": "systemProgram";
                    "isMut": false;
                    "isSigner": false;
                    "docs": [
                        "System Program"
                    ];
                },
                {
                    "name": "tokenProgram";
                    "isMut": false;
                    "isSigner": false;
                    "docs": [
                        "SPL Token Program"
                    ];
                },
                {
                    "name": "rent";
                    "isMut": false;
                    "isSigner": false;
                    "docs": [
                        "SysVar Rent"
                    ];
                },
                {
                    "name": "councilTokenMint";
                    "isMut": false;
                    "isSigner": false;
                    "isOptional": true;
                    "docs": [
                        "The mint address of the token to be used as the council mint"
                    ];
                },
                {
                    "name": "councilTokenHoldingAccount";
                    "isMut": true;
                    "isSigner": false;
                    "isOptional": true;
                    "docs": [
                        "The account to hold the council tokens.\n    PDA seeds: ['governance',realm,council_mint]\n    "
                    ];
                },
                {
                    "name": "realmConfig";
                    "isMut": true;
                    "isSigner": false;
                    "docs": [
                        "Realm Config account"
                    ];
                },
                {
                    "name": "communityVoterWeightAddin";
                    "isMut": false;
                    "isSigner": false;
                    "isOptional": true;
                    "docs": [
                        "Optional Community Voter Weight Addin Program Id"
                    ];
                },
                {
                    "name": "maxCommunityVoterWeightAddin";
                    "isMut": false;
                    "isSigner": false;
                    "isOptional": true;
                    "docs": [
                        "Optional Max Community Voter Weight Addin Program Id"
                    ];
                },
                {
                    "name": "councilVoterWeightAddin";
                    "isMut": false;
                    "isSigner": false;
                    "isOptional": true;
                    "docs": [
                        "Optional Council Voter Weight Addin Program Id"
                    ];
                },
                {
                    "name": "maxCouncilVoterWeightAddin";
                    "isMut": false;
                    "isSigner": false;
                    "isOptional": true;
                    "docs": [
                        "Optional Max Council Voter Weight Addin Program Id"
                    ];
                }
            ];
            "args": [
                {
                    "name": "name";
                    "type": "string";
                },
                {
                    "name": "configArgs";
                    "type": {
                        "defined": "RealmConfigArgs";
                    };
                }
            ];
            "discriminant": {
                "type": "u8";
                "value": 0;
            };
        },
        {
            "name": "depositGoverningTokens";
            "accounts": [
                {
                    "name": "realmAccount";
                    "isMut": false;
                    "isSigner": false;
                },
                {
                    "name": "governingTokenHoldingAccount";
                    "isMut": true;
                    "isSigner": false;
                    "docs": [
                        "seeds=['governance', realm, governing_token_mint]"
                    ];
                },
                {
                    "name": "governingTokenSourceAccount";
                    "isMut": true;
                    "isSigner": false;
                    "docs": [
                        "It can either be spl-token TokenAccount or MintAccount. Tokens will be transferred or minted to the holding account"
                    ];
                },
                {
                    "name": "governingTokenOwnerAccount";
                    "isMut": false;
                    "isSigner": true;
                },
                {
                    "name": "governingTokenSourceAccountAuthority";
                    "isMut": false;
                    "isSigner": true;
                    "docs": [
                        "It should be owner for TokenAccount and mint_authority for MintAccount"
                    ];
                },
                {
                    "name": "tokenOwnerRecord";
                    "isMut": true;
                    "isSigner": false;
                    "docs": [
                        "seeds=['governance', realm, governing_token_mint, governing_token_owner]"
                    ];
                },
                {
                    "name": "payer";
                    "isMut": true;
                    "isSigner": true;
                },
                {
                    "name": "systemProgram";
                    "isMut": false;
                    "isSigner": false;
                },
                {
                    "name": "tokenProgram";
                    "isMut": false;
                    "isSigner": false;
                },
                {
                    "name": "realmConfigAccount";
                    "isMut": false;
                    "isSigner": false;
                    "docs": [
                        "seeds=['realm-config', realm]"
                    ];
                }
            ];
            "args": [
                {
                    "name": "amount";
                    "type": "u64";
                }
            ];
            "discriminant": {
                "type": "u8";
                "value": 1;
            };
        },
        {
            "name": "withdrawGoverningTokens";
            "accounts": [
                {
                    "name": "realmAccount";
                    "isMut": false;
                    "isSigner": false;
                },
                {
                    "name": "governingTokenHoldingAccount";
                    "isMut": true;
                    "isSigner": false;
                    "docs": [
                        "seeds=['governance', realm, governing_token_mint]"
                    ];
                },
                {
                    "name": "governingTokenDestinationAccount";
                    "isMut": true;
                    "isSigner": false;
                    "docs": [
                        "All tokens will be transferred to this account"
                    ];
                },
                {
                    "name": "governingTokenOwnerAccount";
                    "isMut": false;
                    "isSigner": true;
                },
                {
                    "name": "tokenOwnerRecord";
                    "isMut": true;
                    "isSigner": false;
                    "docs": [
                        "seeds=['governance',realm, governing_token_mint, governing_token_owner]"
                    ];
                },
                {
                    "name": "tokenProgram";
                    "isMut": false;
                    "isSigner": false;
                },
                {
                    "name": "realmConfigAccount";
                    "isMut": false;
                    "isSigner": false;
                    "docs": [
                        "seeds=['realm-config', realm]"
                    ];
                }
            ];
            "args": [];
            "discriminant": {
                "type": "u8";
                "value": 2;
            };
        },
        {
            "name": "setGovernanceDelegate";
            "accounts": [
                {
                    "name": "currentDelegateOrOwner";
                    "isMut": false;
                    "isSigner": true;
                    "docs": [
                        "Current governance delegate or governing token owner"
                    ];
                },
                {
                    "name": "tokenOwnerRecord";
                    "isMut": true;
                    "isSigner": false;
                }
            ];
            "args": [
                {
                    "name": "newGovernanceDelegate";
                    "type": {
                        "option": "publicKey";
                    };
                }
            ];
            "discriminant": {
                "type": "u8";
                "value": 3;
            };
        },
        {
            "name": "createGovernance";
            "accounts": [
                {
                    "name": "realmAccount";
                    "isMut": false;
                    "isSigner": false;
                    "docs": [
                        "Realm account the created governance belongs to"
                    ];
                },
                {
                    "name": "governanceAccount";
                    "isMut": true;
                    "isSigner": false;
                    "docs": [
                        "seeds=['account-governance', realm, governed_account]"
                    ];
                },
                {
                    "name": "governedAccount";
                    "isMut": false;
                    "isSigner": false;
                    "docs": [
                        "Account governed by this Governance (governing_account). \n        Note: the account doesn't have to exist and can be used only as a unique identified for the Governance account"
                    ];
                },
                {
                    "name": "governingTokenOwnerRecord";
                    "isMut": false;
                    "isSigner": false;
                    "docs": [
                        "Used only if not signed by RealmAuthority"
                    ];
                },
                {
                    "name": "payer";
                    "isMut": false;
                    "isSigner": true;
                },
                {
                    "name": "systemProgram";
                    "isMut": false;
                    "isSigner": false;
                },
                {
                    "name": "governanceAuthority";
                    "isMut": false;
                    "isSigner": true;
                },
                {
                    "name": "realmConfigAccount";
                    "isMut": false;
                    "isSigner": false;
                    "docs": [
                        "seeds=['realm-config', realm]"
                    ];
                },
                {
                    "name": "voterWeightRecord";
                    "isMut": false;
                    "isSigner": false;
                    "isOptional": true;
                    "docs": [
                        "Optional Voter Weight Record"
                    ];
                }
            ];
            "args": [
                {
                    "name": "config";
                    "type": {
                        "defined": "GovernanceConfig";
                    };
                }
            ];
            "discriminant": {
                "type": "u8";
                "value": 4;
            };
        },
        {
            "name": "createProgramGovernance";
            "accounts": [
                {
                    "name": "realmAccount";
                    "isMut": false;
                    "isSigner": false;
                    "docs": [
                        "Realm account the created Governance belongs to"
                    ];
                },
                {
                    "name": "programGovernanceAccount";
                    "isMut": true;
                    "isSigner": false;
                    "docs": [
                        "Program Governance account. seeds: ['program-governance', realm, governed_program]"
                    ];
                },
                {
                    "name": "governedProgram";
                    "isMut": false;
                    "isSigner": false;
                    "docs": [
                        "Program governed by this Governance account"
                    ];
                },
                {
                    "name": "programData";
                    "isMut": true;
                    "isSigner": false;
                    "docs": [
                        "Program Data account of the Program governed by this Governance account"
                    ];
                },
                {
                    "name": "currentUpgradeAuthority";
                    "isMut": false;
                    "isSigner": true;
                    "docs": [
                        "Current Upgrade Authority account of the Program governed by this Governance account"
                    ];
                },
                {
                    "name": "governingTokenOwnerRecord";
                    "isMut": false;
                    "isSigner": false;
                    "docs": [
                        "Governing TokenOwnerRecord account (Used only if not signed by RealmAuthority)"
                    ];
                },
                {
                    "name": "payer";
                    "isMut": false;
                    "isSigner": true;
                },
                {
                    "name": "bpfUpgradeableLoaderProgram";
                    "isMut": false;
                    "isSigner": false;
                    "docs": [
                        "bpf_upgradeable_loader_program program"
                    ];
                },
                {
                    "name": "systemProgram";
                    "isMut": false;
                    "isSigner": false;
                },
                {
                    "name": "governanceAuthority";
                    "isMut": false;
                    "isSigner": true;
                },
                {
                    "name": "realmConfig";
                    "isMut": false;
                    "isSigner": false;
                    "docs": [
                        "RealmConfig account. seeds=['realm-config', realm]"
                    ];
                },
                {
                    "name": "voterWeightRecord";
                    "isMut": false;
                    "isSigner": false;
                    "isOptional": true;
                    "docs": [
                        "Optional Voter Weight Record"
                    ];
                }
            ];
            "args": [
                {
                    "name": "config";
                    "type": {
                        "defined": "GovernanceConfig";
                    };
                },
                {
                    "name": "transferUpgradeAuthority";
                    "type": "bool";
                }
            ];
            "discriminant": {
                "type": "u8";
                "value": 5;
            };
        },
        {
            "name": "createProposal";
            "accounts": [
                {
                    "name": "realmAccount";
                    "isMut": false;
                    "isSigner": false;
                    "docs": [
                        "Realm account the created Proposal belongs to"
                    ];
                },
                {
                    "name": "proposalAccount";
                    "isMut": true;
                    "isSigner": false;
                    "docs": [
                        "Proposal account. PDA seeds ['governance',governance, governing_token_mint, proposal_index]"
                    ];
                },
                {
                    "name": "governanceAccount";
                    "isMut": true;
                    "isSigner": false;
                    "docs": [
                        "Governance account"
                    ];
                },
                {
                    "name": "tokenOwnerRecord";
                    "isMut": true;
                    "isSigner": false;
                    "docs": [
                        "TokenOwnerRecord account of the Proposal owner"
                    ];
                },
                {
                    "name": "governingTokenMint";
                    "isMut": false;
                    "isSigner": false;
                    "docs": [
                        "Token Mint the Proposal is created for"
                    ];
                },
                {
                    "name": "governanceAuthority";
                    "isMut": false;
                    "isSigner": true;
                    "docs": [
                        "Governance Authority (Token Owner or Governance Delegate)"
                    ];
                },
                {
                    "name": "payer";
                    "isMut": false;
                    "isSigner": true;
                },
                {
                    "name": "systemProgram";
                    "isMut": false;
                    "isSigner": false;
                },
                {
                    "name": "realmConfig";
                    "isMut": false;
                    "isSigner": false;
                    "docs": [
                        "RealmConfig account. PDA seeds: ['realm-config', realm]"
                    ];
                },
                {
                    "name": "voterWeightRecord";
                    "isMut": true;
                    "isSigner": false;
                    "isOptional": true;
                    "docs": [
                        "Optional Voter Weight Record"
                    ];
                },
                {
                    "name": "proposalDepositAccount";
                    "isMut": false;
                    "isSigner": false;
                    "isOptional": true;
                    "docs": [
                        "Optional Proposal deposit is required when there are more active \n        proposals than the configured deposit exempt amount. \n        PDA seeds: ['proposal-deposit', proposal, deposit payer]"
                    ];
                }
            ];
            "args": [
                {
                    "name": "name";
                    "type": "string";
                },
                {
                    "name": "descriptionLink";
                    "type": "string";
                },
                {
                    "name": "voteType";
                    "type": {
                        "defined": "VoteType";
                    };
                },
                {
                    "name": "options";
                    "type": {
                        "vec": "string";
                    };
                },
                {
                    "name": "useDenyOption";
                    "type": "bool";
                },
                {
                    "name": "proposalSeed";
                    "type": "publicKey";
                }
            ];
            "discriminant": {
                "type": "u8";
                "value": 6;
            };
        },
        {
            "name": "addSignatory";
            "accounts": [
                {
                    "name": "proposalAccount";
                    "isMut": true;
                    "isSigner": false;
                    "docs": [
                        "Proposal Account associated with the governance"
                    ];
                },
                {
                    "name": "tokenOwnerRecord";
                    "isMut": false;
                    "isSigner": false;
                    "docs": [
                        "TokenOwnerRecord account of the Proposal owner"
                    ];
                },
                {
                    "name": "governanceAuthority";
                    "isMut": false;
                    "isSigner": true;
                    "docs": [
                        "Governance Authority (Token Owner or Governance Delegate)"
                    ];
                },
                {
                    "name": "signatoryRecordAccount";
                    "isMut": true;
                    "isSigner": false;
                    "docs": [
                        "Signatory Record Account"
                    ];
                },
                {
                    "name": "payer";
                    "isMut": false;
                    "isSigner": true;
                },
                {
                    "name": "systemProgram";
                    "isMut": false;
                    "isSigner": false;
                }
            ];
            "args": [
                {
                    "name": "signatory";
                    "type": "publicKey";
                }
            ];
            "discriminant": {
                "type": "u8";
                "value": 7;
            };
        },
        {
            "name": "legacy1";
            "accounts": [];
            "args": [];
            "discriminant": {
                "type": "u8";
                "value": 8;
            };
        },
        {
            "name": "insertTransaction";
            "accounts": [
                {
                    "name": "governanceAccount";
                    "isMut": false;
                    "isSigner": false;
                },
                {
                    "name": "proposalAccount";
                    "isMut": true;
                    "isSigner": false;
                },
                {
                    "name": "tokenOwnerRecord";
                    "isMut": false;
                    "isSigner": false;
                    "docs": [
                        "TokenOwnerRecord account of the Proposal owner"
                    ];
                },
                {
                    "name": "governanceAuthority";
                    "isMut": false;
                    "isSigner": true;
                    "docs": [
                        "Governance Authority (Token Owner or Governance Delegate)"
                    ];
                },
                {
                    "name": "proposalTransactionAccount";
                    "isMut": true;
                    "isSigner": false;
                    "docs": [
                        "ProposalTransaction, account. PDA seeds: ['governance', proposal, option_index, index]"
                    ];
                },
                {
                    "name": "payer";
                    "isMut": false;
                    "isSigner": true;
                },
                {
                    "name": "systemProgram";
                    "isMut": false;
                    "isSigner": false;
                },
                {
                    "name": "rent";
                    "isMut": false;
                    "isSigner": false;
                }
            ];
            "args": [
                {
                    "name": "optionIndex";
                    "type": "u8";
                },
                {
                    "name": "index";
                    "type": "u16";
                },
                {
                    "name": "holdUpTime";
                    "type": "u32";
                },
                {
                    "name": "instructions";
                    "type": {
                        "vec": {
                            "defined": "InstructionData";
                        };
                    };
                }
            ];
            "discriminant": {
                "type": "u8";
                "value": 9;
            };
        },
        {
            "name": "removeTransaction";
            "accounts": [
                {
                    "name": "proposalAccount";
                    "isMut": true;
                    "isSigner": false;
                },
                {
                    "name": "tokenOwnerRecord";
                    "isMut": false;
                    "isSigner": false;
                    "docs": [
                        "TokenOwnerRecord account of the Proposal owner"
                    ];
                },
                {
                    "name": "governanceAuthority";
                    "isMut": false;
                    "isSigner": true;
                    "docs": [
                        "Governance Authority (Token Owner or Governance Delegate)"
                    ];
                },
                {
                    "name": "proposalTransactionAccount";
                    "isMut": true;
                    "isSigner": false;
                },
                {
                    "name": "beneficiaryAccount";
                    "isMut": true;
                    "isSigner": false;
                    "docs": [
                        "Beneficiary Account which would receive lamports from the disposed ProposalTransaction account"
                    ];
                }
            ];
            "args": [];
            "discriminant": {
                "type": "u8";
                "value": 10;
            };
        },
        {
            "name": "cancelProposal";
            "accounts": [
                {
                    "name": "realmAccount";
                    "isMut": true;
                    "isSigner": false;
                },
                {
                    "name": "governanceAccount";
                    "isMut": true;
                    "isSigner": false;
                },
                {
                    "name": "proposalAccount";
                    "isMut": true;
                    "isSigner": false;
                },
                {
                    "name": "tokenOwnerRecord";
                    "isMut": true;
                    "isSigner": false;
                    "docs": [
                        "TokenOwnerRecord account of the Proposal owner"
                    ];
                },
                {
                    "name": "governanceAuthority";
                    "isMut": false;
                    "isSigner": true;
                    "docs": [
                        "Governance authority (Token Owner or Governance Delegate)"
                    ];
                }
            ];
            "args": [];
            "discriminant": {
                "type": "u8";
                "value": 11;
            };
        },
        {
            "name": "signOffProposal";
            "accounts": [
                {
                    "name": "realmAccount";
                    "isMut": false;
                    "isSigner": false;
                },
                {
                    "name": "governanceAccount";
                    "isMut": false;
                    "isSigner": false;
                },
                {
                    "name": "proposalAccount";
                    "isMut": true;
                    "isSigner": false;
                },
                {
                    "name": "signatoryAccount";
                    "isMut": false;
                    "isSigner": true;
                    "docs": [
                        "Signatory account signing off the Proposal.\n    Or Proposal owner if the owner hasn't appointed any signatories"
                    ];
                },
                {
                    "name": "tokenOwnerRecord";
                    "isMut": true;
                    "isSigner": false;
                    "docs": [
                        "TokenOwnerRecord for the Proposal owner, required when the owner signs off the Proposal.\n        Or `[writable]` SignatoryRecord account, required when non owner signs off the Proposal"
                    ];
                }
            ];
            "args": [];
            "discriminant": {
                "type": "u8";
                "value": 12;
            };
        },
        {
            "name": "castVote";
            "accounts": [
                {
                    "name": "realmAccount";
                    "isMut": false;
                    "isSigner": false;
                },
                {
                    "name": "governanceAccount";
                    "isMut": true;
                    "isSigner": false;
                },
                {
                    "name": "proposalAccount";
                    "isMut": true;
                    "isSigner": false;
                },
                {
                    "name": "proposalTokenOwnerRecord";
                    "isMut": true;
                    "isSigner": false;
                    "docs": [
                        "TokenOwnerRecord of the Proposal owner"
                    ];
                },
                {
                    "name": "voterTokenOwnerRecord";
                    "isMut": true;
                    "isSigner": false;
                    "docs": [
                        "TokenOwnerRecord of the voter. PDA seeds: ['governance',realm, vote_governing_token_mint, governing_token_owner]"
                    ];
                },
                {
                    "name": "governanceAuthority";
                    "isMut": false;
                    "isSigner": true;
                    "docs": [
                        "Governance Authority (Token Owner or Governance Delegate)"
                    ];
                },
                {
                    "name": "proposalVoteRecord";
                    "isMut": true;
                    "isSigner": false;
                    "docs": [
                        "Proposal VoteRecord account. PDA seeds: ['governance',proposal,token_owner_record]"
                    ];
                },
                {
                    "name": "governingTokenMint";
                    "isMut": false;
                    "isSigner": false;
                    "docs": [
                        "The Governing Token Mint which is used to cast the vote (vote_governing_token_mint).\n    The voting token mint is the governing_token_mint of the Proposal for Approve, Deny and Abstain votes.\n    For Veto vote the voting token mint is the mint of the opposite voting population.\n    Council mint to veto Community proposals and Community mint to veto Council proposals\n    Note: In the current version only Council veto is supported"
                    ];
                },
                {
                    "name": "payer";
                    "isMut": false;
                    "isSigner": true;
                },
                {
                    "name": "systemProgram";
                    "isMut": false;
                    "isSigner": false;
                },
                {
                    "name": "realmConfigAccount";
                    "isMut": false;
                    "isSigner": false;
                    "docs": [
                        "RealmConfig account. PDA seeds: ['realm-config', realm]"
                    ];
                },
                {
                    "name": "voterWeightRecord";
                    "isMut": false;
                    "isSigner": false;
                    "isOptional": true;
                    "docs": [
                        "Optional Voter Weight Record"
                    ];
                },
                {
                    "name": "maxVoterWeightRecord";
                    "isMut": false;
                    "isSigner": false;
                    "isOptional": true;
                    "docs": [
                        "Optional Max Voter Weight Record"
                    ];
                }
            ];
            "args": [
                {
                    "name": "vote";
                    "type": {
                        "defined": "Vote";
                    };
                }
            ];
            "discriminant": {
                "type": "u8";
                "value": 13;
            };
        },
        {
            "name": "finalizeVote";
            "accounts": [
                {
                    "name": "realmAccount";
                    "isMut": false;
                    "isSigner": false;
                },
                {
                    "name": "governanceAccount";
                    "isMut": true;
                    "isSigner": false;
                },
                {
                    "name": "proposalAccount";
                    "isMut": true;
                    "isSigner": false;
                },
                {
                    "name": "tokenOwnerRecord";
                    "isMut": true;
                    "isSigner": false;
                    "docs": [
                        "TokenOwnerRecord of the Proposal owner"
                    ];
                },
                {
                    "name": "governingTokenMint";
                    "isMut": false;
                    "isSigner": false;
                },
                {
                    "name": "realmConfig";
                    "isMut": false;
                    "isSigner": false;
                    "docs": [
                        "RealmConfig account. PDA seeds: ['realm-config', realm]"
                    ];
                },
                {
                    "name": "maxVoterWeightRecord";
                    "isMut": false;
                    "isSigner": false;
                    "isOptional": true;
                    "docs": [
                        "Optional Max Voter Weight Record"
                    ];
                }
            ];
            "args": [];
            "discriminant": {
                "type": "u8";
                "value": 14;
            };
        },
        {
            "name": "relinquishVote";
            "accounts": [
                {
                    "name": "realmAccount";
                    "isMut": false;
                    "isSigner": false;
                },
                {
                    "name": "governanceAccount";
                    "isMut": false;
                    "isSigner": false;
                },
                {
                    "name": "proposalAccount";
                    "isMut": true;
                    "isSigner": false;
                },
                {
                    "name": "tokenOwnerRecord";
                    "isMut": true;
                    "isSigner": false;
                    "docs": [
                        "TokenOwnerRecord account. PDA seeds: ['governance',realm, vote_governing_token_mint, governing_token_owner]"
                    ];
                },
                {
                    "name": "proposalVoteRecord";
                    "isMut": true;
                    "isSigner": false;
                    "docs": [
                        "Proposal VoteRecord account. PDA seeds: ['governance',proposal, token_owner_record]"
                    ];
                },
                {
                    "name": "governingTokenMint";
                    "isMut": false;
                    "isSigner": false;
                    "docs": [
                        "The Governing Token Mint which was used to cast the vote (vote_governing_token_mint)"
                    ];
                },
                {
                    "name": "governanceAuthority";
                    "isMut": false;
                    "isSigner": true;
                    "isOptional": true;
                },
                {
                    "name": "beneficiaryAccount";
                    "isMut": true;
                    "isSigner": false;
                    "isOptional": true;
                    "docs": [
                        "Optional Beneficiary account which would receive lamports when VoteRecord Account is disposed.\n    It's required only when Proposal is still being voted on"
                    ];
                }
            ];
            "args": [];
            "discriminant": {
                "type": "u8";
                "value": 15;
            };
        },
        {
            "name": "executeTransaction";
            "accounts": [
                {
                    "name": "governanceAccount";
                    "isMut": false;
                    "isSigner": false;
                },
                {
                    "name": "proposalAccount";
                    "isMut": true;
                    "isSigner": false;
                },
                {
                    "name": "proposalTransactionAccount";
                    "isMut": true;
                    "isSigner": false;
                }
            ];
            "args": [];
            "discriminant": {
                "type": "u8";
                "value": 16;
            };
        },
        {
            "name": "createMintGovernance";
            "accounts": [
                {
                    "name": "realmAccount";
                    "isMut": false;
                    "isSigner": false;
                    "docs": [
                        "Realm account the created Governance belongs to"
                    ];
                },
                {
                    "name": "mintGovernanceAccount";
                    "isMut": true;
                    "isSigner": false;
                    "docs": [
                        "Mint Governance account. seeds=['mint-governance', realm, governed_mint]"
                    ];
                },
                {
                    "name": "governedMint";
                    "isMut": true;
                    "isSigner": false;
                    "docs": [
                        "Mint governed by this Governance account"
                    ];
                },
                {
                    "name": "mintAuthority";
                    "isMut": false;
                    "isSigner": true;
                    "docs": [
                        "Current Mint authority (MintTokens and optionally FreezeAccount)"
                    ];
                },
                {
                    "name": "governingTokenOwnerRecord";
                    "isMut": false;
                    "isSigner": false;
                    "docs": [
                        "Governing TokenOwnerRecord account (Used only if not signed by RealmAuthority)"
                    ];
                },
                {
                    "name": "payer";
                    "isMut": false;
                    "isSigner": true;
                },
                {
                    "name": "tokenProgram";
                    "isMut": false;
                    "isSigner": false;
                },
                {
                    "name": "systemProgram";
                    "isMut": false;
                    "isSigner": false;
                },
                {
                    "name": "governanceAuthority";
                    "isMut": false;
                    "isSigner": true;
                },
                {
                    "name": "realmConfig";
                    "isMut": false;
                    "isSigner": false;
                    "docs": [
                        "RealmConfig account. seeds=['realm-config', realm]"
                    ];
                },
                {
                    "name": "voterWeightRecord";
                    "isMut": false;
                    "isSigner": false;
                    "isOptional": true;
                    "docs": [
                        "Optional Voter Weight Record"
                    ];
                }
            ];
            "args": [
                {
                    "name": "config";
                    "type": {
                        "defined": "GovernanceConfig";
                    };
                },
                {
                    "name": "transferMintAuthorities";
                    "type": "bool";
                }
            ];
            "discriminant": {
                "type": "u8";
                "value": 17;
            };
        },
        {
            "name": "createTokenGovernance";
            "accounts": [
                {
                    "name": "realmAccount";
                    "isMut": false;
                    "isSigner": false;
                    "docs": [
                        "Realm account the created Governance belongs to"
                    ];
                },
                {
                    "name": "tokenGovernanceAccount";
                    "isMut": true;
                    "isSigner": false;
                    "docs": [
                        "Token Governance account. seeds=['token-governance', realm, governed_token]"
                    ];
                },
                {
                    "name": "tokenAccount";
                    "isMut": true;
                    "isSigner": false;
                    "docs": [
                        "Token account governed by this Governance account"
                    ];
                },
                {
                    "name": "tokenAccountAuthority";
                    "isMut": false;
                    "isSigner": true;
                    "docs": [
                        "Current token account authority (AccountOwner and optionally CloseAccount"
                    ];
                },
                {
                    "name": "governingTokenOwnerRecord";
                    "isMut": false;
                    "isSigner": false;
                    "docs": [
                        "Governing TokenOwnerRecord account (Used only if not signed by RealmAuthority"
                    ];
                },
                {
                    "name": "payer";
                    "isMut": false;
                    "isSigner": true;
                },
                {
                    "name": "tokenProgram";
                    "isMut": false;
                    "isSigner": false;
                },
                {
                    "name": "systemProgram";
                    "isMut": false;
                    "isSigner": false;
                },
                {
                    "name": "governanceAuthority";
                    "isMut": false;
                    "isSigner": true;
                },
                {
                    "name": "realmConfig";
                    "isMut": false;
                    "isSigner": false;
                    "docs": [
                        "seeds=['realm-config', realm]"
                    ];
                },
                {
                    "name": "voterWeightRecord";
                    "isMut": false;
                    "isSigner": false;
                    "isOptional": true;
                    "docs": [
                        "Optional Voter Weight Record"
                    ];
                }
            ];
            "args": [
                {
                    "name": "config";
                    "type": {
                        "defined": "GovernanceConfig";
                    };
                },
                {
                    "name": "transferAccountAuthorities";
                    "type": "bool";
                }
            ];
            "discriminant": {
                "type": "u8";
                "value": 18;
            };
        },
        {
            "name": "setGovernanceConfig";
            "accounts": [
                {
                    "name": "governanceAccount";
                    "isMut": true;
                    "isSigner": true;
                    "docs": [
                        "The governance account the config is for"
                    ];
                }
            ];
            "args": [
                {
                    "name": "config";
                    "type": {
                        "defined": "GovernanceConfig";
                    };
                }
            ];
            "discriminant": {
                "type": "u8";
                "value": 19;
            };
        },
        {
            "name": "flagTransactionError";
            "accounts": [
                {
                    "name": "proposalAccount";
                    "isMut": true;
                    "isSigner": false;
                },
                {
                    "name": "tokenOwnerRecord";
                    "isMut": false;
                    "isSigner": false;
                    "docs": [
                        "TokenOwnerRecord account of the Proposal owner"
                    ];
                },
                {
                    "name": "governanceAuthority";
                    "isMut": false;
                    "isSigner": true;
                    "docs": [
                        "Governance Authority (Token Owner or Governance Delegate)"
                    ];
                },
                {
                    "name": "proposalTransactionAccount";
                    "isMut": true;
                    "isSigner": false;
                    "docs": [
                        "ProposalTransaction account to flag"
                    ];
                }
            ];
            "args": [];
            "discriminant": {
                "type": "u8";
                "value": 20;
            };
        },
        {
            "name": "setRealmAuthority";
            "accounts": [
                {
                    "name": "realmAccount";
                    "isMut": true;
                    "isSigner": false;
                },
                {
                    "name": "realmAuthority";
                    "isMut": false;
                    "isSigner": true;
                },
                {
                    "name": "newRealmAuthority";
                    "isMut": false;
                    "isSigner": false;
                    "isOptional": true;
                    "docs": [
                        "Must be one of the realm governances when set"
                    ];
                }
            ];
            "args": [
                {
                    "name": "action";
                    "type": {
                        "defined": "SetRealmAuthorityAction";
                    };
                }
            ];
            "discriminant": {
                "type": "u8";
                "value": 21;
            };
        },
        {
            "name": "setRealmConfig";
            "accounts": [
                {
                    "name": "realmAccount";
                    "isMut": true;
                    "isSigner": false;
                },
                {
                    "name": "realmAuthority";
                    "isMut": false;
                    "isSigner": true;
                },
                {
                    "name": "councilTokenMint";
                    "isMut": false;
                    "isSigner": false;
                    "isOptional": true;
                    "docs": [
                        "Council Token Mint - optional. \n        Note: In the current version it's only possible to remove council mint (set it to None)\n        After setting council to None it won't be possible to withdraw the tokens from the Realm any longer. \n        If that's required then it must be done before executing this instruction"
                    ];
                },
                {
                    "name": "councilTokenHoldingAccount";
                    "isMut": true;
                    "isSigner": false;
                    "isOptional": true;
                    "docs": [
                        "Optional unless council is used. seeds=['governance', realm, council_mint]"
                    ];
                },
                {
                    "name": "systemProgram";
                    "isMut": false;
                    "isSigner": false;
                },
                {
                    "name": "realmConfig";
                    "isMut": true;
                    "isSigner": false;
                    "docs": [
                        "RealmConfig account. seeds=['realm-config', realm]"
                    ];
                },
                {
                    "name": "communityVoterWeightAddinProgramId";
                    "isMut": false;
                    "isSigner": false;
                    "isOptional": true;
                    "docs": [
                        "Optional Community Voter Weight Addin Program Id"
                    ];
                },
                {
                    "name": "maxCommunityVoterWeightAddinProgramId";
                    "isMut": false;
                    "isSigner": false;
                    "isOptional": true;
                    "docs": [
                        "Optional Max Community Voter Weight Addin Program Id"
                    ];
                },
                {
                    "name": "councilVoterWeightAddinProgramId";
                    "isMut": false;
                    "isSigner": false;
                    "isOptional": true;
                    "docs": [
                        "Optional Council Voter Weight Adding Program Id"
                    ];
                },
                {
                    "name": "maxCouncilVoterWeightAddinProgramId";
                    "isMut": false;
                    "isSigner": false;
                    "isOptional": true;
                    "docs": [
                        "Optional Max Council Voter Weight Addin Program Id"
                    ];
                },
                {
                    "name": "payer";
                    "isMut": false;
                    "isSigner": true;
                    "isOptional": true;
                    "docs": [
                        "Optional Payer. Required if RealmConfig doesn't exist and needs to be created"
                    ];
                }
            ];
            "args": [
                {
                    "name": "configArgs";
                    "type": {
                        "defined": "RealmConfigArgs";
                    };
                }
            ];
            "discriminant": {
                "type": "u8";
                "value": 22;
            };
        },
        {
            "name": "createTokenOwnerRecord";
            "accounts": [
                {
                    "name": "realmAccount";
                    "isMut": false;
                    "isSigner": false;
                },
                {
                    "name": "governingTokenOwnerAccount";
                    "isMut": false;
                    "isSigner": false;
                },
                {
                    "name": "tokenOwnerRecord";
                    "isMut": true;
                    "isSigner": false;
                    "docs": [
                        "seeds=['governance', realm, governing_token_mint, governing_token_owner]"
                    ];
                },
                {
                    "name": "governingTokenMint";
                    "isMut": false;
                    "isSigner": false;
                },
                {
                    "name": "payer";
                    "isMut": false;
                    "isSigner": true;
                },
                {
                    "name": "systemProgram";
                    "isMut": false;
                    "isSigner": false;
                }
            ];
            "args": [];
            "discriminant": {
                "type": "u8";
                "value": 23;
            };
        },
        {
            "name": "updateProgramMetadata";
            "accounts": [
                {
                    "name": "programMetadataAccount";
                    "isMut": true;
                    "isSigner": false;
                    "docs": [
                        "seeds=['metadata']"
                    ];
                },
                {
                    "name": "payer";
                    "isMut": false;
                    "isSigner": true;
                },
                {
                    "name": "systemProgram";
                    "isMut": false;
                    "isSigner": false;
                }
            ];
            "args": [];
            "discriminant": {
                "type": "u8";
                "value": 24;
            };
        },
        {
            "name": "createNativeTreasury";
            "accounts": [
                {
                    "name": "governanceAccount";
                    "isMut": false;
                    "isSigner": false;
                    "docs": [
                        "Governance account the treasury account is for"
                    ];
                },
                {
                    "name": "nativeTreasuryAccount";
                    "isMut": true;
                    "isSigner": false;
                    "docs": [
                        "seeds=['native-treasury', governance]"
                    ];
                },
                {
                    "name": "payer";
                    "isMut": false;
                    "isSigner": true;
                },
                {
                    "name": "systemProgram";
                    "isMut": false;
                    "isSigner": false;
                }
            ];
            "args": [];
            "discriminant": {
                "type": "u8";
                "value": 25;
            };
        },
        {
            "name": "revokeGoverningTokens";
            "accounts": [
                {
                    "name": "realmAccount";
                    "isMut": false;
                    "isSigner": false;
                },
                {
                    "name": "governingTokenHoldingAccount";
                    "isMut": true;
                    "isSigner": false;
                    "docs": [
                        "seeds=['governance', realm, governing_token_mint]"
                    ];
                },
                {
                    "name": "tokenOwnerRecord";
                    "isMut": true;
                    "isSigner": false;
                    "docs": [
                        "seeds=['governance', realm, governing_token_mint, governing_token_owner]"
                    ];
                },
                {
                    "name": "governingTokenMint";
                    "isMut": true;
                    "isSigner": false;
                },
                {
                    "name": "governingTokenMintAuthorityOrTokenOwner";
                    "isMut": false;
                    "isSigner": true;
                    "docs": [
                        "GoverningTokenMint mint_authority"
                    ];
                },
                {
                    "name": "realmConfigAccount";
                    "isMut": false;
                    "isSigner": false;
                    "docs": [
                        "seeds=['realm-config', realm]"
                    ];
                },
                {
                    "name": "tokenProgram";
                    "isMut": false;
                    "isSigner": false;
                }
            ];
            "args": [
                {
                    "name": "amount";
                    "type": "u64";
                }
            ];
            "discriminant": {
                "type": "u8";
                "value": 26;
            };
        },
        {
            "name": "refundProposalDeposit";
            "accounts": [
                {
                    "name": "proposalAccount";
                    "isMut": false;
                    "isSigner": false;
                },
                {
                    "name": "proposalDepositAccount";
                    "isMut": true;
                    "isSigner": false;
                    "docs": [
                        "PDA Seeds: ['proposal-deposit', proposal, deposit payer]"
                    ];
                },
                {
                    "name": "proposalDepositPayer";
                    "isMut": true;
                    "isSigner": false;
                    "docs": [
                        "Proposal Deposit Payer (beneficiary) account"
                    ];
                }
            ];
            "args": [];
            "discriminant": {
                "type": "u8";
                "value": 27;
            };
        },
        {
            "name": "completeProposal";
            "accounts": [
                {
                    "name": "proposalAccount";
                    "isMut": true;
                    "isSigner": false;
                },
                {
                    "name": "tokenOwnerRecord";
                    "isMut": false;
                    "isSigner": false;
                    "docs": [
                        "TokenOwnerRecord account of the Proposal owner"
                    ];
                },
                {
                    "name": "completeProposalAuthority";
                    "isMut": false;
                    "isSigner": true;
                    "docs": [
                        "Token Owner or Delegate"
                    ];
                }
            ];
            "args": [];
            "discriminant": {
                "type": "u8";
                "value": 28;
            };
        },
        {
            "name": "addRequiredSignatory";
            "accounts": [
                {
                    "name": "governanceAccount";
                    "isMut": true;
                    "isSigner": true;
                    "docs": [
                        "The Governance account the config is for"
                    ];
                },
                {
                    "name": "requiredSignatoryAccount";
                    "isMut": true;
                    "isSigner": false;
                },
                {
                    "name": "payer";
                    "isMut": false;
                    "isSigner": true;
                },
                {
                    "name": "systemProgram";
                    "isMut": false;
                    "isSigner": false;
                }
            ];
            "args": [
                {
                    "name": "signatory";
                    "type": "publicKey";
                }
            ];
            "discriminant": {
                "type": "u8";
                "value": 29;
            };
        },
        {
            "name": "removeRequiredSignatory";
            "accounts": [
                {
                    "name": "governanceAccount";
                    "isMut": true;
                    "isSigner": true;
                },
                {
                    "name": "requiredSignatoryAccount";
                    "isMut": true;
                    "isSigner": false;
                },
                {
                    "name": "beneficiaryAccount";
                    "isMut": true;
                    "isSigner": false;
                    "docs": [
                        "Beneficiary Account which would receive lamports from the disposed RequiredSignatory Account"
                    ];
                }
            ];
            "args": [];
            "discriminant": {
                "type": "u8";
                "value": 30;
            };
        }
    ];
    "accounts": [
        {
            "name": "governanceV2";
            "type": {
                "kind": "struct";
                "fields": [
                    {
                        "name": "accountType";
                        "type": {
                            "defined": "GovernanceAccountType";
                        };
                    },
                    {
                        "name": "realm";
                        "type": "publicKey";
                    },
                    {
                        "name": "governedAccount";
                        "type": "publicKey";
                    },
                    {
                        "name": "reserved1";
                        "type": "u32";
                    },
                    {
                        "name": "config";
                        "type": {
                            "defined": "GovernanceConfig";
                        };
                    },
                    {
                        "name": "reservedV2";
                        "type": {
                            "defined": "Reserved119";
                        };
                    },
                    {
                        "name": "requiredSignatoriesCount";
                        "type": "u8";
                    },
                    {
                        "name": "activeProposalCount";
                        "type": "u64";
                    }
                ];
            };
        },
        {
            "name": "realmV1";
            "type": {
                "kind": "struct";
                "fields": [
                    {
                        "name": "accountType";
                        "type": {
                            "defined": "GovernanceAccountType";
                        };
                    },
                    {
                        "name": "communityMint";
                        "type": "publicKey";
                    },
                    {
                        "name": "config";
                        "type": {
                            "defined": "RealmConfig";
                        };
                    },
                    {
                        "name": "reserved";
                        "type": {
                            "array": [
                                "u8",
                                6
                            ];
                        };
                    },
                    {
                        "name": "votingProposalCount";
                        "type": "u16";
                    },
                    {
                        "name": "authority";
                        "type": {
                            "option": "publicKey";
                        };
                    },
                    {
                        "name": "name";
                        "type": "string";
                    }
                ];
            };
        },
        {
            "name": "tokenOwnerRecordV1";
            "type": {
                "kind": "struct";
                "fields": [
                    {
                        "name": "accountType";
                        "type": {
                            "defined": "GovernanceAccountType";
                        };
                    },
                    {
                        "name": "realm";
                        "type": "publicKey";
                    },
                    {
                        "name": "governingTokenMint";
                        "type": "publicKey";
                    },
                    {
                        "name": "governingTokenOwner";
                        "type": "publicKey";
                    },
                    {
                        "name": "governingTokenDepositAmount";
                        "type": "u64";
                    },
                    {
                        "name": "unrelinquishedVotesCount";
                        "type": "u64";
                    },
                    {
                        "name": "outstandingProposalCount";
                        "type": "u8";
                    },
                    {
                        "name": "version";
                        "type": "u8";
                    },
                    {
                        "name": "reserved";
                        "type": {
                            "array": [
                                "u8",
                                6
                            ];
                        };
                    },
                    {
                        "name": "governanceDelegate";
                        "type": {
                            "option": "publicKey";
                        };
                    }
                ];
            };
        },
        {
            "name": "governanceV1";
            "type": {
                "kind": "struct";
                "fields": [
                    {
                        "name": "accountType";
                        "type": {
                            "defined": "GovernanceAccountType";
                        };
                    },
                    {
                        "name": "realm";
                        "type": "publicKey";
                    },
                    {
                        "name": "governedAccount";
                        "type": "publicKey";
                    },
                    {
                        "name": "proposalsCount";
                        "type": "u32";
                    },
                    {
                        "name": "config";
                        "type": {
                            "defined": "GovernanceConfig";
                        };
                    }
                ];
            };
        },
        {
            "name": "proposalV1";
            "type": {
                "kind": "struct";
                "fields": [
                    {
                        "name": "accountType";
                        "type": {
                            "defined": "GovernanceAccountType";
                        };
                    },
                    {
                        "name": "governance";
                        "type": "publicKey";
                    },
                    {
                        "name": "governingTokenMint";
                        "type": "publicKey";
                    },
                    {
                        "name": "state";
                        "type": {
                            "defined": "ProposalState";
                        };
                    },
                    {
                        "name": "tokenOwnerRecord";
                        "type": "publicKey";
                    },
                    {
                        "name": "signatoriesCount";
                        "type": "u8";
                    },
                    {
                        "name": "signatoriesSignedOffCount";
                        "type": "u8";
                    },
                    {
                        "name": "yesVotesCount";
                        "type": "u64";
                    },
                    {
                        "name": "noVotesCount";
                        "type": "u64";
                    },
                    {
                        "name": "instructionsExecutedCount";
                        "type": "u16";
                    },
                    {
                        "name": "instructionsCount";
                        "type": "u16";
                    },
                    {
                        "name": "instructionsNextIndex";
                        "type": "u16";
                    },
                    {
                        "name": "draftAt";
                        "type": {
                            "defined": "UnixTimestamp";
                        };
                    },
                    {
                        "name": "signingOffAt";
                        "type": {
                            "option": {
                                "defined": "UnixTimestamp";
                            };
                        };
                    },
                    {
                        "name": "votingAt";
                        "type": {
                            "option": {
                                "defined": "UnixTimestamp";
                            };
                        };
                    },
                    {
                        "name": "votingAtSlot";
                        "type": {
                            "option": {
                                "defined": "Slot";
                            };
                        };
                    },
                    {
                        "name": "votingCompletedAt";
                        "type": {
                            "option": {
                                "defined": "UnixTimestamp";
                            };
                        };
                    },
                    {
                        "name": "executingAt";
                        "type": {
                            "option": {
                                "defined": "UnixTimestamp";
                            };
                        };
                    },
                    {
                        "name": "closedAt";
                        "type": {
                            "option": {
                                "defined": "UnixTimestamp";
                            };
                        };
                    },
                    {
                        "name": "executionFlags";
                        "type": {
                            "defined": "InstructionExecutionFlags";
                        };
                    },
                    {
                        "name": "maxVoteWeight";
                        "type": {
                            "option": "u64";
                        };
                    },
                    {
                        "name": "voteThreshold";
                        "type": {
                            "option": {
                                "defined": "VoteThreshold";
                            };
                        };
                    },
                    {
                        "name": "name";
                        "type": "string";
                    },
                    {
                        "name": "descriptionLink";
                        "type": "string";
                    }
                ];
            };
        },
        {
            "name": "signatoryRecordV1";
            "type": {
                "kind": "struct";
                "fields": [
                    {
                        "name": "accountType";
                        "type": {
                            "defined": "GovernanceAccountType";
                        };
                    },
                    {
                        "name": "proposal";
                        "type": "publicKey";
                    },
                    {
                        "name": "signatory";
                        "type": "publicKey";
                    },
                    {
                        "name": "signedOff";
                        "type": "bool";
                    }
                ];
            };
        },
        {
            "name": "proposalInstructionV1";
            "type": {
                "kind": "struct";
                "fields": [
                    {
                        "name": "accountType";
                        "type": {
                            "defined": "GovernanceAccountType";
                        };
                    },
                    {
                        "name": "proposal";
                        "type": "publicKey";
                    },
                    {
                        "name": "instructionIndex";
                        "type": "u16";
                    },
                    {
                        "name": "holdUpTime";
                        "type": "u32";
                    },
                    {
                        "name": "instruction";
                        "type": {
                            "defined": "InstructionData";
                        };
                    },
                    {
                        "name": "executedAt";
                        "type": {
                            "option": {
                                "defined": "UnixTimestamp";
                            };
                        };
                    },
                    {
                        "name": "executionStatus";
                        "type": {
                            "defined": "TransactionExecutionStatus";
                        };
                    }
                ];
            };
        },
        {
            "name": "voteRecordV1";
            "type": {
                "kind": "struct";
                "fields": [
                    {
                        "name": "accountType";
                        "type": {
                            "defined": "GovernanceAccountType";
                        };
                    },
                    {
                        "name": "proposal";
                        "type": "publicKey";
                    },
                    {
                        "name": "governingTokenOwner";
                        "type": "publicKey";
                    },
                    {
                        "name": "isRelinquished";
                        "type": "bool";
                    },
                    {
                        "name": "voteWeight";
                        "type": {
                            "defined": "VoteWeightV1";
                        };
                    }
                ];
            };
        },
        {
            "name": "programMetadata";
            "type": {
                "kind": "struct";
                "fields": [
                    {
                        "name": "accountType";
                        "type": {
                            "defined": "GovernanceAccountType";
                        };
                    },
                    {
                        "name": "updatedAt";
                        "type": {
                            "defined": "Slot";
                        };
                    },
                    {
                        "name": "version";
                        "type": "string";
                    },
                    {
                        "name": "reserved";
                        "type": {
                            "array": [
                                "u8",
                                64
                            ];
                        };
                    }
                ];
            };
        },
        {
            "name": "proposalV2";
            "type": {
                "kind": "struct";
                "fields": [
                    {
                        "name": "accountType";
                        "type": {
                            "defined": "GovernanceAccountType";
                        };
                    },
                    {
                        "name": "governance";
                        "type": "publicKey";
                    },
                    {
                        "name": "governingTokenMint";
                        "type": "publicKey";
                    },
                    {
                        "name": "state";
                        "type": {
                            "defined": "ProposalState";
                        };
                    },
                    {
                        "name": "tokenOwnerRecord";
                        "type": "publicKey";
                    },
                    {
                        "name": "signatoriesCount";
                        "type": "u8";
                    },
                    {
                        "name": "signatoriesSignedOffCount";
                        "type": "u8";
                    },
                    {
                        "name": "voteType";
                        "type": {
                            "defined": "VoteType";
                        };
                    },
                    {
                        "name": "options";
                        "type": {
                            "vec": {
                                "defined": "ProposalOption";
                            };
                        };
                    },
                    {
                        "name": "denyVoteWeight";
                        "type": {
                            "option": "u64";
                        };
                    },
                    {
                        "name": "reserved1";
                        "type": "u8";
                    },
                    {
                        "name": "abstainVoteWeight";
                        "type": {
                            "option": "u64";
                        };
                    },
                    {
                        "name": "startVotingAt";
                        "type": {
                            "option": {
                                "defined": "UnixTimestamp";
                            };
                        };
                    },
                    {
                        "name": "draftAt";
                        "type": {
                            "defined": "UnixTimestamp";
                        };
                    },
                    {
                        "name": "signingOffAt";
                        "type": {
                            "option": {
                                "defined": "UnixTimestamp";
                            };
                        };
                    },
                    {
                        "name": "votingAt";
                        "type": {
                            "option": {
                                "defined": "UnixTimestamp";
                            };
                        };
                    },
                    {
                        "name": "votingAtSlot";
                        "type": {
                            "option": {
                                "defined": "Slot";
                            };
                        };
                    },
                    {
                        "name": "votingCompletedAt";
                        "type": {
                            "option": {
                                "defined": "UnixTimestamp";
                            };
                        };
                    },
                    {
                        "name": "executingAt";
                        "type": {
                            "option": {
                                "defined": "UnixTimestamp";
                            };
                        };
                    },
                    {
                        "name": "closedAt";
                        "type": {
                            "option": {
                                "defined": "UnixTimestamp";
                            };
                        };
                    },
                    {
                        "name": "executionFlags";
                        "type": {
                            "defined": "InstructionExecutionFlags";
                        };
                    },
                    {
                        "name": "maxVoteWeight";
                        "type": {
                            "option": "u64";
                        };
                    },
                    {
                        "name": "maxVotingTime";
                        "type": {
                            "option": "u32";
                        };
                    },
                    {
                        "name": "voteThreshold";
                        "type": {
                            "option": {
                                "defined": "VoteThreshold";
                            };
                        };
                    },
                    {
                        "name": "reserved";
                        "type": {
                            "array": [
                                "u8",
                                64
                            ];
                        };
                    },
                    {
                        "name": "name";
                        "type": "string";
                    },
                    {
                        "name": "descriptionLink";
                        "type": "string";
                    },
                    {
                        "name": "vetoVoteWeight";
                        "type": "u64";
                    }
                ];
            };
        },
        {
            "name": "proposalDeposit";
            "type": {
                "kind": "struct";
                "fields": [
                    {
                        "name": "accountType";
                        "type": {
                            "defined": "GovernanceAccountType";
                        };
                    },
                    {
                        "name": "proposal";
                        "type": "publicKey";
                    },
                    {
                        "name": "depositPayer";
                        "type": "publicKey";
                    },
                    {
                        "name": "reserved";
                        "type": {
                            "array": [
                                "u8",
                                64
                            ];
                        };
                    }
                ];
            };
        },
        {
            "name": "proposalTransactionV2";
            "type": {
                "kind": "struct";
                "fields": [
                    {
                        "name": "accountType";
                        "type": {
                            "defined": "GovernanceAccountType";
                        };
                    },
                    {
                        "name": "proposal";
                        "type": "publicKey";
                    },
                    {
                        "name": "optionIndex";
                        "type": "u8";
                    },
                    {
                        "name": "transactionIndex";
                        "type": "u16";
                    },
                    {
                        "name": "holdUpTime";
                        "type": "u32";
                    },
                    {
                        "name": "instructions";
                        "type": {
                            "vec": {
                                "defined": "InstructionData";
                            };
                        };
                    },
                    {
                        "name": "executedAt";
                        "type": {
                            "option": {
                                "defined": "UnixTimestamp";
                            };
                        };
                    },
                    {
                        "name": "executionStatus";
                        "type": {
                            "defined": "TransactionExecutionStatus";
                        };
                    },
                    {
                        "name": "reservedV2";
                        "type": {
                            "array": [
                                "u8",
                                8
                            ];
                        };
                    }
                ];
            };
        },
        {
            "name": "realmV2";
            "type": {
                "kind": "struct";
                "fields": [
                    {
                        "name": "accountType";
                        "type": {
                            "defined": "GovernanceAccountType";
                        };
                    },
                    {
                        "name": "communityMint";
                        "type": "publicKey";
                    },
                    {
                        "name": "config";
                        "type": {
                            "defined": "RealmConfig";
                        };
                    },
                    {
                        "name": "reserved";
                        "type": {
                            "array": [
                                "u8",
                                6
                            ];
                        };
                    },
                    {
                        "name": "legacy1";
                        "type": "u16";
                    },
                    {
                        "name": "authority";
                        "type": {
                            "option": "publicKey";
                        };
                    },
                    {
                        "name": "name";
                        "type": "string";
                    },
                    {
                        "name": "reservedV2";
                        "type": {
                            "array": [
                                "u8",
                                128
                            ];
                        };
                    }
                ];
            };
        },
        {
            "name": "realmConfigAccount";
            "type": {
                "kind": "struct";
                "fields": [
                    {
                        "name": "accountType";
                        "type": {
                            "defined": "GovernanceAccountType";
                        };
                    },
                    {
                        "name": "realm";
                        "type": "publicKey";
                    },
                    {
                        "name": "communityTokenConfig";
                        "type": {
                            "defined": "GoverningTokenConfig";
                        };
                    },
                    {
                        "name": "councilTokenConfig";
                        "type": {
                            "defined": "GoverningTokenConfig";
                        };
                    },
                    {
                        "name": "reserved";
                        "type": {
                            "defined": "Reserved110";
                        };
                    }
                ];
            };
        },
        {
            "name": "requiredSignatory";
            "type": {
                "kind": "struct";
                "fields": [
                    {
                        "name": "accountType";
                        "type": {
                            "defined": "GovernanceAccountType";
                        };
                    },
                    {
                        "name": "accountVersion";
                        "type": "u8";
                    },
                    {
                        "name": "governance";
                        "type": "publicKey";
                    },
                    {
                        "name": "signatory";
                        "type": "publicKey";
                    }
                ];
            };
        },
        {
            "name": "signatoryRecordV2";
            "type": {
                "kind": "struct";
                "fields": [
                    {
                        "name": "accountType";
                        "type": {
                            "defined": "GovernanceAccountType";
                        };
                    },
                    {
                        "name": "proposal";
                        "type": "publicKey";
                    },
                    {
                        "name": "signatory";
                        "type": "publicKey";
                    },
                    {
                        "name": "signedOff";
                        "type": "bool";
                    },
                    {
                        "name": "reservedV2";
                        "type": {
                            "array": [
                                "u8",
                                8
                            ];
                        };
                    }
                ];
            };
        },
        {
            "name": "tokenOwnerRecordV2";
            "type": {
                "kind": "struct";
                "fields": [
                    {
                        "name": "accountType";
                        "type": {
                            "defined": "GovernanceAccountType";
                        };
                    },
                    {
                        "name": "realm";
                        "type": "publicKey";
                    },
                    {
                        "name": "governingTokenMint";
                        "type": "publicKey";
                    },
                    {
                        "name": "governingTokenOwner";
                        "type": "publicKey";
                    },
                    {
                        "name": "governingTokenDepositAmount";
                        "type": "u64";
                    },
                    {
                        "name": "unrelinquishedVotesCount";
                        "type": "u64";
                    },
                    {
                        "name": "outstandingProposalCount";
                        "type": "u8";
                    },
                    {
                        "name": "version";
                        "type": "u8";
                    },
                    {
                        "name": "reserved";
                        "type": {
                            "array": [
                                "u8",
                                6
                            ];
                        };
                    },
                    {
                        "name": "governanceDelegate";
                        "type": {
                            "option": "publicKey";
                        };
                    },
                    {
                        "name": "reservedV2";
                        "type": {
                            "array": [
                                "u8",
                                128
                            ];
                        };
                    }
                ];
            };
        },
        {
            "name": "legacyTokenOwnerRecord";
            "type": {
                "kind": "struct";
                "fields": [
                    {
                        "name": "accountType";
                        "type": {
                            "defined": "GovernanceAccountType";
                        };
                    },
                    {
                        "name": "realm";
                        "type": "publicKey";
                    },
                    {
                        "name": "governingTokenMint";
                        "type": "publicKey";
                    },
                    {
                        "name": "governingTokenOwner";
                        "type": "publicKey";
                    },
                    {
                        "name": "governingTokenDepositAmount";
                        "type": "u64";
                    },
                    {
                        "name": "unrelinquishedVotesCount";
                        "type": "u32";
                    },
                    {
                        "name": "totalVotesCount";
                        "type": "u32";
                    },
                    {
                        "name": "outstandingProposalCount";
                        "type": "u8";
                    },
                    {
                        "name": "reserved";
                        "type": {
                            "array": [
                                "u8",
                                7
                            ];
                        };
                    },
                    {
                        "name": "governanceDelegate";
                        "type": {
                            "option": "publicKey";
                        };
                    },
                    {
                        "name": "reservedV2";
                        "type": {
                            "array": [
                                "u8",
                                128
                            ];
                        };
                    }
                ];
            };
        },
        {
            "name": "voteRecordV2";
            "type": {
                "kind": "struct";
                "fields": [
                    {
                        "name": "accountType";
                        "type": {
                            "defined": "GovernanceAccountType";
                        };
                    },
                    {
                        "name": "proposal";
                        "type": "publicKey";
                    },
                    {
                        "name": "governingTokenOwner";
                        "type": "publicKey";
                    },
                    {
                        "name": "isRelinquished";
                        "type": "bool";
                    },
                    {
                        "name": "voterWeight";
                        "type": "u64";
                    },
                    {
                        "name": "vote";
                        "type": {
                            "defined": "Vote";
                        };
                    },
                    {
                        "name": "reservedV2";
                        "type": {
                            "array": [
                                "u8",
                                8
                            ];
                        };
                    }
                ];
            };
        }
    ];
    "types": [
        {
            "name": "GovernanceConfig";
            "type": {
                "kind": "struct";
                "fields": [
                    {
                        "name": "communityVoteThreshold";
                        "type": {
                            "defined": "VoteThreshold";
                        };
                    },
                    {
                        "name": "minCommunityWeightToCreateProposal";
                        "type": "u64";
                    },
                    {
                        "name": "minTransactionHoldUpTime";
                        "type": "u32";
                    },
                    {
                        "name": "votingBaseTime";
                        "type": "u32";
                    },
                    {
                        "name": "communityVoteTipping";
                        "type": {
                            "defined": "VoteTipping";
                        };
                    },
                    {
                        "name": "councilVoteThreshold";
                        "type": {
                            "defined": "VoteThreshold";
                        };
                    },
                    {
                        "name": "councilVetoVoteThreshold";
                        "type": {
                            "defined": "VoteThreshold";
                        };
                    },
                    {
                        "name": "minCouncilWeightToCreateProposal";
                        "type": "u64";
                    },
                    {
                        "name": "councilVoteTipping";
                        "type": {
                            "defined": "VoteTipping";
                        };
                    },
                    {
                        "name": "communityVetoVoteThreshold";
                        "type": {
                            "defined": "VoteThreshold";
                        };
                    },
                    {
                        "name": "votingCoolOffTime";
                        "type": "u32";
                    },
                    {
                        "name": "depositExemptProposalCount";
                        "type": "u8";
                    }
                ];
            };
        },
        {
            "name": "NativeTreasury";
            "type": {
                "kind": "struct";
                "fields": [];
            };
        },
        {
            "name": "ProposalOption";
            "type": {
                "kind": "struct";
                "fields": [
                    {
                        "name": "label";
                        "type": "string";
                    },
                    {
                        "name": "voteWeight";
                        "type": "u64";
                    },
                    {
                        "name": "voteResult";
                        "type": {
                            "defined": "OptionVoteResult";
                        };
                    },
                    {
                        "name": "transactionsExecutedCount";
                        "type": "u16";
                    },
                    {
                        "name": "transactionsCount";
                        "type": "u16";
                    },
                    {
                        "name": "transactionsNextIndex";
                        "type": "u16";
                    }
                ];
            };
        },
        {
            "name": "InstructionData";
            "type": {
                "kind": "struct";
                "fields": [
                    {
                        "name": "programId";
                        "type": "publicKey";
                    },
                    {
                        "name": "accounts";
                        "type": {
                            "vec": {
                                "defined": "AccountMetaData";
                            };
                        };
                    },
                    {
                        "name": "data";
                        "type": "bytes";
                    }
                ];
            };
        },
        {
            "name": "AccountMetaData";
            "type": {
                "kind": "struct";
                "fields": [
                    {
                        "name": "pubkey";
                        "type": "publicKey";
                    },
                    {
                        "name": "isSigner";
                        "type": "bool";
                    },
                    {
                        "name": "isWritable";
                        "type": "bool";
                    }
                ];
            };
        },
        {
            "name": "RealmConfigArgs";
            "type": {
                "kind": "struct";
                "fields": [
                    {
                        "name": "useCouncilMint";
                        "type": "bool";
                    },
                    {
                        "name": "minCommunityWeightToCreateGovernance";
                        "type": "u64";
                    },
                    {
                        "name": "communityMintMaxVoterWeightSource";
                        "type": {
                            "defined": "MintMaxVoterWeightSource";
                        };
                    },
                    {
                        "name": "communityTokenConfigArgs";
                        "type": {
                            "defined": "GoverningTokenConfigArgs";
                        };
                    },
                    {
                        "name": "councilTokenConfigArgs";
                        "type": {
                            "defined": "GoverningTokenConfigArgs";
                        };
                    }
                ];
            };
        },
        {
            "name": "GoverningTokenConfigArgs";
            "type": {
                "kind": "struct";
                "fields": [
                    {
                        "name": "useVoterWeightAddin";
                        "type": "bool";
                    },
                    {
                        "name": "useMaxVoterWeightAddin";
                        "type": "bool";
                    },
                    {
                        "name": "tokenType";
                        "type": {
                            "defined": "GoverningTokenType";
                        };
                    }
                ];
            };
        },
        {
            "name": "GoverningTokenConfigAccountArgs";
            "type": {
                "kind": "struct";
                "fields": [
                    {
                        "name": "voterWeightAddin";
                        "type": {
                            "option": "publicKey";
                        };
                    },
                    {
                        "name": "maxVoterWeightAddin";
                        "type": {
                            "option": "publicKey";
                        };
                    },
                    {
                        "name": "tokenType";
                        "type": {
                            "defined": "GoverningTokenType";
                        };
                    }
                ];
            };
        },
        {
            "name": "RealmConfig";
            "type": {
                "kind": "struct";
                "fields": [
                    {
                        "name": "legacy1";
                        "type": "u8";
                    },
                    {
                        "name": "legacy2";
                        "type": "u8";
                    },
                    {
                        "name": "reserved";
                        "type": {
                            "array": [
                                "u8",
                                6
                            ];
                        };
                    },
                    {
                        "name": "minCommunityWeightToCreateGovernance";
                        "type": "u64";
                    },
                    {
                        "name": "communityMintMaxVoterWeightSource";
                        "type": {
                            "defined": "MintMaxVoterWeightSource";
                        };
                    },
                    {
                        "name": "councilMint";
                        "type": {
                            "option": "publicKey";
                        };
                    }
                ];
            };
        },
        {
            "name": "RealmConfigArgsV1";
            "type": {
                "kind": "struct";
                "fields": [
                    {
                        "name": "useCouncilMint";
                        "type": "bool";
                    },
                    {
                        "name": "minCommunityWeightToCreateGovernance";
                        "type": "u64";
                    },
                    {
                        "name": "communityMintMaxVoterWeightSource";
                        "type": {
                            "defined": "MintMaxVoterWeightSource";
                        };
                    }
                ];
            };
        },
        {
            "name": "GoverningTokenConfig";
            "type": {
                "kind": "struct";
                "fields": [
                    {
                        "name": "voterWeightAddin";
                        "type": {
                            "option": "publicKey";
                        };
                    },
                    {
                        "name": "maxVoterWeightAddin";
                        "type": {
                            "option": "publicKey";
                        };
                    },
                    {
                        "name": "tokenType";
                        "type": {
                            "defined": "GoverningTokenType";
                        };
                    },
                    {
                        "name": "reserved";
                        "type": {
                            "array": [
                                "u8",
                                8
                            ];
                        };
                    }
                ];
            };
        },
        {
            "name": "VoteChoice";
            "type": {
                "kind": "struct";
                "fields": [
                    {
                        "name": "rank";
                        "type": "u8";
                    },
                    {
                        "name": "weightPercentage";
                        "type": "u8";
                    }
                ];
            };
        },
        {
            "name": "Reserved110";
            "type": {
                "kind": "struct";
                "fields": [
                    {
                        "name": "reserved64";
                        "type": {
                            "array": [
                                "u8",
                                64
                            ];
                        };
                    },
                    {
                        "name": "reserved32";
                        "type": {
                            "array": [
                                "u8",
                                32
                            ];
                        };
                    },
                    {
                        "name": "reserved14";
                        "type": {
                            "array": [
                                "u8",
                                14
                            ];
                        };
                    }
                ];
            };
        },
        {
            "name": "Reserved119";
            "type": {
                "kind": "struct";
                "fields": [
                    {
                        "name": "reserved64";
                        "type": {
                            "array": [
                                "u8",
                                64
                            ];
                        };
                    },
                    {
                        "name": "reserved32";
                        "type": {
                            "array": [
                                "u8",
                                32
                            ];
                        };
                    },
                    {
                        "name": "reserved23";
                        "type": {
                            "array": [
                                "u8",
                                23
                            ];
                        };
                    }
                ];
            };
        },
        {
            "name": "GovernanceAccountType";
            "type": {
                "kind": "enum";
                "variants": [
                    {
                        "name": "Uninitialized";
                    },
                    {
                        "name": "RealmV1";
                    },
                    {
                        "name": "TokenOwnerRecordV1";
                    },
                    {
                        "name": "GovernanceV1";
                    },
                    {
                        "name": "ProgramGovernanceV1";
                    },
                    {
                        "name": "ProposalV1";
                    },
                    {
                        "name": "SignatoryRecordV1";
                    },
                    {
                        "name": "VoteRecordV1";
                    },
                    {
                        "name": "ProposalInstructionV1";
                    },
                    {
                        "name": "MintGovernanceV1";
                    },
                    {
                        "name": "TokenGovernanceV1";
                    },
                    {
                        "name": "RealmConfig";
                    },
                    {
                        "name": "VoteRecordV2";
                    },
                    {
                        "name": "ProposalTransactionV2";
                    },
                    {
                        "name": "ProposalV2";
                    },
                    {
                        "name": "ProgramMetadata";
                    },
                    {
                        "name": "RealmV2";
                    },
                    {
                        "name": "TokenOwnerRecordV2";
                    },
                    {
                        "name": "GovernanceV2";
                    },
                    {
                        "name": "ProgramGovernanceV2";
                    },
                    {
                        "name": "MintGovernanceV2";
                    },
                    {
                        "name": "TokenGovernanceV2";
                    },
                    {
                        "name": "SignatoryRecordV2";
                    },
                    {
                        "name": "ProposalDeposit";
                    },
                    {
                        "name": "RequiredSignatory";
                    }
                ];
            };
        },
        {
            "name": "ProposalState";
            "type": {
                "kind": "enum";
                "variants": [
                    {
                        "name": "Draft";
                    },
                    {
                        "name": "SigningOff";
                    },
                    {
                        "name": "Voting";
                    },
                    {
                        "name": "Succeeded";
                    },
                    {
                        "name": "Executing";
                    },
                    {
                        "name": "Completed";
                    },
                    {
                        "name": "Cancelled";
                    },
                    {
                        "name": "Defeated";
                    },
                    {
                        "name": "ExecutingWithErrors";
                    },
                    {
                        "name": "Vetoed";
                    }
                ];
            };
        },
        {
            "name": "VoteThreshold";
            "type": {
                "kind": "enum";
                "variants": [
                    {
                        "name": "YesVotePercentage";
                        "fields": [
                            "u8"
                        ];
                    },
                    {
                        "name": "QuorumPercentage";
                        "fields": [
                            "u8"
                        ];
                    },
                    {
                        "name": "Disabled";
                    }
                ];
            };
        },
        {
            "name": "VoteTipping";
            "type": {
                "kind": "enum";
                "variants": [
                    {
                        "name": "Strict";
                    },
                    {
                        "name": "Early";
                    },
                    {
                        "name": "Disabled";
                    }
                ];
            };
        },
        {
            "name": "TransactionExecutionStatus";
            "type": {
                "kind": "enum";
                "variants": [
                    {
                        "name": "None";
                    },
                    {
                        "name": "Success";
                    },
                    {
                        "name": "Error";
                    }
                ];
            };
        },
        {
            "name": "InstructionExecutionFlags";
            "type": {
                "kind": "enum";
                "variants": [
                    {
                        "name": "None";
                    },
                    {
                        "name": "Ordered";
                    },
                    {
                        "name": "UseTransaction";
                    }
                ];
            };
        },
        {
            "name": "MintMaxVoterWeightSource";
            "type": {
                "kind": "enum";
                "variants": [
                    {
                        "name": "SupplyFraction";
                        "fields": [
                            "u64"
                        ];
                    },
                    {
                        "name": "Absolute";
                        "fields": [
                            "u64"
                        ];
                    }
                ];
            };
        },
        {
            "name": "VoteWeightV1";
            "type": {
                "kind": "enum";
                "variants": [
                    {
                        "name": "Yes";
                        "fields": [
                            "u64"
                        ];
                    },
                    {
                        "name": "No";
                        "fields": [
                            "u64"
                        ];
                    }
                ];
            };
        },
        {
            "name": "OptionVoteResult";
            "type": {
                "kind": "enum";
                "variants": [
                    {
                        "name": "None";
                    },
                    {
                        "name": "Succeeded";
                    },
                    {
                        "name": "Defeated";
                    }
                ];
            };
        },
        {
            "name": "VoteType";
            "type": {
                "kind": "enum";
                "variants": [
                    {
                        "name": "SingleChoice";
                    },
                    {
                        "name": "MultiChoice";
                        "fields": [
                            {
                                "name": "choice_type";
                                "type": {
                                    "defined": "MultiChoiceType";
                                };
                            },
                            {
                                "name": "min_voter_options";
                                "type": "u8";
                            },
                            {
                                "name": "max_voter_options";
                                "type": "u8";
                            },
                            {
                                "name": "max_winning_options";
                                "type": "u8";
                            }
                        ];
                    }
                ];
            };
        },
        {
            "name": "MultiChoiceType";
            "type": {
                "kind": "enum";
                "variants": [
                    {
                        "name": "FullWeight";
                    },
                    {
                        "name": "Weighted";
                    }
                ];
            };
        },
        {
            "name": "SetRealmAuthorityAction";
            "type": {
                "kind": "enum";
                "variants": [
                    {
                        "name": "SetUnchecked";
                    },
                    {
                        "name": "SetChecked";
                    },
                    {
                        "name": "Remove";
                    }
                ];
            };
        },
        {
            "name": "GovernanceInstructionV1";
            "type": {
                "kind": "enum";
                "variants": [
                    {
                        "name": "CreateRealm";
                        "fields": [
                            {
                                "name": "name";
                                "type": "string";
                            },
                            {
                                "name": "config_args";
                                "type": {
                                    "defined": "RealmConfigArgsV1";
                                };
                            }
                        ];
                    },
                    {
                        "name": "DepositGoverningTokens";
                        "fields": [
                            {
                                "name": "amount";
                                "type": "u64";
                            }
                        ];
                    }
                ];
            };
        },
        {
            "name": "GoverningTokenType";
            "type": {
                "kind": "enum";
                "variants": [
                    {
                        "name": "Liquid";
                    },
                    {
                        "name": "Membership";
                    },
                    {
                        "name": "Dormant";
                    }
                ];
            };
        },
        {
            "name": "Vote";
            "type": {
                "kind": "enum";
                "variants": [
                    {
                        "name": "Approve";
                        "fields": [
                            {
                                "vec": {
                                    "defined": "VoteChoice";
                                };
                            }
                        ];
                    },
                    {
                        "name": "Deny";
                    },
                    {
                        "name": "Abstain";
                    },
                    {
                        "name": "Veto";
                    }
                ];
            };
        },
        {
            "name": "VoteKind";
            "type": {
                "kind": "enum";
                "variants": [
                    {
                        "name": "Electorate";
                    },
                    {
                        "name": "Veto";
                    }
                ];
            };
        },
        {
            "name": "UnixTimestamp";
            "type": {
                "kind": "alias";
                "value": "i64";
            };
        },
        {
            "name": "Slot";
            "type": {
                "kind": "alias";
                "value": "u64";
            };
        }
    ];
    "errors": [
        {
            "code": 500;
            "name": "InvalidInstruction";
            "msg": "Invalid instruction passed to program";
        },
        {
            "code": 501;
            "name": "RealmAlreadyExists";
            "msg": "Realm with the given name and governing mints already exists";
        },
        {
            "code": 502;
            "name": "InvalidRealm";
            "msg": "Invalid realm";
        },
        {
            "code": 503;
            "name": "InvalidGoverningTokenMint";
            "msg": "Invalid Governing Token Mint";
        },
        {
            "code": 504;
            "name": "GoverningTokenOwnerMustSign";
            "msg": "Governing Token Owner must sign transaction";
        },
        {
            "code": 505;
            "name": "GoverningTokenOwnerOrDelegateMustSign";
            "msg": "Governing Token Owner or Delegate  must sign transaction";
        },
        {
            "code": 506;
            "name": "AllVotesMustBeRelinquishedToWithdrawGoverningTokens";
            "msg": "All votes must be relinquished to withdraw governing tokens";
        },
        {
            "code": 507;
            "name": "InvalidTokenOwnerRecordAccountAddress";
            "msg": "Invalid Token Owner Record account address";
        },
        {
            "code": 508;
            "name": "InvalidGoverningMintForTokenOwnerRecord";
            "msg": "Invalid GoverningMint for TokenOwnerRecord";
        },
        {
            "code": 509;
            "name": "InvalidRealmForTokenOwnerRecord";
            "msg": "Invalid Realm for TokenOwnerRecord";
        },
        {
            "code": 510;
            "name": "InvalidProposalForProposalTransaction";
            "msg": "Invalid Proposal for ProposalTransaction,";
        },
        {
            "code": 511;
            "name": "InvalidSignatoryAddress";
            "msg": "Invalid Signatory account address";
        },
        {
            "code": 512;
            "name": "SignatoryAlreadySignedOff";
            "msg": "Signatory already signed off";
        },
        {
            "code": 513;
            "name": "SignatoryMustSign";
            "msg": "Signatory must sign";
        },
        {
            "code": 514;
            "name": "InvalidProposalOwnerAccount";
            "msg": "Invalid Proposal Owner";
        },
        {
            "code": 515;
            "name": "InvalidProposalForVoterRecord";
            "msg": "Invalid Proposal for VoterRecord";
        },
        {
            "code": 516;
            "name": "InvalidGoverningTokenOwnerForVoteRecord";
            "msg": "Invalid GoverningTokenOwner for VoteRecord";
        },
        {
            "code": 517;
            "name": "InvalidVoteThresholdPercentage";
            "msg": "Invalid Governance config: Vote threshold percentage out of range";
        },
        {
            "code": 518;
            "name": "ProposalAlreadyExists";
            "msg": "Proposal for the given Governance, Governing Token Mint and index already exists";
        },
        {
            "code": 519;
            "name": "VoteAlreadyExists";
            "msg": "Token Owner already voted on the Proposal";
        },
        {
            "code": 520;
            "name": "NotEnoughTokensToCreateProposal";
            "msg": "Owner doesn't have enough governing tokens to create Proposal";
        },
        {
            "code": 521;
            "name": "InvalidStateCannotEditSignatories";
            "msg": "Invalid State: Can't edit Signatories";
        },
        {
            "code": 522;
            "name": "InvalidProposalState";
            "msg": "Invalid Proposal state";
        },
        {
            "code": 523;
            "name": "InvalidStateCannotEditTransactions";
            "msg": "Invalid State: Can't edit transactions";
        },
        {
            "code": 524;
            "name": "InvalidStateCannotExecuteTransaction";
            "msg": "Invalid State: Can't execute transaction";
        },
        {
            "code": 525;
            "name": "CannotExecuteTransactionWithinHoldUpTime";
            "msg": "Can't execute transaction within its hold up time";
        },
        {
            "code": 526;
            "name": "TransactionAlreadyExecuted";
            "msg": "Transaction already executed";
        },
        {
            "code": 527;
            "name": "InvalidTransactionIndex";
            "msg": "Invalid Transaction index";
        },
        {
            "code": 528;
            "name": "TransactionHoldUpTimeBelowRequiredMin";
            "msg": "Transaction hold up time is below the min specified by Governance";
        },
        {
            "code": 529;
            "name": "TransactionAlreadyExists";
            "msg": "Transaction at the given index for the Proposal already exists";
        },
        {
            "code": 530;
            "name": "InvalidStateCannotSignOff";
            "msg": "Invalid State: Can't sign off";
        },
        {
            "code": 531;
            "name": "InvalidStateCannotVote";
            "msg": "Invalid State: Can't vote";
        },
        {
            "code": 532;
            "name": "InvalidStateCannotFinalize";
            "msg": "Invalid State: Can't finalize vote";
        },
        {
            "code": 533;
            "name": "InvalidStateCannotCancelProposal";
            "msg": "Invalid State: Can't cancel Proposal";
        },
        {
            "code": 534;
            "name": "VoteAlreadyRelinquished";
            "msg": "Vote already relinquished";
        },
        {
            "code": 535;
            "name": "CannotFinalizeVotingInProgress";
            "msg": "Can't finalize vote. Voting still in progress";
        },
        {
            "code": 536;
            "name": "ProposalVotingTimeExpired";
            "msg": "Proposal voting time expired";
        },
        {
            "code": 537;
            "name": "InvalidSignatoryMint";
            "msg": "Invalid Signatory Mint";
        },
        {
            "code": 538;
            "name": "InvalidGovernanceForProposal";
            "msg": "Proposal does not belong to the given Governance";
        },
        {
            "code": 539;
            "name": "InvalidGoverningMintForProposal";
            "msg": "Proposal does not belong to given Governing Mint";
        },
        {
            "code": 540;
            "name": "MintAuthorityMustSign";
            "msg": "Current mint authority must sign transaction";
        },
        {
            "code": 541;
            "name": "InvalidMintAuthority";
            "msg": "Invalid mint authority";
        },
        {
            "code": 542;
            "name": "MintHasNoAuthority";
            "msg": "Mint has no authority";
        },
        {
            "code": 543;
            "name": "SplTokenAccountWithInvalidOwner";
            "msg": "Invalid Token account owner";
        },
        {
            "code": 544;
            "name": "SplTokenMintWithInvalidOwner";
            "msg": "Invalid Mint account owner";
        },
        {
            "code": 545;
            "name": "SplTokenAccountNotInitialized";
            "msg": "Token Account is not initialized";
        },
        {
            "code": 546;
            "name": "SplTokenAccountDoesNotExist";
            "msg": "Token Account doesn't exist";
        },
        {
            "code": 547;
            "name": "SplTokenInvalidTokenAccountData";
            "msg": "Token account data is invalid";
        },
        {
            "code": 548;
            "name": "SplTokenInvalidMintAccountData";
            "msg": "Token mint account data is invalid";
        },
        {
            "code": 549;
            "name": "SplTokenMintNotInitialized";
            "msg": "Token Mint account is not initialized";
        },
        {
            "code": 550;
            "name": "SplTokenMintDoesNotExist";
            "msg": "Token Mint account doesn't exist";
        },
        {
            "code": 551;
            "name": "InvalidProgramDataAccountAddress";
            "msg": "Invalid ProgramData account address";
        },
        {
            "code": 552;
            "name": "InvalidProgramDataAccountData";
            "msg": "Invalid ProgramData account Data";
        },
        {
            "code": 553;
            "name": "InvalidUpgradeAuthority";
            "msg": "Provided upgrade authority doesn't match current program upgrade authority";
        },
        {
            "code": 554;
            "name": "UpgradeAuthorityMustSign";
            "msg": "Current program upgrade authority must sign transaction";
        },
        {
            "code": 555;
            "name": "ProgramNotUpgradable";
            "msg": "Given program is not upgradable";
        },
        {
            "code": 556;
            "name": "InvalidTokenOwner";
            "msg": "Invalid token owner";
        },
        {
            "code": 557;
            "name": "TokenOwnerMustSign";
            "msg": "Current token owner must sign transaction";
        },
        {
            "code": 558;
            "name": "VoteThresholdTypeNotSupported";
            "msg": "Given VoteThresholdType is not supported";
        },
        {
            "code": 559;
            "name": "VoteWeightSourceNotSupported";
            "msg": "Given VoteWeightSource is not supported";
        },
        {
            "code": 560;
            "name": "Legacy1";
            "msg": "Legacy1";
        },
        {
            "code": 561;
            "name": "GovernancePdaMustSign";
            "msg": "Governance PDA must sign";
        },
        {
            "code": 562;
            "name": "TransactionAlreadyFlaggedWithError";
            "msg": "Transaction already flagged with error";
        },
        {
            "code": 563;
            "name": "InvalidRealmForGovernance";
            "msg": "Invalid Realm for Governance";
        },
        {
            "code": 564;
            "name": "InvalidAuthorityForRealm";
            "msg": "Invalid Authority for Realm";
        },
        {
            "code": 565;
            "name": "RealmHasNoAuthority";
            "msg": "Realm has no authority";
        },
        {
            "code": 566;
            "name": "RealmAuthorityMustSign";
            "msg": "Realm authority must sign";
        },
        {
            "code": 567;
            "name": "InvalidGoverningTokenHoldingAccount";
            "msg": "Invalid governing token holding account";
        },
        {
            "code": 568;
            "name": "RealmCouncilMintChangeIsNotSupported";
            "msg": "Realm council mint change is not supported";
        },
        {
            "code": 569;
            "name": "InvalidMaxVoterWeightAbsoluteValue";
            "msg": "Invalid max voter weight absolute value";
        },
        {
            "code": 570;
            "name": "InvalidMaxVoterWeightSupplyFraction";
            "msg": "Invalid max voter weight supply fraction";
        },
        {
            "code": 571;
            "name": "NotEnoughTokensToCreateGovernance";
            "msg": "Owner doesn't have enough governing tokens to create Governance";
        },
        {
            "code": 572;
            "name": "TooManyOutstandingProposals";
            "msg": "Too many outstanding proposals";
        },
        {
            "code": 573;
            "name": "AllProposalsMustBeFinalisedToWithdrawGoverningTokens";
            "msg": "All proposals must be finalized to withdraw governing tokens";
        },
        {
            "code": 574;
            "name": "InvalidVoterWeightRecordForRealm";
            "msg": "Invalid VoterWeightRecord for Realm";
        },
        {
            "code": 575;
            "name": "InvalidVoterWeightRecordForGoverningTokenMint";
            "msg": "Invalid VoterWeightRecord for GoverningTokenMint";
        },
        {
            "code": 576;
            "name": "InvalidVoterWeightRecordForTokenOwner";
            "msg": "Invalid VoterWeightRecord for TokenOwner";
        },
        {
            "code": 577;
            "name": "VoterWeightRecordExpired";
            "msg": "VoterWeightRecord expired";
        },
        {
            "code": 578;
            "name": "InvalidRealmConfigForRealm";
            "msg": "Invalid RealmConfig for Realm";
        },
        {
            "code": 579;
            "name": "TokenOwnerRecordAlreadyExists";
            "msg": "TokenOwnerRecord already exists";
        },
        {
            "code": 580;
            "name": "GoverningTokenDepositsNotAllowed";
            "msg": "Governing token deposits not allowed";
        },
        {
            "code": 581;
            "name": "InvalidVoteChoiceWeightPercentage";
            "msg": "Invalid vote choice weight percentage";
        },
        {
            "code": 582;
            "name": "VoteTypeNotSupported";
            "msg": "Vote type not supported";
        },
        {
            "code": 583;
            "name": "InvalidProposalOptions";
            "msg": "Invalid proposal options";
        },
        {
            "code": 584;
            "name": "ProposalIsNotExecutable";
            "msg": "Proposal is not not executable";
        },
        {
            "code": 585;
            "name": "DenyVoteIsNotAllowed";
            "msg": "Deny vote is not allowed";
        },
        {
            "code": 586;
            "name": "CannotExecuteDefeatedOption";
            "msg": "Cannot execute defeated option";
        },
        {
            "code": 587;
            "name": "VoterWeightRecordInvalidAction";
            "msg": "VoterWeightRecord invalid action";
        },
        {
            "code": 588;
            "name": "VoterWeightRecordInvalidActionTarget";
            "msg": "VoterWeightRecord invalid action target";
        },
        {
            "code": 589;
            "name": "InvalidMaxVoterWeightRecordForRealm";
            "msg": "Invalid MaxVoterWeightRecord for Realm";
        },
        {
            "code": 590;
            "name": "InvalidMaxVoterWeightRecordForGoverningTokenMint";
            "msg": "Invalid MaxVoterWeightRecord for GoverningTokenMint";
        },
        {
            "code": 591;
            "name": "MaxVoterWeightRecordExpired";
            "msg": "MaxVoterWeightRecord expired";
        },
        {
            "code": 592;
            "name": "NotSupportedVoteType";
            "msg": "Not supported VoteType";
        },
        {
            "code": 593;
            "name": "RealmConfigChangeNotAllowed";
            "msg": "RealmConfig change not allowed";
        },
        {
            "code": 594;
            "name": "GovernanceConfigChangeNotAllowed";
            "msg": "GovernanceConfig change not allowed";
        },
        {
            "code": 595;
            "name": "AtLeastOneVoteThresholdRequired";
            "msg": "At least one VoteThreshold is required";
        },
        {
            "code": 596;
            "name": "ReservedBufferMustBeEmpty";
            "msg": "Reserved buffer must be empty";
        },
        {
            "code": 597;
            "name": "CannotRelinquishInFinalizingState";
            "msg": "Cannot Relinquish in Finalizing state";
        },
        {
            "code": 598;
            "name": "InvalidRealmConfigAddress";
            "msg": "Invalid RealmConfig account address";
        },
        {
            "code": 599;
            "name": "CannotDepositDormantTokens";
            "msg": "Cannot deposit dormant tokens";
        },
        {
            "code": 600;
            "name": "CannotWithdrawMembershipTokens";
            "msg": "Cannot withdraw membership tokens";
        },
        {
            "code": 601;
            "name": "CannotRevokeGoverningTokens";
            "msg": "Cannot revoke GoverningTokens";
        },
        {
            "code": 602;
            "name": "InvalidRevokeAmount";
            "msg": "Invalid Revoke amount";
        },
        {
            "code": 603;
            "name": "InvalidGoverningTokenSource";
            "msg": "Invalid GoverningToken source";
        },
        {
            "code": 604;
            "name": "CannotChangeCommunityTokenTypeToMembership";
            "msg": "Cannot change community TokenType to Membership";
        },
        {
            "code": 605;
            "name": "VoterWeightThresholdDisabled";
            "msg": "Voter weight threshold disabled";
        },
        {
            "code": 606;
            "name": "VoteNotAllowedInCoolOffTime";
            "msg": "Vote not allowed in cool off time";
        },
        {
            "code": 607;
            "name": "CannotRefundProposalDeposit";
            "msg": "Cannot refund ProposalDeposit";
        },
        {
            "code": 608;
            "name": "InvalidProposalForProposalDeposit";
            "msg": "Invalid Proposal for ProposalDeposit";
        },
        {
            "code": 609;
            "name": "InvalidDepositExemptProposalCount";
            "msg": "Invalid deposit_exempt_proposal_count";
        },
        {
            "code": 610;
            "name": "GoverningTokenMintNotAllowedToVote";
            "msg": "GoverningTokenMint not allowed to vote";
        },
        {
            "code": 611;
            "name": "InvalidDepositPayerForProposalDeposit";
            "msg": "Invalid deposit Payer for ProposalDeposit";
        },
        {
            "code": 612;
            "name": "InvalidStateNotFinal";
            "msg": "Invalid State: Proposal is not in final state";
        },
        {
            "code": 613;
            "name": "InvalidStateToCompleteProposal";
            "msg": "Invalid state for proposal state transition to Completed";
        },
        {
            "code": 614;
            "name": "InvalidNumberOfVoteChoices";
            "msg": "Invalid number of vote choices";
        },
        {
            "code": 615;
            "name": "RankedVoteIsNotSupported";
            "msg": "Ranked vote is not supported";
        },
        {
            "code": 616;
            "name": "ChoiceWeightMustBe100Percent";
            "msg": "Choice weight must be 100%";
        },
        {
            "code": 617;
            "name": "SingleChoiceOnlyIsAllowed";
            "msg": "Single choice only is allowed";
        },
        {
            "code": 618;
            "name": "AtLeastSingleChoiceIsRequired";
            "msg": "At least single choice is required";
        },
        {
            "code": 619;
            "name": "TotalVoteWeightMustBe100Percent";
            "msg": "Total vote weight must be 100%";
        },
        {
            "code": 620;
            "name": "InvalidMultiChoiceProposalParameters";
            "msg": "Invalid multi choice proposal parameters";
        },
        {
            "code": 621;
            "name": "InvalidGovernanceForRequiredSignatory";
            "msg": "Invalid Governance for RequiredSignatory";
        },
        {
            "code": 622;
            "name": "SignatoryRecordAlreadyExists";
            "msg": "Signatory Record has already been created";
        },
        {
            "code": 623;
            "name": "InstructionDeprecated";
            "msg": "Instruction has been removed";
        },
        {
            "code": 624;
            "name": "MissingRequiredSignatories";
            "msg": "Proposal is missing required signatories";
        }
    ];
    "metadata": {
        "origin": "shank";
        "address": "GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw";
    };
};
type ChatIdl = {
    "version": "0.2.9";
    "name": "spl_governance_chat";
    "instructions": [
        {
            "name": "postMessage";
            "accounts": [
                {
                    "name": "governanceProgramId";
                    "isMut": false;
                    "isSigner": false;
                },
                {
                    "name": "realmAccount";
                    "isMut": false;
                    "isSigner": false;
                },
                {
                    "name": "governanceAccount";
                    "isMut": false;
                    "isSigner": false;
                },
                {
                    "name": "proposalAccount";
                    "isMut": false;
                    "isSigner": false;
                },
                {
                    "name": "tokenOwnerRecord";
                    "isMut": false;
                    "isSigner": false;
                },
                {
                    "name": "governanceAuthority";
                    "isMut": false;
                    "isSigner": true;
                    "docs": [
                        "token owner or governance delegate"
                    ];
                },
                {
                    "name": "chatMessage";
                    "isMut": true;
                    "isSigner": true;
                },
                {
                    "name": "payer";
                    "isMut": true;
                    "isSigner": true;
                },
                {
                    "name": "systemProgram";
                    "isMut": false;
                    "isSigner": false;
                },
                {
                    "name": "replyToMessage";
                    "isMut": false;
                    "isSigner": false;
                    "isOptional": true;
                },
                {
                    "name": "realmConfigAccount";
                    "isMut": false;
                    "isSigner": false;
                },
                {
                    "name": "voterWeightRecord";
                    "isMut": false;
                    "isSigner": false;
                    "isOptional": true;
                }
            ];
            "args": [
                {
                    "name": "body";
                    "type": {
                        "defined": "MessageBody";
                    };
                },
                {
                    "name": "isReply";
                    "type": "bool";
                }
            ];
            "discriminant": {
                "type": "u8";
                "value": 0;
            };
        }
    ];
    "accounts": [
        {
            "name": "chatMessage";
            "type": {
                "kind": "struct";
                "fields": [
                    {
                        "name": "accountType";
                        "type": {
                            "defined": "GovernanceChatAccountType";
                        };
                    },
                    {
                        "name": "proposal";
                        "type": "publicKey";
                    },
                    {
                        "name": "author";
                        "type": "publicKey";
                    },
                    {
                        "name": "postedAt";
                        "type": {
                            "defined": "UnixTimestamp";
                        };
                    },
                    {
                        "name": "replyTo";
                        "type": {
                            "option": "publicKey";
                        };
                    },
                    {
                        "name": "body";
                        "type": {
                            "defined": "MessageBody";
                        };
                    }
                ];
            };
        }
    ];
    "types": [
        {
            "name": "GovernanceChatAccountType";
            "type": {
                "kind": "enum";
                "variants": [
                    {
                        "name": "Uninitialized";
                    },
                    {
                        "name": "ChatMessage";
                    }
                ];
            };
        },
        {
            "name": "MessageBody";
            "type": {
                "kind": "enum";
                "variants": [
                    {
                        "name": "Text";
                        "fields": [
                            "string"
                        ];
                    },
                    {
                        "name": "Reaction";
                        "fields": [
                            "string"
                        ];
                    }
                ];
            };
        },
        {
            "name": "UnixTimestamp";
            "type": {
                "kind": "alias";
                "value": "i64";
            };
        }
    ];
    "errors": [
        {
            "code": 900;
            "name": "NotEnoughTokensToCommentProposal";
            "msg": "Owner doesn't have enough governing tokens to comment on Proposal";
        },
        {
            "code": 901;
            "name": "AccountAlreadyInitialized";
            "msg": "Account already initialized";
        }
    ];
    "metadata": {
        "origin": "shank";
        "address": "gCHAtYKrUUktTVzE4hEnZdLV4LXrdBf6Hh9qMaJALET";
    };
};
type AddinIdl = {
    "version": "0.1.4";
    "name": "spl_governance_addin_api";
    "instructions": [];
    "accounts": [
        {
            "name": "maxVoterWeightRecord";
            "type": {
                "kind": "struct";
                "fields": [
                    {
                        "name": "accountDiscriminator";
                        "type": {
                            "array": [
                                "u8",
                                8
                            ];
                        };
                    },
                    {
                        "name": "realm";
                        "type": "publicKey";
                    },
                    {
                        "name": "governingTokenMint";
                        "type": "publicKey";
                    },
                    {
                        "name": "maxVoterWeight";
                        "type": "u64";
                    },
                    {
                        "name": "maxVoterWeightExpiry";
                        "type": {
                            "option": {
                                "defined": "Slot";
                            };
                        };
                    },
                    {
                        "name": "reserved";
                        "type": {
                            "array": [
                                "u8",
                                8
                            ];
                        };
                    }
                ];
            };
        },
        {
            "name": "voterWeightRecord";
            "type": {
                "kind": "struct";
                "fields": [
                    {
                        "name": "accountDiscriminator";
                        "type": {
                            "array": [
                                "u8",
                                8
                            ];
                        };
                    },
                    {
                        "name": "realm";
                        "type": "publicKey";
                    },
                    {
                        "name": "governingTokenMint";
                        "type": "publicKey";
                    },
                    {
                        "name": "governingTokenOwner";
                        "type": "publicKey";
                    },
                    {
                        "name": "voterWeight";
                        "type": "u64";
                    },
                    {
                        "name": "voterWeightExpiry";
                        "type": {
                            "option": {
                                "defined": "Slot";
                            };
                        };
                    },
                    {
                        "name": "weightAction";
                        "type": {
                            "option": {
                                "defined": "VoterWeightAction";
                            };
                        };
                    },
                    {
                        "name": "weightActionTarget";
                        "type": {
                            "option": "publicKey";
                        };
                    },
                    {
                        "name": "reserved";
                        "type": {
                            "array": [
                                "u8",
                                8
                            ];
                        };
                    }
                ];
            };
        }
    ];
    "types": [
        {
            "name": "VoterWeightAction";
            "type": {
                "kind": "enum";
                "variants": [
                    {
                        "name": "CastVote";
                    },
                    {
                        "name": "CommentProposal";
                    },
                    {
                        "name": "CreateGovernance";
                    },
                    {
                        "name": "CreateProposal";
                    },
                    {
                        "name": "SignOffProposal";
                    }
                ];
            };
        },
        {
            "name": "Slot";
            "type": {
                "kind": "alias";
                "value": "u64";
            };
        }
    ];
};

type Pda = {
    publicKey: PublicKey;
    bump: number;
};
declare class PdaClient {
    private readonly programId;
    constructor(programId: PublicKey);
    realmAccount({ name }: {
        name: string;
    }): Pda;
    communityTokenHoldingAccount({ realmAccount, communityMint }: {
        realmAccount: PublicKey;
        communityMint: PublicKey;
    }): Pda;
    councilTokenHoldingAccount({ realmAccount, councilMint }: {
        realmAccount: PublicKey;
        councilMint: PublicKey;
    }): Pda;
    realmConfigAccount({ realmAccount }: {
        realmAccount: PublicKey;
    }): Pda;
    tokenOwnerRecordAccount({ realmAccount, governingTokenMintAccount, governingTokenOwner }: {
        realmAccount: PublicKey;
        governingTokenMintAccount: PublicKey;
        governingTokenOwner: PublicKey;
    }): Pda;
    governingTokenHoldingAccount({ realmAccount, governingTokenMintAccount }: {
        realmAccount: PublicKey;
        governingTokenMintAccount: PublicKey;
    }): {
        publicKey: PublicKey;
        bump: number;
    };
    governanceAccount({ realmAccount, seed }: {
        realmAccount: PublicKey;
        seed: PublicKey;
    }): {
        publicKey: PublicKey;
        bump: number;
    };
    nativeTreasuryAccount({ governanceAccount }: {
        governanceAccount: PublicKey;
    }): {
        publicKey: PublicKey;
        bump: number;
    };
    proposalAccount({ governanceAccount, governingTokenMint, proposalSeed }: {
        governanceAccount: PublicKey;
        governingTokenMint: PublicKey;
        proposalSeed: PublicKey;
    }): {
        publicKey: PublicKey;
        bump: number;
    };
    proposalDepositAccount({ proposal, depositPayer }: {
        proposal: PublicKey;
        depositPayer: PublicKey;
    }): {
        publicKey: PublicKey;
        bump: number;
    };
    signatoryRecordAccount({ proposal, signatory }: {
        proposal: PublicKey;
        signatory: PublicKey;
    }): {
        publicKey: PublicKey;
        bump: number;
    };
    proposalTransactionAccount({ proposal, optionIndex, index }: {
        proposal: PublicKey;
        optionIndex: number;
        index: number;
    }): {
        publicKey: PublicKey;
        bump: number;
    };
    voteRecordAccount({ proposal, tokenOwnerRecord }: {
        proposal: PublicKey;
        tokenOwnerRecord: PublicKey;
    }): {
        publicKey: PublicKey;
        bump: number;
    };
    requiredSignatoryAccount({ governanceAccount, signatory }: {
        governanceAccount: PublicKey;
        signatory: PublicKey;
    }): {
        publicKey: PublicKey;
        bump: number;
    };
}

type MintMaxVoteWeightSource = {
    type: "supplyFraction" | "absolute";
    amount: BN;
};
type multiChoiceOptionsType = {
    choiceType: "fullWeight" | "weighted";
    minVoterOptions: number;
    maxVoterOptions: number;
    maxWinningOptions: number;
};
type VoteType = {
    choiceType: "single" | "multi";
    multiChoiceOptions: multiChoiceOptionsType | null;
};
type TypeDefDictionary<T extends IdlTypeDef[], Defined> = {
    [K in T[number]["name"]]: TypeDef<T[number] & {
        name: K;
    }, Defined> & {
        publicKey: PublicKey;
    };
};
type IdlAccountsWithPubkey<I extends Idl> = TypeDefDictionary<NonNullable<I["accounts"]>, IdlTypes<I>>;
type SetRealmAuthorityAction = IdlTypes<GovernanceIdl>["SetRealmAuthorityAction"];
type RealmConfigArgs = IdlTypes<GovernanceIdl>["RealmConfigArgs"];
type InstructionData = IdlTypes<GovernanceIdl>["InstructionData"];
type ProposalOption = IdlTypes<GovernanceIdl>["ProposalOption"];
type Vote = IdlTypes<GovernanceIdl>["Vote"];
type VoteChoice = IdlTypes<GovernanceIdl>["VoteChoice"];
type GovernanceConfigMut = IdlTypes<GovernanceIdl>["GovernanceConfig"];
interface GovernanceConfig extends Omit<GovernanceConfigMut, 'minCommunityWeightToCreateProposal' | 'minCouncilWeightToCreateProposal'> {
    minCommunityWeightToCreateProposal: BN | number;
    minCouncilWeightToCreateProposal: BN | number;
}
type MessageBody = IdlTypes<ChatIdl>["MessageBody"];
type RealmsV2Account = IdlAccounts<GovernanceIdl>["realmV2"];
interface RealmV2 extends RealmsV2Account {
    publicKey: PublicKey;
}
type RealmV1 = IdlAccountsWithPubkey<GovernanceIdl>["realmV1"];
type RealmConfig = IdlAccountsWithPubkey<GovernanceIdl>["realmConfigAccount"];
type TokenOwnerRecord = IdlAccountsWithPubkey<GovernanceIdl>["tokenOwnerRecordV2"];
type GovernanceAccount = IdlAccountsWithPubkey<GovernanceIdl>["governanceV2"];
type GovernanceV1 = IdlAccountsWithPubkey<GovernanceIdl>["governanceV1"];
type ProposalV2 = IdlAccountsWithPubkey<GovernanceIdl>["proposalV2"];
type ProposalV1 = IdlAccountsWithPubkey<GovernanceIdl>["proposalV1"];
type ProposalDeposit = IdlAccountsWithPubkey<GovernanceIdl>["proposalDeposit"];
type ProposalTransaction = IdlAccountsWithPubkey<GovernanceIdl>["proposalTransactionV2"];
type ProposalInstruction = IdlAccountsWithPubkey<GovernanceIdl>["proposalInstructionV1"];
type SignatoryRecord = IdlAccountsWithPubkey<GovernanceIdl>["signatoryRecordV2"];
type VoteRecord = IdlAccountsWithPubkey<GovernanceIdl>["voteRecordV2"];
type VoteRecordV1 = IdlAccountsWithPubkey<GovernanceIdl>["voteRecordV1"];
type ChatMessage = IdlAccountsWithPubkey<ChatIdl>["chatMessage"];
type VoterWeightRecord = IdlAccountsWithPubkey<AddinIdl>["voterWeightRecord"];
type MaxVoterWeightRecord = IdlAccountsWithPubkey<AddinIdl>["maxVoterWeightRecord"];

declare const DEFAULT_PROGRAM_ID: PublicKey;
declare const DEFAULT_CHAT_PROGRAM_ID: PublicKey;

declare class SplGovernance {
    readonly programId: PublicKey;
    readonly connection: Connection;
    readonly program: Program<GovernanceIdl>;
    readonly pda: PdaClient;
    private readonly _provider;
    constructor(connection: Connection, programId?: PublicKey);
    /** Get realm account from its public key
     *
     * @param realmAccount The public key of the realm account
     * @returns Realm account
     */
    getRealmByPubkey(realmAccount: PublicKey): Promise<RealmV2>;
    /** Get realm account from the name
     *
     * @param name The name of the Realm
     * @returns Realm account
     */
    getRealmByName(name: string): Promise<RealmV2>;
    /** Get all the realm accounts
     *
     * @returns all Realm accounts
     */
    getAllRealms(): Promise<RealmV2[]>;
    /** Get Realm accounts from the community mint
     *
     * @param communityMint Mint address of the token used as the community token
     * @returns Realms using the given token as the community mint
     */
    getRealmsByCommunityMint(communityMint: PublicKey): Promise<RealmV2[]>;
    /** Get realm account V1 from its public key
     *
     * @param realmAccount The public key of the realm account
     * @returns Realm account
     */
    getRealmV1ByPubkey(realmAccount: PublicKey): Promise<RealmV1>;
    /** Get realm account V1 from the name
     *
     * @param name The name of the Realm
     * @returns Realm account
     */
    getRealmV1ByName(name: string): Promise<RealmV1>;
    /** Get all the V1 realm accounts
     *
     * @returns all Realm accounts
     */
    getAllV1Realms(): Promise<RealmV1[]>;
    /** Get V1 Realm accounts from the community mint
     *
     * @param communityMint Mint address of the token used as the community token
     * @returns Realms using the given token as the community mint
     */
    getV1RealmsByCommunityMint(communityMint: PublicKey): Promise<RealmV1[]>;
    /** Get Realm config account from its public key
     *
     * @param realmConfigAddress The public key of the Realm Config Account
     * @returns Realm Config Account
     */
    getRealmConfigByPubkey(realmConfigAddress: PublicKey): Promise<RealmConfig>;
    /** Get Realm config account from the realm account's public key
     *
     * @param realmAccount The public key of the Realm Account
     * @returns Realm Config Account
     */
    getRealmConfigByRealm(realmAccount: PublicKey): Promise<RealmConfig>;
    /** Get all Realm config accounts
     *
     * @returns Realm Config Accounts
     */
    getAllRealmConfigs(): Promise<RealmConfig[]>;
    /** Get Token Owner Record Account from its public key
     *
     * @param tokenOwnerRecordAddress The public key of the Token Owner Record account
     * @returns Token Owner Record account
     */
    getTokenOwnerRecordByPubkey(tokenOwnerRecordAddress: PublicKey): Promise<TokenOwnerRecord>;
    /** Get Token Owner Record Account
     *
     * @param realmAccount The public key of the Realm Account
     * @param tokenOwner The public key of the owner
     * @param tokenMint The token address (either community mint or council mint)
     * @returns Token Owner Record Account
     */
    getTokenOwnerRecord(realmAccount: PublicKey, tokenOwner: PublicKey, tokenMint: PublicKey): Promise<TokenOwnerRecord>;
    /** Get all the token owner records for the given realm
     *
     * @param realmAccount The public key of the Realm Account
     * @returns all Token Owner Records for the given realm account
     */
    getTokenOwnerRecordsForRealm(realmAccount: PublicKey): Promise<TokenOwnerRecord[]>;
    /** Get all the token owner record addresses for the given realm
     *
     * @param realmAccount The public key of the Realm Account
     * @returns all Token Owner Record Addresses for the given realm account
     */
    getTokenOwnerRecordAddressesForRealm(realmAccount: PublicKey): Promise<PublicKey[]>;
    /** Get all the token owner records for the given owner
     *
     * @param tokenOwner The public key of the user whose token owner records to fetch
     * @returns all Token Owner Records for the given owner
     */
    getTokenOwnerRecordsForOwner(tokenOwner: PublicKey): Promise<TokenOwnerRecord[]>;
    /** Get all the token owner records for the given mint
     *
     * @param tokenMint Mint address of the token whose token owner records to fetch
     * @returns all Token Owner Records for the given mint
     */
    getTokenOwnerRecordsForMint(tokenMint: PublicKey): Promise<TokenOwnerRecord[]>;
    /** Get all the token owner records
     *
     * @returns all Token Owner Records accounts
     */
    getAllTokenOwnerRecords(): Promise<TokenOwnerRecord[]>;
    /** Get all the token owner records with user as delegate in the given realm
     *
     * @param realmAccount The public key of the Realm Account
     * @param delegateAddress The public key of the delegate
     * @param tokenMint (optional) the mint address
     * @returns all Token Owner Records for the given realm account
     */
    getDelegateRecordsForUserInRealm(realmAccount: PublicKey, delegateAddress: PublicKey, tokenMint?: PublicKey): Promise<TokenOwnerRecord[]>;
    /** Get Governance account from its public key
     *
     * @param governanceAccount The public key of the governance account
     * @returns Governance account
     */
    getGovernanceAccountByPubkey(governanceAccount: PublicKey): Promise<GovernanceAccount>;
    /** Get all the governance accounts for the realm
     *
     * @param realmAccount The public key of the Realm Account
     * @returns all Governance accounts for the given Realm
     */
    getGovernanceAccountsByRealm(realmAccount: PublicKey): Promise<GovernanceAccount[]>;
    /** Get V1 Governance account from its public key
     *
     * @param governanceAccount The public key of the governance account
     * @returns Governance account
     */
    getGovernanceAccountV1ByPubkey(governanceAccount: PublicKey): Promise<GovernanceV1>;
    /** Get all the V1 governance accounts for the realm
     *
     * @param realmAccount The public key of the Realm Account
     * @returns all Governance accounts for the given Realm
     */
    getV1GovernanceAccountsByRealm(realmAccount: PublicKey): Promise<GovernanceV1[]>;
    /** Get Proposal account from its public key
     *
     * @param proposalAccount The public key of the proposal account
     * @returns Proposal account
     */
    getProposalByPubkey(proposalAccount: PublicKey): Promise<ProposalV2>;
    /** Get all the proposal accounts for the Governance
     *
     * @param governanceAccount The public key of the Governance Account
     * @param onlyActive (optional) True if only wants to return the proposal accounts with `voting` state
     * @returns all Proposal accounts for the given Governance
     */
    getProposalsforGovernance(governanceAccount: PublicKey, onlyActive?: boolean): Promise<ProposalV2[]>;
    /** Get all the proposal accounts for a user in Realm
     *
     * @param tokenOwnerRecord The public key of the user's token owner record
     * @returns all Proposal accounts for the given user
     */
    getProposalsByTokenOwnerRecord(tokenOwnerRecord: PublicKey): Promise<ProposalV2[]>;
    /** Get all Proposals
     *
     * @returns all V2 Proposals accounts
     */
    getAllProposals(): Promise<ProposalV2[]>;
    /** Get all V1 Proposals
     *
     * @returns all V1 Proposals accounts
     */
    getAllV1Proposals(): Promise<ProposalV1[]>;
    /** Get Proposal Deposit account from its public key
     *
     * @param proposalDepositAccount The public key of the proposal deposit account
     * @returns Proposal Deposit account
     */
    getProposalDepositByPubkey(proposalDepositAccount: PublicKey): Promise<ProposalDeposit>;
    /** Get all Proposal Deposit accounts
     *
     * @returns Proposal Deposit accounts
     */
    getAllProposalDeposits(): Promise<ProposalDeposit[]>;
    /** Get proposal deposit accounts for the given proposal
     *
     * @param proposalAccount The public key of the proposal account
     * @returns proposal deposit accounts for the given proposal
     */
    getProposalDepositByProposal(proposalAccount: PublicKey): Promise<ProposalDeposit[]>;
    /** Get Proposal Transaction account from its public key
     *
     * @param proposalTransactionAccount The public key of the proposal transaction account
     * @returns Proposal Transaction account
     */
    getProposalTransactionByPubkey(proposalTransactionAccount: PublicKey): Promise<ProposalTransaction>;
    /** Get all proposal instruction accounts (v1)
     *
     * @returns proposal instruction accounts (v1)
     */
    getAllProposalInstructions(): Promise<ProposalInstruction[]>;
    /** Get proposal transaction accounts for the given proposal
     *
     * @param proposalAccount The public key of the proposal account
     * @returns proposal transaction accounts for the given proposal
     */
    getProposalTransactionsByProposal(proposalAccount: PublicKey): Promise<ProposalTransaction[]>;
    /** Get all proposal transaction accounts
     *
     * @returns proposal transaction accounts
     */
    getAllProposalTransactions(): Promise<ProposalTransaction[]>;
    /** Get Signatory Record from its public key
     *
     * @param signatoryRecordAddress The public key of the Signatory Record account
     * @returns Signatory Record account
     */
    getSignatoryRecordByPubkey(signatoryRecordAddress: PublicKey): Promise<SignatoryRecord>;
    /** Get Signatory Record account
     *
     * @param proposalAccount The public key of the Proposal account
     * @param signatory The signer's public key
     * @returns Signatory Record account
     */
    getSignatoryRecord(proposalAccount: PublicKey, signatory: PublicKey): Promise<SignatoryRecord>;
    /** Get all signatory records for the proposal
     *
     * @param proposalAccount The public key of the Proposal account
     * @returns all signatory records for the given proposal
     */
    getSignatoryRecordsForProposal(proposalAccount: PublicKey): Promise<SignatoryRecord[]>;
    /** Get all signatory records
     *
     * @returns all signatory records
     */
    getAllSignatoryRecords(): Promise<SignatoryRecord[]>;
    /** Get Vote Record from its public key
     *
     * @param voteRecordAddress The public key of the Vote Record account
     * @returns Vote Record account
     */
    getVoteRecordByPubkey(voteRecordAddress: PublicKey): Promise<VoteRecord>;
    /** Get Vote Record account
    *
    * @param proposalAccount The public key of the Proposal account
    * @param tokenOwnerRecord The public key of the voter's token owner record
    * @returns Vote Record account
    */
    getVoteRecord(proposalAccount: PublicKey, tokenOwnerRecord: PublicKey): Promise<VoteRecord>;
    /** Get all vote records for the proposal
     *
     * @param proposalAccount The public key of the Proposal account
     * @returns all vote records for the given proposal
     */
    getVoteRecordsForProposal(proposalAccount: PublicKey): Promise<VoteRecord[]>;
    /** Get all vote records for the voter
     *
     * @param voter The public key of the voter
     * @param unrelinquishedOnly (optional) If sets to true, only returns unrelinquished vote records
     * @returns all vote records for the given voter
     */
    getVoteRecordsForUser(voter: PublicKey, unrelinquishedOnly?: boolean): Promise<VoteRecord[]>;
    /** Get all vote records
     *
     * @returns all V2 vote records
     */
    getAllVoteRecords(): Promise<VoteRecord[]>;
    /** Get all V1 vote records
     *
     * @returns all V1 vote records
     */
    getAllV1VoteRecords(): Promise<VoteRecordV1[]>;
    /** Get Chat Message from its public key
    *
    * @param chatMessageAddress The public key of the Chat Message account
    * @returns Chat Message account
    */
    getChatMessageByPubkey(chatMessageAddress: PublicKey): Promise<ChatMessage>;
    /** Get Chat Messages for a proposal
     *
     * @param proposalAccount The public key of the Proposal account
     * @returns Chat Message accounts
     */
    getChatMessagesByProposal(proposalAccount: PublicKey): Promise<ChatMessage[]>;
    /** Get all Chat Messages
     *
     * @returns Chat Message accounts
     */
    getAllChatMessages(): Promise<ChatMessage[]>;
    /** Get Voter Weight Record
     *
     * @returns Voter Weight Record account
     */
    getVoterWeightRecord(voterWeightRecordAddress: PublicKey): Promise<VoterWeightRecord>;
    /** Get Voter Weight Record
     *
     * @returns Voter Weight Record account
     */
    getAllVoterWeightRecords(): Promise<VoterWeightRecord[]>;
    /** Get Max Voter Weight Record
    *
    * @returns Voter Weight Record account
    */
    getMaxVoterWeightRecord(maxVoterWeightRecordAddress: PublicKey): Promise<MaxVoterWeightRecord>;
    /**
     * Construct a CreateRealm Instruction
     *
     * @param name Name for the new realm (must be unique)
     * @param communityTokenMint Mint Account of the token to be used as community token
     * @param minCommunityWeightToCreateGovernance  Min number of community tokens required to create a governance
     * @param payer The payer of the transaction
     * @param communityMintMaxVoterWeightSource (Optional) The default value is `{type: "supplyFraction", amount: new BN(Math.pow(10,10))}`. Max vote weight type can either be `supplyFraction` or `absolute`. For supply fraction, the amount is in percentage with `10^10` precision, e.g. `100% becomes 10^10`. For absolute, the amount is in actual tokens.
     * @param councilTokenMint (Optional) Mint Account of the token to be used as council token. Council won't be created if this isn't provided
     * @param communityTokenType (Optional) The default value is `liquid`. Defines who retains the authority over deposited tokens and which token instructions are allowed. Liquid = token owner has the authority, deposit and withdrawal is allowed. Membership = Realm has the authority, deposit is allowed, withdrawal is not allowed. Dormant = Placeholder, signifies that the voting population is not yet active.
     * @param councilTokenType (Optional) The default value is `liquid`. Defines who retains the authority over deposited tokens and which token instructions are allowed. Liquid = token owner has the authority, deposit and withdrawal is allowed. Membership = Realm has the authority, deposit is allowed, withdrawal is not allowed. Dormant = Placeholder, signifies that the voting population is not yet active.
     *
     *  @return Instruction to add to a transaction
    */
    createRealmInstruction(name: string, communityTokenMint: PublicKey, minCommunityWeightToCreateGovernance: BN | number, payer: PublicKey, communityMintMaxVoterWeightSource?: MintMaxVoteWeightSource, councilTokenMint?: PublicKey, communityTokenType?: "liquid" | "membership" | "dormant", councilTokenType?: "liquid" | "membership" | "dormant", communityVoterWeightAddinProgramId?: PublicKey, maxCommunityVoterWeightAddinProgramId?: PublicKey, councilVoterWeightAddinProgramId?: PublicKey, maxCouncilVoterWeightAddinProgramId?: PublicKey): Promise<TransactionInstruction>;
    /**
     * Construct a DepositGoverningTokens Instruction
     *
     * @param realmAccount The realm account
     * @param governingTokenMintAccount The Mint Account of the governing token (either community token or council token) for which deposit is to be made
     * @param governingTokenSourceAccount  It can be either TokenAccount (if tokens are to be transferred) or MintAccount (if tokens are to be minted)
     * @param governingTokenOwner The owner of the governing token account
     * @param governingTokenSourceAuthority It should be owner for TokenAccount and mint_authority for MintAccount
     * @param payer The payer of the transaction
     * @param amount The amount to deposit into the realm
     *
     *  @return Instruction to add to a transaction
    */
    depositGoverningTokensInstruction(realmAccount: PublicKey, governingTokenMintAccount: PublicKey, governingTokenSourceAccount: PublicKey, governingTokenOwner: PublicKey, governingTokenSourceAuthority: PublicKey, payer: PublicKey, amount: BN | number): Promise<TransactionInstruction>;
    /**
     * Construct a WithdrawGoverningTokens Instruction
     *
     * @param realmAccount The realm account
     * @param governingTokenMintAccount The Mint Account of the governing token (either community token or council token) for which withdrawal is to be made
     * @param governingTokenDestinationAccount  The Token Account where tokens will be sent
     * @param governingTokenOwner The owner of the governing token account
     *
     *  @return Instruction to add to a transaction
    */
    withdrawGoverningTokensInstruction(realmAccount: PublicKey, governingTokenMintAccount: PublicKey, governingTokenDestinationAccount: PublicKey, governingTokenOwner: PublicKey): Promise<TransactionInstruction>;
    /**
     * Construct a SetGovernanceDelegate Instruction
     *
     * @param tokenOwnerRecord Token Owner Record Account, pda(realm, governing_token_mint, governing_token_owner)
     * @param currentDelegateOrOwner Current Governance Delegate or Governing Token owner
     * @param newGovernanceDelegate New Governance Delegate
     *
     *  @return Instruction to add to a transaction
    */
    setGovernanceDelegateInstruction(tokenOwnerRecord: PublicKey, currentDelegateOrOwner: PublicKey, newGovernanceDelegate: PublicKey | null): Promise<TransactionInstruction>;
    /**
     * Construct a CreateGovernance Instruction
     *
     * @param config Governance Config
     * @param realmAccount The Realm Account
     * @param governanceAuthority The authority of the given realm
     * @param tokenOwnerRecord Token Owner Record Account, pda(realm, governing_token_mint, governing_token_owner). Required only if the signer is not the realm authority
     * @param payer Payer of the transaction
     * @param governanceAccountSeed (Optional) Random public key to seed the governance account
     *
     * @return Instruction to add to a transaction
    */
    createGovernanceInstruction(config: GovernanceConfig, realmAccount: PublicKey, governanceAuthority: PublicKey, tokenOwnerRecord: PublicKey | undefined, payer: PublicKey, governanceAccountSeed?: PublicKey, voterWeightRecord?: PublicKey): Promise<TransactionInstruction>;
    /**
     * Construct a CreateProposal Instruction
     *
     * @param name Name of the proposal
     * @param descriptionLink link to the gist/brief description of the proposal
     * @param voteType Proposal Vote Type. Either Single Choice or Multi Choice
     * @param options The array of options
     * @param useDenyOption Indicates whether the proposal has the deny option
     * @param realmAccount The Realm Account
     * @param governanceAccount The governance account. pda(realm, governance seed)
     * @param tokenOwnerRecord Token Owner Record Account, pda(realm, governing_token_mint, governing_token_owner)
     * @param governingTokenMint The Mint Account of the governing token (either community token or council token) for which the proposal is created for
     * @param governanceAuthority Either the current delegate or governing token owner
     * @param payer Payer of the transaction
     * @param proposalSeed (Optional) Random public key to seed the proposal account
     *
     * @return Instruction to add to a transaction
    */
    createProposalInstruction(name: string, descriptionLink: string, voteType: VoteType, options: [string], useDenyOption: boolean, realmAccount: PublicKey, governanceAccount: PublicKey, tokenOwnerRecord: PublicKey, governingTokenMint: PublicKey, governanceAuthority: PublicKey, payer: PublicKey, proposalSeed?: PublicKey, voterWeightRecord?: PublicKey): Promise<TransactionInstruction>;
    /**
     * Construct a AddSignatory instruction
     *
     * @param signatory Signatory to add to the Proposal
     * @param proposalAccount Proposal account
     * @param tokenOwnerRecord Token Owner Record Account, pda(realm, governing_token_mint, governing_token_owner)
     * @param governanceAuthority Either the current delegate or governing token owner
     * @param payer Payer of the transaction
     *
     * @return Instruction to add to a transaction
    */
    addSignatoryInstruction(signatory: PublicKey, proposalAccount: PublicKey, tokenOwnerRecord: PublicKey, governanceAuthority: PublicKey, payer: PublicKey): Promise<TransactionInstruction>;
    /**
     * Construct a InsertTransaction instruction
     *
     * @param instructions Array of instructions to be inserted in the proposal
     * @param optionIndex The index of the proposal option this transaction is for
     * @param index The index where the transaction is to inserted
     * @param holdUpTime Waiting time (in seconds) between vote period ending and this being eligible for execution
     * @param governanceAccount The governance account. pda(realm, governance seed)
     * @param proposalAccount Proposal account
     * @param tokenOwnerRecord Token Owner Record Account, pda(realm, governing_token_mint, governing_token_owner)
     * @param governanceAuthority Either the current delegate or governing token owner
     * @param payer Payer of the transaction
     *
     * @return Instruction to add to a transaction
    */
    insertTransactionInstruction(instructions: TransactionInstruction[], optionIndex: number, index: number, holdUpTime: number, governanceAccount: PublicKey, proposalAccount: PublicKey, tokenOwnerRecord: PublicKey, governanceAuthority: PublicKey, payer: PublicKey): Promise<TransactionInstruction>;
    /**
     * Construct a RemoveTransaction instruction
     *
     * @param proposalAccount Proposal account
     * @param tokenOwnerRecord Token Owner Record Account, pda(realm, governing_token_mint, governing_token_owner)
     * @param governanceAuthority Either the current delegate or governing token owner
     * @param proposalTransactionAccount Proposal Transaction Account, pda('governance', proposal, optionIndex, index)
     * @param beneficiaryAccount Beneficiary Account which would receive lamports from the disposed ProposalTransaction account
     *
     * @return Instruction to add to a transaction
    */
    removeTransactionInstruction(proposalAccount: PublicKey, tokenOwnerRecord: PublicKey, governanceAuthority: PublicKey, proposalTransactionAccount: PublicKey, beneficiaryAccount: PublicKey): Promise<TransactionInstruction>;
    /**
     * Construct a CancelProposal instruction
     *
     * @param realmAccount The Realm Account
     * @param governanceAccount The governance account. pda(realm, governance seed)
     * @param proposalAccount Proposal account
     * @param tokenOwnerRecord Token Owner Record Account, pda(realm, governing_token_mint, governing_token_owner)
     * @param governanceAuthority Either the current delegate or governing token owner
     *
     * @return Instruction to add to a transaction
    */
    cancelProposalInstruction(realmAccount: PublicKey, governanceAccount: PublicKey, proposalAccount: PublicKey, tokenOwnerRecord: PublicKey, governanceAuthority: PublicKey): Promise<TransactionInstruction>;
    /**
     * Construct a SignOffProposal instruction
     *
     * @param realmAccount The Realm Account
     * @param governanceAccount The governance account. pda(realm, governance seed)
     * @param proposalAccount Proposal account
     * @param signer Either Signatory Account or the proposal owner if signatory isn't appointed
     * @param signatoryRecordAccount (Optional) pda(proposal, signatory), required when non owner signs off the Proposal
     * @param tokenOwnerRecord (Optional) pda(realm, governing_token_mint, governing_token_owner), required when the owner signs off the proposal
     *
     * @return Instruction to add to a transaction
    */
    signOffProposalInstruction(realmAccount: PublicKey, governanceAccount: PublicKey, proposalAccount: PublicKey, signer: PublicKey, signatoryRecordAccount?: PublicKey, tokenOwnerRecord?: PublicKey): Promise<TransactionInstruction>;
    /**
     * Construct a CastVote instruction
     *
     * @param vote Vote
     * @param realmAccount The Realm Account
     * @param governanceAccount The governance account. pda(realm, governance seed)
     * @param proposalAccount Proposal account
     * @param proposalOwnerTokenOwnerRecord Proposal Owner's Token Owner Record account, pda(realm, governing_token_mint, proposal_owner)
     * @param voterTokenOwnerRecord Voter's Token Owner Record account, pda(realm, governing_token_mint, voter)
     * @param governanceAuthority Either the current delegate or governing token owner
     * @param governingTokenMint The Mint Account of the governing token (either community token or council token). For Veto vote, pass the opposite governing token mint
     * @param payer Payer of the transaction
     *
     *
     * @return Instruction to add to a transaction
    */
    castVoteInstruction(vote: Vote, realmAccount: PublicKey, governanceAccount: PublicKey, proposalAccount: PublicKey, proposalOwnerTokenOwnerRecord: PublicKey, voterTokenOwnerRecord: PublicKey, governanceAuthority: PublicKey, governingTokenMint: PublicKey, payer: PublicKey, voterWeightRecord?: PublicKey, maxVoterWeightRecord?: PublicKey): Promise<TransactionInstruction>;
    /**
     * Construct a FinalizeVote instruction
     *
     * @param realmAccount The Realm Account
     * @param governanceAccount The governance account. pda(realm, governance seed)
     * @param proposalAccount Proposal account
     * @param tokenOwnerRecord Proposal Owner's Token Owner Record account, pda(realm, governing_token_mint, proposal_owner)
     * @param governingTokenMint The Mint Account of the governing token (either community token or council token)
     *
     *
     * @return Instruction to add to a transaction
    */
    finalizeVoteInstruction(realmAccount: PublicKey, governanceAccount: PublicKey, proposalAccount: PublicKey, tokenOwnerRecord: PublicKey, governingTokenMint: PublicKey, maxVoterWeightRecord?: PublicKey): Promise<TransactionInstruction>;
    /**
     * Construct a RelinquishVote instruction
     *
     * @param realmAccount The Realm Account
     * @param governanceAccount The governance account. pda(realm, governance seed)
     * @param proposalAccount Proposal account
     * @param tokenOwnerRecord Token Owner Record account, pda(realm, governing_token_mint, governing_token_owner)
     * @param governingTokenMint The Mint Account of the governing token used for voting (either community token or council token)
     * @param governanceAuthority (Optional) Either the current delegate or governing token owner. Only needed if the proposal is still being voted on
     * @param beneficiaryAccount (Optional) Beneficiary Account which would receive lamports from the disposed VoteRecord account. Only needed if the proposal is still being voted on
     *
     *
     * @return Instruction to add to a transaction
    */
    relinquishVoteInstruction(realmAccount: PublicKey, governanceAccount: PublicKey, proposalAccount: PublicKey, tokenOwnerRecord: PublicKey, governingTokenMint: PublicKey, governanceAuthority?: PublicKey, beneficiaryAccount?: PublicKey): Promise<TransactionInstruction>;
    /**
     * Construct a ExecuteTransaction instruction
     *
     * @param governanceAccount The governance account. pda(realm, governance seed)
     * @param proposalAccount Proposal account
     * @param proposalTransactionAccount Proposal Transaction Account. pda('governance', proposal, option_index, index)
     * @param transactionAccounts Accounts that are part of the transaction, in order
     *
     *
     * @return Instruction to add to a transaction
    */
    executeTransactionInstruction(governanceAccount: PublicKey, proposalAccount: PublicKey, proposalTransactionAccount: PublicKey, transactionAccounts: AccountMeta[]): Promise<TransactionInstruction>;
    /**
     * Construct a CreateNativeTreasury instruction
     *
     * @param governanceAccount The governance account. pda(realm, governance seed)
     * @param payer Payer of the transaction
     *
     *
     * @return Instruction to add to a transaction
    */
    createNativeTreasuryInstruction(governanceAccount: PublicKey, payer: PublicKey): Promise<TransactionInstruction>;
    /**
     * Construct a SetGovernanceConfig instruction
     *
     * @param config Governance Config
     * @param governanceAccount The governance account. pda(realm, governance seed)
     *
     *
     * @return Instruction to add to a transaction
    */
    setGovernanceConfigInstruction(config: GovernanceConfig, governanceAccount: PublicKey): Promise<TransactionInstruction>;
    /**
     * Construct a SetRealmAuthority instruction
     *
     * @param realmAccount The Realm Account
     * @param currentRealmAuthority The current Realm Authority
     * @param action "setChecked" - Sets realm authority and checks that the new authority is one of the realm's governances. "setUnchecked" - Sets new authority without any check. "remove" - Sets the realm authority to None.
     * @param newRealmAuthority (Optional) The new realm authority. Required when the action is not "remove"
     *
     *
     * @return Instruction to add to a transaction
    */
    setRealmAuthorityInstruction(realmAccount: PublicKey, currentRealmAuthority: PublicKey, action: "setChecked" | "setUnchecked" | "remove", newRealmAuthority?: PublicKey): Promise<TransactionInstruction>;
    /**
     * Construct a SetRealmConfig instruction
     *
     * @param config New Realm Config
     * @param realmAccount The Realm Account
     * @param realmAuthority The current Realm Authority
     * @param payer Payer of the transaction
     * @param councilTokenMint (Optional) Mint Account of the token used as the council token. Required if the council is removed
     *
     *
     * @return Instruction to add to a transaction
    */
    setRealmConfigInstruciton(config: RealmConfigArgs, realmAccount: PublicKey, realmAuthority: PublicKey, payer: PublicKey, councilTokenMint?: PublicKey, communityVoterWeightAddinProgramId?: PublicKey, maxCommunityVoterWeightAddinProgramId?: PublicKey, councilVoterWeightAddinProgramId?: PublicKey, maxCouncilVoterWeightAddinProgramId?: PublicKey): Promise<TransactionInstruction>;
    /**
     * Construct a CreateTokenOwnerRecord instruction
     *
     * @param realmAccount The Realm Account
     * @param governingTokenOwner The owner of the governing token account
     * @param governingTokenMintAccount The Mint Account of the governing token
     * @param payer Payer of the transaction
     *
     *
     * @return Instruction to add to a transaction
    */
    createTokenOwnerRecordInstruction(realmAccount: PublicKey, governingTokenOwner: PublicKey, governingTokenMint: PublicKey, payer: PublicKey): Promise<TransactionInstruction>;
    /**
     * Construct a RevokeGoverningTokens instruction
     *
     * @param amount The number of tokens to revoke
     * @param realmAccount The Realm Account
     * @param tokenOwnerRecord Token Owner Record Account, pda(realm, governing_token_mint, governing_token_owner)
     * @param governingTokenMintAccount The Mint Account of the governing token
     * @param revokeAuthority Either the mint authority of the governing token or governing token owner
     *
     *
     * @return Instruction to add to a transaction
    */
    revokeGoverningTokensInstruction(amount: BN | number, realmAccount: PublicKey, tokenOwnerRecord: PublicKey, governingTokenMint: PublicKey, revokeAuthority: PublicKey): Promise<TransactionInstruction>;
    /**
     * Construct a RefundProposalDeposit instruction
     *
     * @param proposalAccount The proposal account
     * @param depositPayer Proposal deposit payer (beneficiary) account
     *
     *
     * @return Instruction to add to a transaction
    */
    refundProposalDepositInstruction(proposalAccount: PublicKey, depositPayer: PublicKey): Promise<TransactionInstruction>;
    /**
     * Construct a CompleteProposal instruction
     *
     * @param proposalAccount The proposal account
     * @param tokenOwnerRecord Token Owner Record Account of the proposal owner, pda(realm, governing_token_mint, proposal_owner)
     * @param completeProposalAuthority Either the current delegate or governing token owner
     *
     *
     * @return Instruction to add to a transaction
    */
    completeProposalInstruction(proposalAccount: PublicKey, tokenOwnerRecord: PublicKey, completeProposalAuthority: PublicKey): Promise<TransactionInstruction>;
    /**
     * Construct a PostMessage instruction
     *
     * @param messageBody the message string or utf-8 encoded emotican characters
     * @param messageType "text" if message | "reaction" if the message is emotican
     * @param isReply true if the message is reply to another message
     * @param chatMessageAccount The public key of a new keypair. This keypair must sign the transaction
     * @param realmAccount The Realm Account
     * @param governanceAccount The governance account. pda(realm, governance seed)
     * @param proposalAccount Proposal account
     * @param tokenOwnerRecord Author's Token Owner Record account, pda(realm, governing_token_mint, message_author)
     * @param governanceAuthority Either the current delegate or governing token owner
     * @param payer Payer of the transaction
     * @param replyTo (optional) The public key of the parent message
     *
     *
     * @return Instruction to add to a transaction
    */
    postMessageInstruction(messageBody: string, messageType: "text" | "reaction", isReply: boolean, chatMessageAccount: PublicKey, realmAccount: PublicKey, governanceAccount: PublicKey, proposalAccount: PublicKey, tokenOwnerRecord: PublicKey, governanceAuthority: PublicKey, payer: PublicKey, replyTo?: PublicKey, voterWeightRecord?: PublicKey): Promise<TransactionInstruction>;
}

export { type ChatMessage, DEFAULT_CHAT_PROGRAM_ID, DEFAULT_PROGRAM_ID, type GovernanceAccount, type GovernanceConfig, type GovernanceConfigMut, type GovernanceV1, type InstructionData, type MaxVoterWeightRecord, type MessageBody, type MintMaxVoteWeightSource, type ProposalDeposit, type ProposalInstruction, type ProposalOption, type ProposalTransaction, type ProposalV1, type ProposalV2, type RealmConfig, type RealmConfigArgs, type RealmV1, type RealmV2, type SetRealmAuthorityAction, type SignatoryRecord, SplGovernance, type TokenOwnerRecord, type Vote, type VoteChoice, type VoteRecord, type VoteRecordV1, type VoteType, type VoterWeightRecord };
