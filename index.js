const DSProxy = require('dslite-proxy')
const client = require('dslite-client')
const session = require('./session')
const debug = require('debug')('dslite-run-fw')

module.exports = {
  startDSLite,
  runImage
}

async function runImage(ccxml, image, port, opts) {
  const ds = await client(port, Object.assign({}, opts, {promisify: true}))
  const {version} = await ds.getVersion()
  let output = false
  try {
    debug('running session ...')
    let retries = 30
    do try {
      output = await session(ds, ccxml, image, opts)
    } catch(e) {
      console.error('Session quit unexpectedly.')
      if (
        !e.message.match(/An attempt to connect/m) &&
        !e.message.match(/Error initializing emulator/m)
      ) throw e
      console.error(`Retrying to connect ... ${retries} retries left.`)
    } while(--retries && output == false)
    debug('Session was a success!')
  } finally {
    ds.close()
  }
  return output == false ? undefined : output.join('\n')
}

function startDSLite(config, opts) {
  opts = opts || {}
  const log = opts.log || ( ()=>{} )
  return new Promise( (resolve, reject)=>{
    DSProxy(log, config, opts, (err, res)=>{
      if (err) return reject(err)
      resolve(res)
    })
  })
}

