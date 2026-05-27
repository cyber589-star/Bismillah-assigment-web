const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;
const isVercel = !!process.env.VERCEL;
const BASE = isVercel ? process.cwd() : __dirname;
const DATA_DIR = isVercel ? '/tmp/data' : path.join(BASE, 'data');
const UPLOADS_DIR = isVercel ? '/tmp/uploads' : path.join(BASE, 'public', 'uploads');

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(BASE, 'public')));
app.use('/admin', express.static(path.join(BASE, 'admin')));

try {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
} catch (e) { console.error('Dir error:', e.message); }

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

function readJson(file) {
  const fp = path.join(DATA_DIR, file);
  if (!fs.existsSync(fp)) return [];
  try { return JSON.parse(fs.readFileSync(fp, 'utf8')); } catch { return []; }
}

function writeJson(file, data) {
  fs.writeFileSync(path.join(DATA_DIR, file), JSON.stringify(data, null, 2), 'utf8');
}

// Seed default data
try {
if (!fs.existsSync(path.join(DATA_DIR, 'packages.json'))) {
  writeJson('packages.json', [
    { id: 1, joining_fee: 1000, daily_salary: 4100, pages: 4, work_types: 'handwritten, MS word', is_active: true },
    { id: 2, joining_fee: 2600, daily_salary: 7200, pages: 5, work_types: 'handwritten, MS word', is_active: true },
    { id: 3, joining_fee: 4100, daily_salary: 11200, pages: 6, work_types: 'handwritten, MS word', is_active: true },
    { id: 4, joining_fee: 6200, daily_salary: 16400, pages: 8, work_types: 'handwritten, MS word', is_active: true },
    { id: 5, joining_fee: 8000, daily_salary: 19100, pages: 9, work_types: 'handwritten, MS word', is_active: true }
  ]);
}
if (!fs.existsSync(path.join(DATA_DIR, 'admins.json'))) {
  writeJson('admins.json', [{ id: 1, email: 'rehan1122@atomicmail.io', password: 'Khan!' }]);
}
  ['registrations.json', 'payments.json', 'payment_history.json'].forEach(f => {
    if (!fs.existsSync(path.join(DATA_DIR, f))) writeJson(f, []);
  });
} catch (e) { console.error('Seed error:', e.message); }

function nextId(arr) { return arr.length > 0 ? Math.max(...arr.map(x => x.id)) + 1 : 1; }

// REGISTRATION
app.post('/api/register', (req, res) => {
  const { full_name, cnic, qualification, whatsapp, gender, payment_method, payment_number, package_id } = req.body;
  if (!full_name || !cnic || !whatsapp || !package_id) {
    return res.status(400).json({ error: 'Required fields missing' });
  }
  const packages = readJson('packages.json');
  const pkg = packages.find(p => p.id === parseInt(package_id) && p.is_active);
  if (!pkg) return res.status(400).json({ error: 'Invalid package' });

  const registrations = readJson('registrations.json');
  const reg = {
    id: nextId(registrations),
    full_name, cnic, qualification: qualification || '', whatsapp, gender: gender || '',
    payment_method: payment_method || '', payment_number: payment_number || '',
    package_id: pkg.id, joining_fee: pkg.joining_fee, daily_salary: pkg.daily_salary,
    pages: pkg.pages, work_types: pkg.work_types,
    payment_status: 'pending', payment_proof: '',
    created_at: new Date().toISOString()
  };
  registrations.push(reg);
  writeJson('registrations.json', registrations);

  // Auto-create payment record
  const payments = readJson('payments.json');
  const payment = {
    id: nextId(payments),
    registration_id: reg.id, full_name, whatsapp, cnic,
    package_name: `PKR ${pkg.joining_fee} · ${pkg.pages}p`,
    amount: pkg.joining_fee, daily_salary: pkg.daily_salary,
    payment_method: payment_method || '', payment_number: payment_number || '',
    status: 'pending', transaction_id: '', payment_proof: '',
    created_at: new Date().toISOString()
  };
  payments.push(payment);
  writeJson('payments.json', payments);

  // History entry
  const history = readJson('payment_history.json');
  history.push({
    id: nextId(history), registration_id: reg.id, full_name, whatsapp,
    amount: pkg.joining_fee, action: 'registered', status: 'pending',
    timestamp: new Date().toISOString()
  });
  writeJson('payment_history.json', history);

  res.json({ success: true, id: reg.id, message: 'Payment Pending – Waiting for Admin Approval', registration: reg });
});

// PAYMENT PROOF UPLOAD
app.post('/api/upload-proof/:id', upload.single('proof'), (req, res) => {
  const id = parseInt(req.params.id);
  const registrations = readJson('registrations.json');
  const idx = registrations.findIndex(r => r.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });

  const filename = req.file ? '/uploads/' + req.file.filename : '';
  registrations[idx].payment_proof = filename;
  registrations[idx].payment_status = 'pending';
  writeJson('registrations.json', registrations);

  const payments = readJson('payments.json');
  const pidx = payments.findIndex(p => p.registration_id === id);
  if (pidx !== -1) {
    payments[pidx].payment_proof = filename;
    payments[pidx].status = 'pending';
    writeJson('payments.json', payments);
  }

  const history = readJson('payment_history.json');
  history.push({
    id: nextId(history), registration_id: id,
    full_name: registrations[idx].full_name,
    whatsapp: registrations[idx].whatsapp,
    amount: registrations[idx].joining_fee,
    action: 'payment_submitted', status: 'pending',
    proof: filename, timestamp: new Date().toISOString()
  });
  writeJson('payment_history.json', history);

  res.json({ success: true, message: 'Payment submitted. Waiting for admin approval.', proof: filename });
});

// REGISTRATIONS
// PROTECTED ADMIN ROUTES
app.get('/api/registrations', requireAuth, (req, res) => {
  res.json(readJson('registrations.json').reverse());
});
app.get('/api/registrations/:id', requireAuth, (req, res) => {
  const reg = readJson('registrations.json').find(r => r.id === parseInt(req.params.id));
  if (!reg) return res.status(404).json({ error: 'Not found' });
  res.json(reg);
});
app.delete('/api/registrations/:id', requireAuth, (req, res) => {
  let registrations = readJson('registrations.json');
  registrations = registrations.filter(r => r.id !== parseInt(req.params.id));
  writeJson('registrations.json', registrations);
  let payments = readJson('payments.json');
  payments = payments.filter(p => p.registration_id !== parseInt(req.params.id));
  writeJson('payments.json', payments);
  res.json({ success: true });
});

app.put('/api/payments/:id/status', requireAuth, (req, res) => {
  const { status, transaction_id } = req.body;
  const pid = parseInt(req.params.id);
  const payments = readJson('payments.json');
  const pidx = payments.findIndex(p => p.id === pid);
  if (pidx === -1) return res.status(404).json({ error: 'Payment not found' });

  payments[pidx].status = status || 'approved';
  if (transaction_id) payments[pidx].transaction_id = transaction_id;
  writeJson('payments.json', payments);

  const rid = payments[pidx].registration_id;
  const registrations = readJson('registrations.json');
  const ridx = registrations.findIndex(r => r.id === rid);
  if (ridx !== -1) {
    registrations[ridx].payment_status = status === 'rejected' ? 'rejected' : 'completed';
    writeJson('registrations.json', registrations);
  }

  const history = readJson('payment_history.json');
  history.push({
    id: nextId(history), registration_id: rid,
    full_name: payments[pidx].full_name,
    whatsapp: payments[pidx].whatsapp,
    amount: payments[pidx].amount,
    action: status === 'rejected' ? 'rejected' : 'approved',
    status: status === 'rejected' ? 'rejected' : 'completed',
    transaction_id: transaction_id || '',
    timestamp: new Date().toISOString()
  });
  writeJson('payment_history.json', history);

  res.json({ success: true });
});

app.get('/api/payments', requireAuth, (req, res) => {
  res.json(readJson('payments.json').reverse());
});
app.get('/api/payments/pending', requireAuth, (req, res) => {
  res.json(readJson('payments.json').filter(p => p.status === 'pending').reverse());
});
app.get('/api/payments/history', requireAuth, (req, res) => {
  res.json(readJson('payment_history.json').reverse());
});

// PACKAGES
app.get('/api/packages', (req, res) => {
  res.json(readJson('packages.json').filter(p => p.is_active));
});
app.post('/api/packages', requireAuth, (req, res) => {
  const { joining_fee, daily_salary, pages, work_types } = req.body;
  const packages = readJson('packages.json');
  const pkg = { id: nextId(packages), joining_fee: parseInt(joining_fee), daily_salary: parseInt(daily_salary), pages: parseInt(pages), work_types: work_types || 'handwritten, MS word', is_active: true };
  packages.push(pkg);
  writeJson('packages.json', packages);
  res.json({ success: true, id: pkg.id });
});
app.put('/api/packages/:id', requireAuth, (req, res) => {
  const packages = readJson('packages.json');
  const idx = packages.findIndex(p => p.id === parseInt(req.params.id));
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  Object.keys(req.body).forEach(k => packages[idx][k] = req.body[k]);
  writeJson('packages.json', packages);
  res.json({ success: true });
});
app.delete('/api/packages/:id', requireAuth, (req, res) => {
  const packages = readJson('packages.json');
  const idx = packages.findIndex(p => p.id === parseInt(req.params.id));
  if (idx !== -1) packages[idx].is_active = false;
  writeJson('packages.json', packages);
  res.json({ success: true });
});

app.get('/api/stats', requireAuth, (req, res) => {
  const registrations = readJson('registrations.json');
  const payments = readJson('payments.json');
  const pending = payments.filter(p => p.status === 'pending').length;
  const approved = payments.filter(p => p.status === 'approved' || p.status === 'completed').length;
  const rejected = payments.filter(p => p.status === 'rejected').length;
  const totalRevenue = payments.filter(p => p.status === 'approved' || p.status === 'completed').reduce((s, p) => s + (p.amount || 0), 0);
  const todayPending = payments.filter(p => p.status === 'pending' && new Date(p.created_at).toDateString() === new Date().toDateString()).length;
  res.json({
    totalUsers: registrations.length,
    pendingPayments: pending,
    completedPayments: approved,
    rejectedPayments: rejected,
    totalRevenue,
    todayPending,
    recentRegistrations: registrations.slice(-5).reverse()
  });
});

// SIMPLE AUTH TOKEN SYSTEM
let adminToken = null;
function requireAuth(req, res, next) {
  if (req.headers['x-auth-token'] === adminToken) return next();
  res.status(401).json({ error: 'Unauthorized' });
}

app.post('/api/admin/login', (req, res) => {
  const { email, password } = req.body;
  const admins = readJson('admins.json');
  const admin = admins.find(a => a.email === email && a.password === password);
  if (admin) {
    adminToken = Math.random().toString(36).slice(2) + Date.now().toString(36);
    return res.json({ success: true, token: adminToken });
  }
  res.status(401).json({ error: 'Invalid credentials' });
});

app.get('/admin*', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin', 'index.html'));
});

if (!isVercel) {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Admin: http://localhost:${PORT}/admin`);
  });
}

module.exports = app;
