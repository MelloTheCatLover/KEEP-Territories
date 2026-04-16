import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { ApiError } from '../../shared/api/client';
import { Card, FormField, ErrorBanner, Button } from '../../shared/ui';

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
      <Card className="w-full max-w-md">
        <h1 className="font-display text-heading-md text-neutral-1000 mb-1">Create account</h1>
        <p className="text-sm text-neutral-700 mb-5">Join the platform</p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <FormField
            label="Email"
            htmlFor="reg-email"
            error={fieldErrors.email}
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={isSubmitting}
          />
          <FormField
            label="Username"
            htmlFor="reg-username"
            error={fieldErrors.username}
            type="text"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            disabled={isSubmitting}
          />
          <FormField
            label="Password"
            htmlFor="reg-password"
            error={fieldErrors.password}
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={isSubmitting}
          />
          <FormField
            label="Confirm password"
            htmlFor="reg-passwordConfirm"
            error={fieldErrors.passwordConfirm}
            type="password"
            autoComplete="new-password"
            value={passwordConfirm}
            onChange={(e) => setPasswordConfirm(e.target.value)}
            disabled={isSubmitting}
          />

          <ErrorBanner message={submitError} />

          <Button type="submit" variant="primary" isLoading={isSubmitting} className="w-full">
            Create account
          </Button>
        </form>

        <p className="text-sm text-neutral-700 text-center mt-5">
          Already have an account?{' '}
          <Link to="/login" className="text-brand-400 hover:text-brand-300">Log in</Link>
        </p>
      </Card>
    </main>
  );
}
