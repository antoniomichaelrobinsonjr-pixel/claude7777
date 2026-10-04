/**
 * Split a translated sentence into plain text and tagged runs, e.g. "Hello <b>world</b>" ->
 * [{text:"Hello "}, {tag:"b", text:"world"}]. Only the whitelisted tags are recognised and the content is always
 * returned as text, so a translation or a user value can never inject markup.
 */
export type Segment = { text: string; tag?: string };

export function splitTags(input: string, tags: readonly string[] = ["b", "i", "c", "e"]): Segment[] {
  const names = tags.join("|");
  const re = new RegExp(`<(${names})>([\\s\\S]*?)</\\1>`, "g");
  const out: Segment[] = [];
  let last = 0;
  for (let m = re.exec(input); m; m = re.exec(input)) {
    if (m.index > last) out.push({ text: input.slice(last, m.index) });
    out.push({ tag: m[1], text: m[2] });
    last = m.index + m[0].length;
  }
  if (last < input.length) out.push({ text: input.slice(last) });
  return out;
}
