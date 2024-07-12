import { PublicKey, VersionedTransaction } from "@solana/web3.js";
import { pipeline } from "stream";
import { Agent, request } from "undici";
import { promisify } from "util";
import { createGunzip, createInflate } from "zlib";
import { config } from "../utils";

const agent = new Agent({
    keepAliveTimeout: 20 * 1000,
    keepAliveMaxTimeout: 20 * 1000,
    connections: 500,
    pipelining: 1,
  });
  
const pipelineAsync = promisify(pipeline);

export class BloxRouteRpc {
    
    static getTipAddress() {
        return new PublicKey('HWEoBxYs7ssKuudEjzjmpfJVX7Dvi7wescFsVx2L5yoY')
    }

    static async submitTransaction(transaction: VersionedTransaction, useStakedRPCs: boolean) {

        const { headers, body } = await request(config.get('bloxroute_url'), {
            method: 'POST',
            headers: {
              'content-type': 'application/json;charset=UTF-8',
              'accept-encoding': 'gzip, deflate',
              'Authorization': config.get('bloxroute_token')
            },
            body: JSON.stringify({
                transaction: {
                    content: Buffer.from(transaction.serialize()).toString('base64')
                },
                skipPreFlight: true,
                frontRunningProtection: false,
                useStakedRPCs
            }),
            dispatcher: agent
          })
      
          let responseBody = '';
          const encoding = headers['content-encoding'];
      
          if (encoding === 'gzip' || encoding === 'deflate') {
            const decompressStream = encoding === 'gzip' ? createGunzip() : createInflate();
            await pipelineAsync(body, decompressStream, async function* (source) {
              for await (const chunk of source) {
                responseBody += chunk;
              }
            });
          } else {
            for await (const chunk of body) {
              responseBody += chunk;
            }
          }
          
          let response = JSON.parse(responseBody)
          return response.signature || ''
    }
}