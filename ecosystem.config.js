module.exports = {
  apps: [
    {
      name: 'myhandle-backend',
      script: './backend/server.js',
      cwd: '/home/ysp442218/myhandlein',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
      },
      max_memory_restart: '1G',
    }
  ]
};
