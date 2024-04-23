module.exports = {
  apps : [
    {
      name: 'v2',
      script: './build/src/strategy/v2.js',
      args: '--max-old-space-size=6144',
      instances: 1,
      autorestart: true,
      watch: false,

    },
    {
      name: 'amm',
      script: './build/src/tools/amm-listener.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G'
    },
    {
      name: 'market',
      script: './build/src/tools/market-listener.js',
      instances: 'max', // Use 'max' to utilize all available CPU cores
      exec_mode: 'cluster', // Use clustering mode
      autorestart: true,
      watch: false,
    }
  ]
}