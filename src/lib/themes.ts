/** Lightweight theme extraction: recurring words/phrases across free-text entries. No ML, just honest counting. */

const STOP = new Set(
  `a about above after again against all am an and any are as at be because been before being below between both but by can could did do does doing done down during each few for from further had has have having he her here hers herself him himself his how i if in into is it its itself just me more most my myself no nor not now of off on once only or other our ours ourselves out over own same she should so some such than that the their theirs them themselves then there these they this those through to too under until up very was we were what when where which while who whom why will with would you your yours yourself yourselves
  get got make made one two three per week weeks weekly day days time thing things really still also every new first last next way didn't don't it's i'd i'm isn't wasn't can't won't let's that's there's we're they're
  went want need take took going go see said like much many lot well even back ready live done
  beats saves makes feel felt end`.split(/\s+/),
);

export function tokens(text: string) {
  return text
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[^a-z0-9#'\s-]/g, " ")
    .split(/[\s-]+/)
    .map((t) => t.replace(/^'+|'+$/g, ""))
    .filter((t) => t.length > 2 && !STOP.has(t) && !/^\d+$/.test(t));
}

export type Theme = { term: string; count: number; examples: string[] };

/**
 * Count terms (and two-word phrases) by number of distinct entries they appear in.
 * A phrase beats its component words when it is nearly as frequent.
 */
export function extractThemes(entries: { text: string; label?: string }[], limit = 8, minCount = 2, extraStop: string[] = []): Theme[] {
  const stop = new Set(extraStop.map((w) => w.toLowerCase()));
  const counts = new Map<string, { term: string; entries: Set<number>; examples: string[] }>();
  entries.forEach((e, idx) => {
    const toks = tokens(e.text).filter((t) => !stop.has(t));
    const seen = new Map<string, string>(); // key -> display term
    for (let i = 0; i < toks.length; i++) {
      seen.set(toks[i], toks[i]);
      if (i + 1 < toks.length && toks[i] !== toks[i + 1]) {
        // "weekend recovery" and "recovery weekend" are the same theme.
        const key = [toks[i], toks[i + 1]].sort().join(" ");
        if (!seen.has(key)) seen.set(key, `${toks[i]} ${toks[i + 1]}`);
      }
    }
    for (const [key, term] of seen) {
      const entry = counts.get(key) ?? { term, entries: new Set<number>(), examples: [] };
      entry.entries.add(idx);
      const ex = e.label ?? e.text;
      if (entry.examples.length < 3 && !entry.examples.includes(ex)) entry.examples.push(ex);
      counts.set(key, entry);
    }
  });
  const ranked = [...counts.values()]
    .filter((v) => v.entries.size >= minCount)
    // Prefer phrases over single words at equal frequency.
    .sort((a, b) => b.entries.size - a.entries.size || (b.term.includes(" ") ? 1 : 0) - (a.term.includes(" ") ? 1 : 0) || b.term.length - a.term.length);
  const picked: typeof ranked = [];
  for (const c of ranked) {
    // Skip a theme that covers (almost) the same entries as one already picked.
    const dupe = picked.some((p) => {
      let inter = 0;
      for (const i of c.entries) if (p.entries.has(i)) inter++;
      return inter / Math.min(c.entries.size, p.entries.size) >= 0.75;
    });
    if (!dupe) picked.push(c);
    if (picked.length >= limit) break;
  }
  return picked.map((v) => ({ term: v.term, count: v.entries.size, examples: v.examples }));
}
