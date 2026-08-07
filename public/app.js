const API = window.location.origin;

let banks = [];

// ============ INITIALIZATION ============

document.addEventListener('DOMContentLoaded', () => {
  loadBanks();
  loadStats();
  loadAllFieldOffsets();
  // Set default dates for pay-in forms
  const today = new Date().toISOString().split('T')[0];
  const dateFields = ['ktb_date', 'uob_date', 'bbl_date'];
  dateFields.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = today;
  });
});

async function loadBanks() {
  const res = await fetch(`${API}/api/banks`);
  banks = await res.json();

  const selects = ['filterBank', 'txFilterBank', 'addBank', 'bulkBank'];
  selects.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const isFilter = id.includes('filter') || id.includes('Filter');
    el.innerHTML = isFilter ? '<option value="">ทั้งหมด</option>' : '';
    banks.forEach(b => {
      const label = b.account_name
        ? `${b.bank_name} (${b.bank_code}) - ${b.account_name}`
        : `${b.bank_name} (${b.bank_code})`;
      el.innerHTML += `<option value="${b.id}">${label}</option>`;
    });
  });
}

// ============ TAB NAVIGATION ============

function showTab(tab, event) {
  document.querySelectorAll('[id^="tab-"]').forEach(el => el.style.display = 'none');
  document.getElementById(`tab-${tab}`).style.display = 'block';

  document.querySelectorAll('#mainTabs .nav-link').forEach(el => el.classList.remove('active'));
  if (event && event.target) {
    event.target.closest('.nav-link').classList.add('active');
  }

  if (tab === 'dashboard') loadStats();
  if (tab === 'cheques') loadCheques();
  if (tab === 'transactions') loadTransactions();
  if (tab === 'settings') loadBankSettings();
}

// ============ DASHBOARD ============

let chartStatus = null;
let chartBank = null;
let chartMonthly = null;

async function loadStats() {
  const res = await fetch(`${API}/api/stats`);
  const stats = await res.json();

  const container = document.getElementById('statsContainer');
  container.innerHTML = '';

  stats.forEach(s => {
    container.innerHTML += `
      <div class="col-md-6">
        <div class="card stat-card">
          <div class="card-body">
            <h5 class="card-title">${s.bank_name} (${s.bank_code})</h5>
            <div class="row text-center mt-3">
              <div class="col">
                <div class="fs-3 fw-bold">${s.total || 0}</div>
                <small class="text-muted">ทั้งหมด</small>
              </div>
              <div class="col">
                <div class="fs-3 fw-bold text-success">${s.available || 0}</div>
                <small class="text-muted">พร้อมใช้</small>
              </div>
              <div class="col">
                <div class="fs-3 fw-bold text-primary">${s.issued || 0}</div>
                <small class="text-muted">เบิกจ่าย</small>
              </div>
              <div class="col">
                <div class="fs-3 fw-bold text-warning">${s.voided || 0}</div>
                <small class="text-muted">Void</small>
              </div>
              <div class="col">
                <div class="fs-3 fw-bold text-danger">${s.cancelled || 0}</div>
                <small class="text-muted">Cancel</small>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  });

  // Render charts
  renderCharts(stats);
}

async function renderCharts(stats) {
  // === Pie Chart: สัดส่วนสถานะรวม ===
  const totalAvailable = stats.reduce((s, b) => s + (b.available || 0), 0);
  const totalIssued = stats.reduce((s, b) => s + (b.issued || 0), 0);
  const totalVoided = stats.reduce((s, b) => s + (b.voided || 0), 0);
  const totalCancelled = stats.reduce((s, b) => s + (b.cancelled || 0), 0);

  if (chartStatus) chartStatus.destroy();
  const ctxStatus = document.getElementById('chartStatus').getContext('2d');
  chartStatus = new Chart(ctxStatus, {
    type: 'doughnut',
    data: {
      labels: ['พร้อมใช้', 'เบิกจ่ายแล้ว', 'Void', 'Cancel'],
      datasets: [{
        data: [totalAvailable, totalIssued, totalVoided, totalCancelled],
        backgroundColor: ['#43a047', '#1976d2', '#ef6c00', '#c62828'],
        borderWidth: 2,
        borderColor: '#fff'
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: 'bottom', labels: { font: { family: 'Prompt' } } }
      }
    }
  });

  // === Bar Chart: จำนวนเช็คแยกตามธนาคาร ===
  if (chartBank) chartBank.destroy();
  const ctxBank = document.getElementById('chartBank').getContext('2d');
  chartBank = new Chart(ctxBank, {
    type: 'bar',
    data: {
      labels: stats.map(s => s.bank_code),
      datasets: [
        { label: 'พร้อมใช้', data: stats.map(s => s.available || 0), backgroundColor: '#43a047' },
        { label: 'เบิกจ่าย', data: stats.map(s => s.issued || 0), backgroundColor: '#1976d2' },
        { label: 'Void', data: stats.map(s => s.voided || 0), backgroundColor: '#ef6c00' },
        { label: 'Cancel', data: stats.map(s => s.cancelled || 0), backgroundColor: '#c62828' }
      ]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: 'bottom', labels: { font: { family: 'Prompt' } } }
      },
      scales: {
        x: { stacked: true },
        y: { stacked: true, beginAtZero: true }
      }
    }
  });

  // === Line Chart: ยอดเบิกจ่ายรายเดือน ===
  try {
    const monthlyRes = await fetch(`${API}/api/stats/monthly`);
    const monthly = await monthlyRes.json();

    if (chartMonthly) chartMonthly.destroy();
    const ctxMonthly = document.getElementById('chartMonthly').getContext('2d');

    const monthLabels = monthly.map(m => m.month);
    const monthCounts = monthly.map(m => m.count);
    const monthAmounts = monthly.map(m => m.total_amount);

    chartMonthly = new Chart(ctxMonthly, {
      type: 'line',
      data: {
        labels: monthLabels.length > 0 ? monthLabels : ['ยังไม่มีข้อมูล'],
        datasets: [
          {
            label: 'จำนวนเช็ค (ใบ)',
            data: monthCounts.length > 0 ? monthCounts : [0],
            borderColor: '#2e7d32',
            backgroundColor: 'rgba(46,125,50,.1)',
            fill: true,
            tension: 0.3,
            yAxisID: 'y'
          },
          {
            label: 'ยอดเงิน (บาท)',
            data: monthAmounts.length > 0 ? monthAmounts : [0],
            borderColor: '#f9a825',
            backgroundColor: 'rgba(249,168,37,.1)',
            fill: true,
            tension: 0.3,
            yAxisID: 'y1'
          }
        ]
      },
      options: {
        responsive: true,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'bottom', labels: { font: { family: 'Prompt' } } }
        },
        scales: {
          y: { type: 'linear', position: 'left', beginAtZero: true, title: { display: true, text: 'จำนวน (ใบ)' } },
          y1: { type: 'linear', position: 'right', beginAtZero: true, title: { display: true, text: 'ยอดเงิน (บาท)' }, grid: { drawOnChartArea: false } }
        }
      }
    });
  } catch (e) {
    // no monthly data
  }
}

// ============ CHEQUES ============

async function loadCheques() {
  const bank_id = document.getElementById('filterBank').value;
  const status = document.getElementById('filterStatus').value;
  const search = document.getElementById('filterSearch').value;

  const params = new URLSearchParams();
  if (bank_id) params.set('bank_id', bank_id);
  if (status) params.set('status', status);
  if (search) params.set('search', search);

  const res = await fetch(`${API}/api/cheques?${params}`);
  const cheques = await res.json();

  const tbody = document.getElementById('chequesTable');
  tbody.innerHTML = '';

  if (cheques.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" class="text-center text-muted py-4">ไม่พบข้อมูล</td></tr>';
    return;
  }

  cheques.forEach(c => {
    tbody.innerHTML += `
      <tr>
        <td><span class="badge ${c.bank_code === 'BBL' ? 'btn-bbl' : 'btn-uob'}">${c.bank_code}</span></td>
        <td><small>${c.account_name || c.bank_name || '-'}</small></td>
        <td><strong>${c.cheque_number}</strong></td>
        <td>${c.book_number || '-'}</td>
        <td><span class="badge badge-${c.status}">${getStatusLabel(c.status)}</span></td>
        <td>${c.payee_name || '-'}</td>
        <td>${formatDate(c.registered_date)}</td>
        <td>${c.notes || '-'}</td>
        <td>
          <button class="btn btn-sm btn-outline-primary" onclick="viewChequeDetail(${c.id})" title="ดูรายละเอียด">
            <i class="bi bi-eye"></i>
          </button>
          <button class="btn btn-sm btn-outline-info" onclick="showEditChequeModal(${c.id}, '${c.cheque_number}', '${c.book_number || ''}', '${(c.notes || '').replace(/'/g, "\\'")}', ${c.bank_id})" title="แก้ไข">
            <i class="bi bi-pencil"></i>
          </button>
          <button class="btn btn-sm btn-outline-secondary" onclick="printSingleCheque(${c.id})" title="พิมพ์เช็ค">
            <i class="bi bi-printer"></i>
          </button>
          ${c.status === 'available' ? `
            <button class="btn btn-sm btn-outline-success" onclick="showIssueModal(${c.id}, '${c.cheque_number}')" title="เบิกจ่าย">
              <i class="bi bi-pencil-square"></i>
            </button>
            <button class="btn btn-sm btn-outline-danger" onclick="deleteCheque(${c.id})" title="ลบ">
              <i class="bi bi-trash"></i>
            </button>
          ` : `
            <button class="btn btn-sm btn-outline-warning" onclick="showIssueModal(${c.id}, '${c.cheque_number}')" title="เปลี่ยนสถานะ">
              <i class="bi bi-arrow-repeat"></i>
            </button>
          `}
        </td>
      </tr>
    `;
  });
}

function showAddChequeModal() {
  document.getElementById('addChequeNo').value = '';
  document.getElementById('addBookNo').value = '';
  document.getElementById('addNotes').value = '';
  new bootstrap.Modal(document.getElementById('addChequeModal')).show();
}

async function addCheque() {
  const data = {
    bank_id: document.getElementById('addBank').value,
    cheque_number: document.getElementById('addChequeNo').value,
    book_number: document.getElementById('addBookNo').value,
    payee_name: document.getElementById('addPayeeName').value,
    notes: document.getElementById('addNotes').value
  };

  const res = await fetch(`${API}/api/cheques`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  const result = await res.json();

  if (res.ok) {
    alert(result.message);
    bootstrap.Modal.getInstance(document.getElementById('addChequeModal')).hide();
    loadCheques();
  } else {
    alert(result.error);
  }
}

function showBulkAddModal() {
  document.getElementById('bulkBookNo').value = '';
  document.getElementById('bulkStart').value = '';
  document.getElementById('bulkCount').value = '50';
  document.getElementById('bulkNotes').value = '';
  new bootstrap.Modal(document.getElementById('bulkAddModal')).show();
}

async function bulkAddCheques() {
  const data = {
    bank_id: document.getElementById('bulkBank').value,
    book_number: document.getElementById('bulkBookNo').value,
    start_number: document.getElementById('bulkStart').value,
    count: parseInt(document.getElementById('bulkCount').value) || 50,
    payee_name: document.getElementById('bulkPayeeName').value,
    notes: document.getElementById('bulkNotes').value
  };

  if (!data.bank_id || !data.start_number) {
    alert('กรุณาระบุธนาคารและเลขที่เช็คใบแรก');
    return;
  }

  const res = await fetch(`${API}/api/cheques/bulk`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  const result = await res.json();

  if (res.ok) {
    alert(result.message);
    bootstrap.Modal.getInstance(document.getElementById('bulkAddModal')).hide();
    loadCheques();
  } else {
    alert(result.error);
  }
}

async function deleteCheque(id) {
  if (!confirm('ต้องการลบเช็คนี้?')) return;

  const res = await fetch(`${API}/api/cheques/${id}`, { method: 'DELETE' });
  const result = await res.json();

  if (res.ok) {
    loadCheques();
  } else {
    alert(result.error);
  }
}

// ============ ISSUE / TRANSACTIONS ============

function showIssueModal(id, chequeNo) {
  document.getElementById('issueChequeId').value = id;
  document.getElementById('issueChequeNo').value = chequeNo;
  document.getElementById('issuePayee').value = 'บริษัท ซีเรียล แฟคตอริ่ง (ประเทศไทย) จำกัด';
  document.getElementById('issueAmount').value = '';
  document.getElementById('issueDate').value = new Date().toISOString().split('T')[0];
  document.getElementById('issueDesc').value = '';
  document.getElementById('issueCreatedBy').value = '';
  new bootstrap.Modal(document.getElementById('issueChequeModal')).show();
}

async function issueCheque() {
  const data = {
    cheque_id: parseInt(document.getElementById('issueChequeId').value),
    transaction_type: document.getElementById('issueType').value,
    payee_name: document.getElementById('issuePayee').value,
    amount: parseFloat(document.getElementById('issueAmount').value) || null,
    transaction_date: document.getElementById('issueDate').value,
    description: document.getElementById('issueDesc').value,
    created_by: document.getElementById('issueCreatedBy').value
  };

  const res = await fetch(`${API}/api/transactions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  const result = await res.json();

  if (res.ok) {
    alert(result.message);
    bootstrap.Modal.getInstance(document.getElementById('issueChequeModal')).hide();
    loadCheques();
  } else {
    alert(result.error);
  }
}

async function loadTransactions() {
  const bank_id = document.getElementById('txFilterBank').value;
  const from_date = document.getElementById('txFromDate').value;
  const to_date = document.getElementById('txToDate').value;

  const params = new URLSearchParams();
  if (bank_id) params.set('bank_id', bank_id);
  if (from_date) params.set('from_date', from_date);
  if (to_date) params.set('to_date', to_date);

  const res = await fetch(`${API}/api/transactions?${params}`);
  const txs = await res.json();

  const tbody = document.getElementById('transactionsTable');
  tbody.innerHTML = '';

  if (txs.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" class="text-center text-muted py-4">ไม่พบข้อมูล</td></tr>';
    return;
  }

  txs.forEach(t => {
    tbody.innerHTML += `
      <tr>
        <td>${formatDate(t.transaction_date)}</td>
        <td><span class="badge ${t.bank_code === 'BBL' ? 'btn-bbl' : 'btn-uob'}">${t.bank_code}</span></td>
        <td><small>${t.account_name || t.bank_name || '-'}</small></td>
        <td><strong>${t.cheque_number}</strong></td>
        <td><span class="badge badge-${t.transaction_type}">${getTypeLabel(t.transaction_type)}</span></td>
        <td>${t.payee_name || '-'}</td>
        <td class="text-end">${t.amount ? formatMoney(t.amount) : '-'}</td>
        <td>${t.description || '-'}</td>
        <td>${t.created_by || '-'}</td>
      </tr>
    `;
  });
}

// ============ CHEQUE DETAIL ============

async function viewChequeDetail(id) {
  currentChequeDetailId = id;
  const res = await fetch(`${API}/api/cheques/${id}`);
  const data = await res.json();

  const body = document.getElementById('chequeDetailBody');
  body.innerHTML = `
    <div class="row mb-3">
      <div class="col-md-6">
        <table class="table table-sm">
          <tr><th>ธนาคาร</th><td>${data.bank_name} (${data.bank_code})</td></tr>
          <tr><th>สาขา</th><td>${data.branch_name || '-'}</td></tr>
          <tr><th>เลขที่บัญชี</th><td>${data.account_number || '-'}</td></tr>
          <tr><th>เลขที่เช็ค</th><td><strong>${data.cheque_number}</strong></td></tr>
          <tr><th>เล่มที่</th><td>${data.book_number || '-'}</td></tr>
        </table>
      </div>
      <div class="col-md-6">
        <table class="table table-sm">
          <tr><th>สถานะ</th><td><span class="badge badge-${data.status}">${getStatusLabel(data.status)}</span></td></tr>
          <tr><th>วันที่ลงทะเบียน</th><td>${formatDate(data.registered_date)}</td></tr>
          <tr><th>อัพเดทล่าสุด</th><td>${formatDate(data.updated_at)}</td></tr>
          <tr><th>หมายเหตุ</th><td>${data.notes || '-'}</td></tr>
        </table>
      </div>
    </div>

    <h6><i class="bi bi-clock-history"></i> ประวัติรายการ</h6>
    <table class="table table-sm table-striped">
      <thead>
        <tr><th>วันที่</th><th>ประเภท</th><th>ผู้รับเงิน</th><th>จำนวนเงิน</th><th>รายละเอียด</th><th>ผู้ทำรายการ</th></tr>
      </thead>
      <tbody>
        ${data.transactions && data.transactions.length > 0
          ? data.transactions.map(t => `
            <tr>
              <td>${formatDate(t.transaction_date)}</td>
              <td><span class="badge badge-${t.transaction_type}">${getTypeLabel(t.transaction_type)}</span></td>
              <td>${t.payee_name || '-'}</td>
              <td class="text-end">${t.amount ? formatMoney(t.amount) : '-'}</td>
              <td>${t.description || '-'}</td>
              <td>${t.created_by || '-'}</td>
            </tr>
          `).join('')
          : '<tr><td colspan="6" class="text-center text-muted">ยังไม่มีรายการ</td></tr>'
        }
      </tbody>
    </table>
  `;

  new bootstrap.Modal(document.getElementById('chequeDetailModal')).show();
}

// ============ UTILITIES ============

function getStatusLabel(status) {
  const map = {
    available: 'พร้อมใช้',
    issued: 'เบิกจ่ายแล้ว',
    voided: 'Void',
    cancelled: 'Cancel'
  };
  return map[status] || status;
}

function getTypeLabel(type) {
  const map = {
    issued: 'เบิกจ่าย',
    voided: 'Void',
    cancelled: 'Cancel',
    returned: 'คืนเช็ค'
  };
  return map[type] || type;
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatMoney(amount) {
  return new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
}

// ============ PRINT - DOT MATRIX (Epson LQ-310) ============

// Text formatting helpers for fixed-width printing
function padRight(str, len) {
  str = String(str || '');
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

// Open print window with plain text content optimized for dot matrix
function openPrintWindow(textContent, title, orientation) {
  const orient = orientation || 'portrait';
  const printWin = window.open('', '_blank', 'width=800,height=600');
  printWin.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>${title}</title>
      <style>
        @page {
          size: ${orient};
          margin: 10mm 5mm;
        }
        * { margin: 0; padding: 0; }
        body {
          font-family: 'Angsana New', 'AngsanaUPC', serif;
          font-size: 16pt;
          line-height: 1.4;
          white-space: pre;
          margin: 0;
          padding: 10px;
        }
        @media print {
          body { margin: 0; padding: 0; }
          @page { margin: 10mm 5mm; }
        }
      </style>
    </head>
    <body>${textContent}</body>
    <script>
      window.onload = function() {
        window.print();
      };
    </` + `script>
    </html>
  `);
  printWin.document.close();
}

// Open print window for pay-in form overlay printing (dot matrix on pre-printed form)
// LQ-310: ใส่กระดาษด้านกว้าง (173mm) ลง, พิมพ์จากซ้ายไปขวาตามแนว 173mm
// Driver: Width=173mm, Height=87mm, Portrait
function openPayinPrintWindow(positions, title, config) {
  const printWin = window.open('', '_blank', 'width=800,height=600');
  
  const paperWidth = parseFloat(config.pageWidth) || 173;  // mm กว้างจริงของฟอร์ม
  const paperHeight = parseFloat(config.pageHeight) || 87; // mm สูงจริงของฟอร์ม

  // ไม่สลับ ไม่หมุน — ใช้ตรงๆ
  // left = ซ้ายไปขวา (0 → 173mm)
  // top = บนลงล่าง (0 → 87mm)
  let elementsHtml = '';
  positions.forEach(p => {
    let extraStyle = '';
    if (p.letterSpacing) {
      extraStyle = `letter-spacing:${p.letterSpacing}mm;`;
    }
    const fontFamily = config.fontFamily || "'Angsana New','AngsanaUPC',serif";
    const fontSize = config.fontSize || '16pt';
    
    const style = `position:absolute; top:${p.top}mm; left:${p.left}mm; font-family:${fontFamily}; font-size:${p.fontSize || fontSize}; white-space:pre; ${extraStyle}`;
    elementsHtml += `<div style="${style}">${p.text}</div>\n`;
  });

  // @page size: กว้าง x สูง (173 x 87) ตรงตามที่ใส่กระดาษ
  printWin.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>${title}</title>
      <style>
        @page {
          size: ${paperWidth}mm ${paperHeight}mm;
          margin: 0;
        }
        * { margin: 0; padding: 0; }
        html, body {
          font-family: 'Angsana New', 'AngsanaUPC', serif;
          margin: 0;
          padding: 0;
          position: relative;
          width: ${paperWidth}mm;
          height: ${paperHeight}mm;
          overflow: visible;
          -webkit-print-color-adjust: exact;
        }
        @media print {
          html, body { margin: 0; padding: 0; }
          @page { size: ${paperWidth}mm ${paperHeight}mm; margin: 0; }
        }
      </style>
    </head>
    <body>
      ${elementsHtml}
    </body>
    <script>
      window.onload = function() {
        window.print();
      };
    </` + `script>
    </html>
  `);
  printWin.document.close();
}

async function printCheques() {
  const bank_id = document.getElementById('filterBank').value;
  const status = document.getElementById('filterStatus').value;

  const params = new URLSearchParams();
  if (bank_id) params.set('bank_id', bank_id);
  if (status) params.set('status', status);

  const res = await fetch(`${API}/api/print/cheques?${params}`);
  const text = await res.text();
  openPrintWindow(text, 'รายงาน Stock Cheque');
}

async function printTransactions() {
  const bank_id = document.getElementById('txFilterBank').value;
  const from_date = document.getElementById('txFromDate').value;
  const to_date = document.getElementById('txToDate').value;

  const params = new URLSearchParams();
  if (bank_id) params.set('bank_id', bank_id);
  if (from_date) params.set('from_date', from_date);
  if (to_date) params.set('to_date', to_date);

  const res = await fetch(`${API}/api/print/transactions?${params}`);
  const text = await res.text();
  openPrintWindow(text, 'รายงานประวัติเบิกจ่าย');
}

let currentChequeDetailId = null;

async function printChequeDetail() {
  if (!currentChequeDetailId) return;
  const res = await fetch(`${API}/api/print/cheque/${currentChequeDetailId}`);
  const text = await res.text();
  openPrintWindow(text, 'รายละเอียดเช็ค');
}

// พิมพ์เช็คทีละรายการ จากปุ่มในตาราง - เปิด modal ให้เลือกฟอร์ม
async function printSingleCheque(chequeId) {
  // ดึงข้อมูลเช็คมาเติมในฟอร์ม
  const res = await fetch(`${API}/api/cheques/${chequeId}`);
  const data = await res.json();

  // Set form values
  document.getElementById('printChqDate').value = new Date().toISOString().split('T')[0];
  document.getElementById('printChqPayee').value = data.transactions && data.transactions.length > 0 ? (data.transactions[0].payee_name || 'บริษัท ซีเรียล แฟคตอริ่ง (ประเทศไทย) จำกัด') : 'บริษัท ซีเรียล แฟคตอริ่ง (ประเทศไทย) จำกัด';
  const amt = data.transactions && data.transactions.length > 0 ? (data.transactions[0].amount || 0) : 0;
  document.getElementById('printChqAmount').value = amt || '';
  document.getElementById('printChqNo').value = data.cheque_number || '';
  document.getElementById('printChqBranch').value = data.branch_name || '';
  document.getElementById('printChqAccountNo').value = data.account_number || '';
  document.getElementById('printChqFromBank').value = '';
  document.getElementById('printChqDepositor').value = '';
  updateChqAmountText();

  // Auto-select form type based on bank
  const formType = document.getElementById('printFormType');
  if (data.bank_code === 'BBL') {
    formType.value = 'BBL_CHQ';
  } else if (data.bank_code === 'UOB') {
    formType.value = 'UOB_CHQ';
  }
  onPrintFormTypeChange();

  new bootstrap.Modal(document.getElementById('printChequeFormModal')).show();
}

function updateChqAmountText() {
  const amt = parseFloat(document.getElementById('printChqAmount').value) || 0;
  const text = amt > 0 ? '***' + numberToThaiText(amt) + '***' : '';
  document.getElementById('printChqAmountText').value = text;
}

function onPrintFormTypeChange() {
  const formType = document.getElementById('printFormType').value;
  const svFields = document.getElementById('printSvFields');
  // ซ่อนช่องที่ไม่เกี่ยวข้องเมื่อพิมพ์เช็ค (เลขที่เช็คไม่ต้องพิมพ์เพราะเช็คมีเลขอยู่แล้ว)
  if (formType === 'BBL_CHQ' || formType === 'UOB_CHQ') {
    svFields.style.display = 'none';
  } else {
    svFields.style.display = 'block';
  }
}

// ============ CHEQUE / PAY-IN FORM POSITION CONFIGS ============
// ตำแหน่ง (top mm, left mm) ตรงตามช่องฟอร์มจริงที่ใช้กับเครื่อง dot matrix
// อ้างอิงจาก layout Excel ที่ใช้งานจริง

// === BBL-CHQ (เช็คธนาคารกรุงเทพ/กรุงศรี) ===
// Layout จาก Excel: อ้างอิงตำแหน่ง dot matrix 1/6 inch per row ≈ 4.23mm
const CHQ_FORM_CONFIGS = {
  // === BBL-CHQ (เช็คธนาคารกรุงเทพ/กรุงศรี) ===
  // Excel BBL-BAY-CHQ: row1=date(col4), row2=payee(col2), row3=amountText(col3), row4=amountNum(col4)
  BBL_CHQ: {
    name: 'เช็ค ธ.กรุงเทพ (BBL-BAY-CHQ)',
    pageWidth: '173mm',
    pageHeight: '87mm',
    fontSize: '16pt',
    offsetTop: 0,
    offsetLeft: 0,
    fields: {
      date:       { top: 5, left: 110 },       // วันที่ มุมขวาบน
      payee:      { top: 20, left: 20 },       // ชื่อผู้รับเงิน
      amountText: { top: 30, left: 20 },       // จำนวนเงินตัวอักษร
      amountNum:  { top: 30, left: 110 },      // จำนวนเงินตัวเลข
    }
  },

  // === UOB-CHQ (เช็คธนาคาร UOB) ===
  // Excel UOB-CHQ: row1=date(col4), row3=payee(col3), row5=amountText(col3), row7=amountNum(col4)
  // UOB เว้นบรรทัดทุก field (double-spaced)
  UOB_CHQ: {
    name: 'เช็ค ธ.ยูโอบี (UOB-CHQ)',
    pageWidth: '173mm',
    pageHeight: '83mm',
    fontSize: '16pt',
    offsetTop: 0,
    offsetLeft: 0,
    // จากรูปเช็ค UOB จริง:
    // วันที่: มุมขวาบน ในกรอบ (DD MM YYYY แยกช่อง)
    // Pay to: 2 บรรทัด (ชื่อผู้รับเงิน)
    // The sum of: จำนวนเงินตัวอักษร (ซ้าย) + ตัวเลข (ขวา)
    fields: {
      date:       { top: 5, left: 110 },       // วันที่ มุมขวาบน
      payee:      { top: 20, left: 20 },       // Pay to: ชื่อผู้รับเงิน
      amountText: { top: 30, left: 20 },       // The sum of: จำนวนเงินตัวอักษร
      amountNum:  { top: 30, left: 110 },      // ฿ จำนวนเงินตัวเลข (ขวา ด้านล่าง)
    }
  },

  // === BBL-SV (ใบนำฝาก ธ.กรุงเทพ - Pay-in Slip) ===
  // Layout จาก Excel BBL-SV#988 (กระดาษต่อเนื่อง ขนาดประมาณ 210x140mm):
  // แต่ละ row ใน Excel ≈ 4.23mm (1/6 inch) สำหรับ dot matrix
  // row3(line3): date อยู่ col3-4 (กลางหน้า), โทร. อยู่ col6 (ขวาสุด)
  // row4(line4): ชื่อบัญชี col3, สาขา col5, เลขที่บัญชี col6
  // row5(line5): (checkbox ประเภทบัญชี)
  // row6(line6): เลขที่เช็ค col2, ธนาคาร/สาขาเช็ค col4, วันที่เช็ค col5, จำนวนเงิน col6
  // row7-10: บรรทัดเช็คเพิ่มเติม (ถ้ามี)
  // row12: จำนวนเงินตัวอักษร col2, ยอดรวม col6
  BBL_SV: {
    name: 'ใบนำฝาก ธ.กรุงเทพ (BBL-SV)',
    pageWidth: '210mm',
    pageHeight: '140mm',
    fontSize: '16pt',
    offsetTop: 0,
    offsetLeft: 0,
    // 1 row ≈ 4.23mm (1/6 inch dot matrix), col1≈0mm, col2≈20mm, col3≈55mm, col4≈90mm, col5≈125mm, col6≈155mm
    fields: {
      date:        { top: 8.5, left: 90 },     // row3, col3-4: วันที่ (09/06/2026)
      phone:       { top: 8.5, left: 155 },    // row3, col6: โทร. 02-5761181
      payee:       { top: 12.7, left: 55 },    // row4, col3: ชื่อบัญชี
      branch:      { top: 12.7, left: 125 },   // row4, col5: สาขา (ปตท.ถนนรามอินทรา)
      accountNo:   { top: 12.7, left: 155 },   // row4, col6: เลขที่บัญชี (024-7-090988)
      // row6: รายการเช็ค บรรทัดที่ 1
      chequeNo:    { top: 21.2, left: 20 },    // row6, col2: เลขที่เช็ค (01546425)
      chequeBank:  { top: 21.2, left: 90 },    // row6, col4: ธนาคาร/สาขาเช็ค
      chequeDate:  { top: 21.2, left: 125 },   // row6, col5: วันที่เช็ค
      chequeAmt:   { top: 21.2, left: 155 },   // row6, col6: จำนวนเงินเช็ค
      // รายการเช็คเพิ่มเติม (row7,8,9,10)
      chequeRowHeight: 4.23,                    // mm ต่อบรรทัด
      maxChequeRows: 4,
      // ยอดรวม (row12 โดยประมาณ)
      amountText:  { top: 46.5, left: 20 },    // จำนวนเงินตัวอักษร (***สองแสน...***) 
      totalAmount: { top: 46.5, left: 155 },   // จำนวนเงินรวม
      // ผู้นำฝาก (row5 area)
      depositor:   { top: 16.9, left: 10 },    // row5: ผู้นำฝาก
    }
  },

  // === KTB-SV (ใบนำฝาก ธ.กรุงไทย) ===
  // Layout จาก Excel KTB-SV (2):
  // row3(blank), row4(blank)
  // row5: ชื่อบัญชี(col2), เลขที่บัญชี(col5), สาขา(col6) "สาขาแจ้งวัฒนะ"
  // row6(blank), row7(blank)
  // row8: ผู้นำฝาก/เบอร์โทร(col2), จำนวนเงิน(col5)
  KTB_SV: {
    name: 'ใบนำฝาก ธ.กรุงไทย (KTB-SV)',
    pageWidth: '210mm',
    pageHeight: '140mm',
    fontSize: '16pt',
    offsetTop: 0,
    offsetLeft: 0,
    fields: {
      payee:       { top: 16.9, left: 20 },    // row5, col2: ชื่อบัญชี
      accountNo:   { top: 16.9, left: 125 },   // row5, col5: เลขที่บัญชี (017-0-57230-7)
      branch:      { top: 16.9, left: 160 },   // row5, col6: สาขา
      depositor:   { top: 29.6, left: 20 },    // row8, col2: ผู้นำฝาก/เบอร์โทร
      totalAmount: { top: 29.6, left: 125 },   // row8, col5: จำนวนเงิน (250,514.29)
    }
  }
};

function generateChequeFormPositions(formType) {
  const config = CHQ_FORM_CONFIGS[formType];
  if (!config) return [];

  const f = config.fields;
  const offsetTop = config.offsetTop + (parseFloat(document.getElementById('printChqOffsetTop').value) || 0);
  const offsetLeft = config.offsetLeft + (parseFloat(document.getElementById('printChqOffsetLeft').value) || 0);
  const fo = getFieldOffsets(formType); // per-field offsets

  const date = document.getElementById('printChqDate').value;
  const payee = document.getElementById('printChqPayee').value;
  const amount = parseFloat(document.getElementById('printChqAmount').value) || 0;
  const amountText = document.getElementById('printChqAmountText').value;
  const chequeNo = document.getElementById('printChqNo').value;
  const branch = document.getElementById('printChqBranch').value;
  const accountNo = document.getElementById('printChqAccountNo').value;
  const fromBank = document.getElementById('printChqFromBank').value;
  const depositor = document.getElementById('printChqDepositor').value;

  // Format date as DD/MM/YYYY (พ.ศ.)
  let dateStr = '';
  const dateVal = date || new Date().toISOString().split('T')[0];
  if (dateVal) {
    const d = new Date(dateVal);
    dateStr = `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear() + 543}`;
  }

  const positions = [];

  // Helper: สร้าง position object พร้อม letterSpacing (ถ้ามี)
  function pushPos(fieldName, top, left, text) {
    const pos = { top, left, text };
    const spacing = fo[fieldName + '_spacing'] || 0;
    if (spacing > 0) pos.letterSpacing = spacing;
    positions.push(pos);
  }

  // === เช็ค BBL / UOB ===
  if (formType === 'BBL_CHQ' || formType === 'UOB_CHQ') {
    if (f.date && dateStr) {
      // วันที่ในเช็ค: 8 ช่อง รวม 50mm (ช่องละ 6.25mm) แนวนอน
      const dateDigits = dateStr.replace(/\//g, ''); // "15062569" (8 ตัว)
      const totalWidth = 50;
      const charWidth = totalWidth / 8; // 6.25mm
      const dateTop = f.date.top + offsetTop + (fo.date_top||0);
      const dateLeft = f.date.left + offsetLeft + (fo.date_left||0);
      for (let i = 0; i < dateDigits.length && i < 8; i++) {
        const centerOffset = (charWidth / 2) - 1.5;
        positions.push({ top: dateTop, left: dateLeft + (i * charWidth) + centerOffset, text: dateDigits[i] });
      }
    }
    if (f.payee && payee) {
      pushPos('payee', f.payee.top + offsetTop + (fo.payee_top||0), f.payee.left + offsetLeft + (fo.payee_left||0), payee);
    }
    if (f.amountText && amountText) {
      pushPos('amountText', f.amountText.top + offsetTop + (fo.amountText_top||0), f.amountText.left + offsetLeft + (fo.amountText_left||0), amountText);
    }
    if (f.amountNum) {
      pushPos('amountNum', f.amountNum.top + offsetTop + (fo.amountNum_top||0), f.amountNum.left + offsetLeft + (fo.amountNum_left||0), fmtMoney(amount));
    }
  }

  // === ใบนำฝาก BBL-SV ===
  if (formType === 'BBL_SV') {
    if (f.date && dateStr) {
      pushPos('date', f.date.top + offsetTop + (fo.date_top||0), f.date.left + offsetLeft + (fo.date_left||0), dateStr);
    }
    if (f.phone && depositor) {
      const parts = depositor.split('/');
      const phone = parts.length > 1 ? 'โทร. ' + parts.slice(1).join('/') : '';
      pushPos('phone', f.phone.top + offsetTop + (fo.phone_top||0), f.phone.left + offsetLeft + (fo.phone_left||0), phone);
    }
    if (f.payee && payee) {
      pushPos('payee', f.payee.top + offsetTop + (fo.payee_top||0), f.payee.left + offsetLeft + (fo.payee_left||0), payee);
    }
    if (f.branch && branch) {
      pushPos('branch', f.branch.top + offsetTop + (fo.branch_top||0), f.branch.left + offsetLeft + (fo.branch_left||0), branch);
    }
    if (f.accountNo && accountNo) {
      pushPos('accountNo', f.accountNo.top + offsetTop + (fo.accountNo_top||0), f.accountNo.left + offsetLeft + (fo.accountNo_left||0), accountNo);
    }
    if (f.depositor && depositor) {
      const parts = depositor.split('/');
      pushPos('depositor', f.depositor.top + offsetTop + (fo.depositor_top||0), f.depositor.left + offsetLeft + (fo.depositor_left||0), parts[0]);
    }
    if (f.chequeNo && chequeNo) {
      pushPos('chequeNo', f.chequeNo.top + offsetTop + (fo.chequeNo_top||0), f.chequeNo.left + offsetLeft + (fo.chequeNo_left||0), chequeNo);
    }
    if (f.chequeBank && fromBank) {
      pushPos('chequeBank', f.chequeBank.top + offsetTop + (fo.chequeBank_top||0), f.chequeBank.left + offsetLeft + (fo.chequeBank_left||0), fromBank);
    }
    if (f.chequeDate && dateStr) {
      pushPos('chequeDate', f.chequeDate.top + offsetTop + (fo.chequeDate_top||0), f.chequeDate.left + offsetLeft + (fo.chequeDate_left||0), dateStr);
    }
    if (f.chequeAmt && amount > 0) {
      pushPos('chequeAmt', f.chequeAmt.top + offsetTop + (fo.chequeAmt_top||0), f.chequeAmt.left + offsetLeft + (fo.chequeAmt_left||0), fmtMoney(amount));
    }
    if (f.amountText && amountText) {
      pushPos('amountText', f.amountText.top + offsetTop + (fo.amountText_top||0), f.amountText.left + offsetLeft + (fo.amountText_left||0), amountText);
    }
    if (f.totalAmount && amount > 0) {
      pushPos('totalAmount', f.totalAmount.top + offsetTop + (fo.totalAmount_top||0), f.totalAmount.left + offsetLeft + (fo.totalAmount_left||0), fmtMoney(amount));
    }
  }

  // === ใบนำฝาก KTB-SV ===
  if (formType === 'KTB_SV') {
    if (f.payee && payee) {
      pushPos('payee', f.payee.top + offsetTop + (fo.payee_top||0), f.payee.left + offsetLeft + (fo.payee_left||0), payee);
    }
    if (f.accountNo && accountNo) {
      pushPos('accountNo', f.accountNo.top + offsetTop + (fo.accountNo_top||0), f.accountNo.left + offsetLeft + (fo.accountNo_left||0), accountNo);
    }
    if (f.branch && branch) {
      pushPos('branch', f.branch.top + offsetTop + (fo.branch_top||0), f.branch.left + offsetLeft + (fo.branch_left||0), 'สาขา' + branch);
    }
    if (f.depositor && depositor) {
      pushPos('depositor', f.depositor.top + offsetTop + (fo.depositor_top||0), f.depositor.left + offsetLeft + (fo.depositor_left||0), depositor);
    }
    if (f.totalAmount && amount > 0) {
      pushPos('totalAmount', f.totalAmount.top + offsetTop + (fo.totalAmount_top||0), f.totalAmount.left + offsetLeft + (fo.totalAmount_left||0), fmtMoney(amount));
    }
  }

  return positions;
}

function executePrintChequeForm() {
  const formType = document.getElementById('printFormType').value;
  const config = CHQ_FORM_CONFIGS[formType];
  if (!config) { alert('กรุณาเลือกประเภทฟอร์ม'); return; }

  const offsetTop = parseFloat(document.getElementById('printChqOffsetTop').value) || 0;
  const offsetLeft = parseFloat(document.getElementById('printChqOffsetLeft').value) || 0;
  const pageWidth = document.getElementById('printChqPageWidth').value + 'mm';
  const pageHeight = document.getElementById('printChqPageHeight').value + 'mm';
  const fontName = document.getElementById('printChqFont').value;
  const fontSize = document.getElementById('printChqFontSize').value + 'pt';

  const printConfig = {
    ...config,
    offsetTop: config.offsetTop + offsetTop,
    offsetLeft: config.offsetLeft + offsetLeft,
    pageWidth: pageWidth,
    pageHeight: pageHeight,
    fontFamily: `'${fontName}', serif`,
    fontSize: fontSize
  };

  const positions = generateChequeFormPositions(formType);
  openPayinPrintWindow(positions, config.name, printConfig);
}

function previewChequePrint() {
  const formType = document.getElementById('printFormType').value;
  const config = CHQ_FORM_CONFIGS[formType];
  if (!config) { alert('กรุณาเลือกประเภทฟอร์ม'); return; }

  const positions = generateChequeFormPositions(formType);

  const printWin = window.open('', '_blank', 'width=900,height=700');
  
  let elementsHtml = '';
  positions.forEach(p => {
    const style = `position:absolute; top:${p.top}mm; left:${p.left}mm; font-size:${config.fontSize}; white-space:pre; color:red; border-bottom:1px dotted red;`;
    elementsHtml += `<div style="${style}" title="top:${p.top}mm left:${p.left}mm">${p.text}</div>\n`;
  });

  printWin.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>ตำแหน่ง - ${config.name}</title>
      <style>
        body {
          font-family: 'Angsana New', 'AngsanaUPC', serif;
          margin: 20px;
          padding: 0;
          position: relative;
          width: ${config.pageWidth};
          height: ${config.pageHeight};
          border: 2px solid #333;
          background: repeating-linear-gradient(
            transparent, transparent 4.9mm, #eef 5mm
          ), repeating-linear-gradient(
            90deg, transparent, transparent 9.9mm, #efe 10mm
          );
        }
        .info {
          position: fixed; bottom: 10px; right: 10px; background: #fff; padding: 10px;
          border: 1px solid #ccc; font-size: 11px; font-family: sans-serif; z-index: 999;
        }
      </style>
    </head>
    <body>
      ${elementsHtml}
      <div class="info">
        <strong>${config.name}</strong> (${config.pageWidth} x ${config.pageHeight})<br>
        สีแดง = ตำแหน่งพิมพ์ | Hover ดูค่า top/left
      </div>
    </body>
    </html>
  `);
  printWin.document.close();
}

// ============ EXPORT EXCEL (SheetJS) ============

async function exportChequesExcel() {
  const bank_id = document.getElementById('filterBank').value;
  const status = document.getElementById('filterStatus').value;

  const params = new URLSearchParams();
  if (bank_id) params.set('bank_id', bank_id);
  if (status) params.set('status', status);

  const res = await fetch(`${API}/api/export/cheques?${params}`);
  const data = await res.json();

  // Map to Thai column headers
  const rows = data.map(c => ({
    'ธนาคาร': c.bank_code,
    'ชื่อธนาคาร': c.bank_name,
    'เลขที่เช็ค': c.cheque_number,
    'เล่มที่': c.book_number || '',
    'สถานะ': getStatusLabel(c.status),
    'วันที่ลงทะเบียน': c.registered_date || '',
    'อัพเดทล่าสุด': c.updated_at || '',
    'หมายเหตุ': c.notes || ''
  }));

  const ws = XLSX.utils.json_to_sheet(rows);

  // Set column widths
  ws['!cols'] = [
    { wch: 8 }, { wch: 18 }, { wch: 12 }, { wch: 8 },
    { wch: 14 }, { wch: 20 }, { wch: 20 }, { wch: 25 }
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Stock Cheque');
  XLSX.writeFile(wb, `stock_cheque_${formatFileDate()}.xlsx`);
}

async function exportTransactionsExcel() {
  const bank_id = document.getElementById('txFilterBank').value;
  const from_date = document.getElementById('txFromDate').value;
  const to_date = document.getElementById('txToDate').value;

  const params = new URLSearchParams();
  if (bank_id) params.set('bank_id', bank_id);
  if (from_date) params.set('from_date', from_date);
  if (to_date) params.set('to_date', to_date);

  const res = await fetch(`${API}/api/export/transactions?${params}`);
  const data = await res.json();

  const rows = data.map(t => ({
    'วันที่': t.transaction_date || '',
    'ธนาคาร': t.bank_code,
    'ชื่อธนาคาร': t.bank_name,
    'เลขที่เช็ค': t.cheque_number,
    'ประเภท': getTypeLabel(t.transaction_type),
    'ผู้รับเงิน': t.payee_name || '',
    'จำนวนเงิน': t.amount || '',
    'รายละเอียด': t.description || '',
    'ผู้ทำรายการ': t.created_by || '',
    'วันที่บันทึก': t.created_at || ''
  }));

  const ws = XLSX.utils.json_to_sheet(rows);

  ws['!cols'] = [
    { wch: 12 }, { wch: 8 }, { wch: 18 }, { wch: 12 },
    { wch: 12 }, { wch: 22 }, { wch: 14 }, { wch: 25 },
    { wch: 12 }, { wch: 20 }
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'ประวัติเบิกจ่าย');
  XLSX.writeFile(wb, `cheque_transactions_${formatFileDate()}.xlsx`);
}

function formatFileDate() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
}

// ============ PAY-IN SLIP ============

function onPayinBankChange() {
  const bank = document.getElementById('payinBank').value;
  // BBL has account type, UOB typically doesn't show it prominently
  document.getElementById('payinAccountTypeGroup').style.display = bank === 'BBL' ? 'block' : 'block';
}

function addPayinChequeRow() {
  const container = document.getElementById('payinChequeItems');
  const row = document.createElement('div');
  row.className = 'row g-2 mb-2 payin-cheque-row';
  row.innerHTML = `
    <div class="col-3">
      <input type="text" class="form-control form-control-sm" placeholder="ธนาคาร" data-field="chqBank">
    </div>
    <div class="col-3">
      <input type="text" class="form-control form-control-sm" placeholder="สาขา" data-field="chqBranch">
    </div>
    <div class="col-3">
      <input type="text" class="form-control form-control-sm" placeholder="เลขที่เช็ค" data-field="chqNo">
    </div>
    <div class="col-2">
      <input type="number" class="form-control form-control-sm" placeholder="จำนวนเงิน" step="0.01" data-field="chqAmount">
    </div>
    <div class="col-1">
      <button class="btn btn-sm btn-outline-danger" onclick="this.closest('.payin-cheque-row').remove()">
        <i class="bi bi-x"></i>
      </button>
    </div>
  `;
  container.appendChild(row);
}

function getPayinData() {
  const bank = document.getElementById('payinBank').value;
  const branch = document.getElementById('payinBranch').value;
  const date = document.getElementById('payinDate').value;
  const accountName = document.getElementById('payinAccountName').value;
  const accountNo = document.getElementById('payinAccountNo').value;
  const accountType = document.getElementById('payinAccountType').value;
  const cash = parseFloat(document.getElementById('payinCash').value) || 0;
  const depositor = document.getElementById('payinDepositor').value;
  const phone = document.getElementById('payinPhone').value;

  // Get cheque items
  const chequeRows = document.querySelectorAll('.payin-cheque-row');
  const cheques = [];
  chequeRows.forEach(row => {
    const chqBank = row.querySelector('[data-field="chqBank"]').value;
    const chqBranch = row.querySelector('[data-field="chqBranch"]').value;
    const chqNo = row.querySelector('[data-field="chqNo"]').value;
    const chqAmount = parseFloat(row.querySelector('[data-field="chqAmount"]').value) || 0;
    if (chqNo || chqAmount > 0) {
      cheques.push({ bank: chqBank, branch: chqBranch, no: chqNo, amount: chqAmount });
    }
  });

  const totalCheque = cheques.reduce((sum, c) => sum + c.amount, 0);
  const totalAmount = cash + totalCheque;

  return { bank, branch, date, accountName, accountNo, accountType, cash, depositor, phone, cheques, totalCheque, totalAmount };
}

function formatPayinDate(dateStr) {
  if (!dateStr) return '____/____/________';
  const d = new Date(dateStr);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear() + 543; // Buddhist year
  return `${day}/${month}/${year}`;
}

function generateBBLPayin(data) {
  const W = 70;
  const line = '='.repeat(W);
  const dashLine = '-'.repeat(W);
  let txt = '';

  txt += line + '\n';
  txt += centerText('ใบนำฝาก (Pay-in Slip)', W) + '\n';
  txt += centerText('ธนาคารกรุงเทพ จำกัด (มหาชน)', W) + '\n';
  txt += centerText('BANGKOK BANK PUBLIC COMPANY LIMITED', W) + '\n';
  txt += line + '\n';
  txt += '\n';
  txt += `สาขา (Branch) : ${data.branch || '______________________'}`;
  txt += `          วันที่ (Date) : ${formatPayinDate(data.date)}\n`;
  txt += '\n';
  txt += dashLine + '\n';
  txt += `ชื่อบัญชี (Account Name) : ${data.accountName || '________________________________'}\n`;
  txt += `เลขที่บัญชี (Account No.) : ${data.accountNo || '__ __ __ __ __ __ __ __ __ __'}\n`;
  txt += `ประเภทบัญชี : [${data.accountType === 'ออมทรัพย์' ? 'X' : ' '}] ออมทรัพย์(Savings)  [${data.accountType === 'กระแสรายวัน' ? 'X' : ' '}] กระแสรายวัน(Current)  [${data.accountType === 'ฝากประจำ' ? 'X' : ' '}] ฝากประจำ(Fixed)\n`;
  txt += dashLine + '\n';
  txt += '\n';
  txt += `รายการเงินสด (Cash)                                   ${padLeft(fmtMoney(data.cash), 16)}\n`;
  txt += '\n';
  txt += `รายการเช็ค (Cheques) :\n`;
  txt += `${padRight('ธนาคาร', 14)}${padRight('สาขา', 14)}${padRight('เลขที่เช็ค', 14)}${padLeft('จำนวนเงิน', 16)}\n`;
  txt += dashLine + '\n';

  if (data.cheques.length === 0) {
    txt += centerText('- ไม่มีรายการเช็ค -', W) + '\n';
  } else {
    data.cheques.forEach((c, i) => {
      txt += `${padRight((i+1) + '. ' + (c.bank || ''), 14)}${padRight(c.branch || '', 14)}${padRight(c.no || '', 14)}${padLeft(fmtMoney(c.amount), 16)}\n`;
    });
  }

  txt += dashLine + '\n';
  txt += `${padRight('รวมเช็ค (Total Cheques)', 44)}${padLeft(fmtMoney(data.totalCheque), 16)}\n`;
  txt += `${padRight('รวมเงินสด+เช็ค (Total Amount)', 44)}${padLeft(fmtMoney(data.totalAmount), 16)}\n`;
  txt += line + '\n';
  txt += '\n';
  txt += `จำนวนเงิน (Amount) : ${numberToThaiText(data.totalAmount)}\n`;
  txt += '\n';
  txt += `ผู้นำฝาก (Depositor) : ${data.depositor || '______________________'}  โทร : ${data.phone || '________________'}\n`;
  txt += '\n';
  txt += `ลงชื่อผู้นำฝาก ________________________    ผู้รับเงิน ________________________\n`;
  txt += line + '\n';

  return txt;
}

// ============ DOT MATRIX PAY-IN FORM PRINTING ============
// ตำแหน่งตรงตามแบบฟอร์มใบ Pay-in สำเร็จรูปของแต่ละธนาคาร
// ค่าตำแหน่ง top/left เป็น mm จากมุมบนซ้ายของกระดาษ
// ปรับได้ตาม config ถ้าใบฟอร์มเลื่อนไป

// ========== ธนาคารกรุงเทพ (BBL) Pay-in Form Layout ==========
// ใบ Pay-in กรุงเทพ ขนาดประมาณ A5 (210 x 148mm) หรือกระดาษต่อเนื่อง
// แต่ละ field มีตำแหน่ง row (บรรทัด) ที่แน่นอนบนฟอร์ม

const BBL_PAYIN_CONFIG = {
  // ปรับค่า offset ทั้งหมดได้ที่นี่ (mm)
  offsetTop: 0,      // เลื่อนลงทั้งหมด
  offsetLeft: 0,     // เลื่อนขวาทั้งหมด
  fontSize: '16pt',
  // ขนาดกระดาษ pay-in BBL (กระดาษต่อเนื่อง)
  pageWidth: '210mm',
  pageHeight: '140mm',
  // ตำแหน่งแต่ละช่อง อ้างอิง dot matrix 1/6 inch = 4.23mm per row
  // col positions: col1≈0, col2≈20, col3≈55, col4≈90, col5≈125, col6≈155mm
  fields: {
    branch:       { top: 8.5, left: 55 },      // row3 area, col3
    date_day:     { top: 8.5, left: 90 },      // row3, col4 (วัน)
    date_month:   { top: 8.5, left: 100 },     // row3, col4 (เดือน)
    date_year:    { top: 8.5, left: 110 },     // row3, col4 (ปี)
    accountName:  { top: 12.7, left: 55 },     // row4, col3: ชื่อบัญชี
    accountNo:    { top: 12.7, left: 155 },    // row4, col6: เลขที่บัญชี
    // ประเภทบัญชี - ตำแหน่ง X ที่ checkbox (row5)
    typeSavings:  { top: 16.9, left: 37 },
    typeCurrent:  { top: 16.9, left: 72 },
    typeFixed:    { top: 16.9, left: 113 },
    // เงินสด (row5 area)
    cashAmount:   { top: 16.9, left: 155 },
    // รายการเช็ค - บรรทัดแรกเริ่ม row6 แต่ละบรรทัดห่าง 4.23mm
    chequeStartTop: 21.2,
    chequeBank:   { left: 20 },                // col2: เลขที่เช็ค
    chequeBranch: { left: 90 },                // col4: ธนาคาร/สาขาเช็ค
    chequeNo:     { left: 125 },               // col5: วันที่เช็ค
    chequeAmount: { left: 155 },               // col6: จำนวนเงิน
    chequeRowHeight: 4.23,                     // mm ต่อบรรทัด (1/6 inch)
    maxChequeRows: 5,
    // รวมเช็ค
    totalCheque:  { top: 42.3, left: 155 },
    // รวมทั้งสิ้น
    totalAmount:  { top: 46.5, left: 155 },
    // จำนวนเงินตัวอักษร
    amountText:   { top: 46.5, left: 20 },
    // ผู้นำฝาก
    depositor:    { top: 55, left: 20 },
    phone:        { top: 8.5, left: 155 },     // โทร. อยู่บรรทัดเดียวกับ date (row3, col6)
  }
};

// ========== ธนาคาร UOB Pay-in Form Layout ==========
// ใบ UOB เว้นบรรทัด (double-spaced) ตาม Excel
const UOB_PAYIN_CONFIG = {
  offsetTop: 0,
  offsetLeft: 0,
  fontSize: '16pt',
  pageWidth: '210mm',
  pageHeight: '140mm',
  // UOB pay-in เว้นบรรทัด ทุก field ห่างกัน ~8.46mm (2 rows)
  fields: {
    branch:       { top: 8.5, left: 55 },      // row3, col3
    date_day:     { top: 8.5, left: 125 },     // row3, col5
    date_month:   { top: 8.5, left: 135 },
    date_year:    { top: 8.5, left: 148 },
    accountName:  { top: 16.9, left: 55 },     // row5, col3 (เว้น 1 บรรทัด)
    accountNo:    { top: 16.9, left: 155 },    // row5, col6
    // ประเภทบัญชี (row7)
    typeSavings:  { top: 25.4, left: 35 },
    typeCurrent:  { top: 25.4, left: 70 },
    typeFixed:    { top: 25.4, left: 110 },
    // เงินสด (row9)
    cashAmount:   { top: 33.8, left: 155 },
    // รายการเช็ค - เริ่ม row11 เว้นบรรทัด (8.46mm per row)
    chequeStartTop: 42.3,
    chequeBank:   { left: 20 },
    chequeBranch: { left: 55 },
    chequeNo:     { left: 100 },
    chequeAmount: { left: 155 },
    chequeRowHeight: 4.23,
    maxChequeRows: 5,
    // รวมเช็ค
    totalCheque:  { top: 67.7, left: 155 },
    // รวมทั้งสิ้น
    totalAmount:  { top: 72, left: 155 },
    // จำนวนเงินตัวอักษร
    amountText:   { top: 72, left: 20 },
    // ผู้นำฝาก
    depositor:    { top: 80.4, left: 20 },
    phone:        { top: 80.4, left: 135 },
  }
};

function generatePayinPositions(data, config) {
  const f = config.fields;
  const oT = config.offsetTop;
  const oL = config.offsetLeft;
  const positions = [];

  // แยกวันที่
  let day = '', month = '', year = '';
  if (data.date) {
    const d = new Date(data.date);
    day = String(d.getDate()).padStart(2, '0');
    month = String(d.getMonth() + 1).padStart(2, '0');
    year = String(d.getFullYear() + 543); // พ.ศ.
  }

  // สาขา
  if (data.branch) {
    positions.push({ top: f.branch.top + oT, left: f.branch.left + oL, text: data.branch });
  }

  // วันที่ (แยก DD / MM / YYYY)
  if (day) positions.push({ top: f.date_day.top + oT, left: f.date_day.left + oL, text: day });
  if (month) positions.push({ top: f.date_month.top + oT, left: f.date_month.left + oL, text: month });
  if (year) positions.push({ top: f.date_year.top + oT, left: f.date_year.left + oL, text: year });

  // ชื่อบัญชี
  if (data.accountName) {
    positions.push({ top: f.accountName.top + oT, left: f.accountName.left + oL, text: data.accountName });
  }

  // เลขที่บัญชี
  if (data.accountNo) {
    positions.push({ top: f.accountNo.top + oT, left: f.accountNo.left + oL, text: data.accountNo });
  }

  // ประเภทบัญชี (พิมพ์ X ที่ช่อง checkbox)
  if (data.accountType === 'ออมทรัพย์') {

  } else if (data.accountType === 'กระแสรายวัน') {

  } else if (data.accountType === 'ฝากประจำ') {

  }

  // เงินสด
  if (data.cash > 0) {
    positions.push({ top: f.cashAmount.top + oT, left: f.cashAmount.left + oL, text: fmtMoney(data.cash) });
  }

  // รายการเช็ค
  const maxRows = Math.min(data.cheques.length, f.maxChequeRows);
  for (let i = 0; i < maxRows; i++) {
    const c = data.cheques[i];
    const rowTop = f.chequeStartTop + (i * f.chequeRowHeight) + oT;

    if (c.bank) positions.push({ top: rowTop, left: f.chequeBank.left + oL, text: c.bank });
    if (c.branch) positions.push({ top: rowTop, left: f.chequeBranch.left + oL, text: c.branch });
    if (c.no) positions.push({ top: rowTop, left: f.chequeNo.left + oL, text: c.no });
    if (c.amount > 0) positions.push({ top: rowTop, left: f.chequeAmount.left + oL, text: fmtMoney(c.amount) });
  }

  // รวมเช็ค
  positions.push({ top: f.totalCheque.top + oT, left: f.totalCheque.left + oL, text: fmtMoney(data.totalCheque) });

  // รวมทั้งสิ้น
  positions.push({ top: f.totalAmount.top + oT, left: f.totalAmount.left + oL, text: fmtMoney(data.totalAmount) });

  // จำนวนเงินเป็นตัวอักษร
  positions.push({ top: f.amountText.top + oT, left: f.amountText.left + oL, text: numberToThaiText(data.totalAmount) });

  // ผู้นำฝาก
  if (data.depositor) {
    positions.push({ top: f.depositor.top + oT, left: f.depositor.left + oL, text: data.depositor });
  }

  // เบอร์โทร
  if (data.phone) {
    positions.push({ top: f.phone.top + oT, left: f.phone.left + oL, text: data.phone });
  }

  return positions;
}

function generateUOBPayin(data) {
  const W = 70;
  const line = '='.repeat(W);
  const dashLine = '-'.repeat(W);
  let txt = '';

  txt += line + '\n';
  txt += centerText('ใบนำฝาก (Credit Slip / Pay-in Slip)', W) + '\n';
  txt += centerText('ธนาคารยูโอบี จำกัด (มหาชน)', W) + '\n';
  txt += centerText('UNITED OVERSEAS BANK (THAI) PCL.', W) + '\n';
  txt += line + '\n';
  txt += '\n';
  txt += `สาขา (Branch) : ${data.branch || '______________________'}`;
  txt += `          วันที่ (Date) : ${formatPayinDate(data.date)}\n`;
  txt += '\n';
  txt += dashLine + '\n';
  txt += `เข้าบัญชีชื่อ (A/C Name) : ${data.accountName || '________________________________'}\n`;
  txt += `เลขที่บัญชี (A/C No.)    : ${data.accountNo || '__ __ __ __ __ __ __ __ __ __'}\n`;
  txt += `ประเภทบัญชี : [${data.accountType === 'ออมทรัพย์' ? 'X' : ' '}] ออมทรัพย์(Savings)  [${data.accountType === 'กระแสรายวัน' ? 'X' : ' '}] กระแสรายวัน(Current)  [${data.accountType === 'ฝากประจำ' ? 'X' : ' '}] ฝากประจำ(Fixed)\n`;
  txt += dashLine + '\n';
  txt += '\n';
  txt += `เงินสด (Cash)                                         ${padLeft(fmtMoney(data.cash), 16)}\n`;
  txt += '\n';
  txt += `รายการเช็ค (Cheque Details) :\n`;
  txt += `${padRight('ลำดับ', 6)}${padRight('ธนาคาร', 12)}${padRight('สาขา', 14)}${padRight('เลขที่เช็ค', 14)}${padLeft('จำนวนเงิน (บาท)', 16)}\n`;
  txt += dashLine + '\n';

  if (data.cheques.length === 0) {
    txt += centerText('- ไม่มีรายการเช็ค -', W) + '\n';
  } else {
    data.cheques.forEach((c, i) => {
      txt += `${padRight(String(i+1), 6)}${padRight(c.bank || '', 12)}${padRight(c.branch || '', 14)}${padRight(c.no || '', 14)}${padLeft(fmtMoney(c.amount), 16)}\n`;
    });
  }

  txt += dashLine + '\n';
  txt += `${padRight('รวมยอดเช็ค (Total Cheques)', 46)}${padLeft(fmtMoney(data.totalCheque), 16)}\n`;
  txt += line + '\n';
  txt += `${padRight('รวมยอดทั้งสิ้น (Grand Total)', 46)}${padLeft(fmtMoney(data.totalAmount), 16)}\n`;
  txt += line + '\n';
  txt += '\n';
  txt += `จำนวนเงิน (In Words) : ${numberToThaiText(data.totalAmount)}\n`;
  txt += '\n';
  txt += `ผู้นำฝาก (Deposited by) : ${data.depositor || '______________________'}  โทร (Tel) : ${data.phone || '________________'}\n`;
  txt += '\n';
  txt += `ลงชื่อผู้นำฝาก ________________________    ผู้รับฝาก ________________________\n`;
  txt += `             (Depositor)                              (Teller)\n`;
  txt += line + '\n';

  return txt;
}

function fmtMoney(amount) {
  if (!amount || amount === 0) return '0.00';
  return Number(amount).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function numberToThaiText(num) {
  if (!num || num === 0) return 'ศูนย์บาทถ้วน';
  const thaiDigits = ['', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า'];
  const thaiPlaces = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน', 'ล้าน'];

  function intToThai(n) {
    if (n === 0) return 'ศูนย์';
    let result = '';
    const str = String(n);
    const len = str.length;
    for (let i = 0; i < len; i++) {
      const digit = parseInt(str[i]);
      const place = len - i - 1;
      if (digit === 0) continue;
      if (place === 0 && digit === 1 && len > 1) {
        result += 'เอ็ด';
      } else if (place === 1 && digit === 1) {
        result += 'สิบ';
      } else if (place === 1 && digit === 2) {
        result += 'ยี่สิบ';
      } else {
        result += thaiDigits[digit] + thaiPlaces[place];
      }
    }
    return result;
  }

  const parts = num.toFixed(2).split('.');
  const intPart = parseInt(parts[0]);
  const decPart = parseInt(parts[1]);

  let text = intToThai(intPart) + 'บาท';
  if (decPart === 0) {
    text += 'ถ้วน';
  } else {
    text += intToThai(decPart) + 'สตางค์';
  }
  return text;
}

function previewPayin() {
  const data = getPayinData();
  let txt;
  if (data.bank === 'BBL') {
    txt = generateBBLPayin(data);
  } else {
    txt = generateUOBPayin(data);
  }
  document.getElementById('payinPreview').textContent = txt;
}

function printPayin() {
  const data = getPayinData();

  // อ่านค่า offset จาก UI
  const offsetTop = parseFloat(document.getElementById('payinOffsetTop').value) || 0;
  const offsetLeft = parseFloat(document.getElementById('payinOffsetLeft').value) || 0;

  // ใช้ระบบ position-based printing ลงฟอร์มสำเร็จรูปสำหรับเครื่อง dot matrix
  let config, positions;
  if (data.bank === 'BBL') {
    config = { ...BBL_PAYIN_CONFIG, offsetTop: BBL_PAYIN_CONFIG.offsetTop + offsetTop, offsetLeft: BBL_PAYIN_CONFIG.offsetLeft + offsetLeft };
    positions = generatePayinPositions(data, config);
  } else {
    config = { ...UOB_PAYIN_CONFIG, offsetTop: UOB_PAYIN_CONFIG.offsetTop + offsetTop, offsetLeft: UOB_PAYIN_CONFIG.offsetLeft + offsetLeft };
    positions = generatePayinPositions(data, config);
  }

  // Update preview as well
  let txt;
  if (data.bank === 'BBL') {
    txt = generateBBLPayin(data);
  } else {
    txt = generateUOBPayin(data);
  }
  document.getElementById('payinPreview').textContent = txt;

  // Print using positioned overlay for dot matrix on pre-printed form
  openPayinPrintWindow(positions, `ใบ Pay-in ${data.bank}`, config);
}

// ============ PAY-IN POSITION ADJUSTMENT UI ============
// เปิดหน้าปรับตำแหน่ง (สำหรับ fine-tune ให้ตรงช่องฟอร์มจริง)
function openPayinAdjustment() {
  const data = getPayinData();
  const offsetTop = parseFloat(document.getElementById('payinOffsetTop').value) || 0;
  const offsetLeft = parseFloat(document.getElementById('payinOffsetLeft').value) || 0;

  let config;
  if (data.bank === 'BBL') {
    config = { ...BBL_PAYIN_CONFIG, offsetTop: BBL_PAYIN_CONFIG.offsetTop + offsetTop, offsetLeft: BBL_PAYIN_CONFIG.offsetLeft + offsetLeft };
  } else {
    config = { ...UOB_PAYIN_CONFIG, offsetTop: UOB_PAYIN_CONFIG.offsetTop + offsetTop, offsetLeft: UOB_PAYIN_CONFIG.offsetLeft + offsetLeft };
  }
  const positions = generatePayinPositions(data, config);

  const printWin = window.open('', '_blank', 'width=900,height=700');
  
  let elementsHtml = '';
  positions.forEach((p, idx) => {
    const style = `position:absolute; top:${p.top}mm; left:${p.left}mm; font-size:${config.fontSize}; white-space:pre; color:red; border-bottom:1px dotted red;`;
    elementsHtml += `<div style="${style}" title="top:${p.top}mm left:${p.left}mm">${p.text}</div>\n`;
  });

  printWin.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>ปรับตำแหน่ง Pay-in ${data.bank}</title>
      <style>
        body {
          font-family: 'Angsana New', 'AngsanaUPC', serif;
          margin: 0;
          padding: 0;
          position: relative;
          width: ${config.pageWidth};
          height: ${config.pageHeight};
          border: 2px solid #333;
          background: repeating-linear-gradient(
            transparent,
            transparent 4.9mm,
            #eef 5mm
          );
        }
        .ruler-v {
          position: absolute; top: 0; left: 0; width: 100%; height: 100%;
          pointer-events: none;
          background: repeating-linear-gradient(
            90deg,
            transparent,
            transparent 9.9mm,
            #efe 10mm
          );
        }
        .info {
          position: fixed; bottom: 10px; left: 10px; background: #fff; padding: 10px;
          border: 1px solid #ccc; font-size: 11px; font-family: sans-serif; z-index: 999;
        }
      </style>
    </head>
    <body>
      <div class="ruler-v"></div>
      ${elementsHtml}
      <div class="info">
        <strong>ตำแหน่งบนฟอร์ม ${data.bank}</strong><br>
        แถบเส้นเขียว = ทุก 10mm แนวนอน | แถบเส้นฟ้า = ทุก 5mm แนวตั้ง<br>
        ข้อความสีแดง = ตำแหน่งที่จะพิมพ์ (hover เพื่อดูค่า top/left)<br>
        ปรับค่าใน BBL_PAYIN_CONFIG / UOB_PAYIN_CONFIG ใน app.js
      </div>
    </body>
    </html>
  `);
  printWin.document.close();
}

// ============ PAY-IN BANK TABS (KTB / UOB / BBL) ============

function showPayinBankTab(bank, event) {
  document.querySelectorAll('.payin-bank-tab').forEach(el => el.style.display = 'none');
  document.getElementById(`payinTab-${bank}`).style.display = 'block';

  document.querySelectorAll('#payinBankTabs .nav-link').forEach(el => el.classList.remove('active'));
  if (event && event.target) {
    event.target.closest('.nav-link').classList.add('active');
  }
}

// === KTB Functions ===
function previewPayinKTB() {
  const branch = document.getElementById('ktb_branch').value;
  const date = document.getElementById('ktb_date').value;
  const accountName = document.getElementById('ktb_accountName').value;
  const accountNo = document.getElementById('ktb_accountNo').value;
  const depositor = document.getElementById('ktb_depositor').value;
  const amount = parseFloat(document.getElementById('ktb_amount').value) || 0;

  const html = `
    <div style="border:2px solid #00a7e1; border-radius:8px; padding:12px; font-size:11px; font-family:'Prompt',sans-serif; min-height:200px;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
        <div><strong style="color:#00a7e1; font-size:14px;">Krungthai</strong><br><span style="font-size:9px;">ธนาคารกรุงไทย</span></div>
        <div style="background:#00a7e1; color:#fff; padding:4px 12px; border-radius:4px; font-weight:600;">ใบรับฝากเงิน DEPOSIT SLIP</div>
      </div>
      <table style="width:100%; border-collapse:collapse; margin-bottom:10px;">
        <tr>
          <td style="width:50%">สาขา Branch: <strong>${branch||'___'}</strong></td>
          <td style="width:50%">วันที่และเวลา: <strong>${formatPayinDate(date)}</strong></td>
        </tr>
      </table>
      <div style="border:1px solid #ddd; padding:10px; border-radius:4px; margin-bottom:10px; background:#fafafa;">
        <div>ชื่อบัญชี: <strong>${accountName||'___'}</strong></div>
        <div>เลขที่บัญชี: <strong style="color:#c62828;">${accountNo||'___'}</strong></div>
      </div>
      <div style="border-top:2px solid #00a7e1; padding-top:10px; display:flex; justify-content:space-between;">
        <div>ลายมือชื่อผู้นำฝาก/Depositor:<br><strong>${depositor||'___'}</strong></div>
        <div style="text-align:right;">จำนวนเงิน/Amount:<br><strong style="font-size:14px; color:#00a7e1;">${fmtMoney(amount)}</strong><br><span style="font-size:9px;">(${numberToThaiText(amount)})</span></div>
      </div>
    </div>
  `;
  document.getElementById('ktb_preview').innerHTML = html;
}

function printPayinKTB() {
  const branch = document.getElementById('ktb_branch').value;
  const date = document.getElementById('ktb_date').value;
  const accountName = document.getElementById('ktb_accountName').value;
  const accountNo = document.getElementById('ktb_accountNo').value;
  const depositor = document.getElementById('ktb_depositor').value;
  const amount = parseFloat(document.getElementById('ktb_amount').value) || 0;
  const offsetTop = parseFloat(document.getElementById('ktb_offsetTop').value) || 0;
  const offsetLeft = parseFloat(document.getElementById('ktb_offsetLeft').value) || 0;
  const fo = getFieldOffsets('KTB');

  const positions = [];
  const config = { pageWidth: document.getElementById('ktb_pageWidth').value + 'mm', pageHeight: document.getElementById('ktb_pageHeight').value + 'mm', fontSize: '16pt' };

  let dateStr = '';
  if (date) {
    const d = new Date(date);
    dateStr = `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear() + 543}`;
  }

  if (branch) positions.push({ top: 7 + offsetTop + (fo.branch_top||0), left: 45 + offsetLeft + (fo.branch_left||0), text: branch });
  if (dateStr) positions.push({ top: 7 + offsetTop + (fo.date_top||0), left: 110 + offsetLeft + (fo.date_left||0), text: dateStr });
  if (depositor) positions.push({ top: 62 + offsetTop + (fo.depositor_top||0), left: 20 + offsetLeft + (fo.depositor_left||0), text: depositor });
  if (amount > 0) positions.push({ top: 62 + offsetTop + (fo.amount_top||0), left: 110 + offsetLeft + (fo.amount_left||0), text: fmtMoney(amount) });

  previewPayinKTB();
  openPayinPrintWindow(positions, 'ใบรับฝากเงิน กรุงไทย', config);
}

// === UOB Functions ===
function addUobChequeRow() {
  const container = document.getElementById('uob_chequeItems');
  const row = document.createElement('div');
  row.className = 'row g-2 mb-2 uob-cheque-row';
  row.innerHTML = `
    <div class="col-4">
      <input type="text" class="form-control form-control-sm" placeholder="เช็คธนาคาร/สาขา" data-field="chqBank">
    </div>
    <div class="col-3">
      <input type="text" class="form-control form-control-sm" placeholder="เลขที่เช็ค" data-field="chqNo">
    </div>
    <div class="col-3">
      <input type="number" class="form-control form-control-sm" placeholder="จำนวนเงิน" step="0.01" data-field="chqAmount">
    </div>
    <div class="col-2">
      <button class="btn btn-sm btn-outline-danger" onclick="this.closest('.uob-cheque-row').remove()"><i class="bi bi-x"></i></button>
    </div>
  `;
  container.appendChild(row);
}

function updateUobAmountWords() {
  const amt = parseFloat(document.getElementById('uob_totalAmount').value) || 0;
  document.getElementById('uob_amountWords').value = amt > 0 ? numberToThaiText(amt) : '';
}

function getUobCheques() {
  const rows = document.querySelectorAll('.uob-cheque-row');
  const cheques = [];
  rows.forEach(row => {
    const bank = row.querySelector('[data-field="chqBank"]').value;
    const no = row.querySelector('[data-field="chqNo"]').value;
    const amount = parseFloat(row.querySelector('[data-field="chqAmount"]').value) || 0;
    if (no || amount > 0) cheques.push({ bank, no, amount });
  });
  return cheques;
}

function previewPayinUOB() {
  const date = document.getElementById('uob_date').value;
  const branch = document.getElementById('uob_branch').value;
  const accountName = document.getElementById('uob_accountName').value;
  const accountNo = document.getElementById('uob_accountNo').value;
  const accountType = document.getElementById('uob_accountType').value;
  const totalAmount = parseFloat(document.getElementById('uob_totalAmount').value) || 0;
  const depositor = document.getElementById('uob_depositor').value;
  const cheques = getUobCheques();

  let chqRows = '';
  cheques.forEach(c => {
    chqRows += `<tr><td style="border:1px solid #ddd;padding:3px;">${c.bank||''}</td><td style="border:1px solid #ddd;padding:3px;">${c.no||''}</td><td style="border:1px solid #ddd;padding:3px;text-align:right;">${fmtMoney(c.amount)}</td></tr>`;
  });
  if (cheques.length === 0) chqRows = '<tr><td colspan="3" style="text-align:center;color:#999;border:1px solid #ddd;padding:3px;">- ไม่มีรายการ -</td></tr>';

  const html = `
    <div style="border:2px solid #003d6b; border-radius:8px; padding:12px; font-size:11px; font-family:'Prompt',sans-serif; min-height:280px;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
        <div><strong style="color:#003d6b; font-size:14px;">UOB</strong><br><span style="font-size:9px;">ธนาคารยูโอบี จำกัด (มหาชน)</span></div>
        <div style="color:#003d6b; font-weight:600;">ใบนำฝากเช็ค Cheque Deposit Slip</div>
      </div>
      <table style="width:100%; border-collapse:collapse; margin-bottom:6px;">
        <tr>
          <td>วันที่: <strong>${formatPayinDate(date)}</strong></td>
          <td>เพื่อสาขา: <strong>${branch||'___'}</strong></td>
        </tr>
      </table>
      <table style="width:100%; border-collapse:collapse; margin-bottom:6px;">
        <tr>
          <td>ประเภทบัญชี: <strong>${accountType}</strong></td>
        </tr>
        <tr>
          <td>ชื่อบัญชี: <strong>${accountName||'___'}</strong></td>
          <td>หมายเลขบัญชี: <strong style="color:#c62828;">${accountNo||'___'}</strong></td>
        </tr>
      </table>
      <table style="width:100%; border-collapse:collapse; font-size:10px; margin-top:8px;">
        <thead style="background:#003d6b; color:#fff;">
          <tr><th style="border:1px solid #ddd;padding:3px;">เช็คธนาคาร/สาขา</th><th style="border:1px solid #ddd;padding:3px;">เลขที่เช็ค</th><th style="border:1px solid #ddd;padding:3px;">จำนวนเงิน</th></tr>
        </thead>
        <tbody>${chqRows}</tbody>
      </table>
      <div style="margin-top:8px; padding:6px; border-top:2px solid #003d6b; display:flex; justify-content:space-between;">
        <span>จำนวนเงินตัวอักษร: <strong>${numberToThaiText(totalAmount)}</strong></span>
        <span>รวมเงินฝาก: <strong style="color:#003d6b;">${fmtMoney(totalAmount)}</strong></span>
      </div>
      <div style="margin-top:4px;">ผู้ทำรายการ: <strong>${depositor||'___'}</strong></div>
    </div>
  `;
  document.getElementById('uob_preview').innerHTML = html;
}

function printPayinUOB() {
  const date = document.getElementById('uob_date').value;
  const branch = document.getElementById('uob_branch').value;
  const accountName = document.getElementById('uob_accountName').value;
  const accountNo = document.getElementById('uob_accountNo').value;
  const accountType = document.getElementById('uob_accountType').value;
  const totalAmount = parseFloat(document.getElementById('uob_totalAmount').value) || 0;
  const depositor = document.getElementById('uob_depositor').value;
  const cheques = getUobCheques();
  const offsetTop = parseFloat(document.getElementById('uob_offsetTop').value) || 0;
  const offsetLeft = parseFloat(document.getElementById('uob_offsetLeft').value) || 0;
  const fo = getFieldOffsets('UOB');

  const positions = [];
  const config = { pageWidth: document.getElementById('uob_pageWidth').value + 'mm', pageHeight: document.getElementById('uob_pageHeight').value + 'mm', fontSize: '16pt' };

  let dateStr = '';
  if (date) {
    const d = new Date(date);
    dateStr = `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear() + 543}`;
  }

  if (dateStr) positions.push({ top: 10 + offsetTop + (fo.date_top||0), left: 55 + offsetLeft + (fo.date_left||0), text: dateStr });
  if (branch) positions.push({ top: 10 + offsetTop + (fo.branch_top||0), left: 120 + offsetLeft + (fo.branch_left||0), text: branch });

  const atTop = 48 + offsetTop + (fo.accountType_top||0);
  const atLeft = fo.accountType_left||0;




  if (accountName) positions.push({ top: 55 + offsetTop + (fo.accountName_top||0), left: 42 + offsetLeft + (fo.accountName_left||0), text: accountName });
  if (accountNo) positions.push({ top: 55 + offsetTop + (fo.accountNo_top||0), left: 138 + offsetLeft + (fo.accountNo_left||0), text: accountNo });

  const chequeStartTop = 70 + (fo.chequeRow_top||0);
  const chequeRowH = 5;
  const chequeLeftOffset = fo.chequeRow_left||0;
  cheques.forEach((c, i) => {
    if (i >= 4) return;
    const rowTop = chequeStartTop + (i * chequeRowH) + offsetTop;
    if (c.bank) positions.push({ top: rowTop, left: 15 + offsetLeft + chequeLeftOffset, text: c.bank, letterSpacing: fo.chequeRow_spacing||0 || undefined });
    if (c.no) positions.push({ top: rowTop + (fo.chequeNo_top||0), left: 100 + offsetLeft + (fo.chequeNo_left||0), text: c.no, letterSpacing: fo.chequeNo_spacing||0 || undefined });
    if (c.amount > 0) positions.push({ top: rowTop + (fo.chequeAmt_top||0), left: 145 + offsetLeft + (fo.chequeAmt_left||0), text: fmtMoney(c.amount) });
  });

  const totalRow = chequeStartTop + (Math.max(cheques.length, 1) * chequeRowH) + 5 + offsetTop;
  if (totalAmount > 0) {
    positions.push({ top: totalRow + (fo.amountWords_top||0), left: 15 + offsetLeft + (fo.amountWords_left||0), text: numberToThaiText(totalAmount) });
    positions.push({ top: totalRow + (fo.totalAmount_top||0), left: 130 + offsetLeft + (fo.totalAmount_left||0), text: fmtMoney(totalAmount) });
  }
  if (depositor) positions.push({ top: totalRow + (fo.depositor_top||0), left: 165 + offsetLeft + (fo.depositor_left||0), text: depositor });

  previewPayinUOB();
  openPayinPrintWindow(positions, 'ใบนำฝากเช็ค UOB', config);
}

// === BBL Functions ===
function addBblChequeRow() {
  const container = document.getElementById('bbl_chequeItems');
  const row = document.createElement('div');
  row.className = 'row g-2 mb-2 bbl-cheque-row';
  row.innerHTML = `
    <div class="col-2">
      <input type="text" class="form-control form-control-sm" placeholder="เลขที่เช็ค" data-field="chqNo">
    </div>
    <div class="col-3">
      <input type="text" class="form-control form-control-sm" placeholder="ชื่อธนาคาร/สาขา" data-field="chqBank">
    </div>
    <div class="col-3">
      <input type="date" class="form-control form-control-sm" data-field="chqDate">
    </div>
    <div class="col-3">
      <input type="number" class="form-control form-control-sm" placeholder="จำนวนเงิน" step="0.01" data-field="chqAmount">
    </div>
    <div class="col-1">
      <button class="btn btn-sm btn-outline-danger" onclick="this.closest('.bbl-cheque-row').remove()"><i class="bi bi-x"></i></button>
    </div>
  `;
  container.appendChild(row);
}

function updateBblAmountWords() {
  const amt = parseFloat(document.getElementById('bbl_totalAmount').value) || 0;
  document.getElementById('bbl_amountWords').value = amt > 0 ? '***' + numberToThaiText(amt) + '***' : '';
}

function getBblCheques() {
  const rows = document.querySelectorAll('.bbl-cheque-row');
  const cheques = [];
  rows.forEach(row => {
    const no = row.querySelector('[data-field="chqNo"]').value;
    const bank = row.querySelector('[data-field="chqBank"]').value;
    const date = row.querySelector('[data-field="chqDate"]').value;
    const amount = parseFloat(row.querySelector('[data-field="chqAmount"]').value) || 0;
    if (no || amount > 0) cheques.push({ no, bank, date, amount });
  });
  return cheques;
}

function previewPayinBBL() {
  const branch = document.getElementById('bbl_branch').value;
  const date = document.getElementById('bbl_date').value;
  const accountType = document.getElementById('bbl_accountType').value;
  const depositor = document.getElementById('bbl_depositor').value;
  const phone = document.getElementById('bbl_phone').value;
  const accountNo = document.getElementById('bbl_accountNo').value;
  const accountName = document.getElementById('bbl_accountName').value;
  const accountBranch = document.getElementById('bbl_accountBranch').value;
  const totalAmount = parseFloat(document.getElementById('bbl_totalAmount').value) || 0;
  const amountWords = document.getElementById('bbl_amountWords').value;
  const cheques = getBblCheques();

  let chqRows = '';
  cheques.forEach(c => {
    chqRows += `<tr><td>${c.no||''}</td><td>${c.bank||''}</td><td>${formatPayinDate(c.date)}</td><td style="text-align:right">${fmtMoney(c.amount)}</td></tr>`;
  });
  if (cheques.length === 0) chqRows = '<tr><td colspan="4" style="text-align:center;color:#999;">- ไม่มีรายการ -</td></tr>';

  const html = `
    <div style="border:2px solid #1a237e; border-radius:8px; padding:12px; font-size:11px; font-family:'Prompt',sans-serif; position:relative; min-height:280px;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
        <div><strong style="color:#1a237e; font-size:13px;">Bangkok Bank</strong><br><span style="font-size:10px;">ธนาคารกรุงเทพ</span></div>
        <div style="background:#1a237e; color:#fff; padding:4px 12px; border-radius:4px; font-weight:600;">ชุดฝากเช็ค Deposit Slip for Cheque</div>
      </div>
      <table style="width:100%; border-collapse:collapse; margin-bottom:6px;">
        <tr>
          <td style="width:33%">สาขา: <strong>${branch||'___'}</strong></td>
          <td style="width:33%">วันที่: <strong>${formatPayinDate(date)}</strong></td>
          <td style="width:33%">ประเภท: <strong>${accountType}</strong></td>
        </tr>
      </table>
      <table style="width:100%; border-collapse:collapse; margin-bottom:6px;">
        <tr>
          <td style="width:33%">ผู้นำฝาก: <strong>${depositor||'___'}</strong></td>
          <td style="width:33%">โทร: <strong>${phone||'___'}</strong></td>
          <td style="width:33%">เลขที่บัญชี: <strong style="color:#c62828;">${accountNo||'___'}</strong></td>
        </tr>
      </table>
      <table style="width:100%; border-collapse:collapse; margin-bottom:8px;">
        <tr>
          <td style="width:60%">ชื่อบัญชี: <strong>${accountName||'___'}</strong></td>
          <td style="width:40%">สาขาเจ้าของบัญชี: <strong>${accountBranch||'___'}</strong></td>
        </tr>
      </table>
      <table style="width:100%; border-collapse:collapse; font-size:10px; border:1px solid #ddd;">
        <thead style="background:#fff8e1;">
          <tr><th style="border:1px solid #ddd; padding:3px;">หมายเลขเช็ค</th><th style="border:1px solid #ddd; padding:3px;">ชื่อธนาคาร/สาขา</th><th style="border:1px solid #ddd; padding:3px;">เช็ควันที่</th><th style="border:1px solid #ddd; padding:3px;">จำนวนเงิน</th></tr>
        </thead>
        <tbody>${chqRows}</tbody>
      </table>
      <div style="margin-top:8px; background:#fff8e1; padding:6px; border:1px solid #f9a825; border-radius:4px; display:flex; justify-content:space-between;">
        <span>จำนวนเงินรวม (ตัวอักษร): <strong>${amountWords||'___'}</strong></span>
        <span>จำนวนเงินรวม: <strong style="color:#1a237e;">${fmtMoney(totalAmount)}</strong></span>
      </div>
    </div>
  `;
  document.getElementById('bbl_preview').innerHTML = html;
}

function printPayinBBL() {
  const branch = document.getElementById('bbl_branch').value;
  const date = document.getElementById('bbl_date').value;
  const accountType = document.getElementById('bbl_accountType').value;
  const depositor = document.getElementById('bbl_depositor').value;
  const phone = document.getElementById('bbl_phone').value;
  const accountNo = document.getElementById('bbl_accountNo').value;
  const accountName = document.getElementById('bbl_accountName').value;
  const accountBranch = document.getElementById('bbl_accountBranch').value;
  const totalAmount = parseFloat(document.getElementById('bbl_totalAmount').value) || 0;
  const amountWords = document.getElementById('bbl_amountWords').value;
  const cheques = getBblCheques();
  const offsetTop = parseFloat(document.getElementById('bbl_offsetTop').value) || 0;
  const offsetLeft = parseFloat(document.getElementById('bbl_offsetLeft').value) || 0;
  const fo = getFieldOffsets('BBL');

  const positions = [];
  const config = { pageWidth: document.getElementById('bbl_pageWidth').value + 'mm', pageHeight: document.getElementById('bbl_pageHeight').value + 'mm', fontSize: '16pt' };

  let dateStr = '';
  if (date) {
    const d = new Date(date);
    dateStr = `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear() + 543}`;
  }

  // === Layout ตามฟอร์มจริง BBL "ชุดฝากเช็ค Deposit Slip for Cheque" ===
  // Line 1: สาขา (ซ้าย)
  if (branch) positions.push({ top: 20 + offsetTop + (fo.branch_top||0), left: 15 + offsetLeft + (fo.branch_left||0), text: branch });

  // Line 1: ประเภทบัญชี checkboxes (กลาง-ขวา ตาม layout: ออมทรัพย์|กระแสรายวัน|ประจำ|สินมัธยะ)
  const atTop = 16 + offsetTop + (fo.accountType_top||0);
  const atLeft = fo.accountType_left||0;





  // Line 2: วันที่ (ซ้าย)
  if (dateStr) positions.push({ top: 26 + offsetTop + (fo.date_top||0), left: 15 + offsetLeft + (fo.date_left||0), text: dateStr });

  // Line 3: ผู้นำฝาก (ซ้าย) | โทรศัพท์ (กลาง) | เลขที่บัญชี (ขวาสุด)
  if (depositor) positions.push({ top: 33 + offsetTop + (fo.depositor_top||0), left: 15 + offsetLeft + (fo.depositor_left||0), text: depositor });
  if (phone) positions.push({ top: 33 + offsetTop + (fo.phone_top||0), left: 85 + offsetLeft + (fo.phone_left||0), text: phone });

  // เลขที่บัญชี (A/C No.) - ขวาสุด
  if (accountNo) {
    const accParts = accountNo.split('-');
    if (accParts.length >= 3) {
      const baseTop = 33 + offsetTop + (fo.accountNo_top||0);
      const baseLeft = 160 + offsetLeft + (fo.accountNo_left||0);
      const gap1 = fo.accountNo_gap1_left || 0;
      const gap2 = fo.accountNo_gap2_left || 0;
      const spacing = fo.accountNo_spacing || 0;
      positions.push({ top: baseTop, left: baseLeft, text: accParts[0], letterSpacing: spacing || undefined });
      const part1Width = (accParts[0].length * (spacing || 2.5)) + 4 + gap1;
      positions.push({ top: baseTop, left: baseLeft + part1Width, text: accParts[1], letterSpacing: spacing || undefined });
      const part2Width = part1Width + (accParts[1].length * (spacing || 2.5)) + 4 + gap2;
      positions.push({ top: baseTop, left: baseLeft + part2Width, text: accParts.slice(2).join(''), letterSpacing: spacing || undefined });
    } else {
      positions.push({ top: 33 + offsetTop + (fo.accountNo_top||0), left: 160 + offsetLeft + (fo.accountNo_left||0), text: accountNo, letterSpacing: fo.accountNo_spacing || undefined });
    }
  }

  // Line 4: ชื่อบัญชี (ซ้าย) | สาขาเจ้าของบัญชี (ขวา)
  if (accountName) positions.push({ top: 40 + offsetTop + (fo.accountName_top||0), left: 15 + offsetLeft + (fo.accountName_left||0), text: accountName });
  if (accountBranch) positions.push({ top: 40 + offsetTop + (fo.accountBranch_top||0), left: 120 + offsetLeft + (fo.accountBranch_left||0), text: accountBranch });

  // ตารางรายการเช็ค เริ่มประมาณ top:62mm
  const chequeStartTop = 62 + (fo.chequeRow_top||0);
  const chequeRowH = 5.5;
  cheques.forEach((c, i) => {
    if (i >= 5) return;
    const rowTop = chequeStartTop + (i * chequeRowH) + offsetTop;
    if (c.no) positions.push({ top: rowTop, left: 15 + offsetLeft + (fo.chequeRow_left||0), text: c.no });
    if (c.bank) positions.push({ top: rowTop + (fo.chequeBank_top||0), left: 50 + offsetLeft + (fo.chequeBank_left||0), text: c.bank });
    if (c.date) {
      const cd = new Date(c.date);
      const cds = `${String(cd.getDate()).padStart(2,'0')}/${String(cd.getMonth()+1).padStart(2,'0')}/${cd.getFullYear()+543}`;
      positions.push({ top: rowTop + (fo.chequeDate_top||0), left: 115 + offsetLeft + (fo.chequeDate_left||0), text: cds });
    }
    if (c.amount > 0) positions.push({ top: rowTop + (fo.chequeAmt_top||0), left: 155 + offsetLeft + (fo.chequeAmt_left||0), text: fmtMoney(c.amount) });
  });

  // แถบเหลืองล่าง: จำนวนเงินรวม
  const totalRow = chequeStartTop + (5 * chequeRowH) + 10 + offsetTop;
  if (amountWords) positions.push({ top: totalRow + (fo.amountWords_top||0), left: 15 + offsetLeft + (fo.amountWords_left||0), text: amountWords });
  if (totalAmount > 0) positions.push({ top: totalRow + (fo.totalAmount_top||0), left: 140 + offsetLeft + (fo.totalAmount_left||0), text: fmtMoney(totalAmount) });

  previewPayinBBL();
  openPayinPrintWindow(positions, 'ชุดฝากเช็ค BBL', config);
}

// ============ BANK SETTINGS (ตั้งค่าชื่อบัญชี) ============

async function loadBankSettings() {
  const res = await fetch(`${API}/api/banks`);
  const bankList = await res.json();

  const container = document.getElementById('bankSettingsContainer');
  container.innerHTML = '';

  bankList.forEach(b => {
    container.innerHTML += `
      <div class="card mb-3" style="border-left:4px solid var(--primary-green);">
        <div class="card-body">
          <h6 class="fw-bold">${b.bank_name} (${b.bank_code})</h6>
          <div class="row g-3">
            <div class="col-md-3">
              <label class="form-label">ชื่อบัญชี (Account Name)</label>
              <input type="text" class="form-control" id="bankSetting_name_${b.id}" value="${b.account_name || ''}">
            </div>
            <div class="col-md-2">
              <label class="form-label">ประเภทบัญชี</label>
              <select class="form-select" id="bankSetting_type_${b.id}">
                <option value="ออมทรัพย์" ${(b.account_type || '') === 'ออมทรัพย์' ? 'selected' : ''}>ออมทรัพย์</option>
                <option value="กระแสรายวัน" ${(b.account_type || '') === 'กระแสรายวัน' ? 'selected' : ''}>กระแสรายวัน</option>
                <option value="ฝากประจำ" ${(b.account_type || '') === 'ฝากประจำ' ? 'selected' : ''}>ฝากประจำ</option>
              </select>
            </div>
            <div class="col-md-2">
              <label class="form-label">สาขา (Branch)</label>
              <input type="text" class="form-control" id="bankSetting_branch_${b.id}" value="${b.branch_name || ''}">
            </div>
            <div class="col-md-2">
              <label class="form-label">เลขที่บัญชี (A/C No.)</label>
              <input type="text" class="form-control" id="bankSetting_accno_${b.id}" value="${b.account_number || ''}">
            </div>
            <div class="col-md-3 align-self-end">
              <button class="btn btn-primary-green mb-2" onclick="saveBankSetting(${b.id})">
                <i class="bi bi-check-lg"></i> บันทึก
              </button>
              <button class="btn btn-outline-danger btn-sm mb-2" onclick="deleteBank(${b.id}, '${b.bank_name}')">
                <i class="bi bi-trash"></i> ลบ
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  });
}

async function saveBankSetting(bankId) {
  const account_name = document.getElementById(`bankSetting_name_${bankId}`).value;
  const account_type = document.getElementById(`bankSetting_type_${bankId}`).value;
  const branch_name = document.getElementById(`bankSetting_branch_${bankId}`).value;
  const account_number = document.getElementById(`bankSetting_accno_${bankId}`).value;

  const res = await fetch(`${API}/api/banks/${bankId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ account_name, account_type, branch_name, account_number })
  });
  const result = await res.json();

  if (res.ok) {
    alert('บันทึกสำเร็จ');
    loadBanks(); // refresh bank data
  } else {
    alert(result.error || 'เกิดข้อผิดพลาด');
  }
}

// ============ ADD NEW BANK ============

function showAddBankModal() {
  document.getElementById('newBankSelect').value = '';
  document.getElementById('newBankCode').value = '';
  document.getElementById('newBankName').value = '';
  document.getElementById('newBankAccountName').value = '';
  document.getElementById('newBankBranch').value = '';
  document.getElementById('newBankAccountNo').value = '';
  document.getElementById('newBankCustomGroup').style.display = 'none';
  document.getElementById('newBankNameGroup').style.display = 'none';
  new bootstrap.Modal(document.getElementById('addBankModal')).show();
}

function onNewBankSelect() {
  const val = document.getElementById('newBankSelect').value;
  if (val === 'OTHER') {
    document.getElementById('newBankCustomGroup').style.display = 'block';
    document.getElementById('newBankNameGroup').style.display = 'block';
    document.getElementById('newBankCode').value = '';
    document.getElementById('newBankName').value = '';
  } else {
    document.getElementById('newBankCustomGroup').style.display = 'none';
    document.getElementById('newBankNameGroup').style.display = 'none';
  }
}

async function addNewBank() {
  const selectVal = document.getElementById('newBankSelect').value;

  let bank_code, bank_name;
  if (selectVal === 'OTHER') {
    bank_code = document.getElementById('newBankCode').value.trim();
    bank_name = document.getElementById('newBankName').value.trim();
  } else if (selectVal) {
    bank_code = selectVal;
    // ดึงชื่อจาก option text
    const selectEl = document.getElementById('newBankSelect');
    const optionText = selectEl.options[selectEl.selectedIndex].text;
    bank_name = optionText.split('(')[0].trim(); // เอาชื่อก่อนวงเล็บ
  } else {
    alert('กรุณาเลือกธนาคาร');
    return;
  }

  const data = {
    bank_code,
    bank_name,
    account_name: document.getElementById('newBankAccountName').value.trim(),
    account_type: document.getElementById('newBankAccountType').value,
    branch_name: document.getElementById('newBankBranch').value.trim(),
    account_number: document.getElementById('newBankAccountNo').value.trim()
  };

  if (!data.bank_code || !data.bank_name) {
    alert('กรุณาระบุรหัสธนาคารและชื่อธนาคาร');
    return;
  }

  const res = await fetch(`${API}/api/banks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  const result = await res.json();

  if (res.ok) {
    alert(result.message);
    bootstrap.Modal.getInstance(document.getElementById('addBankModal')).hide();
    loadBanks();
    loadBankSettings();
  } else {
    alert(result.error);
  }
}

// ============ DELETE BANK ============

async function deleteBank(bankId, bankName) {
  if (!confirm(`ต้องการลบ "${bankName}" หรือไม่?\n\n(ลบได้เฉพาะธนาคารที่ไม่มีเช็คอยู่ในระบบ)`)) return;

  const res = await fetch(`${API}/api/banks/${bankId}`, { method: 'DELETE' });
  const result = await res.json();

  if (res.ok) {
    alert(result.message);
    loadBanks();
    loadBankSettings();
  } else {
    alert(result.error);
  }
}

// ============ EDIT CHEQUE ============

function showEditChequeModal(id, chequeNo, bookNo, notes, bankId) {
  document.getElementById('editChequeId').value = id;
  document.getElementById('editChequeNo').value = chequeNo;
  document.getElementById('editBookNo').value = bookNo;
  document.getElementById('editNotes').value = notes;

  // Fetch payee_name from API
  fetch(`${API}/api/cheques/${id}`).then(r => r.json()).then(data => {
    document.getElementById('editPayeeName').value = data.payee_name || 'บริษัท ซีเรียล แฟคตอริ่ง (ประเทศไทย) จำกัด';
  });

  // Populate bank dropdown
  const select = document.getElementById('editChequeBank');
  select.innerHTML = '';
  banks.forEach(b => {
    const label = b.account_name
      ? `${b.bank_name} (${b.bank_code}) - ${b.account_name}`
      : `${b.bank_name} (${b.bank_code})`;
    select.innerHTML += `<option value="${b.id}" ${b.id === bankId ? 'selected' : ''}>${label}</option>`;
  });

  new bootstrap.Modal(document.getElementById('editChequeModal')).show();
}

async function saveEditCheque() {
  const id = document.getElementById('editChequeId').value;
  const data = {
    bank_id: document.getElementById('editChequeBank').value,
    cheque_number: document.getElementById('editChequeNo').value,
    book_number: document.getElementById('editBookNo').value,
    payee_name: document.getElementById('editPayeeName').value,
    notes: document.getElementById('editNotes').value
  };

  if (!data.cheque_number) {
    alert('กรุณาระบุเลขที่เช็ค');
    return;
  }

  const res = await fetch(`${API}/api/cheques/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  const result = await res.json();

  if (res.ok) {
    alert(result.message);
    bootstrap.Modal.getInstance(document.getElementById('editChequeModal')).hide();
    loadCheques();
  } else {
    alert(result.error);
  }
}

// ============ PER-FIELD POSITION ADJUSTMENT ============
// ระบบปรับตำแหน่งแต่ละ field อิสระ เก็บใน localStorage

function getFieldOffsets(formKey) {
  // ดึงจาก cache ใน memory (โหลดจาก server ตอนเริ่มต้น)
  return window._fieldOffsetsCache && window._fieldOffsetsCache[formKey] || {};
}

function saveFieldOffsets(formKey, offsets) {
  // บันทึกลง server (share ทุกเครื่อง)
  if (!window._fieldOffsetsCache) window._fieldOffsetsCache = {};
  window._fieldOffsetsCache[formKey] = offsets;

  fetch(`${API}/api/field-offsets/${formKey}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(offsets)
  });

  // เก็บ localStorage เป็น backup ด้วย
  try { localStorage.setItem(`fieldOffsets_${formKey}`, JSON.stringify(offsets)); } catch(e) {}
}

// โหลดค่า offset ทั้งหมดจาก server ตอนเริ่มต้น
async function loadAllFieldOffsets() {
  const formKeys = ['KTB', 'UOB', 'BBL', 'BBL_CHQ', 'UOB_CHQ', 'BBL_SV', 'KTB_SV'];
  if (!window._fieldOffsetsCache) window._fieldOffsetsCache = {};

  for (const key of formKeys) {
    try {
      const res = await fetch(`${API}/api/field-offsets/${key}`);
      const data = await res.json();
      if (data && Object.keys(data).length > 0) {
        window._fieldOffsetsCache[key] = data;
      } else {
        // fallback: ใช้ค่าจาก localStorage ถ้า server ยังไม่มี
        try {
          const local = localStorage.getItem(`fieldOffsets_${key}`);
          if (local) window._fieldOffsetsCache[key] = JSON.parse(local);
        } catch(e) {}
      }
    } catch(e) {
      // fallback localStorage
      try {
        const local = localStorage.getItem(`fieldOffsets_${key}`);
        if (local) window._fieldOffsetsCache[key] = JSON.parse(local);
      } catch(e2) {}
    }
  }
}

// เปิดหน้าปรับตำแหน่งแต่ละ field แบบ interactive
function openFieldAdjustment(formKey, fields, config) {
  const offsets = getFieldOffsets(formKey);

  let fieldsHtml = '';
  fields.forEach(f => {
    const oT = offsets[f.name + '_top'] || 0;
    const oL = offsets[f.name + '_left'] || 0;
    const oS = offsets[f.name + '_spacing'] || 0;
    fieldsHtml += `
      <tr>
        <td><strong>${f.label}</strong></td>
        <td><input type="number" step="0.5" value="${oT}" id="fo_${f.name}_top" style="width:60px;"></td>
        <td><input type="number" step="0.5" value="${oL}" id="fo_${f.name}_left" style="width:60px;"></td>
        <td><input type="number" step="0.5" value="${oS}" id="fo_${f.name}_spacing" style="width:60px;" title="ระยะห่างตัวอักษร (mm)"></td>
      </tr>
    `;
  });

  const adjustWin = window.open('', '_blank', 'width=950,height=700');
  adjustWin.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>ปรับตำแหน่ง - ${formKey}</title>
      <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">
      <style>
        body { font-family: 'Prompt', sans-serif; padding: 20px; font-size: 13px; }
        input[type=number] { text-align: center; padding: 2px 4px; }
        input:disabled { background: #f0f0f0; }
        .btn-save { background: linear-gradient(135deg, #1b5e20, #f9a825); color: #fff; border: none; }
      </style>
    </head>
    <body>
      <h5>🔧 ปรับตำแหน่งแต่ละช่อง - ${formKey}</h5>
      <p class="text-muted">ปรับค่า +/- (หน่วย mm) แยกอิสระแต่ละช่อง | "ระยะห่างอักษร" ใช้กับเลขที่บัญชี/เลขที่เช็ค เพื่อจัดแต่ละตัวอักษรให้ตรงช่อง</p>
      <table class="table table-sm table-bordered">
        <thead class="table-dark">
          <tr>
            <th>ชื่อช่อง</th>
            <th>เลื่อนลง/ขึ้น</th>
            <th>เลื่อนขวา/ซ้าย</th>
            <th>ระยะห่างอักษร</th>
          </tr>
        </thead>
        <tbody>${fieldsHtml}</tbody>
      </table>
      <div class="alert alert-info mt-2" style="font-size:12px;">
        <strong>ระยะห่างอักษร:</strong> ใช้กับช่องที่มีตารางแยกตัว เช่น เลขที่บัญชี "0-2-4-7-0-9-0-9-8-8"<br>
        ค่า = ระยะห่างระหว่างตัวอักษร (mm) เช่น 3.5 = ห่างกัน 3.5mm ต่อตัว<br>
        ค่า 0 = ใช้ font ปกติ (ไม่แยกตัว)
      </div>
      <button class="btn btn-save btn-lg mt-3" onclick="saveAll()">💾 บันทึกตำแหน่ง</button>
      <button class="btn btn-outline-secondary btn-lg mt-3 ms-2" onclick="resetAll()">🔄 รีเซ็ตทั้งหมด</button>
      <script>
        function saveAll() {
          const offsets = {};
          ${fields.map(f => `
            offsets['${f.name}_top'] = parseFloat(document.getElementById('fo_${f.name}_top').value) || 0;
            offsets['${f.name}_left'] = parseFloat(document.getElementById('fo_${f.name}_left').value) || 0;
            offsets['${f.name}_spacing'] = parseFloat(document.getElementById('fo_${f.name}_spacing').value) || 0;
          `).join('')}
          window.opener.saveFieldOffsets('${formKey}', offsets);
          alert('บันทึกตำแหน่งสำเร็จ');
        }
        function resetAll() {
          ${fields.map(f => `
            document.getElementById('fo_${f.name}_top').value = 0;
            document.getElementById('fo_${f.name}_left').value = 0;
            document.getElementById('fo_${f.name}_spacing').value = 0;
          `).join('')}
          window.opener.saveFieldOffsets('${formKey}', {});
          alert('รีเซ็ตตำแหน่งทั้งหมดแล้ว');
        }
      </script>
    </body>
    </html>
  `);
  adjustWin.document.close();
}

// === ข้อมูล fields สำหรับแต่ละฟอร์ม ===
function getKTBFields() {
  return [
    { name: 'branch', label: 'สาขา', defaultTop: 7, defaultLeft: 45 },
    { name: 'date', label: 'วันที่', defaultTop: 7, defaultLeft: 110 },
    { name: 'depositor', label: 'ผู้นำฝาก', defaultTop: 62, defaultLeft: 20 },
    { name: 'amount', label: 'จำนวนเงิน', defaultTop: 62, defaultLeft: 110 },
  ];
}

function getUOBFields() {
  return [
    { name: 'date', label: 'วันที่', defaultTop: 10, defaultLeft: 55 },
    { name: 'branch', label: 'เพื่อสาขา', defaultTop: 10, defaultLeft: 120 },
    { name: 'accountType', label: 'ประเภทบัญชี', defaultTop: 48, defaultLeft: 62 },
    { name: 'accountName', label: 'ชื่อบัญชี', defaultTop: 55, defaultLeft: 42 },
    { name: 'accountNo', label: 'เลขที่บัญชี', defaultTop: 55, defaultLeft: 138 },
    { name: 'chequeRow', label: 'รายการเช็ค - ธนาคาร/สาขา', defaultTop: 70, defaultLeft: 15 },
    { name: 'chequeNo', label: 'รายการเช็ค - เลขที่เช็ค', defaultTop: 70, defaultLeft: 100 },
    { name: 'chequeAmt', label: 'รายการเช็ค - จำนวนเงิน', defaultTop: 70, defaultLeft: 145 },
    { name: 'amountWords', label: 'จำนวนเงินตัวอักษร', defaultTop: 90, defaultLeft: 15 },
    { name: 'totalAmount', label: 'รวมเงินฝาก', defaultTop: 90, defaultLeft: 130 },
    { name: 'depositor', label: 'ผู้ทำรายการ', defaultTop: 90, defaultLeft: 165 },
  ];
}

function getBBLFields() {
  return [
    { name: 'branch', label: 'สาขา', defaultTop: 20, defaultLeft: 15 },
    { name: 'date', label: 'วันที่', defaultTop: 26, defaultLeft: 15 },
    { name: 'accountType', label: 'ประเภทบัญชี', defaultTop: 16, defaultLeft: 80 },
    { name: 'depositor', label: 'ผู้นำฝาก', defaultTop: 33, defaultLeft: 15 },
    { name: 'phone', label: 'โทรศัพท์', defaultTop: 33, defaultLeft: 85 },
    { name: 'accountNo', label: 'เลขที่บัญชี (ตำแหน่ง)', defaultTop: 33, defaultLeft: 160 },
    { name: 'accountNo_gap1', label: 'เลขที่บัญชี - ระยะขีดที่ 1 (ระหว่างส่วน 1-2)', defaultTop: 0, defaultLeft: 0 },
    { name: 'accountNo_gap2', label: 'เลขที่บัญชี - ระยะขีดที่ 2 (ระหว่างส่วน 2-3)', defaultTop: 0, defaultLeft: 0 },
    { name: 'accountName', label: 'ชื่อบัญชี', defaultTop: 40, defaultLeft: 15 },
    { name: 'accountBranch', label: 'สาขาเจ้าของบัญชี', defaultTop: 40, defaultLeft: 120 },
    { name: 'chequeRow', label: 'รายการเช็ค - เลขที่เช็ค', defaultTop: 62, defaultLeft: 15 },
    { name: 'chequeBank', label: 'รายการเช็ค - ธนาคาร/สาขา', defaultTop: 62, defaultLeft: 50 },
    { name: 'chequeDate', label: 'รายการเช็ค - วันที่เช็ค', defaultTop: 62, defaultLeft: 115 },
    { name: 'chequeAmt', label: 'รายการเช็ค - จำนวนเงิน', defaultTop: 62, defaultLeft: 155 },
    { name: 'amountWords', label: 'จำนวนเงินตัวอักษร', defaultTop: 99, defaultLeft: 15 },
    { name: 'totalAmount', label: 'จำนวนเงินรวม', defaultTop: 99, defaultLeft: 140 },
  ];
}

function openKTBFieldAdjust() {
  openFieldAdjustment('KTB', getKTBFields(), {});
}
function openUOBFieldAdjust() {
  openFieldAdjustment('UOB', getUOBFields(), {});
}
function openBBLFieldAdjust() {
  openFieldAdjustment('BBL', getBBLFields(), {});
}

// สำหรับ modal พิมพ์เช็ค
function getCHQFields(formType) {
  if (formType === 'BBL_CHQ') {
    return [
      { name: 'date', label: 'วันที่', defaultTop: 4.2, defaultLeft: 148 },
      { name: 'payee', label: 'ผู้รับเงิน', defaultTop: 8.5, defaultLeft: 20 },
      { name: 'amountText', label: 'จำนวนเงินตัวอักษร', defaultTop: 12.7, defaultLeft: 55 },
      { name: 'amountNum', label: 'จำนวนเงินตัวเลข', defaultTop: 16.9, defaultLeft: 148 },
    ];
  }
  if (formType === 'UOB_CHQ') {
    return [
      { name: 'date', label: 'วันที่', defaultTop: 5, defaultLeft: 155 },
      { name: 'payee', label: 'ผู้รับเงิน (Pay to)', defaultTop: 15, defaultLeft: 38 },
      { name: 'amountText', label: 'จำนวนเงินตัวอักษร (The sum of)', defaultTop: 24, defaultLeft: 38 },
      { name: 'amountNum', label: 'จำนวนเงินตัวเลข (฿)', defaultTop: 24, defaultLeft: 145 },
    ];
  }
  if (formType === 'BBL_SV') {
    return [
      { name: 'date', label: 'วันที่', defaultTop: 8.5, defaultLeft: 90 },
      { name: 'phone', label: 'โทร.', defaultTop: 8.5, defaultLeft: 155 },
      { name: 'payee', label: 'ชื่อบัญชี', defaultTop: 12.7, defaultLeft: 55 },
      { name: 'branch', label: 'สาขา', defaultTop: 12.7, defaultLeft: 125 },
      { name: 'accountNo', label: 'เลขที่บัญชี', defaultTop: 12.7, defaultLeft: 155 },
      { name: 'depositor', label: 'ผู้นำฝาก', defaultTop: 16.9, defaultLeft: 10 },
      { name: 'chequeNo', label: 'เลขที่เช็ค', defaultTop: 21.2, defaultLeft: 20 },
      { name: 'chequeBank', label: 'ธนาคาร/สาขาเช็ค', defaultTop: 21.2, defaultLeft: 90 },
      { name: 'chequeDate', label: 'วันที่เช็ค', defaultTop: 21.2, defaultLeft: 125 },
      { name: 'chequeAmt', label: 'จำนวนเงินเช็ค', defaultTop: 21.2, defaultLeft: 155 },
      { name: 'amountText', label: 'จำนวนเงินตัวอักษร', defaultTop: 46.5, defaultLeft: 20 },
      { name: 'totalAmount', label: 'ยอดรวม', defaultTop: 46.5, defaultLeft: 155 },
    ];
  }
  if (formType === 'KTB_SV') {
    return [
      { name: 'payee', label: 'ชื่อบัญชี', defaultTop: 16.9, defaultLeft: 20 },
      { name: 'accountNo', label: 'เลขที่บัญชี', defaultTop: 16.9, defaultLeft: 125 },
      { name: 'branch', label: 'สาขา', defaultTop: 16.9, defaultLeft: 160 },
      { name: 'depositor', label: 'ผู้นำฝาก', defaultTop: 29.6, defaultLeft: 20 },
      { name: 'totalAmount', label: 'จำนวนเงิน', defaultTop: 29.6, defaultLeft: 125 },
    ];
  }
  return [];
}

function openCHQFieldAdjust() {
  const formType = document.getElementById('printFormType').value;
  if (!formType) { alert('กรุณาเลือกประเภทฟอร์ม'); return; }
  const fields = getCHQFields(formType);
  openFieldAdjustment(formType, fields, {});
}

// ============ PRINTER SETUP GUIDE ============

function openPrinterSetupGuide() {
  window.open('/printer-setup-guide.html', '_blank', 'width=750,height=800');
}

// ============ PWA SERVICE WORKER ============
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}
