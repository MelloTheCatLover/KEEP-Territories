import { useCallback, useEffect, useState, type ComponentType } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ChevronLeft,
  ChevronRight,
  Crown,
  Gem,
  Sparkles,
  Landmark,
  Star,
  Flame,
  Swords,
  Trophy,
  Loader2,
  RotateCcw,
  X,
} from 'lucide-react';
import { teamPaletteFromColor } from '../../design-system/design-tokens';
import { ApiError } from '../../shared/api/client';
import { TimelapsePage } from '../admin/TimelapsePage';
import type { TrophyKey, TrophyRanking, TrophyEntry } from '../trophies/types';
import { getSeasonFinals, type SeasonFinals, type FinalsChampion } from './api';

const TROPHY_ICON: Record<TrophyKey, ComponentType<{ className?: string }>> = {
  influential: Crown,
  core_keepers: Gem,
  experienced: Sparkles,
  rulers: Landmark,
  universal: Star,
  unbreakable: Flame,
  conquerors: Swords,
  champions: Trophy,
};

/** One reveal in the ceremony. */
type Step =
  | { kind: 'intro' }
  | { kind: 'cup'; trophy: TrophyRanking }
  | { kind: 'standings' }
  | { kind: 'mvp' }
  | { kind: 'timelapse' }
  | { kind: 'outro' };

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; finals: SeasonFinals; steps: Step[] };

function buildSteps(finals: SeasonFinals): Step[] {
  const steps: Step[] = [{ kind: 'intro' }];
  for (const trophy of finals.trophies) steps.push({ kind: 'cup', trophy });
  steps.push({ kind: 'standings' });
  if (finals.mvp) steps.push({ kind: 'mvp' });
  steps.push({ kind: 'timelapse' });
  steps.push({ kind: 'outro' });
  return steps;
}

export function FinalsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [state, setState] = useState<State>({ status: 'loading' });
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    if (!id) return;
    getSeasonFinals(id)
      .then((finals) => setState({ status: 'ready', finals, steps: buildSteps(finals) }))
      .catch((err) =>
        setState({
          status: 'error',
          message: err instanceof ApiError ? err.message : 'Не удалось загрузить итоги',
        }),
      );
  }, [id]);

  const steps = state.status === 'ready' ? state.steps : [];
  const step = steps[index];
  const isCup = step?.kind === 'cup';

  // Reset the two-phase reveal whenever the slide changes. Nothing auto-advances
  // or auto-reveals — every transition is driven by the buttons/keys.
  useEffect(() => {
    setRevealed(false);
  }, [index]);

  const goNext = useCallback(() => {
    if (isCup && !revealed) {
      setRevealed(true);
      return;
    }
    setIndex((i) => Math.min(steps.length - 1, i + 1));
  }, [isCup, revealed, steps.length]);

  const goPrev = useCallback(() => {
    setIndex((i) => Math.max(0, i - 1));
    setRevealed(true); // stepping back shows an already-seen slide fully
  }, []);

  const restart = useCallback(() => {
    setIndex(0);
    setRevealed(false);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault();
        goNext();
      } else if (e.key === 'ArrowLeft') {
        goPrev();
      } else if (e.key === 'r' || e.key === 'R') {
        restart();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goNext, goPrev, restart]);

  if (state.status === 'loading') {
    return (
      <div className="fin-root flex items-center justify-center">
        <FinalsStyles />
        <Loader2 className="w-8 h-8 animate-spin text-brand-400" />
      </div>
    );
  }
  if (state.status === 'error') {
    return (
      <div className="fin-root flex flex-col items-center justify-center gap-4 text-neutral-200">
        <FinalsStyles />
        <p className="text-lg">{state.message}</p>
        <button onClick={() => navigate(-1)} className="fin-btn">
          Назад
        </button>
      </div>
    );
  }

  const { finals } = state;
  const atEnd = index >= steps.length - 1;
  const isTimelapse = step.kind === 'timelapse';

  return (
    <div className="fin-root">
      <FinalsStyles />

      {/* Close */}
      <button className="fin-close" onClick={() => navigate(-1)} title="Выйти" aria-label="Выйти">
        <X className="w-5 h-5" />
      </button>

      {/* Slide */}
      <div className="fin-stage" key={index}>
        {step.kind === 'intro' && <IntroSlide name={finals.season_name} />}
        {step.kind === 'cup' && <CupSlide trophy={step.trophy} revealed={revealed} />}
        {step.kind === 'standings' && (
          <StandingsSlide champions={finals.champions} finals={finals} />
        )}
        {step.kind === 'mvp' && finals.mvp && (
          <MvpSlide name={finals.season_name} mvp={finals.mvp} />
        )}
        {step.kind === 'timelapse' && id && (
          <div className="fin-timelapse">
            <TimelapsePage seasonId={id} />
          </div>
        )}
        {step.kind === 'outro' && <OutroSlide />}
      </div>

      {/* Controls */}
      <div className={`fin-controls ${isTimelapse ? 'fin-controls--float' : ''}`}>
        <button className="fin-nav" onClick={goPrev} disabled={index === 0} aria-label="Назад">
          <ChevronLeft className="w-5 h-5" />
        </button>

        <div className="fin-dots">
          {steps.map((s, i) => (
            <span
              key={i}
              className={`fin-dot ${i === index ? 'is-active' : ''} ${i < index ? 'is-done' : ''}`}
              title={s.kind}
            />
          ))}
        </div>

        <button className="fin-nav" onClick={restart} title="Заново (R)" aria-label="Заново">
          <RotateCcw className="w-4 h-4" />
        </button>

        <button
          className="fin-nav fin-nav--primary"
          onClick={goNext}
          disabled={atEnd && !(isCup && !revealed)}
          aria-label="Далее"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}

/* ─────────────────────────── Slides ─────────────────────────── */

function IntroSlide({ name }: { name: string }) {
  return (
    <div className="fin-center">
      <div className="fin-kicker fin-anim-up">Итоги смены</div>
      <h1 className="fin-title fin-anim-pop">«{name}»</h1>
      <div className="fin-brand fin-anim-up" style={{ animationDelay: '0.4s' }}>
        KEEP · Территория Побед
      </div>
    </div>
  );
}

function winnersOf(trophy: TrophyRanking): TrophyEntry[] {
  return trophy.entries.filter((e) => e.place === 1);
}

function CupSlide({ trophy, revealed }: { trophy: TrophyRanking; revealed: boolean }) {
  const Icon = TROPHY_ICON[trophy.key] ?? Trophy;
  const winners = winnersOf(trophy);
  const lead = winners[0];
  const palette = teamPaletteFromColor(lead?.team_color);
  const glow = palette?.bright ?? 'var(--color-brand-400)';

  return (
    <div
      className="fin-center"
      style={{ ['--glow' as string]: glow }}
    >
      <div className={`fin-cup-badge fin-anim-pop ${revealed ? 'is-won' : ''}`}>
        <Icon className="w-16 h-16" />
      </div>
      <h2 className="fin-cup-name fin-anim-up">{trophy.name}</h2>
      <p className="fin-cup-desc fin-anim-up" style={{ animationDelay: '0.15s' }}>
        {trophy.description}
      </p>

      <div className={`fin-winner ${revealed ? 'is-shown' : ''}`}>
        {winners.length === 0 ? (
          <span className="fin-winner-none">Нет победителя</span>
        ) : (
          winners.map((w) => {
            const p = teamPaletteFromColor(w.team_color);
            return (
              <span
                key={w.team_id}
                className="fin-winner-chip"
                style={{
                  background: p?.base ?? 'var(--color-neutral-500)',
                  color: p?.textOnBase ?? '#fff',
                  boxShadow: `0 0 40px ${p?.bright ?? '#fff'}`,
                }}
              >
                {w.team_name}
              </span>
            );
          })
        )}
      </div>
    </div>
  );
}

function StandingsSlide({
  champions,
  finals,
}: {
  champions: FinalsChampion[];
  finals: SeasonFinals;
}) {
  const many = champions.length > 1;
  return (
    <div className="fin-center">
      <div className="fin-kicker fin-anim-up">Общий зачёт · кубки посчитаны</div>
      <div className="fin-champ fin-anim-pop">
        <Crown className="w-14 h-14 text-warning fin-crown" />
        <div className="fin-champ-label">{many ? 'Победители смены' : 'Победитель смены'}</div>
        <div className="fin-champ-teams">
          {champions.map((c) => {
            const p = teamPaletteFromColor(c.team_color);
            return (
              <span
                key={c.team_id}
                className="fin-winner-chip is-big"
                style={{
                  background: p?.base ?? 'var(--color-neutral-500)',
                  color: p?.textOnBase ?? '#fff',
                  boxShadow: `0 0 60px ${p?.bright ?? '#fff'}`,
                }}
              >
                {c.team_name}
                <b className="fin-champ-cups">{c.trophies_won} 🏆</b>
              </span>
            );
          })}
        </div>
        <div className="fin-champ-note fin-anim-up" style={{ animationDelay: '0.5s' }}>
          При равенстве кубков — по общему зачёту. Всей команде присвоено звание
          победителя на будущие смены.
        </div>
      </div>

      <ol className="fin-rank fin-anim-up" style={{ animationDelay: '0.3s' }}>
        {finals.overall.slice(0, 6).map((o) => {
          const p = teamPaletteFromColor(o.team_color);
          return (
            <li key={o.team_id} className={o.place === 1 ? 'is-first' : ''}>
              <span className="fin-rank-place">{o.place}</span>
              <span className="fin-rank-dot" style={{ background: p?.base ?? '#888' }} />
              <span className="fin-rank-name">{o.team_name}</span>
              <span className="fin-rank-cups">{o.trophies_won} 🏆</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function MvpSlide({ name, mvp }: { name: string; mvp: NonNullable<SeasonFinals['mvp']> }) {
  const p = teamPaletteFromColor(mvp.team_color);
  const glow = p?.bright ?? 'var(--color-brand-400)';
  return (
    <div className="fin-center" style={{ ['--glow' as string]: glow }}>
      <div className="fin-mvp-badge fin-anim-pop">
        <Star className="w-16 h-16" />
      </div>
      <div className="fin-kicker fin-anim-up">МВП смены «{name}»</div>
      <h2 className="fin-mvp-name fin-anim-pop" style={{ animationDelay: '0.25s' }}>
        {mvp.full_name}
      </h2>
      {mvp.team_name && (
        <div className="fin-anim-up" style={{ animationDelay: '0.5s' }}>
          <span
            className="fin-winner-chip"
            style={{
              background: p?.base ?? 'var(--color-neutral-500)',
              color: p?.textOnBase ?? '#fff',
            }}
          >
            {mvp.team_name}
          </span>
        </div>
      )}
    </div>
  );
}

function OutroSlide() {
  return (
    <div className="fin-center fin-outro">
      <div className="fin-board fin-board-vanish" aria-hidden />
      <h2 className="fin-outro-text fin-anim-up" style={{ animationDelay: '0.9s' }}>
        Продолжение уже скоро…
      </h2>
      <div className="fin-brand fin-anim-up" style={{ animationDelay: '1.3s' }}>
        KEEP · Территория Побед
      </div>
    </div>
  );
}

/* ─────────────────────────── Styles ─────────────────────────── */

function FinalsStyles() {
  return (
    <style>{`
      .fin-root {
        position: fixed; inset: 0; z-index: 60; overflow: hidden;
        background:
          radial-gradient(1200px 800px at 50% -10%, rgba(90,120,255,0.18), transparent 60%),
          radial-gradient(900px 700px at 100% 110%, rgba(245,158,11,0.12), transparent 60%),
          linear-gradient(160deg, #0a0b0f 0%, #0d0f16 55%, #090a0e 100%);
        color: #eef1f7;
        display: flex; flex-direction: column;
        font-family: var(--font-display, inherit);
      }
      .fin-close {
        position: absolute; top: 16px; right: 16px; z-index: 5;
        width: 40px; height: 40px; border-radius: 999px;
        display: flex; align-items: center; justify-content: center;
        color: #aab; background: rgba(255,255,255,0.06);
        border: 1px solid rgba(255,255,255,0.12); transition: all .2s;
      }
      .fin-close:hover { color: #fff; background: rgba(255,255,255,0.14); }
      .fin-stage {
        flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center;
        padding: 4vh 5vw;
      }
      .fin-center { text-align: center; display: flex; flex-direction: column; align-items: center; gap: 18px; max-width: 900px; }
      .fin-timelapse { position: absolute; inset: 0; overflow: hidden; }
      /* The embedded standalone timelapse is min-h-screen; pin it to the stage
         height and let its flex layout shrink the map so nothing overflows. */
      .fin-timelapse > div { height: 100%; min-height: 0; }

      .fin-kicker { font-size: clamp(14px, 2.2vw, 20px); letter-spacing: .32em; text-transform: uppercase; color: #8ea0c8; }
      .fin-title { font-size: clamp(40px, 9vw, 108px); font-weight: 800; line-height: 1; letter-spacing: -.02em;
        background: linear-gradient(90deg,#fff,#9db4ff,#fff); -webkit-background-clip: text; background-clip: text; color: transparent;
        background-size: 200% auto; animation: fin-shimmer 4s linear infinite; }
      .fin-brand { font-size: clamp(13px, 1.8vw, 18px); letter-spacing: .28em; text-transform: uppercase; color: #6f7fa6; }

      .fin-cup-badge { width: 132px; height: 132px; border-radius: 28px; display:flex; align-items:center; justify-content:center;
        color:#cfd6ea; background: rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.12); transition: all .6s cubic-bezier(.2,.8,.2,1); }
      .fin-cup-badge.is-won { color: var(--glow); border-color: var(--glow);
        box-shadow: 0 0 60px color-mix(in srgb, var(--glow) 55%, transparent); transform: scale(1.06); }
      .fin-cup-name { font-size: clamp(30px, 6vw, 66px); font-weight: 800; line-height: 1; }
      .fin-cup-desc { color:#93a0bf; font-size: clamp(14px,2vw,20px); max-width: 620px; }

      .fin-winner { opacity: 0; transform: translateY(18px) scale(.96); transition: all .6s cubic-bezier(.2,.8,.2,1); margin-top: 8px; }
      .fin-winner.is-shown { opacity: 1; transform: none; }
      .fin-winner-none { color:#7c8aad; font-size: 20px; }
      .fin-winner-chip { display:inline-flex; align-items:center; gap:10px; padding: 12px 26px; border-radius: 999px;
        font-size: clamp(20px, 3.2vw, 40px); font-weight: 800; }
      .fin-winner-chip.is-big { font-size: clamp(26px, 4.4vw, 56px); padding: 16px 34px; }
      .fin-champ-cups { font-size: .6em; opacity: .85; }

      .fin-champ { display:flex; flex-direction: column; align-items:center; gap: 14px; }
      .fin-crown { filter: drop-shadow(0 0 20px rgba(245,158,11,.7)); animation: fin-bob 2.6s ease-in-out infinite; }
      .fin-champ-label { font-size: clamp(14px,2vw,18px); letter-spacing:.24em; text-transform:uppercase; color:#e6c04a; }
      .fin-champ-teams { display:flex; flex-wrap:wrap; gap:14px; justify-content:center; }
      .fin-champ-note { color:#8a97b6; font-size: clamp(12px,1.6vw,15px); max-width: 560px; }

      .fin-rank { list-style:none; margin: 6px 0 0; padding: 0; width: min(560px, 86vw); display:flex; flex-direction:column; gap:6px; }
      .fin-rank li { display:flex; align-items:center; gap:12px; padding: 8px 14px; border-radius: 10px;
        background: rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.07); font-size: clamp(13px,1.8vw,17px); }
      .fin-rank li.is-first { background: rgba(245,158,11,0.12); border-color: rgba(245,158,11,0.4); }
      .fin-rank-place { width: 22px; text-align:center; color:#8ea0c8; font-weight:700; }
      .fin-rank-dot { width: 12px; height: 12px; border-radius: 999px; flex:none; }
      .fin-rank-name { flex:1; text-align:left; }
      .fin-rank-cups { color:#c9d3ec; }

      .fin-mvp-badge { width:132px; height:132px; border-radius:999px; display:flex; align-items:center; justify-content:center;
        color: var(--glow); border:1px solid var(--glow); background: rgba(255,255,255,0.04);
        box-shadow: 0 0 60px color-mix(in srgb, var(--glow) 45%, transparent); animation: fin-bob 3s ease-in-out infinite; }
      .fin-mvp-name { font-size: clamp(34px, 7vw, 84px); font-weight: 800; line-height:1;
        background: linear-gradient(90deg,#fff,var(--glow),#fff); -webkit-background-clip:text; background-clip:text; color:transparent;
        background-size: 200% auto; animation: fin-shimmer 4s linear infinite; }

      .fin-outro { position: relative; }
      .fin-board { width: min(680px, 80vw); height: min(420px, 46vh);
        background: repeating-linear-gradient(0deg,#12151d,#12151d 2px,#0e111a 2px,#0e111a 24px),
          radial-gradient(circle at 50% 40%, rgba(90,120,255,.15), transparent 60%);
        border:1px solid rgba(255,255,255,0.08); border-radius: 16px; }
      .fin-board-vanish { animation: fin-vanish 1.2s .1s cubic-bezier(.4,0,.2,1) forwards; }
      .fin-outro-text { position:absolute; font-size: clamp(28px, 5.5vw, 60px); font-weight: 800; opacity:0; }

      .fin-controls { display:flex; align-items:center; justify-content:center; gap: 14px; padding: 18px; z-index: 5; }
      .fin-controls--float { position: absolute; top: 12px; left: 50%; transform: translateX(-50%);
        background: rgba(10,12,18,.66); border:1px solid rgba(255,255,255,0.1); border-radius: 999px; padding: 8px 14px; backdrop-filter: blur(8px); }
      .fin-nav { width: 46px; height: 46px; border-radius: 999px; display:flex; align-items:center; justify-content:center;
        color:#cfd6ea; background: rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.12); transition: all .2s; }
      .fin-nav:hover:not(:disabled) { background: rgba(255,255,255,0.16); color:#fff; }
      .fin-nav:disabled { opacity: .35; }
      .fin-nav--primary { background: var(--color-brand-600, #3b52d6); color:#fff; border-color: transparent; }
      .fin-nav--primary:hover:not(:disabled) { background: var(--color-brand-500, #4a63e6); }
      .fin-dots { display:flex; gap:7px; align-items:center; }
      .fin-dot { width: 8px; height: 8px; border-radius:999px; background: rgba(255,255,255,0.18); transition: all .3s; }
      .fin-dot.is-done { background: rgba(255,255,255,0.4); }
      .fin-dot.is-active { background: var(--color-brand-400, #7f97ff); transform: scale(1.5); box-shadow: 0 0 12px var(--color-brand-400,#7f97ff); }
      .fin-btn { padding: 10px 20px; border-radius: 10px; background: var(--color-brand-600,#3b52d6); color:#fff; }

      .fin-anim-up { animation: fin-up .7s cubic-bezier(.2,.8,.2,1) both; }
      .fin-anim-pop { animation: fin-pop .7s cubic-bezier(.2,.9,.25,1.2) both; }

      @keyframes fin-up { from { opacity:0; transform: translateY(26px); } to { opacity:1; transform:none; } }
      @keyframes fin-pop { from { opacity:0; transform: scale(.82); } to { opacity:1; transform: scale(1); } }
      @keyframes fin-shimmer { to { background-position: 200% center; } }
      @keyframes fin-bob { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
      @keyframes fin-vanish { to { opacity:0; transform: scale(.6) rotateX(35deg); filter: blur(14px); } }

      @media (prefers-reduced-motion: reduce) {
        .fin-title, .fin-mvp-name { animation: none; }
        .fin-anim-up, .fin-anim-pop, .fin-board-vanish { animation-duration: .01ms; }
      }
    `}</style>
  );
}
