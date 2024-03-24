import { Commitment, KeyedAccountInfo, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { connection } from "./adapter/rpc";
import { LIQUIDITY_STATE_LAYOUT_V4, Liquidity, LiquidityStateV4, parseBigNumberish } from "@raydium-io/raydium-sdk";
import BN from "bn.js";
import { OPENBOOK_V1_ADDRESS, RAYDIUM_LIQUIDITY_POOL_V4_ADDRESS, WSOL_ADDRESS } from "./utils/const";
import { config } from "./utils/config";
import { setupWSOLTokenAccount } from "./services/token-account";
import { getAccountPoolKeysFromAccountDataV4, getTokenInWallet, swap, swapExactIn } from "./services";
import sleep from "atomic-sleep";
import { onDefaultBundleResult, submitBundle } from "./services/bundle";
import { mainSearcherClient } from "./adapter/jito";
import { ArbIdea } from "./types";

const onExecute = async (accountId: PublicKey, accountData: LiquidityStateV4) => {
	try {
    let { ata } = await setupWSOLTokenAccount(true, 0.1);

    const [poolKeys, latestBlockhash] = await Promise.all([
      getAccountPoolKeysFromAccountDataV4(accountId, accountData),
      connection.getLatestBlockhash({ commitment: 'confirmed' }),
    ]);

    const poolInfo = await Liquidity.fetchInfo({ connection, poolKeys });

    let different = poolInfo.startTime.toNumber() * 1000 - new Date().getTime();

    if (different > 0) {
      return;
    }
    // Buy
    // TODO
    const { transaction: inTx, minAmountOut, amountOut } = await swapExactIn(
      poolKeys,
			ata,
      0.001 * LAMPORTS_PER_SOL,
      latestBlockhash.blockhash
    );

		// await submitBundle({
    //   vtransaction: inTx,
    //   expectedProfit: new BN(0)
    // })

    // await sleep(5000);

		let mintBalance = -1

		while(mintBalance < 0) {
			const taBalance = await getTokenInWallet(poolKeys, config.get('default_commitment') as Commitment)
			if(taBalance && taBalance.length > 0) {
				if(taBalance[0].balance > 0) {
					mintBalance = taBalance[0].balance
				}
			}

			sleep(1000)
		}

    // sell
    const amount: BN = parseBigNumberish(
      mintBalance * 10 ** poolKeys.baseDecimals
    );

    const { transaction: outTx } = await swap(poolKeys, 'out', ata, amount);

		await submitBundle({
      vtransaction: outTx,
      expectedProfit: new BN(0)
    })
  } catch (e) {
    console.log(e);
  }
}

const runListener = () => {
	let mints: String[] = [];

  const subscriptionId = connection.onProgramAccountChange(
    new PublicKey(RAYDIUM_LIQUIDITY_POOL_V4_ADDRESS),
    async (updatedAccountInfo: KeyedAccountInfo) => {
      let accountData = LIQUIDITY_STATE_LAYOUT_V4.decode(
        updatedAccountInfo.accountInfo.data
      );

      if (
        new BN(accountData.swapBaseInAmount.toString()).isZero() &&
        !mints.includes(accountData.baseMint.toString())
      ) {
        mints.push(accountData.baseMint.toString());
        onExecute(updatedAccountInfo.accountId, accountData);
      }
    },
    config.get('default_commitment') as Commitment,
    [
      { dataSize: LIQUIDITY_STATE_LAYOUT_V4.span },
      {
        memcmp: {
          offset: LIQUIDITY_STATE_LAYOUT_V4.offsetOf('marketProgramId'),
          bytes: OPENBOOK_V1_ADDRESS,
        },
      },
    ]
  );

  console.log('Starting web socket, subscription ID: ', subscriptionId);
}

runListener()
onDefaultBundleResult()