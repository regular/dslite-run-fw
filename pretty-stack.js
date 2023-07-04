module.exports = function prettyStack(stack) {
  const {frames} = stack
  const l = frames.map(f=>{
    const {sourceLine, pc, locals} = f
    const fun = `${pc} ${f.function}`
    if (!sourceLine) return fun
    const {line, relativePath, compilationPath} = sourceLine
    const p = resolve(compilationPath, relativePath)
    return `${fun}\n  ${locals}\n ${p}:${line}`
  })
  return l.join('\n')
}
