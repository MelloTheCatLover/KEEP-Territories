ALTER TABLE users
  ADD COLUMN role VARCHAR(20) NOT NULL DEFAULT 'student'
    CHECK (role IN ('student', 'admin'));

CREATE INDEX idx_users_role ON users(role);
