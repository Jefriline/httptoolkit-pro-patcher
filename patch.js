//? Use createRequire to use CommonJS modules in ES module context
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const { HttpsProxyAgent } = require('https-proxy-agent')
const axios = require('axios').default
const electron = require('electron')
const express = require('express')
//? Use unique names to avoid conflicts with HTTP Toolkit's variables
const patcherFs = require('fs')
const patcherPath = require('path')
const patcherOs = require('os')
let gotScraping;

async function fetchWithGotScraping(url) {
  gotScraping ??= (await import('got-scraping')).gotScraping;

  return gotScraping.get({
    url: 'https://app.httptoolkit.tech' + url,
    headerGeneratorOptions: {
      browsers: [
        {
            name: 'chrome',
            minVersion: 87,
            maxVersion: 89
        }
    ],
    devices: ['desktop'],
    locales: ['de-DE', 'en-US'],
    operatingSystems: ['windows', 'linux'],
    }
  })
};

function showPatchError(message) {
  console.error(message)
  electron.dialog.showErrorBox('Patch Error', message + '\n\nPlease report this issue on the GitHub repository (github.com/XielQs/httptoolkit-pro-patcher)')
}

const axiosInstance = axios.create({
  baseURL: 'https://app.httptoolkit.tech',
  httpsAgent:
    globalProxy
      ? new HttpsProxyAgent(
          globalProxy.startsWith('http')
            ? globalProxy.replace(/^http:/, 'https:')
            : 'https://' + globalProxy
        )
      : undefined //? Use proxy if set (globalProxy is injected by the patcher)
})

const hasInternet = () => axiosInstance.head('/', { headers: { 'Accept-Encoding': 'gzip, deflate, br', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) httptoolkit/1.19.1 Chrome/122.0.6261.130 Electron/29.1.5 Safari/537.36' } }).then(() => true).catch(() => false)

const patcherPort = process.env.PORT || 5067
const patcherTempPath = patcherPath.join(patcherOs.tmpdir(), 'httptoolkit-patch')

process.env.APP_URL = `http://localhost:${patcherPort}`
console.log(`[Patcher] Selected temp path: ${patcherTempPath}`)

const patcherApp = express()

patcherApp.disable('x-powered-by')

patcherApp.use(async (req, res, next) => {
  console.log(`[Patcher] Request to: ${req.url}`)

  const requestURL = new URL(req.url, process.env.APP_URL).pathname

  let filePath = patcherPath.join(patcherTempPath, requestURL === '/' ? 'index.html' : requestURL)

  if (['/view', '/intercept', '/settings', '/mock'].includes(requestURL)) {
    filePath += '.html'
  }

  //? Prevent loading service worker to avoid caching issues
  if (requestURL === '/ui-update-worker.js') {
    console.log(`[Patcher] Preventing service worker from loading`)
    res.header('Content-Type', 'application/javascript').send('self.addEventListener("install",e=>{e.waitUntil(self.skipWaiting()),console.log("[Patcher] HTTP Toolkit patched successfully =3")}),self.addEventListener("activate",e=>{e.waitUntil(self.clients.claim())}),self.addEventListener("fetch",()=>{});')
    return //? Response sent, don't continue
  }

  if (!patcherFs.existsSync(patcherTempPath)) {
    console.log(`[Patcher] Temp path not found, creating: ${patcherTempPath}`)
    patcherFs.mkdirSync(patcherTempPath)
  }

  if (!(await hasInternet())) {
    console.log(`[Patcher] No internet connection, trying to serve directly from temp path`)
    if (patcherFs.existsSync(filePath)) {
      console.log(`[Patcher] Serving from temp path: ${filePath}`)
      res.sendFile(filePath)
    } else {
      console.log(`[Patcher] File not found in temp path: ${filePath}`)
      const error = `No internet connection and file is not cached for file: ${requestURL}`
      res.status(200).send(patcherPath.extname(filePath) === '.js' ? `console.error(\`${error}\`);` : error)
    }
    return
  }

  const reqHeaders = req.headers
  reqHeaders.host = 'app.httptoolkit.tech'
  reqHeaders.referer = 'https://app.httptoolkit.tech/'
  reqHeaders.origin = 'https://app.httptoolkit.tech'

  try {
    if (patcherFs.existsSync(filePath)) { //? Check if file exists in temp path
      try {
        const remoteDate = await axiosInstance.head(req.url, { headers: reqHeaders }).then(res => new Date(res.headers['last-modified']))
        if (remoteDate < new Date(patcherFs.statSync(filePath).mtime)) {
          console.log(`[Patcher] File not changed, serving from temp path`)
          res.sendFile(filePath)
          return
        }
      } catch (e) {
        console.error(`[Patcher] [ERR] Failed to fetch remote file date`, e)
      }
    } else console.log(`[Patcher] File not found in temp path, downloading`)

    //? Remove Accept-Encoding to get uncompressed response, or use decompress
    const cleanHeaders = { ...reqHeaders }
    delete cleanHeaders['accept-encoding']
    cleanHeaders['Accept-Encoding'] = 'identity' //? Request uncompressed
    
    const remoteFile = await axiosInstance.get(req.url, {
      headers: cleanHeaders,
      responseType: 'arraybuffer',
      decompress: true //? Auto-decompress gzip/deflate/brotli
    })

    for (const [key, value] of Object.entries(remoteFile.headers)) res.setHeader(key, value)

    const recursiveMkdir = dir => {
      if (!patcherFs.existsSync(dir)) {
        recursiveMkdir(patcherPath.dirname(dir))
        patcherFs.mkdirSync(dir)
      }
    }

    recursiveMkdir(patcherPath.dirname(filePath))

    let data = remoteFile.data

    if (requestURL === '/main.js') { //? Patch main.js
      console.log(`[Patcher] Patching main.js`)
      res.setHeader('Cache-Control', 'no-store') //? Prevent caching

      //? Convert Buffer to string - try to decompress if needed
      if (Buffer.isBuffer(data)) {
        const zlib = require('zlib')
        try {
          //? Try to decompress gzip
          data = zlib.gunzipSync(data).toString('utf8')
          console.log(`[Patcher] Decompressed gzip main.js`)
        } catch (e1) {
          try {
            //? Try to decompress brotli
            data = zlib.brotliDecompressSync(data).toString('utf8')
            console.log(`[Patcher] Decompressed brotli main.js`)
          } catch (e2) {
            //? Not compressed, just convert to string
            data = data.toString('utf8')
            console.log(`[Patcher] main.js not compressed, using raw`)
          }
        }
      } else {
        data = String(data)
      }
      
      console.log(`[Patcher] main.js length: ${data.length}, first 100 chars: ${data.substring(0, 100)}`)

      if (data === '' || data.length < 1000) {
        console.log(`[Patcher] main.js appears empty or too small, trying got-scraping`)
        const remoteFile = await fetchWithGotScraping(req.url);
        data = remoteFile.body.toString('utf8')
        console.log("remoteFile", remoteFile.statusCode)
      }

      const accStoreName = data.match(/class\s+([0-9A-Za-z_$]+)\s*\{constructor\s*\(\s*e\s*\)\s*\{this\.goToSettings\s*=\s*e/)?.[1]
      const modName = data.match(/([0-9A-Za-z_$]+)\.(getLatestUserData|getLastUserData)/)?.[1]

      if (!accStoreName) showPatchError(`[Patcher] [ERR] Account store name not found in main.js`)
      else if (!modName) showPatchError(`[Patcher] [ERR] Module name not found in main.js`)
      else {
        let patched = data
          .replace(`class ${accStoreName}{`, `["getLatestUserData","getLastUserData"].forEach(p=>Object.defineProperty(${modName},p,{value:()=>user}));class ${accStoreName}{`)
        if (patched === data) showPatchError(`[Patcher] [ERR] Patch failed`)
        else {
          patched = `const user=${JSON.stringify({
            email, //? Injected by the patcher
            oderId: 'patcher-' + Date.now(),
            featureFlags: [], //? Required - array of feature flags
            banned: false,
            subscription: {
              status: 'active',
              quantity: 1,
              expiry: new Date('9999-12-31').toISOString(),
              sku: 'pro-annual',
              plan: 'pro-annual',
              tierCode: 'pro',
              interval: 'annual',
              canManageSubscription: true,
              updateBillingDetailsUrl: 'https://github.com/XielQs/httptoolkit-pro-patcher',
            },
            teamSubscription: null //? Required - can be null for individual users
          })};user.subscription.expiry=new Date(user.subscription.expiry);` + patched
          data = patched
          console.log(`[Patcher] main.js patched`)
        }
      }
    }
    if (data === '') {
      console.error(`[Patcher] [ERR] Empty response for file: ${filePath}`, remoteFile)
      const error = `Empty response for file: ${requestURL}`
      res.status(200).send(patcherPath.extname(filePath) === '.js' ? `console.error(\`${error}\`);document.dispatchEvent(Object.assign(new Event('load:failed'),{error:new Error(\`${error}\`)}))` : error)
      return
    } else patcherFs.writeFileSync(filePath, data)
    console.log(`[Patcher] File downloaded and saved: ${filePath}`)
    res.sendFile(filePath)
  } catch (e) {
    console.error(`[Patcher] [ERR] Failed to fetch remote file: ${filePath}`, e)
    res.status(500).send('Internal server error')
  }
})

patcherApp.listen(patcherPort, () => console.log(`[Patcher] Server listening on port ${patcherPort}`))

electron.app.on('ready', () => {
  //? Patching CORS headers to allow requests from localhost
  electron.session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
    //* Blocking unwanted requests to prevent tracking
    try {
      if (!details || !details.url) return callback({})
      const blockedHosts = ['events.httptoolkit.tech']
      const urlHostname = new URL(details.url).hostname
      if (blockedHosts.includes(urlHostname) || details.url.includes('sentry')) return callback({ cancel: true })
      if (details.requestHeaders) {
        details.requestHeaders.Origin = 'https://app.httptoolkit.tech'
      }
      callback({ requestHeaders: details.requestHeaders || {} })
    } catch (e) {
      callback({})
    }
  })
  electron.session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    try {
      if (!details || !details.responseHeaders) return callback({})
      details.responseHeaders['Access-Control-Allow-Origin'] = [`http://localhost:${patcherPort}`]
      delete details.responseHeaders['access-control-allow-origin']
      callback({ responseHeaders: details.responseHeaders })
    } catch (e) {
      callback({})
    }
  })
})

//? Disable caching for all requests
electron.app.commandLine.appendSwitch('disable-http-cache')
