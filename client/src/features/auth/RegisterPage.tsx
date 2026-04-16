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
    if (!email.includes('@')) errors.email = 'Неверный email';
    if (username.length < 3) errors.username = 'Минимум 3 символа';
    if (password.length < 8) errors.password = 'Минимум 8 символов';
    if (passwordConfirm !== password) errors.passwordConfirm = 'Пароли не совпадают';
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
        setSubmitError('Ошибка сети. Попробуйте снова.');
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-neutral-50 flex items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <h1 className="font-display text-heading-md text-neutral-1000 mb-1">Создать аккаунт</h1>
        <p className="text-sm text-neutral-700 mb-5">Присоединяйтесь к платформе</p>

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
            label="Никнейм"
            htmlFor="reg-username"
            error={fieldErrors.username}
            type="text"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            disabled={isSubmitting}
          />
          <FormField
            label="Пароль"
            htmlFor="reg-password"
            error={fieldErrors.password}
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={isSubmitting}
          />
          <FormField
            label="Подтверждение пароля"
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
            Зарегистрироваться
          </Button>
        </form>

        <p className="text-sm text-neutral-700 text-center mt-5">
          Уже есть аккаунт?{' '}
          <Link to="/login" className="text-brand-400 hover:text-brand-300">Войти</Link>
        </p>
      </Card>
    </main>
  );
}
