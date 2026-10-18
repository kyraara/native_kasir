// npm run db:migrate   → buat database & tabel
// npm run db:seed      → isi ulang dengan data contoh (MENGHAPUS data yang ada)
// npm run db:wipe      → kosongkan semua data untuk mulai pakai data toko asli
import 'dotenv/config';

const { migrate, resetToSeed, wipeAll } = await import('../server/seed');
const { getPool, DB_NAME } = await import('../server/db');

const cmd = process.argv[2];
await migrate();
console.log(`✓ Skema database "${DB_NAME}" siap`);

if (cmd === 'seed') {
  await resetToSeed();
  console.log('✓ Data contoh dimuat');
} else if (cmd === 'wipe') {
  await wipeAll();
  console.log('✓ Semua data dikosongkan (pengaturan toko dipertahankan)');
}

await getPool().end();
