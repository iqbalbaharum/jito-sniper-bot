import { Liquidity, LiquidityPoolKeys, LiquidityStateV4, MAINNET_PROGRAM_ID, Market } from "@raydium-io/raydium-sdk";
import { connection } from "../adapter/rpc";
import { MINIMAL_MARKET_STATE_LAYOUT_V3 } from "../types/market";
import { config } from "../utils/config";
import { Commitment, PublicKey } from "@solana/web3.js";

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

  export {
    getAccountPoolKeysFromAccountDataV4
  }