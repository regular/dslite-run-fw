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
    const {cores} = await ds.configure(target)
    const core = await ds.createSubModule(cores[0])
    
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

    const stderr = process.stderr
    let stdout = process.stdout
    if (opts.numLines) {
      stdout = captureLines(resolve, opts)
      stdout.pipe(process.stdout)
    }

    function output(type, message) {
      if (type=='stdout') stdout.write(Buffer.from(message))
      if (type=='stderr') stderr.write(message)
    }

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
  })
}

// -- util

function captureLines(done, opts) {
  const lines = []
  let buff = []
  const s = loner('\n')
  s.on('data', data=>{
    if (!done) return
    if (data.length !== 1 || data[0] !== '\n'.charCodeAt(0)) {
      buff.push(data)
    } else {
      if (lines == undefined) return
      const line = BufferList(buff).toString('utf8')
      lines.push(line)
      buff = []
      if (done && opts.numLines && lines.length >= opts.numLines) {
        done(lines)
        done = null
      }
    }
  })
  return s
}
