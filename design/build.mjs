import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
const css = readFileSync('_base.css', 'utf8')
const read = (p) => { try { return readFileSync(p, 'utf8') } catch { return '' } }
function expand(src) {
  return src.replace(/<!--INCLUDE (\w+)([\s\S]*?)-->/g, (_, name, args) => {
    let frag = read(`parts/_${name}.html`)
    const dq = (v) => v.replaceAll("&quot;", '"')
    for (const m of args.matchAll(/(\w+)="([^"]*)"/g)) frag = frag.replaceAll(`$${m[1]}$`, dq(m[2]))
    for (const m of args.matchAll(/(\w+)=([\w-]+)(?=\s|$)/g)) frag = frag.replaceAll(`$${m[1]}$`, m[2])
    frag = frag.replace(/\$\w+\$/g, '')
    return expand(frag)
  })
}
for (const f of readdirSync('parts').filter((x) => x.endsWith('.body.html'))) {
  const name = f.replace('.body.html', '')
  const extra = read(`parts/${name}.css`)
  const body = expand(readFileSync(`parts/${f}`, 'utf8'))
  writeFileSync(`${name}.dc.html`, `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
  <style>
${css}${extra}  </style>
</helmet>
${body}</x-dc>
</body>
</html>
`)
  console.log('built', name)
}
