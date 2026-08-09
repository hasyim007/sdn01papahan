#!/usr/bin/env node
/**
 * scripts/set-admin-password.js
 * ---------------------------------------------------------------------
 * Untuk instalasi BARU (tanpa migrasi data lama): generate SQL untuk
 * set username + password admin pertama kali, karena schema.sql hanya
 * mengisi placeholder hash yang tidak valid untuk login.
 *
 * CARA PAKAI:
 *   node scripts/set-admin-password.js admin PasswordAmanSaya123
 *   npx wrangler d1 execute sdn01-papahan-db --remote --file=./scripts/admin-password.sql
 * ---------------------------------------------------------------------
 */
const fs = require('fs');
const crypto = require('crypto');

const username = process.argv[2];
const password = process.argv[3];

if (!username || !password) {
    console.error('Pemakaian: node scripts/set-admin-password.js <username> <password>');
    process.exit(1);
}

const iterations = 100000;
const salt = crypto.randomBytes(16);
const hash = crypto.pbkdf2Sync(password, salt, iterations, 32, 'sha256');
const passwordHash = `${iterations}:${salt.toString('hex')}:${hash.toString('hex')}`;

const sql = `DELETE FROM admin WHERE id = 1;
INSERT INTO admin (id, username, password_hash) VALUES (1, '${username.replace(/'/g, "''")}', '${passwordHash}');`;

fs.writeFileSync('scripts/admin-password.sql', sql, 'utf-8');
console.log('File dibuat: scripts/admin-password.sql');
console.log('Jalankan: npx wrangler d1 execute sdn01-papahan-db --remote --file=./scripts/admin-password.sql');
