import { struct, u8, u64, GetStructureSchema } from "@raydium-io/raydium-sdk";

export const IX_INITIALIZE2_LAYOUT = struct([
	u8("nonce"),
	u64("openTime"),
	u64("initPcAmount"),
	u64("initCoinAmount")
])

export type IxInitialize2Layout = typeof IX_INITIALIZE2_LAYOUT
export type IxInitialize2 = GetStructureSchema<IxInitialize2Layout>

export const IX_SWAP_BASE_IN_LAYOUT = struct([
	u64("amountIn"),
	u64("minimumAmountOut")
])

export type IxSwapBaseInLayout = typeof IX_SWAP_BASE_IN_LAYOUT
export type IxSwapBaseIn = GetStructureSchema<IxSwapBaseInLayout>

export const IX_SWAP_BASE_OUT_LAYOUT = struct([
    u64("maxAmountIn"),
    u64("amountOut")
])

export type IxSwapBaseOutLayout = typeof IX_SWAP_BASE_OUT_LAYOUT
export type IxSwapBaseOut = GetStructureSchema<IxSwapBaseOutLayout>