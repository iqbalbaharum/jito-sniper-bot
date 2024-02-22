import { Liquidity, LiquidityPoolKeys, LiquidityStateV4, MAINNET_PROGRAM_ID, Market, parseBigNumberish } from "@raydium-io/raydium-sdk";
import { connection } from "../adapter/rpc";
import { MINIMAL_MARKET_STATE_LAYOUT_V3 } from "../types/market";
import { config } from "../utils/config";
import { Commitment, PublicKey } from "@solana/web3.js";
import { WSOL_ADDRESS } from "../utils/const";
import { BotLiquidityState } from "../types";
import { BN } from "bn.js";

const getAccountPoolKeysFromAccountDataV4 = async (
    id: PublicKey,
    accountData: LiquidityStateV4
  ) : Promise<LiquidityPoolKeys> => {
    const marketInfo = await connection.getAccountInfo(accountData.marketId, {
      commitment: config.get('default_commitment') as Commitment,
      dataSlice: {
        offset: 253, // eventQueue
        length: 32 * 3,
      },
    });

    if(!marketInfo) { throw new Error('Error fetching market info')}
  
    const minimalMarketData = MINIMAL_MARKET_STATE_LAYOUT_V3.decode(
      marketInfo.data
    );
  
    return {
      id,
      baseMint: accountData.baseMint,
      quoteMint: accountData.quoteMint,
      lpMint: accountData.lpMint,
      baseDecimals: accountData.baseDecimal.toNumber(),
      quoteDecimals: accountData.quoteDecimal.toNumber(),
      lpDecimals: 5,
      version: 4,
      programId: MAINNET_PROGRAM_ID.AmmV4,
      authority: Liquidity.getAssociatedAuthority({
        programId: MAINNET_PROGRAM_ID.AmmV4,
      }).publicKey,
      openOrders: accountData.openOrders,
      targetOrders: accountData.targetOrders,
      baseVault: accountData.baseVault,
      quoteVault: accountData.quoteVault,
      marketVersion: 3,
      marketProgramId: accountData.marketProgramId,
      marketId: accountData.marketId,
      marketAuthority: Market.getAssociatedAuthority({
        programId: accountData.marketProgramId,
        marketId: accountData.marketId,
      }).publicKey,
      marketBaseVault: accountData.baseVault,
      marketQuoteVault: accountData.quoteVault,
      marketBids: minimalMarketData.bids,
      marketAsks: minimalMarketData.asks,
      marketEventQueue: minimalMarketData.eventQueue,
      withdrawQueue: accountData.withdrawQueue,
      lpVault: accountData.lpVault,
      lookupTableAccount: PublicKey.default,
    };
};

export const getLiquidityMintState = async (accountData: LiquidityStateV4) : Promise<BotLiquidityState>  => {
  let mint: PublicKey
  let decimal: number
  let isMintBase = true
  if (accountData.baseMint.toString() === WSOL_ADDRESS) {
    mint = accountData.quoteMint;
    decimal = accountData.quoteDecimal.toNumber()
    isMintBase = false
  } else if(accountData.quoteMint.toString() === WSOL_ADDRESS) {
    mint = accountData.baseMint;
    decimal = accountData.baseDecimal.toNumber()
    isMintBase = true
  } else {
    throw new Error('Pool doesnt have SOL')
  }
  
  return {
    mint,
    isMintBase,
    mintDecimal: decimal, 
    lastWSOLInAmount: new BN(0),
    lastWSOLOutAmount: new BN(0),
    lastTokenInAmount: new BN(0),
    lastTokenOutAmount: new BN(0)
  }
}

export {
  getAccountPoolKeysFromAccountDataV4
}