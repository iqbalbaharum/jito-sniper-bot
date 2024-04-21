export type AmmProxy = {
  "version": "0.1.0",
  "name": "amm_proxy",
  "instructions": [
    {
      "name": "proxyInitialize",
      "docs": [
        "Initiazlize a swap pool"
      ],
      "accounts": [
        {
          "name": "ammProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "amm",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "ammAuthority",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "ammOpenOrders",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "ammLpMint",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "ammCoinMint",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "ammPcMint",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "ammCoinVault",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "ammPcVault",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "ammTargetOrders",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "ammConfig",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "createFeeDestination",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "marketProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "market",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "userWallet",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "userTokenCoin",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "userTokenPc",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "userTokenLp",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "tokenProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "associatedTokenProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "sysvarRent",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "nonce",
          "type": "u8"
        },
        {
          "name": "openTime",
          "type": "u64"
        },
        {
          "name": "initPcAmount",
          "type": "u64"
        },
        {
          "name": "initCoinAmount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "proxyDeposit",
      "docs": [
        "deposit instruction"
      ],
      "accounts": [
        {
          "name": "ammProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "amm",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "ammAuthority",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "ammOpenOrders",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "ammTargetOrders",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "ammLpMint",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "ammCoinVault",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "ammPcVault",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "market",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "marketEventQueue",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "userTokenCoin",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "userTokenPc",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "userTokenLp",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "userOwner",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "tokenProgram",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "maxCoinAmount",
          "type": "u64"
        },
        {
          "name": "maxPcAmount",
          "type": "u64"
        },
        {
          "name": "baseSide",
          "type": "u64"
        }
      ]
    },
    {
      "name": "proxyWithdraw",
      "docs": [
        "withdraw instruction"
      ],
      "accounts": [
        {
          "name": "ammProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "amm",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "ammAuthority",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "ammOpenOrders",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "ammTargetOrders",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "ammLpMint",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "ammCoinVault",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "ammPcVault",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "marketProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "market",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "marketCoinVault",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "marketPcVault",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "marketVaultSigner",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "userTokenLp",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "userTokenCoin",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "userTokenPc",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "userOwner",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "marketEventQ",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "marketBids",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "marketAsks",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "tokenProgram",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "proxySwapBaseIn",
      "docs": [
        "swap_base_in instruction"
      ],
      "accounts": [
        {
          "name": "ammProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "amm",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "ammAuthority",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "ammOpenOrders",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "ammCoinVault",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "ammPcVault",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "marketProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "market",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "marketBids",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "marketAsks",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "marketEventQueue",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "marketCoinVault",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "marketPcVault",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "marketVaultSigner",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "userTokenSource",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "userTokenDestination",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "userSourceOwner",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "tokenProgram",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "amountIn",
          "type": "u64"
        },
        {
          "name": "minimumAmountOut",
          "type": "u64"
        }
      ]
    },
    {
      "name": "proxySwapBaseOut",
      "docs": [
        "swap_base_out instruction"
      ],
      "accounts": [
        {
          "name": "ammProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "amm",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "ammAuthority",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "ammOpenOrders",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "ammCoinVault",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "ammPcVault",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "marketProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "market",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "marketBids",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "marketAsks",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "marketEventQueue",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "marketCoinVault",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "marketPcVault",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "marketVaultSigner",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "userTokenSource",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "userTokenDestination",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "userSourceOwner",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "tokenProgram",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "maxAmountIn",
          "type": "u64"
        },
        {
          "name": "amountOut",
          "type": "u64"
        }
      ]
    }
  ]
};

export const IDL: AmmProxy = {
  "version": "0.1.0",
  "name": "amm_proxy",
  "instructions": [
    {
      "name": "proxyInitialize",
      "docs": [
        "Initiazlize a swap pool"
      ],
      "accounts": [
        {
          "name": "ammProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "amm",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "ammAuthority",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "ammOpenOrders",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "ammLpMint",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "ammCoinMint",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "ammPcMint",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "ammCoinVault",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "ammPcVault",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "ammTargetOrders",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "ammConfig",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "createFeeDestination",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "marketProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "market",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "userWallet",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "userTokenCoin",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "userTokenPc",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "userTokenLp",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "tokenProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "associatedTokenProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "sysvarRent",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "nonce",
          "type": "u8"
        },
        {
          "name": "openTime",
          "type": "u64"
        },
        {
          "name": "initPcAmount",
          "type": "u64"
        },
        {
          "name": "initCoinAmount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "proxyDeposit",
      "docs": [
        "deposit instruction"
      ],
      "accounts": [
        {
          "name": "ammProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "amm",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "ammAuthority",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "ammOpenOrders",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "ammTargetOrders",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "ammLpMint",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "ammCoinVault",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "ammPcVault",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "market",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "marketEventQueue",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "userTokenCoin",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "userTokenPc",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "userTokenLp",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "userOwner",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "tokenProgram",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "maxCoinAmount",
          "type": "u64"
        },
        {
          "name": "maxPcAmount",
          "type": "u64"
        },
        {
          "name": "baseSide",
          "type": "u64"
        }
      ]
    },
    {
      "name": "proxyWithdraw",
      "docs": [
        "withdraw instruction"
      ],
      "accounts": [
        {
          "name": "ammProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "amm",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "ammAuthority",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "ammOpenOrders",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "ammTargetOrders",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "ammLpMint",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "ammCoinVault",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "ammPcVault",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "marketProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "market",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "marketCoinVault",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "marketPcVault",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "marketVaultSigner",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "userTokenLp",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "userTokenCoin",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "userTokenPc",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "userOwner",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "marketEventQ",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "marketBids",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "marketAsks",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "tokenProgram",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "proxySwapBaseIn",
      "docs": [
        "swap_base_in instruction"
      ],
      "accounts": [
        {
          "name": "ammProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "amm",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "ammAuthority",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "ammOpenOrders",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "ammCoinVault",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "ammPcVault",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "marketProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "market",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "marketBids",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "marketAsks",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "marketEventQueue",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "marketCoinVault",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "marketPcVault",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "marketVaultSigner",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "userTokenSource",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "userTokenDestination",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "userSourceOwner",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "tokenProgram",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "amountIn",
          "type": "u64"
        },
        {
          "name": "minimumAmountOut",
          "type": "u64"
        }
      ]
    },
    {
      "name": "proxySwapBaseOut",
      "docs": [
        "swap_base_out instruction"
      ],
      "accounts": [
        {
          "name": "ammProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "amm",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "ammAuthority",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "ammOpenOrders",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "ammCoinVault",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "ammPcVault",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "marketProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "market",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "marketBids",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "marketAsks",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "marketEventQueue",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "marketCoinVault",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "marketPcVault",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "marketVaultSigner",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "userTokenSource",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "userTokenDestination",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "userSourceOwner",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "tokenProgram",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "maxAmountIn",
          "type": "u64"
        },
        {
          "name": "amountOut",
          "type": "u64"
        }
      ]
    }
  ]
};
