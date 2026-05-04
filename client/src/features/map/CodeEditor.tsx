import { useCallback } from 'react';

type Props = {
  value: string;
  onChange: (next: string) => void;
  language: 'python' | 'pascal';
  disabled?: boolean;
  rows?: number;
};

export function CodeEditor({ value, onChange, language, disabled, rows = 14 }: Props) {
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key !== 'Tab') return;
      e.preventDefault();
      const target = e.currentTarget;
      const { selectionStart, selectionEnd } = target;
      const next = value.slice(0, selectionStart) + '    ' + value.slice(selectionEnd);
      onChange(next);
      requestAnimationFrame(() => {
        target.selectionStart = target.selectionEnd = selectionStart + 4;
      });
    },
    [value, onChange],
  );

  return (
    <div className="border border-neutral-400 rounded-sm overflow-hidden bg-neutral-50">
      <div className="flex items-center justify-between px-3 py-1.5 bg-neutral-200 border-b border-neutral-400 text-xs">
        <span className="font-mono uppercase tracking-wide text-neutral-700">
          {language}
        </span>
        <span className="text-neutral-700">Tab — 4 пробела</span>
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        spellCheck={false}
        rows={rows}
        className="w-full px-3 py-2 bg-neutral-50 text-neutral-1000 font-mono text-sm resize-y focus:outline-none disabled:opacity-60"
      />
    </div>
  );
}
