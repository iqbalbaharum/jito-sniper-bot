import { PublicKey } from "@solana/web3.js"
import { redisClient } from "../adapter/redis"

export class SnipeList {
    static async isTokenListed(token: PublicKey) : Promise<boolean> {
        let state = await redisClient.get(`snipe:${token}`)
        return state !== null
    }
}