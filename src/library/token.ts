import { LiquidityPoolKeysV4 } from "@raydium-io/raydium-sdk";
import { PublicKey } from "@solana/web3.js";
import { WSOL_ADDRESS } from "../utils";
import { mints } from "../adapter/storage";

export class BotToken {
    static async getMintFromPoolKeys(poolKeys: LiquidityPoolKeysV4) {
			
			let token = await mints.get(poolKeys.id)

			if(!token) {
				let mint: PublicKey | undefined = undefined
				let decimal: number = 0
				let isMintBase: boolean = true
				
				if (poolKeys.baseMint.toBase58() === WSOL_ADDRESS) {
					mint = poolKeys.quoteMint
					decimal = poolKeys.quoteDecimals
					isMintBase = false
				} else {
					if (poolKeys.quoteMint.toBase58() === WSOL_ADDRESS) {
						mint = poolKeys.baseMint
						decimal = poolKeys.baseDecimals
					}
				}
				
				if(!mint) {
					return undefined
				}
				
				token = {
					ammId: poolKeys.id,
					mint: mint!,
					mintDecimal: decimal,
					isMintBase: isMintBase
				}

				mints.set(poolKeys.id, token)
			}

			return token
		}

		static async getMintByAmmId(ammId: PublicKey) {
			return mints.get(ammId)
		}
}