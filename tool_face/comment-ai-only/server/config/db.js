require('dotenv').config();

const useSqlite = process.env.USE_SQLITE === 'true' || process.env.DB_TYPE === 'sqlite';

if (useSqlite) {
  module.exports = require('./sqliteAdapter');
} else {
  const sql = require('mssql');
  const server = process.env.DB_SERVER;
  const database = process.env.DB_NAME;
  const user = process.env.DB_USER;
  const password = process.env.DB_PASSWORD;

  if (!server || !database || !user || !password) {
    throw new Error(
      'Configure USE_SQLITE=true or set DB_SERVER, DB_NAME, DB_USER and DB_PASSWORD in server/.env.'
    );
  }

  const config = {
    user,
    password,
    server,
    database,
    port: Number.parseInt(process.env.DB_PORT || '1433', 10),
    options: {
      encrypt: process.env.DB_ENCRYPT !== 'false',
      trustServerCertificate: process.env.DB_TRUST_CERT === 'true'
    },
    pool: {
      max: 10,
      min: 0,
      idleTimeoutMillis: 30000
    }
  };

  let poolPromise;

  function getPool() {
    if (!poolPromise) {
      poolPromise = new sql.ConnectionPool(config)
        .connect()
        .then((pool) => {
          console.log('[SQL Server] Connected.');
          return pool;
        })
        .catch((error) => {
          poolPromise = null;
          console.error('[SQL Server Error]', error.message);
          throw error;
        });
    }
    return poolPromise;
  }

  module.exports = { sql, getPool };
}
