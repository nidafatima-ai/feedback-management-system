CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('student','teacher','admin')),
  cms_id TEXT UNIQUE,
  verified BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE TABLE IF NOT EXISTS courses (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  teacher_id INT REFERENCES users(id) ON DELETE SET NULL
);
-- Who has answered a course (no rating, no comment, no time)
CREATE TABLE IF NOT EXISTS submissions (
  course_id INT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  student_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (course_id, student_id)
);
-- The feedback itself: no student reference, random id, date only
CREATE TABLE IF NOT EXISTS feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id INT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  rating INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  created_at DATE NOT NULL DEFAULT CURRENT_DATE
);
