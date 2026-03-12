import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import Database from "better-sqlite3";
import { RestClientV5 } from "bybit-api";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database("bot.db");

// Initialize DB
db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    bybit_api_key TEXT,
    bybit_api_secret TEXT,
    symbol TEXT DEFAULT 'BTCUSDT',
    interval TEXT DEFAULT '15',
    multiplier REAL DEFAULT 3.0,
    period INTEGER DEFAULT 10,
    trade_amount REAL DEFAULT 10.0,
    is_running INTEGER DEFAULT 0,
    testnet INTEGER DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    level TEXT,
    message TEXT
  );

  CREATE TABLE IF NOT EXISTS trades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    symbol TEXT,
    side TEXT,
    price REAL,
    amount REAL,
    status TEXT
  );

  INSERT OR IGNORE INTO settings (id) VALUES (1);
`);

async function startServer() {
  const app = express();
  app.use(express.json());

  // API Routes
  app.get("/api/settings", (req, res) => {
    const settings = db.prepare("SELECT * FROM settings WHERE id = 1").get();
    res.json(settings);
  });

  app.post("/api/settings", (req, res) => {
    const { bybit_api_key, bybit_api_secret, symbol, interval, multiplier, period, trade_amount, testnet } = req.body;
    db.prepare(`
      UPDATE settings SET 
        bybit_api_key = ?, 
        bybit_api_secret = ?, 
        symbol = ?, 
        interval = ?, 
        multiplier = ?, 
        period = ?, 
        trade_amount = ?,
        testnet = ?
      WHERE id = 1
    `).run(bybit_api_key, bybit_api_secret, symbol, interval, multiplier, period, trade_amount, testnet ? 1 : 0);
    res.json({ success: true });
  });

  app.get("/api/logs", (req, res) => {
    const logs = db.prepare("SELECT * FROM logs ORDER BY timestamp DESC LIMIT 100").all();
    res.json(logs);
  });

  app.get("/api/trades", (req, res) => {
    const trades = db.prepare("SELECT * FROM trades ORDER BY timestamp DESC LIMIT 50").all();
    res.json(trades);
  });

  app.get("/api/market/status", async (req, res) => {
    const settings: any = db.prepare("SELECT * FROM settings WHERE id = 1").get();
    if (!settings.bybit_api_key || !settings.bybit_api_secret) {
      return res.json({ error: "API keys not configured" });
    }

    try {
      const client = new RestClientV5({
        key: settings.bybit_api_key,
        secret: settings.bybit_api_secret,
        testnet: settings.testnet === 1,
      });

      const klinesResponse = await client.getKline({
        category: "spot",
        symbol: settings.symbol,
        interval: settings.interval,
        limit: 100,
      });

      if (klinesResponse.retCode !== 0) throw new Error(klinesResponse.retMsg);

      const klines = klinesResponse.result.list.map((k: any) => ({
        time: parseInt(k[0]),
        open: parseFloat(k[1]),
        high: parseFloat(k[2]),
        low: parseFloat(k[3]),
        close: parseFloat(k[4]),
      })).reverse();

      const st = calculateSuperTrend(klines, settings.period, settings.multiplier);
      const currentPrice = klines[klines.length - 1].close;
      const currentST = st[st.length - 1];

      res.json({
        price: currentPrice,
        superTrend: currentST.value,
        direction: currentST.direction,
        symbol: settings.symbol
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/bot/toggle", (req, res) => {
    const { is_running } = req.body;
    db.prepare("UPDATE settings SET is_running = ? WHERE id = 1").run(is_running ? 1 : 0);
    res.json({ success: true, is_running });
  });

  // Vite middleware
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  const PORT = 3000;
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });

  // Bot Logic
  runBotLoop();
}

async function runBotLoop() {
  console.log("Bot loop started");
  while (true) {
    try {
      const settings: any = db.prepare("SELECT * FROM settings WHERE id = 1").get();
      if (settings && settings.is_running && settings.bybit_api_key && settings.bybit_api_secret) {
        await executeBotStep(settings);
      }
    } catch (error: any) {
      console.error("Bot loop error:", error);
      db.prepare("INSERT INTO logs (level, message) VALUES (?, ?)").run("error", `Loop error: ${error.message}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 60000)); // Run every minute
  }
}

async function executeBotStep(settings: any) {
  const client = new RestClientV5({
    key: settings.bybit_api_key,
    secret: settings.bybit_api_secret,
    testnet: settings.testnet === 1,
  });

  // 1. Fetch Klines
  const klinesResponse = await client.getKline({
    category: "spot",
    symbol: settings.symbol,
    interval: settings.interval,
    limit: 100,
  });

  if (klinesResponse.retCode !== 0) {
    throw new Error(`Bybit API Error: ${klinesResponse.retMsg}`);
  }

  const klines = klinesResponse.result.list.map((k: any) => ({
    time: parseInt(k[0]),
    open: parseFloat(k[1]),
    high: parseFloat(k[2]),
    low: parseFloat(k[3]),
    close: parseFloat(k[4]),
    volume: parseFloat(k[5]),
  })).reverse(); // Bybit returns newest first, we want oldest first for calculation

  // 2. Calculate SuperTrend
  const st = calculateSuperTrend(klines, settings.period, settings.multiplier);
  const currentST = st[st.length - 1];
  const prevST = st[st.length - 2];

  const currentPrice = klines[klines.length - 1].close;

  // 3. Check for signals
  // Buy signal: Price crosses above SuperTrend
  // Sell signal: Price crosses below SuperTrend
  
  const isBuySignal = currentPrice > currentST.value && klines[klines.length - 2].close <= prevST.value;
  const isSellSignal = currentPrice < currentST.value && klines[klines.length - 2].close >= prevST.value;

  if (isBuySignal) {
    await placeOrder(client, settings, "Buy", currentPrice);
  } else if (isSellSignal) {
    await placeOrder(client, settings, "Sell", currentPrice);
  }
}

function calculateSuperTrend(klines: any[], period: number, multiplier: number) {
  const atr = calculateATR(klines, period);
  const st = [];

  let prevUpperBand = 0;
  let prevLowerBand = 0;
  let prevFinalUpperBand = 0;
  let prevFinalLowerBand = 0;
  let prevST = 0;
  let direction = 1; // 1 for up, -1 for down

  for (let i = 0; i < klines.length; i++) {
    if (i < period) {
      st.push({ value: 0, direction: 1 });
      continue;
    }

    const hl2 = (klines[i].high + klines[i].low) / 2;
    const basicUpperBand = hl2 + multiplier * atr[i];
    const basicLowerBand = hl2 - multiplier * atr[i];

    if (i === period) {
      prevFinalUpperBand = basicUpperBand;
      prevFinalLowerBand = basicLowerBand;
    }

    const finalUpperBand = (basicUpperBand < prevFinalUpperBand || klines[i - 1].close > prevFinalUpperBand) ? basicUpperBand : prevFinalUpperBand;
    const finalLowerBand = (basicLowerBand > prevFinalLowerBand || klines[i - 1].close < prevFinalLowerBand) ? basicLowerBand : prevFinalLowerBand;

    let currentST = 0;
    if (prevST === prevFinalUpperBand) {
      currentST = klines[i].close <= finalUpperBand ? finalUpperBand : finalLowerBand;
    } else {
      currentST = klines[i].close >= finalLowerBand ? finalLowerBand : finalUpperBand;
    }

    st.push({ value: currentST, direction: currentST === finalLowerBand ? 1 : -1 });

    prevFinalUpperBand = finalUpperBand;
    prevFinalLowerBand = finalLowerBand;
    prevST = currentST;
  }

  return st;
}

function calculateATR(klines: any[], period: number) {
  const tr = klines.map((k, i) => {
    if (i === 0) return k.high - k.low;
    const hl = k.high - k.low;
    const hpc = Math.abs(k.high - klines[i - 1].close);
    const lpc = Math.abs(k.low - klines[i - 1].close);
    return Math.max(hl, hpc, lpc);
  });

  const atr = [];
  let sum = 0;
  for (let i = 0; i < tr.length; i++) {
    if (i < period) {
      sum += tr[i];
      atr.push(0);
    } else if (i === period) {
      sum += tr[i];
      atr.push(sum / period);
    } else {
      atr.push((atr[i - 1] * (period - 1) + tr[i]) / period);
    }
  }
  return atr;
}

async function placeOrder(client: RestClientV5, settings: any, side: string, price: number) {
  try {
    const response = await client.submitOrder({
      category: "spot",
      symbol: settings.symbol,
      side: side as any,
      orderType: "Market",
      qty: settings.trade_amount.toString(),
    });

    if (response.retCode === 0) {
      db.prepare("INSERT INTO trades (symbol, side, price, amount, status) VALUES (?, ?, ?, ?, ?)").run(
        settings.symbol,
        side,
        price,
        settings.trade_amount,
        "filled"
      );
      db.prepare("INSERT INTO logs (level, message) VALUES (?, ?)").run(
        "info",
        `Order placed: ${side} ${settings.trade_amount} ${settings.symbol} at ${price}`
      );
    } else {
      throw new Error(response.retMsg);
    }
  } catch (error: any) {
    db.prepare("INSERT INTO logs (level, message) VALUES (?, ?)").run("error", `Order failed: ${error.message}`);
  }
}

startServer();
