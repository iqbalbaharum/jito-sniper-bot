import { Commitment, Connection, PublicKey } from '@solana/web3.js';
import { MARKET_STATE_LAYOUT_V3 } from '@raydium-io/raydium-sdk';
import { MINIMAL_MARKET_STATE_LAYOUT_V3, MinimalMarketLayoutV3 } from '../types';


export async function getMinimalMarketV3(
  connection: Connection,
  marketId: PublicKey,
  commitment?: Commitment,
): Promise<MinimalMarketLayoutV3> {
  const marketInfo = await connection.getAccountInfo(marketId, {
    commitment,
    dataSlice: {
      offset: MARKET_STATE_LAYOUT_V3.offsetOf('eventQueue'),
      length: 32 * 3,
    },
  });

  return MINIMAL_MARKET_STATE_LAYOUT_V3.decode(marketInfo!.data);
}
