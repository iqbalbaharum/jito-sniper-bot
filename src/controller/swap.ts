import { Commitment, ComputeBudgetProgram, PublicKey, TransactionInstruction, TransactionMessage, VersionedTransaction } from "@solana/web3.js"
import { connection } from "../adapter/rpc"
import { config } from "../utils/config"
import { BigNumberish, Liquidity, LiquidityPoolInfo, LiquidityPoolKeys, Percent, TOKEN_PROGRAM_ID, Token, TokenAmount } from "@raydium-io/raydium-sdk"
import { WSOL_ADDRESS } from "../utils/const"
import { getOrCreateTokenAccount } from "./tokenaccount"
import { payer } from "../adapter/payer"
import { fastTrackSearcherClient, searcherClients } from "../adapter/jito"
import BN from "bn.js"
import { SwapInstruction } from "../types/swapInstruction"

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
				commitment: 'confirmed'
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
			ComputeBudgetProgram.setComputeUnitLimit({ units: 101337 }),
			ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1000000 }),
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

/**
 * Swap in SOL to fetch any token with exact in
 * @param poolKeys 
 * @param wsolTokenAccount 
 * @param amount 
 * @param latestBlockHash 
 * @returns 
 */
const swapExactIn = async (
	poolKeys: LiquidityPoolKeys,
	wsolTokenAccount: PublicKey,
	amount: BigNumberish,
	latestBlockHash?: String)
	: Promise<SwapInstruction> => {

		let accountIn: PublicKey
		let accountOut: PublicKey
		let tokenAccountIn;
		let tokenAccountOut;
		let accountInDecimal: number
		let accountOutDecimal: number
		let blockhash = latestBlockHash
	
		let startInstructions: TransactionInstruction[] = [];
	
		if(!blockhash) {
			const block = await connection.getLatestBlockhash({
					commitment: 'confirmed'
			})
			blockhash = block.blockhash
		}
	
		if (poolKeys.baseMint.toString() === WSOL_ADDRESS) {
			accountIn = poolKeys.baseMint
			accountInDecimal = poolKeys.baseDecimals
			accountOut = poolKeys.quoteMint;
			accountOutDecimal = poolKeys.quoteDecimals
		} else {
			accountIn = poolKeys.quoteMint
			accountInDecimal = poolKeys.quoteDecimals
			accountOut = poolKeys.baseMint;
			accountOutDecimal = poolKeys.baseDecimals
		}

		const { ata, instructions } = await getOrCreateTokenAccount(
			accountOut,
			true
		);

		tokenAccountIn = wsolTokenAccount;
		tokenAccountOut = ata;
		startInstructions = instructions;

		const currencyIn = new Token(
      TOKEN_PROGRAM_ID,
      accountIn,
      accountInDecimal
    );

		const currencyOut = new Token(
      TOKEN_PROGRAM_ID,
      accountOut,
      accountOutDecimal
    );
		
		const poolInfo = await Liquidity.fetchInfo({ connection, poolKeys });

		const { minAmountOut, amountOut } = Liquidity.computeAmountOut({
			poolKeys,
			poolInfo,
			amountIn: new TokenAmount(currencyIn, amount, false),
			currencyOut,
			slippage: new Percent(0, 100)
		})
		
		const { innerTransaction } = Liquidity.makeSwapFixedInInstruction(
			{
				poolKeys,
				userKeys: {
					tokenAccountIn,
					tokenAccountOut,
					owner: payer.publicKey,
				},
				amountIn: amount,
				minAmountOut: minAmountOut.raw,
			},
			poolKeys.version
		);
	
		const messageV0 = new TransactionMessage({
			payerKey: payer.publicKey,
			recentBlockhash: blockhash as string,
			instructions: [
				ComputeBudgetProgram.setComputeUnitLimit({ units: 101337 }),
				ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1000000 }),
				...startInstructions,
				...innerTransaction.instructions,
			],
		}).compileToV0Message();
	
		const transaction = new VersionedTransaction(messageV0);
		transaction.sign([payer, ...innerTransaction.signers]);
		
		return {
			transaction,
			minAmountOut: minAmountOut.raw,
			amountOut: amountOut.raw
		}
}

export { swap, swapExactIn }