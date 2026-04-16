import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { ApiError } from '../../shared/api/client';

export function RegisterPage() {
  const { register } = useAuth();
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{
    email?: string;
    username?: string;
    password?: string;
    passwordConfirm?: string;
  }>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function validate() {
    const errors: typeof fieldErrors = {};
    if (!email.includes('@')) errors.email = 'Invalid email';
    if (username.length < 3) errors.username = 'At least 3 characters';
    if (password.length < 8) errors.password = 'At least 8 characters';
    if (passwordConfirm !== password) errors.passwordConfirm = 'Passwords do not match';
    return errors;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const errors = validate();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setIsSubmitting(true);
    setSubmitError(null);
    try {
      await register(email, username, password);
    } catch (err) {
      if (err instanceof ApiError) {
        setSubmitError(err.message);
      } else {
        setSubmitError('Network error. Try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-neutral-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-glass-medium backdrop-blur-glass border border-glass rounded-lg shadow-2 p-6">
        <h1 className="font-display text-heading-md text-neutral-1000 mb-1">Create account</h1>
        <p className="text-sm text-neutral-700 mb-5">Join the platform</p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="label text-neutral-800 block mb-1" htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isSubmitting}
              className={`w-full bg-neutral-200 border rounded-sm px-3 py-2 text-base text-neutral-900 focus:border-brand-500 focus:outline-none disabled:opacity-40 ${
                fieldErrors.email ? 'border-danger' : 'border-neutral-400'
              }`}
            />
            {fieldErrors.email && (
              <p className="text-xs text-danger-text mt-1">{fieldErrors.email}</p>
            )}
          </div>

          <div>
            <label className="label text-neutral-800 block mb-1" htmlFor="username">Username</label>
            <input
              id="username"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={isSubmitting}
              className={`w-full bg-neutral-200 border rounded-sm px-3 py-2 text-base text-neutral-900 focus:border-brand-500 focus:outline-none disabled:opacity-40 ${
                fieldErrors.username ? 'border-danger' : 'border-neutral-400'
              }`}
            />
            {fieldErrors.username && (
              <p className="text-xs text-danger-text mt-1">{fieldErrors.username}</p>
            )}
          </div>

          <div>
            <label className="label text-neutral-800 block mb-1" htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isSubmitting}
              className={`w-full bg-neutral-200 border rounded-sm px-3 py-2 text-base text-neutral-900 focus:border-brand-500 focus:outline-none disabled:opacity-40 ${
                fieldErrors.password ? 'border-danger' : 'border-neutral-400'
              }`}
            />
            {fieldErrors.password && (
              <p className="text-xs text-danger-text mt-1">{fieldErrors.password}</p>
            )}
          </div>

          <div>
            <label className="label text-neutral-800 block mb-1" htmlFor="passwordConfirm">Confirm password</label>
            <input
              id="passwordConfirm"
              type="password"
              autoComplete="new-password"
              value={passwordConfirm}
              onChange={(e) => setPasswordConfirm(e.target.value)}
              disabled={isSubmitting}
              className={`w-full bg-neutral-200 border rounded-sm px-3 py-2 text-base text-neutral-900 focus:border-brand-500 focus:outline-none disabled:opacity-40 ${
                fieldErrors.passwordConfirm ? 'border-danger' : 'border-neutral-400'
              }`}
            />
            {fieldErrors.passwordConfirm && (
              <p className="text-xs text-danger-text mt-1">{fieldErrors.passwordConfirm}</p>
            )}
          </div>

          {submitError && (
            <div className="bg-danger-bg text-danger-text text-sm px-3 py-2 rounded-sm border border-danger">
              {submitError}
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-brand-500 hover:bg-brand-400 active:bg-brand-600 text-neutral-1000 font-semibold text-base px-4 py-2 rounded-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isSubmitting ? 'Creating account...' : 'Create account'}
          </button>
        </form>

        <p className="text-sm text-neutral-700 text-center mt-5">
          Already have an account?{' '}
          <Link to="/login" className="text-brand-400 hover:text-brand-300">Log in</Link>
        </p>
      </div>
    </main>
  );
}
