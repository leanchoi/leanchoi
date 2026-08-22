/**
 * PM2 — proceso del servidor de juego en el VPS.
 *
 *   pm2 start pm2.config.js --env production
 *   pm2 logs esquel-realtime
 *   pm2 reload esquel-realtime      # recarga sin cortar a los que están jugando
 *
 * Un solo proceso por puerto: Colyseus es de un hilo, se escala con más procesos
 * en puertos distintos detrás de un balanceador, no con `instances: max`.
 * `cluster` acá rompería las salas: cada worker tendría su propio estado.
 */

module.exports = {
  apps: [
    {
      name: 'esquel-realtime',
      script: 'dist/index.js',
      cwd: __dirname,
      exec_mode: 'fork',
      instances: 1,
      watch: false,

      // Reinicio automático, con freno para no entrar en bucle de crash.
      autorestart: true,
      max_restarts: 10,
      min_uptime: '30s',
      restart_delay: 2000,
      exp_backoff_restart_delay: 500,

      // Si se le va la memoria, se reinicia antes de que lo mate el kernel.
      max_memory_restart: '600M',
      kill_timeout: 8000, // margen para volcar stats a Hostinger antes de morir
      wait_ready: false,
      listen_timeout: 10000,

      merge_logs: true,
      time: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: 'logs/esquel-error.log',
      out_file: 'logs/esquel-out.log',

      env: {
        NODE_ENV: 'development',
        PORT: 2567,
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 2567,
        LOG_LEVEL: 'info',
        // El resto (JWT_SECRET, HOSTINGER_API_KEY, CORS_ORIGIN…) va en el .env
        // del VPS, nunca versionado. Ver .env.example.
      },
    },
  ],
};
