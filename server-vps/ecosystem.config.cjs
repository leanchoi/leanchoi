/**
 * PM2 — proceso del servidor de juego en el VPS.
 *
 * Va en `.cjs` y no en `.js` a propósito: el workspace declara
 * `"type": "module"`, así que un `.js` sería ESM y `module.exports` no
 * existiría. PM2 lee `.cjs` sin chistar.
 *
 *   pm2 start ecosystem.config.cjs --env production
 *   pm2 logs esquel-realtime
 *   pm2 reload esquel-realtime      # recarga sin cortar a los que están jugando
 *   pm2 save && pm2 startup         # que vuelva solo después de un reboot
 *
 * **Por qué `fork` y no `cluster`.** Colyseus mantiene el estado de las salas en
 * la memoria del proceso. En modo cluster, cada worker tendría su propio mundo:
 * dos jugadores que entran a "la misma" sala terminarían en shards distintos sin
 * verse. Se escala con más procesos en puertos distintos detrás de un
 * balanceador —cada uno es un shard— y no con `instances: max`.
 *
 * **Rotación de logs.** PM2 no rota nada de fábrica: un VPS chico se llena de
 * logs en unas semanas. Se instala el módulo una sola vez:
 *
 *   pm2 install pm2-logrotate
 *   pm2 set pm2-logrotate:max_size 20M
 *   pm2 set pm2-logrotate:retain 14
 *   pm2 set pm2-logrotate:compress true
 *   pm2 set pm2-logrotate:rotateInterval '0 0 * * *'
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

      // Un segundo shard se levanta copiando este bloque con otro `name` y otro
      // `PORT`, y agregándolo al `upstream` de nginx.
    },
  ],

  /**
   * Despliegue por SSH: `pm2 deploy production setup` una vez, y después
   * `pm2 deploy production` en cada release. Reemplazar host, usuario y repo.
   */
  deploy: {
    production: {
      user: 'esquel',
      host: ['rt.esquel2027.ar'],
      ref: 'origin/main',
      repo: 'git@github.com:leanchoi/leanchoi.git',
      path: '/home/esquel/esquel2027',
      'pre-deploy-local': '',
      'post-deploy':
        'npm ci && npm run build --workspace server-vps && pm2 reload ecosystem.config.cjs --env production && pm2 save',
      'pre-setup': '',
    },
  },
};
