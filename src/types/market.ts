import { GetStructureSchema, publicKey, struct } from "@raydium-io/raydium-sdk";

export const MINIMAL_MARKET_STATE_LAYOUT_V3 = struct([
    publicKey('eventQueue'),
    publicKey('bids'),
    publicKey('asks'),
]);

export type MinimalMarketStateLayoutV3 = typeof MINIMAL_MARKET_STATE_LAYOUT_V3;
export type MinimalMarketLayoutV3 =
  GetStructureSchema<MinimalMarketStateLayoutV3>