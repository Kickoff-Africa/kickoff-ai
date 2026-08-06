import { config } from '../config/env';
import { pool } from '../config/database';

async function seed(): Promise<void> {
  try {
    const result = await pool.query(
      `INSERT INTO users (email, role)
       VALUES ($1, 'admin')
       ON CONFLICT (email) DO NOTHING
       RETURNING id`,
      [config.adminEmail]
    );

    if (result.rows.length > 0) {
      console.log(`Admin user created: ${config.adminEmail} (id: ${result.rows[0].id})`);
    } else {
      console.log(`Admin user already exists: ${config.adminEmail}`);
    }
  } finally {
    await pool.end();
  }
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
