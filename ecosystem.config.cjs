module.exports = {
  apps: [
    {
      name: 'minebot',
      script: 'index.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_restarts: 20,
      min_uptime: '10s',
      kill_timeout: 5000,
      env: {
        NODE_ENV: 'production'
      }
    }
  ]
};
