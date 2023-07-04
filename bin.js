#!/usr/bin/env node
const { resolve} = require('path')
const proxyConfig = require('rc')('dslite-proxy')
const {startDSLite, runImage} = require('.')
const argv = require('minimist')(process.argv.slice(2));

const log = argv.verbose ? console.log : ()=>{}

async function main() {
  // since rc is using process.argv,
  // we will have command line args
  // preent in botj, proxyConfig and argv
  proxyConfig._ = []

  if (argv._.length == 2) {
    let [ccxml, image] = argv._
    ccxml = resolve(process.cwd(), ccxml)
    image = resolve(process.cwd(), image)
    const proxy = await startDSLite(proxyConfig, {log})
    try {
      await runImage(ccxml, image, proxy.port, {log, numLines: argv['num-lines']})
    } catch(err) {
      console.error(err.stack)
      process.exitCode = 1
    } finally {
      proxy.stop()
    }
  } else {
    usage()
    process.exit(1)
  }
}

main()

function usage() {
  console.log(`bin.js TARGET_CCXML FIRMWARE_IMAGE [--verbose] [--num-lines=N]

  If N is given, the debug session is aborted after N lines from stdout were received.
    `)
}

