import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { ApiError } from '../../shared/api/client';
import { Card, FormField, ErrorBanner, Button } from '../../shared/ui';

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
      <Card className="w-full max-w-md">
        <h1 className="font-display text-heading-md text-neutral-1000 mb-1">Welcome back</h1>
        <p className="text-sm text-neutral-700 mb-5">Sign in to continue</p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <FormField
            label="Email"
            htmlFor="email"
            error={fieldErrors.email}
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={isSubmitting}
          />
          <FormField
            label="Password"
            htmlFor="password"
            error={fieldErrors.password}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={isSubmitting}
          />

          <ErrorBanner message={submitError} />

          <Button type="submit" variant="primary" isLoading={isSubmitting} className="w-full">
            Log in
          </Button>
        </form>

        <p className="text-sm text-neutral-700 text-center mt-5">
          No account?{' '}
          <Link to="/register" className="text-brand-400 hover:text-brand-300">Sign up</Link>
        </p>
      </Card>
    </main>
  );
}
