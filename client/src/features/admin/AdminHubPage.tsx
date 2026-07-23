import { useEffect, useState, type ComponentType } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowUpRight,
  ChevronRight,
  Map,
  Scale,
  Store,
  Monitor,
  History,
  CalendarRange,
  ClipboardList,
  Shuffle,
  Grid3x3,
  Link2,
  ListChecks,
  Dices,
  Settings,
  Users,
  Trophy,
  Baby,
  ScrollText,
  BookOpen,
} from 'lucide-react';
import { AdminGuard } from './AdminShell';
import { getPendingSubmissions } from './submissions-api';

type IconType = ComponentType<{ className?: string }>;

type HubItem = {
  to: string;
  name: string;
  Icon: IconType;
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
      { to: '/map', name: 'Карта', Icon: Map },
      { to: '/admin/congress', name: 'Съезды', Icon: Scale },
      { to: '/admin/merchants', name: 'Персонажи на карте', Icon: Store },
      { to: '/admin/display', name: 'Вывод на проектор', Icon: Monitor, external: true },
      { to: '/admin/timelapse', name: 'Таймлапс', Icon: History, external: true },
    ],
  },
  {
    label: 'Подготовка смены',
    items: [
      { to: '/admin/seasons', name: 'Сезоны', Icon: CalendarRange },
      { to: '/admin/children-lists', name: 'Списки детей', Icon: ClipboardList },
      { to: '/admin/distribution', name: 'Распределение команд', Icon: Shuffle },
      { to: '/admin/map', name: 'Генерация карты', Icon: Grid3x3 },
      { to: '/admin/sector-tasks', name: 'Привязка заданий', Icon: Link2 },
    ],
  },
  {
    label: 'Материалы',
    items: [
      { to: '/admin/tasks', name: 'Задания', Icon: ListChecks },
      { to: '/admin/encounters', name: 'Случайные встречи', Icon: Dices },
      { to: '/admin/settings', name: 'Настройки', Icon: Settings },
    ],
  },
  {
    label: 'Справка',
    items: [
      { to: '/admin/teams', name: 'Команды', Icon: Users },
      { to: '/admin/trophies', name: 'Кубки', Icon: Trophy },
      { to: '/admin/children', name: 'Все дети', Icon: Baby },
      { to: '/admin/audit', name: 'Журнал действий', Icon: ScrollText },
      { to: '/docs', name: 'Правила (вики)', Icon: BookOpen },
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
  const { Icon } = item;
  const inner = (
    <>
      <span className="flex items-center gap-2.5 min-w-0">
        <Icon className="w-4 h-4 text-neutral-600 flex-shrink-0" />
        <span className="text-sm text-neutral-1000 truncate">{item.name}</span>
      </span>
      <span className="flex items-center gap-2 flex-shrink-0">
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
