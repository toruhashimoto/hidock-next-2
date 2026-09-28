/**
 * electron-builder afterPack: refuse a package whose SQLite binding the packed
 * Electron cannot load.
 *
 * What happened on 2026-09-25: better-sqlite3 had been rebuilt for Node
 * (NODE_MODULE_VERSION 147) to run the test suite. `npm run build:win` printed
 * "preparing better-sqlite3 ... finished", kept the Node binary, exited 0, and
 * produced a 257 MB installer. Installed, it could not open the database: the
 * headless brain exited 1 on every agent call, and the app the installer
 * launched never got past its start. Same shape as the 22-sep incident in
 * preflight-package.mjs, silent at every stage, so it gets a gate too.
 *
 * The check runs the packed executable itself as Node (ELECTRON_RUN_AS_NODE)
 * and loads every better_sqlite3.node in app.asar.unpacked. That is the exact
 * runtime and the exact files the installer ships; nothing is inferred from
 * version strings. Only when the build machine can run the packed executable
 * (same platform and architecture); a cross-build skips with a warning.
 */

'use strict'

const { execFileSync } = require('child_process')
const { closeSync, existsSync, openSync, readdirSync, statSync } = require('fs')
const { join } = require('path')

function findBindings(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    const st = statSync(path)
    if (st.isDirectory()) findBindings(path, out)
    else if (name === 'better_sqlite3.node') out.push(path)
  }
  return out
}

/**
 * Wait until the packed executable can be written again.
 *
 * electron-builder edits the executable's resources right after this hook. On
 * a machine whose endpoint protection inspects a program the first time it
 * runs, the check's run left the executable locked for about 1.4 s after the
 * process exited (2026-09-28, CrowdStrike Falcon: every new copy, EBUSY), and
 * that edit failed the build.
 */
async function waitUntilWritable(file, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    try {
      closeSync(openSync(file, 'r+'))
      return
    } catch (error) {
      if (error.code !== 'EBUSY') throw error
      if (Date.now() > deadline) {
        throw new Error(
          `native check: ${file} is still locked ${timeoutMs / 1000} s after the check ran, ` +
            'so electron-builder cannot edit its resources. Find what holds it and package again.'
        )
      }
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
  }
}

exports.default = async function afterPackCheckNative(context) {
  const { appOutDir, electronPlatformName, arch, packager } = context
  const archName = { 0: 'ia32', 1: 'x64', 2: 'armv7l', 3: 'arm64', 4: 'universal' }[arch] ?? String(arch)
  if (electronPlatformName !== process.platform || archName !== process.arch) {
    console.warn(`  • native check skipped: packed for ${electronPlatformName}-${archName}, building on ${process.platform}-${process.arch}`)
    return
  }
  // Where electron-builder puts the executable and resources (platformPackager.js):
  // inside the .app bundle on macOS, beside the executable elsewhere.
  const name = packager.appInfo.productFilename
  const bundle = join(appOutDir, `${name}.app`)
  const exe =
    electronPlatformName === 'darwin'
      ? join(bundle, 'Contents', 'MacOS', name)
      : join(appOutDir, electronPlatformName === 'win32' ? `${name}.exe` : name)
  const unpacked =
    electronPlatformName === 'darwin'
      ? join(bundle, 'Contents', 'Resources', 'app.asar.unpacked')
      : join(appOutDir, 'resources', 'app.asar.unpacked')
  if (!existsSync(exe) || !existsSync(unpacked)) {
    throw new Error(`native check: expected ${exe} and ${unpacked} after packing`)
  }
  const bindings = findBindings(unpacked)
  if (bindings.length === 0) throw new Error(`native check: no better_sqlite3.node under ${unpacked}`)
  for (const binding of bindings) {
    try {
      execFileSync(exe, ['-e', `require(${JSON.stringify(binding)})`], {
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
        stdio: 'pipe',
        timeout: 60000,
      })
    } catch (error) {
      const said = String(error.stderr || error.message).split('\n').filter(Boolean).slice(0, 4).join(' | ')
      throw new Error(
        `native check: the packed app cannot load ${binding}. Rebuild it for Electron ` +
          '(npx node-gyp rebuild --target=<electron version> --arch=x64 --dist-url=https://electronjs.org/headers ' +
          `in each node_modules/better-sqlite3) and package again. Electron said: ${said}`
      )
    }
  }
  await waitUntilWritable(exe)
  console.log(`  • native check: the packed Electron loads ${bindings.length} better-sqlite3 binding(s)`)
}
