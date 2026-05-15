import mysql from 'mysql2/promise';

const tidbPool = mysql.createPool({
  host: 'gateway04.us-east-1.prod.aws.tidbcloud.com',
  port: 4000,
  user: '2jhK1AfHyk6mXSq.root',
  password: '2k5Lq94U8voiLkatA3uZ',
  database: 'luminari_registry',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  ssl: {
    rejectUnauthorized: true,
  },
});

export async function queryTiDB(sql: string, values?: any[]) {
  const connection = await tidbPool.getConnection();
  try {
    const [rows] = await connection.execute(sql, values);
    return rows;
  } finally {
    connection.release();
  }
}

export async function getTiDBConnection() {
  return tidbPool.getConnection();
}
