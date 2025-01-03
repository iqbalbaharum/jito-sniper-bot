import { Commitment, PublicKey } from "@solana/web3.js";
import { connection } from "../adapter/rpc";
import { getTokenAccountsByOwner } from "./token-account";
import { LiquidityPoolKeys, parseBigNumberish } from "@raydium-io/raydium-sdk";
import { WSOL_ADDRESS } from "../utils/const";
import { TokenAccountBalance } from "../types";

const getTokenInWallet = async (poolKeys: LiquidityPoolKeys, commitment: Commitment) : Promise<TokenAccountBalance[]> => {

	let mint: PublicKey;
	
	if (poolKeys.baseMint.toString() === WSOL_ADDRESS) {
		mint = poolKeys.quoteMint;
	} else {
		mint = poolKeys.baseMint;
	}

	const accs = await getTokenAccountsByOwner(commitment)
	const balanceArray = await accs
		.filter((acc) => acc.accountInfo.mint.toBase58() === mint.toBase58())
		.map(async (acc) => {
			const accBalance = await connection.getTokenAccountBalance(acc.pubkey);
			const balance = accBalance.value.uiAmount || 0;
			return { mint: acc.accountInfo.mint, balance };
		});

	const resolvedBalances = await Promise.all(balanceArray);
	return resolvedBalances;
}

export { getTokenInWallet }