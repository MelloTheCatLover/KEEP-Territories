import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, ChevronRight } from 'lucide-react';
import { AdminGuard } from './AdminShell';
import { getPendingSubmissions } from './submissions-api';

type HubItem = {
  to: string;
  name: string;
  /** Opens in a new tab (projector / full-screen views). */
  external?: boolean;
};

type HubSection = {
  label: string;
  items: HubItem[];
};

// Ordered by how often the admin actually reaches for things:
// daily play first, once-per-season setup next, rarely-touched content last.
const SECTIONS: HubSection[] = [
  {
    label: 'Игра',
    items: [
      { to: '/map', name: 'Карта' },
      { to: '/admin/congress', name: 'Съезды' },
      { to: '/admin/merchants', name: 'Персонажи на карте' },
      { to: '/admin/display', name: 'Вывод на проектор', external: true },
      { to: '/admin/timelapse', name: 'Таймлапс', external: true },
    ],
  },
  {
    label: 'Подготовка смены',
    items: [
      { to: '/admin/seasons', name: 'Сезоны' },
      { to: '/admin/children-lists', name: 'Списки детей' },
      { to: '/admin/distribution', name: 'Распределение команд' },
      { to: '/admin/map', name: 'Генерация карты' },
      { to: '/admin/sector-tasks', name: 'Привязка заданий' },
    ],
  },
  {
    label: 'Материалы',
    items: [
      { to: '/admin/tasks', name: 'Задания' },
      { to: '/admin/encounters', name: 'Случайные встречи' },
      { to: '/admin/settings', name: 'Настройки' },
    ],
  },
  {
    label: 'Справка',
    items: [
      { to: '/admin/teams', name: 'Команды' },
      { to: '/admin/trophies', name: 'Кубки' },
      { to: '/admin/children', name: 'Все дети' },
      { to: '/admin/audit', name: 'Журнал действий' },
    ],
  },
];

export function AdminHubPage() {
  return (
    <AdminGuard>
      <Hub />
    </AdminGuard>
  );
}

function Hub() {
  // The one number the admin cares about between games: waiting submissions.
  const [pending, setPending] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    getPendingSubmissions()
      .then((items) => {
        if (!cancelled) setPending(items.length);
      })
      .catch(() => {
        /* the badge is optional — the hub works without it */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="max-w-xl mx-auto px-4">
      <h1 className="font-display text-heading-md text-neutral-1000 mb-8">Админ</h1>

      <div className="space-y-8">
        {SECTIONS.map((section) => (
          <section key={section.label}>
            <h2 className="label text-neutral-600 mb-2">{section.label}</h2>
            <div className="border border-neutral-300 rounded-md divide-y divide-neutral-300 overflow-hidden bg-neutral-100">
              {section.items.map((item) => (
                <HubRow
                  key={item.to}
                  item={item}
                  badge={item.to === '/map' && pending ? pending : undefined}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function HubRow({ item, badge }: { item: HubItem; badge?: number }) {
  const inner = (
    <>
      <span className="text-sm text-neutral-1000">{item.name}</span>
      <span className="flex items-center gap-2">
        {badge !== undefined && (
          <span
            className="min-w-5 h-5 px-1.5 inline-flex items-center justify-center rounded-full bg-warning-bg border border-warning/50 text-warning-text text-xs font-mono leading-none"
            title="Заявок на проверке"
          >
            {badge}
          </span>
        )}
        {item.external ? (
          <ArrowUpRight className="w-4 h-4 text-neutral-600" />
        ) : (
          <ChevronRight className="w-4 h-4 text-neutral-600" />
        )}
      </span>
    </>
  );
  const className =
    'flex items-center justify-between gap-3 px-4 py-3 hover:bg-neutral-200 transition-colors';

  return item.external ? (
    <Link to={item.to} target="_blank" rel="noopener" className={className}>
      {inner}
    </Link>
  ) : (
    <Link to={item.to} className={className}>
      {inner}
    </Link>
  );
}
