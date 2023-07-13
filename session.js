const loner = require('loner')
const prettyStack = require('./pretty-stack')
const debugMain = require('debug')('dslite-run-fw:main')
const debugCore = require('debug')('dslite-run-fw:core')
const {BufferList} = require('bl')

module.exports = async function session(ds, target, program, opts) {
  return new Promise( async (resolve, reject)=>{
    ds.waitForEvent({
      good: debugMain
    })
    try {
      const {cores} = await ds.configure(target)
      const core = await ds.createSubModule(cores[0])
      debugCore('API %O', core)

      core.waitForEvent({
        good: debugCore
      })

      await core.cio.willHandleInput(true)
      await core.targetState.connect()
      await core.settings.set({
        AutoRunToLabelName: "main"
      })
      await core.symbols.loadProgram(program)

      await core.waitForEvent({
        good: ({data, event}) => event == 'targetState.changed' && data.description == 'Suspended - H/W Breakpoint',
        timeout: 10 * 1000,
      }).catch(err=>{
        throw new Error('Device did not enter expected target state: ' + err.message)
      })

      const stdout = captureLines(opts, (err, lines)=>{
        if (!err) return resolve(lines)
        reject(err)
      }, opts)
      const output = Output(stdout, process.stderr)

      const outputEvents = core.waitForEvent({
        good: ({data, event}) => {
          const {message, type} = data
          if (event == 'cio.output') {
            output(type, message)
          }
          return false // don't resolve the promise
        },
        timeout: 6 * 1000,
      }).catch(reject)

      const inputEvents = core.waitForEvent({
        good: ({event}) => {
          if (event == 'cio.input') {
            core.cio.setInputText(opts.input)
          }
          return false // don't resolve the promise
        }
      }).catch(reject)

      core.targetState.run()
      await core.waitForEvent({
        good: ({data, event}) => event == 'targetState.changed' && data.description == 'Running',
        timeout: 6 * 1000,
      })

      const halted = core.waitForEvent({
        good: ({data, event}) => event == 'targetState.changed' && data.description == 'Suspended',
      })
      halted.then( async ()=>{
        const stack = await core.callstack.fetch()
        const pstack = prettyStack(stack)
        reject(new Error('Target halted:\n' + pstack))
      })
    } catch(err) {reject(err)}
  })
}

// -- util

function captureLines(opts, done) {
  const lines = []
  let buff = []
  const s = loner('\n', Buffer.from([0x04]))
  s.on('data', data=>{
    if (!done) return
    if (data.length == 1 && data[0] == 0x04) {
      const exitReason = buff.pop().toString()
      console.error('\nexit reason:', exitReason)
      const err = errorFromExitReason(exitReason, lines)
      done(err, lines)
      done = null
    } else if (data.length == 1 && data[0] == '\n'.charCodeAt(0)) { 
      process.stdout.write(data)
      if (lines == undefined) return
      const line = BufferList(buff).toString('utf8')
      lines.push(line)
      buff = []
      if (done && opts.numLines && lines.length >= opts.numLines) {
        done(null, lines)
        done = null
      }
    } else {
      process.stdout.write(data)
      buff.push(data)
    }
  })
  return s
}

// -- util
function errorFromExitReason(reason, lines) {
  if (reason == 'EXCEPTION') {
    const report = []
    let line
    let found = false
    let done = false
    do {
      line = lines.pop()
      if (found) {
        if (!line.startsWith('{module#')) {
          done = true
          lines.push(line)
          line = null
        }
      }
      if (line) report.unshift(line)
      if (!found && line.startsWith('Exception occurred')) found = true
    } while(!found || !done)

    return new Error('An exception occured:\n' + report.join('\n'))
  } else if (reason.startsWith('EXIT')) {
    const code = Number(reason.split(' ')[1])
    if (code == 0) return null
    return new Error(`Exit code is ${code}`) 
  } else if (reason == 'ABORT') {
    return new Error('abort() was called')
  }
  return new Error(reason)
}

function Output(stdout, stderr) {
  return function output(type, message) {
    if (type=='stdout') stdout.write(Buffer.from(message))
    if (type=='stderr') stderr.write(message)
  }
}
