import { useMemo } from 'react'
import type { MasterResume } from '../../../shared/resume'
import type { Token } from '../diff'
import { diffResume } from '../diff'

/** Render a word-diff token stream with add/del highlighting. */
function Tokens({ tokens }: { tokens: Token[] }): React.JSX.Element {
  return (
    <span className="diff-text">
      {tokens.map((t, i) =>
        t.t === 'same' ? (
          <span key={i}>{t.s}</span>
        ) : t.t === 'add' ? (
          <ins key={i}>{t.s}</ins>
        ) : (
          <del key={i}>{t.s}</del>
        )
      )}
    </span>
  )
}

const Chips = ({ items, kind }: { items: string[]; kind: 'add' | 'del' }): React.JSX.Element => (
  <span className="diff-chips">
    {items.map((s, i) => (
      <span key={i} className={`diff-chip ${kind}`}>
        {kind === 'add' ? '+' : '−'} {s}
      </span>
    ))}
  </span>
)

/**
 * Diff panel: shows what tailoring + chat edits changed relative to the base
 * (master) resume. Reworded lines show inline word diffs; added/removed content
 * shows as green/red. Pure client-side, recomputed from the two resumes.
 */
export function DiffView({
  base,
  tailored
}: {
  base: MasterResume
  tailored: MasterResume
}): React.JSX.Element {
  const d = useMemo(() => diffResume(base, tailored), [base, tailored])

  if (!d.hasChanges) {
    return <p className="muted">No changes from the base resume yet. Tailor or edit to see a diff.</p>
  }

  return (
    <div className="diff">
      {d.headline && (
        <section className="diff-sec">
          <h4>Headline</h4>
          <Tokens tokens={[{ t: 'del', s: d.headline.old }, { t: 'add', s: ' ' + d.headline.new }]} />
        </section>
      )}

      {d.summary && (
        <section className="diff-sec">
          <h4>Summary</h4>
          <Tokens tokens={d.summary} />
        </section>
      )}

      {d.roles.map((r) => (
        <section className="diff-sec" key={r.company}>
          <h4>
            {r.company}
            {r.isNew && <span className="diff-tag add">new to tailored</span>}
          </h4>
          {r.position && (
            <div className="diff-line">
              Title: <del>{r.position.old}</del> <ins>{r.position.new}</ins>
            </div>
          )}
          {r.bullets.changed.map((c, i) => (
            <div className="diff-line" key={`c${i}`}>
              <Tokens tokens={c.tokens} />
            </div>
          ))}
          {r.bullets.added.map((s, i) => (
            <div className="diff-line" key={`a${i}`}>
              <ins>+ {s}</ins>
            </div>
          ))}
          {r.bullets.removed.map((s, i) => (
            <div className="diff-line" key={`r${i}`}>
              <del>− {s}</del>
            </div>
          ))}
          {(r.tech.added.length > 0 || r.tech.removed.length > 0) && (
            <div className="diff-line">
              Tech: <Chips items={r.tech.added} kind="add" />
              <Chips items={r.tech.removed} kind="del" />
            </div>
          )}
          {r.bullets.unchanged > 0 && (
            <div className="diff-meta">{r.bullets.unchanged} bullet(s) unchanged</div>
          )}
        </section>
      ))}

      {d.skills.length > 0 && (
        <section className="diff-sec">
          <h4>Skills</h4>
          {d.skills.map((s) => (
            <div className="diff-line" key={s.category}>
              <strong>{s.category}:</strong> <Chips items={s.added} kind="add" />
              <Chips items={s.removed} kind="del" />
            </div>
          ))}
        </section>
      )}

      {(d.projects.added.length > 0 || d.projects.removed.length > 0) && (
        <section className="diff-sec">
          <h4>Projects</h4>
          <div className="diff-line">
            <Chips items={d.projects.added} kind="add" />
            <Chips items={d.projects.removed} kind="del" />
          </div>
        </section>
      )}

      {d.contact.length > 0 && (
        <section className="diff-sec">
          <h4>Contact</h4>
          {d.contact.map((c) => (
            <div className="diff-line" key={c.field}>
              <strong>{c.field}:</strong> {c.old && <del>{c.old}</del>} <ins>{c.new}</ins>
            </div>
          ))}
        </section>
      )}
    </div>
  )
}
