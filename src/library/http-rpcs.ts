import { AccountInfo, Connection, PublicKey, VersionedTransaction } from "@solana/web3.js";
import { toBuffer } from "../utils/instruction";
import { Agent, request } from 'undici'
import { promisify } from 'util';
import { pipeline } from 'stream';
import { createGunzip, createInflate } from "zlib";

const agent = new Agent({
  keepAliveTimeout: 20 * 1000,
  keepAliveMaxTimeout: 20 * 1000,
  connections: 500,
  pipelining: 1,
});

const pipelineAsync = promisify(pipeline);

export class SolanaHttpRpc {

  static async fetchRequest(url: string, requestBody: string) {
    const { headers, body } = await request(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json;charset=UTF-8',
        'accept-encoding': 'gzip, deflate'
      },
      body: requestBody,
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

    return JSON.parse(responseBody)
  }

  static async getAccountInfo(connection: Connection, publicKey: PublicKey, dataSlice?: { offset: number, length: number }): Promise<Partial<AccountInfo<Buffer>> | null> {
    const body = await this.fetchRequest(connection.rpcEndpoint, JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getAccountInfo",
      params: [
        publicKey.toBase58(),
        {
          encoding: "base64",
          dataSlice,
          commitment: connection.commitment
        }
      ]
    }))

    if(!body || !body.result.value) { return null }

    return {
      data: Buffer.from(body.result.value.data[0], 'base64'),
      owner: new PublicKey(body.result.value.owner)
    };
  }

  static async getLookupTable(connection: Connection, lutAddress: PublicKey, dataSlice?: { offset: number, length: number }): Promise<Uint8Array | undefined> {
    
    const body = await this.fetchRequest(connection.rpcEndpoint, JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getAccountInfo",
      params: [
        lutAddress.toBase58(),
        {
          encoding: "base64",
          dataSlice: {
            offset: 56
          },
          commitment: connection.commitment
        }
      ]
    }))

    if(!body || !body.result.value) { return undefined }

    let buffer = Buffer.from(body.result.value.data[0], 'base64')
    return new Uint8Array(buffer)
  }
  
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

  static async sendTransaction(connection: Connection, transaction: VersionedTransaction) : Promise<string> {
    const resp = await fetch(connection.rpcEndpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json;charset=UTF-8',
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "sendTransaction",
        params: [
          toBuffer(transaction.serialize()).toString('base64'),
          {
            encoding: "base64",
            skipPreflight: true,
            maxRetries: 1,
            preflightCommitment: connection.commitment
          }
        ]
      })
    })
    const json = await resp.json();
    return json.result
  }
}