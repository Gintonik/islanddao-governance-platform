"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __defProps = Object.defineProperties;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getOwnPropSymbols = Object.getOwnPropertySymbols;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __propIsEnum = Object.prototype.propertyIsEnumerable;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __spreadValues = (a, b) => {
  for (var prop in b || (b = {}))
    if (__hasOwnProp.call(b, prop))
      __defNormalProp(a, prop, b[prop]);
  if (__getOwnPropSymbols)
    for (var prop of __getOwnPropSymbols(b)) {
      if (__propIsEnum.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    }
  return a;
};
var __spreadProps = (a, b) => __defProps(a, __getOwnPropDescs(b));
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var __async = (__this, __arguments, generator) => {
  return new Promise((resolve, reject) => {
    var fulfilled = (value) => {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    };
    var rejected = (value) => {
      try {
        step(generator.throw(value));
      } catch (e) {
        reject(e);
      }
    };
    var step = (x) => x.done ? resolve(x.value) : Promise.resolve(x.value).then(fulfilled, rejected);
    step((generator = generator.apply(__this, __arguments)).next());
  });
};

// src/index.ts
var src_exports = {};
__export(src_exports, {
  DEFAULT_CHAT_PROGRAM_ID: () => DEFAULT_CHAT_PROGRAM_ID,
  DEFAULT_PROGRAM_ID: () => DEFAULT_PROGRAM_ID,
  SplGovernance: () => SplGovernance
});
module.exports = __toCommonJS(src_exports);
var import_web37 = require("@solana/web3.js");
var import_anchor2 = require("@coral-xyz/anchor");
var import_bn7 = __toESM(require("bn.js"));

// src/idl/gov.json
var gov_default = {
  version: "3.1.1",
  name: "spl_governance",
  instructions: [
    {
      name: "createRealm",
      accounts: [
        {
          name: "realmAccount",
          isMut: true,
          isSigner: false,
          docs: [
            "Governance Realm account"
          ]
        },
        {
          name: "realmAuthority",
          isMut: false,
          isSigner: false,
          docs: [
            "The authority of the Realm"
          ]
        },
        {
          name: "communityTokenMint",
          isMut: false,
          isSigner: false,
          docs: [
            "The mint address of the token to be used as the community mint"
          ]
        },
        {
          name: "communityTokenHoldingAccount",
          isMut: true,
          isSigner: false,
          docs: [
            "The account to hold the community tokens.\n    PDA seeds=['governance', realm, community_mint]"
          ]
        },
        {
          name: "payer",
          isMut: true,
          isSigner: true,
          docs: [
            "the payer of this transaction"
          ]
        },
        {
          name: "systemProgram",
          isMut: false,
          isSigner: false,
          docs: [
            "System Program"
          ]
        },
        {
          name: "tokenProgram",
          isMut: false,
          isSigner: false,
          docs: [
            "SPL Token Program"
          ]
        },
        {
          name: "rent",
          isMut: false,
          isSigner: false,
          docs: [
            "SysVar Rent"
          ]
        },
        {
          name: "councilTokenMint",
          isMut: false,
          isSigner: false,
          isOptional: true,
          docs: [
            "The mint address of the token to be used as the council mint"
          ]
        },
        {
          name: "councilTokenHoldingAccount",
          isMut: true,
          isSigner: false,
          isOptional: true,
          docs: [
            "The account to hold the council tokens.\n    PDA seeds: ['governance',realm,council_mint]\n    "
          ]
        },
        {
          name: "realmConfig",
          isMut: true,
          isSigner: false,
          docs: [
            "Realm Config account"
          ]
        },
        {
          name: "communityVoterWeightAddin",
          isMut: false,
          isSigner: false,
          isOptional: true,
          docs: [
            "Optional Community Voter Weight Addin Program Id"
          ]
        },
        {
          name: "maxCommunityVoterWeightAddin",
          isMut: false,
          isSigner: false,
          isOptional: true,
          docs: [
            "Optional Max Community Voter Weight Addin Program Id"
          ]
        },
        {
          name: "councilVoterWeightAddin",
          isMut: false,
          isSigner: false,
          isOptional: true,
          docs: [
            "Optional Council Voter Weight Addin Program Id"
          ]
        },
        {
          name: "maxCouncilVoterWeightAddin",
          isMut: false,
          isSigner: false,
          isOptional: true,
          docs: [
            "Optional Max Council Voter Weight Addin Program Id"
          ]
        }
      ],
      args: [
        {
          name: "name",
          type: "string"
        },
        {
          name: "configArgs",
          type: {
            defined: "RealmConfigArgs"
          }
        }
      ],
      discriminant: {
        type: "u8",
        value: 0
      }
    },
    {
      name: "depositGoverningTokens",
      accounts: [
        {
          name: "realmAccount",
          isMut: false,
          isSigner: false
        },
        {
          name: "governingTokenHoldingAccount",
          isMut: true,
          isSigner: false,
          docs: [
            "seeds=['governance', realm, governing_token_mint]"
          ]
        },
        {
          name: "governingTokenSourceAccount",
          isMut: true,
          isSigner: false,
          docs: [
            "It can either be spl-token TokenAccount or MintAccount. Tokens will be transferred or minted to the holding account"
          ]
        },
        {
          name: "governingTokenOwnerAccount",
          isMut: false,
          isSigner: true
        },
        {
          name: "governingTokenSourceAccountAuthority",
          isMut: false,
          isSigner: true,
          docs: [
            "It should be owner for TokenAccount and mint_authority for MintAccount"
          ]
        },
        {
          name: "tokenOwnerRecord",
          isMut: true,
          isSigner: false,
          docs: [
            "seeds=['governance', realm, governing_token_mint, governing_token_owner]"
          ]
        },
        {
          name: "payer",
          isMut: true,
          isSigner: true
        },
        {
          name: "systemProgram",
          isMut: false,
          isSigner: false
        },
        {
          name: "tokenProgram",
          isMut: false,
          isSigner: false
        },
        {
          name: "realmConfigAccount",
          isMut: false,
          isSigner: false,
          docs: [
            "seeds=['realm-config', realm]"
          ]
        }
      ],
      args: [
        {
          name: "amount",
          type: "u64"
        }
      ],
      discriminant: {
        type: "u8",
        value: 1
      }
    },
    {
      name: "withdrawGoverningTokens",
      accounts: [
        {
          name: "realmAccount",
          isMut: false,
          isSigner: false
        },
        {
          name: "governingTokenHoldingAccount",
          isMut: true,
          isSigner: false,
          docs: [
            "seeds=['governance', realm, governing_token_mint]"
          ]
        },
        {
          name: "governingTokenDestinationAccount",
          isMut: true,
          isSigner: false,
          docs: [
            "All tokens will be transferred to this account"
          ]
        },
        {
          name: "governingTokenOwnerAccount",
          isMut: false,
          isSigner: true
        },
        {
          name: "tokenOwnerRecord",
          isMut: true,
          isSigner: false,
          docs: [
            "seeds=['governance',realm, governing_token_mint, governing_token_owner]"
          ]
        },
        {
          name: "tokenProgram",
          isMut: false,
          isSigner: false
        },
        {
          name: "realmConfigAccount",
          isMut: false,
          isSigner: false,
          docs: [
            "seeds=['realm-config', realm]"
          ]
        }
      ],
      args: [],
      discriminant: {
        type: "u8",
        value: 2
      }
    },
    {
      name: "setGovernanceDelegate",
      accounts: [
        {
          name: "currentDelegateOrOwner",
          isMut: false,
          isSigner: true,
          docs: [
            "Current governance delegate or governing token owner"
          ]
        },
        {
          name: "tokenOwnerRecord",
          isMut: true,
          isSigner: false
        }
      ],
      args: [
        {
          name: "newGovernanceDelegate",
          type: {
            option: "publicKey"
          }
        }
      ],
      discriminant: {
        type: "u8",
        value: 3
      }
    },
    {
      name: "createGovernance",
      accounts: [
        {
          name: "realmAccount",
          isMut: false,
          isSigner: false,
          docs: [
            "Realm account the created governance belongs to"
          ]
        },
        {
          name: "governanceAccount",
          isMut: true,
          isSigner: false,
          docs: [
            "seeds=['account-governance', realm, governed_account]"
          ]
        },
        {
          name: "governedAccount",
          isMut: false,
          isSigner: false,
          docs: [
            "Account governed by this Governance (governing_account). \n        Note: the account doesn't have to exist and can be used only as a unique identified for the Governance account"
          ]
        },
        {
          name: "governingTokenOwnerRecord",
          isMut: false,
          isSigner: false,
          docs: [
            "Used only if not signed by RealmAuthority"
          ]
        },
        {
          name: "payer",
          isMut: false,
          isSigner: true
        },
        {
          name: "systemProgram",
          isMut: false,
          isSigner: false
        },
        {
          name: "governanceAuthority",
          isMut: false,
          isSigner: true
        },
        {
          name: "realmConfigAccount",
          isMut: false,
          isSigner: false,
          docs: [
            "seeds=['realm-config', realm]"
          ]
        },
        {
          name: "voterWeightRecord",
          isMut: false,
          isSigner: false,
          isOptional: true,
          docs: [
            "Optional Voter Weight Record"
          ]
        }
      ],
      args: [
        {
          name: "config",
          type: {
            defined: "GovernanceConfig"
          }
        }
      ],
      discriminant: {
        type: "u8",
        value: 4
      }
    },
    {
      name: "createProgramGovernance",
      accounts: [
        {
          name: "realmAccount",
          isMut: false,
          isSigner: false,
          docs: [
            "Realm account the created Governance belongs to"
          ]
        },
        {
          name: "programGovernanceAccount",
          isMut: true,
          isSigner: false,
          docs: [
            "Program Governance account. seeds: ['program-governance', realm, governed_program]"
          ]
        },
        {
          name: "governedProgram",
          isMut: false,
          isSigner: false,
          docs: [
            "Program governed by this Governance account"
          ]
        },
        {
          name: "programData",
          isMut: true,
          isSigner: false,
          docs: [
            "Program Data account of the Program governed by this Governance account"
          ]
        },
        {
          name: "currentUpgradeAuthority",
          isMut: false,
          isSigner: true,
          docs: [
            "Current Upgrade Authority account of the Program governed by this Governance account"
          ]
        },
        {
          name: "governingTokenOwnerRecord",
          isMut: false,
          isSigner: false,
          docs: [
            "Governing TokenOwnerRecord account (Used only if not signed by RealmAuthority)"
          ]
        },
        {
          name: "payer",
          isMut: false,
          isSigner: true
        },
        {
          name: "bpfUpgradeableLoaderProgram",
          isMut: false,
          isSigner: false,
          docs: [
            "bpf_upgradeable_loader_program program"
          ]
        },
        {
          name: "systemProgram",
          isMut: false,
          isSigner: false
        },
        {
          name: "governanceAuthority",
          isMut: false,
          isSigner: true
        },
        {
          name: "realmConfig",
          isMut: false,
          isSigner: false,
          docs: [
            "RealmConfig account. seeds=['realm-config', realm]"
          ]
        },
        {
          name: "voterWeightRecord",
          isMut: false,
          isSigner: false,
          isOptional: true,
          docs: [
            "Optional Voter Weight Record"
          ]
        }
      ],
      args: [
        {
          name: "config",
          type: {
            defined: "GovernanceConfig"
          }
        },
        {
          name: "transferUpgradeAuthority",
          type: "bool"
        }
      ],
      discriminant: {
        type: "u8",
        value: 5
      }
    },
    {
      name: "createProposal",
      accounts: [
        {
          name: "realmAccount",
          isMut: false,
          isSigner: false,
          docs: [
            "Realm account the created Proposal belongs to"
          ]
        },
        {
          name: "proposalAccount",
          isMut: true,
          isSigner: false,
          docs: [
            "Proposal account. PDA seeds ['governance',governance, governing_token_mint, proposal_index]"
          ]
        },
        {
          name: "governanceAccount",
          isMut: true,
          isSigner: false,
          docs: [
            "Governance account"
          ]
        },
        {
          name: "tokenOwnerRecord",
          isMut: true,
          isSigner: false,
          docs: [
            "TokenOwnerRecord account of the Proposal owner"
          ]
        },
        {
          name: "governingTokenMint",
          isMut: false,
          isSigner: false,
          docs: [
            "Token Mint the Proposal is created for"
          ]
        },
        {
          name: "governanceAuthority",
          isMut: false,
          isSigner: true,
          docs: [
            "Governance Authority (Token Owner or Governance Delegate)"
          ]
        },
        {
          name: "payer",
          isMut: false,
          isSigner: true
        },
        {
          name: "systemProgram",
          isMut: false,
          isSigner: false
        },
        {
          name: "realmConfig",
          isMut: false,
          isSigner: false,
          docs: [
            "RealmConfig account. PDA seeds: ['realm-config', realm]"
          ]
        },
        {
          name: "voterWeightRecord",
          isMut: true,
          isSigner: false,
          isOptional: true,
          docs: [
            "Optional Voter Weight Record"
          ]
        },
        {
          name: "proposalDepositAccount",
          isMut: false,
          isSigner: false,
          isOptional: true,
          docs: [
            "Optional Proposal deposit is required when there are more active \n        proposals than the configured deposit exempt amount. \n        PDA seeds: ['proposal-deposit', proposal, deposit payer]"
          ]
        }
      ],
      args: [
        {
          name: "name",
          type: "string"
        },
        {
          name: "descriptionLink",
          type: "string"
        },
        {
          name: "voteType",
          type: {
            defined: "VoteType"
          }
        },
        {
          name: "options",
          type: {
            vec: "string"
          }
        },
        {
          name: "useDenyOption",
          type: "bool"
        },
        {
          name: "proposalSeed",
          type: "publicKey"
        }
      ],
      discriminant: {
        type: "u8",
        value: 6
      }
    },
    {
      name: "addSignatory",
      accounts: [
        {
          name: "proposalAccount",
          isMut: true,
          isSigner: false,
          docs: [
            "Proposal Account associated with the governance"
          ]
        },
        {
          name: "tokenOwnerRecord",
          isMut: false,
          isSigner: false,
          docs: [
            "TokenOwnerRecord account of the Proposal owner"
          ]
        },
        {
          name: "governanceAuthority",
          isMut: false,
          isSigner: true,
          docs: [
            "Governance Authority (Token Owner or Governance Delegate)"
          ]
        },
        {
          name: "signatoryRecordAccount",
          isMut: true,
          isSigner: false,
          docs: [
            "Signatory Record Account"
          ]
        },
        {
          name: "payer",
          isMut: false,
          isSigner: true
        },
        {
          name: "systemProgram",
          isMut: false,
          isSigner: false
        }
      ],
      args: [
        {
          name: "signatory",
          type: "publicKey"
        }
      ],
      discriminant: {
        type: "u8",
        value: 7
      }
    },
    {
      name: "legacy1",
      accounts: [],
      args: [],
      discriminant: {
        type: "u8",
        value: 8
      }
    },
    {
      name: "insertTransaction",
      accounts: [
        {
          name: "governanceAccount",
          isMut: false,
          isSigner: false
        },
        {
          name: "proposalAccount",
          isMut: true,
          isSigner: false
        },
        {
          name: "tokenOwnerRecord",
          isMut: false,
          isSigner: false,
          docs: [
            "TokenOwnerRecord account of the Proposal owner"
          ]
        },
        {
          name: "governanceAuthority",
          isMut: false,
          isSigner: true,
          docs: [
            "Governance Authority (Token Owner or Governance Delegate)"
          ]
        },
        {
          name: "proposalTransactionAccount",
          isMut: true,
          isSigner: false,
          docs: [
            "ProposalTransaction, account. PDA seeds: ['governance', proposal, option_index, index]"
          ]
        },
        {
          name: "payer",
          isMut: false,
          isSigner: true
        },
        {
          name: "systemProgram",
          isMut: false,
          isSigner: false
        },
        {
          name: "rent",
          isMut: false,
          isSigner: false
        }
      ],
      args: [
        {
          name: "optionIndex",
          type: "u8"
        },
        {
          name: "index",
          type: "u16"
        },
        {
          name: "holdUpTime",
          type: "u32"
        },
        {
          name: "instructions",
          type: {
            vec: {
              defined: "InstructionData"
            }
          }
        }
      ],
      discriminant: {
        type: "u8",
        value: 9
      }
    },
    {
      name: "removeTransaction",
      accounts: [
        {
          name: "proposalAccount",
          isMut: true,
          isSigner: false
        },
        {
          name: "tokenOwnerRecord",
          isMut: false,
          isSigner: false,
          docs: [
            "TokenOwnerRecord account of the Proposal owner"
          ]
        },
        {
          name: "governanceAuthority",
          isMut: false,
          isSigner: true,
          docs: [
            "Governance Authority (Token Owner or Governance Delegate)"
          ]
        },
        {
          name: "proposalTransactionAccount",
          isMut: true,
          isSigner: false
        },
        {
          name: "beneficiaryAccount",
          isMut: true,
          isSigner: false,
          docs: [
            "Beneficiary Account which would receive lamports from the disposed ProposalTransaction account"
          ]
        }
      ],
      args: [],
      discriminant: {
        type: "u8",
        value: 10
      }
    },
    {
      name: "cancelProposal",
      accounts: [
        {
          name: "realmAccount",
          isMut: true,
          isSigner: false
        },
        {
          name: "governanceAccount",
          isMut: true,
          isSigner: false
        },
        {
          name: "proposalAccount",
          isMut: true,
          isSigner: false
        },
        {
          name: "tokenOwnerRecord",
          isMut: true,
          isSigner: false,
          docs: [
            "TokenOwnerRecord account of the Proposal owner"
          ]
        },
        {
          name: "governanceAuthority",
          isMut: false,
          isSigner: true,
          docs: [
            "Governance authority (Token Owner or Governance Delegate)"
          ]
        }
      ],
      args: [],
      discriminant: {
        type: "u8",
        value: 11
      }
    },
    {
      name: "signOffProposal",
      accounts: [
        {
          name: "realmAccount",
          isMut: false,
          isSigner: false
        },
        {
          name: "governanceAccount",
          isMut: false,
          isSigner: false
        },
        {
          name: "proposalAccount",
          isMut: true,
          isSigner: false
        },
        {
          name: "signatoryAccount",
          isMut: false,
          isSigner: true,
          docs: [
            "Signatory account signing off the Proposal.\n    Or Proposal owner if the owner hasn't appointed any signatories"
          ]
        },
        {
          name: "tokenOwnerRecord",
          isMut: true,
          isSigner: false,
          docs: [
            "TokenOwnerRecord for the Proposal owner, required when the owner signs off the Proposal.\n        Or `[writable]` SignatoryRecord account, required when non owner signs off the Proposal"
          ]
        }
      ],
      args: [],
      discriminant: {
        type: "u8",
        value: 12
      }
    },
    {
      name: "castVote",
      accounts: [
        {
          name: "realmAccount",
          isMut: false,
          isSigner: false
        },
        {
          name: "governanceAccount",
          isMut: true,
          isSigner: false
        },
        {
          name: "proposalAccount",
          isMut: true,
          isSigner: false
        },
        {
          name: "proposalTokenOwnerRecord",
          isMut: true,
          isSigner: false,
          docs: [
            "TokenOwnerRecord of the Proposal owner"
          ]
        },
        {
          name: "voterTokenOwnerRecord",
          isMut: true,
          isSigner: false,
          docs: [
            "TokenOwnerRecord of the voter. PDA seeds: ['governance',realm, vote_governing_token_mint, governing_token_owner]"
          ]
        },
        {
          name: "governanceAuthority",
          isMut: false,
          isSigner: true,
          docs: [
            "Governance Authority (Token Owner or Governance Delegate)"
          ]
        },
        {
          name: "proposalVoteRecord",
          isMut: true,
          isSigner: false,
          docs: [
            "Proposal VoteRecord account. PDA seeds: ['governance',proposal,token_owner_record]"
          ]
        },
        {
          name: "governingTokenMint",
          isMut: false,
          isSigner: false,
          docs: [
            "The Governing Token Mint which is used to cast the vote (vote_governing_token_mint).\n    The voting token mint is the governing_token_mint of the Proposal for Approve, Deny and Abstain votes.\n    For Veto vote the voting token mint is the mint of the opposite voting population.\n    Council mint to veto Community proposals and Community mint to veto Council proposals\n    Note: In the current version only Council veto is supported"
          ]
        },
        {
          name: "payer",
          isMut: false,
          isSigner: true
        },
        {
          name: "systemProgram",
          isMut: false,
          isSigner: false
        },
        {
          name: "realmConfigAccount",
          isMut: false,
          isSigner: false,
          docs: [
            "RealmConfig account. PDA seeds: ['realm-config', realm]"
          ]
        },
        {
          name: "voterWeightRecord",
          isMut: false,
          isSigner: false,
          isOptional: true,
          docs: [
            "Optional Voter Weight Record"
          ]
        },
        {
          name: "maxVoterWeightRecord",
          isMut: false,
          isSigner: false,
          isOptional: true,
          docs: [
            "Optional Max Voter Weight Record"
          ]
        }
      ],
      args: [
        {
          name: "vote",
          type: {
            defined: "Vote"
          }
        }
      ],
      discriminant: {
        type: "u8",
        value: 13
      }
    },
    {
      name: "finalizeVote",
      accounts: [
        {
          name: "realmAccount",
          isMut: false,
          isSigner: false
        },
        {
          name: "governanceAccount",
          isMut: true,
          isSigner: false
        },
        {
          name: "proposalAccount",
          isMut: true,
          isSigner: false
        },
        {
          name: "tokenOwnerRecord",
          isMut: true,
          isSigner: false,
          docs: [
            "TokenOwnerRecord of the Proposal owner"
          ]
        },
        {
          name: "governingTokenMint",
          isMut: false,
          isSigner: false
        },
        {
          name: "realmConfig",
          isMut: false,
          isSigner: false,
          docs: [
            "RealmConfig account. PDA seeds: ['realm-config', realm]"
          ]
        },
        {
          name: "maxVoterWeightRecord",
          isMut: false,
          isSigner: false,
          isOptional: true,
          docs: [
            "Optional Max Voter Weight Record"
          ]
        }
      ],
      args: [],
      discriminant: {
        type: "u8",
        value: 14
      }
    },
    {
      name: "relinquishVote",
      accounts: [
        {
          name: "realmAccount",
          isMut: false,
          isSigner: false
        },
        {
          name: "governanceAccount",
          isMut: false,
          isSigner: false
        },
        {
          name: "proposalAccount",
          isMut: true,
          isSigner: false
        },
        {
          name: "tokenOwnerRecord",
          isMut: true,
          isSigner: false,
          docs: [
            "TokenOwnerRecord account. PDA seeds: ['governance',realm, vote_governing_token_mint, governing_token_owner]"
          ]
        },
        {
          name: "proposalVoteRecord",
          isMut: true,
          isSigner: false,
          docs: [
            "Proposal VoteRecord account. PDA seeds: ['governance',proposal, token_owner_record]"
          ]
        },
        {
          name: "governingTokenMint",
          isMut: false,
          isSigner: false,
          docs: [
            "The Governing Token Mint which was used to cast the vote (vote_governing_token_mint)"
          ]
        },
        {
          name: "governanceAuthority",
          isMut: false,
          isSigner: true,
          isOptional: true
        },
        {
          name: "beneficiaryAccount",
          isMut: true,
          isSigner: false,
          isOptional: true,
          docs: [
            "Optional Beneficiary account which would receive lamports when VoteRecord Account is disposed.\n    It's required only when Proposal is still being voted on"
          ]
        }
      ],
      args: [],
      discriminant: {
        type: "u8",
        value: 15
      }
    },
    {
      name: "executeTransaction",
      accounts: [
        {
          name: "governanceAccount",
          isMut: false,
          isSigner: false
        },
        {
          name: "proposalAccount",
          isMut: true,
          isSigner: false
        },
        {
          name: "proposalTransactionAccount",
          isMut: true,
          isSigner: false
        }
      ],
      args: [],
      discriminant: {
        type: "u8",
        value: 16
      }
    },
    {
      name: "createMintGovernance",
      accounts: [
        {
          name: "realmAccount",
          isMut: false,
          isSigner: false,
          docs: [
            "Realm account the created Governance belongs to"
          ]
        },
        {
          name: "mintGovernanceAccount",
          isMut: true,
          isSigner: false,
          docs: [
            "Mint Governance account. seeds=['mint-governance', realm, governed_mint]"
          ]
        },
        {
          name: "governedMint",
          isMut: true,
          isSigner: false,
          docs: [
            "Mint governed by this Governance account"
          ]
        },
        {
          name: "mintAuthority",
          isMut: false,
          isSigner: true,
          docs: [
            "Current Mint authority (MintTokens and optionally FreezeAccount)"
          ]
        },
        {
          name: "governingTokenOwnerRecord",
          isMut: false,
          isSigner: false,
          docs: [
            "Governing TokenOwnerRecord account (Used only if not signed by RealmAuthority)"
          ]
        },
        {
          name: "payer",
          isMut: false,
          isSigner: true
        },
        {
          name: "tokenProgram",
          isMut: false,
          isSigner: false
        },
        {
          name: "systemProgram",
          isMut: false,
          isSigner: false
        },
        {
          name: "governanceAuthority",
          isMut: false,
          isSigner: true
        },
        {
          name: "realmConfig",
          isMut: false,
          isSigner: false,
          docs: [
            "RealmConfig account. seeds=['realm-config', realm]"
          ]
        },
        {
          name: "voterWeightRecord",
          isMut: false,
          isSigner: false,
          isOptional: true,
          docs: [
            "Optional Voter Weight Record"
          ]
        }
      ],
      args: [
        {
          name: "config",
          type: {
            defined: "GovernanceConfig"
          }
        },
        {
          name: "transferMintAuthorities",
          type: "bool"
        }
      ],
      discriminant: {
        type: "u8",
        value: 17
      }
    },
    {
      name: "createTokenGovernance",
      accounts: [
        {
          name: "realmAccount",
          isMut: false,
          isSigner: false,
          docs: [
            "Realm account the created Governance belongs to"
          ]
        },
        {
          name: "tokenGovernanceAccount",
          isMut: true,
          isSigner: false,
          docs: [
            "Token Governance account. seeds=['token-governance', realm, governed_token]"
          ]
        },
        {
          name: "tokenAccount",
          isMut: true,
          isSigner: false,
          docs: [
            "Token account governed by this Governance account"
          ]
        },
        {
          name: "tokenAccountAuthority",
          isMut: false,
          isSigner: true,
          docs: [
            "Current token account authority (AccountOwner and optionally CloseAccount"
          ]
        },
        {
          name: "governingTokenOwnerRecord",
          isMut: false,
          isSigner: false,
          docs: [
            "Governing TokenOwnerRecord account (Used only if not signed by RealmAuthority"
          ]
        },
        {
          name: "payer",
          isMut: false,
          isSigner: true
        },
        {
          name: "tokenProgram",
          isMut: false,
          isSigner: false
        },
        {
          name: "systemProgram",
          isMut: false,
          isSigner: false
        },
        {
          name: "governanceAuthority",
          isMut: false,
          isSigner: true
        },
        {
          name: "realmConfig",
          isMut: false,
          isSigner: false,
          docs: [
            "seeds=['realm-config', realm]"
          ]
        },
        {
          name: "voterWeightRecord",
          isMut: false,
          isSigner: false,
          isOptional: true,
          docs: [
            "Optional Voter Weight Record"
          ]
        }
      ],
      args: [
        {
          name: "config",
          type: {
            defined: "GovernanceConfig"
          }
        },
        {
          name: "transferAccountAuthorities",
          type: "bool"
        }
      ],
      discriminant: {
        type: "u8",
        value: 18
      }
    },
    {
      name: "setGovernanceConfig",
      accounts: [
        {
          name: "governanceAccount",
          isMut: true,
          isSigner: true,
          docs: [
            "The governance account the config is for"
          ]
        }
      ],
      args: [
        {
          name: "config",
          type: {
            defined: "GovernanceConfig"
          }
        }
      ],
      discriminant: {
        type: "u8",
        value: 19
      }
    },
    {
      name: "flagTransactionError",
      accounts: [
        {
          name: "proposalAccount",
          isMut: true,
          isSigner: false
        },
        {
          name: "tokenOwnerRecord",
          isMut: false,
          isSigner: false,
          docs: [
            "TokenOwnerRecord account of the Proposal owner"
          ]
        },
        {
          name: "governanceAuthority",
          isMut: false,
          isSigner: true,
          docs: [
            "Governance Authority (Token Owner or Governance Delegate)"
          ]
        },
        {
          name: "proposalTransactionAccount",
          isMut: true,
          isSigner: false,
          docs: [
            "ProposalTransaction account to flag"
          ]
        }
      ],
      args: [],
      discriminant: {
        type: "u8",
        value: 20
      }
    },
    {
      name: "setRealmAuthority",
      accounts: [
        {
          name: "realmAccount",
          isMut: true,
          isSigner: false
        },
        {
          name: "realmAuthority",
          isMut: false,
          isSigner: true
        },
        {
          name: "newRealmAuthority",
          isMut: false,
          isSigner: false,
          isOptional: true,
          docs: [
            "Must be one of the realm governances when set"
          ]
        }
      ],
      args: [
        {
          name: "action",
          type: {
            defined: "SetRealmAuthorityAction"
          }
        }
      ],
      discriminant: {
        type: "u8",
        value: 21
      }
    },
    {
      name: "setRealmConfig",
      accounts: [
        {
          name: "realmAccount",
          isMut: true,
          isSigner: false
        },
        {
          name: "realmAuthority",
          isMut: false,
          isSigner: true
        },
        {
          name: "councilTokenMint",
          isMut: false,
          isSigner: false,
          isOptional: true,
          docs: [
            "Council Token Mint - optional. \n        Note: In the current version it's only possible to remove council mint (set it to None)\n        After setting council to None it won't be possible to withdraw the tokens from the Realm any longer. \n        If that's required then it must be done before executing this instruction"
          ]
        },
        {
          name: "councilTokenHoldingAccount",
          isMut: true,
          isSigner: false,
          isOptional: true,
          docs: [
            "Optional unless council is used. seeds=['governance', realm, council_mint]"
          ]
        },
        {
          name: "systemProgram",
          isMut: false,
          isSigner: false
        },
        {
          name: "realmConfig",
          isMut: true,
          isSigner: false,
          docs: [
            "RealmConfig account. seeds=['realm-config', realm]"
          ]
        },
        {
          name: "communityVoterWeightAddinProgramId",
          isMut: false,
          isSigner: false,
          isOptional: true,
          docs: [
            "Optional Community Voter Weight Addin Program Id"
          ]
        },
        {
          name: "maxCommunityVoterWeightAddinProgramId",
          isMut: false,
          isSigner: false,
          isOptional: true,
          docs: [
            "Optional Max Community Voter Weight Addin Program Id"
          ]
        },
        {
          name: "councilVoterWeightAddinProgramId",
          isMut: false,
          isSigner: false,
          isOptional: true,
          docs: [
            "Optional Council Voter Weight Adding Program Id"
          ]
        },
        {
          name: "maxCouncilVoterWeightAddinProgramId",
          isMut: false,
          isSigner: false,
          isOptional: true,
          docs: [
            "Optional Max Council Voter Weight Addin Program Id"
          ]
        },
        {
          name: "payer",
          isMut: false,
          isSigner: true,
          isOptional: true,
          docs: [
            "Optional Payer. Required if RealmConfig doesn't exist and needs to be created"
          ]
        }
      ],
      args: [
        {
          name: "configArgs",
          type: {
            defined: "RealmConfigArgs"
          }
        }
      ],
      discriminant: {
        type: "u8",
        value: 22
      }
    },
    {
      name: "createTokenOwnerRecord",
      accounts: [
        {
          name: "realmAccount",
          isMut: false,
          isSigner: false
        },
        {
          name: "governingTokenOwnerAccount",
          isMut: false,
          isSigner: false
        },
        {
          name: "tokenOwnerRecord",
          isMut: true,
          isSigner: false,
          docs: [
            "seeds=['governance', realm, governing_token_mint, governing_token_owner]"
          ]
        },
        {
          name: "governingTokenMint",
          isMut: false,
          isSigner: false
        },
        {
          name: "payer",
          isMut: false,
          isSigner: true
        },
        {
          name: "systemProgram",
          isMut: false,
          isSigner: false
        }
      ],
      args: [],
      discriminant: {
        type: "u8",
        value: 23
      }
    },
    {
      name: "updateProgramMetadata",
      accounts: [
        {
          name: "programMetadataAccount",
          isMut: true,
          isSigner: false,
          docs: [
            "seeds=['metadata']"
          ]
        },
        {
          name: "payer",
          isMut: false,
          isSigner: true
        },
        {
          name: "systemProgram",
          isMut: false,
          isSigner: false
        }
      ],
      args: [],
      discriminant: {
        type: "u8",
        value: 24
      }
    },
    {
      name: "createNativeTreasury",
      accounts: [
        {
          name: "governanceAccount",
          isMut: false,
          isSigner: false,
          docs: [
            "Governance account the treasury account is for"
          ]
        },
        {
          name: "nativeTreasuryAccount",
          isMut: true,
          isSigner: false,
          docs: [
            "seeds=['native-treasury', governance]"
          ]
        },
        {
          name: "payer",
          isMut: false,
          isSigner: true
        },
        {
          name: "systemProgram",
          isMut: false,
          isSigner: false
        }
      ],
      args: [],
      discriminant: {
        type: "u8",
        value: 25
      }
    },
    {
      name: "revokeGoverningTokens",
      accounts: [
        {
          name: "realmAccount",
          isMut: false,
          isSigner: false
        },
        {
          name: "governingTokenHoldingAccount",
          isMut: true,
          isSigner: false,
          docs: [
            "seeds=['governance', realm, governing_token_mint]"
          ]
        },
        {
          name: "tokenOwnerRecord",
          isMut: true,
          isSigner: false,
          docs: [
            "seeds=['governance', realm, governing_token_mint, governing_token_owner]"
          ]
        },
        {
          name: "governingTokenMint",
          isMut: true,
          isSigner: false
        },
        {
          name: "governingTokenMintAuthorityOrTokenOwner",
          isMut: false,
          isSigner: true,
          docs: [
            "GoverningTokenMint mint_authority"
          ]
        },
        {
          name: "realmConfigAccount",
          isMut: false,
          isSigner: false,
          docs: [
            "seeds=['realm-config', realm]"
          ]
        },
        {
          name: "tokenProgram",
          isMut: false,
          isSigner: false
        }
      ],
      args: [
        {
          name: "amount",
          type: "u64"
        }
      ],
      discriminant: {
        type: "u8",
        value: 26
      }
    },
    {
      name: "refundProposalDeposit",
      accounts: [
        {
          name: "proposalAccount",
          isMut: false,
          isSigner: false
        },
        {
          name: "proposalDepositAccount",
          isMut: true,
          isSigner: false,
          docs: [
            "PDA Seeds: ['proposal-deposit', proposal, deposit payer]"
          ]
        },
        {
          name: "proposalDepositPayer",
          isMut: true,
          isSigner: false,
          docs: [
            "Proposal Deposit Payer (beneficiary) account"
          ]
        }
      ],
      args: [],
      discriminant: {
        type: "u8",
        value: 27
      }
    },
    {
      name: "completeProposal",
      accounts: [
        {
          name: "proposalAccount",
          isMut: true,
          isSigner: false
        },
        {
          name: "tokenOwnerRecord",
          isMut: false,
          isSigner: false,
          docs: [
            "TokenOwnerRecord account of the Proposal owner"
          ]
        },
        {
          name: "completeProposalAuthority",
          isMut: false,
          isSigner: true,
          docs: [
            "Token Owner or Delegate"
          ]
        }
      ],
      args: [],
      discriminant: {
        type: "u8",
        value: 28
      }
    },
    {
      name: "addRequiredSignatory",
      accounts: [
        {
          name: "governanceAccount",
          isMut: true,
          isSigner: true,
          docs: [
            "The Governance account the config is for"
          ]
        },
        {
          name: "requiredSignatoryAccount",
          isMut: true,
          isSigner: false
        },
        {
          name: "payer",
          isMut: false,
          isSigner: true
        },
        {
          name: "systemProgram",
          isMut: false,
          isSigner: false
        }
      ],
      args: [
        {
          name: "signatory",
          type: "publicKey"
        }
      ],
      discriminant: {
        type: "u8",
        value: 29
      }
    },
    {
      name: "removeRequiredSignatory",
      accounts: [
        {
          name: "governanceAccount",
          isMut: true,
          isSigner: true
        },
        {
          name: "requiredSignatoryAccount",
          isMut: true,
          isSigner: false
        },
        {
          name: "beneficiaryAccount",
          isMut: true,
          isSigner: false,
          docs: [
            "Beneficiary Account which would receive lamports from the disposed RequiredSignatory Account"
          ]
        }
      ],
      args: [],
      discriminant: {
        type: "u8",
        value: 30
      }
    }
  ],
  accounts: [
    {
      name: "governanceV2",
      type: {
        kind: "struct",
        fields: [
          {
            name: "accountType",
            type: {
              defined: "GovernanceAccountType"
            }
          },
          {
            name: "realm",
            type: "publicKey"
          },
          {
            name: "governedAccount",
            type: "publicKey"
          },
          {
            name: "reserved1",
            type: "u32"
          },
          {
            name: "config",
            type: {
              defined: "GovernanceConfig"
            }
          },
          {
            name: "reservedV2",
            type: {
              defined: "Reserved119"
            }
          },
          {
            name: "requiredSignatoriesCount",
            type: "u8"
          },
          {
            name: "activeProposalCount",
            type: "u64"
          }
        ]
      }
    },
    {
      name: "realmV1",
      type: {
        kind: "struct",
        fields: [
          {
            name: "accountType",
            type: {
              defined: "GovernanceAccountType"
            }
          },
          {
            name: "communityMint",
            type: "publicKey"
          },
          {
            name: "config",
            type: {
              defined: "RealmConfig"
            }
          },
          {
            name: "reserved",
            type: {
              array: [
                "u8",
                6
              ]
            }
          },
          {
            name: "votingProposalCount",
            type: "u16"
          },
          {
            name: "authority",
            type: {
              option: "publicKey"
            }
          },
          {
            name: "name",
            type: "string"
          }
        ]
      }
    },
    {
      name: "tokenOwnerRecordV1",
      type: {
        kind: "struct",
        fields: [
          {
            name: "accountType",
            type: {
              defined: "GovernanceAccountType"
            }
          },
          {
            name: "realm",
            type: "publicKey"
          },
          {
            name: "governingTokenMint",
            type: "publicKey"
          },
          {
            name: "governingTokenOwner",
            type: "publicKey"
          },
          {
            name: "governingTokenDepositAmount",
            type: "u64"
          },
          {
            name: "unrelinquishedVotesCount",
            type: "u64"
          },
          {
            name: "outstandingProposalCount",
            type: "u8"
          },
          {
            name: "version",
            type: "u8"
          },
          {
            name: "reserved",
            type: {
              array: [
                "u8",
                6
              ]
            }
          },
          {
            name: "governanceDelegate",
            type: {
              option: "publicKey"
            }
          }
        ]
      }
    },
    {
      name: "governanceV1",
      type: {
        kind: "struct",
        fields: [
          {
            name: "accountType",
            type: {
              defined: "GovernanceAccountType"
            }
          },
          {
            name: "realm",
            type: "publicKey"
          },
          {
            name: "governedAccount",
            type: "publicKey"
          },
          {
            name: "proposalsCount",
            type: "u32"
          },
          {
            name: "config",
            type: {
              defined: "GovernanceConfig"
            }
          }
        ]
      }
    },
    {
      name: "proposalV1",
      type: {
        kind: "struct",
        fields: [
          {
            name: "accountType",
            type: {
              defined: "GovernanceAccountType"
            }
          },
          {
            name: "governance",
            type: "publicKey"
          },
          {
            name: "governingTokenMint",
            type: "publicKey"
          },
          {
            name: "state",
            type: {
              defined: "ProposalState"
            }
          },
          {
            name: "tokenOwnerRecord",
            type: "publicKey"
          },
          {
            name: "signatoriesCount",
            type: "u8"
          },
          {
            name: "signatoriesSignedOffCount",
            type: "u8"
          },
          {
            name: "yesVotesCount",
            type: "u64"
          },
          {
            name: "noVotesCount",
            type: "u64"
          },
          {
            name: "instructionsExecutedCount",
            type: "u16"
          },
          {
            name: "instructionsCount",
            type: "u16"
          },
          {
            name: "instructionsNextIndex",
            type: "u16"
          },
          {
            name: "draftAt",
            type: {
              defined: "UnixTimestamp"
            }
          },
          {
            name: "signingOffAt",
            type: {
              option: {
                defined: "UnixTimestamp"
              }
            }
          },
          {
            name: "votingAt",
            type: {
              option: {
                defined: "UnixTimestamp"
              }
            }
          },
          {
            name: "votingAtSlot",
            type: {
              option: {
                defined: "Slot"
              }
            }
          },
          {
            name: "votingCompletedAt",
            type: {
              option: {
                defined: "UnixTimestamp"
              }
            }
          },
          {
            name: "executingAt",
            type: {
              option: {
                defined: "UnixTimestamp"
              }
            }
          },
          {
            name: "closedAt",
            type: {
              option: {
                defined: "UnixTimestamp"
              }
            }
          },
          {
            name: "executionFlags",
            type: {
              defined: "InstructionExecutionFlags"
            }
          },
          {
            name: "maxVoteWeight",
            type: {
              option: "u64"
            }
          },
          {
            name: "voteThreshold",
            type: {
              option: {
                defined: "VoteThreshold"
              }
            }
          },
          {
            name: "name",
            type: "string"
          },
          {
            name: "descriptionLink",
            type: "string"
          }
        ]
      }
    },
    {
      name: "signatoryRecordV1",
      type: {
        kind: "struct",
        fields: [
          {
            name: "accountType",
            type: {
              defined: "GovernanceAccountType"
            }
          },
          {
            name: "proposal",
            type: "publicKey"
          },
          {
            name: "signatory",
            type: "publicKey"
          },
          {
            name: "signedOff",
            type: "bool"
          }
        ]
      }
    },
    {
      name: "proposalInstructionV1",
      type: {
        kind: "struct",
        fields: [
          {
            name: "accountType",
            type: {
              defined: "GovernanceAccountType"
            }
          },
          {
            name: "proposal",
            type: "publicKey"
          },
          {
            name: "instructionIndex",
            type: "u16"
          },
          {
            name: "holdUpTime",
            type: "u32"
          },
          {
            name: "instruction",
            type: {
              defined: "InstructionData"
            }
          },
          {
            name: "executedAt",
            type: {
              option: {
                defined: "UnixTimestamp"
              }
            }
          },
          {
            name: "executionStatus",
            type: {
              defined: "TransactionExecutionStatus"
            }
          }
        ]
      }
    },
    {
      name: "voteRecordV1",
      type: {
        kind: "struct",
        fields: [
          {
            name: "accountType",
            type: {
              defined: "GovernanceAccountType"
            }
          },
          {
            name: "proposal",
            type: "publicKey"
          },
          {
            name: "governingTokenOwner",
            type: "publicKey"
          },
          {
            name: "isRelinquished",
            type: "bool"
          },
          {
            name: "voteWeight",
            type: {
              defined: "VoteWeightV1"
            }
          }
        ]
      }
    },
    {
      name: "programMetadata",
      type: {
        kind: "struct",
        fields: [
          {
            name: "accountType",
            type: {
              defined: "GovernanceAccountType"
            }
          },
          {
            name: "updatedAt",
            type: {
              defined: "Slot"
            }
          },
          {
            name: "version",
            type: "string"
          },
          {
            name: "reserved",
            type: {
              array: [
                "u8",
                64
              ]
            }
          }
        ]
      }
    },
    {
      name: "proposalV2",
      type: {
        kind: "struct",
        fields: [
          {
            name: "accountType",
            type: {
              defined: "GovernanceAccountType"
            }
          },
          {
            name: "governance",
            type: "publicKey"
          },
          {
            name: "governingTokenMint",
            type: "publicKey"
          },
          {
            name: "state",
            type: {
              defined: "ProposalState"
            }
          },
          {
            name: "tokenOwnerRecord",
            type: "publicKey"
          },
          {
            name: "signatoriesCount",
            type: "u8"
          },
          {
            name: "signatoriesSignedOffCount",
            type: "u8"
          },
          {
            name: "voteType",
            type: {
              defined: "VoteType"
            }
          },
          {
            name: "options",
            type: {
              vec: {
                defined: "ProposalOption"
              }
            }
          },
          {
            name: "denyVoteWeight",
            type: {
              option: "u64"
            }
          },
          {
            name: "reserved1",
            type: "u8"
          },
          {
            name: "abstainVoteWeight",
            type: {
              option: "u64"
            }
          },
          {
            name: "startVotingAt",
            type: {
              option: {
                defined: "UnixTimestamp"
              }
            }
          },
          {
            name: "draftAt",
            type: {
              defined: "UnixTimestamp"
            }
          },
          {
            name: "signingOffAt",
            type: {
              option: {
                defined: "UnixTimestamp"
              }
            }
          },
          {
            name: "votingAt",
            type: {
              option: {
                defined: "UnixTimestamp"
              }
            }
          },
          {
            name: "votingAtSlot",
            type: {
              option: {
                defined: "Slot"
              }
            }
          },
          {
            name: "votingCompletedAt",
            type: {
              option: {
                defined: "UnixTimestamp"
              }
            }
          },
          {
            name: "executingAt",
            type: {
              option: {
                defined: "UnixTimestamp"
              }
            }
          },
          {
            name: "closedAt",
            type: {
              option: {
                defined: "UnixTimestamp"
              }
            }
          },
          {
            name: "executionFlags",
            type: {
              defined: "InstructionExecutionFlags"
            }
          },
          {
            name: "maxVoteWeight",
            type: {
              option: "u64"
            }
          },
          {
            name: "maxVotingTime",
            type: {
              option: "u32"
            }
          },
          {
            name: "voteThreshold",
            type: {
              option: {
                defined: "VoteThreshold"
              }
            }
          },
          {
            name: "reserved",
            type: {
              array: [
                "u8",
                64
              ]
            }
          },
          {
            name: "name",
            type: "string"
          },
          {
            name: "descriptionLink",
            type: "string"
          },
          {
            name: "vetoVoteWeight",
            type: "u64"
          }
        ]
      }
    },
    {
      name: "proposalDeposit",
      type: {
        kind: "struct",
        fields: [
          {
            name: "accountType",
            type: {
              defined: "GovernanceAccountType"
            }
          },
          {
            name: "proposal",
            type: "publicKey"
          },
          {
            name: "depositPayer",
            type: "publicKey"
          },
          {
            name: "reserved",
            type: {
              array: [
                "u8",
                64
              ]
            }
          }
        ]
      }
    },
    {
      name: "proposalTransactionV2",
      type: {
        kind: "struct",
        fields: [
          {
            name: "accountType",
            type: {
              defined: "GovernanceAccountType"
            }
          },
          {
            name: "proposal",
            type: "publicKey"
          },
          {
            name: "optionIndex",
            type: "u8"
          },
          {
            name: "transactionIndex",
            type: "u16"
          },
          {
            name: "holdUpTime",
            type: "u32"
          },
          {
            name: "instructions",
            type: {
              vec: {
                defined: "InstructionData"
              }
            }
          },
          {
            name: "executedAt",
            type: {
              option: {
                defined: "UnixTimestamp"
              }
            }
          },
          {
            name: "executionStatus",
            type: {
              defined: "TransactionExecutionStatus"
            }
          },
          {
            name: "reservedV2",
            type: {
              array: [
                "u8",
                8
              ]
            }
          }
        ]
      }
    },
    {
      name: "realmV2",
      type: {
        kind: "struct",
        fields: [
          {
            name: "accountType",
            type: {
              defined: "GovernanceAccountType"
            }
          },
          {
            name: "communityMint",
            type: "publicKey"
          },
          {
            name: "config",
            type: {
              defined: "RealmConfig"
            }
          },
          {
            name: "reserved",
            type: {
              array: [
                "u8",
                6
              ]
            }
          },
          {
            name: "legacy1",
            type: "u16"
          },
          {
            name: "authority",
            type: {
              option: "publicKey"
            }
          },
          {
            name: "name",
            type: "string"
          },
          {
            name: "reservedV2",
            type: {
              array: [
                "u8",
                128
              ]
            }
          }
        ]
      }
    },
    {
      name: "realmConfigAccount",
      type: {
        kind: "struct",
        fields: [
          {
            name: "accountType",
            type: {
              defined: "GovernanceAccountType"
            }
          },
          {
            name: "realm",
            type: "publicKey"
          },
          {
            name: "communityTokenConfig",
            type: {
              defined: "GoverningTokenConfig"
            }
          },
          {
            name: "councilTokenConfig",
            type: {
              defined: "GoverningTokenConfig"
            }
          },
          {
            name: "reserved",
            type: {
              defined: "Reserved110"
            }
          }
        ]
      }
    },
    {
      name: "requiredSignatory",
      type: {
        kind: "struct",
        fields: [
          {
            name: "accountType",
            type: {
              defined: "GovernanceAccountType"
            }
          },
          {
            name: "accountVersion",
            type: "u8"
          },
          {
            name: "governance",
            type: "publicKey"
          },
          {
            name: "signatory",
            type: "publicKey"
          }
        ]
      }
    },
    {
      name: "signatoryRecordV2",
      type: {
        kind: "struct",
        fields: [
          {
            name: "accountType",
            type: {
              defined: "GovernanceAccountType"
            }
          },
          {
            name: "proposal",
            type: "publicKey"
          },
          {
            name: "signatory",
            type: "publicKey"
          },
          {
            name: "signedOff",
            type: "bool"
          },
          {
            name: "reservedV2",
            type: {
              array: [
                "u8",
                8
              ]
            }
          }
        ]
      }
    },
    {
      name: "tokenOwnerRecordV2",
      type: {
        kind: "struct",
        fields: [
          {
            name: "accountType",
            type: {
              defined: "GovernanceAccountType"
            }
          },
          {
            name: "realm",
            type: "publicKey"
          },
          {
            name: "governingTokenMint",
            type: "publicKey"
          },
          {
            name: "governingTokenOwner",
            type: "publicKey"
          },
          {
            name: "governingTokenDepositAmount",
            type: "u64"
          },
          {
            name: "unrelinquishedVotesCount",
            type: "u64"
          },
          {
            name: "outstandingProposalCount",
            type: "u8"
          },
          {
            name: "version",
            type: "u8"
          },
          {
            name: "reserved",
            type: {
              array: [
                "u8",
                6
              ]
            }
          },
          {
            name: "governanceDelegate",
            type: {
              option: "publicKey"
            }
          },
          {
            name: "reservedV2",
            type: {
              array: [
                "u8",
                128
              ]
            }
          }
        ]
      }
    },
    {
      name: "legacyTokenOwnerRecord",
      type: {
        kind: "struct",
        fields: [
          {
            name: "accountType",
            type: {
              defined: "GovernanceAccountType"
            }
          },
          {
            name: "realm",
            type: "publicKey"
          },
          {
            name: "governingTokenMint",
            type: "publicKey"
          },
          {
            name: "governingTokenOwner",
            type: "publicKey"
          },
          {
            name: "governingTokenDepositAmount",
            type: "u64"
          },
          {
            name: "unrelinquishedVotesCount",
            type: "u32"
          },
          {
            name: "totalVotesCount",
            type: "u32"
          },
          {
            name: "outstandingProposalCount",
            type: "u8"
          },
          {
            name: "reserved",
            type: {
              array: [
                "u8",
                7
              ]
            }
          },
          {
            name: "governanceDelegate",
            type: {
              option: "publicKey"
            }
          },
          {
            name: "reservedV2",
            type: {
              array: [
                "u8",
                128
              ]
            }
          }
        ]
      }
    },
    {
      name: "voteRecordV2",
      type: {
        kind: "struct",
        fields: [
          {
            name: "accountType",
            type: {
              defined: "GovernanceAccountType"
            }
          },
          {
            name: "proposal",
            type: "publicKey"
          },
          {
            name: "governingTokenOwner",
            type: "publicKey"
          },
          {
            name: "isRelinquished",
            type: "bool"
          },
          {
            name: "voterWeight",
            type: "u64"
          },
          {
            name: "vote",
            type: {
              defined: "Vote"
            }
          },
          {
            name: "reservedV2",
            type: {
              array: [
                "u8",
                8
              ]
            }
          }
        ]
      }
    }
  ],
  types: [
    {
      name: "GovernanceConfig",
      type: {
        kind: "struct",
        fields: [
          {
            name: "communityVoteThreshold",
            type: {
              defined: "VoteThreshold"
            }
          },
          {
            name: "minCommunityWeightToCreateProposal",
            type: "u64"
          },
          {
            name: "minTransactionHoldUpTime",
            type: "u32"
          },
          {
            name: "votingBaseTime",
            type: "u32"
          },
          {
            name: "communityVoteTipping",
            type: {
              defined: "VoteTipping"
            }
          },
          {
            name: "councilVoteThreshold",
            type: {
              defined: "VoteThreshold"
            }
          },
          {
            name: "councilVetoVoteThreshold",
            type: {
              defined: "VoteThreshold"
            }
          },
          {
            name: "minCouncilWeightToCreateProposal",
            type: "u64"
          },
          {
            name: "councilVoteTipping",
            type: {
              defined: "VoteTipping"
            }
          },
          {
            name: "communityVetoVoteThreshold",
            type: {
              defined: "VoteThreshold"
            }
          },
          {
            name: "votingCoolOffTime",
            type: "u32"
          },
          {
            name: "depositExemptProposalCount",
            type: "u8"
          }
        ]
      }
    },
    {
      name: "NativeTreasury",
      type: {
        kind: "struct",
        fields: []
      }
    },
    {
      name: "ProposalOption",
      type: {
        kind: "struct",
        fields: [
          {
            name: "label",
            type: "string"
          },
          {
            name: "voteWeight",
            type: "u64"
          },
          {
            name: "voteResult",
            type: {
              defined: "OptionVoteResult"
            }
          },
          {
            name: "transactionsExecutedCount",
            type: "u16"
          },
          {
            name: "transactionsCount",
            type: "u16"
          },
          {
            name: "transactionsNextIndex",
            type: "u16"
          }
        ]
      }
    },
    {
      name: "InstructionData",
      type: {
        kind: "struct",
        fields: [
          {
            name: "programId",
            type: "publicKey"
          },
          {
            name: "accounts",
            type: {
              vec: {
                defined: "AccountMetaData"
              }
            }
          },
          {
            name: "data",
            type: "bytes"
          }
        ]
      }
    },
    {
      name: "AccountMetaData",
      type: {
        kind: "struct",
        fields: [
          {
            name: "pubkey",
            type: "publicKey"
          },
          {
            name: "isSigner",
            type: "bool"
          },
          {
            name: "isWritable",
            type: "bool"
          }
        ]
      }
    },
    {
      name: "RealmConfigArgs",
      type: {
        kind: "struct",
        fields: [
          {
            name: "useCouncilMint",
            type: "bool"
          },
          {
            name: "minCommunityWeightToCreateGovernance",
            type: "u64"
          },
          {
            name: "communityMintMaxVoterWeightSource",
            type: {
              defined: "MintMaxVoterWeightSource"
            }
          },
          {
            name: "communityTokenConfigArgs",
            type: {
              defined: "GoverningTokenConfigArgs"
            }
          },
          {
            name: "councilTokenConfigArgs",
            type: {
              defined: "GoverningTokenConfigArgs"
            }
          }
        ]
      }
    },
    {
      name: "GoverningTokenConfigArgs",
      type: {
        kind: "struct",
        fields: [
          {
            name: "useVoterWeightAddin",
            type: "bool"
          },
          {
            name: "useMaxVoterWeightAddin",
            type: "bool"
          },
          {
            name: "tokenType",
            type: {
              defined: "GoverningTokenType"
            }
          }
        ]
      }
    },
    {
      name: "GoverningTokenConfigAccountArgs",
      type: {
        kind: "struct",
        fields: [
          {
            name: "voterWeightAddin",
            type: {
              option: "publicKey"
            }
          },
          {
            name: "maxVoterWeightAddin",
            type: {
              option: "publicKey"
            }
          },
          {
            name: "tokenType",
            type: {
              defined: "GoverningTokenType"
            }
          }
        ]
      }
    },
    {
      name: "RealmConfig",
      type: {
        kind: "struct",
        fields: [
          {
            name: "legacy1",
            type: "u8"
          },
          {
            name: "legacy2",
            type: "u8"
          },
          {
            name: "reserved",
            type: {
              array: [
                "u8",
                6
              ]
            }
          },
          {
            name: "minCommunityWeightToCreateGovernance",
            type: "u64"
          },
          {
            name: "communityMintMaxVoterWeightSource",
            type: {
              defined: "MintMaxVoterWeightSource"
            }
          },
          {
            name: "councilMint",
            type: {
              option: "publicKey"
            }
          }
        ]
      }
    },
    {
      name: "RealmConfigArgsV1",
      type: {
        kind: "struct",
        fields: [
          {
            name: "useCouncilMint",
            type: "bool"
          },
          {
            name: "minCommunityWeightToCreateGovernance",
            type: "u64"
          },
          {
            name: "communityMintMaxVoterWeightSource",
            type: {
              defined: "MintMaxVoterWeightSource"
            }
          }
        ]
      }
    },
    {
      name: "GoverningTokenConfig",
      type: {
        kind: "struct",
        fields: [
          {
            name: "voterWeightAddin",
            type: {
              option: "publicKey"
            }
          },
          {
            name: "maxVoterWeightAddin",
            type: {
              option: "publicKey"
            }
          },
          {
            name: "tokenType",
            type: {
              defined: "GoverningTokenType"
            }
          },
          {
            name: "reserved",
            type: {
              array: [
                "u8",
                8
              ]
            }
          }
        ]
      }
    },
    {
      name: "VoteChoice",
      type: {
        kind: "struct",
        fields: [
          {
            name: "rank",
            type: "u8"
          },
          {
            name: "weightPercentage",
            type: "u8"
          }
        ]
      }
    },
    {
      name: "Reserved110",
      type: {
        kind: "struct",
        fields: [
          {
            name: "reserved64",
            type: {
              array: [
                "u8",
                64
              ]
            }
          },
          {
            name: "reserved32",
            type: {
              array: [
                "u8",
                32
              ]
            }
          },
          {
            name: "reserved14",
            type: {
              array: [
                "u8",
                14
              ]
            }
          }
        ]
      }
    },
    {
      name: "Reserved119",
      type: {
        kind: "struct",
        fields: [
          {
            name: "reserved64",
            type: {
              array: [
                "u8",
                64
              ]
            }
          },
          {
            name: "reserved32",
            type: {
              array: [
                "u8",
                32
              ]
            }
          },
          {
            name: "reserved23",
            type: {
              array: [
                "u8",
                23
              ]
            }
          }
        ]
      }
    },
    {
      name: "GovernanceAccountType",
      type: {
        kind: "enum",
        variants: [
          {
            name: "Uninitialized"
          },
          {
            name: "RealmV1"
          },
          {
            name: "TokenOwnerRecordV1"
          },
          {
            name: "GovernanceV1"
          },
          {
            name: "ProgramGovernanceV1"
          },
          {
            name: "ProposalV1"
          },
          {
            name: "SignatoryRecordV1"
          },
          {
            name: "VoteRecordV1"
          },
          {
            name: "ProposalInstructionV1"
          },
          {
            name: "MintGovernanceV1"
          },
          {
            name: "TokenGovernanceV1"
          },
          {
            name: "RealmConfig"
          },
          {
            name: "VoteRecordV2"
          },
          {
            name: "ProposalTransactionV2"
          },
          {
            name: "ProposalV2"
          },
          {
            name: "ProgramMetadata"
          },
          {
            name: "RealmV2"
          },
          {
            name: "TokenOwnerRecordV2"
          },
          {
            name: "GovernanceV2"
          },
          {
            name: "ProgramGovernanceV2"
          },
          {
            name: "MintGovernanceV2"
          },
          {
            name: "TokenGovernanceV2"
          },
          {
            name: "SignatoryRecordV2"
          },
          {
            name: "ProposalDeposit"
          },
          {
            name: "RequiredSignatory"
          }
        ]
      }
    },
    {
      name: "ProposalState",
      type: {
        kind: "enum",
        variants: [
          {
            name: "Draft"
          },
          {
            name: "SigningOff"
          },
          {
            name: "Voting"
          },
          {
            name: "Succeeded"
          },
          {
            name: "Executing"
          },
          {
            name: "Completed"
          },
          {
            name: "Cancelled"
          },
          {
            name: "Defeated"
          },
          {
            name: "ExecutingWithErrors"
          },
          {
            name: "Vetoed"
          }
        ]
      }
    },
    {
      name: "VoteThreshold",
      type: {
        kind: "enum",
        variants: [
          {
            name: "YesVotePercentage",
            fields: [
              "u8"
            ]
          },
          {
            name: "QuorumPercentage",
            fields: [
              "u8"
            ]
          },
          {
            name: "Disabled"
          }
        ]
      }
    },
    {
      name: "VoteTipping",
      type: {
        kind: "enum",
        variants: [
          {
            name: "Strict"
          },
          {
            name: "Early"
          },
          {
            name: "Disabled"
          }
        ]
      }
    },
    {
      name: "TransactionExecutionStatus",
      type: {
        kind: "enum",
        variants: [
          {
            name: "None"
          },
          {
            name: "Success"
          },
          {
            name: "Error"
          }
        ]
      }
    },
    {
      name: "InstructionExecutionFlags",
      type: {
        kind: "enum",
        variants: [
          {
            name: "None"
          },
          {
            name: "Ordered"
          },
          {
            name: "UseTransaction"
          }
        ]
      }
    },
    {
      name: "MintMaxVoterWeightSource",
      type: {
        kind: "enum",
        variants: [
          {
            name: "SupplyFraction",
            fields: [
              "u64"
            ]
          },
          {
            name: "Absolute",
            fields: [
              "u64"
            ]
          }
        ]
      }
    },
    {
      name: "VoteWeightV1",
      type: {
        kind: "enum",
        variants: [
          {
            name: "Yes",
            fields: [
              "u64"
            ]
          },
          {
            name: "No",
            fields: [
              "u64"
            ]
          }
        ]
      }
    },
    {
      name: "OptionVoteResult",
      type: {
        kind: "enum",
        variants: [
          {
            name: "None"
          },
          {
            name: "Succeeded"
          },
          {
            name: "Defeated"
          }
        ]
      }
    },
    {
      name: "VoteType",
      type: {
        kind: "enum",
        variants: [
          {
            name: "SingleChoice"
          },
          {
            name: "MultiChoice",
            fields: [
              {
                name: "choice_type",
                type: {
                  defined: "MultiChoiceType"
                }
              },
              {
                name: "min_voter_options",
                type: "u8"
              },
              {
                name: "max_voter_options",
                type: "u8"
              },
              {
                name: "max_winning_options",
                type: "u8"
              }
            ]
          }
        ]
      }
    },
    {
      name: "MultiChoiceType",
      type: {
        kind: "enum",
        variants: [
          {
            name: "FullWeight"
          },
          {
            name: "Weighted"
          }
        ]
      }
    },
    {
      name: "SetRealmAuthorityAction",
      type: {
        kind: "enum",
        variants: [
          {
            name: "SetUnchecked"
          },
          {
            name: "SetChecked"
          },
          {
            name: "Remove"
          }
        ]
      }
    },
    {
      name: "GovernanceInstructionV1",
      type: {
        kind: "enum",
        variants: [
          {
            name: "CreateRealm",
            fields: [
              {
                name: "name",
                type: "string"
              },
              {
                name: "config_args",
                type: {
                  defined: "RealmConfigArgsV1"
                }
              }
            ]
          },
          {
            name: "DepositGoverningTokens",
            fields: [
              {
                name: "amount",
                type: "u64"
              }
            ]
          }
        ]
      }
    },
    {
      name: "GoverningTokenType",
      type: {
        kind: "enum",
        variants: [
          {
            name: "Liquid"
          },
          {
            name: "Membership"
          },
          {
            name: "Dormant"
          }
        ]
      }
    },
    {
      name: "Vote",
      type: {
        kind: "enum",
        variants: [
          {
            name: "Approve",
            fields: [
              {
                vec: {
                  defined: "VoteChoice"
                }
              }
            ]
          },
          {
            name: "Deny"
          },
          {
            name: "Abstain"
          },
          {
            name: "Veto"
          }
        ]
      }
    },
    {
      name: "VoteKind",
      type: {
        kind: "enum",
        variants: [
          {
            name: "Electorate"
          },
          {
            name: "Veto"
          }
        ]
      }
    },
    {
      name: "UnixTimestamp",
      type: {
        kind: "alias",
        value: "i64"
      }
    },
    {
      name: "Slot",
      type: {
        kind: "alias",
        value: "u64"
      }
    }
  ],
  errors: [
    {
      code: 500,
      name: "InvalidInstruction",
      msg: "Invalid instruction passed to program"
    },
    {
      code: 501,
      name: "RealmAlreadyExists",
      msg: "Realm with the given name and governing mints already exists"
    },
    {
      code: 502,
      name: "InvalidRealm",
      msg: "Invalid realm"
    },
    {
      code: 503,
      name: "InvalidGoverningTokenMint",
      msg: "Invalid Governing Token Mint"
    },
    {
      code: 504,
      name: "GoverningTokenOwnerMustSign",
      msg: "Governing Token Owner must sign transaction"
    },
    {
      code: 505,
      name: "GoverningTokenOwnerOrDelegateMustSign",
      msg: "Governing Token Owner or Delegate  must sign transaction"
    },
    {
      code: 506,
      name: "AllVotesMustBeRelinquishedToWithdrawGoverningTokens",
      msg: "All votes must be relinquished to withdraw governing tokens"
    },
    {
      code: 507,
      name: "InvalidTokenOwnerRecordAccountAddress",
      msg: "Invalid Token Owner Record account address"
    },
    {
      code: 508,
      name: "InvalidGoverningMintForTokenOwnerRecord",
      msg: "Invalid GoverningMint for TokenOwnerRecord"
    },
    {
      code: 509,
      name: "InvalidRealmForTokenOwnerRecord",
      msg: "Invalid Realm for TokenOwnerRecord"
    },
    {
      code: 510,
      name: "InvalidProposalForProposalTransaction",
      msg: "Invalid Proposal for ProposalTransaction,"
    },
    {
      code: 511,
      name: "InvalidSignatoryAddress",
      msg: "Invalid Signatory account address"
    },
    {
      code: 512,
      name: "SignatoryAlreadySignedOff",
      msg: "Signatory already signed off"
    },
    {
      code: 513,
      name: "SignatoryMustSign",
      msg: "Signatory must sign"
    },
    {
      code: 514,
      name: "InvalidProposalOwnerAccount",
      msg: "Invalid Proposal Owner"
    },
    {
      code: 515,
      name: "InvalidProposalForVoterRecord",
      msg: "Invalid Proposal for VoterRecord"
    },
    {
      code: 516,
      name: "InvalidGoverningTokenOwnerForVoteRecord",
      msg: "Invalid GoverningTokenOwner for VoteRecord"
    },
    {
      code: 517,
      name: "InvalidVoteThresholdPercentage",
      msg: "Invalid Governance config: Vote threshold percentage out of range"
    },
    {
      code: 518,
      name: "ProposalAlreadyExists",
      msg: "Proposal for the given Governance, Governing Token Mint and index already exists"
    },
    {
      code: 519,
      name: "VoteAlreadyExists",
      msg: "Token Owner already voted on the Proposal"
    },
    {
      code: 520,
      name: "NotEnoughTokensToCreateProposal",
      msg: "Owner doesn't have enough governing tokens to create Proposal"
    },
    {
      code: 521,
      name: "InvalidStateCannotEditSignatories",
      msg: "Invalid State: Can't edit Signatories"
    },
    {
      code: 522,
      name: "InvalidProposalState",
      msg: "Invalid Proposal state"
    },
    {
      code: 523,
      name: "InvalidStateCannotEditTransactions",
      msg: "Invalid State: Can't edit transactions"
    },
    {
      code: 524,
      name: "InvalidStateCannotExecuteTransaction",
      msg: "Invalid State: Can't execute transaction"
    },
    {
      code: 525,
      name: "CannotExecuteTransactionWithinHoldUpTime",
      msg: "Can't execute transaction within its hold up time"
    },
    {
      code: 526,
      name: "TransactionAlreadyExecuted",
      msg: "Transaction already executed"
    },
    {
      code: 527,
      name: "InvalidTransactionIndex",
      msg: "Invalid Transaction index"
    },
    {
      code: 528,
      name: "TransactionHoldUpTimeBelowRequiredMin",
      msg: "Transaction hold up time is below the min specified by Governance"
    },
    {
      code: 529,
      name: "TransactionAlreadyExists",
      msg: "Transaction at the given index for the Proposal already exists"
    },
    {
      code: 530,
      name: "InvalidStateCannotSignOff",
      msg: "Invalid State: Can't sign off"
    },
    {
      code: 531,
      name: "InvalidStateCannotVote",
      msg: "Invalid State: Can't vote"
    },
    {
      code: 532,
      name: "InvalidStateCannotFinalize",
      msg: "Invalid State: Can't finalize vote"
    },
    {
      code: 533,
      name: "InvalidStateCannotCancelProposal",
      msg: "Invalid State: Can't cancel Proposal"
    },
    {
      code: 534,
      name: "VoteAlreadyRelinquished",
      msg: "Vote already relinquished"
    },
    {
      code: 535,
      name: "CannotFinalizeVotingInProgress",
      msg: "Can't finalize vote. Voting still in progress"
    },
    {
      code: 536,
      name: "ProposalVotingTimeExpired",
      msg: "Proposal voting time expired"
    },
    {
      code: 537,
      name: "InvalidSignatoryMint",
      msg: "Invalid Signatory Mint"
    },
    {
      code: 538,
      name: "InvalidGovernanceForProposal",
      msg: "Proposal does not belong to the given Governance"
    },
    {
      code: 539,
      name: "InvalidGoverningMintForProposal",
      msg: "Proposal does not belong to given Governing Mint"
    },
    {
      code: 540,
      name: "MintAuthorityMustSign",
      msg: "Current mint authority must sign transaction"
    },
    {
      code: 541,
      name: "InvalidMintAuthority",
      msg: "Invalid mint authority"
    },
    {
      code: 542,
      name: "MintHasNoAuthority",
      msg: "Mint has no authority"
    },
    {
      code: 543,
      name: "SplTokenAccountWithInvalidOwner",
      msg: "Invalid Token account owner"
    },
    {
      code: 544,
      name: "SplTokenMintWithInvalidOwner",
      msg: "Invalid Mint account owner"
    },
    {
      code: 545,
      name: "SplTokenAccountNotInitialized",
      msg: "Token Account is not initialized"
    },
    {
      code: 546,
      name: "SplTokenAccountDoesNotExist",
      msg: "Token Account doesn't exist"
    },
    {
      code: 547,
      name: "SplTokenInvalidTokenAccountData",
      msg: "Token account data is invalid"
    },
    {
      code: 548,
      name: "SplTokenInvalidMintAccountData",
      msg: "Token mint account data is invalid"
    },
    {
      code: 549,
      name: "SplTokenMintNotInitialized",
      msg: "Token Mint account is not initialized"
    },
    {
      code: 550,
      name: "SplTokenMintDoesNotExist",
      msg: "Token Mint account doesn't exist"
    },
    {
      code: 551,
      name: "InvalidProgramDataAccountAddress",
      msg: "Invalid ProgramData account address"
    },
    {
      code: 552,
      name: "InvalidProgramDataAccountData",
      msg: "Invalid ProgramData account Data"
    },
    {
      code: 553,
      name: "InvalidUpgradeAuthority",
      msg: "Provided upgrade authority doesn't match current program upgrade authority"
    },
    {
      code: 554,
      name: "UpgradeAuthorityMustSign",
      msg: "Current program upgrade authority must sign transaction"
    },
    {
      code: 555,
      name: "ProgramNotUpgradable",
      msg: "Given program is not upgradable"
    },
    {
      code: 556,
      name: "InvalidTokenOwner",
      msg: "Invalid token owner"
    },
    {
      code: 557,
      name: "TokenOwnerMustSign",
      msg: "Current token owner must sign transaction"
    },
    {
      code: 558,
      name: "VoteThresholdTypeNotSupported",
      msg: "Given VoteThresholdType is not supported"
    },
    {
      code: 559,
      name: "VoteWeightSourceNotSupported",
      msg: "Given VoteWeightSource is not supported"
    },
    {
      code: 560,
      name: "Legacy1",
      msg: "Legacy1"
    },
    {
      code: 561,
      name: "GovernancePdaMustSign",
      msg: "Governance PDA must sign"
    },
    {
      code: 562,
      name: "TransactionAlreadyFlaggedWithError",
      msg: "Transaction already flagged with error"
    },
    {
      code: 563,
      name: "InvalidRealmForGovernance",
      msg: "Invalid Realm for Governance"
    },
    {
      code: 564,
      name: "InvalidAuthorityForRealm",
      msg: "Invalid Authority for Realm"
    },
    {
      code: 565,
      name: "RealmHasNoAuthority",
      msg: "Realm has no authority"
    },
    {
      code: 566,
      name: "RealmAuthorityMustSign",
      msg: "Realm authority must sign"
    },
    {
      code: 567,
      name: "InvalidGoverningTokenHoldingAccount",
      msg: "Invalid governing token holding account"
    },
    {
      code: 568,
      name: "RealmCouncilMintChangeIsNotSupported",
      msg: "Realm council mint change is not supported"
    },
    {
      code: 569,
      name: "InvalidMaxVoterWeightAbsoluteValue",
      msg: "Invalid max voter weight absolute value"
    },
    {
      code: 570,
      name: "InvalidMaxVoterWeightSupplyFraction",
      msg: "Invalid max voter weight supply fraction"
    },
    {
      code: 571,
      name: "NotEnoughTokensToCreateGovernance",
      msg: "Owner doesn't have enough governing tokens to create Governance"
    },
    {
      code: 572,
      name: "TooManyOutstandingProposals",
      msg: "Too many outstanding proposals"
    },
    {
      code: 573,
      name: "AllProposalsMustBeFinalisedToWithdrawGoverningTokens",
      msg: "All proposals must be finalized to withdraw governing tokens"
    },
    {
      code: 574,
      name: "InvalidVoterWeightRecordForRealm",
      msg: "Invalid VoterWeightRecord for Realm"
    },
    {
      code: 575,
      name: "InvalidVoterWeightRecordForGoverningTokenMint",
      msg: "Invalid VoterWeightRecord for GoverningTokenMint"
    },
    {
      code: 576,
      name: "InvalidVoterWeightRecordForTokenOwner",
      msg: "Invalid VoterWeightRecord for TokenOwner"
    },
    {
      code: 577,
      name: "VoterWeightRecordExpired",
      msg: "VoterWeightRecord expired"
    },
    {
      code: 578,
      name: "InvalidRealmConfigForRealm",
      msg: "Invalid RealmConfig for Realm"
    },
    {
      code: 579,
      name: "TokenOwnerRecordAlreadyExists",
      msg: "TokenOwnerRecord already exists"
    },
    {
      code: 580,
      name: "GoverningTokenDepositsNotAllowed",
      msg: "Governing token deposits not allowed"
    },
    {
      code: 581,
      name: "InvalidVoteChoiceWeightPercentage",
      msg: "Invalid vote choice weight percentage"
    },
    {
      code: 582,
      name: "VoteTypeNotSupported",
      msg: "Vote type not supported"
    },
    {
      code: 583,
      name: "InvalidProposalOptions",
      msg: "Invalid proposal options"
    },
    {
      code: 584,
      name: "ProposalIsNotExecutable",
      msg: "Proposal is not not executable"
    },
    {
      code: 585,
      name: "DenyVoteIsNotAllowed",
      msg: "Deny vote is not allowed"
    },
    {
      code: 586,
      name: "CannotExecuteDefeatedOption",
      msg: "Cannot execute defeated option"
    },
    {
      code: 587,
      name: "VoterWeightRecordInvalidAction",
      msg: "VoterWeightRecord invalid action"
    },
    {
      code: 588,
      name: "VoterWeightRecordInvalidActionTarget",
      msg: "VoterWeightRecord invalid action target"
    },
    {
      code: 589,
      name: "InvalidMaxVoterWeightRecordForRealm",
      msg: "Invalid MaxVoterWeightRecord for Realm"
    },
    {
      code: 590,
      name: "InvalidMaxVoterWeightRecordForGoverningTokenMint",
      msg: "Invalid MaxVoterWeightRecord for GoverningTokenMint"
    },
    {
      code: 591,
      name: "MaxVoterWeightRecordExpired",
      msg: "MaxVoterWeightRecord expired"
    },
    {
      code: 592,
      name: "NotSupportedVoteType",
      msg: "Not supported VoteType"
    },
    {
      code: 593,
      name: "RealmConfigChangeNotAllowed",
      msg: "RealmConfig change not allowed"
    },
    {
      code: 594,
      name: "GovernanceConfigChangeNotAllowed",
      msg: "GovernanceConfig change not allowed"
    },
    {
      code: 595,
      name: "AtLeastOneVoteThresholdRequired",
      msg: "At least one VoteThreshold is required"
    },
    {
      code: 596,
      name: "ReservedBufferMustBeEmpty",
      msg: "Reserved buffer must be empty"
    },
    {
      code: 597,
      name: "CannotRelinquishInFinalizingState",
      msg: "Cannot Relinquish in Finalizing state"
    },
    {
      code: 598,
      name: "InvalidRealmConfigAddress",
      msg: "Invalid RealmConfig account address"
    },
    {
      code: 599,
      name: "CannotDepositDormantTokens",
      msg: "Cannot deposit dormant tokens"
    },
    {
      code: 600,
      name: "CannotWithdrawMembershipTokens",
      msg: "Cannot withdraw membership tokens"
    },
    {
      code: 601,
      name: "CannotRevokeGoverningTokens",
      msg: "Cannot revoke GoverningTokens"
    },
    {
      code: 602,
      name: "InvalidRevokeAmount",
      msg: "Invalid Revoke amount"
    },
    {
      code: 603,
      name: "InvalidGoverningTokenSource",
      msg: "Invalid GoverningToken source"
    },
    {
      code: 604,
      name: "CannotChangeCommunityTokenTypeToMembership",
      msg: "Cannot change community TokenType to Membership"
    },
    {
      code: 605,
      name: "VoterWeightThresholdDisabled",
      msg: "Voter weight threshold disabled"
    },
    {
      code: 606,
      name: "VoteNotAllowedInCoolOffTime",
      msg: "Vote not allowed in cool off time"
    },
    {
      code: 607,
      name: "CannotRefundProposalDeposit",
      msg: "Cannot refund ProposalDeposit"
    },
    {
      code: 608,
      name: "InvalidProposalForProposalDeposit",
      msg: "Invalid Proposal for ProposalDeposit"
    },
    {
      code: 609,
      name: "InvalidDepositExemptProposalCount",
      msg: "Invalid deposit_exempt_proposal_count"
    },
    {
      code: 610,
      name: "GoverningTokenMintNotAllowedToVote",
      msg: "GoverningTokenMint not allowed to vote"
    },
    {
      code: 611,
      name: "InvalidDepositPayerForProposalDeposit",
      msg: "Invalid deposit Payer for ProposalDeposit"
    },
    {
      code: 612,
      name: "InvalidStateNotFinal",
      msg: "Invalid State: Proposal is not in final state"
    },
    {
      code: 613,
      name: "InvalidStateToCompleteProposal",
      msg: "Invalid state for proposal state transition to Completed"
    },
    {
      code: 614,
      name: "InvalidNumberOfVoteChoices",
      msg: "Invalid number of vote choices"
    },
    {
      code: 615,
      name: "RankedVoteIsNotSupported",
      msg: "Ranked vote is not supported"
    },
    {
      code: 616,
      name: "ChoiceWeightMustBe100Percent",
      msg: "Choice weight must be 100%"
    },
    {
      code: 617,
      name: "SingleChoiceOnlyIsAllowed",
      msg: "Single choice only is allowed"
    },
    {
      code: 618,
      name: "AtLeastSingleChoiceIsRequired",
      msg: "At least single choice is required"
    },
    {
      code: 619,
      name: "TotalVoteWeightMustBe100Percent",
      msg: "Total vote weight must be 100%"
    },
    {
      code: 620,
      name: "InvalidMultiChoiceProposalParameters",
      msg: "Invalid multi choice proposal parameters"
    },
    {
      code: 621,
      name: "InvalidGovernanceForRequiredSignatory",
      msg: "Invalid Governance for RequiredSignatory"
    },
    {
      code: 622,
      name: "SignatoryRecordAlreadyExists",
      msg: "Signatory Record has already been created"
    },
    {
      code: 623,
      name: "InstructionDeprecated",
      msg: "Instruction has been removed"
    },
    {
      code: 624,
      name: "MissingRequiredSignatories",
      msg: "Proposal is missing required signatories"
    }
  ],
  metadata: {
    origin: "shank",
    address: "GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw"
  }
};

// src/constant.ts
var import_web3 = require("@solana/web3.js");
var DEFAULT_PROGRAM_ID = new import_web3.PublicKey("GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw");
var DEFAULT_CHAT_PROGRAM_ID = new import_web3.PublicKey("gCHAtYKrUUktTVzE4hEnZdLV4LXrdBf6Hh9qMaJALET");

// src/pda.ts
var import_bn = __toESM(require("bn.js"));
var import_web32 = require("@solana/web3.js");
var PdaClient = class {
  constructor(programId) {
    this.programId = programId;
  }
  realmAccount({ name }) {
    const pda = import_web32.PublicKey.findProgramAddressSync(
      [
        Buffer.from("governance"),
        Buffer.from(name)
      ],
      this.programId
    );
    return { publicKey: pda[0], bump: pda[1] };
  }
  communityTokenHoldingAccount({ realmAccount, communityMint }) {
    const pda = import_web32.PublicKey.findProgramAddressSync(
      [
        Buffer.from("governance"),
        realmAccount.toBuffer(),
        communityMint.toBuffer()
      ],
      this.programId
    );
    return { publicKey: pda[0], bump: pda[1] };
  }
  councilTokenHoldingAccount({ realmAccount, councilMint }) {
    const pda = import_web32.PublicKey.findProgramAddressSync(
      [
        Buffer.from("governance"),
        realmAccount.toBuffer(),
        councilMint.toBuffer()
      ],
      this.programId
    );
    return { publicKey: pda[0], bump: pda[1] };
  }
  realmConfigAccount({ realmAccount }) {
    const pda = import_web32.PublicKey.findProgramAddressSync(
      [
        Buffer.from("realm-config"),
        realmAccount.toBuffer()
      ],
      this.programId
    );
    return { publicKey: pda[0], bump: pda[1] };
  }
  tokenOwnerRecordAccount({ realmAccount, governingTokenMintAccount, governingTokenOwner }) {
    const pda = import_web32.PublicKey.findProgramAddressSync(
      [
        Buffer.from("governance"),
        realmAccount.toBuffer(),
        governingTokenMintAccount.toBuffer(),
        governingTokenOwner.toBuffer()
      ],
      this.programId
    );
    return { publicKey: pda[0], bump: pda[1] };
  }
  governingTokenHoldingAccount({ realmAccount, governingTokenMintAccount }) {
    const pda = import_web32.PublicKey.findProgramAddressSync(
      [
        Buffer.from("governance"),
        realmAccount.toBuffer(),
        governingTokenMintAccount.toBuffer()
      ],
      this.programId
    );
    return { publicKey: pda[0], bump: pda[1] };
  }
  governanceAccount({ realmAccount, seed }) {
    const pda = import_web32.PublicKey.findProgramAddressSync(
      [
        Buffer.from("account-governance"),
        realmAccount.toBuffer(),
        seed.toBuffer()
      ],
      this.programId
    );
    return { publicKey: pda[0], bump: pda[1] };
  }
  nativeTreasuryAccount({ governanceAccount }) {
    const pda = import_web32.PublicKey.findProgramAddressSync(
      [
        Buffer.from("native-treasury"),
        governanceAccount.toBuffer()
      ],
      this.programId
    );
    return { publicKey: pda[0], bump: pda[1] };
  }
  proposalAccount({ governanceAccount, governingTokenMint, proposalSeed }) {
    const pda = import_web32.PublicKey.findProgramAddressSync(
      [
        Buffer.from("governance"),
        governanceAccount.toBuffer(),
        governingTokenMint.toBuffer(),
        proposalSeed.toBuffer()
      ],
      this.programId
    );
    return { publicKey: pda[0], bump: pda[1] };
  }
  proposalDepositAccount({ proposal, depositPayer }) {
    const pda = import_web32.PublicKey.findProgramAddressSync(
      [
        Buffer.from("proposal-deposit"),
        proposal.toBuffer(),
        depositPayer.toBuffer()
      ],
      this.programId
    );
    return { publicKey: pda[0], bump: pda[1] };
  }
  signatoryRecordAccount({ proposal, signatory }) {
    const pda = import_web32.PublicKey.findProgramAddressSync(
      [
        Buffer.from("governance"),
        proposal.toBuffer(),
        signatory.toBuffer()
      ],
      this.programId
    );
    return { publicKey: pda[0], bump: pda[1] };
  }
  proposalTransactionAccount({ proposal, optionIndex, index }) {
    const pda = import_web32.PublicKey.findProgramAddressSync(
      [
        Buffer.from("governance"),
        proposal.toBuffer(),
        new import_bn.default(optionIndex).toArrayLike(Buffer, "le", 1),
        new import_bn.default(index).toArrayLike(Buffer, "le", 2)
      ],
      this.programId
    );
    return { publicKey: pda[0], bump: pda[1] };
  }
  voteRecordAccount({ proposal, tokenOwnerRecord }) {
    const pda = import_web32.PublicKey.findProgramAddressSync(
      [
        Buffer.from("governance"),
        proposal.toBuffer(),
        tokenOwnerRecord.toBuffer()
      ],
      this.programId
    );
    return { publicKey: pda[0], bump: pda[1] };
  }
  requiredSignatoryAccount({ governanceAccount, signatory }) {
    const pda = import_web32.PublicKey.findProgramAddressSync(
      [
        Buffer.from("required-signatory"),
        governanceAccount.toBuffer(),
        signatory.toBuffer()
      ],
      this.programId
    );
    return { publicKey: pda[0], bump: pda[1] };
  }
};

// src/instructions/create_realm.ts
var import_bn2 = __toESM(require("bn.js"));

// src/ix_filter.ts
function ixFilter(ix, ixName, governance) {
  var _a;
  ix.data = ix.data.subarray(8);
  const discrimnant = (_a = governance.idl.instructions.find(
    (ixs) => ixs.name === ixName
  )) == null ? void 0 : _a.discriminant.value;
  if (discrimnant === void 0) {
    throw new Error(`Invalid Instruction Name - ${ixName}`);
  }
  const discriminator = Buffer.from(
    discrimnant.toString(16).padStart(2, "0"),
    "hex"
  );
  ix.data = Buffer.concat([discriminator, ix.data]);
  if (ixName !== "executeTransaction") {
    ix.keys = ix.keys.filter((key) => key.pubkey.toBase58() !== governance.programId.toBase58());
  }
  return ix;
}

// src/instructions/create_realm.ts
function _createRealmContext(name, communityTokenMint, minCommunityWeightToCreateGovernance, communityMintMaxVoterWeightSource, communityTokenType, councilTokenType, program, payer, pda, councilTokenMint, communityVoterWeightAddinProgramId, maxCommunityVoterWeightAddinProgramId, councilVoterWeightAddinProgramId, maxCouncilVoterWeightAddinProgramId) {
  return __async(this, null, function* () {
    const commuintyGoverningTokenType = communityTokenType === "liquid" ? { liquid: {} } : communityTokenType === "membership" ? { membership: {} } : { dormant: {} };
    const councilGoverningTokenType = councilTokenType === "liquid" ? { liquid: {} } : councilTokenType === "membership" ? { membership: {} } : { dormant: {} };
    const realmAccount = pda.realmAccount({ name }).publicKey;
    const communityTokenHoldingAccount = pda.communityTokenHoldingAccount({
      realmAccount,
      communityMint: communityTokenMint
    }).publicKey;
    const councilTokenHoldingAccount = councilTokenMint ? pda.councilTokenHoldingAccount({
      realmAccount,
      councilMint: councilTokenMint ? councilTokenMint : communityTokenMint
    }).publicKey : null;
    const realmConfigAccount = pda.realmConfigAccount({ realmAccount }).publicKey;
    const minCommunityWeight = typeof minCommunityWeightToCreateGovernance === "number" ? new import_bn2.default(minCommunityWeightToCreateGovernance) : minCommunityWeightToCreateGovernance;
    const defaultIx = yield program.methods.createRealm(name, {
      useCouncilMint: councilTokenMint !== void 0,
      minCommunityWeightToCreateGovernance: minCommunityWeight,
      communityMintMaxVoterWeightSource: communityMintMaxVoterWeightSource.type === "absolute" ? { absolute: [communityMintMaxVoterWeightSource.amount] } : { supplyFraction: [communityMintMaxVoterWeightSource.amount] },
      communityTokenConfigArgs: {
        useVoterWeightAddin: communityVoterWeightAddinProgramId !== void 0,
        useMaxVoterWeightAddin: maxCommunityVoterWeightAddinProgramId !== void 0,
        tokenType: commuintyGoverningTokenType
      },
      councilTokenConfigArgs: {
        useVoterWeightAddin: councilVoterWeightAddinProgramId !== void 0,
        useMaxVoterWeightAddin: maxCouncilVoterWeightAddinProgramId !== void 0,
        tokenType: councilGoverningTokenType
      }
    }).accounts({
      realmAccount,
      realmAuthority: payer,
      payer,
      communityTokenMint,
      communityTokenHoldingAccount,
      councilTokenMint: councilTokenMint != null ? councilTokenMint : null,
      councilTokenHoldingAccount,
      realmConfig: realmConfigAccount,
      communityVoterWeightAddin: communityVoterWeightAddinProgramId != null ? communityVoterWeightAddinProgramId : null,
      maxCommunityVoterWeightAddin: maxCommunityVoterWeightAddinProgramId != null ? maxCommunityVoterWeightAddinProgramId : null,
      councilVoterWeightAddin: councilVoterWeightAddinProgramId != null ? councilVoterWeightAddinProgramId : null,
      maxCouncilVoterWeightAddin: maxCouncilVoterWeightAddinProgramId != null ? maxCouncilVoterWeightAddinProgramId : null
    }).instruction();
    return ixFilter(defaultIx, "createRealm", program);
  });
}

// src/instructions/deposit_governing_tokens.ts
var import_bn3 = __toESM(require("bn.js"));
function _depositGoverningTokensContext(realmAccount, governingTokenMintAccount, governingTokenSourceAccount, governingTokenOwner, governingTokenSourceAuthority, amount, program, payer, pda) {
  return __async(this, null, function* () {
    const governingTokenHoldingAccount = pda.governingTokenHoldingAccount({
      realmAccount,
      governingTokenMintAccount
    }).publicKey;
    const tokenOwnerRecord = pda.tokenOwnerRecordAccount(
      { realmAccount, governingTokenMintAccount, governingTokenOwner }
    ).publicKey;
    const realmConfig = pda.realmConfigAccount({ realmAccount }).publicKey;
    const depositAmount = typeof amount === "number" ? new import_bn3.default(amount) : amount;
    const defaultIx = yield program.methods.depositGoverningTokens(depositAmount).accounts({
      realmAccount,
      governingTokenHoldingAccount,
      governingTokenOwnerAccount: governingTokenOwner,
      governingTokenSourceAccount,
      governingTokenSourceAccountAuthority: governingTokenSourceAuthority,
      realmConfigAccount: realmConfig,
      tokenOwnerRecord,
      payer
    }).instruction();
    return ixFilter(defaultIx, "depositGoverningTokens", program);
  });
}

// src/instructions/withdraw_governing_tokens.ts
function _withdrawGoverningTokensContext(realmAccount, governingTokenMintAccount, governingTokenDestinationAccount, governingTokenOwner, program, pda) {
  return __async(this, null, function* () {
    const governingTokenHoldingAccount = pda.governingTokenHoldingAccount({
      realmAccount,
      governingTokenMintAccount
    }).publicKey;
    const tokenOwnerRecord = pda.tokenOwnerRecordAccount(
      { realmAccount, governingTokenMintAccount, governingTokenOwner }
    ).publicKey;
    const realmConfigAccount = pda.realmConfigAccount({ realmAccount }).publicKey;
    const defaultIx = yield program.methods.withdrawGoverningTokens().accounts({
      realmAccount,
      governingTokenHoldingAccount,
      governingTokenDestinationAccount,
      governingTokenOwnerAccount: governingTokenOwner,
      realmConfigAccount,
      tokenOwnerRecord
    }).instruction();
    return ixFilter(defaultIx, "withdrawGoverningTokens", program);
  });
}

// src/instructions/set_governance_delegate.ts
function _setGovernanceDelegateContext(tokenOwnerRecord, currentDelegateOrOwner, newGovernanceDelegate, program) {
  return __async(this, null, function* () {
    const defaultIx = yield program.methods.setGovernanceDelegate(newGovernanceDelegate).accounts({
      currentDelegateOrOwner,
      tokenOwnerRecord
    }).instruction();
    return ixFilter(defaultIx, "setGovernanceDelegate", program);
  });
}

// src/instructions/create_governance.ts
var import_bn4 = __toESM(require("bn.js"));
var import_web33 = require("@solana/web3.js");
function _createGovernanceContext(config, realmAccount, governanceAuthority, tokenOwnerRecord, payer, program, pda, governanceAccountSeed, voterWeightRecord) {
  return __async(this, null, function* () {
    const seed = governanceAccountSeed != null ? governanceAccountSeed : import_web33.Keypair.generate().publicKey;
    const governanceAccount = pda.governanceAccount({ realmAccount, seed }).publicKey;
    const realmConfig = pda.realmConfigAccount({ realmAccount }).publicKey;
    const configData = __spreadProps(__spreadValues({}, config), {
      minCommunityWeightToCreateProposal: typeof config.minCommunityWeightToCreateProposal === "number" ? new import_bn4.default(config.minCommunityWeightToCreateProposal) : config.minCommunityWeightToCreateProposal,
      minCouncilWeightToCreateProposal: typeof config.minCouncilWeightToCreateProposal === "number" ? new import_bn4.default(config.minCouncilWeightToCreateProposal) : config.minCouncilWeightToCreateProposal
    });
    const defaultIx = yield program.methods.createGovernance(configData).accounts({
      realmAccount,
      governanceAccount,
      governedAccount: seed,
      governingTokenOwnerRecord: tokenOwnerRecord,
      realmConfigAccount: realmConfig,
      voterWeightRecord: voterWeightRecord != null ? voterWeightRecord : null,
      governanceAuthority,
      payer
    }).instruction();
    return ixFilter(defaultIx, "createGovernance", program);
  });
}

// src/instructions/create_proposal.ts
var import_web34 = require("@solana/web3.js");
function _createProposalContext(name, descriptionLink, voteType, options, useDenyOption, realmAccount, governanceAccount, tokenOwnerRecord, governingTokenMint, governanceAuthority, payer, program, pda, proposalSeed, voterWeightRecord) {
  return __async(this, null, function* () {
    const seed = proposalSeed != null ? proposalSeed : import_web34.Keypair.generate().publicKey;
    const proposalAccount = pda.proposalAccount({ governanceAccount, governingTokenMint, proposalSeed: seed }).publicKey;
    const realmConfig = pda.realmConfigAccount({ realmAccount }).publicKey;
    const proposalDepositAccount = pda.proposalDepositAccount({
      proposal: proposalAccount,
      depositPayer: payer
    }).publicKey;
    const voteTypeMod = voteType.choiceType === "single" ? { singleChoice: {} } : { multiChoice: __spreadProps(__spreadValues({}, voteType.multiChoiceOptions), {
      choiceType: voteType.multiChoiceOptions.choiceType === "fullWeight" ? { fullWeight: {} } : { weighted: {} }
    }) };
    const defaultIx = yield program.methods.createProposal(
      name,
      descriptionLink,
      voteTypeMod,
      options,
      useDenyOption,
      seed
    ).accounts({
      realmAccount,
      proposalAccount,
      governanceAccount,
      tokenOwnerRecord,
      governingTokenMint,
      governanceAuthority,
      voterWeightRecord: voterWeightRecord != null ? voterWeightRecord : null,
      realmConfig,
      proposalDepositAccount,
      payer
    }).instruction();
    return ixFilter(defaultIx, "createProposal", program);
  });
}

// src/instructions/add_signatory.ts
function _addSignatoryContext(signatory, proposalAccount, tokenOwnerRecord, governanceAuthority, payer, program, pda) {
  return __async(this, null, function* () {
    const signatoryRecordAccount = pda.signatoryRecordAccount({ proposal: proposalAccount, signatory }).publicKey;
    const defaultIx = yield program.methods.addSignatory(signatory).accounts({
      proposalAccount,
      tokenOwnerRecord,
      governanceAuthority,
      payer,
      signatoryRecordAccount
    }).instruction();
    return ixFilter(defaultIx, "addSignatory", program);
  });
}

// src/instructions/insert_transaction.ts
function _insertTransactionContext(instructions, optionIndex, index, holdUpTime, governanceAccount, proposalAccount, tokenOwnerRecord, governanceAuthority, payer, program, pda) {
  return __async(this, null, function* () {
    const proposalTransactionAccount = pda.proposalTransactionAccount({ proposal: proposalAccount, optionIndex, index }).publicKey;
    const ixs = instructions.map((ix) => ({
      programId: ix.programId,
      accounts: ix.keys,
      data: ix.data
    }));
    const defaultIx = yield program.methods.insertTransaction(optionIndex, index, holdUpTime, ixs).accounts({
      governanceAccount,
      proposalAccount,
      tokenOwnerRecord,
      governanceAuthority,
      proposalTransactionAccount,
      payer
    }).instruction();
    return ixFilter(defaultIx, "insertTransaction", program);
  });
}

// src/instructions/remove_transaction.ts
function _removeTransactionContext(proposalAccount, tokenOwnerRecord, governanceAuthority, proposalTransactionAccount, beneficiaryAccount, program) {
  return __async(this, null, function* () {
    const defaultIx = yield program.methods.removeTransaction().accounts({
      proposalAccount,
      tokenOwnerRecord,
      governanceAuthority,
      proposalTransactionAccount,
      beneficiaryAccount
    }).instruction();
    return ixFilter(defaultIx, "removeTransaction", program);
  });
}

// src/instructions/cancel_proposal.ts
function _cancelProposalContext(realmAccount, governanceAccount, proposalAccount, tokenOwnerRecord, governanceAuthority, program) {
  return __async(this, null, function* () {
    const defaultIx = yield program.methods.cancelProposal().accounts({
      realmAccount,
      governanceAccount,
      proposalAccount,
      tokenOwnerRecord,
      governanceAuthority
    }).instruction();
    return ixFilter(defaultIx, "cancelProposal", program);
  });
}

// src/instructions/sign_off_proposal.ts
function _signOffProposalContext(realmAccount, governanceAccount, proposalAccount, signer, program, signatoryRecordAccount, tokenOwnerRecord) {
  return __async(this, null, function* () {
    if (!signatoryRecordAccount && !tokenOwnerRecord) {
      throw new Error("One of the signatoryRecordAccount or tokenOwnerRecord is required");
    }
    const tokenOwnerOrSignatory = signatoryRecordAccount != null ? signatoryRecordAccount : tokenOwnerRecord;
    const defaultIx = yield program.methods.signOffProposal().accounts({
      realmAccount,
      governanceAccount,
      proposalAccount,
      tokenOwnerRecord: tokenOwnerOrSignatory,
      signatoryAccount: signer
    }).instruction();
    return ixFilter(defaultIx, "signOffProposal", program);
  });
}

// src/instructions/cast_vote.ts
function _castVoteContext(vote, realmAccount, governanceAccount, proposalAccount, proposalOwnerTokenOwnerRecord, voterTokenOwnerRecord, governanceAuthority, governingTokenMint, payer, program, pda, voterWeightRecord, maxVoterWeightRecord) {
  return __async(this, null, function* () {
    const realmConfig = pda.realmConfigAccount({ realmAccount }).publicKey;
    const voteRecordAccount = pda.voteRecordAccount({ proposal: proposalAccount, tokenOwnerRecord: voterTokenOwnerRecord }).publicKey;
    const defaultIx = yield program.methods.castVote(vote).accounts({
      realmAccount,
      governanceAccount,
      proposalAccount,
      proposalTokenOwnerRecord: proposalOwnerTokenOwnerRecord,
      voterTokenOwnerRecord,
      governanceAuthority,
      governingTokenMint,
      payer,
      voterWeightRecord: voterWeightRecord != null ? voterWeightRecord : null,
      maxVoterWeightRecord: maxVoterWeightRecord != null ? maxVoterWeightRecord : null,
      realmConfigAccount: realmConfig,
      proposalVoteRecord: voteRecordAccount
    }).instruction();
    return ixFilter(defaultIx, "castVote", program);
  });
}

// src/instructions/finalize_vote.ts
function _finalizeVoteContext(realmAccount, governanceAccount, proposalAccount, tokenOwnerRecord, governingTokenMint, program, pda, maxVoterWeightRecord) {
  return __async(this, null, function* () {
    const realmConfig = pda.realmConfigAccount({ realmAccount }).publicKey;
    const defaultIx = yield program.methods.finalizeVote().accounts({
      realmAccount,
      governanceAccount,
      proposalAccount,
      tokenOwnerRecord,
      governingTokenMint,
      realmConfig,
      maxVoterWeightRecord: maxVoterWeightRecord != null ? maxVoterWeightRecord : null
    }).instruction();
    return ixFilter(defaultIx, "finalizeVote", program);
  });
}

// src/instructions/relinquish_vote.ts
function _relinquishVoteContext(realmAccount, governanceAccount, proposalAccount, tokenOwnerRecord, governingTokenMint, program, pda, governanceAuthority, beneficiaryAccount) {
  return __async(this, null, function* () {
    const voteRecordAccount = pda.voteRecordAccount({ proposal: proposalAccount, tokenOwnerRecord }).publicKey;
    const defaultIx = yield program.methods.relinquishVote().accounts({
      realmAccount,
      governanceAccount,
      proposalAccount,
      tokenOwnerRecord,
      governanceAuthority: governanceAuthority != null ? governanceAuthority : null,
      governingTokenMint,
      beneficiaryAccount: beneficiaryAccount != null ? beneficiaryAccount : null,
      proposalVoteRecord: voteRecordAccount
    }).instruction();
    return ixFilter(defaultIx, "relinquishVote", program);
  });
}

// src/instructions/execute_transaction.ts
function _executeTransactionContext(governanceAccount, proposalAccount, proposalTransactionAccount, transactionAccounts, program) {
  return __async(this, null, function* () {
    const defaultIx = yield program.methods.executeTransaction().accounts({
      governanceAccount,
      proposalAccount,
      proposalTransactionAccount
    }).remainingAccounts(transactionAccounts).instruction();
    return ixFilter(defaultIx, "executeTransaction", program);
  });
}

// src/instructions/create_native_treasury.ts
function _createNativeTreasuryContext(governanceAccount, payer, program, pda) {
  return __async(this, null, function* () {
    const nativeTreasuryAccount = pda.nativeTreasuryAccount({ governanceAccount }).publicKey;
    const defaultIx = yield program.methods.createNativeTreasury().accounts({
      governanceAccount,
      nativeTreasuryAccount,
      payer
    }).instruction();
    return ixFilter(defaultIx, "createNativeTreasury", program);
  });
}

// src/instructions/set_governance_config.ts
var import_bn5 = require("bn.js");
function _setGovernanceConfigContext(config, governanceAccount, program) {
  return __async(this, null, function* () {
    const govConfig = __spreadValues({}, config);
    govConfig.minCommunityWeightToCreateProposal = typeof govConfig.minCommunityWeightToCreateProposal === "number" ? new import_bn5.BN(govConfig.minCommunityWeightToCreateProposal) : govConfig.minCommunityWeightToCreateProposal;
    govConfig.minCouncilWeightToCreateProposal = typeof govConfig.minCouncilWeightToCreateProposal === "number" ? new import_bn5.BN(govConfig.minCouncilWeightToCreateProposal) : govConfig.minCouncilWeightToCreateProposal;
    const defaultIx = yield program.methods.setGovernanceConfig(govConfig).accounts({
      governanceAccount
    }).instruction();
    return ixFilter(defaultIx, "setGovernanceConfig", program);
  });
}

// src/instructions/set_realm_authority.ts
function _setRealmAuthorityContext(realmAccount, currentRealmAuthority, action, program, newRealmAuthority) {
  return __async(this, null, function* () {
    if (action !== "remove" && !newRealmAuthority) {
      throw new Error("New Realm Authority is required!");
    }
    const setRealmAuthorityAction = action === "remove" ? { remove: {} } : action === "setChecked" ? { setChecked: {} } : { setUnchecked: {} };
    const defaultIx = yield program.methods.setRealmAuthority(setRealmAuthorityAction).accounts({
      realmAccount,
      realmAuthority: currentRealmAuthority,
      newRealmAuthority: newRealmAuthority != null ? newRealmAuthority : null
    }).instruction();
    return ixFilter(defaultIx, "setRealmAuthority", program);
  });
}

// src/instructions/set_realm_config.ts
function _setRealmConfigContext(config, realmAccount, realmAuthority, payer, program, pda, councilTokenMint, communityVoterWeightAddinProgramId, maxCommunityVoterWeightAddinProgramId, councilVoterWeightAddinProgramId, maxCouncilVoterWeightAddinProgramId) {
  return __async(this, null, function* () {
    const realmConfig = pda.realmConfigAccount({ realmAccount }).publicKey;
    const councilTokenHoldingAccount = councilTokenMint ? pda.councilTokenHoldingAccount({
      realmAccount,
      councilMint: councilTokenMint
    }).publicKey : null;
    const defaultIx = yield program.methods.setRealmConfig(config).accounts({
      realmAccount,
      realmAuthority,
      payer,
      realmConfig,
      councilTokenMint: councilTokenMint != null ? councilTokenMint : null,
      councilTokenHoldingAccount,
      communityVoterWeightAddinProgramId: communityVoterWeightAddinProgramId != null ? communityVoterWeightAddinProgramId : null,
      maxCommunityVoterWeightAddinProgramId: maxCommunityVoterWeightAddinProgramId != null ? maxCommunityVoterWeightAddinProgramId : null,
      councilVoterWeightAddinProgramId: councilVoterWeightAddinProgramId != null ? councilVoterWeightAddinProgramId : null,
      maxCouncilVoterWeightAddinProgramId: maxCouncilVoterWeightAddinProgramId != null ? maxCouncilVoterWeightAddinProgramId : null
    }).instruction();
    return ixFilter(defaultIx, "setRealmConfig", program);
  });
}

// src/instructions/create_token_owner_record.ts
function _createTokenOwnerRecordContext(realmAccount, governingTokenOwner, governingTokenMint, payer, program, pda) {
  return __async(this, null, function* () {
    const tokenOwnerRecord = pda.tokenOwnerRecordAccount({
      realmAccount,
      governingTokenMintAccount: governingTokenMint,
      governingTokenOwner
    }).publicKey;
    const defaultIx = yield program.methods.createTokenOwnerRecord().accounts({
      realmAccount,
      payer,
      governingTokenOwnerAccount: governingTokenOwner,
      governingTokenMint,
      tokenOwnerRecord
    }).instruction();
    return ixFilter(defaultIx, "createTokenOwnerRecord", program);
  });
}

// src/instructions/revoke_governing_tokens.ts
var import_bn6 = __toESM(require("bn.js"));
function _revokeGoverningTokensContext(amount, realmAccount, tokenOwnerRecord, governingTokenMint, revokeAuthority, program, pda) {
  return __async(this, null, function* () {
    const governingTokenHoldingAccount = pda.communityTokenHoldingAccount({
      realmAccount,
      communityMint: governingTokenMint
    }).publicKey;
    const realmConfigAccount = pda.realmConfigAccount({ realmAccount }).publicKey;
    const revokeAmount = typeof amount === "number" ? new import_bn6.default(amount) : amount;
    const defaultIx = yield program.methods.revokeGoverningTokens(revokeAmount).accounts({
      realmAccount,
      governingTokenMint,
      tokenOwnerRecord,
      governingTokenHoldingAccount,
      governingTokenMintAuthorityOrTokenOwner: revokeAuthority,
      realmConfigAccount
    }).instruction();
    return ixFilter(defaultIx, "revokeGoverningTokens", program);
  });
}

// src/instructions/refund_proposal_deposit.ts
function _refundProposalDepositContext(proposalAccount, depositPayer, program, pda) {
  return __async(this, null, function* () {
    const proposalDepositAccount = pda.proposalDepositAccount({
      proposal: proposalAccount,
      depositPayer
    }).publicKey;
    const defaultIx = yield program.methods.refundProposalDeposit().accounts({
      proposalAccount,
      proposalDepositAccount,
      proposalDepositPayer: depositPayer
    }).instruction();
    return ixFilter(defaultIx, "refundProposalDeposit", program);
  });
}

// src/instructions/complete_proposal.ts
function _completeProposalContext(proposalAccount, tokenOwnerRecord, completeProposalAuthority, program) {
  return __async(this, null, function* () {
    const defaultIx = yield program.methods.completeProposal().accounts({
      proposalAccount,
      tokenOwnerRecord,
      completeProposalAuthority
    }).instruction();
    return ixFilter(defaultIx, "completeProposal", program);
  });
}

// src/instructions/post_message.ts
var import_anchor = require("@coral-xyz/anchor");
var import_web35 = require("@solana/web3.js");

// src/idl/chat.json
var chat_default = {
  version: "0.2.9",
  name: "spl_governance_chat",
  instructions: [
    {
      name: "postMessage",
      accounts: [
        {
          name: "governanceProgramId",
          isMut: false,
          isSigner: false
        },
        {
          name: "realmAccount",
          isMut: false,
          isSigner: false
        },
        {
          name: "governanceAccount",
          isMut: false,
          isSigner: false
        },
        {
          name: "proposalAccount",
          isMut: false,
          isSigner: false
        },
        {
          name: "tokenOwnerRecord",
          isMut: false,
          isSigner: false
        },
        {
          name: "governanceAuthority",
          isMut: false,
          isSigner: true,
          docs: [
            "token owner or governance delegate"
          ]
        },
        {
          name: "chatMessage",
          isMut: true,
          isSigner: true
        },
        {
          name: "payer",
          isMut: true,
          isSigner: true
        },
        {
          name: "systemProgram",
          isMut: false,
          isSigner: false
        },
        {
          name: "replyToMessage",
          isMut: false,
          isSigner: false,
          isOptional: true
        },
        {
          name: "realmConfigAccount",
          isMut: false,
          isSigner: false
        },
        {
          name: "voterWeightRecord",
          isMut: false,
          isSigner: false,
          isOptional: true
        }
      ],
      args: [
        {
          name: "body",
          type: {
            defined: "MessageBody"
          }
        },
        {
          name: "isReply",
          type: "bool"
        }
      ],
      discriminant: {
        type: "u8",
        value: 0
      }
    }
  ],
  accounts: [
    {
      name: "chatMessage",
      type: {
        kind: "struct",
        fields: [
          {
            name: "accountType",
            type: {
              defined: "GovernanceChatAccountType"
            }
          },
          {
            name: "proposal",
            type: "publicKey"
          },
          {
            name: "author",
            type: "publicKey"
          },
          {
            name: "postedAt",
            type: {
              defined: "UnixTimestamp"
            }
          },
          {
            name: "replyTo",
            type: {
              option: "publicKey"
            }
          },
          {
            name: "body",
            type: {
              defined: "MessageBody"
            }
          }
        ]
      }
    }
  ],
  types: [
    {
      name: "GovernanceChatAccountType",
      type: {
        kind: "enum",
        variants: [
          {
            name: "Uninitialized"
          },
          {
            name: "ChatMessage"
          }
        ]
      }
    },
    {
      name: "MessageBody",
      type: {
        kind: "enum",
        variants: [
          {
            name: "Text",
            fields: [
              "string"
            ]
          },
          {
            name: "Reaction",
            fields: [
              "string"
            ]
          }
        ]
      }
    },
    {
      name: "UnixTimestamp",
      type: {
        kind: "alias",
        value: "i64"
      }
    }
  ],
  errors: [
    {
      code: 900,
      name: "NotEnoughTokensToCommentProposal",
      msg: "Owner doesn't have enough governing tokens to comment on Proposal"
    },
    {
      code: 901,
      name: "AccountAlreadyInitialized",
      msg: "Account already initialized"
    }
  ],
  metadata: {
    origin: "shank",
    address: "gCHAtYKrUUktTVzE4hEnZdLV4LXrdBf6Hh9qMaJALET"
  }
};

// src/instructions/post_message.ts
function _postMessageContext(isReply, messageBody, messageType, chatMessageAccount, governanceProgramId, realmAccount, governanceAccount, proposalAccount, tokenOwnerRecord, governanceAuthority, provider, pda, payer, replyTo, voterWeightRecord) {
  return __async(this, null, function* () {
    const chatProgramId = new import_web35.PublicKey(chat_default.metadata.address);
    const chatProgram = new import_anchor.Program(chat_default, chatProgramId, provider);
    const message = messageType === "text" ? { text: [messageBody] } : { reaction: [messageBody] };
    const realmConfigAccount = pda.realmConfigAccount({ realmAccount }).publicKey;
    const defaultIx = yield chatProgram.methods.postMessage(
      message,
      isReply
    ).accounts({
      governanceProgramId,
      realmAccount,
      governanceAccount,
      proposalAccount,
      tokenOwnerRecord,
      governanceAuthority,
      chatMessage: chatMessageAccount,
      payer,
      realmConfigAccount,
      replyToMessage: replyTo != null ? replyTo : null,
      voterWeightRecord: voterWeightRecord != null ? voterWeightRecord : null
    }).instruction();
    return ixFilter(defaultIx, "postMessage", chatProgram);
  });
}

// src/idl/addin.json
var addin_default = {
  version: "0.1.4",
  name: "spl_governance_addin_api",
  instructions: [],
  accounts: [
    {
      name: "maxVoterWeightRecord",
      type: {
        kind: "struct",
        fields: [
          {
            name: "accountDiscriminator",
            type: {
              array: [
                "u8",
                8
              ]
            }
          },
          {
            name: "realm",
            type: "publicKey"
          },
          {
            name: "governingTokenMint",
            type: "publicKey"
          },
          {
            name: "maxVoterWeight",
            type: "u64"
          },
          {
            name: "maxVoterWeightExpiry",
            type: {
              option: {
                defined: "Slot"
              }
            }
          },
          {
            name: "reserved",
            type: {
              array: [
                "u8",
                8
              ]
            }
          }
        ]
      }
    },
    {
      name: "voterWeightRecord",
      type: {
        kind: "struct",
        fields: [
          {
            name: "accountDiscriminator",
            type: {
              array: [
                "u8",
                8
              ]
            }
          },
          {
            name: "realm",
            type: "publicKey"
          },
          {
            name: "governingTokenMint",
            type: "publicKey"
          },
          {
            name: "governingTokenOwner",
            type: "publicKey"
          },
          {
            name: "voterWeight",
            type: "u64"
          },
          {
            name: "voterWeightExpiry",
            type: {
              option: {
                defined: "Slot"
              }
            }
          },
          {
            name: "weightAction",
            type: {
              option: {
                defined: "VoterWeightAction"
              }
            }
          },
          {
            name: "weightActionTarget",
            type: {
              option: "publicKey"
            }
          },
          {
            name: "reserved",
            type: {
              array: [
                "u8",
                8
              ]
            }
          }
        ]
      }
    }
  ],
  types: [
    {
      name: "VoterWeightAction",
      type: {
        kind: "enum",
        variants: [
          {
            name: "CastVote"
          },
          {
            name: "CommentProposal"
          },
          {
            name: "CreateGovernance"
          },
          {
            name: "CreateProposal"
          },
          {
            name: "SignOffProposal"
          }
        ]
      }
    },
    {
      name: "Slot",
      type: {
        kind: "alias",
        value: "u64"
      }
    }
  ]
};

// src/account.ts
var import_accounts = require("@coral-xyz/anchor/dist/cjs/coder/borsh/accounts");
var import_web36 = require("@solana/web3.js");
function deserialize(name, data, pubkey, programType) {
  const coder = programType === "chat" ? new import_accounts.BorshAccountsCoder(chat_default) : programType === "addin" ? new import_accounts.BorshAccountsCoder(addin_default) : new import_accounts.BorshAccountsCoder(gov_default);
  const modifiedData = Buffer.concat([Buffer.from("0".repeat(16), "hex"), data]);
  return __spreadProps(__spreadValues({}, coder.decodeUnchecked(name, modifiedData)), {
    publicKey: pubkey
  });
}
function fetchAndDeserialize(connection, pubkey, name, programType) {
  return __async(this, null, function* () {
    const account = yield connection.getAccountInfo(pubkey);
    if (account == null ? void 0 : account.data) {
      return __spreadProps(__spreadValues({}, deserialize(name, account.data, pubkey, programType)), { balance: account.lamports / import_web36.LAMPORTS_PER_SOL });
    } else {
      throw Error("The account doesn't exist.");
    }
  });
}
function fetchMultipleAndDeserialize(connection, programId, name, initialByte, customOffset, customOffsetAddress, accountSize, programType) {
  return __async(this, null, function* () {
    const filters = [];
    if (initialByte) {
      filters.push(
        {
          memcmp: {
            offset: 0,
            bytes: initialByte
          }
        }
      );
    }
    if (customOffset && customOffsetAddress) {
      customOffset.forEach((offset, index) => {
        const offsetValue = customOffsetAddress[index];
        filters.push({
          memcmp: {
            offset,
            bytes: typeof offsetValue === "string" ? offsetValue : offsetValue.toBase58()
          }
        });
      });
    }
    if (accountSize) {
      filters.push(
        {
          dataSize: accountSize
        }
      );
    }
    const accounts = yield connection.getProgramAccounts(programId, {
      filters
    });
    const deserializeAccounts = accounts.map((acc) => {
      if (acc.account.data) {
        try {
          return __spreadProps(__spreadValues({}, deserialize(name, acc.account.data, acc.pubkey, programType)), {
            balance: acc.account.lamports / import_web36.LAMPORTS_PER_SOL
          });
        } catch (e) {
          return;
        }
      } else {
        throw Error("The account doesn't exist.");
      }
    });
    return deserializeAccounts.filter((a) => a !== void 0);
  });
}
function fetchMultipleAndNotDeserialize(connection, programId, name, initialByte, customOffset, customOffsetAddress, accountSize, programType) {
  return __async(this, null, function* () {
    const filters = [];
    if (initialByte) {
      filters.push(
        {
          memcmp: {
            offset: 0,
            bytes: initialByte
          }
        }
      );
    }
    if (customOffset && customOffsetAddress) {
      customOffset.forEach((offset, index) => {
        const offsetValue = customOffsetAddress[index];
        filters.push({
          memcmp: {
            offset,
            bytes: typeof offsetValue === "string" ? offsetValue : offsetValue.toBase58()
          }
        });
      });
    }
    if (accountSize) {
      filters.push(
        {
          dataSize: accountSize
        }
      );
    }
    const accounts = yield connection.getProgramAccounts(programId, {
      filters,
      dataSlice: {
        length: 0,
        offset: 0
      }
    });
    return accounts.map((acc) => acc.pubkey);
  });
}

// src/index.ts
var SplGovernance = class {
  constructor(connection, programId) {
    this.connection = connection;
    this.programId = programId != null ? programId : DEFAULT_PROGRAM_ID;
    this._provider = new import_anchor2.AnchorProvider(this.connection, {}, { commitment: "confirmed" });
    this.program = new import_anchor2.Program(gov_default, this.programId, this._provider);
    this.pda = new PdaClient(this.programId);
  }
  // GET APIs
  /** Get realm account from its public key
   * 
   * @param realmAccount The public key of the realm account
   * @returns Realm account
   */
  getRealmByPubkey(realmAccount) {
    return __async(this, null, function* () {
      return fetchAndDeserialize(this.connection, realmAccount, "realmV2");
    });
  }
  /** Get realm account from the name
   * 
   * @param name The name of the Realm
   * @returns Realm account
   */
  getRealmByName(name) {
    return __async(this, null, function* () {
      const realmAccount = this.pda.realmAccount({ name }).publicKey;
      return this.getRealmByPubkey(realmAccount);
    });
  }
  /** Get all the realm accounts
   * 
   * @returns all Realm accounts
   */
  getAllRealms() {
    return __async(this, null, function* () {
      return fetchMultipleAndDeserialize(this.connection, this.programId, "realmV2", "H");
    });
  }
  /** Get Realm accounts from the community mint
   * 
   * @param communityMint Mint address of the token used as the community token
   * @returns Realms using the given token as the community mint
   */
  getRealmsByCommunityMint(communityMint) {
    return __async(this, null, function* () {
      return fetchMultipleAndDeserialize(this.connection, this.programId, "realmV2", "H", [1], [communityMint]);
    });
  }
  /** Get realm account V1 from its public key
   * 
   * @param realmAccount The public key of the realm account
   * @returns Realm account
   */
  getRealmV1ByPubkey(realmAccount) {
    return __async(this, null, function* () {
      return fetchAndDeserialize(this.connection, realmAccount, "realmV1");
    });
  }
  /** Get realm account V1 from the name
   * 
   * @param name The name of the Realm
   * @returns Realm account
   */
  getRealmV1ByName(name) {
    return __async(this, null, function* () {
      const realmAccount = this.pda.realmAccount({ name }).publicKey;
      return this.getRealmV1ByPubkey(realmAccount);
    });
  }
  /** Get all the V1 realm accounts
   * 
   * @returns all Realm accounts
   */
  getAllV1Realms() {
    return __async(this, null, function* () {
      return fetchMultipleAndDeserialize(this.connection, this.programId, "realmV1", "2");
    });
  }
  /** Get V1 Realm accounts from the community mint
   * 
   * @param communityMint Mint address of the token used as the community token
   * @returns Realms using the given token as the community mint
   */
  getV1RealmsByCommunityMint(communityMint) {
    return __async(this, null, function* () {
      return fetchMultipleAndDeserialize(this.connection, this.programId, "realmV1", "2", [1], [communityMint]);
    });
  }
  /** Get Realm config account from its public key
   * 
   * @param realmConfigAddress The public key of the Realm Config Account
   * @returns Realm Config Account
   */
  getRealmConfigByPubkey(realmConfigAddress) {
    return __async(this, null, function* () {
      return fetchAndDeserialize(this.connection, realmConfigAddress, "realmConfigAccount");
    });
  }
  /** Get Realm config account from the realm account's public key
   * 
   * @param realmAccount The public key of the Realm Account
   * @returns Realm Config Account
   */
  getRealmConfigByRealm(realmAccount) {
    return __async(this, null, function* () {
      const realmConfigAddress = this.pda.realmConfigAccount({ realmAccount }).publicKey;
      return this.getRealmConfigByPubkey(realmConfigAddress);
    });
  }
  /** Get all Realm config accounts
   * 
   * @returns Realm Config Accounts
   */
  getAllRealmConfigs() {
    return __async(this, null, function* () {
      return fetchMultipleAndDeserialize(this.connection, this.programId, "realmConfigAccount", "C");
    });
  }
  /** Get Token Owner Record Account from its public key
   * 
   * @param tokenOwnerRecordAddress The public key of the Token Owner Record account
   * @returns Token Owner Record account
   */
  getTokenOwnerRecordByPubkey(tokenOwnerRecordAddress) {
    return __async(this, null, function* () {
      return fetchAndDeserialize(this.connection, tokenOwnerRecordAddress, "tokenOwnerRecordV2");
    });
  }
  /** Get Token Owner Record Account
   * 
   * @param realmAccount The public key of the Realm Account
   * @param tokenOwner The public key of the owner
   * @param tokenMint The token address (either community mint or council mint)
   * @returns Token Owner Record Account
   */
  getTokenOwnerRecord(realmAccount, tokenOwner, tokenMint) {
    return __async(this, null, function* () {
      const tokenOwnerRecordAddress = this.pda.tokenOwnerRecordAccount({
        realmAccount,
        governingTokenMintAccount: tokenMint,
        governingTokenOwner: tokenOwner
      }).publicKey;
      return this.getTokenOwnerRecordByPubkey(tokenOwnerRecordAddress);
    });
  }
  /** Get all the token owner records for the given realm 
   * 
   * @param realmAccount The public key of the Realm Account
   * @returns all Token Owner Records for the given realm account
   */
  getTokenOwnerRecordsForRealm(realmAccount) {
    return __async(this, null, function* () {
      return fetchMultipleAndDeserialize(this.connection, this.programId, "tokenOwnerRecordV2", "J", [1], [realmAccount]);
    });
  }
  /** Get all the token owner record addresses for the given realm 
   * 
   * @param realmAccount The public key of the Realm Account
   * @returns all Token Owner Record Addresses for the given realm account
   */
  getTokenOwnerRecordAddressesForRealm(realmAccount) {
    return __async(this, null, function* () {
      return fetchMultipleAndNotDeserialize(this.connection, this.programId, "tokenOwnerRecordV2", "J", [1], [realmAccount]);
    });
  }
  /** Get all the token owner records for the given owner 
   * 
   * @param tokenOwner The public key of the user whose token owner records to fetch
   * @returns all Token Owner Records for the given owner
   */
  getTokenOwnerRecordsForOwner(tokenOwner) {
    return __async(this, null, function* () {
      return fetchMultipleAndDeserialize(this.connection, this.programId, "tokenOwnerRecordV2", "J", [65], [tokenOwner]);
    });
  }
  /** Get all the token owner records for the given mint 
   * 
   * @param tokenMint Mint address of the token whose token owner records to fetch
   * @returns all Token Owner Records for the given mint
   */
  getTokenOwnerRecordsForMint(tokenMint) {
    return __async(this, null, function* () {
      return fetchMultipleAndDeserialize(this.connection, this.programId, "tokenOwnerRecordV2", "J", [33], [tokenMint]);
    });
  }
  /** Get all the token owner records
   * 
   * @returns all Token Owner Records accounts
   */
  getAllTokenOwnerRecords() {
    return __async(this, null, function* () {
      return fetchMultipleAndDeserialize(this.connection, this.programId, "tokenOwnerRecordV2", "J");
    });
  }
  /** Get all the token owner records with user as delegate in the given realm
   * 
   * @param realmAccount The public key of the Realm Account
   * @param delegateAddress The public key of the delegate
   * @param tokenMint (optional) the mint address
   * @returns all Token Owner Records for the given realm account
   */
  getDelegateRecordsForUserInRealm(realmAccount, delegateAddress, tokenMint) {
    return __async(this, null, function* () {
      const offsets = tokenMint ? [1, 33, 122] : [1, 122];
      const addresses = tokenMint ? [realmAccount, tokenMint, delegateAddress] : [realmAccount, delegateAddress];
      return fetchMultipleAndDeserialize(
        this.connection,
        this.programId,
        "tokenOwnerRecordV2",
        "J",
        offsets,
        addresses
      );
    });
  }
  /** Get Governance account from its public key
   * 
   * @param governanceAccount The public key of the governance account
   * @returns Governance account
   */
  getGovernanceAccountByPubkey(governanceAccount) {
    return __async(this, null, function* () {
      return fetchAndDeserialize(this.connection, governanceAccount, "governanceV2");
    });
  }
  /** Get all the governance accounts for the realm
   * 
   * @param realmAccount The public key of the Realm Account
   * @returns all Governance accounts for the given Realm
   */
  getGovernanceAccountsByRealm(realmAccount) {
    return __async(this, null, function* () {
      return yield fetchMultipleAndDeserialize(this.connection, this.programId, "governanceV2", void 0, [1], [realmAccount], 236);
    });
  }
  /** Get V1 Governance account from its public key
   * 
   * @param governanceAccount The public key of the governance account
   * @returns Governance account
   */
  getGovernanceAccountV1ByPubkey(governanceAccount) {
    return __async(this, null, function* () {
      return fetchAndDeserialize(this.connection, governanceAccount, "governanceV1");
    });
  }
  /** Get all the V1 governance accounts for the realm
   * 
   * @param realmAccount The public key of the Realm Account
   * @returns all Governance accounts for the given Realm
   */
  getV1GovernanceAccountsByRealm(realmAccount) {
    return __async(this, null, function* () {
      return fetchMultipleAndDeserialize(this.connection, this.programId, "governanceV1", "4", [1], [realmAccount]);
    });
  }
  /** Get Proposal account from its public key
   * 
   * @param proposalAccount The public key of the proposal account
   * @returns Proposal account
   */
  getProposalByPubkey(proposalAccount) {
    return __async(this, null, function* () {
      return fetchAndDeserialize(this.connection, proposalAccount, "proposalV2");
    });
  }
  /** Get all the proposal accounts for the Governance
   * 
   * @param governanceAccount The public key of the Governance Account
   * @param onlyActive (optional) True if only wants to return the proposal accounts with `voting` state
   * @returns all Proposal accounts for the given Governance
   */
  getProposalsforGovernance(governanceAccount, onlyActive) {
    return __async(this, null, function* () {
      return fetchMultipleAndDeserialize(
        this.connection,
        this.programId,
        "proposalV2",
        "F",
        onlyActive ? [1, 65] : [1],
        onlyActive ? ["3", governanceAccount] : [governanceAccount]
      );
    });
  }
  /** Get all the proposal accounts for a user in Realm
   * 
   * @param tokenOwnerRecord The public key of the user's token owner record
   * @returns all Proposal accounts for the given user
   */
  getProposalsByTokenOwnerRecord(tokenOwnerRecord) {
    return __async(this, null, function* () {
      return fetchMultipleAndDeserialize(this.connection, this.programId, "proposalV2", "F", [66], [tokenOwnerRecord]);
    });
  }
  /** Get all Proposals
   * 
   * @returns all V2 Proposals accounts
   */
  getAllProposals() {
    return __async(this, null, function* () {
      return fetchMultipleAndDeserialize(this.connection, this.programId, "proposalV2", "F");
    });
  }
  /** Get all V1 Proposals
   * 
   * @returns all V1 Proposals accounts
   */
  getAllV1Proposals() {
    return __async(this, null, function* () {
      return fetchMultipleAndDeserialize(this.connection, this.programId, "proposalV1", "6");
    });
  }
  /** Get Proposal Deposit account from its public key
   * 
   * @param proposalDepositAccount The public key of the proposal deposit account
   * @returns Proposal Deposit account
   */
  getProposalDepositByPubkey(proposalDepositAccount) {
    return __async(this, null, function* () {
      return fetchAndDeserialize(this.connection, proposalDepositAccount, "proposalDeposit");
    });
  }
  /** Get all Proposal Deposit accounts
   * 
   * @returns Proposal Deposit accounts
   */
  getAllProposalDeposits() {
    return __async(this, null, function* () {
      return fetchMultipleAndDeserialize(this.connection, this.programId, "proposalDeposit", "Q");
    });
  }
  /** Get proposal deposit accounts for the given proposal
   * 
   * @param proposalAccount The public key of the proposal account
   * @returns proposal deposit accounts for the given proposal
   */
  getProposalDepositByProposal(proposalAccount) {
    return __async(this, null, function* () {
      return fetchMultipleAndDeserialize(this.connection, this.programId, "proposalDeposit", "Q", [1], [proposalAccount]);
    });
  }
  /** Get Proposal Transaction account from its public key
   * 
   * @param proposalTransactionAccount The public key of the proposal transaction account
   * @returns Proposal Transaction account
   */
  getProposalTransactionByPubkey(proposalTransactionAccount) {
    return __async(this, null, function* () {
      return fetchAndDeserialize(this.connection, proposalTransactionAccount, "proposalTransactionV2");
    });
  }
  /** Get all proposal instruction accounts (v1)
   * 
   * @returns proposal instruction accounts (v1)
   */
  getAllProposalInstructions() {
    return __async(this, null, function* () {
      return fetchMultipleAndDeserialize(this.connection, this.programId, "proposalInstructionV1", "9");
    });
  }
  /** Get proposal transaction accounts for the given proposal
   * 
   * @param proposalAccount The public key of the proposal account
   * @returns proposal transaction accounts for the given proposal
   */
  getProposalTransactionsByProposal(proposalAccount) {
    return __async(this, null, function* () {
      return fetchMultipleAndDeserialize(this.connection, this.programId, "proposalTransactionV2", "E", [1], [proposalAccount]);
    });
  }
  /** Get all proposal transaction accounts
   * 
   * @returns proposal transaction accounts
   */
  getAllProposalTransactions() {
    return __async(this, null, function* () {
      return fetchMultipleAndDeserialize(this.connection, this.programId, "proposalTransactionV2", "E");
    });
  }
  /** Get Signatory Record from its public key
   * 
   * @param signatoryRecordAddress The public key of the Signatory Record account
   * @returns Signatory Record account
   */
  getSignatoryRecordByPubkey(signatoryRecordAddress) {
    return __async(this, null, function* () {
      return fetchAndDeserialize(this.connection, signatoryRecordAddress, "signatoryRecordV2");
    });
  }
  /** Get Signatory Record account
   * 
   * @param proposalAccount The public key of the Proposal account
   * @param signatory The signer's public key
   * @returns Signatory Record account
   */
  getSignatoryRecord(proposalAccount, signatory) {
    return __async(this, null, function* () {
      const signatoryRecordAddress = this.pda.signatoryRecordAccount({ proposal: proposalAccount, signatory }).publicKey;
      return this.getSignatoryRecordByPubkey(signatoryRecordAddress);
    });
  }
  /** Get all signatory records for the proposal
   * 
   * @param proposalAccount The public key of the Proposal account
   * @returns all signatory records for the given proposal
   */
  getSignatoryRecordsForProposal(proposalAccount) {
    return __async(this, null, function* () {
      return fetchMultipleAndDeserialize(this.connection, this.programId, "signatoryRecordV2", "P", [1], [proposalAccount]);
    });
  }
  /** Get all signatory records
   * 
   * @returns all signatory records
   */
  getAllSignatoryRecords() {
    return __async(this, null, function* () {
      return fetchMultipleAndDeserialize(this.connection, this.programId, "signatoryRecordV2", "P");
    });
  }
  /** Get Vote Record from its public key
   * 
   * @param voteRecordAddress The public key of the Vote Record account
   * @returns Vote Record account
   */
  getVoteRecordByPubkey(voteRecordAddress) {
    return __async(this, null, function* () {
      return fetchAndDeserialize(this.connection, voteRecordAddress, "voteRecordV2");
    });
  }
  /** Get Vote Record account
  * 
  * @param proposalAccount The public key of the Proposal account
  * @param tokenOwnerRecord The public key of the voter's token owner record
  * @returns Vote Record account
  */
  getVoteRecord(proposalAccount, tokenOwnerRecord) {
    return __async(this, null, function* () {
      const voteRecordAddress = this.pda.voteRecordAccount({ proposal: proposalAccount, tokenOwnerRecord }).publicKey;
      return this.getVoteRecordByPubkey(voteRecordAddress);
    });
  }
  /** Get all vote records for the proposal
   * 
   * @param proposalAccount The public key of the Proposal account
   * @returns all vote records for the given proposal
   */
  getVoteRecordsForProposal(proposalAccount) {
    return __async(this, null, function* () {
      return fetchMultipleAndDeserialize(this.connection, this.programId, "voteRecordV2", "D", [1], [proposalAccount]);
    });
  }
  /** Get all vote records for the voter
   * 
   * @param voter The public key of the voter
   * @param unrelinquishedOnly (optional) If sets to true, only returns unrelinquished vote records
   * @returns all vote records for the given voter
   */
  getVoteRecordsForUser(voter, unrelinquishedOnly) {
    return __async(this, null, function* () {
      return fetchMultipleAndDeserialize(
        this.connection,
        this.programId,
        "voteRecordV2",
        "D",
        unrelinquishedOnly ? [33, 65] : [33],
        unrelinquishedOnly ? [voter, "1"] : [voter]
      );
    });
  }
  /** Get all vote records
   * 
   * @returns all V2 vote records
   */
  getAllVoteRecords() {
    return __async(this, null, function* () {
      return fetchMultipleAndDeserialize(this.connection, this.programId, "voteRecordV2", "D");
    });
  }
  /** Get all V1 vote records
   * 
   * @returns all V1 vote records
   */
  getAllV1VoteRecords() {
    return __async(this, null, function* () {
      return fetchMultipleAndDeserialize(this.connection, this.programId, "voteRecordV1", "8");
    });
  }
  /** Get Chat Message from its public key
  * 
  * @param chatMessageAddress The public key of the Chat Message account
  * @returns Chat Message account
  */
  getChatMessageByPubkey(chatMessageAddress) {
    return __async(this, null, function* () {
      return fetchAndDeserialize(this.connection, chatMessageAddress, "chatMessage", "chat");
    });
  }
  /** Get Chat Messages for a proposal
   * 
   * @param proposalAccount The public key of the Proposal account
   * @returns Chat Message accounts
   */
  getChatMessagesByProposal(proposalAccount) {
    return __async(this, null, function* () {
      return fetchMultipleAndDeserialize(this.connection, DEFAULT_CHAT_PROGRAM_ID, "chatMessage", "2", [1], [proposalAccount], void 0, "chat");
    });
  }
  /** Get all Chat Messages
   * 
   * @returns Chat Message accounts
   */
  getAllChatMessages() {
    return __async(this, null, function* () {
      return fetchMultipleAndDeserialize(this.connection, DEFAULT_CHAT_PROGRAM_ID, "chatMessage", "2", void 0, void 0, void 0, "chat");
    });
  }
  /** Get Voter Weight Record
   * 
   * @returns Voter Weight Record account
   */
  getVoterWeightRecord(voterWeightRecordAddress) {
    return __async(this, null, function* () {
      return fetchAndDeserialize(this.connection, voterWeightRecordAddress, "voterWeightRecord", "addin");
    });
  }
  /** Get Voter Weight Record
   * 
   * @returns Voter Weight Record account
   */
  getAllVoterWeightRecords() {
    return __async(this, null, function* () {
      return fetchMultipleAndDeserialize(this.connection, this.programId, "voterWeightRecord", "8riZd8mYDQk", void 0, void 0, void 0, "addin");
    });
  }
  /** Get Max Voter Weight Record
  * 
  * @returns Voter Weight Record account
  */
  getMaxVoterWeightRecord(maxVoterWeightRecordAddress) {
    return __async(this, null, function* () {
      return fetchAndDeserialize(this.connection, maxVoterWeightRecordAddress, "maxVoterWeightRecord", "addin");
    });
  }
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
  createRealmInstruction(_0, _1, _2, _3) {
    return __async(this, arguments, function* (name, communityTokenMint, minCommunityWeightToCreateGovernance, payer, communityMintMaxVoterWeightSource = { type: "supplyFraction", amount: new import_bn7.default(Math.pow(10, 10)) }, councilTokenMint, communityTokenType = "liquid", councilTokenType = "liquid", communityVoterWeightAddinProgramId, maxCommunityVoterWeightAddinProgramId, councilVoterWeightAddinProgramId, maxCouncilVoterWeightAddinProgramId) {
      return yield _createRealmContext(
        name,
        communityTokenMint,
        minCommunityWeightToCreateGovernance,
        communityMintMaxVoterWeightSource,
        communityTokenType,
        councilTokenType,
        this.program,
        payer,
        this.pda,
        councilTokenMint,
        communityVoterWeightAddinProgramId,
        maxCommunityVoterWeightAddinProgramId,
        councilVoterWeightAddinProgramId,
        maxCouncilVoterWeightAddinProgramId
      );
    });
  }
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
  depositGoverningTokensInstruction(realmAccount, governingTokenMintAccount, governingTokenSourceAccount, governingTokenOwner, governingTokenSourceAuthority, payer, amount) {
    return __async(this, null, function* () {
      return yield _depositGoverningTokensContext(
        realmAccount,
        governingTokenMintAccount,
        governingTokenSourceAccount,
        governingTokenOwner,
        governingTokenSourceAuthority,
        amount,
        this.program,
        payer,
        this.pda
      );
    });
  }
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
  withdrawGoverningTokensInstruction(realmAccount, governingTokenMintAccount, governingTokenDestinationAccount, governingTokenOwner) {
    return __async(this, null, function* () {
      return yield _withdrawGoverningTokensContext(
        realmAccount,
        governingTokenMintAccount,
        governingTokenDestinationAccount,
        governingTokenOwner,
        this.program,
        this.pda
      );
    });
  }
  /**
   * Construct a SetGovernanceDelegate Instruction
   *
   * @param tokenOwnerRecord Token Owner Record Account, pda(realm, governing_token_mint, governing_token_owner)
   * @param currentDelegateOrOwner Current Governance Delegate or Governing Token owner 
   * @param newGovernanceDelegate New Governance Delegate
   * 
   *  @return Instruction to add to a transaction
  */
  setGovernanceDelegateInstruction(tokenOwnerRecord, currentDelegateOrOwner, newGovernanceDelegate) {
    return __async(this, null, function* () {
      return yield _setGovernanceDelegateContext(
        tokenOwnerRecord,
        currentDelegateOrOwner,
        newGovernanceDelegate,
        this.program
      );
    });
  }
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
  createGovernanceInstruction(_0, _1, _2) {
    return __async(this, arguments, function* (config, realmAccount, governanceAuthority, tokenOwnerRecord = import_web37.SystemProgram.programId, payer, governanceAccountSeed, voterWeightRecord) {
      return yield _createGovernanceContext(
        config,
        realmAccount,
        governanceAuthority,
        tokenOwnerRecord,
        payer,
        this.program,
        this.pda,
        governanceAccountSeed,
        voterWeightRecord
      );
    });
  }
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
  createProposalInstruction(name, descriptionLink, voteType, options, useDenyOption, realmAccount, governanceAccount, tokenOwnerRecord, governingTokenMint, governanceAuthority, payer, proposalSeed, voterWeightRecord) {
    return __async(this, null, function* () {
      return yield _createProposalContext(
        name,
        descriptionLink,
        voteType,
        options,
        useDenyOption,
        realmAccount,
        governanceAccount,
        tokenOwnerRecord,
        governingTokenMint,
        governanceAuthority,
        payer,
        this.program,
        this.pda,
        proposalSeed,
        voterWeightRecord
      );
    });
  }
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
  addSignatoryInstruction(signatory, proposalAccount, tokenOwnerRecord, governanceAuthority, payer) {
    return __async(this, null, function* () {
      return yield _addSignatoryContext(
        signatory,
        proposalAccount,
        tokenOwnerRecord,
        governanceAuthority,
        payer,
        this.program,
        this.pda
      );
    });
  }
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
  insertTransactionInstruction(instructions, optionIndex, index, holdUpTime, governanceAccount, proposalAccount, tokenOwnerRecord, governanceAuthority, payer) {
    return __async(this, null, function* () {
      return yield _insertTransactionContext(
        instructions,
        optionIndex,
        index,
        holdUpTime,
        governanceAccount,
        proposalAccount,
        tokenOwnerRecord,
        governanceAuthority,
        payer,
        this.program,
        this.pda
      );
    });
  }
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
  removeTransactionInstruction(proposalAccount, tokenOwnerRecord, governanceAuthority, proposalTransactionAccount, beneficiaryAccount) {
    return __async(this, null, function* () {
      return yield _removeTransactionContext(
        proposalAccount,
        tokenOwnerRecord,
        governanceAuthority,
        proposalTransactionAccount,
        beneficiaryAccount,
        this.program
      );
    });
  }
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
  cancelProposalInstruction(realmAccount, governanceAccount, proposalAccount, tokenOwnerRecord, governanceAuthority) {
    return __async(this, null, function* () {
      return yield _cancelProposalContext(
        realmAccount,
        governanceAccount,
        proposalAccount,
        tokenOwnerRecord,
        governanceAuthority,
        this.program
      );
    });
  }
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
  signOffProposalInstruction(realmAccount, governanceAccount, proposalAccount, signer, signatoryRecordAccount, tokenOwnerRecord) {
    return __async(this, null, function* () {
      return yield _signOffProposalContext(
        realmAccount,
        governanceAccount,
        proposalAccount,
        signer,
        this.program,
        signatoryRecordAccount,
        tokenOwnerRecord
      );
    });
  }
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
  castVoteInstruction(vote, realmAccount, governanceAccount, proposalAccount, proposalOwnerTokenOwnerRecord, voterTokenOwnerRecord, governanceAuthority, governingTokenMint, payer, voterWeightRecord, maxVoterWeightRecord) {
    return __async(this, null, function* () {
      return yield _castVoteContext(
        vote,
        realmAccount,
        governanceAccount,
        proposalAccount,
        proposalOwnerTokenOwnerRecord,
        voterTokenOwnerRecord,
        governanceAuthority,
        governingTokenMint,
        payer,
        this.program,
        this.pda,
        voterWeightRecord,
        maxVoterWeightRecord
      );
    });
  }
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
  finalizeVoteInstruction(realmAccount, governanceAccount, proposalAccount, tokenOwnerRecord, governingTokenMint, maxVoterWeightRecord) {
    return __async(this, null, function* () {
      return yield _finalizeVoteContext(
        realmAccount,
        governanceAccount,
        proposalAccount,
        tokenOwnerRecord,
        governingTokenMint,
        this.program,
        this.pda,
        maxVoterWeightRecord
      );
    });
  }
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
  relinquishVoteInstruction(realmAccount, governanceAccount, proposalAccount, tokenOwnerRecord, governingTokenMint, governanceAuthority, beneficiaryAccount) {
    return __async(this, null, function* () {
      return yield _relinquishVoteContext(
        realmAccount,
        governanceAccount,
        proposalAccount,
        tokenOwnerRecord,
        governingTokenMint,
        this.program,
        this.pda,
        governanceAuthority,
        beneficiaryAccount
      );
    });
  }
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
  executeTransactionInstruction(governanceAccount, proposalAccount, proposalTransactionAccount, transactionAccounts) {
    return __async(this, null, function* () {
      return yield _executeTransactionContext(
        governanceAccount,
        proposalAccount,
        proposalTransactionAccount,
        transactionAccounts,
        this.program
      );
    });
  }
  /**
   * Construct a CreateNativeTreasury instruction
   *
   * @param governanceAccount The governance account. pda(realm, governance seed)
   * @param payer Payer of the transaction
   * 
   * 
   * @return Instruction to add to a transaction
  */
  createNativeTreasuryInstruction(governanceAccount, payer) {
    return __async(this, null, function* () {
      return _createNativeTreasuryContext(
        governanceAccount,
        payer,
        this.program,
        this.pda
      );
    });
  }
  /**
   * Construct a SetGovernanceConfig instruction
   *
   * @param config Governance Config
   * @param governanceAccount The governance account. pda(realm, governance seed)
   * 
   * 
   * @return Instruction to add to a transaction
  */
  setGovernanceConfigInstruction(config, governanceAccount) {
    return __async(this, null, function* () {
      return yield _setGovernanceConfigContext(
        config,
        governanceAccount,
        this.program
      );
    });
  }
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
  setRealmAuthorityInstruction(realmAccount, currentRealmAuthority, action, newRealmAuthority) {
    return __async(this, null, function* () {
      return yield _setRealmAuthorityContext(
        realmAccount,
        currentRealmAuthority,
        action,
        this.program,
        newRealmAuthority
      );
    });
  }
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
  setRealmConfigInstruciton(config, realmAccount, realmAuthority, payer, councilTokenMint, communityVoterWeightAddinProgramId, maxCommunityVoterWeightAddinProgramId, councilVoterWeightAddinProgramId, maxCouncilVoterWeightAddinProgramId) {
    return __async(this, null, function* () {
      return yield _setRealmConfigContext(
        config,
        realmAccount,
        realmAuthority,
        payer,
        this.program,
        this.pda,
        councilTokenMint,
        communityVoterWeightAddinProgramId,
        maxCommunityVoterWeightAddinProgramId,
        councilVoterWeightAddinProgramId,
        maxCouncilVoterWeightAddinProgramId
      );
    });
  }
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
  createTokenOwnerRecordInstruction(realmAccount, governingTokenOwner, governingTokenMint, payer) {
    return __async(this, null, function* () {
      return yield _createTokenOwnerRecordContext(
        realmAccount,
        governingTokenOwner,
        governingTokenMint,
        payer,
        this.program,
        this.pda
      );
    });
  }
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
  revokeGoverningTokensInstruction(amount, realmAccount, tokenOwnerRecord, governingTokenMint, revokeAuthority) {
    return __async(this, null, function* () {
      return yield _revokeGoverningTokensContext(
        amount,
        realmAccount,
        tokenOwnerRecord,
        governingTokenMint,
        revokeAuthority,
        this.program,
        this.pda
      );
    });
  }
  /**
   * Construct a RefundProposalDeposit instruction
   *
   * @param proposalAccount The proposal account
   * @param depositPayer Proposal deposit payer (beneficiary) account
   * 
   * 
   * @return Instruction to add to a transaction
  */
  refundProposalDepositInstruction(proposalAccount, depositPayer) {
    return __async(this, null, function* () {
      return yield _refundProposalDepositContext(
        proposalAccount,
        depositPayer,
        this.program,
        this.pda
      );
    });
  }
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
  completeProposalInstruction(proposalAccount, tokenOwnerRecord, completeProposalAuthority) {
    return __async(this, null, function* () {
      return yield _completeProposalContext(
        proposalAccount,
        tokenOwnerRecord,
        completeProposalAuthority,
        this.program
      );
    });
  }
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
  postMessageInstruction(messageBody, messageType, isReply, chatMessageAccount, realmAccount, governanceAccount, proposalAccount, tokenOwnerRecord, governanceAuthority, payer, replyTo, voterWeightRecord) {
    return __async(this, null, function* () {
      return yield _postMessageContext(
        isReply,
        messageBody,
        messageType,
        chatMessageAccount,
        this.programId,
        realmAccount,
        governanceAccount,
        proposalAccount,
        tokenOwnerRecord,
        governanceAuthority,
        this._provider,
        this.pda,
        payer,
        replyTo,
        voterWeightRecord
      );
    });
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  DEFAULT_CHAT_PROGRAM_ID,
  DEFAULT_PROGRAM_ID,
  SplGovernance
});
//# sourceMappingURL=index.js.map