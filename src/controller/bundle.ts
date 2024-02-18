import { Commitment, LAMPORTS_PER_SOL, PublicKey, VersionedTransaction } from "@solana/web3.js";
import { getJitoTipAccount } from "./jito";
import { Bundle } from "jito-ts/dist/sdk/block-engine/types";
import { payer } from "../adapter/payer";
import { connection } from "../adapter/rpc";
import { config } from "../utils/config";
import { fastTrackSearcherClient } from "../adapter/jito";
import { SearcherClient } from "jito-ts/dist/sdk/block-engine/searcher";

const submitBundle = async (c: SearcherClient, transaction: VersionedTransaction) => {
    const tipAddress = await getJitoTipAccount()
    const tipAccount = new PublicKey(tipAddress)
    
    const resp = await connection.getLatestBlockhash(config.get('default_commitment') as Commitment);

    const bundle = new Bundle([transaction], 2)
    // bundle.addTransactions(
    //     transaction
    // )

    bundle.addTipTx(
        payer,
        0.001 * LAMPORTS_PER_SOL,
        tipAccount,
        resp.blockhash
    )

    const bundleId = await c.sendBundle(bundle)
    console.log(bundleId)
}

const onBundleResult = (c: SearcherClient) => {
    c.onBundleResult(
      result => {
        console.log('received bundle result:', result);
      },
      e => {
        throw e;
      }
    );
  };

export { submitBundle, onBundleResult }