import formidable from 'formidable';
import fs from 'fs';
import path from 'path';

const DATA_DIR = '/tmp/data';
const UPLOADS_DIR = '/tmp/uploads';

try {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
} catch (e) { console.error('Dir error:', e.message); }

function readJson(file) {
  const fp = path.join(DATA_DIR, file);
  if (!fs.existsSync(fp)) return [];
  try { return JSON.parse(fs.readFileSync(fp, 'utf8')); } catch { return []; }
}

function writeJson(file, data) {
  fs.writeFileSync(path.join(DATA_DIR, file), JSON.stringify(data, null, 2), 'utf8');
}

try {
  if (!fs.existsSync(path.join(DATA_DIR, 'packages.json'))) {
    writeJson('packages.json', [
      { id: 1, joining_fee: 1000, daily_salary: 2000, pages: 10, work_types: 'handwritten, MS word', is_active: true },
      { id: 2, joining_fee: 2000, daily_salary: 4000, pages: 20, work_types: 'handwritten, MS word', is_active: true },
      { id: 3, joining_fee: 3000, daily_salary: 5000, pages: 25, work_types: 'handwritten, MS word', is_active: true }
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

let adminToken = null;

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  const { path: route } = req.query;
  const fullPath = '/api/' + (Array.isArray(route) ? route.join('/') : route || '');

  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,x-auth-token');
  if (req.method === 'OPTIONS') return res.status(200).end();

  function requireAuth() {
    if (req.headers['x-auth-token'] === adminToken) return true;
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }

  // POST /api/register
  if (fullPath === '/api/register' && req.method === 'POST') {
    const buf = await new Promise((resolve) => { let d = ''; req.on('data', c => d += c); req.on('end', () => resolve(d)); });
    const body = JSON.parse(buf);
    const { full_name, cnic, qualification, whatsapp, gender, payment_method, payment_number, package_id } = body;
    if (!full_name || !cnic || !whatsapp || !gender || !payment_method || !payment_number) {
      return res.status(400).json({ success: false, error: 'All fields required' });
    }
    const packages = readJson('packages.json');
    const pkg = packages.find(p => p.id === parseInt(package_id));
    const registrations = readJson('registrations.json');
    const reg = {
      id: nextId(registrations), full_name, cnic, qualification, whatsapp, gender,
      payment_method, payment_number, package_id: parseInt(package_id),
      joining_fee: pkg ? pkg.joining_fee : 0, pages: pkg ? pkg.pages : 0,
      daily_salary: pkg ? pkg.daily_salary : 0,
      payment_status: 'pending', created_at: new Date().toISOString()
    };
    registrations.push(reg);
    writeJson('registrations.json', registrations);
    const payments = readJson('payments.json');
    payments.push({
      id: nextId(payments), registration_id: reg.id, full_name, whatsapp,
      amount: pkg ? pkg.joining_fee : 0, status: 'pending',
      payment_method, payment_number, created_at: reg.created_at
    });
    writeJson('payments.json', payments);
    return res.json({ success: true, id: reg.id, message: 'Registration successful' });
  }

  // POST /api/upload-proof/:id
  const uploadMatch = fullPath.match(/^\/api\/upload-proof\/(\d+)$/);
  if (uploadMatch && req.method === 'POST') {
    const form = formidable({ uploadDir: UPLOADS_DIR, keepExtensions: true, filename: () => Date.now() + '-proof' });
    const [fields, files] = await form.parse(req);
    const file = files.proof?.[0];
    if (!file) return res.status(400).json({ success: false, error: 'No file' });
    const id = parseInt(uploadMatch[1]);
    const filename = path.basename(file.filepath);
    const payments = readJson('payments.json');
    const pidx = payments.findIndex(p => p.registration_id === id);
    if (pidx !== -1) {
      payments[pidx].payment_proof = '/uploads/' + filename;
      writeJson('payments.json', payments);
    }
    return res.json({ success: true, message: 'Payment submitted. Waiting for admin approval.', proof: filename });
  }

  // POST /api/admin/login
  if (fullPath === '/api/admin/login' && req.method === 'POST') {
    const buf = await new Promise((resolve) => { let d = ''; req.on('data', c => d += c); req.on('end', () => resolve(d)); });
    const body = JSON.parse(buf);
    const admins = readJson('admins.json');
    const admin = admins.find(a => a.email === body.email && a.password === body.password);
    if (admin) {
      adminToken = Math.random().toString(36).slice(2) + Date.now().toString(36);
      return res.json({ success: true, token: adminToken });
    }
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  // Protected routes below
  if (fullPath === '/api/registrations' && req.method === 'GET') {
    if (!requireAuth()) return;
    return res.json(readJson('registrations.json').reverse());
  }

  const regMatch = fullPath.match(/^\/api\/registrations\/(\d+)$/);
  if (regMatch && req.method === 'GET') {
    if (!requireAuth()) return;
    const reg = readJson('registrations.json').find(r => r.id === parseInt(regMatch[1]));
    if (!reg) return res.status(404).json({ error: 'Not found' });
    return res.json(reg);
  }
  if (regMatch && req.method === 'DELETE') {
    if (!requireAuth()) return;
    let registrations = readJson('registrations.json');
    registrations = registrations.filter(r => r.id !== parseInt(regMatch[1]));
    writeJson('registrations.json', registrations);
    let payments = readJson('payments.json');
    payments = payments.filter(p => p.registration_id !== parseInt(regMatch[1]));
    writeJson('payments.json', payments);
    return res.json({ success: true });
  }

  // PUT /api/payments/:id/status
  const payStatusMatch = fullPath.match(/^\/api\/payments\/(\d+)\/status$/);
  if (payStatusMatch && req.method === 'PUT') {
    if (!requireAuth()) return;
    const buf = await new Promise((resolve) => { let d = ''; req.on('data', c => d += c); req.on('end', () => resolve(d)); });
    const body = JSON.parse(buf);
    const pid = parseInt(payStatusMatch[1]);
    const payments = readJson('payments.json');
    const pidx = payments.findIndex(p => p.id === pid);
    if (pidx === -1) return res.status(404).json({ error: 'Payment not found' });
    payments[pidx].status = body.status || 'approved';
    if (body.transaction_id) payments[pidx].transaction_id = body.transaction_id;
    writeJson('payments.json', payments);
    const rid = payments[pidx].registration_id;
    const registrations = readJson('registrations.json');
    const ridx = registrations.findIndex(r => r.id === rid);
    if (ridx !== -1) {
      registrations[ridx].payment_status = body.status === 'rejected' ? 'rejected' : 'completed';
      writeJson('registrations.json', registrations);
    }
    const history = readJson('payment_history.json');
    history.push({
      id: nextId(history), registration_id: rid,
      full_name: payments[pidx].full_name, whatsapp: payments[pidx].whatsapp,
      amount: payments[pidx].amount,
      action: body.status === 'rejected' ? 'rejected' : 'approved',
      status: body.status === 'rejected' ? 'rejected' : 'completed',
      transaction_id: body.transaction_id || '', timestamp: new Date().toISOString()
    });
    writeJson('payment_history.json', history);
    return res.json({ success: true });
  }

  // GET /api/payments
  if (fullPath === '/api/payments' && req.method === 'GET') {
    if (!requireAuth()) return;
    return res.json(readJson('payments.json').reverse());
  }
  if (fullPath === '/api/payments/pending' && req.method === 'GET') {
    if (!requireAuth()) return;
    return res.json(readJson('payments.json').filter(p => p.status === 'pending').reverse());
  }
  if (fullPath === '/api/payments/history' && req.method === 'GET') {
    if (!requireAuth()) return;
    return res.json(readJson('payment_history.json').reverse());
  }

  // GET /api/packages
  if (fullPath === '/api/packages' && req.method === 'GET') {
    return res.json(readJson('packages.json').filter(p => p.is_active));
  }
  if (fullPath === '/api/packages' && req.method === 'POST') {
    if (!requireAuth()) return;
    const buf = await new Promise((resolve) => { let d = ''; req.on('data', c => d += c); req.on('end', () => resolve(d)); });
    const body = JSON.parse(buf);
    const packages = readJson('packages.json');
    const pkg = { id: nextId(packages), joining_fee: parseInt(body.joining_fee), daily_salary: parseInt(body.daily_salary), pages: parseInt(body.pages), work_types: body.work_types || 'handwritten, MS word', is_active: true };
    packages.push(pkg);
    writeJson('packages.json', packages);
    return res.json({ success: true, id: pkg.id });
  }
  const pkgMatch = fullPath.match(/^\/api\/packages\/(\d+)$/);
  if (pkgMatch && req.method === 'PUT') {
    if (!requireAuth()) return;
    const buf = await new Promise((resolve) => { let d = ''; req.on('data', c => d += c); req.on('end', () => resolve(d)); });
    const body = JSON.parse(buf);
    const packages = readJson('packages.json');
    const idx = packages.findIndex(p => p.id === parseInt(pkgMatch[1]));
    if (idx === -1) return res.status(404).json({ error: 'Not found' });
    Object.keys(body).forEach(k => packages[idx][k] = body[k]);
    writeJson('packages.json', packages);
    return res.json({ success: true });
  }
  if (pkgMatch && req.method === 'DELETE') {
    if (!requireAuth()) return;
    const packages = readJson('packages.json');
    const idx = packages.findIndex(p => p.id === parseInt(pkgMatch[1]));
    if (idx !== -1) packages[idx].is_active = false;
    writeJson('packages.json', packages);
    return res.json({ success: true });
  }

  // GET /api/stats
  if (fullPath === '/api/stats' && req.method === 'GET') {
    if (!requireAuth()) return;
    const registrations = readJson('registrations.json');
    const payments = readJson('payments.json');
    const pending = payments.filter(p => p.status === 'pending').length;
    const approved = payments.filter(p => p.status === 'approved' || p.status === 'completed').length;
    const rejected = payments.filter(p => p.status === 'rejected').length;
    const totalRevenue = payments.filter(p => p.status === 'approved' || p.status === 'completed').reduce((s, p) => s + (p.amount || 0), 0);
    return res.json({
      totalUsers: registrations.length, pendingPayments: pending,
      completedPayments: approved, rejectedPayments: rejected,
      totalRevenue, recentRegistrations: registrations.slice(-5).reverse()
    });
  }

  // Serve uploads
  if (fullPath.startsWith('/uploads/')) {
    const filePath = path.join(UPLOADS_DIR, path.basename(fullPath));
    if (fs.existsSync(filePath)) {
      const ext = path.extname(filePath).toLowerCase();
      const mimes = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp' };
      res.setHeader('Content-Type', mimes[ext] || 'application/octet-stream');
      res.setHeader('Cache-Control', 'public, max-age=31536000');
      return res.status(200).send(fs.readFileSync(filePath));
    }
    return res.status(404).json({ error: 'File not found' });
  }

  res.status(404).json({ error: 'Not found' });
}
