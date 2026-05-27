document.addEventListener('DOMContentLoaded', () => {
  const API = '';
  let currentRegId = null;

  // ===== REVEAL ON SCROLL =====
  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1 });

  document.querySelectorAll('.reveal').forEach(el => revealObserver.observe(el));

  // ===== PARALLAX FLOATING IMAGES =====
  const floats = document.querySelectorAll('.parallax-float');
  window.addEventListener('scroll', () => {
    const scrollY = window.scrollY;
    floats.forEach(el => {
      const speed = parseFloat(el.dataset.speed) || 0.05;
      el.style.transform = `translateY(${scrollY * speed}px)`;
    });
  });

  // ===== LOAD PACKAGES =====
  fetch(`${API}/api/packages`)
    .then(r => r.json())
    .then(packages => {
      const grid = document.getElementById('packagesGrid');
      if (!grid) return;
      grid.innerHTML = packages.map(pkg => {
        const isPopular = pkg.id === 3;
        return `<div class="package-card ${isPopular ? 'featured' : ''} reveal" data-pkg='${JSON.stringify(pkg)}'>
          <div class="package-fee">PKR ${pkg.joining_fee.toLocaleString()}</div>
          <div class="package-fee-label">Joining Fee</div>
          <span class="pkg-daily">Daily: PKR ${pkg.daily_salary.toLocaleString()}</span>
          <div class="package-detail"><span>📄</span> ${pkg.pages} Pages</div>
          <div class="package-detail"><span>⏱</span> 6 Months</div>
          <div class="package-detail">${(pkg.work_types || 'handwritten, MS word').split(',').map(t => `<span class="package-work-type">${t.trim()}</span>`).join('')}</div>
          <button class="pkg-select-btn select-pkg-btn">Select</button>
        </div>`;
      }).join('');

      document.querySelectorAll('.select-pkg-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const pkg = JSON.parse(btn.closest('.package-card').dataset.pkg);
          const sel = document.getElementById('packageSelect');
          if (sel) {
            const opt = Array.from(sel.options).find(o => o.value === String(pkg.id));
            if (opt) opt.selected = true;
          }
          updatePkgInfo(pkg);
          document.getElementById('register')?.scrollIntoView({ behavior: 'smooth' });
        });
      });

      populatePackageSelect(packages);
      if (packages.length > 0) updatePkgInfo(packages[0]);

      document.querySelectorAll('.package-card.reveal').forEach(el => revealObserver.observe(el));
    })
    .catch(() => {});

  function populatePackageSelect(packages) {
    const sel = document.getElementById('packageSelect');
    if (!sel) return;
    sel.innerHTML = packages.map(p =>
      `<option value="${p.id}" data-joining="${p.joining_fee}" data-pages="${p.pages}" data-salary="${p.daily_salary}">
        PKR ${p.joining_fee} · ${p.pages}p · Daily PKR ${p.daily_salary.toLocaleString()}
      </option>`
    ).join('');
    sel.addEventListener('change', () => {
      const opt = sel.options[sel.selectedIndex];
      if (opt) updatePkgInfo({ joining_fee: +opt.dataset.joining, pages: +opt.dataset.pages, daily_salary: +opt.dataset.salary });
    });
    if (packages.length) { sel.selectedIndex = 0; updatePkgInfo(packages[0]); }
  }

  function updatePkgInfo(pkg) {
    ['selectedPkgInfo','noticeAmount','noticePkgFee','noticeDaily'].forEach((id,i) => {
      const el = document.getElementById(id);
      if (!el) return;
      const vals = [
        `Joining PKR ${pkg.joining_fee.toLocaleString()} · ${pkg.pages}p · Daily PKR ${pkg.daily_salary.toLocaleString()}`,
        `PKR ${pkg.joining_fee.toLocaleString()}`,
        `PKR ${pkg.joining_fee.toLocaleString()}`,
        `PKR ${pkg.daily_salary.toLocaleString()}`
      ];
      el.textContent = vals[i];
    });
  }

  // ===== REGISTRATION =====
  const form = document.getElementById('registrationForm');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const sel = document.getElementById('packageSelect');
      const opt = sel?.options[sel.selectedIndex];
      const fd = new FormData(form);
      const pm = fd.get('payment_method');
      if (!pm) return showToast('Select a payment method', 'error');
      if (!fd.get('gender')) return showToast('Select your gender', 'error');
      if (!fd.get('payment_number')) return showToast('Enter your payment number', 'error');

      try {
        const res = await fetch(`${API}/api/register`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            full_name: fd.get('full_name'), cnic: fd.get('cnic'),
            qualification: fd.get('qualification'), whatsapp: fd.get('whatsapp'),
            gender: fd.get('gender'), payment_method: pm,
            payment_number: fd.get('payment_number'), package_id: sel?.value || '1'
          })
        });
        const data = await res.json();
        if (data.success) {
          currentRegId = data.id;
          form.style.display = 'none';
          const s = document.getElementById('formSuccess');
          s.style.display = 'block';
          document.getElementById('statusMsg').style.display = 'block';
          document.getElementById('submitProofBtn').style.display = 'none';
          document.getElementById('payment')?.scrollIntoView({ behavior: 'smooth' });
          showToast('Registered! Submit payment proof below.', 'success');
          if (opt) updatePkgInfo({ joining_fee: +opt.dataset.joining, pages: +opt.dataset.pages, daily_salary: +opt.dataset.salary });
        } else showToast(data.error || 'Failed', 'error');
      } catch { showToast('Connection error', 'error'); }
    });
  }

  // ===== PROOF UPLOAD =====
  const uploadArea = document.getElementById('uploadArea');
  const proofInput = document.getElementById('proofInput');
  const uploadFileName = document.getElementById('uploadFileName');
  const proofPreview = document.getElementById('proofPreview');
  const submitBtn = document.getElementById('submitProofBtn');

  if (uploadArea && proofInput) {
    uploadArea.addEventListener('click', () => proofInput.click());
    uploadArea.addEventListener('dragover', e => { e.preventDefault(); uploadArea.classList.add('dragover'); });
    uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('dragover'));
    uploadArea.addEventListener('drop', e => { e.preventDefault(); uploadArea.classList.remove('dragover'); if (e.dataTransfer.files.length) { proofInput.files = e.dataTransfer.files; handleFile(e.dataTransfer.files[0]); } });
    proofInput.addEventListener('change', () => { if (proofInput.files.length) handleFile(proofInput.files[0]); });
  }

  function handleFile(file) {
    if (!file) return;
    uploadFileName.textContent = `📷 ${file.name}`;
    submitBtn.style.display = 'block';
    const reader = new FileReader();
    reader.onload = (e) => {
      proofPreview.style.display = 'block';
      proofPreview.innerHTML = `<div class="proof-preview"><img src="${e.target.result}" class="uploaded-proof"><span>${file.name}</span></div>`;
    };
    reader.readAsDataURL(file);
  }

  if (submitBtn) {
    submitBtn.addEventListener('click', async () => {
      if (!currentRegId || !proofInput?.files?.length) return showToast('Select a file', 'error');
      const fd = new FormData();
      fd.append('proof', proofInput.files[0]);
      try {
        const res = await fetch(`${API}/api/upload-proof/${currentRegId}`, { method: 'POST', body: fd });
        const d = await res.json();
        if (d.success) {
          showToast('Proof submitted! Waiting for approval.', 'success');
          submitBtn.textContent = '✅ Submitted';
          submitBtn.disabled = true;
          submitBtn.style.opacity = '0.6';
          uploadArea.style.display = 'none';
        } else showToast('Upload failed', 'error');
      } catch { showToast('Upload failed', 'error'); }
    });
  }

  // ===== BOTTOM NAV ACTIVE =====
  const sections = document.querySelectorAll('section[id]');
  const bnavItems = document.querySelectorAll('.bnav-item');
  const navPillLinks = document.querySelectorAll('.nav-links a');

  function updateNav() {
    let current = '';
    sections.forEach(s => { const top = s.getBoundingClientRect().top; if (top <= 200) current = s.id; });
    bnavItems.forEach(item => item.classList.toggle('active', item.getAttribute('href') === `#${current}`));
    navPillLinks.forEach(a => a.classList.toggle('active', a.getAttribute('href') === `#${current}`));
  }
  window.addEventListener('scroll', updateNav);
  window.addEventListener('load', updateNav);

  // ===== MOBILE MENU TOGGLE =====
  const navToggle = document.getElementById('navToggle');
  const mobileNav = document.getElementById('mobileNav');
  if (navToggle && mobileNav) {
    navToggle.addEventListener('click', () => mobileNav.classList.toggle('open'));
    mobileNav.querySelectorAll('a').forEach(a => a.addEventListener('click', () => mobileNav.classList.remove('open')));
  }

  // ===== NAVBAR SCROLL =====
  window.addEventListener('scroll', () => {
    document.querySelector('.navbar')?.classList.toggle('scrolled', window.scrollY > 80);
  });

  // ===== COPY =====
  document.querySelectorAll('.btn-copy').forEach(btn => {
    btn.addEventListener('click', () => {
      const t = btn.dataset.copy;
      if (navigator.clipboard) navigator.clipboard.writeText(t).then(() => showToast('Copied!', 'success')).catch(() => fallbackCopy(t));
      else fallbackCopy(t);
    });
  });
  function fallbackCopy(t) {
    const ta = document.createElement('textarea');
    ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select(); document.execCommand('copy');
    document.body.removeChild(ta); showToast('Copied!', 'success');
  }

  // ===== TOAST =====
  window.showToast = function(msg, type = 'success') {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg; t.className = `toast ${type} show`;
    clearTimeout(t._timer); t._timer = setTimeout(() => t.classList.remove('show'), 3500);
  };

  // ===== CONTACT FORM =====
  document.getElementById('contactForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    showToast('Message sent!', 'success');
    e.target.reset();
  });
});
