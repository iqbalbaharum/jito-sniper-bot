import { TxPool } from "../types"

export abstract class BaseStream {
    abstract listen(addresses: string[]): void
    abstract stop(): void
    abstract addCallback(cb: (tx: TxPool) => void): void
}