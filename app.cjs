// Startup file untuk cPanel → "Setup Node.js App" (Phusion Passenger).
// Isi "Application startup file" dengan: app.cjs
process.env.NODE_ENV = process.env.NODE_ENV || 'production';

import('./build/server.mjs').catch((err) => {
  console.error('Gagal menjalankan Native Motor:', err);
  process.exit(1);
});
