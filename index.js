// @ts-check
import { spawn } from 'child_process'
import asar from '@electron/asar'
import prompts from 'prompts'
import yargs from 'yargs'
import chalk from 'chalk'
import path from 'path'
import fs from 'fs'
import os from 'os'

const argv = await yargs(process.argv.slice(2))
  .usage(`Usage: ${path.basename(process.argv0, '.exe')} . <command> [options]`)
  .command('patch', 'Patch HTTP Toolkit')
  .option('proxy', {
    alias: 'p',
    describe: 'Specify a global proxy (only http/https supported)',
    type: 'string'
  })
  .option('path', {
    alias: 'P',
    describe: 'Specify the path to the HTTP Toolkit folder (auto-detected by default)',
    type: 'string'
  })
  .command('restore', 'Restore HTTP Toolkit')
  .command('start', 'Start HTTP Toolkit with debug logs enabled')
  .demandCommand(1, 'You need at least one command before moving on')
  .alias('h', 'help')
  .describe('help', 'Show this help message')
  .parse()

const globalProxy = argv.proxy

const isWin = process.platform === 'win32'
const isMac = process.platform === 'darwin'

//* why is there so many different paths, god damn
const getAppPath = () => {
  if (argv.path) return argv.path.match(/resources$/ig) ? argv.path : path.join(argv.path, isMac ? '/Resources' : '/resources')
  const paths = [
    path.join(process.env.LOCALAPPDATA ?? '', 'Programs', 'httptoolkit', 'resources'), //* Windows
    '/Applications/HTTP Toolkit.app/Contents/Resources', //* macOS
    '/opt/HTTP Toolkit/resources', //* Linux
    '/opt/httptoolkit/resources', //* Arch Linux
    '/usr/lib/httptoolkit' //* Arch Linux (git)
  ]
  for (const p of paths) {
    if (fs.existsSync(p)) return p
  }
  return ''
}

const appPath = getAppPath()

const isSudo = !isWin && (process.getuid || (() => process.env.SUDO_UID ? 0 : null))() === 0

if (+(process.versions.node.split('.')[0]) < 15) {
  console.error(chalk.redBright`[!] Node.js version 15 or higher is recommended, you are currently using version {bold ${process.versions.node}}`)
}

if (!fs.existsSync(path.join(appPath, 'app.asar'))) {
  console.error(chalk.redBright`[-] HTTP Toolkit not found${!argv.path ? ', try specifying the path with --path' : ''}`)
  process.exit(1)
}

console.log(chalk.blueBright`[+] HTTP Toolkit found at {bold ${appPath.match(/resources$/ig) ? path.dirname(appPath) : appPath}}`)

const permissionErrorText = isMac && isSudo ? 'please check known issues in the README' : `try running ${!isWin ? 'with sudo' : 'node as administrator'}`

const rm = (/** @type {string} */ dirPath) => {
  if (!fs.existsSync(dirPath)) return
  if (!fs.lstatSync(dirPath).isDirectory()) return fs.rmSync(dirPath, { force: true })
  for (const entry of fs.readdirSync(dirPath)) {
    const entryPath = path.join(dirPath, entry)
    if (!fs.existsSync(entryPath)) continue
    if (fs.lstatSync(entryPath).isDirectory()) rm(entryPath)
    else fs.rmSync(entryPath, { force: true })
  }
}

const canWrite = (/** @type {string} */ dirPath) => {
  try {
    fs.accessSync(dirPath, fs.constants.W_OK)
    return true
  } catch {
    return false
  }
}

/** @type {Array<import('child_process').ChildProcess>} */
const activeProcesses = []
let isCancelled = false

/** @param {boolean} cancel */
const cleanUp = async (cancel) => {
  if (cancel) {
    isCancelled = true
    console.log(chalk.redBright`[-] Operation cancelled, cleaning up...`)
  }
  if (activeProcesses.length) {
    console.log(chalk.yellowBright`[+] Killing active processes...`)
    for (const proc of activeProcesses) {
      proc.kill('SIGINT')
      console.log(chalk.yellowBright`[+] Process {bold ${proc.pid ? process.pid + ' ' : ''}}killed`)
    }
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  const paths = [
    path.join(os.tmpdir(), 'httptoolkit-patch'),
    path.join(os.tmpdir(), 'httptoolkit-patcher-temp')
  ]
  try {
    for (const p of paths) {
      if (fs.existsSync(p)) {
        console.log(chalk.yellowBright`[+] Removing {bold ${p}}`)
        rm(p)
      }
    }
  } catch (e) {
    console.error(chalk.redBright`[-] An error occurred while cleaning up`, e)
  }
  if (cancel) process.exit(1)
}

const patchApp = async () => {
  const filePath = path.join(appPath, 'app.asar')
  const tempPath = path.join(os.tmpdir(), 'httptoolkit-patcher-temp')

  if (fs.readFileSync(filePath).includes('Injected by HTTP Toolkit Patcher')) {
    console.log(chalk.yellowBright`[!] HTTP Toolkit already patched`)
    return
  }

  console.log(chalk.blueBright`[+] Started patching app...`)

  if (!canWrite(filePath)) {
    console.error(chalk.redBright`[-] Insufficient permissions to write to {bold ${filePath}}, ${permissionErrorText}`)
    process.exit(1)
  }

  if (globalProxy) {
    if (!globalProxy.match(/^https?:/)) {
      console.error(chalk.redBright`[-] Global proxy must start with http:// or https://`)
      process.exit(1)
    }
    console.log(chalk.yellowBright`[+] Adding a custom global proxy: {bold ${globalProxy}}`)
  }

  console.log(chalk.yellowBright`[+] Extracting app...`)

  ;['SIGINT', 'SIGTERM'].forEach(signal => process.on(signal, () => cleanUp(true)))

  try {
    rm(tempPath)
    if (fs.existsSync(tempPath)) fs.rmSync(tempPath, { recursive: true })
    fs.mkdirSync(tempPath)
    asar.extractAll(filePath, tempPath)
  } catch (e) {
    if (!isSudo && e.errno === -13) { //? Permission denied
      console.error(chalk.redBright`[-] Permission denied, ${permissionErrorText}`)
      process.exit(1)
    }
    console.error(chalk.redBright`[-] An error occurred while extracting app`, e)
    process.exit(1)
  }

  const indexPath = path.join(tempPath, 'build', 'index.js')
  if (!fs.existsSync(indexPath)) {
    console.error(chalk.redBright`[-] Index file not found`)
    await cleanUp(true)
  }
  const data = fs.readFileSync(indexPath, 'utf-8')
  ;['SIGINT', 'SIGTERM'].forEach(signal => process.off(signal, () => cleanUp(true)))
  //? Hardcoded random email - no prompt needed
  const email = `user${Math.random().toString(36).substring(2, 11)}@httptoolkit-pro.local`
  console.log(chalk.greenBright`[+] Using email: {bold ${email}}`)
  ;['SIGINT', 'SIGTERM'].forEach(signal => process.on(signal, () => cleanUp(true)))
  const patch = fs.readFileSync('patch.js', 'utf-8')
  //? No need to clean patch anymore - we use unique variable names (patcherFs, patcherPath, patcherOs, patcherApp)
  const patchedData = data
    .replace('const APP_URL =', `// ------- Injected by HTTP Toolkit Patcher -------\nconst email = \`${email.replace(/`/g, '\\`')}\`\nconst globalProxy = process.env.PROXY ?? \`${globalProxy ? globalProxy.replace(/`/g, '\\`') : ''}\`\n${patch}\n// ------- End patched content -------\nconst APP_URL =`)

  if (data === patchedData || !patchedData) {
    console.error(chalk.redBright`[-] Patch failed`)
    await cleanUp(true)
  }

  fs.writeFileSync(indexPath, patchedData, 'utf-8')
  console.log(chalk.greenBright`[+] Patched index.js`)
  console.log(chalk.yellowBright`[+] Installing dependencies...`)
  try {
    const proc = spawn('npm install express axios got-scraping https-proxy-agent', { cwd: tempPath, stdio: 'inherit', shell: true })
    activeProcesses.push(proc)
    await new Promise(resolve =>
      proc.on('close', resolve)
    )
    activeProcesses.splice(activeProcesses.indexOf(proc), 1)
    if (isCancelled) return
  } catch (e) {
    console.error(chalk.redBright`[-] An error occurred while installing dependencies`, e)
    await cleanUp(true)
  }
  rm(path.join(tempPath, 'package-lock.json'))
  fs.copyFileSync(filePath, `${filePath}.bak`)
  console.log(chalk.greenBright`[+] Backup created at {bold ${filePath}.bak}`)
  console.log(chalk.yellowBright`[+] Building app...`)
  await asar.createPackage(tempPath, filePath)
  rm(tempPath)
  console.log(chalk.greenBright`[+] HTTP Toolkit patched successfully`)
  console.log(chalk.greenBright`[+] Restart HTTP Toolkit to apply changes`)
  await cleanUp(false)
}

switch (argv._[0]) {
  case 'patch':
    await patchApp()
    break
  case 'restore':
    try {
      console.log(chalk.blueBright`[+] Restoring HTTP Toolkit...`)
      if (!fs.existsSync(path.join(appPath, 'app.asar.bak')))
        console.error(chalk.redBright`[-] HTTP Toolkit not patched or backup file not found`)
      else {
        fs.copyFileSync(path.join(appPath, 'app.asar.bak'), path.join(appPath, 'app.asar'))
        console.log(chalk.greenBright`[+] HTTP Toolkit restored`)
      }
      rm(path.join(os.tmpdir(), 'httptoolkit-patch'))
    } catch (e) {
      if (!isSudo && e.errno === -13) { //? Permission denied
        console.error(chalk.redBright`[-] Permission denied, ${permissionErrorText}`)
        process.exit(1)
      }
      console.error(chalk.redBright`[-] An error occurred`, e)
      process.exit(1)
    }
    break
  case 'start':
    console.log(chalk.blueBright`[+] Starting HTTP Toolkit...`)
    if (isSudo) console.warn(chalk.yellowBright`[!] Warning: Running with sudo may cause issues`)
    try {
      const command =
        isWin ? `"${path.resolve(appPath, '..', 'HTTP Toolkit.exe')}"`
        : isMac ? 'open -a "HTTP Toolkit"'
        : 'httptoolkit'
      //? Try to disable ASAR integrity check by setting environment variable
      const env = { ...process.env, ELECTRON_DISABLE_ASAR_INTEGRITY: '1' }
      const proc = spawn(command, { stdio: 'inherit', shell: true, env })
      proc.on('close', code => process.exit(code))
    } catch (e) {
      console.error(chalk.redBright`[-] An error occurred`, e)
      if (isSudo) console.error(chalk.redBright`[-] Try running without sudo`)
      process.exit(1)
    }
    break
  default:
    console.error(chalk.redBright`[-] Unknown command`)
    process.exit(1)
}

if (!isCancelled) console.log(chalk.greenBright`[+] Done`)
