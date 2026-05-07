import { DataSource } from 'typeorm';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import * as net from 'net';
import { SocksClient } from 'socks';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

// 解析 ALL_PROXY 環境變數中的 SOCKS5 代理設定
function parseSocksProxy(): { host: string; port: number } | null {
  const raw = process.env.ALL_PROXY || process.env.all_proxy;
  if (!raw) return null;
  try {
    const normalized = raw.replace(/^socks5h?:\/\//, 'socks5://');
    const url = new URL(normalized);
    if (url.protocol === 'socks5:' || url.protocol === 'socks:') {
      return { host: url.hostname, port: parseInt(url.port) || 1080 };
    }
  } catch {
    // ignore
  }
  return null;
}

// 建立透過 SOCKS5 代理連線的 socket 工廠（供 pg 的 stream 選項使用）
// pg 取得 socket 後會呼叫 socket.connect(port, host)，
// 我們覆寫 connect() 讓它透過 SOCKS5 建立 TCP 連線。
function createSocksSocketFactory(proxy: { host: string; port: number }) {
  return function (_pgConfig: unknown): net.Socket {
    const socket = new net.Socket();

    // SOCKS socket 的 _handle 永遠為 null（不走 net 原生 connect）。
    // 原始 _read 每次呼叫都會注冊 once('connect')，且 'connect' 觸發後再呼叫
    // _read 仍會持續累積 listener（因 _handle 仍為 null）。
    // 覆寫 _read 改為 no-op：資料由 SOCKS bridge 透過 socket.push(chunk) 推入。
    // setMaxListeners(0) 停用此 socket 的 listener 數量警告（TLS handshake 期間合理多）。
    socket.setMaxListeners(0);
    let socksConnected = false;
    socket.once('connect', () => { socksConnected = true; });
    (socket as any)._read = function (_n: number): void {
      // 連線前：等待 'connect'（不需注冊 listener，push 在 'connect' 後由 SOCKS bridge 驅動）
      // 連線後：資料已由 socksSocket 的 'data' handler 透過 socket.push(chunk) 推入
      if (socksConnected) return;
    };

    (socket as any).connect = function (port: number, host: string): net.Socket {
      SocksClient.createConnection({
        proxy: { host: proxy.host, port: proxy.port, type: 5 },
        command: 'connect',
        destination: { host, port },
      })
        .then(({ socket: socksSocket }) => {
          // 將 SOCKS socket 收到的資料推入 pg 的 readable buffer
          socksSocket.on('data', (chunk: Buffer) => socket.push(chunk));
          socksSocket.on('error', (err: Error) => socket.emit('error', err));
          socksSocket.on('close', () => socket.emit('close', false));
          socksSocket.on('end', () => socket.push(null));

          // 將 pg 的寫入操作轉發至 SOCKS socket
          socket.write = (chunk: any, enc?: any, cb?: any): boolean =>
            socksSocket.write(chunk, enc, cb);
          socket.end = (chunk?: any, enc?: any, cb?: any): net.Socket => {
            socksSocket.end(chunk, enc, cb);
            return socket;
          };
          socket.destroy = (err?: Error): net.Socket => {
            socksSocket.destroy(err);
            return socket;
          };

          socket.emit('connect');
        })
        .catch((err: Error) => socket.emit('error', err));

      return socket;
    };

    // _handle 永遠為 null（我們不走 net 原生 connect），避免 pg 呼叫 setKeepAlive 時出錯
    (socket as any).setKeepAlive = (): net.Socket => socket;

    return socket;
  };
}

// 測試環境（無 SOCKS proxy）專用的 socket 工廠。
// 直連遠端 Supabase 時 TLS handshake 期間，pg 內部及 TLS 層會向 'connect' 事件
// 注冊多個合法 listener，超過 Node.js 預設 10 個上限觸發 MaxListenersExceededWarning。
// setMaxListeners(0) 只對此特定 socket 停用警告（不影響其他 socket 的全域設定）。
function createTestSocketFactory() {
  return function (_pgConfig: unknown): net.Socket {
    const socket = new net.Socket();
    socket.setMaxListeners(0);
    return socket;
  };
}

const socksProxy = parseSocksProxy();

const streamFactory = socksProxy
  ? createSocksSocketFactory(socksProxy)
  : process.env.NODE_ENV === 'test'
    ? createTestSocketFactory()
    : null;

const extra: Record<string, unknown> = {
  ...(process.env.NODE_ENV === 'test' ? { max: 2 } : {}),
  ...(streamFactory !== null ? { stream: streamFactory } : {}),
};

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 5432,
  username: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'password',
  database: process.env.DB_NAME || 'postgres',
  synchronize: false,
  logging: process.env.NODE_ENV === 'development' ? ['error'] : false,
  entities: [path.join(__dirname, '..', 'models', '*.{ts,js}')],
  migrations: [path.join(__dirname, '..', 'migrations', '*.{ts,js}')],
  subscribers: [],
  extra,
});

export const connectToDatabase = async () => {
  try {
    await AppDataSource.initialize();
    console.log('數據庫連接成功');
    return AppDataSource;
  } catch (error) {
    console.error('數據庫連接失敗:', error);
    throw error;
  }
};

/**
 * 檢查資料庫是否存在，不存在則創建
 * (僅用於開發環境)
 */

/*
async function ensureDatabaseExists() {
  const {
    DB_HOST = 'localhost',
    DB_PORT = '5432',
    DB_NAME = 'postgres',
    DB_USER = 'postgres',
    DB_PASSWORD,
  } = process.env;
  
  
  // 連接到默認資料庫以建立新資料庫
  const pool = new Pool({
    user: DB_USER,
    host: DB_HOST,
    password: DB_PASSWORD,
    port: parseInt(DB_PORT, 10),
    database: 'postgres' // 連接到默認資料庫以建立新資料庫
  });

  try {
    // 檢查資料庫是否存在
    const checkDbResult = await pool.query(
      `SELECT 1 FROM pg_database WHERE datname = '${DB_NAME}'`
    );

    // 如果資料庫不存在，則創建它
    if (checkDbResult.rows.length === 0) {
      console.log(`資料庫 ${DB_NAME} 不存在，正在創建...`);
      await pool.query(`CREATE DATABASE ${DB_NAME}`);
      console.log(`資料庫 ${DB_NAME} 創建成功`);
    }
  } catch (err) {
    console.error('檢查/創建資料庫時出錯:', err);
  } finally {
    await pool.end();
  }
}
  */