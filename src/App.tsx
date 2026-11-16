import { useMemo, useState } from 'react'
import { answers } from './engine/question.ts'
import { describeFamily, describeQuestion, ROCK_NAME } from './engine/rules.ts'
import { score, type Result } from './engine/score.ts'
import { core, sectionOf } from './engine/section.ts'
import { bestDrills, makeSolver } from './engine/solve.ts'
import { judge } from './engine/judge.ts'
import { buildSpace, certain, consistent } from './engine/space.ts'
import { puzzles } from './puzzles/index.ts'
import type { Puzzle } from './puzzles/types.ts'
import { loadProgress, saveStars, type Progress } from './storage.ts'
import { Board, PatternDefs, runsOf, StackColumn } from './ui/Board.tsx'

export default function App() {
  const [progress, setProgress] = useState<Progress>(loadProgress)
  const [current, setCurrent] = useState<number | null>(null)

  if (current === null) return <Menu progress={progress} onPick={setCurrent} />
  const puzzle = puzzles[current]
  return (
    <Play
      key={puzzle.id}
      index={current}
      puzzle={puzzle}
      bestBefore={progress[puzzle.id] ?? 0}
      onCleared={(s) => setProgress((p) => saveStars(p, puzzle.id, s))}
      onBack={() => setCurrent(null)}
      onNext={current + 1 < puzzles.length ? () => setCurrent(current + 1) : null}
    />
  )
}

const starText = (n: number) => '★'.repeat(n) + '☆'.repeat(3 - n)

function Menu({ progress, onPick }: { progress: Progress; onPick: (i: number) => void }) {
  const total = puzzles.reduce((s, p) => s + (progress[p.id] ?? 0), 0)
  return (
    <main className="menu">
      <header>
        <h1>horu</h1>
        <p className="lead">地表を掘って、出てきた地層から地下の断面を推理する。少ない本数で答えが決まれば★が増える。</p>
        <p className="muted">
          ★ {total} / {puzzles.length * 3}
        </p>
      </header>
      <ol className="levels">
        {puzzles.map((p, i) => {
          const s = progress[p.id] ?? 0
          return (
            <li key={p.id}>
              <button type="button" className={s ? 'done' : undefined} onClick={() => onPick(i)} aria-label={`${i + 1}問目 ${p.title}${s ? `、★${s}` : ''}`}>
                <span className="num">{i + 1}</span>
                <span className="name">{p.title}</span>
                <span className="check" aria-hidden="true">
                  {s ? starText(s) : ''}
                </span>
              </button>
            </li>
          )
        })}
      </ol>
      <footer className="muted">記録はこの端末のブラウザにだけ保存します。</footer>
    </main>
  )
}

interface PlayProps {
  index: number
  puzzle: Puzzle
  bestBefore: number
  onCleared: (stars: 1 | 2 | 3) => void
  onBack: () => void
  onNext: (() => void) | null
}

interface Answered {
  index: number
  result: Result
  /** 答えたときに残っていた断面の数。 */
  left: number
  /** 答えたときに、何かの答えが確かだと言えたか。 */
  decided: boolean
}

function Play({ index, puzzle, bestBefore: bestAtStart, onCleared, onBack, onNext }: PlayProps) {
  // 答えた直後に記録が書き換わるので、開いた時点の値を持っておく
  const [bestBefore] = useState(bestAtStart)
  const space = useMemo(() => buildSpace(puzzle), [puzzle])
  const solver = useMemo(() => makeSolver(space), [space])
  const truth = useMemo(() => sectionOf(puzzle.world, puzzle.truth), [puzzle])
  const [drilled, setDrilled] = useState<number[]>([])
  const [selected, setSelected] = useState<number | null>(null)
  const [answering, setAnswering] = useState(false)
  const [picked, setPicked] = useState<number | null>(null)
  const [answered, setAnswered] = useState<Answered | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [hint, setHint] = useState<number[] | null>(null)
  const { world, question } = puzzle
  const options = useMemo(() => answers(world, question), [world, question])
  const total = space.sections.length

  const reset = () => {
    setDrilled([])
    setSelected(null)
    setAnswering(false)
    setPicked(null)
    setAnswered(null)
    setDismissed(false)
    setHint(null)
  }

  const drill = (x: number) => {
    if (answered || drilled.includes(x) || puzzle.blocked.includes(x)) return
    setDrilled((d) => [...d, x])
    setHint(null)
  }

  const submit = (ans: number) => {
    const j = judge(space, drilled, ans)
    const result = score(drilled.length, puzzle.best, j.correct, j.sure)
    setAnswered({ index: ans, result, left: j.left, decided: j.decided })
    setAnswering(false)
    setSelected(null)
    setHint(null)
    if (result.stars > 0) onCleared(result.stars as 1 | 2 | 3)
  }

  const select = (x: number) => {
    if (answered) return
    if (answering && question.kind === 'shallowest') {
      setPicked(x)
      return
    }
    setAnswering(false)
    setSelected(selected === x ? null : x)
  }

  const showHint = () => {
    const cands = consistent(space, drilled)
    if (certain(space, cands) !== 0) setHint([])
    else setHint(bestDrills(space, drilled, solver))
    setSelected(null)
  }

  // 答えたあとに進む先。案内を閉じて断面を見ているあいだも、下のボタンから進めるようにする
  const next = !answered
    ? null
    : answered.result.correct
      ? onNext
        ? { label: '次の問題へ', run: onNext }
        : { label: '一覧へ', run: onBack }
      : { label: 'もう一度', run: reset }

  const correctLabels = options.filter((a) => space.truthMask & (1 << a.index)).map((a) => a.label)

  return (
    <main className="play">
      <PatternDefs />
      <header className="top">
        <button type="button" className="ghost" onClick={onBack}>
          ← 一覧
        </button>
        <span className="title">
          {index + 1}. {puzzle.title}
        </span>
        <span className="meters">
          掘った <b>{drilled.length}</b> 本（最少 {puzzle.best}）
        </span>
      </header>

      <p className="goal">{describeQuestion(world, question)}</p>

      <div className="stage">
        <Board
          world={world}
          question={question}
          blocked={puzzle.blocked}
          truth={truth}
          drilled={drilled}
          selected={selected}
          hinted={hint ?? []}
          revealed={answered !== null}
          picked={answered ? answered.index : answering ? picked : null}
          onSelect={select}
        />
      </div>

      {hint && !answered && (
        <p className="hint-text" aria-live="polite">
          ヒント: {hint.length ? '光っている列のどれかを掘ると、最少の本数のまま答えを決められる。' : 'もう答えは決まっている。答えてみよう。'}
        </p>
      )}

      {!answered && (
        <section className="panel" aria-live="polite">
          {answering ? (
            <AnswerPicker
              kind={question.kind}
              options={options}
              picked={picked}
              onPick={setPicked}
              onSubmit={() => picked !== null && submit(picked)}
              onClose={() => setAnswering(false)}
            />
          ) : selected === null ? (
            <p className="muted">掘りたい列を押す。答えが分かったら「答える」。</p>
          ) : puzzle.blocked.includes(selected) ? (
            <p>{selected + 1} 列目は建物があって掘れない。</p>
          ) : drilled.includes(selected) ? (
            <CoreText x={selected} rocks={core(world, truth, selected)} />
          ) : (
            <button type="button" className="primary" onClick={() => drill(selected)}>
              {selected + 1} 列目を掘る
            </button>
          )}
        </section>
      )}

      <details className="rules" open>
        <summary>この地域の決まり</summary>
        <div className="rules-body">
          <ul>
            {describeFamily(world, puzzle.family).map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
          <div className="stacks">
            <StackColumn stack={world.stack} title="地層の重なり" />
            {world.coverStack && puzzle.family.cover && <StackColumn stack={world.coverStack} title="上に載る地層（上から）" cover />}
          </div>
        </div>
      </details>

      <div className="sub">
        {!answered && (
          <>
            <button
              type="button"
              className="ghost"
              onClick={() => {
                setAnswering(true)
                setSelected(null)
                setHint(null)
              }}
            >
              答える
            </button>
            <button type="button" className="ghost" onClick={showHint}>
              ヒント
            </button>
          </>
        )}
        {!(answered && !answered.result.correct) && (
          <button type="button" className="ghost" onClick={reset} disabled={drilled.length === 0 && !answered}>
            最初から
          </button>
        )}
        {next && dismissed && (
          <button type="button" className="primary next" onClick={next.run}>
            {next.label}
          </button>
        )}
      </div>

      {answered && !dismissed && (
        <div className="clear" role="dialog" aria-label={answered.result.correct ? '正解' : 'はずれ'}>
          {answered.result.correct ? (
            <>
              <p className="big" aria-label={`★${answered.result.stars}`}>
                {starText(answered.result.stars)}
              </p>
              <p>
                {answered.result.certain
                  ? `正解。${drilled.length} 本で答えが決まっていた。${answered.result.stars < 3 ? `どう掘っても ${puzzle.best} 本で決められる。` : ''}`
                  : `当たり。ただ、この時点ではまだ ${answered.left} 通りの断面がありえて、選んだ答えは確かではなかった。`}
              </p>
              <p className="muted">
                掘る前にありえた断面は {total} 通り。{bestBefore >= answered.result.stars ? `前に ★${bestBefore} を取っています。` : '記録しました。'}
              </p>
            </>
          ) : (
            <>
              <p className="big miss">はずれ</p>
              <p>正解は「{correctLabels.join('」か「')}」。</p>
              <p className="muted">
                {answered.decided ? '答えたときには、掘った結果からもう答えは決まっていた。' : `答えたときは、まだ ${answered.left} 通りの断面がありえた。`}
              </p>
            </>
          )}
          <div className="row">
            <button type="button" className="ghost" onClick={() => setDismissed(true)}>
              断面を見る
            </button>
            {next && (
              <button type="button" onClick={next.run}>
                {next.label}
              </button>
            )}
          </div>
        </div>
      )}
    </main>
  )
}

function CoreText({ x, rocks }: { x: number; rocks: Parameters<typeof runsOf>[0] }) {
  return (
    <div className="core-text">
      <p>{x + 1} 列目の柱状図</p>
      <ul>
        {runsOf(rocks).map((r) => (
          <li key={r.from}>
            <i className={`swatch bg-${r.rock}`} aria-hidden="true" />
            {r.from}〜{r.to} m {ROCK_NAME[r.rock]}
            {r.to === rocks.length ? '（その下は分からない）' : ''}
          </li>
        ))}
      </ul>
    </div>
  )
}

interface AnswerPickerProps {
  kind: Puzzle['question']['kind']
  options: ReturnType<typeof answers>
  picked: number | null
  onPick: (i: number) => void
  onSubmit: () => void
  onClose: () => void
}

function AnswerPicker({ kind, options, picked, onPick, onSubmit, onClose }: AnswerPickerProps) {
  return (
    <div className="answer">
      <div className="picker-head">
        <span>{kind === 'shallowest' ? '列を選ぶ（断面の列を押してもよい）' : '答えを選ぶ'}</span>
        <button type="button" className="close" onClick={onClose} aria-label="閉じる">
          ×
        </button>
      </div>
      <div className={`choices ${kind}`} role="radiogroup" aria-label="答え">
        {options.map((a) => (
          <button key={a.index} type="button" role="radio" aria-label={a.label} aria-checked={picked === a.index} className={picked === a.index ? 'on' : undefined} onClick={() => onPick(a.index)}>
            {kind === 'depth' && a.index < options.length - 2 ? a.index : kind === 'shallowest' ? a.index + 1 : a.label.replace(' 列目の間', '')}
          </button>
        ))}
      </div>
      <button type="button" className="primary" disabled={picked === null} onClick={onSubmit}>
        {picked === null ? '答えを選ぶ' : `「${options[picked].label}」で答える`}
      </button>
    </div>
  )
}
