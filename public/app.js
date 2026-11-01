const $ = id => document.getElementById(id);
let token = localStorage.getItem('token'), user = JSON.parse(localStorage.getItem('user') || 'null');
let isReg = false, rating = 0;

const stars = n => '★'.repeat(Math.round(n)) + '☆'.repeat(5 - Math.round(n));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const when = d => d ? new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '';
function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 2800); }

async function api(url, method = 'GET', body) {
  const res = await fetch('/api' + url, {
    method, headers: { 'Content-Type': 'application/json', ...(token && { Authorization: 'Bearer ' + token }) },
    body: body && JSON.stringify(body)
  });
  const data = await res.json();
  if (res.status === 401 && token) logout();
  if (!res.ok) { const err = new Error(data.error || 'Something went wrong'); err.needsVerify = data.needsVerify; throw err; }
  return data;
}

// ---------- auth ----------
function setMode(reg) {
  isReg = reg;
  $('tabLogin').classList.toggle('active', !reg); $('tabReg').classList.toggle('active', reg);
  $('name').classList.toggle('hidden', !reg); $('role').classList.toggle('hidden', !reg);
  $('authBtn').textContent = reg ? 'Create account' : 'Log in';
  $('forgotLink').classList.toggle('hidden', reg); showErr(); syncCms();
}
$('tabLogin').onclick = () => setMode(false);
$('tabReg').onclick = () => setMode(true);
const showErr = (m, ok) => { $('err').textContent = m || ''; $('err').classList.toggle('ok', !!ok); };
const EYE = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>', EYE_OFF = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
$('pwToggle').onclick = () => {
  const p = $('password'), show = p.type === 'password';
  p.type = show ? 'text' : 'password'; $('pwToggle').innerHTML = show ? EYE_OFF : EYE;
  $('pwToggle').setAttribute('aria-label', show ? 'Hide password' : 'Show password');
};
$('authBtn').onclick = async () => {
  showErr();
  const name = $('name').value.trim(), email = $('email').value.trim(), password = $('password').value;
  if (isReg && name.length < 2) return showErr('Please enter your full name.');
  if (isReg && $('role').value === 'student' && !/^[A-Za-z0-9-]{4,15}$/.test($('cms').value.trim())) return showErr('Enter a valid CMS ID (4-15 letters, numbers or dashes).');
  if (!/^\S+@\S+\.\S+$/.test(email)) return showErr('Please enter a valid email address.');
  if (!password) return showErr('Please enter your password.');
  if (isReg && password.length < 6) return showErr('Password must be at least 6 characters.');
  try {
    if (isReg) {
      await api('/register', 'POST', { name, email, password, role: $('role').value, cms_id: $('cms').value.trim() });
      goVerify(email);
    } else {
      const d = await api('/login', 'POST', { email, password });
      token = d.token; user = d.user;
      localStorage.setItem('token', token); localStorage.setItem('user', JSON.stringify(user));
      start();
    }
  } catch (e) { if (e.needsVerify) goVerify(email); else showErr(e.message); }
};
['email', 'password', 'name'].forEach(id => $(id).addEventListener('keydown', e => { if (e.key === 'Enter') $('authBtn').click(); }));

// ---------- forgot password ----------
const ferr = (m, ok) => { $('ferr').textContent = m || ''; $('ferr').classList.toggle('ok', !!ok); };
const swap = forgot => { $('loginBox').classList.toggle('hidden', forgot); $('forgotBox').classList.toggle('hidden', !forgot); ferr(); };
$('forgotLink').onclick = e => { e.preventDefault(); $('fEmail').value = $('email').value; swap(true); };
$('backLogin').onclick = e => { e.preventDefault(); swap(false); };
$('sendCode').onclick = async () => {
  const email = $('fEmail').value.trim();
  if (!/^\S+@\S+\.\S+$/.test(email)) return ferr('Please enter a valid email address.');
  try { await api('/forgot', 'POST', { email }); $('step2').classList.remove('hidden');
    ferr('If this email is registered, a 6-digit code was created. Enter it below.', true); } catch (e) { ferr(e.message); }
};
$('doReset').onclick = async () => {
  const code = $('fCode').value.trim(), password = $('fPass').value;
  if (!/^\d{6}$/.test(code)) return ferr('Enter the 6-digit code.');
  if (password.length < 6) return ferr('New password must be at least 6 characters.');
  try { await api('/reset', 'POST', { email: $('fEmail').value.trim(), code, password });
    swap(false); $('email').value = $('fEmail').value.trim(); $('password').value = ''; showErr('Password updated. Please log in.', true); }
  catch (e) { ferr(e.message); }
};
function logout() { localStorage.removeItem('token'); localStorage.removeItem('user'); token = user = null; location.reload(); }
$('logout').onclick = logout;

// ---------- shared pieces ----------
function start() {
  $('authView').classList.add('hidden'); $('appView').classList.remove('hidden');
  $('who').innerHTML = `<b>${esc(user.name)}</b> <span class="pill">${user.role}</span>`;
  ({ student: studentView, teacher: reportView, admin: adminView })[user.role]();
}

const hero = (t, s) => `<div class="hero"><h1>${t}</h1><p>${s}</p></div>`;

function kpis(courses, fb) {
  const n = fb.length, avg = n ? (fb.reduce((a, f) => a + f.rating, 0) / n).toFixed(1) : '–';
  const pos = n ? Math.round(fb.filter(f => f.rating >= 4).length / n * 100) : 0;
  const items = [['📚 Courses', courses.length], ['💬 Responses', n], ['⭐ Average rating', avg], ['😊 Satisfied (4–5★)', pos + '%']];
  return `<div class="kpis">${items.map(([l, v]) => `<div class="kpi"><small>${l}</small><b>${v}</b></div>`).join('')}</div>`;
}

function distribution(fb) {
  const d = [5, 4, 3, 2, 1].map(r => ({ r, c: fb.filter(f => f.rating === r).length }));
  const max = Math.max(1, ...d.map(x => x.c));
  return `<div class="card"><h3>Rating distribution</h3>${d.map(x => `<div class="dist"><span class="stars">${x.r}★</span>
    <div class="bar"><i style="width:${x.c / max * 100}%"></i></div><b>${x.c}</b></div>`).join('')}</div>`;
}

const courseStats = courses => `<div class="grid">${courses.map(c => `
  <div class="stat"><small>${esc(c.teacher || 'No teacher')}</small><h3 style="margin:4px 0">${esc(c.title)}</h3>
  <b>${c.average || '–'}</b> <span class="stars">${c.average ? stars(c.average) : ''}</span><br><small>${c.total} response${c.total === 1 ? '' : 's'}${c.total < 3 ? ' · 🔒 average hidden until 3' : ''}</small>
  <div class="bar"><i style="width:${(c.average || 0) * 20}%"></i></div></div>`).join('')}</div>`;

function feedbackPanel(courses, fb) {
  const html = `<div class="card"><h3>Student feedback</h3><small>Shown once a course has 3 or more responses, to protect anonymity.</small><br><br>
    <div class="filters">
      <input id="fq" placeholder="Search comments…">
      <select id="fc"><option value="">All courses</option>${courses.map(c => `<option>${esc(c.title)}</option>`).join('')}</select>
      <select id="fr"><option value="">All ratings</option>${[5,4,3,2,1].map(n => `<option value="${n}">${n} stars</option>`).join('')}</select>
    </div><div id="fl"></div></div>`;
  setTimeout(() => {
    const draw = () => {
      const q = $('fq').value.toLowerCase(), c = $('fc').value, r = $('fr').value;
      const list = fb.filter(f => (!c || f.course === c) && (!r || f.rating == r) && (!q || (f.comment || '').toLowerCase().includes(q)));
      $('fl').innerHTML = list.length ? list.map(f => `<div class="item"><span class="stars">${stars(f.rating)}</span> <small>${when(f.created_at)}</small><br>
        A student rated <b>${esc(f.course)}</b> ${f.rating} star${f.rating > 1 ? 's' : ''}${f.comment ? `: <em>“${esc(f.comment)}”</em>` : ''}</div>`).join('')
        : '<p class="empty">No feedback matches your filters.</p>';
    };
    ['fq', 'fc', 'fr'].forEach(id => $(id).oninput = draw); draw();
  });
  return html;
}

// ---------- views ----------
async function studentView() {
  const [courses, mine] = await Promise.all([api('/courses'), api('/my-feedback')]);
  $('main').innerHTML = hero(`Hello, ${esc(user.name.split(' ')[0])}`, 'Share honest, anonymous feedback and help your teachers improve.') + `
  <div class="card"><h3>Give anonymous feedback</h3><div class="form">
    <select id="course">${courses.map(c => `<option value="${c.id}">${esc(c.title)}${c.teacher ? ' · ' + esc(c.teacher) : ''}</option>`).join('')}</select>
    <div class="rate" id="rate">${[1,2,3,4,5].map(n => `<span data-n="${n}">★</span>`).join('')}</div>
    <textarea id="comment" rows="3" maxlength="1000" placeholder="What went well? What can improve?"></textarea>
    <button class="btn" id="send">Submit feedback</button>
    <small>🔒 Truly anonymous: your name is never stored with your feedback.</small></div></div>
  <div class="card"><h3>My submissions</h3>${mine.length ? mine.map(f => `<div class="item"><b>${esc(f.course)}</b> <span class="pill">Submitted ✓</span></div>`).join('') : '<p class="empty">Nothing yet.</p>'}</div>`;
  rating = 0;
  $('rate').onclick = e => { if (!e.target.dataset.n) return; rating = +e.target.dataset.n;
    [...$('rate').children].forEach((s, i) => s.classList.toggle('on', i < rating)); };
  $('send').onclick = async () => {
    try { await api('/feedback', 'POST', { course_id: $('course').value, rating, comment: $('comment').value });
      toast('Thank you for your feedback!'); studentView(); } catch (e) { toast(e.message); }
  };
}

async function reportView() {
  const [all, fb] = await Promise.all([api('/courses'), api('/feedback')]);
  const courses = all.filter(c => c.teacher === user.name);
  $('main').innerHTML = hero('Your teaching insights', 'See how students experience your courses.') +
    kpis(courses, fb) + distribution(fb) + trend(fb) + `<div class="card"><h3>Your courses</h3>${courseStats(courses)}</div>` + feedbackPanel(courses, fb);
}

async function adminView() {
  const [courses, fb, teachers] = await Promise.all([api('/courses'), api('/feedback'), api('/teachers')]);
  $('main').innerHTML = hero('Admin dashboard', 'Monitor every course and manage the system.') +
    kpis(courses, fb) + distribution(fb) + trend(fb) + `<div class="card"><h3>Reports</h3><div class="actions"><button class="btn" id="csv">⬇ Export CSV</button><button class="btn ghost" id="pdf">🖨 Export PDF</button></div><small>PDF opens the print window: choose “Save as PDF”.</small></div>
  <div class="card"><h3>All courses</h3>${courseStats(courses)}</div>
  <div class="card"><h3>Manage courses</h3><div class="form">
    <input id="ctitle" placeholder="Course title">
    <select id="cteacher"><option value="">No teacher yet</option>${teachers.map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join('')}</select>
    <button class="btn" id="addC">Add course</button></div>
    ${courses.map(c => `<div class="row"><span>${esc(c.title)}</span><button class="btn danger" data-del="${c.id}">Delete</button></div>`).join('')}</div>` +
    feedbackPanel(courses, fb);
  $('addC').onclick = async () => {
    try { await api('/courses', 'POST', { title: $('ctitle').value, teacher_id: $('cteacher').value }); toast('Course added'); adminView(); }
    catch (e) { toast(e.message); }
  };
  $('csv').onclick = () => {
    const q = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
    const rows = [['Course', 'Rating', 'Comment', 'Date'], ...fb.map(f => [f.course, f.rating, f.comment, f.created_at])];
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['\ufeff' + rows.map(r => r.map(q).join(',')).join('\r\n')], { type: 'text/csv' }));
    a.download = 'sadaa-feedback.csv'; a.click();
  };
  $('pdf').onclick = () => window.print();
  document.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
    if (confirm('Delete this course and its feedback?')) { await api('/courses/' + b.dataset.del, 'DELETE'); adminView(); }
  });
}

if (token && user) start();

new MutationObserver(() => document.querySelectorAll('.kpi b:not([data-d])').forEach(el => {
  el.dataset.d = 1; const t = parseFloat(el.textContent); if (isNaN(t)) return;
  const sfx = el.textContent.replace(/[\d.]/g, ''), dec = el.textContent.includes('.') ? 1 : 0, st = performance.now();
  (function f(now) { const p = Math.min(1, (now - st) / 900); el.textContent = (t * (1 - Math.pow(1 - p, 3))).toFixed(dec) + sfx; if (p < 1) requestAnimationFrame(f); })(st);
})).observe($('main'), { childList: true, subtree: true });

function trend(fb) {
  const by = {}; fb.forEach(f => (by[f.created_at] = by[f.created_at] || []).push(f.rating));
  const pts = Object.keys(by).sort().map(d => ({ d, v: by[d].reduce((a, b) => a + b, 0) / by[d].length }));
  if (pts.length < 2) return '<div class="card"><h3>Ratings over time</h3><p class="empty">Not enough data yet. Feedback from at least two different days is needed.</p></div>';
  const W = 640, H = 230, p = 36, x = i => p + i * (W - 2 * p) / (pts.length - 1), y = v => H - p - (v - 1) * (H - 2 * p) / 4;
  const grid = [1, 2, 3, 4, 5].map(n => `<line x1="${p}" x2="${W - p}" y1="${y(n)}" y2="${y(n)}" class="gl"/><text x="10" y="${y(n) + 4}" class="gt">${n}</text>`).join('');
  const dots = pts.map((q, i) => `<circle cx="${x(i)}" cy="${y(q.v)}" r="5" class="gd"><title>${q.d}: ${q.v.toFixed(1)}</title></circle>`).join('');
  const lbl = pts.map((q, i) => i === 0 || i === pts.length - 1 ? `<text x="${x(i)}" y="${H - 8}" text-anchor="${i ? 'end' : 'start'}" class="gt">${q.d}</text>` : '').join('');
  return `<div class="card"><h3>Ratings over time</h3><svg viewBox="0 0 ${W} ${H}" class="trend" role="img" aria-label="Average rating per day">${grid}<polyline class="gline" points="${pts.map((q, i) => x(i) + ',' + y(q.v)).join(' ')}"/>${dots}${lbl}</svg></div>`;
}

// ---------- dark mode ----------
const applyTheme = t => { document.documentElement.dataset.theme = t; $('theme').textContent = t === 'dark' ? '☀️' : '🌙'; localStorage.setItem('theme', t); };
applyTheme(localStorage.getItem('theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
$('theme').onclick = () => applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');

// ---------- CMS ID field + email verification ----------
function syncCms() { $('cms').classList.toggle('hidden', !(isReg && $('role').value === 'student')); }
$('role').onchange = syncCms;
let pendingEmail = '';
const verr = (m, ok) => { $('verr').textContent = m || ''; $('verr').classList.toggle('ok', !!ok); };
function goVerify(email) {
  pendingEmail = email; verr(); $('vCode').value = '';
  $('loginBox').classList.add('hidden'); $('verifyBox').classList.remove('hidden');
  $('vsub').textContent = `We sent a 6-digit code to ${email}. It expires in 10 minutes.`;
}
$('doVerify').onclick = async () => {
  const code = $('vCode').value.trim();
  if (!/^\d{6}$/.test(code)) return verr('Enter the 6-digit code.');
  try {
    await api('/verify', 'POST', { email: pendingEmail, code });
    $('verifyBox').classList.add('hidden'); $('loginBox').classList.remove('hidden');
    setMode(false); $('email').value = pendingEmail; $('password').value = ''; showErr('Email verified. Please log in.', true);
  } catch (e) { verr(e.message); }
};
$('resend').onclick = async e => { e.preventDefault(); try { await api('/resend', 'POST', { email: pendingEmail }); verr('A new code was sent.', true); } catch (x) { verr(x.message); } };
$('vBack').onclick = e => { e.preventDefault(); $('verifyBox').classList.add('hidden'); $('loginBox').classList.remove('hidden'); };
