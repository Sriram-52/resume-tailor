const { execFileSync } = require('node:child_process')
const path = require('node:path')

/**
 * Ad-hoc code sign the packaged macOS .app.
 *
 * We have no Apple Developer ID (that costs $99/yr), so electron-builder is
 * configured with `identity: null` and skips signing. An ad-hoc signature
 * (`codesign --sign -`) is free, requires no Apple account, and never expires.
 * It does NOT get past Gatekeeper on a downloaded copy — users still bypass the
 * first-run prompt once (right-click Open / "Open Anyway" / xattr) — but it
 * produces a valid, stable signature, which Apple Silicon needs to run reliably.
 *
 * Runs after packaging, before the DMG is assembled, so the shipped DMG contains
 * the ad-hoc signed app.
 */
exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return
  const appPath = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`
  )
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], {
    stdio: 'inherit'
  })
  console.log(`  • ad-hoc signed ${appPath}`)
}
