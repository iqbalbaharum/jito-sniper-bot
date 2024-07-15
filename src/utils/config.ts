import convict from 'convict'
import * as dotenv from 'dotenv'
dotenv.config();

const config = convict({
    mode: {
        format: String,
        default: 'development',
        env: 'MODE'
    },
    http_rpc_url: {
        format: String,
        default: 'https://api.mainnet-beta.solana.com',
        env: 'HTTP_RPC_URL'
    },
    websocket_rpc_url: {
        format: String,
        default: '',
        env: 'WEBSOCKET_RPC_URL'
    },
    // Lite RPC
    send_tx_rpc_url: {
        format: Array,
        default: '',
        env: 'SEND_TX_RPC_URL'
    },
    bloxroute_url: {
        format: String,
        default: '',
        env: 'BLOXROUTE_URL'
    },
    bloxroute_token: {
        format: String,
        default: '',
        env: 'BLOXROUTE_TOKEN'
    },
    // JITO/BLOXROUTE TIPS MANAGEMENT
    tip_type: {
        format: String,
        default: 'fixed',
        env: 'TIP_TYPE'
    },
    tip_amount: {
        format: Number,
        default: 0,
        env: 'TIP_AMOUNT'
    },
    //
    http_rpc_url_2: {
        format: String,
        default: 'https://api.mainnet-beta.solana.com',
        env: 'HTTP_RPC_URL_2'
    },
    websocket_rpc_url_2: {
        format: String,
        default: '',
        env: 'WEBSOCKET_RPC_URL_2'
    },
    // HELIUS,
    helius_api_key: {
        format: String,
        default: '',
        env: 'HELIUS_API_KEY'
    },
    redis_url: {
        format: String,
        default: 'redis://localhost:6379',
        env: 'REDIS_URL'
    },
    block_engine_urls: {
        format: Array,
        default: ['tokyo.mainnet.block-engine.jito.wtf'],
        doc: 'block engine urls. bot will mempool subscribe to all and send bundles to first one',
        env: 'BLOCK_ENGINE_URLS'
    },
    auth_keypair_secret: {
        format: String,
        default: '',
        env: 'AUTH_KEYPAIR_SECRET'
    },
    payer_keypair_secret: {
        format: String,
        default: '',
        env: 'PAYER_KEYPAIR_SECRET'
    },
    default_commitment: {
        format: String,
        default: 'processed',
        env: 'DEFAULT_COMMITMENT'
    },
    swap_program_id: {
        format: String,
        default: '',
        env: 'SWAP_PROGRAM_ID'
    },
    token_purchase_in_sol: {
        format: Number,
        default: 0.0001,
        env: 'TOKEN_PURCHASE_IN_SOL'
    },
    min_sol_trigger: {
        format: Number,
        default: 0.0001,
        env: 'MIN_SOL_TRIGGER'
    },
    // Config
    blockhash_method: {
        format: String,
        default: 'rpc',
        env: 'BLOCKHASH_METHOD'
    },
    bot_retry: {
        format: Number,
        default: 3,
        env: 'BOT_RETRY'
    },
    http_agent_undici: {
        format: Number,
        default: 100,
        env: 'HTTP_AGENT_UNDICI'
    },
    //
    tx_balance_chuck_division: {
        format: Number,
        default: 4,
        env: 'TX_BALANCE_CHUCK_DIVISION'
    },
    log_level: {
        format: String,
        default: 'info',
        env: 'LOG_LEVEL'
    },
    bot_name: {
        format: String,
        default: '',
        env: 'BOT_NAME'
    },
    adjusted_percentage: {
        format: Number,
        default: 100,
        env: 'ADJUSTED_PERCENTAGE'
    },
    rdca_sell_interval: {
        format: Number,
        default: 5000,
        env: 'RDCA_SELL_INTERVAL'
    },
    rdca_1st_percentage: {
        format: Number,
        default: 25,
        env: 'RDCA_1ST_PERCENTAGE'
    },
    rdca_default_percentage: {
        format: Number,
        default: 25,
        env: 'RDCA_DEFAULT_PERCENTAGE'
    },
    block_time_range: {
        format: Number,
        default: 10000,
        env: 'BLOCK_TIME_RANGE'
    },
    // POOL CONFIGURATION
    pool_opentime_wait_max: {
        format: Number,
        default: 0,
        env: 'POOL_OPENTIME_WAIT_MAX'
    },
    // GRPC
    mempool_type: {
        format: String,
        default: 'callback',
        env: 'MEMPOOL_TYPE'
    },
    grpc_urls: {
        format: Array,
        default: '',
        env: 'GRPC_URLS'
    },
    grpc_tokens: {
        format: Array,
        default: '',
        env: 'GRPC_TOKENS'
    },
    // REDIS
    redis_host: {
        format: String,
        default: 'localhost',
        env: 'REDIS_HOST'
    },
    redis_port: {
        format: Number,
        default: 6379,
        env: 'REDIS_PORT'
    },
    // ALT
    raydium_alt: {
        format: String,
        default: '',
        env: 'RAYDIUM_ALT'
    },
    // PAYER (SERVICE),
    payer_retrieve_txs_count: {
        format: Number,
        default: 20,
        env: 'PAYER_RETRIEVE_TXS_COUNT'
    },
    // TICK
    tick_limit: {
        format: Number,
        default: 200,
        env: 'TICK_LIMIT'
    },
    // Trade
    trade_concurrency: {
        format: Number,
        default: 100,
        env: 'TRADE_CONCURRENCY'
    },
    // V2
    run_simulation_flag: {
        format: Boolean,
        default: true,
        env: 'RUN_SIMULATION_FLAG'
    },
    buy_after_withdraw_flag: {
        format: Boolean,
        default: false,
        env: 'BUY_AFTER_WITHDRAW_FLAG'
    },
    buy_after_initialize_flag: {
        format: Boolean,
        default: true,
        env: 'BUY_AFTER_INITIALIZE_FLAG'
    },
    delayed_buy_token_in_ms: {
        format: Number,
        default: 0,
        env: 'DELAY_BUY_TOKEN_IN_MS'
    },
    burst_microlamport: {
        format: Number,
        default: 100000,
        env: 'BURST_MICROLAMPORT'
    },
    sell_microlamport: {
        format: Number,
        default: 100000,
        env: 'SELL_MICROLAMPORT'
    },
    max_sell_attempt: {
        format: Number,
        default: 50,
        env: 'MAX_SELL_ATTEMPT'
    },
    auto_sell_after_lp_remove_flag: {
        format: Boolean,
        default: false,
        env: 'AUTO_SELL_AFTER_LP_REMOVE_FLAG'
    },
    lp_detection_onlog_enabled: {
        format: Boolean,
        default: false,
        env: 'LP_DETECTION_ONLOG_ENABLED'
    },
    pool_tracked_flag: {
        format: Boolean,
        default: false,
        env: 'POOL_TRACKED_FLAG'
    },
    minimum_sol_balance_in_lp: {
        format: Number,
        default: 1,
        env: 'MINIMUM_SOL_BALANCE_IN_LP'
    },
    // V2/V3
    minimum_amount_out: {
        format: Number,
        default: 10000000,
        env: 'MINIMUM_AMOUNT_OUT'
    },
    // V2-jito
    jito_tip: {
        format: Number,
        default: 10000,
        env: 'JITO_TIP'
    },
    // V3
    trade_limit: {
        format: Number,
        default: 1,
        env: 'TRADE_LIMIT'
    }
})

config.validate({ allowed: 'strict' })

export {config}