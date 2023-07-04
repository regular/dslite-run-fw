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
  try {
    debug('running session ...')
    await session(ds, ccxml, image, opts)
    debug('Session was a success!')
  } catch(err) {
    console.error(err.stack)
  } finally {
    ds.close()
  }
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

