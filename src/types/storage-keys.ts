export enum StorageKeys {
    KEY_AMMSTATE = "storage_key::amm_state",
    KEY_OPENBOOKMARKET = "storage_key::openbook_market",
    KEY_LOOKUPTABLE='storage_key::lookup_table',
    KEY_TOKENACCOUNT='storage_key::token_account',
    KEY_EXISTINGMARKET='storage_key::existing_market',
    KEY_COUNTLP = 'storage::count_liquidity_pool',
    KEY_TOKENCHUNK = 'storage::token_chunk',
    KEY_POOLKEYS = 'storage::pool_keys',
    KEY_TRACKEDAMM = 'storage::tracked_amm',
    KEY_MINTDETAIL = 'storage::mint_detail',
    KEY_TRADE = 'storage::trade',
    KEY_TRADETRACKER = 'storage::trade_tracker',
    //
    KEY_BLOCKHASHV2 = 'listener:blockhashv2',
    KEY_TOKENTICK = 'listener::token_tick',
    // Signature
    KEY_TXSIG_BALUPDATE = 'storage::tx_signature_balance_update',
    KEY_SIGNATURETRACKER = 'storage::signature_tracker',
    // LISTENER
    KEY_L_BLOCKHASH = 'listener:blockhash'
}
