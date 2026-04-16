import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { ApiError } from '../../shared/api/client';

export function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function validate() {
    const errors: { email?: string; password?: string } = {};
    if (!email.includes('@')) errors.email = 'Invalid email';
    if (password.length < 8) errors.password = 'At least 8 characters';
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
      await login(email, password);
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
        <h1 className="font-display text-heading-md text-neutral-1000 mb-1">Welcome back</h1>
        <p className="text-sm text-neutral-700 mb-5">Sign in to continue</p>

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
            <label className="label text-neutral-800 block mb-1" htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
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
            {isSubmitting ? 'Logging in...' : 'Log in'}
          </button>
        </form>

        <p className="text-sm text-neutral-700 text-center mt-5">
          No account?{' '}
          <Link to="/register" className="text-brand-400 hover:text-brand-300">Sign up</Link>
        </p>
      </div>
    </main>
  );
}
