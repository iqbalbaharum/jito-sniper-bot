import { Connection, VersionedTransaction } from "@solana/web3.js";
import { toBuffer } from "../utils/instruction";

export class SolanaHttpRpc {
    static async simulateTransaction(connection: Connection, transaction: VersionedTransaction) {
        const resp = await fetch(connection.rpcEndpoint, {
            method: 'POST',
            headers: {
              'content-type': 'application/json;charset=UTF-8',
            },
            body: JSON.stringify({
              jsonrpc: "2.0",
              id: 1,
              method: "simulateTransaction",
              params: [
                toBuffer(transaction.serialize()).toString('base64'),
                {
                  encoding: "base64",
                  replaceRecentBlockhash: true,
                  sigVerify: false,
                  commitment: "processed"
                }
              ]
            })
          })
        return await resp.json();
    }
}