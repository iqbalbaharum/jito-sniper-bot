module.exports = {
  apps : [
    {
      name: 'v1',
      script: './build/src/strategy/v1.js',
      args: '--max-old-space-size=6144',
      instances: 1,
      max_memory_restart: '2G',
      autorestart: true,
      watch: false,
      cron_restart: '0 * * * *',
      exec_mode: 'fork'
    },
    {
      name: 'v2',
      script: './build/src/strategy/v2.js',
      args: '--max-old-space-size=6144',
      instances: 1,
      max_memory_restart: '2G',
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      cron_restart: '0 * * * *',
    },
    {
      name: 'v2-jito',
      script: './build/src/strategy/v2-jito.js',
      args: '--max-old-space-size=6144',
      instances: 1,
      max_memory_restart: '2G',
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      cron_restart: '0 * * * *',
    },
    {
      name: 'v3',
      script: './build/src/strategy/v3.js',
      args: '--max-old-space-size=6144',
      instances: 1,
      max_memory_restart: '2G',
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      cron_restart: '0 * * * *',
    },
    {
      name: 'amm',
      script: './build/src/services/amm.js',
      instances: 1,
      autorestart: true,
      watch: false,
      cron_restart: '0 * * * *',
    },
    {
      name: 'market',
      script: './build/src/services/market.js',
      instances: 2,
      exec_mode: 'cluster',
      autorestart: true,
      watch: false,
      cron_restart: '0 * * * *',
    },
    {
      name: 'blockhasher',
      script: './build/src/services/blockhasher.js',
      instances: 1,
      autorestart: true,
      watch: false,
      cron_restart: '0 * * * *',
    },
    {
      name: 'payer',
      script: './build/src/services/payer.js',
      instances: 1,
      autorestart: true,
      watch: false,
      cron_restart: '0 * * * *',
    },
    {
      name: 'delayed-buy',
      script: './build/src/services/delayed-buy.js',
      instances: 1,
      autorestart: true,
      watch: false,
      cron_restart: '0 * * * *',
    },
    {
      name: 'trade',
      script: './build/src/services/trade.js',
      instances: 2,
      autorestart: true,
      watch: false,
      cron_restart: '0 * * * *',
    },
    {
      name: 'trade-high',
      script: './build/src/services/trade.js',
      instances: 5,
      autorestart: true,
      watch: false,
      cron_restart: '0 * * * *',
    },
    {
      name: 'price-tick',
      script: './build/src/services/price-tick.js',
      instances: 1,
      autorestart: true,
      watch: false,
      cron_restart: '0 * * * *',
    }
  ]
}