document.addEventListener('DOMContentLoaded', () => {
  const API = '';
  let authToken = '';

  function authFetch(url, opts = {}) {
    opts.headers = { ...opts.headers, 'x-auth-token': authToken };
    return fetch(url, opts);
  }

  // LOGIN
  document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPass').value;
    try {
      const res = await fetch(`${API}/api/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (data.success) {
        authToken = data.token;
        document.getElementById('loginScreen').style.display = 'none';
        document.getElementById('dashboard').style.display = 'block';
        loadPage('overview');
      } else {
        document.getElementById('loginError').textContent = 'Invalid email or password';
      }
    } catch {
      document.getElementById('loginError').textContent = 'Server connection failed';
    }
  });

  document.getElementById('logoutBtn').addEventListener('click', () => {
    authToken = '';
    document.getElementById('dashboard').style.display = 'none';
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('loginError').textContent = '';
  });

  // NAV TABS
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      loadPage(tab.dataset.page);
    });
  });

  function loadPage(page) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(`page${page.charAt(0).toUpperCase()}${page.slice(1)}`).classList.add('active');
    switch(page) {
      case 'overview': loadOverview(); break;
      case 'pending': loadPending(); break;
      case 'approved': loadApproved(); break;
      case 'rejected': loadRejected(); break;
      case 'history': loadHistory(); break;
    }
  }

  // OVERVIEW
  async function loadOverview() {
    try {
      const res = await authFetch(`${API}/api/stats`);
      const d = await res.json();
      document.getElementById('statUsers').textContent = d.totalUsers;
      document.getElementById('statPending').textContent = d.pendingPayments;
      document.getElementById('statApproved').textContent = d.completedPayments;
      document.getElementById('statRejected').textContent = d.rejectedPayments || 0;
      document.getElementById('statRevenue').textContent = `PKR ${d.totalRevenue.toLocaleString()}`;

      const list = document.getElementById('recentList');
      if (!d.recentRegistrations.length) {
        list.innerHTML = '<div class="empty-state">No registrations yet</div>';
        return;
      }
      list.innerHTML = d.recentRegistrations.map(r => `
        <div class="list-item">
          <div class="item-top">
            <span class="item-name">${r.full_name}</span>
            <span class="item-status ${r.payment_status}">${r.payment_status}</span>
          </div>
          <div class="item-details">
            <span>📞 ${r.whatsapp}</span>
            <span>💰 PKR ${r.joining_fee}</span>
            <span>📄 ${r.pages}p</span>
            <span>📅 ${new Date(r.created_at).toLocaleDateString()}</span>
          </div>
        </div>
      `).join('');
    } catch { showToast('Failed to load', 'error'); }
  }

  // PENDING
  async function loadPending() {
    try {
      const res = await authFetch(`${API}/api/payments/pending`);
      const data = await res.json();
      const list = document.getElementById('pendingList');
      if (!data.length) {
        list.innerHTML = '<div class="empty-state">🎉 No pending payments!</div>';
        return;
      }
      list.innerHTML = data.map(p => `
        <div class="list-item">
          <div class="item-top">
            <div>
              <div class="item-name">${p.full_name}</div>
              <div class="item-details" style="margin-top:4px">
                <span>📞 ${p.whatsapp}</span>
                <span>💰 PKR ${p.amount}</span>
                <span>📅 ${new Date(p.created_at).toLocaleDateString()}</span>
              </div>
              ${p.payment_method ? `<div class="item-details" style="margin-top:4px"><span>💳 ${p.payment_method}: ${p.payment_number || '-'}</span></div>` : ''}
              ${p.payment_proof ? `<div style="margin-top:6px"><img src="${API}${p.payment_proof}" class="proof-img" onclick="showProof('${API}${p.payment_proof}')" alt="proof"></div>` : ''}
            </div>
            <span class="item-status pending">Pending</span>
          </div>
          <div class="item-actions">
            <button class="btn btn-success btn-sm" onclick="approvePayment(${p.id})">✅ Approve</button>
            <button class="btn btn-danger btn-sm" onclick="rejectPayment(${p.id})">❌ Reject</button>
          </div>
        </div>
      `).join('');
    } catch { showToast('Failed to load', 'error'); }
  }
  document.getElementById('refreshPending')?.addEventListener('click', loadPending);

  // APPROVED
  async function loadApproved() {
    try {
      const res = await authFetch(`${API}/api/payments`);
      const data = await res.json();
      const approved = data.filter(p => p.status === 'approved' || p.status === 'completed');
      const list = document.getElementById('approvedList');
      if (!approved.length) {
        list.innerHTML = '<div class="empty-state">No approved payments yet</div>';
        return;
      }
      list.innerHTML = approved.map(p => `
        <div class="list-item">
          <div class="item-top">
            <div>
              <div class="item-name">${p.full_name}</div>
              <div class="item-details" style="margin-top:4px">
                <span>📞 ${p.whatsapp}</span>
                <span>💰 PKR ${p.amount}</span>
                <span>📅 ${new Date(p.created_at).toLocaleDateString()}</span>
                ${p.transaction_id ? `<span>🆔 ${p.transaction_id}</span>` : ''}
              </div>
            </div>
            <span class="item-status completed">Approved</span>
          </div>
        </div>
      `).join('');
    } catch { showToast('Failed to load', 'error'); }
  }

  // REJECTED
  async function loadRejected() {
    try {
      const res = await authFetch(`${API}/api/payments`);
      const data = await res.json();
      const rejected = data.filter(p => p.status === 'rejected');
      const list = document.getElementById('rejectedList');
      if (!rejected.length) {
        list.innerHTML = '<div class="empty-state">No rejected payments</div>';
        return;
      }
      list.innerHTML = rejected.map(p => `
        <div class="list-item">
          <div class="item-top">
            <div>
              <div class="item-name">${p.full_name}</div>
              <div class="item-details" style="margin-top:4px">
                <span>📞 ${p.whatsapp}</span>
                <span>💰 PKR ${p.amount}</span>
                <span>📅 ${new Date(p.created_at).toLocaleDateString()}</span>
              </div>
            </div>
            <span class="item-status rejected">Rejected</span>
          </div>
        </div>
      `).join('');
    } catch { showToast('Failed to load', 'error'); }
  }

  // HISTORY
  async function loadHistory() {
    try {
      const res = await authFetch(`${API}/api/payments/history`);
      const data = await res.json();
      const list = document.getElementById('historyList');
      if (!data.length) {
        list.innerHTML = '<div class="empty-state">No history yet</div>';
        return;
      }
      list.innerHTML = data.map(h => `
        <div class="list-item">
          <div class="item-top">
            <div>
              <div class="item-name">${h.full_name}</div>
              <div class="item-details" style="margin-top:4px">
                <span>📞 ${h.whatsapp || '-'}</span>
                <span>💰 PKR ${h.amount || 0}</span>
                <span>📅 ${new Date(h.timestamp).toLocaleString()}</span>
                ${h.transaction_id ? `<span>🆔 ${h.transaction_id}</span>` : ''}
              </div>
            </div>
            <span class="item-status ${h.status}">${h.action}</span>
          </div>
        </div>
      `).join('');
    } catch { showToast('Failed to load', 'error'); }
  }
  document.getElementById('refreshHistory')?.addEventListener('click', loadHistory);

  // APPROVE / REJECT
  window.approvePayment = async (id) => {
    const tx = prompt('Transaction ID (optional):') || '';
    if (!confirm('Approve this payment?')) return;
    try {
      await authFetch(`${API}/api/payments/${id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'approved', transaction_id: tx })
      });
      showToast('Payment approved!', 'success');
      loadPending();
    } catch { showToast('Failed', 'error'); }
  };

  window.rejectPayment = async (id) => {
    if (!confirm('Reject this payment?')) return;
    try {
      await authFetch(`${API}/api/payments/${id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'rejected' })
      });
      showToast('Payment rejected', 'info');
      loadPending();
    } catch { showToast('Failed', 'error'); }
  };

  window.showProof = (src) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.onclick = () => overlay.remove();
    overlay.innerHTML = `<div class="modal-content" onclick="event.stopPropagation()"><img src="${src}" alt="Payment Proof"><button class="modal-close" onclick="this.closest('.modal-overlay').remove()">Close</button></div>`;
    document.body.appendChild(overlay);
  };

  function showToast(msg, type = 'success') {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.className = `toast ${type} show`;
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.remove('show'), 3000);
  }
});
