import { Commitment, Connection, PublicKey } from '@solana/web3.js';
import { MARKET_STATE_LAYOUT_V3, MarketStateV3 } from '@raydium-io/raydium-sdk';
import { MINIMAL_MARKET_STATE_LAYOUT_V3, MinimalMarketLayoutV3 } from '../types';
import { connection } from '../adapter/rpc';
import { config } from '../utils';
import { delayedQueue } from '../adapter/queue';

export class BotMarket {
  static async getMinimalMarketV3(
    marketId: PublicKey
  ): Promise<MinimalMarketLayoutV3 | undefined> {

    const marketInfo = await connection.getAccountInfo(marketId, {
      commitment: config.get('default_commitment') as Commitment,
      dataSlice: {
        offset: MARKET_STATE_LAYOUT_V3.offsetOf('eventQueue'),
        length: 32 * 3,
      },
    });

    if(marketInfo) {
      return MINIMAL_MARKET_STATE_LAYOUT_V3.decode(marketInfo!.data);
    } else {
      return undefined
    }
  }

  static async getMarketV3(
    marketId: PublicKey
  ): Promise<MarketStateV3 | undefined> {

    const marketInfo = await connection.getAccountInfo(marketId, {
      commitment: config.get('default_commitment') as Commitment
    });

    if(marketInfo) {
      return MARKET_STATE_LAYOUT_V3.decode(marketInfo!.data);
    } else {
      return undefined
    }
  }
}