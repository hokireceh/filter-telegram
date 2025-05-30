module.exports = {
  apps: [{
    name: 'filter-telegram',
    script: 'bot.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '500M',
    env: {
      NODE_ENV: 'production',
      LOG_LEVEL: 'info'
    },
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_file: './logs/pm2-combined.log',
    time: true,
    // Restart policies
    restart_delay: 5000,
    max_restarts: 10,
    min_uptime: '10s',
    // Advanced PM2 features
    kill_timeout: 5000,
    listen_timeout: 8000,
    shutdown_with_message: true,
    // Environment specific
    merge_logs: true,
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    // Node.js specific
    node_args: '--max-old-space-size=512'
  }]
};
