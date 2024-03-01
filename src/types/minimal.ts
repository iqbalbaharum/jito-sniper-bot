import { LiquidityPoolKeys } from "@raydium-io/raydium-sdk";
import { PublicKey } from "@solana/web3.js";
import { MinimalMarketLayoutV3 } from "../services";

export type MinimalTokenAccountData = {
    mint: PublicKey;
    address: PublicKey;
    poolKeys?: LiquidityPoolKeys;
    market?: MinimalMarketLayoutV3;
  };
  