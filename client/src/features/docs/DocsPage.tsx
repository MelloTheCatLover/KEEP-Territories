import type { ReactNode } from 'react';
import { BookOpen } from 'lucide-react';

/**
 * In-app rules reference. Mirrors docs/DOMAIN.md — the glossary, the stat
 * threshold tables and the character/cup lists — so players can read the rules
 * without leaving the site.
 */
export function DocsPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 pb-16">
      <div className="flex items-center gap-3 mb-1">
        <BookOpen className="w-6 h-6 text-brand-400" />
        <h1 className="font-display text-heading-md text-neutral-1000">Правила КТП</h1>
      </div>
      <p className="text-sm text-neutral-700 mb-8">
        КТП — массовая стратегия по захвату секторов в реальном времени. Цель — собрать
        наибольшее количество кубков, используя свою стратегию.
      </p>

      <Section title="Базовые термины">
        <TermList
          items={[
            ['Сезон', 'Период проведения КТП со своим порядковым номером (отсчёт с 56 смены; 124 смена — 21 сезон).'],
            ['Съезд', 'Общее собрание всех участников для обсуждения и принятия законов.'],
            ['Борьба / война', 'Собрание всех команд, на котором захватываются сектора.'],
            ['Закон', 'Общеобязательное положение, принимаемое на съездах голосованием; может менять правила игры.'],
            ['Опыт', 'Единицы за захват секторов, повышают уровень команды.'],
            ['Уровень', 'Степень развития команды; за новый уровень даётся очко апгрейда.'],
            ['Влияние', 'Единицы за захват секторов; определяют число жетонов на съезде.'],
            ['Случайные встречи', 'Задания, за которые команды получают характеристики.'],
            ['Стрик', 'Непрерывная полоса занятий секторов.'],
            ['Перезахват', 'Взятие под контроль сектора, уже захваченного другой командой.'],
            ['Укрепление', 'Перезахват своего же сектора; даёт половину влияния и опыта.'],
          ]}
        />
      </Section>

      <Section title="Характеристики">
        <p className="text-sm text-neutral-700 mb-4">
          Очки апгрейда команда получает за уровни и распределяет по пяти характеристикам исходя из
          стратегии.
        </p>

        <SubTitle>Лидерство → право вето</SubTitle>
        <p className="text-sm text-neutral-900 mb-4">
          Команда с наибольшим влиянием может наложить вето — отменить один закон на съезде (одно
          вето на съезд).
        </p>

        <SubTitle>Сила → пробитие</SubTitle>
        <p className="text-sm text-neutral-900 mb-2">
          Захват чужого укреплённого сектора с первой попытки.
        </p>
        <ThresholdTable
          head={['Очки силы', 'Пробитие']}
          rows={[['1–4', '0'], ['5–7', '1'], ['8–9', '2'], ['10', '3']]}
        />

        <SubTitle>Выносливость → очки передвижения</SubTitle>
        <p className="text-sm text-neutral-900 mb-2">
          Досягаемость считается от последнего захваченного сектора (на карте отмечен ★). Радиус =
          1 + очки передвижения. Без выносливости к далёкому сектору идут «перевалами» —
          промежуточными захватами.
        </p>
        <ThresholdTable
          head={['Очки выносливости', 'Очки передвижения']}
          rows={[['1–3', '0'], ['4–6', '1'], ['7–9', '2'], ['10', '3']]}
        />

        <SubTitle>Интеллект → проверки</SubTitle>
        <p className="text-sm text-neutral-900 mb-2">
          Разведка: подсмотреть возможные задания сектора, не начиная захват. Бюджет проверок
          обновляется после каждого захвата.
        </p>
        <ThresholdTable
          head={['Очки интеллекта', 'Проверки']}
          rows={[['1–2', '0'], ['3–4', '1'], ['5–6', '2'], ['7–8', '3'], ['9–10', '4']]}
        />

        <SubTitle>Удача → рероллы</SubTitle>
        <p className="text-sm text-neutral-900 mb-2">
          Реролл: перекрутить назначенное задание на секторе.
        </p>
        <ThresholdTable
          head={['Очки удачи', 'Рероллы']}
          rows={[['1–4', '0'], ['5–7', '1'], ['8–9', '2'], ['10', '3']]}
        />
      </Section>

      <Section title="Персонажи на карте">
        <p className="text-sm text-neutral-700 mb-4">
          Скрытые персонажи на неизвестных секторах. Захватив такой сектор, команда получает жетон
          покупки и подходит к персонажу за товаром.
        </p>
        <TermList
          items={[
            ['Мастер', 'Товары, меняющие механику игры (раздвоение, чип, щит, LEVEL UP и др.).'],
            ['Диверсант', 'Товары, тормозящие ход игры соперника.'],
            ['Торговец', 'Товары, изменяющие ход игры (батут, подзорная труба, кирпичи и др.).'],
          ]}
        />
      </Section>

      <Section title="Кубки">
        <TermList
          items={[
            ['Влиятельные', 'за наибольшее влияние'],
            ['Опытные', 'за наибольший опыт'],
            ['Универсальные', 'за наибольшую сумму характеристик'],
            ['Захватчики', 'за наибольшее число перезахватов'],
            ['Хранители ядра', 'за захват ядра'],
            ['Правители', 'за наибольшее число секторов'],
            ['Несгибаемые', 'за наибольший стрик'],
            ['Чемпионы', 'за наибольшее число выигранных особых событий'],
          ]}
        />
        <p className="text-sm text-neutral-700 mt-3">
          Условие победы — собрать наибольшее количество кубков.
        </p>
      </Section>

      <Section title="Стратегии">
        <div className="space-y-3">
          <div className="border border-neutral-300 rounded-md p-4 bg-neutral-100">
            <div className="font-display text-base text-neutral-1000 mb-1">Качественная</div>
            <p className="text-sm text-neutral-700">
              Захват наиболее ценных секторов, даже если их немного. Максимальная выгода при меньших
              затратах ресурсов.
            </p>
          </div>
          <div className="border border-neutral-300 rounded-md p-4 bg-neutral-100">
            <div className="font-display text-base text-neutral-1000 mb-1">Количественная</div>
            <p className="text-sm text-neutral-700">
              Захват большего числа секторов меньшей ценности. Приоритет — расширение территории.
            </p>
          </div>
        </div>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="font-display text-heading-sm text-neutral-1000 mb-3 pb-2 border-b border-neutral-300">
        {title}
      </h2>
      {children}
    </section>
  );
}

function SubTitle({ children }: { children: ReactNode }) {
  return (
    <h3 className="font-display text-base text-brand-400 mt-5 mb-1">{children}</h3>
  );
}

function TermList({ items }: { items: Array<[string, string]> }) {
  return (
    <dl className="space-y-2">
      {items.map(([term, def]) => (
        <div key={term} className="sm:flex sm:gap-3">
          <dt className="font-medium text-neutral-1000 text-sm sm:w-40 sm:flex-shrink-0">{term}</dt>
          <dd className="text-sm text-neutral-700">{def}</dd>
        </div>
      ))}
    </dl>
  );
}

function ThresholdTable({ head, rows }: { head: [string, string]; rows: Array<[string, string]> }) {
  return (
    <div className="overflow-x-auto mb-2">
      <table className="text-sm border border-neutral-300 rounded-sm">
        <thead>
          <tr className="bg-neutral-200">
            {head.map((h) => (
              <th key={h} className="text-left font-medium text-neutral-800 px-3 py-1.5">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(([a, b]) => (
            <tr key={a} className="border-t border-neutral-300">
              <td className="px-3 py-1.5 text-neutral-700">{a}</td>
              <td className="px-3 py-1.5 font-mono text-neutral-1000">{b}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
