const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const useSqlite = process.env.USE_SQLITE === 'true' || process.env.DB_TYPE === 'sqlite';

// Cấu hình Redis linh hoạt
let redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: Number.parseInt(process.env.REDIS_PORT || '6379', 10),
  maxRetriesPerRequest: null
};

if (useSqlite) {
  const sqliteAdapter = require('./sqliteAdapter');
  module.exports = {
    sql: sqliteAdapter.sql,
    getPool: sqliteAdapter.getPool,
    redisConfig
  };
} else {
  // Tự động nhận diện chế độ: Chạy Cloud (Linux/Render hoặc DB_MODE=cloud) hay Chạy Local Windows
  const isCloudMode = process.env.DB_MODE === 'cloud' || process.platform !== 'win32';
  const sql = isCloudMode ? require('mssql') : require('mssql/msnodesqlv8');

const dbServer = process.env.DB_SERVER;
const dbName = process.env.DB_NAME;

if (!dbServer || !dbName) {
  throw new Error('DB_SERVER và DB_NAME cần được khai báo trong server/.env');
}

let sqlConfig;

if (isCloudMode) {
  // Cấu hình Tedious cho Cloud (Azure SQL / Render / Linux container)
  sqlConfig = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: dbServer,
    database: dbName,
    port: Number.parseInt(process.env.DB_PORT || '1433', 10),
    options: {
      encrypt: process.env.DB_ENCRYPT !== 'false', // Azure SQL bắt buộc encrypt = true
      trustServerCertificate: process.env.DB_TRUST_CERT === 'true'
    },
    pool: {
      max: 10,
      min: 0,
      idleTimeoutMillis: 30000
    }
  };
} else {
  // Cấu hình ODBC Driver mặc định cho máy tính Windows nội bộ
  const credentials = process.env.DB_USER && process.env.DB_PASSWORD
    ? `UID=${process.env.DB_USER};PWD=${process.env.DB_PASSWORD};`
    : 'Trusted_Connection=Yes;';

  sqlConfig = {
    connectionString:
      `Driver={${process.env.DB_DRIVER || 'ODBC Driver 17 for SQL Server'}};` +
      `Server=${dbServer};` +
      `Database=${dbName};` +
      credentials +
      'TrustServerCertificate=Yes;',
    pool: {
      max: 10,
      min: 0,
      idleTimeoutMillis: 30000
    }
  };
}

// Cấu hình Redis linh hoạt: Hỗ trợ cả Docker Localhost lẫn Cloud Upstash (REDIS_URL)
if (process.env.REDIS_URL) {
  try {
    const parsed = new URL(process.env.REDIS_URL);
    redisConfig = {
      host: parsed.hostname,
      port: Number.parseInt(parsed.port || '6379', 10),
      username: parsed.username || undefined,
      password: parsed.password || undefined,
      tls: parsed.protocol === 'rediss:' ? { rejectUnauthorized: false } : undefined,
      maxRetriesPerRequest: null
    };
  } catch {
    redisConfig = {
      host: process.env.REDIS_HOST || 'localhost',
      port: Number.parseInt(process.env.REDIS_PORT || '6379', 10),
      maxRetriesPerRequest: null
    };
  }
} else {
  redisConfig = {
    host: process.env.REDIS_HOST || 'localhost',
    port: Number.parseInt(process.env.REDIS_PORT || '6379', 10),
    maxRetriesPerRequest: null
  };
}

let poolPromise;

function getPool() {
  if (!poolPromise) {
    poolPromise = new sql.ConnectionPool(sqlConfig)
      .connect()
      .then((pool) => {
        console.log(`[SQL Server] Kết nối thành công! (${isCloudMode ? 'Chế độ Cloud / Tedious' : 'Chế độ Local Windows / ODBC'})`);
        return pool;
      })
      .catch((error) => {
        poolPromise = null;
        console.error('[SQL Server Error]');
        console.dir(error, { depth: null });
        throw error;
      });
  }

  return poolPromise;
}

  module.exports = {
    sql,
    getPool,
    redisConfig
  };
}