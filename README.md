# Sadaa - Student Feedback Management System

Sadaa ("voice" in Urdu) is a full-stack web app where students give honest, anonymous feedback on their courses, and teachers and admins see clear insights.

**Live demo:** https://feedback-management-system-drab.vercel.app

## Features
- Anonymous by design: the feedback table stores no student reference, and a separate table only records who has already answered a course
- Email OTP verification and a unique CMS ID for every student
- Student, Teacher and Admin dashboards
- Rating distribution, ratings over time, and CSV / PDF reports for admins
- Feedback stays hidden until a course has 3 or more responses
- Password reset by email code, login attempt limits, dark mode

## Tech stack
- Front-end: HTML, CSS, JavaScript
- Back-end: Node.js, Express, JWT, bcrypt, Nodemailer
- Database: PostgreSQL
- Deployment: GitHub and Vercel

## Run it locally
1. Clone the repository and run `npm install`
2. Create a PostgreSQL database and load the tables: `psql -U postgres -d feedback_db -f schema.sql`
3. Copy `.env.example` to `.env` and fill in your own values
4. Run `npm start` and open http://localhost:3000

## Environment variables
| Name | Purpose |
|---|---|
| DATABASE_URL | PostgreSQL connection string |
| DB_SSL | Set to true for hosted databases |
| JWT_SECRET | Long random text used to sign logins |
| ADMIN_EMAIL, ADMIN_PASSWORD | The admin account, created at start-up (password: 12+ characters with upper, lower and a number) |
| SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM | Email settings for OTP and password reset |

## Team
- Aqdas and Nida Fatima: Back-end
- Fizza Tayyab: Front-end

Built for our Software Engineering course at BUITEMS. Thank you to Dr. Junnaid Muhammad Hassan for giving us this project.