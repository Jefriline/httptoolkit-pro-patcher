<h1 align="center">HTTP Toolkit Pro Patcher</h1>

This is a simple tool to patch HTTP Toolkit to enable the Pro features without a license or subscription. **But please consider supporting the developer by purchasing a license if you find the HTTP Toolkit useful.**

## Important: Pre-requisites

Before patching, you **MUST** disable the ASAR integrity check in HTTP Toolkit. This is required because Electron validates the integrity of the `app.asar` file, and our patch modifies it.

### Step 1: Disable ASAR Integrity Check

Run this command in PowerShell (Windows) or Terminal (macOS/Linux):

**Windows:**
```powershell
npx --yes @electron/fuses write --app "C:\Users\YOUR_USERNAME\AppData\Local\Programs\HTTP Toolkit\HTTP Toolkit.exe" EnableEmbeddedAsarIntegrityValidation=off OnlyLoadAppFromAsar=off
```

**macOS:**
```bash
npx --yes @electron/fuses write --app "/Applications/HTTP Toolkit.app" EnableEmbeddedAsarIntegrityValidation=off OnlyLoadAppFromAsar=off
```

**Linux:**
```bash
npx --yes @electron/fuses write --app "/opt/HTTP Toolkit/httptoolkit" EnableEmbeddedAsarIntegrityValidation=off OnlyLoadAppFromAsar=off
```

> **Note:** Replace `YOUR_USERNAME` with your actual Windows username. You can find the exact path by right-clicking on HTTP Toolkit shortcut and selecting "Open file location".

> **Important:** You need to run this command **every time you reinstall or update HTTP Toolkit**, as the update will restore the original integrity checks.

## Installation & Usage

### Step 2: Clone and Install

```bash
git clone https://github.com/Jefriline/httptoolkit-pro-patcher.git
cd httptoolkit-pro-patcher
npm install
```

### Step 3: Apply the Patch

```bash
node . patch
```

If HTTP Toolkit is not auto-detected, specify the path manually:

**Windows:**
```powershell
node . patch --path "C:\Users\YOUR_USERNAME\AppData\Local\Programs\HTTP Toolkit"
```

**macOS:**
```bash
node . patch --path "/Applications/HTTP Toolkit.app"
```

**Linux:**
```bash
node . patch --path "/opt/HTTP Toolkit"
```

### Step 4: Start HTTP Toolkit

You can start HTTP Toolkit normally from the Start Menu/Applications, or use the patcher to start it with debug logs:

```bash
node . start --path "PATH_TO_HTTP_TOOLKIT"
```

That's it! The HTTP Toolkit should now have the Pro features enabled.

## CLI Reference

```sh
Usage: node . <command> [options]

Commands:
  patch    Patch HTTP Toolkit
  restore  Restore HTTP Toolkit to original state
  start    Start HTTP Toolkit with debug logs enabled

Options:
      --version  Show version number                                   [boolean]
  -p, --proxy    Specify a global proxy (only http/https supported)     [string]
  -P, --path     Specify the path to the HTTP Toolkit folder (auto-detected by
                 default)                                                [string]
  -h, --help     Show this help message                                [boolean]
```

## Restoring Original HTTP Toolkit

If you want to remove the patch and restore HTTP Toolkit to its original state:

```bash
node . restore --path "PATH_TO_HTTP_TOOLKIT"
```

## Using with Proxy

If you want to add a proxy to the patcher, you can use the `--proxy` option:

```bash
node . patch --proxy http://x.x.x.x:8080
```

You can also set the `PROXY` environment variable:

```bash
# Linux/macOS
PROXY=http://x.x.x.x:8080 node . start

# Windows PowerShell
$env:PROXY="http://x.x.x.x:8080"; node . start
```

**Note**: The proxy must be an HTTPS/HTTP proxy. SOCKS proxies are not supported.

**Note**: `Proxy` is only used for the patcher. The HTTP Toolkit itself will not use the proxy, so you will need to configure the HTTP Toolkit to use the proxy if you want to use it.

![HTTP Toolkit Proxy Settings](https://i.imgur.com/Ti2vIgb.png)

## How it works

This tool:

1. **Patches the Electron app**: Injects code into HTTP Toolkit's `index.js` file
2. **Creates a local server**: Runs on port 5067 to intercept requests to `app.httptoolkit.tech`
3. **Modifies main.js**: Intercepts the `main.js` file and injects Pro user credentials
4. **Blocks telemetry**: Prevents HTTP Toolkit from sending analytics data

For more detailed information, see the [patch's source code](patch.js) or the [patcher](index.js) file.

**Tip**: You can change the `PORT` environment variable to use a different port. For example, `PORT=8080 node . start`.

## Requirements

- [Node.js](https://nodejs.org) (v15 or higher) (with npm 7 at least)
- HTTP Toolkit installed

## Compatibility

| Platform | Status | Tested Version |
|----------|--------|----------------|
| Windows  | Tested and Approved | v1.24.2 |
| Linux    | Supported | - |
| macOS    | Supported | - |

## Troubleshooting

### "Integrity check failed for asar archive" Error

This means you haven't disabled the ASAR integrity check. Run the `@electron/fuses` command from [Step 1](#step-1-disable-asar-integrity-check).

**If you just updated HTTP Toolkit**, you need to run the fuses command again, then re-apply the patch.

### "HTTP Toolkit not found" Error

Specify the path manually using the `--path` option. Common paths:

- **Windows**: `C:\Users\YOURUSERNAME\AppData\Local\Programs\HTTP Toolkit`
- **macOS**: `/Applications/HTTP Toolkit.app`
- **Linux**: `/opt/HTTP Toolkit` or `/usr/lib/httptoolkit`

### "No internet connection and file is not cached" Error

The patcher needs internet access to download HTTP Toolkit's web app files. Make sure:
1. You have an active internet connection
2. If using a proxy, ensure it's working correctly

### Permission Errors

- **Windows**: Run PowerShell as Administrator
- **Linux**: Use `sudo` before the command
- **macOS**: Enable "App Management" for your terminal emulator in System Preferences > Privacy & Security

### Java Attach APIs Error

If you see this error:
```
Exception in thread "main" java.lang.NoClassDefFoundError: com/sun/tools/attach/AgentLoadException
=> Java attach APIs are not available
```

**This is NOT a problem.** It's just HTTP Toolkit trying to use Java debugging features which are not available. The patcher still works correctly.

### After Updating HTTP Toolkit

Every time you update HTTP Toolkit:
1. Run the `@electron/fuses` command to disable integrity checks
2. Run `node . patch` again to re-apply the patch

## Screenshot

![Screenshot](https://i.imgur.com/eAmDmZF.png)

Background: [Doki Theme](https://github.com/doki-theme/doki-theme-vscode)

## License

This project is licensed under the [MIT License](LICENSE).

## Disclaimer

This project is for educational purposes only. I do not condone piracy or any illegal activities. Use at your own risk.

## Credits

- [HTTP Toolkit](https://httptoolkit.com) for the awesome app
- [Titoot](https://github.com/Titoot) for creating the [httptoolkit-interceptor](https://github.com/Titoot/httptoolkit-interceptor)
- [XielQ](https://github.com/XielQs) for the original creator of this patcher
- [Jefriline](https://github.com/Jefriline) for updating and maintaining this patcher for v1.24.2

## Show Your Support

If you found this project helpful or interesting, please give it a star!

[![Star History Chart](https://api.star-history.com/svg?repos=Jefriline/httptoolkit-pro-patcher&type=Date)](https://star-history.com/#Jefriline/httptoolkit-pro-patcher&Date)
