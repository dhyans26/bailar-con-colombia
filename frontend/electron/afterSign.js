// electron-builder skips code signing entirely when no Developer ID
// identity is installed on the machine (visible in the build log as
// "skipped macOS application code signing"). That leaves Electron's
// factory ad-hoc signature in place, but that signature doesn't cover the
// extraResources / app.asar electron-builder adds afterward -- so macOS's
// AMFI check rejects the app at launch with "adhoc signed or signed by an
// unknown certificate chain" (Error -423), even though `open`/Finder show
// no visible error. Re-sign ad-hoc ourselves, with the same entitlements
// electron-builder would apply for a real signing identity (JIT + unsigned
// executable memory + no library validation -- required for V8/Node to run
// at all), so unsigned local/dev builds still actually launch.
//
// This only matters for local/dev distribution. For real distribution, get
// a Developer ID Application certificate -- electron-builder will sign
// (and you should notarize) properly, and this hook becomes a no-op below.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

export default async function afterSign(context) {
  if (context.electronPlatformName !== "darwin") return;
  if (context.packager.config.mac?.identity !== undefined || process.env.CSC_LINK) {
    return; // a real identity is configured -- let electron-builder's own signing stand
  }

  const appPath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  const entitlements = path.join(
    context.packager.projectDir,
    "node_modules/app-builder-lib/templates/entitlements.mac.plist"
  );
  if (!existsSync(appPath) || !existsSync(entitlements)) return;

  console.log(`[afterSign] re-signing ad-hoc with entitlements: ${appPath}`);
  execFileSync(
    "codesign",
    ["--force", "--deep", "--options", "runtime", "--entitlements", entitlements, "-s", "-", appPath],
    { stdio: "inherit" }
  );
}
