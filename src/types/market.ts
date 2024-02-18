import { publicKey, struct } from "@raydium-io/raydium-sdk";

export const MINIMAL_MARKET_STATE_LAYOUT_V3 = struct([
    publicKey('eventQueue'),
    publicKey('bids'),
    publicKey('asks'),
]);