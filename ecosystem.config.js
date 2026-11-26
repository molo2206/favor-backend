// ecosystem.config.js — lancement en production avec pm2
//   npm run build
//   pm2 delete all            (une seule fois, pour supprimer l'ancien lancement)
//   pm2 start ecosystem.config.js --env production
//   pm2 save
//
// ⚠️ Mode « fork » (1 instance) volontairement : l'API utilise Socket.IO, des minuteries (dispatch des courses)
// et des caches en mémoire. Le mode cluster demanderait des sessions collantes + l'adaptateur Redis de Socket.IO.
const os = require('os');

const totalMb = Math.round(os.totalmem() / 1024 / 1024);
// Tas JavaScript : 50 % de la RAM du VPS (entre 1 et 4 Go). L'ancien réglage (8 Go) dépassait la RAM du serveur :
// Node ne libérait presque jamais la mémoire → swap → gel de plusieurs secondes, puis arrêt par le système.
const heapMb = Math.min(4096, Math.max(1024, Math.round(totalMb * 0.5)));
// Redémarrage propre si le processus dépasse 80 % de la RAM (au lieu d'un arrêt brutal par le système)
const restartMb = Math.max(heapMb + 512, Math.round(totalMb * 0.8));
const cpus = Math.max(1, os.cpus().length);

module.exports = {
  apps: [
    {
      name: 'favor-backend',
      script: 'dist/src/main.js',
      cwd: __dirname,
      exec_mode: 'fork',
      instances: 1,
      node_args: `--max-old-space-size=${heapMb}`,
      max_memory_restart: `${restartMb}M`,
      // Laisse le temps de terminer les requêtes en cours et de fermer MySQL / sockets / Chromium
      kill_timeout: 15000,
      listen_timeout: 60000,
      // Évite une boucle de redémarrages si le démarrage échoue (BDD inaccessible…)
      exp_backoff_restart_delay: 200,
      max_restarts: 50,
      min_uptime: '20s',
      time: true,
      merge_logs: true,
      // NODE_ENV reste celui de votre .env (non forcé ici)
      env: {
        UV_THREADPOOL_SIZE: String(Math.min(64, Math.max(8, cpus * 4))),
      },
      env_production: {
        UV_THREADPOOL_SIZE: String(Math.min(64, Math.max(8, cpus * 4))),
      },
    },
  ],
};
