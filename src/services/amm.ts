/**
 * This tools is to speed up the process of retrieve the raydium pool state
 * listen to newly created pool state and store it in redis, that any user able to retrieve it
 */
import { Commitment, KeyedAccountInfo, PublicKey } from "@solana/web3.js";
import { redisClient } from "../adapter/redis";
import { connection, connectionAlt1 } from "../adapter/rpc";
import { RAYDIUM_LIQUIDITY_POOL_V4_ADDRESS, config } from "../utils";
import { BotLiquidity, BotMarket } from "../library";
import { LIQUIDITY_STATE_LAYOUT_V4 } from "@raydium-io/raydium-sdk";
import { ammState } from "../adapter/storage";

async function processAccountInfo(account: KeyedAccountInfo) {
	try {
		const state = await ammState.get(account.accountId)
		if(!state) {
			await ammState.set(account.accountId, account.accountInfo.data.toString('hex'))
		}
	} catch(e:any) {
		console.log(e.toString())
	}
}

function main() {
	// connectionAlt1.onProgramAccountChange(
	// 	new PublicKey(RAYDIUM_LIQUIDITY_POOL_V4_ADDRESS),
	// 	processAccountInfo,
	// 	config.get('default_commitment') as Commitment
	// )
	
	connection.onProgramAccountChange(
		new PublicKey(RAYDIUM_LIQUIDITY_POOL_V4_ADDRESS),
		processAccountInfo,
		config.get('default_commitment') as Commitment
)
}

main()