const express = require('express');
const cors = require('cors');
const path = require('path');
const { initDatabase, queryAll, queryOne, execute, lastInsertId, saveDatabase, getDb } = require('./database');

const app = express();
const PORT = process.env.PORT || 3003;
const HOST = process.env.HOST || '0.0.0.0'; // รับ connection จากทุก IP ในวง LAN

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ============ BANKS ============

app.get('/api/banks', (req, res) => {
  const banks = queryAll('SELECT * FROM banks ORDER BY bank_code');
  res.json(banks);
});

app.put('/api/banks/:id', (req, res) => {
  const { branch_name, account_number, account_name, account_type } = req.body;
  execute('UPDATE banks SET branch_name = ?, account_number = ?, account_name = ?, account_type = ? WHERE id = ?',
    [branch_name, account_number, account_name || null, account_type || null, parseInt(req.params.id)]);
  res.json({ message: 'อัพเดทข้อมูลธนาคารสำเร็จ' });
});

app.post('/api/banks', (req, res) => {
  const { bank_code, bank_name, branch_name, account_number, account_name, account_type } = req.body;
  if (!bank_code || !bank_name) {
    return res.status(400).json({ error: 'กรุณาระบุรหัสธนาคารและชื่อธนาคาร' });
  }
  try {
    execute('INSERT INTO banks (bank_code, bank_name, branch_name, account_number, account_name, account_type) VALUES (?, ?, ?, ?, ?, ?)',
      [bank_code.toUpperCase(), bank_name, branch_name || null, account_number || null, account_name || null, account_type || 'ออมทรัพย์']);
    res.json({ message: 'เพิ่มบัญชีธนาคารสำเร็จ' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/banks/:id', (req, res) => {
  const bankId = parseInt(req.params.id);
  // ตรวจสอบว่ามีเช็คอยู่ในธนาคารนี้หรือไม่
  const chequeCount = queryOne('SELECT COUNT(*) as cnt FROM stock_cheques WHERE bank_id = ?', [bankId]);
  if (chequeCount && chequeCount.cnt > 0) {
    return res.status(400).json({ error: `ไม่สามารถลบได้ มีเช็ค ${chequeCount.cnt} รายการอยู่ในธนาคารนี้` });
  }
  execute('DELETE FROM banks WHERE id = ?', [bankId]);
  res.json({ message: 'ลบธนาคารสำเร็จ' });
});

// ============ STOCK CHEQUES ============

app.get('/api/cheques', (req, res) => {
  const { bank_id, status, search } = req.query;
  let sql = `
    SELECT sc.*, b.bank_code, b.bank_name, b.account_name
    FROM stock_cheques sc
    JOIN banks b ON sc.bank_id = b.id
    WHERE 1=1
  `;
  const params = [];

  if (bank_id) {
    sql += ' AND sc.bank_id = ?';
    params.push(parseInt(bank_id));
  }
  if (status) {
    sql += ' AND sc.status = ?';
    params.push(status);
  }
  if (search) {
    sql += ' AND (sc.cheque_number LIKE ? OR sc.book_number LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }

  sql += ' ORDER BY sc.cheque_number ASC';
  const cheques = queryAll(sql, params);
  res.json(cheques);
});

app.get('/api/cheques/:id', (req, res) => {
  const cheque = queryOne(`
    SELECT sc.*, b.bank_code, b.bank_name, b.branch_name, b.account_number
    FROM stock_cheques sc
    JOIN banks b ON sc.bank_id = b.id
    WHERE sc.id = ?
  `, [parseInt(req.params.id)]);

  if (!cheque) {
    return res.status(404).json({ error: 'ไม่พบข้อมูลเช็ค' });
  }

  const transactions = queryAll(`
    SELECT * FROM cheque_transactions
    WHERE cheque_id = ?
    ORDER BY created_at DESC
  `, [parseInt(req.params.id)]);

  res.json({ ...cheque, transactions });
});

app.post('/api/cheques', (req, res) => {
  const { bank_id, cheque_number, book_number, notes, payee_name } = req.body;

  if (!bank_id || !cheque_number) {
    return res.status(400).json({ error: 'กรุณาระบุธนาคารและเลขที่เช็ค' });
  }

  try {
    // Check duplicate
    const existing = queryOne('SELECT id FROM stock_cheques WHERE bank_id = ? AND cheque_number = ?', [parseInt(bank_id), cheque_number]);
    if (existing) {
      return res.status(400).json({ error: 'เลขที่เช็คนี้มีอยู่ในระบบแล้ว' });
    }

    execute('INSERT INTO stock_cheques (bank_id, cheque_number, book_number, notes, payee_name) VALUES (?, ?, ?, ?, ?)',
      [parseInt(bank_id), cheque_number, book_number || null, notes || null, payee_name || 'บริษัท ซีเรียล แฟคตอริ่ง (ประเทศไทย) จำกัด']);
    const id = lastInsertId();
    res.json({ id, message: 'เพิ่มเช็คสำเร็จ' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/cheques/bulk', (req, res) => {
  const { bank_id, book_number, start_number, count, notes, payee_name } = req.body;

  if (!bank_id || !start_number) {
    return res.status(400).json({ error: 'กรุณาระบุธนาคารและเลขที่เช็คใบแรก' });
  }

  const chequeCount = parseInt(count, 10) || 50;
  if (chequeCount < 1 || chequeCount > 200) {
    return res.status(400).json({ error: 'จำนวนเช็คต้องอยู่ระหว่าง 1-200 ใบ' });
  }

  const start = parseInt(start_number, 10);
  if (isNaN(start)) {
    return res.status(400).json({ error: 'เลขที่เช็คไม่ถูกต้อง' });
  }

  const padLength = start_number.length;
  const db = getDb();
  let insertCount = 0;
  const defaultPayee = payee_name || 'บริษัท ซีเรียล แฟคตอริ่ง (ประเทศไทย) จำกัด';

  try {
    db.run("BEGIN TRANSACTION");
    for (let i = 0; i < chequeCount; i++) {
      const chequeNumber = String(start + i).padStart(padLength, '0');
      const existing = queryOne('SELECT id FROM stock_cheques WHERE bank_id = ? AND cheque_number = ?', [parseInt(bank_id), chequeNumber]);
      if (!existing) {
        db.run('INSERT INTO stock_cheques (bank_id, cheque_number, book_number, notes, payee_name) VALUES (?, ?, ?, ?, ?)',
          [parseInt(bank_id), chequeNumber, book_number || null, notes || null, defaultPayee]);
        insertCount++;
      }
    }
    db.run("COMMIT");
    saveDatabase();
    const lastCheque = String(start + chequeCount - 1).padStart(padLength, '0');
    res.json({ message: `เพิ่มเช็คสำเร็จ ${insertCount} ใบ (${start_number} - ${lastCheque})` });
  } catch (err) {
    db.run("ROLLBACK");
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/cheques/:id', (req, res) => {
  const { status, notes, cheque_number, book_number, bank_id } = req.body;

  // ถ้ามี cheque_number = แก้ไขข้อมูลเช็ค (edit mode)
  if (cheque_number !== undefined) {
    try {
      // ตรวจสอบ duplicate (ยกเว้นตัวเอง)
      const existing = queryOne('SELECT id FROM stock_cheques WHERE bank_id = ? AND cheque_number = ? AND id != ?',
        [parseInt(bank_id), cheque_number, parseInt(req.params.id)]);
      if (existing) {
        return res.status(400).json({ error: 'เลขที่เช็คนี้มีอยู่ในระบบแล้ว' });
      }
      execute("UPDATE stock_cheques SET bank_id = ?, cheque_number = ?, book_number = ?, notes = ?, payee_name = ?, updated_at = datetime('now','localtime') WHERE id = ?",
        [parseInt(bank_id), cheque_number, book_number || null, notes || null, req.body.payee_name || null, parseInt(req.params.id)]);
      res.json({ message: 'แก้ไขเช็คสำเร็จ' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  } else {
    // เปลี่ยนสถานะ (เดิม)
    execute("UPDATE stock_cheques SET status = ?, notes = ?, updated_at = datetime('now','localtime') WHERE id = ?",
      [status, notes, parseInt(req.params.id)]);
    res.json({ message: 'อัพเดทสถานะเช็คสำเร็จ' });
  }
});

app.delete('/api/cheques/:id', (req, res) => {
  const cheque = queryOne('SELECT status FROM stock_cheques WHERE id = ?', [parseInt(req.params.id)]);
  if (!cheque) {
    return res.status(404).json({ error: 'ไม่พบข้อมูลเช็ค' });
  }
  if (cheque.status !== 'available') {
    return res.status(400).json({ error: 'ไม่สามารถลบเช็คที่ถูกใช้แล้วได้' });
  }

  execute('DELETE FROM stock_cheques WHERE id = ?', [parseInt(req.params.id)]);
  res.json({ message: 'ลบเช็คสำเร็จ' });
});

// ============ TRANSACTIONS ============

app.post('/api/transactions', (req, res) => {
  const { cheque_id, transaction_type, payee_name, amount, transaction_date, description, created_by } = req.body;

  if (!cheque_id || !transaction_type) {
    return res.status(400).json({ error: 'กรุณาระบุข้อมูลให้ครบ' });
  }

  const validTypes = ['issued', 'voided', 'cancelled', 'returned'];
  if (!validTypes.includes(transaction_type)) {
    return res.status(400).json({ error: 'ประเภทรายการไม่ถูกต้อง' });
  }

  const statusMap = {
    issued: 'issued',
    voided: 'voided',
    cancelled: 'cancelled',
    returned: 'available'
  };

  const db = getDb();
  try {
    db.run("BEGIN TRANSACTION");
    db.run(`INSERT INTO cheque_transactions (cheque_id, transaction_type, payee_name, amount, transaction_date, description, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [parseInt(cheque_id), transaction_type, payee_name || null, amount ? parseFloat(amount) : null, transaction_date || null, description || null, created_by || null]);
    db.run("UPDATE stock_cheques SET status = ?, updated_at = datetime('now','localtime') WHERE id = ?",
      [statusMap[transaction_type], parseInt(cheque_id)]);
    db.run("COMMIT");
    saveDatabase();
    res.json({ message: 'บันทึกรายการสำเร็จ' });
  } catch (err) {
    db.run("ROLLBACK");
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/transactions/:chequeId', (req, res) => {
  const transactions = queryAll(`
    SELECT ct.*, sc.cheque_number, b.bank_code
    FROM cheque_transactions ct
    JOIN stock_cheques sc ON ct.cheque_id = sc.id
    JOIN banks b ON sc.bank_id = b.id
    WHERE ct.cheque_id = ?
    ORDER BY ct.created_at DESC
  `, [parseInt(req.params.chequeId)]);
  res.json(transactions);
});

app.get('/api/transactions', (req, res) => {
  const { bank_id, from_date, to_date } = req.query;
  let sql = `
    SELECT ct.*, sc.cheque_number, b.bank_code, b.bank_name, b.account_name
    FROM cheque_transactions ct
    JOIN stock_cheques sc ON ct.cheque_id = sc.id
    JOIN banks b ON sc.bank_id = b.id
    WHERE 1=1
  `;
  const params = [];

  if (bank_id) {
    sql += ' AND sc.bank_id = ?';
    params.push(parseInt(bank_id));
  }
  if (from_date) {
    sql += ' AND ct.transaction_date >= ?';
    params.push(from_date);
  }
  if (to_date) {
    sql += ' AND ct.transaction_date <= ?';
    params.push(to_date);
  }

  sql += ' ORDER BY ct.created_at DESC';
  const transactions = queryAll(sql, params);
  res.json(transactions);
});

// ============ PRINT - DOT MATRIX (LQ-310) ============

// Generate plain text report for dot matrix printing
app.get('/api/print/cheques', (req, res) => {
  const { bank_id, status } = req.query;
  let sql = `
    SELECT sc.*, b.bank_code, b.bank_name
    FROM stock_cheques sc
    JOIN banks b ON sc.bank_id = b.id
    WHERE 1=1
  `;
  const params = [];
  if (bank_id) { sql += ' AND sc.bank_id = ?'; params.push(parseInt(bank_id)); }
  if (status) { sql += ' AND sc.status = ?'; params.push(status); }
  sql += ' ORDER BY b.bank_code, sc.cheque_number ASC';

  const cheques = queryAll(sql, params);
  const bankName = bank_id ? (cheques[0]?.bank_name || '') : 'ทุกธนาคาร';

  // LQ-310: 80 columns width
  const W = 80;
  const line = '-'.repeat(W);
  let txt = '';
  txt += centerText('รายงาน Stock Cheque - บัญชีควบคุม', W) + '\n';
  txt += centerText(`ธนาคาร: ${bankName}`, W) + '\n';
  txt += centerText(`วันที่พิมพ์: ${new Date().toLocaleDateString('th-TH')}`, W) + '\n';
  txt += line + '\n';
  txt += padRight('ธนาคาร', 8) + padRight('เลขที่เช็ค', 12) + padRight('เล่มที่', 8) + padRight('สถานะ', 14) + padRight('วันที่ลงทะเบียน', 18) + padRight('หมายเหตุ', 20) + '\n';
  txt += line + '\n';

  cheques.forEach(c => {
    const statusLabel = { available: 'พร้อมใช้', issued: 'เบิกจ่ายแล้ว', voided: 'Void', cancelled: 'Cancel' }[c.status] || c.status;
    const regDate = c.registered_date ? c.registered_date.split(' ')[0] : '-';
    txt += padRight(c.bank_code, 8) + padRight(c.cheque_number, 12) + padRight(c.book_number || '-', 8) + padRight(statusLabel, 14) + padRight(regDate, 18) + padRight(c.notes || '-', 20) + '\n';
  });

  txt += line + '\n';
  txt += `รวมทั้งหมด: ${cheques.length} รายการ\n`;

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.send(txt);
});

app.get('/api/print/transactions', (req, res) => {
  const { bank_id, from_date, to_date } = req.query;
  let sql = `
    SELECT ct.*, sc.cheque_number, b.bank_code, b.bank_name
    FROM cheque_transactions ct
    JOIN stock_cheques sc ON ct.cheque_id = sc.id
    JOIN banks b ON sc.bank_id = b.id
    WHERE 1=1
  `;
  const params = [];
  if (bank_id) { sql += ' AND sc.bank_id = ?'; params.push(parseInt(bank_id)); }
  if (from_date) { sql += ' AND ct.transaction_date >= ?'; params.push(from_date); }
  if (to_date) { sql += ' AND ct.transaction_date <= ?'; params.push(to_date); }
  sql += ' ORDER BY ct.transaction_date DESC, ct.created_at DESC';

  const txs = queryAll(sql, params);

  const W = 80;
  const line = '-'.repeat(W);
  let txt = '';
  txt += centerText('รายงานประวัติเบิกจ่ายเช็ค', W) + '\n';
  txt += centerText(`วันที่พิมพ์: ${new Date().toLocaleDateString('th-TH')}`, W) + '\n';
  if (from_date || to_date) {
    txt += centerText(`ช่วงวันที่: ${from_date || '...'} ถึง ${to_date || '...'}`, W) + '\n';
  }
  txt += line + '\n';
  txt += padRight('วันที่', 12) + padRight('ธ.', 5) + padRight('เลขที่เช็ค', 10) + padRight('ประเภท', 10) + padRight('ผู้รับเงิน', 18) + padRight('จำนวนเงิน', 14) + padRight('ผู้ทำ', 11) + '\n';
  txt += line + '\n';

  let totalAmount = 0;
  txs.forEach(t => {
    const typeLabel = { issued: 'เบิกจ่าย', voided: 'Void', cancelled: 'Cancel', returned: 'คืนเช็ค' }[t.transaction_type] || t.transaction_type;
    const amt = t.amount ? Number(t.amount).toLocaleString('th-TH', { minimumFractionDigits: 2 }) : '-';
    if (t.amount && t.transaction_type === 'issued') totalAmount += t.amount;
    txt += padRight(t.transaction_date || '-', 12) + padRight(t.bank_code, 5) + padRight(t.cheque_number, 10) + padRight(typeLabel, 10) + padRight((t.payee_name || '-').substring(0, 16), 18) + padLeft(amt, 14) + padRight((t.created_by || '-').substring(0, 10), 11) + '\n';
  });

  txt += line + '\n';
  txt += `รวมทั้งหมด: ${txs.length} รายการ    ยอดรวมเบิกจ่าย: ${totalAmount.toLocaleString('th-TH', { minimumFractionDigits: 2 })} บาท\n`;

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.send(txt);
});

// Print single cheque detail
app.get('/api/print/cheque/:id', (req, res) => {
  const cheque = queryOne(`
    SELECT sc.*, b.bank_code, b.bank_name, b.branch_name, b.account_number
    FROM stock_cheques sc
    JOIN banks b ON sc.bank_id = b.id
    WHERE sc.id = ?
  `, [parseInt(req.params.id)]);

  if (!cheque) return res.status(404).send('ไม่พบข้อมูล');

  const transactions = queryAll(`
    SELECT * FROM cheque_transactions WHERE cheque_id = ? ORDER BY created_at DESC
  `, [parseInt(req.params.id)]);

  const W = 80;
  const line = '-'.repeat(W);
  const statusLabel = { available: 'พร้อมใช้', issued: 'เบิกจ่ายแล้ว', voided: 'Void', cancelled: 'Cancel' }[cheque.status] || cheque.status;

  let txt = '';
  txt += centerText('รายละเอียดเช็ค', W) + '\n';
  txt += line + '\n';
  txt += `ธนาคาร      : ${cheque.bank_name} (${cheque.bank_code})\n`;
  txt += `สาขา        : ${cheque.branch_name || '-'}\n`;
  txt += `เลขที่บัญชี : ${cheque.account_number || '-'}\n`;
  txt += `เลขที่เช็ค  : ${cheque.cheque_number}\n`;
  txt += `เล่มที่     : ${cheque.book_number || '-'}\n`;
  txt += `สถานะ       : ${statusLabel}\n`;
  txt += `วันที่ลงทะเบียน : ${cheque.registered_date || '-'}\n`;
  txt += `หมายเหตุ    : ${cheque.notes || '-'}\n`;
  txt += line + '\n';
  txt += 'ประวัติรายการ:\n';
  txt += padRight('วันที่', 12) + padRight('ประเภท', 10) + padRight('ผู้รับเงิน', 20) + padRight('จำนวนเงิน', 14) + padRight('รายละเอียด', 24) + '\n';
  txt += line + '\n';

  if (transactions.length === 0) {
    txt += centerText('- ไม่มีรายการ -', W) + '\n';
  } else {
    transactions.forEach(t => {
      const typeLabel = { issued: 'เบิกจ่าย', voided: 'Void', cancelled: 'Cancel', returned: 'คืนเช็ค' }[t.transaction_type] || t.transaction_type;
      const amt = t.amount ? Number(t.amount).toLocaleString('th-TH', { minimumFractionDigits: 2 }) : '-';
      txt += padRight(t.transaction_date || '-', 12) + padRight(typeLabel, 10) + padRight((t.payee_name || '-').substring(0, 18), 20) + padLeft(amt, 14) + padRight((t.description || '-').substring(0, 22), 24) + '\n';
    });
  }
  txt += line + '\n';

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.send(txt);
});

// Helper functions for text formatting (fixed-width for dot matrix)
function padRight(str, len) {
  str = String(str || '');
  // Thai characters may have different visual width, pad generously
  if (str.length >= len) return str.substring(0, len);
  return str + ' '.repeat(len - str.length);
}

function padLeft(str, len) {
  str = String(str || '');
  if (str.length >= len) return str.substring(0, len);
  return ' '.repeat(len - str.length) + str;
}

function centerText(str, width) {
  str = String(str || '');
  if (str.length >= width) return str;
  const pad = Math.floor((width - str.length) / 2);
  return ' '.repeat(pad) + str;
}

// ============ EXPORT EXCEL ============

app.get('/api/export/cheques', (req, res) => {
  const { bank_id, status } = req.query;
  let sql = `
    SELECT sc.cheque_number, sc.book_number, sc.status, sc.registered_date, sc.notes, sc.updated_at, b.bank_code, b.bank_name
    FROM stock_cheques sc
    JOIN banks b ON sc.bank_id = b.id
    WHERE 1=1
  `;
  const params = [];
  if (bank_id) { sql += ' AND sc.bank_id = ?'; params.push(parseInt(bank_id)); }
  if (status) { sql += ' AND sc.status = ?'; params.push(status); }
  sql += ' ORDER BY b.bank_code, sc.cheque_number ASC';

  const cheques = queryAll(sql, params);
  res.json(cheques);
});

app.get('/api/export/transactions', (req, res) => {
  const { bank_id, from_date, to_date } = req.query;
  let sql = `
    SELECT ct.transaction_date, ct.transaction_type, ct.payee_name, ct.amount, ct.description, ct.created_by, ct.created_at,
           sc.cheque_number, b.bank_code, b.bank_name
    FROM cheque_transactions ct
    JOIN stock_cheques sc ON ct.cheque_id = sc.id
    JOIN banks b ON sc.bank_id = b.id
    WHERE 1=1
  `;
  const params = [];
  if (bank_id) { sql += ' AND sc.bank_id = ?'; params.push(parseInt(bank_id)); }
  if (from_date) { sql += ' AND ct.transaction_date >= ?'; params.push(from_date); }
  if (to_date) { sql += ' AND ct.transaction_date <= ?'; params.push(to_date); }
  sql += ' ORDER BY ct.transaction_date DESC, ct.created_at DESC';

  const txs = queryAll(sql, params);
  res.json(txs);
});

// ============ DASHBOARD STATS ============

app.get('/api/stats', (req, res) => {
  const stats = queryAll(`
    SELECT
      b.bank_code,
      b.bank_name,
      COUNT(sc.id) as total,
      SUM(CASE WHEN sc.status = 'available' THEN 1 ELSE 0 END) as available,
      SUM(CASE WHEN sc.status = 'issued' THEN 1 ELSE 0 END) as issued,
      SUM(CASE WHEN sc.status = 'voided' THEN 1 ELSE 0 END) as voided,
      SUM(CASE WHEN sc.status = 'cancelled' THEN 1 ELSE 0 END) as cancelled
    FROM banks b
    LEFT JOIN stock_cheques sc ON b.id = sc.bank_id
    GROUP BY b.id
  `);
  res.json(stats);
});

app.get('/api/stats/monthly', (req, res) => {
  // ยอดเบิกจ่ายรายเดือน 6 เดือนล่าสุด
  const monthly = queryAll(`
    SELECT
      strftime('%Y-%m', ct.transaction_date) as month,
      COUNT(*) as count,
      COALESCE(SUM(ct.amount), 0) as total_amount
    FROM cheque_transactions ct
    WHERE ct.transaction_type = 'issued'
      AND ct.transaction_date >= date('now', '-6 months')
    GROUP BY strftime('%Y-%m', ct.transaction_date)
    ORDER BY month ASC
  `);
  res.json(monthly);
});

// ============ FIELD OFFSETS (ค่าปรับตำแหน่ง share ทุกเครื่อง) ============

app.get('/api/field-offsets/:formKey', (req, res) => {
  const row = queryOne('SELECT offsets_json FROM field_offsets WHERE form_key = ?', [req.params.formKey]);
  if (row) {
    res.json(JSON.parse(row.offsets_json));
  } else {
    res.json({});
  }
});

app.put('/api/field-offsets/:formKey', (req, res) => {
  const formKey = req.params.formKey;
  const offsets = JSON.stringify(req.body);
  const existing = queryOne('SELECT id FROM field_offsets WHERE form_key = ?', [formKey]);
  if (existing) {
    execute("UPDATE field_offsets SET offsets_json = ?, updated_at = datetime('now','localtime') WHERE form_key = ?", [offsets, formKey]);
  } else {
    execute("INSERT INTO field_offsets (form_key, offsets_json) VALUES (?, ?)", [formKey, offsets]);
  }
  res.json({ message: 'บันทึกตำแหน่งสำเร็จ' });
});

// ============ START SERVER ============

async function startServer() {
  await initDatabase();
  app.listen(PORT, HOST, () => {
    console.log(`Stock Cheque Server running on http://${HOST}:${PORT}`);
    console.log(`LAN access: http://192.168.212.180:${PORT}`);
  });
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
