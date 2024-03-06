import { TxPool } from "../types";

export abstract class BaseGenerator {
    protected abstract listen(): AsyncGenerator<TxPool>
}