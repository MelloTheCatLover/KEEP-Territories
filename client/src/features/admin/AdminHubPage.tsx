import { Link } from 'react-router-dom';
import { AlertCircle, Map, ClipboardList, BookOpen, Settings, Users, Trophy, Link2, CalendarRange, ListChecks, UsersRound, Shuffle, ScrollText, Landmark, Dices, MonitorPlay, History } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { Card } from '../../shared/ui';

export function AdminHubPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  if (!isAdmin) {
    return (
      <div className="max-w-2xl mx-auto px-4">
        <Card>
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
            <div>
              <h1 className="font-display text-heading-sm text-neutral-1000 mb-1">Доступ запрещён</h1>
              <p className="text-sm text-neutral-700">Эта страница доступна только администраторам.</p>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4">
      <h1 className="font-display text-heading-md text-neutral-1000 mb-1">Админ-панель</h1>
      <p className="text-sm text-neutral-700 mb-6">Управление игрой.</p>

      <div className="grid sm:grid-cols-2 gap-4">
        <Link to="/admin/display" target="_blank" rel="noopener" className="block">
          <Card className="hover:border-brand-500 transition-colors">
            <div className="flex items-start gap-3">
              <MonitorPlay className="w-6 h-6 text-brand-400 mt-0.5" />
              <div>
                <h2 className="font-display text-heading-sm text-neutral-1000 mb-1">Вывод</h2>
                <p className="text-sm text-neutral-700">
                  Карта на весь экран без хедера — для проектора. Обновляется сама каждые 5 секунд.
                </p>
              </div>
            </div>
          </Card>
        </Link>

        <Link to="/admin/timelapse" target="_blank" rel="noopener" className="block">
          <Card className="hover:border-brand-500 transition-colors">
            <div className="flex items-start gap-3">
              <History className="w-6 h-6 text-brand-400 mt-0.5" />
              <div>
                <h2 className="font-display text-heading-sm text-neutral-1000 mb-1">Таймлапс</h2>
                <p className="text-sm text-neutral-700">
                  Проигрывание истории карты за сезон — как менялись владельцы секторов.
                </p>
              </div>
            </div>
          </Card>
        </Link>

        <Link to="/admin/seasons" className="block">
          <Card className="hover:border-brand-500 transition-colors">
            <div className="flex items-start gap-3">
              <CalendarRange className="w-6 h-6 text-brand-400 mt-0.5" />
              <div>
                <h2 className="font-display text-heading-sm text-neutral-1000 mb-1">Сезоны смен</h2>
                <p className="text-sm text-neutral-700">Своя карта на смену; активация и архив.</p>
              </div>
            </div>
          </Card>
        </Link>

        <Link to="/admin/children-lists" className="block">
          <Card className="hover:border-brand-500 transition-colors">
            <div className="flex items-start gap-3">
              <ListChecks className="w-6 h-6 text-brand-400 mt-0.5" />
              <div>
                <h2 className="font-display text-heading-sm text-neutral-1000 mb-1">Списки детей</h2>
                <p className="text-sm text-neutral-700">Загрузка ФИО, аккаунты, привязка к сменам.</p>
              </div>
            </div>
          </Card>
        </Link>

        <Link to="/admin/children" className="block">
          <Card className="hover:border-brand-500 transition-colors">
            <div className="flex items-start gap-3">
              <UsersRound className="w-6 h-6 text-brand-400 mt-0.5" />
              <div>
                <h2 className="font-display text-heading-sm text-neutral-1000 mb-1">Все дети</h2>
                <p className="text-sm text-neutral-700">Общая база: коды, аккаунты, смены.</p>
              </div>
            </div>
          </Card>
        </Link>

        <Link to="/admin/distribution" className="block">
          <Card className="hover:border-brand-500 transition-colors">
            <div className="flex items-start gap-3">
              <Shuffle className="w-6 h-6 text-brand-400 mt-0.5" />
              <div>
                <h2 className="font-display text-heading-sm text-neutral-1000 mb-1">Распределение команд</h2>
                <p className="text-sm text-neutral-700">Старт сезона: деление по категориям и колесо.</p>
              </div>
            </div>
          </Card>
        </Link>

        <Link to="/admin/map" className="block">
          <Card className="hover:border-brand-500 transition-colors">
            <div className="flex items-start gap-3">
              <Map className="w-6 h-6 text-brand-400 mt-0.5" />
              <div>
                <h2 className="font-display text-heading-sm text-neutral-1000 mb-1">Карта</h2>
                <p className="text-sm text-neutral-700">Генерация и удаление секторов.</p>
              </div>
            </div>
          </Card>
        </Link>

        <Link to="/admin/tasks" className="block">
          <Card className="hover:border-brand-500 transition-colors">
            <div className="flex items-start gap-3">
              <BookOpen className="w-6 h-6 text-brand-400 mt-0.5" />
              <div>
                <h2 className="font-display text-heading-sm text-neutral-1000 mb-1">Задания</h2>
                <p className="text-sm text-neutral-700">Редактирование пула заданий.</p>
              </div>
            </div>
          </Card>
        </Link>

        <Link to="/admin/submissions" className="block">
          <Card className="hover:border-brand-500 transition-colors">
            <div className="flex items-start gap-3">
              <ClipboardList className="w-6 h-6 text-brand-400 mt-0.5" />
              <div>
                <h2 className="font-display text-heading-sm text-neutral-1000 mb-1">Очередь проверки</h2>
                <p className="text-sm text-neutral-700">Модерация заявок команд.</p>
              </div>
            </div>
          </Card>
        </Link>

        <Link to="/admin/teams" className="block">
          <Card className="hover:border-brand-500 transition-colors">
            <div className="flex items-start gap-3">
              <Users className="w-6 h-6 text-brand-400 mt-0.5" />
              <div>
                <h2 className="font-display text-heading-sm text-neutral-1000 mb-1">Команды</h2>
                <p className="text-sm text-neutral-700">Управление командами и участниками.</p>
              </div>
            </div>
          </Card>
        </Link>

        <Link to="/admin/sector-tasks" className="block">
          <Card className="hover:border-brand-500 transition-colors">
            <div className="flex items-start gap-3">
              <Link2 className="w-6 h-6 text-brand-400 mt-0.5" />
              <div>
                <h2 className="font-display text-heading-sm text-neutral-1000 mb-1">Привязка заданий</h2>
                <p className="text-sm text-neutral-700">Какие задания у каких секторов; добавить/убрать.</p>
              </div>
            </div>
          </Card>
        </Link>

        <Link to="/admin/trophies" className="block">
          <Card className="hover:border-brand-500 transition-colors">
            <div className="flex items-start gap-3">
              <Trophy className="w-6 h-6 text-brand-400 mt-0.5" />
              <div>
                <h2 className="font-display text-heading-sm text-neutral-1000 mb-1">Кубки</h2>
                <p className="text-sm text-neutral-700">Расклад мест по всем кубкам и общий зачёт.</p>
              </div>
            </div>
          </Card>
        </Link>

        <Link to="/admin/encounters" className="block">
          <Card className="hover:border-brand-500 transition-colors">
            <div className="flex items-start gap-3">
              <Dices className="w-6 h-6 text-brand-400 mt-0.5" />
              <div>
                <h2 className="font-display text-heading-sm text-neutral-1000 mb-1">Случайные встречи</h2>
                <p className="text-sm text-neutral-700">Выпадают при захвате; эффекты на характеристики команд.</p>
              </div>
            </div>
          </Card>
        </Link>

        <Link to="/admin/congress" className="block">
          <Card className="hover:border-brand-500 transition-colors">
            <div className="flex items-start gap-3">
              <Landmark className="w-6 h-6 text-brand-400 mt-0.5" />
              <div>
                <h2 className="font-display text-heading-sm text-neutral-1000 mb-1">Съезды</h2>
                <p className="text-sm text-neutral-700">Влияние команд, жетоны и законы съезда.</p>
              </div>
            </div>
          </Card>
        </Link>

        <Link to="/admin/audit" className="block">
          <Card className="hover:border-brand-500 transition-colors">
            <div className="flex items-start gap-3">
              <ScrollText className="w-6 h-6 text-brand-400 mt-0.5" />
              <div>
                <h2 className="font-display text-heading-sm text-neutral-1000 mb-1">Журнал действий</h2>
                <p className="text-sm text-neutral-700">Полный лог действий с картой и командами.</p>
              </div>
            </div>
          </Card>
        </Link>

        <Link to="/admin/settings" className="block">
          <Card className="hover:border-brand-500 transition-colors">
            <div className="flex items-start gap-3">
              <Settings className="w-6 h-6 text-brand-400 mt-0.5" />
              <div>
                <h2 className="font-display text-heading-sm text-neutral-1000 mb-1">Настройки</h2>
                <p className="text-sm text-neutral-700">Глобальные параметры игры.</p>
              </div>
            </div>
          </Card>
        </Link>
      </div>
    </div>
  );
}
