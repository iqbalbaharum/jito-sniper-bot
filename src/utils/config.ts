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
    lite_rpc_url: {
        format: String,
        default: '',
        env: 'LITE_RPC_URL'
    },
    lite_rpc_ws_url: {
        format: String,
        default: '',
        env: 'LITE_RPC_WS_URL'
    },
    use_lite_rpc: {
        format: Boolean,
        default: false,
        env: 'USE_LITE_RPC'
    },
    http_rpc_url_2: {
        format: String,
        default: 'https://api.mainnet-beta.solana.com',
        env: 'HTTP_RPC_URL_2'
    },
    http_rpc_urls: {
        format: Array,
        default: ['https://api.mainnet-beta.solana.com'],
        doc: 'rpc (http) urls. push transaction to all rpcs',
        env: 'HTTP_RPC_URLS'
    },
    websocket_rpc_url_2: {
        format: String,
        default: '',
        env: 'WEBSOCKET_RPC_URL_2'
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
    helius_api_key: {
        format: String,
        default: '',
        env: 'HELIUS_API_KEY'
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
    tip_percent_min: {
        format: Number,
        default: 1,
        env: 'TIP_PERCENT_MIN'
    },
    tip_percent_max: {
        format: Number,
        default: 1,
        env: 'TIP_PERCENT_MAX'
    },
    min_tip_in_sol: {
        format: Number,
        default: 0.001,
        env: 'MIN_TIP_IN_SOL'
    },
    max_tip_in_sol: {
        format: Number,
        default: 0.001,
        env: 'MAX_TIP_IN_SOL'
    },
    jito_bundle_min_threshold: {
        format: Number,
        default: 0.001,
        env: 'JITO_BUNDLE_MIN_THRESHOLD'
    },
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
    compute_unit_percentage: {
        format: Number,
        default: 0,
        env: 'COMPUTE_UNIT_PERCENTAGE'
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
    grpc_1_url: {
        format: String,
        default: '',
        env: 'GRPC_1_URL'
    },
    grpc_1_token: {
        format: String,
        default: '',
        env: 'GRPC_1_TOKEN'
    },
    grpc_2_url: {
        format: String,
        default: '',
        env: 'GRPC_2_URL'
    },
    grpc_2_token: {
        format: String,
        default: '',
        env: 'GRPC_2_TOKEN'
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
    }
})

config.validate({ allowed: 'strict' })

export {config}