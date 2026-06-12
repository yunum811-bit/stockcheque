const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'stockcheque.db');

let db;

async function initDatabase() {
  const SQL = await initSqlJs();

  // Load existing DB or create new
  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  // Create tables
  db.run(`
    CREATE TABLE IF NOT EXISTS banks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bank_code TEXT NOT NULL,
      bank_name TEXT NOT NULL,
      branch_name TEXT,
      account_number TEXT,
      account_name TEXT,
      account_type TEXT DEFAULT 'ออมทรัพย์',
      created_at TEXT DEFAULT (datetime('now','localtime'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS stock_cheques (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bank_id INTEGER NOT NULL,
      cheque_number TEXT NOT NULL,
      book_number TEXT,
      status TEXT NOT NULL DEFAULT 'available',
      payee_name TEXT DEFAULT 'บริษัท ซีเรียล แฟคตอริ่ง (ประเทศไทย) จำกัด',
      registered_date TEXT DEFAULT (datetime('now','localtime')),
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (bank_id) REFERENCES banks(id),
      UNIQUE(bank_id, cheque_number)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS cheque_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cheque_id INTEGER NOT NULL,
      transaction_type TEXT NOT NULL,
      payee_name TEXT,
      amount REAL,
      transaction_date TEXT,
      description TEXT,
      created_by TEXT,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (cheque_id) REFERENCES stock_cheques(id)
    )
  `);

  // Migrate: add account_name column if not exists
  try {
    const cols = db.exec("PRAGMA table_info(banks)");
    const hasAccountName = cols[0] && cols[0].values.some(row => row[1] === 'account_name');
    if (!hasAccountName) {
      db.run("ALTER TABLE banks ADD COLUMN account_name TEXT");
      db.run("UPDATE banks SET account_name = 'บริษัท ซีเรียล แฟคตอริ่ง (ประเทศไทย) จำกัด' WHERE account_name IS NULL");
    }
  } catch (e) {
    // ignore
  }

  // Migrate: remove UNIQUE constraint on bank_code (recreate table without it)
  try {
    const idxInfo = db.exec("SELECT sql FROM sqlite_master WHERE type='table' AND name='banks'");
    if (idxInfo[0] && idxInfo[0].values[0][0] && idxInfo[0].values[0][0].includes('UNIQUE')) {
      db.run("ALTER TABLE banks RENAME TO banks_old");
      db.run(`CREATE TABLE banks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        bank_code TEXT NOT NULL,
        bank_name TEXT NOT NULL,
        branch_name TEXT,
        account_number TEXT,
        account_name TEXT,
        created_at TEXT DEFAULT (datetime('now','localtime'))
      )`);
      db.run("INSERT INTO banks SELECT * FROM banks_old");
      db.run("DROP TABLE banks_old");
    }
  } catch (e) {
    // ignore
  }

  // Migrate: add payee_name column to stock_cheques if not exists
  try {
    const cols2 = db.exec("PRAGMA table_info(stock_cheques)");
    const hasPayeeName = cols2[0] && cols2[0].values.some(row => row[1] === 'payee_name');
    if (!hasPayeeName) {
      db.run("ALTER TABLE stock_cheques ADD COLUMN payee_name TEXT DEFAULT 'บริษัท ซีเรียล แฟคตอริ่ง (ประเทศไทย) จำกัด'");
      db.run("UPDATE stock_cheques SET payee_name = 'บริษัท ซีเรียล แฟคตอริ่ง (ประเทศไทย) จำกัด' WHERE payee_name IS NULL");
    }
  } catch (e) {
    // ignore
  }

  // Migrate: add account_type column to banks if not exists
  try {
    const cols3 = db.exec("PRAGMA table_info(banks)");
    const hasAccountType = cols3[0] && cols3[0].values.some(row => row[1] === 'account_type');
    if (!hasAccountType) {
      db.run("ALTER TABLE banks ADD COLUMN account_type TEXT DEFAULT 'ออมทรัพย์'");
    }
  } catch (e) {
    // ignore
  }

  // Insert default banks if not exist
  const existingBanks = db.exec("SELECT COUNT(*) FROM banks");
  if (existingBanks[0].values[0][0] === 0) {
    db.run("INSERT INTO banks (bank_code, bank_name, branch_name, account_number, account_name) VALUES ('BBL', 'ธนาคารกรุงเทพ', 'สำนักงานใหญ่', '', '')");
    db.run("INSERT INTO banks (bank_code, bank_name, branch_name, account_number, account_name) VALUES ('UOB', 'ธนาคารยูโอบี', 'สำนักงานใหญ่', '', '')");
  }

  // Create field_offsets table (เก็บค่าปรับตำแหน่ง share ทุกเครื่อง)
  db.run(`
    CREATE TABLE IF NOT EXISTS field_offsets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      form_key TEXT NOT NULL UNIQUE,
      offsets_json TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    )
  `);

  saveDatabase();
  return db;
}

function saveDatabase() {
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}

function getDb() {
  return db;
}

// Helper to run SELECT queries and return array of objects
function queryAll(sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length > 0) stmt.bind(params);

  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

// Helper to run SELECT and return single row
function queryOne(sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length > 0) stmt.bind(params);

  let result = null;
  if (stmt.step()) {
    result = stmt.getAsObject();
  }
  stmt.free();
  return result;
}

// Helper to run INSERT/UPDATE/DELETE
function execute(sql, params = []) {
  db.run(sql, params);
  saveDatabase();
}

// Get last insert rowid
function lastInsertId() {
  const result = db.exec("SELECT last_insert_rowid()");
  return result[0].values[0][0];
}

module.exports = { initDatabase, getDb, saveDatabase, queryAll, queryOne, execute, lastInsertId };
