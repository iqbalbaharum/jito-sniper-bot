/**
 * This tools is to speed up the process of retrieve the raydium pool state
 * listen to newly created pool state and store it in redis, that any user able to retrieve it
 */
import { Commitment, KeyedAccountInfo, PublicKey } from "@solana/web3.js";
import { redisClient } from "../adapter/redis";
import { connection, connectionAlt1 } from "../adapter/rpc";
import { RAYDIUM_LIQUIDITY_POOL_V4_ADDRESS, config } from "../utils";

async function processAccountInfo(account: KeyedAccountInfo) {
	try {
		const state = await redisClient.get(`state:${account.accountId.toBase58()}`)
		if(!state) {
			redisClient.set(`state:${account.accountId.toBase58()}`, account.accountInfo.data.toString('hex'))
		}
	} catch(e) {
		console.log(e)
	}
}

function main() {
	connectionAlt1.onProgramAccountChange(
		new PublicKey(RAYDIUM_LIQUIDITY_POOL_V4_ADDRESS),
		processAccountInfo,
		config.get('default_commitment') as Commitment
	)
	
	connection.onProgramAccountChange(
		new PublicKey(RAYDIUM_LIQUIDITY_POOL_V4_ADDRESS),
		processAccountInfo,
		config.get('default_commitment') as Commitment
)
}

main()