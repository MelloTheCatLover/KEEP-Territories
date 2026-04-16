import { Loader2 } from 'lucide-react';

export function AuthSplash() {
  return (
    <main className="min-h-screen bg-neutral-50 flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
        <p className="label text-neutral-700">Загрузка</p>
      </div>
    </main>
  );
}
