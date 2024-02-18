import { Commitment, ComputeBudgetProgram, PublicKey, TransactionInstruction, TransactionMessage, VersionedTransaction } from "@solana/web3.js"
import { connection } from "../adapter/rpc"
import { config } from "../utils/config"
import { BigNumberish, Liquidity, LiquidityPoolKeys } from "@raydium-io/raydium-sdk"
import { WSOL_ADDRESS } from "../utils/const"
import { getOrCreateTokenAccount } from "./tokenaccount"
import { payer } from "../adapter/payer"
import { fastTrackSearcherClient, searcherClients } from "../adapter/jito"

const swap = async (
	poolKeys: LiquidityPoolKeys,
	direction: 'in' | 'out',
	wsolTokenAccount: PublicKey,
	amount: BigNumberish,
	latestBlockHash?: String
): Promise<{transaction: VersionedTransaction}> => {
	let tokenAccountIn;
  let tokenAccountOut;
  let accountInDecimal;
  let blockhash = latestBlockHash

	let startInstructions: TransactionInstruction[] = [];

	if(!blockhash) {
		const block = await connection.getLatestBlockhash({
				commitment: config.get('default_commitment') as Commitment
		})
		blockhash = block.blockhash
	}

	if (direction === 'in') {
		let accountOut;
		if (poolKeys.baseMint.toString() === WSOL_ADDRESS) {
			accountOut = poolKeys.quoteMint;
		} else {
			accountOut = poolKeys.baseMint;
		}

		const { ata, instructions } = await getOrCreateTokenAccount(
			accountOut,
			true
		);

		tokenAccountIn = wsolTokenAccount;
		tokenAccountOut = ata;
		startInstructions = instructions;
	} else {
		let accountIn: PublicKey;

		if (poolKeys.baseMint.toString() === WSOL_ADDRESS) {
			accountIn = poolKeys.quoteMint;
			accountInDecimal = poolKeys.quoteDecimals;
		} else {
			accountIn = poolKeys.baseMint;
			accountInDecimal = poolKeys.baseDecimals;
		}

		const { ata } = await getOrCreateTokenAccount(
			accountIn,
			false
		);

		tokenAccountIn = ata;
		tokenAccountOut = wsolTokenAccount;	
	}

	const { innerTransaction } = Liquidity.makeSwapFixedInInstruction(
		{
			poolKeys,
			userKeys: {
				tokenAccountIn,
				tokenAccountOut,
				owner: payer.publicKey,
			},
			amountIn: amount,
			minAmountOut: 0,
		},
		poolKeys.version
	);

	const messageV0 = new TransactionMessage({
		payerKey: payer.publicKey,
		recentBlockhash: blockhash as string,
		instructions: [
			ComputeBudgetProgram.setComputeUnitLimit({ units: 101010 }),
			ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 100000 }),
			...startInstructions,
			...innerTransaction.instructions,
		],
	}).compileToV0Message();

	const transaction = new VersionedTransaction(messageV0);
	transaction.sign([payer, ...innerTransaction.signers]);
	
	return {
		transaction
	}
}

export { swap }