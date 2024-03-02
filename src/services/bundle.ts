import { Commitment, LAMPORTS_PER_SOL, PublicKey, VersionedTransaction } from "@solana/web3.js";
import { getJitoTipAccount } from "./jito";
import { Bundle } from "jito-ts/dist/sdk/block-engine/types";
import { payer } from "../adapter/payer";
import { connection } from "../adapter/rpc";
import { config } from "../utils/config";
import { fastTrackSearcherClient } from "../adapter/jito";
import { SearcherClient } from "jito-ts/dist/sdk/block-engine/searcher";
import { logger } from "../utils/logger";
import { ArbIdea } from "../types";
import { BN } from "bn.js";
import { BundleInTransit } from "../types/bundleInTransit";

const submitBundle = async (arb: ArbIdea) => {
  const tipAddress = await getJitoTipAccount()
  const tipAccount = new PublicKey(tipAddress)
  
  const resp = await connection.getLatestBlockhash('confirmed');

  const bundle = new Bundle([arb.vtransaction], 5)

  const TIP_PERCENT = config.get('tip_percent')
  let expectedProfitLamport = config.get('default_tip_in_sol') * LAMPORTS_PER_SOL
  
  // if(!arb.expectedProfit.isZero() && arb.expectedProfit.toNumber() > config.get('min_sol_trigger')) {
  //   expectedProfitLamport = arb.expectedProfit.mul(new BN(TIP_PERCENT)).div(new BN(100)).toNumber()
  // }

  // console.log(expectedProfitLamport)

  bundle.addTipTx(
      payer,
      expectedProfitLamport,
      tipAccount,
      resp.blockhash
  )
  
  const bundleId = await fastTrackSearcherClient.sendBundle(bundle)
  logger.info(`Sending bundle ${bundleId}`)
  return bundleId
}

const onDefaultBundleResult = () => {
  fastTrackSearcherClient.onBundleResult(
    (bundleResult) => {
      const bundleId = bundleResult.bundleId;
      const isAccepted = bundleResult.accepted;
      const isRejected = bundleResult.rejected;
      if (isAccepted) {
        logger.info(
          `Bundle ${bundleId} accepted in slot ${bundleResult.accepted?.slot}`,
        );
      }
      if (isRejected) {
        logger.info(bundleResult.rejected, `Bundle ${bundleId} rejected:`);
      }
    },
    (error) => {
      logger.error(error);
    },
  );
};

export { submitBundle, onDefaultBundleResult }