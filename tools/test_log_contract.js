// Log-string contract: frontend/autoloader/app.js drives its progress bar by
// matching substrings of the console lines printed by the loader modules, the
// payloads and the standalone runner. If a source renames one of those
// strings, the page silently strands at the previous stage -- no error
// anywhere, and only on hardware. This pins both halves of the contract:
//
//   1. every matcher still exists in app.js, including the async shape the
//      boot delay rides on (startup scripts are awaited before __boot()), and
//   2. every matched string still exists in the source that prints it.
//
// The [1/3]..[3/3] stage labels come from the runner's template filled with
// the builder's payload labels, which are basenames of the Makefile's payload
// list -- so the three Makefile sequences are pinned too.
//
// Poops never prints the kernel-stage markers; its UI advances via the [2/3]
// label and finishes via the runner's queue summary, which is why those
// strings are only required in relapse.js.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

const FILES = {
  app: 'frontend/autoloader/app.js',
  makefile: 'Makefile',
  runner: 'third_party/ps5-webkit-remote-loader/src/standalone.js',
  site: 'third_party/ps5-webkit-remote-loader/src/site.js',
  main: 'third_party/ps5-webkit-remote-loader/src/main.js',
  relapse: 'third_party/ps5-webkit-remote-loader/payloads/relapse.js',
  elfldrCheck: 'payloads/elfldr-check.js',
  autoload: 'payloads/autoload.js',
  builder: 'third_party/ps5-webkit-remote-loader/tools/build_standalone.py',
};

const text = {};
for (const [key, rel] of Object.entries(FILES)) {
  text[key] = fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

// Each entry: the matcher side in app.js and every printer side that must
// still exist for the UI to advance. All regexes must match.
const CONTRACT = [
  {
    name: 'WebKit boot banners (10% / 20%)',
    app: [/Starting WebKit exploit/, /ARW ready/],
    sources: [
      ['site', /writeLog\("Starting WebKit exploit"\)/],
      ['site', /writeLog\("ARW ready"/],
    ],
  },
  {
    name: 'Worker chain ready (30%)',
    app: [/Worker chain: ready/],
    sources: [
      ['main', /jbmark\("Worker chain", "ready"\)/],
      ['site', /`\$\{name\}: \$\{detail\}`/],
    ],
  },
  {
    name: 'kernel stage markers, Relapse (40%-80%)',
    app: [/Starting kernel exploit/i, /read and write ready/i, /privileges ready/i],
    sources: [
      ['relapse', /"Starting kernel exploit"/],
      ['relapse', /"read and write ready"/],
      ['relapse', /"privileges ready"/],
    ],
  },
  {
    name: 'ELF loader ready (90%), Relapse alternatives',
    app: [/payloads loaded/i, /elfldr/],
    sources: [
      ['relapse', /"payloads loaded"/],
      ['relapse', /elfldr is listening on port 9021/],
    ],
  },
  {
    name: 'queue summary and stop reasons (completion states)',
    app: [/queue finished:/, /queue stopped:/,
      /ELF loader is already accepting connections/, /Autoload: sent/],
    sources: [
      ['runner', /=== queue finished: \$\{run\}\/\$\{queue\.length\} completed, \$\{failed\} failed ===/],
      ['runner', /=== queue stopped: \$\{stopReason\}/],
      ['elfldrCheck', /ELF loader is already accepting connections on 127\.0\.0\.1:9021/],
      ['autoload', /"Autoload: sent " \+ sent \+ " bytes/],
    ],
  },
  {
    name: 'payload stage labels [1/3]..[3/3]',
    app: [/\[1\\\/3\\\]\.\*elfldr-check/, /\[2\\\/3\\\]/, /\[3\\\/3\\\]\.\*autoload/],
    sources: [
      ['runner', /=== \[\$\{i \+ 1\}\/\$\{queue\.length\}\] \$\{label\} ===/],
      ['builder', /self\.label = os\.path\.basename\(path\)/],
      ['makefile', /\$\(CURDIR\)\/payloads\/elfldr-check\.js payloads\/\$\$chain\.js \$\(CURDIR\)\/payloads\/autoload\.js/],
      ['makefile', /\$\(CURDIR\)\/payloads\/elfldr-check\.js payloads\/relapse\.js \$\(CURDIR\)\/payloads\/autoload\.js/],
      ['makefile', /\$\(CURDIR\)\/payloads\/elfldr-check\.js payloads\/poops\.js \$\(CURDIR\)\/payloads\/autoload\.js/],
    ],
  },
  {
    name: 'error line styling (log-error class)',
    app: [/log-\(\?:error\|minus\)/],
    sources: [
      ['site', /line\.className = `log-line log-\$\{lineType\}`/],
    ],
  },
  {
    name: 'startup scripts awaited before boot (boot delay + queue order)',
    app: [/async function \(\) \{/],
    sources: [
      ['builder', /window\.__startupScripts/],
      ['builder', /await new AsyncFunction\(current\.source\)\.call\(window\)/],
      ['builder', /window\.__boot\(\)/],
    ],
  },
];

let failures = 0;
for (const item of CONTRACT) {
  const missing = [];
  for (const pattern of item.app) {
    if (!pattern.test(text.app)) missing.push('app.js: ' + pattern);
  }
  for (const [file, pattern] of item.sources) {
    if (!pattern.test(text[file])) missing.push(FILES[file] + ': ' + pattern);
  }
  if (missing.length) {
    failures += missing.length;
    console.error('FAIL ' + item.name);
    for (const entry of missing) console.error('  missing ' + entry);
  } else {
    console.log('ok   ' + item.name);
  }
}

if (failures) {
  console.error('\nlog contract broken: ' + failures +
    ' string(s) renamed or removed. Progress UI will strand on hardware.');
  process.exit(1);
}
console.log('\nlog contract OK: every app.js matcher still has a live source.');
