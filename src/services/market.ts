/**
 * This tools is to speed up the process of retrieve the raydium pool state
 * listen to newly created pool state and store it in redis, that any user able to retrieve it
 */
import { Commitment, ComputeBudgetProgram, KeyedAccountInfo, PublicKey, SystemProgram, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { redisClient } from "../adapter/redis";
import { connection, connectionAlt1 } from "../adapter/rpc";
import { OPENBOOK_V1_ADDRESS, RAYDIUM_LIQUIDITY_POOL_V4_ADDRESS, WSOL_ADDRESS, config } from "../utils";
import { BotLiquidity, BotMarket, BotTokenAccount } from "../library";
import { LIQUIDITY_STATE_LAYOUT_V4, MARKET_STATE_LAYOUT_V3 } from "@raydium-io/raydium-sdk";
import { payer } from "../adapter/payer";
import { logger } from "../utils/logger";
import { openbookMarket } from "../adapter/storage";

async function processAccountInfo(account: KeyedAccountInfo) {
	try {
		const market = await openbookMarket.get(account.accountId)
		if(!market) {
			let market = MARKET_STATE_LAYOUT_V3.decode(account.accountInfo.data);

			let mint: PublicKey
			if(market.baseMint.toBase58() === WSOL_ADDRESS) {
				mint = market.quoteMint
			} else {
				mint = market.baseMint
			}

			await openbookMarket.set(mint, account.accountInfo.data.toString('hex'))
		}
	} catch(e:any) {
		console.log(e.toString())
	}
}

function main() {
	connection.onProgramAccountChange(
		new PublicKey(OPENBOOK_V1_ADDRESS),
		processAccountInfo,
		config.get('default_commitment') as Commitment
	)
}

main()