require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const path = require('path');

const app = express();
app.set('trust proxy', 1);
const db = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false });
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---------- helpers ----------
const wrap = fn => (req, res) => fn(req, res).catch(e => { console.error(e); res.status(500).json({ error: 'Server error' }); });
const auth = (...roles) => (req, res, next) => {
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    if (roles.length && !roles.includes(req.user.role)) return res.status(403).json({ error: 'Not allowed' });
    next();
  } catch { res.status(401).json({ error: 'Please log in' }); }
};

// ---------- auth ----------
const verifs = new Map(); // email -> { code, exp, tries }   (email OTP codes, 10 minutes)
async function issueOtp(email) {
  const code = String(require('crypto').randomInt(100000, 1000000));
  verifs.set(email, { code, exp: Date.now() + 10 * 60 * 1000, tries: 0 });
  await sendCode(email, code);
}
const fails = new Map(); // login lockout: ip|email -> { n, first }
const WINDOW = 15 * 60 * 1000;

app.post('/api/register', wrap(async (req, res) => {
  const { name, password, role } = req.body;
  const email = (req.body.email || '').trim().toLowerCase();
  const r = ['student', 'teacher'].includes(role) ? role : 'student'; // admin can never self-register
  const cms = r === 'student' ? (req.body.cms_id || '').trim().toUpperCase() : null;
  if (!name || !email || !password || password.length < 6) return res.status(400).json({ error: 'Fill all fields (password min 6 chars)' });
  if (r === 'student' && !/^[A-Z0-9-]{4,15}$/.test(cms)) return res.status(400).json({ error: 'Enter a valid CMS ID (4-15 letters, numbers or dashes)' });
  const hash = await bcrypt.hash(password, 10);
  const { rows } = await db.query('SELECT id, verified FROM users WHERE email=$1', [email]);
  if (rows[0] && rows[0].verified) return res.status(400).json({ error: 'Email already registered' });
  if (cms) {
    await db.query('DELETE FROM users WHERE cms_id=$1 AND verified=FALSE AND email<>$2', [cms, email]); // unverified accounts cannot hold a CMS ID
    const dup = await db.query('SELECT 1 FROM users WHERE cms_id=$1 AND email<>$2', [cms, email]);
    if (dup.rows[0]) return res.status(400).json({ error: 'This CMS ID is already registered' });
  }
  try {
    if (rows[0]) await db.query('UPDATE users SET name=$1,password=$2,role=$3,cms_id=$4 WHERE email=$5', [name, hash, r, cms, email]);
    else await db.query('INSERT INTO users(name,email,password,role,cms_id,verified) VALUES($1,$2,$3,$4,$5,FALSE)', [name, email, hash, r, cms]);
  } catch { return res.status(400).json({ error: 'Email or CMS ID already registered' }); }
  await issueOtp(email);
  res.json({ ok: true, needsVerify: true });
}));

app.post('/api/verify', wrap(async (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase(), v = verifs.get(email);
  if (!v || v.exp < Date.now() || ++v.tries > 5 || v.code !== String(req.body.code)) return res.status(400).json({ error: 'Invalid or expired code' });
  await db.query('UPDATE users SET verified=TRUE WHERE email=$1', [email]);
  verifs.delete(email);
  res.json({ ok: true });
}));

app.post('/api/resend', wrap(async (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();
  const { rows } = await db.query('SELECT verified FROM users WHERE email=$1', [email]);
  if (rows[0] && !rows[0].verified) await issueOtp(email);
  res.json({ ok: true });
}));

app.post('/api/login', wrap(async (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase(), k = req.ip + '|' + email, now = Date.now();
  const f = fails.get(k);
  if (f && f.n >= 5 && now - f.first < WINDOW) return res.status(429).json({ error: 'Too many attempts. Please try again in 15 minutes.' });
  const { rows } = await db.query('SELECT * FROM users WHERE email=$1', [email]);
  const u = rows[0];
  if (!u || !(await bcrypt.compare(req.body.password || '', u.password))) {
    const cur = f && now - f.first < WINDOW ? f : { n: 0, first: now };
    cur.n++; fails.set(k, cur);
    return res.status(401).json({ error: 'Wrong email or password' });
  }
  fails.delete(k);
  if (!u.verified) { await issueOtp(email); return res.status(403).json({ error: 'Please verify your email. We sent you a new code.', needsVerify: true }); }
  const user = { id: u.id, name: u.name, role: u.role };
  res.json({ token: jwt.sign(user, process.env.JWT_SECRET, { expiresIn: u.role === 'admin' ? '2h' : '8h' }), user });
}));

// ---------- courses ----------
app.get('/api/courses', auth(), wrap(async (req, res) => {
  // average stays hidden until a course has at least 3 responses (protects anonymity)
  const { rows } = await db.query(`
    SELECT c.id, c.title, u.name AS teacher, COUNT(f.id)::int AS total,
      CASE WHEN COUNT(f.id) >= 3 THEN ROUND(AVG(f.rating),1) END AS average
    FROM courses c LEFT JOIN users u ON u.id=c.teacher_id LEFT JOIN feedback f ON f.course_id=c.id
    GROUP BY c.id, u.name ORDER BY c.title`);
  res.json(rows);
}));

app.post('/api/courses', auth('admin'), wrap(async (req, res) => {
  const { title, teacher_id } = req.body;
  if (!title) return res.status(400).json({ error: 'Title required' });
  await db.query('INSERT INTO courses(title,teacher_id) VALUES($1,$2)', [title, teacher_id || null]);
  res.json({ ok: true });
}));

app.delete('/api/courses/:id', auth('admin'), wrap(async (req, res) => {
  await db.query('DELETE FROM courses WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
}));

app.get('/api/teachers', auth('admin'), wrap(async (req, res) => {
  const { rows } = await db.query("SELECT id,name FROM users WHERE role='teacher' ORDER BY name");
  res.json(rows);
}));

// ---------- feedback: genuinely anonymous ----------
// "submissions" only records WHO has answered a course (to stop duplicates): no rating, no comment, no time.
// "feedback" holds the rating/comment with NO student reference, a random UUID id and date-only timestamp,
// so the two tables cannot be joined or matched by id order or time.
app.post('/api/feedback', auth('student'), wrap(async (req, res) => {
  const { course_id, rating, comment } = req.body;
  if (!course_id || !(rating >= 1 && rating <= 5)) return res.status(400).json({ error: 'Choose a course and rating' });
  const c = await db.connect();
  try {
    await c.query('BEGIN');
    await c.query('INSERT INTO submissions(course_id,student_id) VALUES($1,$2)', [course_id, req.user.id]);
    await c.query('INSERT INTO feedback(course_id,rating,comment) VALUES($1,$2,$3)', [course_id, rating, (comment || '').slice(0, 1000)]);
    await c.query('COMMIT');
    res.json({ ok: true });
  } catch (e) {
    await c.query('ROLLBACK');
    res.status(400).json({ error: e.code === '23505' ? 'You already gave feedback for this course' : 'Could not save feedback' });
  } finally { c.release(); }
}));

app.get('/api/my-feedback', auth('student'), wrap(async (req, res) => {
  const { rows } = await db.query(`SELECT c.title AS course FROM submissions s
    JOIN courses c ON c.id=s.course_id WHERE s.student_id=$1 ORDER BY c.title`, [req.user.id]);
  res.json(rows);
}));

app.get('/api/feedback', auth('teacher', 'admin'), wrap(async (req, res) => {
  const own = req.user.role === 'teacher';
  const { rows } = await db.query(`SELECT c.title AS course, f.rating, f.comment, to_char(f.created_at,'YYYY-MM-DD') AS created_at
    FROM feedback f JOIN courses c ON c.id=f.course_id
    WHERE f.course_id IN (SELECT course_id FROM feedback GROUP BY course_id HAVING COUNT(*) >= 3)
    ${own ? 'AND c.teacher_id=$1' : ''} ORDER BY f.created_at DESC, f.id`, own ? [req.user.id] : []);
  res.json(rows);
}));

// ---------- forgot password (codes kept in memory for 10 minutes) ----------
const nodemailer = require('nodemailer');
const mailer = process.env.SMTP_HOST ? nodemailer.createTransport({
  host: process.env.SMTP_HOST, port: +(process.env.SMTP_PORT || 587), secure: +(process.env.SMTP_PORT) === 465,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
}) : null;
async function sendCode(email, code) {
  if (!mailer) return console.log(`(email not configured) Reset code for ${email}: ${code}`);
  try {
    await mailer.sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to: email,
      subject: 'Your Sadaa password reset code',
      text: `Your Sadaa reset code is ${code}. It expires in 10 minutes. If you did not ask for it, ignore this email.` });
  } catch (e) { console.error('Email failed:', e.message); }
}
const resets = new Map();
app.post('/api/forgot', wrap(async (req, res) => {
  const email = (req.body.email || '').toLowerCase();
  const { rows } = await db.query('SELECT id FROM users WHERE email=$1', [email]);
  if (rows[0]) {
    const code = String(require('crypto').randomInt(100000, 1000000));
    resets.set(email, { code, exp: Date.now() + 10 * 60 * 1000, tries: 0 });
    await sendCode(email, code);
  }
  res.json({ ok: true });
}));
app.post('/api/reset', wrap(async (req, res) => {
  const email = (req.body.email || '').toLowerCase(), { code, password } = req.body, r = resets.get(email);
  if (!r || r.exp < Date.now() || ++r.tries > 5 || r.code !== String(code)) return res.status(400).json({ error: 'Invalid or expired code' });
  if (!password || password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
  await db.query('UPDATE users SET password=$1 WHERE email=$2', [await bcrypt.hash(password, 10), email]);
  resets.delete(email);
  res.json({ ok: true });
}));

// ---------- secure admin account (created from .env, never from the website) ----------
(async () => {
  const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase(), pw = process.env.ADMIN_PASSWORD || '';
  if (!email || !pw) return console.log('Admin not configured: set ADMIN_EMAIL and ADMIN_PASSWORD in .env');
  if (pw.length < 12 || !/[a-z]/.test(pw) || !/[A-Z]/.test(pw) || !/\d/.test(pw))
    return console.log('ADMIN_PASSWORD is too weak (12+ characters with upper, lower and a number). Admin not created.');
  await db.query(`INSERT INTO users(name,email,password,role,verified) VALUES('Administrator',$1,$2,'admin',TRUE)
    ON CONFLICT (email) DO UPDATE SET password=$2, role='admin', verified=TRUE`, [email, await bcrypt.hash(pw, 12)]);
  console.log('Admin account ready: ' + email);
})().catch(e => console.error('Admin setup failed:', e.message));

app.listen(process.env.PORT || 3000, () => console.log('Running on http://localhost:' + (process.env.PORT || 3000)));
