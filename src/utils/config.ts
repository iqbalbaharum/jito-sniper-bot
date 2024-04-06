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
    tip_percent: {
        format: Number,
        default: 10,
        env: 'TIP_PERCENT'
    },
    default_tip_in_sol: {
        format: Number,
        default: 0.001,
        env: 'DEFAULT_TIP_IN_SOL'
    },
    max_tip_in_sol: {
        format: Number,
        default: 0.01,
        env: 'MAX_TIP_IN_SOL'
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
    triton_one_url: {
        format: String,
        default: '',
        env: 'TRITON_ONE_URL'
    },
    triton_one_api_key: {
        format: String,
        default: '',
        env: 'TRITON_ONE_API_KEY'
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
    }
})

config.validate({ allowed: 'strict' })

export {config}