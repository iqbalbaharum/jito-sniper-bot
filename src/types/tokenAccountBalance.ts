import { PublicKey } from "@solana/web3.js"

export type TokenAccountBalance = {
    mint: PublicKey,
    balance: number
}