// electron-builder's afterPack hook: an ad-hoc signature for the mac app, so a build made without a
// certificate still carries a valid one. Without it the app keeps Electron's own signature, which
// packaging broke by rewriting Info.plist, and macOS refuses such an app its system notifications.
// When a certificate is found, electron-builder signs after this and replaces it. afterSign cannot
// do this job: electron-builder 26.0 skips that hook when it signed nothing. Nothing may change the
// app after this (fuses, were any configured, flip after afterPack: they would need
// resetAdHocDarwinSignature).
import { execFileSync } from 'node:child_process'
import { closeSync, openSync, readdirSync, readSync } from 'node:fs'
import path from 'node:path'

// A Mach-O file's first four bytes, thin or universal, in either byte order.
const MACH_O = new Set(['feedface', 'feedfacf', 'cefaedfe', 'cffaedfe', 'cafebabe', 'bebafeca'])

function isMachO(file) {
  const fd = openSync(file, 'r')
  try {
    const head = Buffer.alloc(4)
    return readSync(fd, head, 0, 4, 0) === 4 && MACH_O.has(head.toString('hex'))
  } finally {
    closeSync(fd)
  }
}

// Every piece of code in the app: loose Mach-O files (node-pty's binding and spawn-helper under
// Resources among them, which codesign --deep never reaches) and the bundles that hold the rest.
// Symlinks are skipped, or a framework's Versions/Current would be signed a second time.
function codeIn(dir, found = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      codeIn(full, found)
      if (/\.(app|framework)$/.test(entry.name)) found.push(full)
    } else if (entry.isFile() && isMachO(full)) {
      found.push(full)
    }
  }
  return found
}

const depth = (file) => file.split(path.sep).length

export default async function adhocSign({ electronPlatformName, appOutDir, packager }) {
  if (electronPlatformName !== 'darwin') return
  const app = path.join(appOutDir, `${packager.appInfo.productFilename}.app`)
  // Inside out: codesign seals what a bundle holds, so whatever it holds is signed first.
  const pieces = codeIn(app).sort((a, b) => depth(b) - depth(a))
  for (const piece of [...pieces, app]) execFileSync('codesign', ['--force', '--sign', '-', piece], { stdio: ['ignore', 'ignore', 'inherit'] })
  execFileSync('codesign', ['--verify', '--deep', '--strict', app], { stdio: ['ignore', 'ignore', 'inherit'] })
  console.log(`  • ad-hoc signed  ${pieces.length + 1} pieces of ${path.basename(app)}`)
}
