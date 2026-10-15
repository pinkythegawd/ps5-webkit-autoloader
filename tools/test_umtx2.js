// Pins the umtx2 integration (FW 1.00-5.50) and the PC host router.
//
// umtx2 is the only multi-file chain: it is staged under
// /app/<version>/umtx2/ and fetches the shared elfldr and the autoload
// payload one directory up (../elfldr.elf, ../autoload.elf). The patch that
// retargets it is generated, so these checks catch a stale or partial patch,
// and the router page is what sends old firmware to the chain in the first
// place.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const ROOT = process.cwd();
const umtx2Main = () => fs.readFileSync('frontend/umtx2/main.js', 'utf8');
const umtx2Index = () => fs.readFileSync('frontend/umtx2/index.html', 'utf8');

(async () => {
  // 1. the generated patch exists and carries every retarget, so it can be
  //    re-applied after any submodule update.
  const patch = fs.readFileSync('patches/umtx2-autoload.patch', 'utf8');
  for (const marker of [
    'wkalAutoloadName = new URLSearchParams',
    'load_local_elf("elfldr.elf", "../")',
    'run(false, false)',
  ]) {
    assert(patch.includes(marker), 'patches/umtx2-autoload.patch must contain: ' + marker);
  }

  // 2. the prepared copy carries the integration. frontend/umtx2 is generated
  //    (gitignored); when absent, say how to make it instead of failing on a
  //    fresh clone that has not built yet.
  if (!fs.existsSync('frontend/umtx2/main.js')) {
    console.log('umtx2: frontend/umtx2 not prepared yet — run: make umtx2-prepare');
    return;
  }
  const main = umtx2Main();
  for (const marker of [
    'wkalAutoloadName = new URLSearchParams',
    'wkalAutoload',
    'load_local_elf("elfldr.elf", "../")',
    'autoload.elf',
  ]) {
    assert(main.includes(marker), 'frontend/umtx2/main.js must contain: ' + marker);
  }
  assert(!/confirm\(/.test(main), 'umtx2 must not block on confirm() dialogs');
  assert(!main.includes('load_local_elf("elfldr-ps5.elf")'),
    'umtx2 must boot the shared elfldr, not its own bundled one');
  assert(/\bonload\b[^]*run\(false, false\)/.test(umtx2Index()),
    'umtx2 must start the chain on page load, with no menu in the way');
  const payloads = fs.existsSync('frontend/umtx2/payloads')
    ? fs.readdirSync('frontend/umtx2/payloads') : [];
  assert.deepEqual(payloads, [], 'the bundled payloads dir must be pruned: ELFs come from ..');
  assert(!fs.existsSync('frontend/umtx2/.git'),
    'the throwaway patch repo must not ship in the frontend');

  // 3. the host router sends each firmware to the chain that supports it.
  function route(userAgent, search = '') {
    const html = fs.readFileSync('frontend/host-index/index.html', 'utf8');
    const code = html.match(/<script>([\s\S]*?)<\/script>/)[1]
      .replaceAll('[[VERSION_PLACEHOLDER]]', 'test-version')
      .replaceAll('[[BUILD_TIME_PLACEHOLDER]]', 'test-build');
    const nodes = Object.fromEntries(['detail', 'route', 'spinner']
      .map(key => [key, { hidden: true, textContent: '', innerHTML: '' }]));
    let target;
    const sandbox = {
      document: { getElementById: key => nodes[key] },
      navigator: { userAgent },
      location: { search, replace: path => { target = path; } },
      setTimeout: fn => fn(),
      URLSearchParams,
    };
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(code, sandbox);
    return { target: () => target, nodes };
  }
  const ps5 = fw => 'Mozilla/5.0 (PlayStation; PlayStation 5/' + fw + ') AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Safari/605.1.15';
  const cases = [
    // [firmware, expected target] (undefined = unsupported screen, no redirect)
    ['1.00', 'umtx2/index.html'], ['3.20', 'umtx2/index.html'], ['5.50', 'umtx2/index.html'],
    ['6.00', undefined], ['6.72', undefined],
    ['7.00', 'relapse.html'], ['9.00', 'relapse.html'],
    ['9.05', 'poops.html'], ['11.40', 'poops.html'],
    ['12.00', 'relapse.html'], ['13.60', 'relapse.html'], ['14.00', undefined],
    ['3.20 with override', 'poops.html'],
  ];
  for (const [fw, expected] of cases) {
    const search = fw.includes('override') ? '?exploit=poops' : '';
    const result = route(ps5(fw.replace(/ .*/, '')), search);
    assert.equal(result.target(), expected,
      'PS5/' + fw + ' should route to ' + (expected || 'the unsupported notice'));
    if (!expected) {
      assert.match(result.nodes.detail.innerHTML, /not supported/i,
        'PS5/' + fw + ' must explain it is unsupported');
    }
  }
  // A desktop browser cannot be fingerprinted; default to the widest chain.
  assert.equal(route('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome').target(), 'relapse.html',
    'desktop preview should default to Relapse');

  // 4. the host builder and the host script agree on every placeholder, so a
  //    rename on either side is caught before a release build.
  const hostScript = fs.readFileSync('pc-host/host.py', 'utf8');
  const builder = fs.readFileSync('tools/build_host.py', 'utf8');
  for (const marker of ['[[EMBEDDED_ZIP]]', '[[VERSION_PLACEHOLDER]]',
    '[[BUILD_TIME_PLACEHOLDER]]', '[[SSL_CERT_PLACEHOLDER]]', '[[SSL_KEY_PLACEHOLDER]]']) {
    assert(builder.includes(marker), 'tools/build_host.py must reference ' + marker);
  }
  for (const [marker, placeholder] of [
    ['# [[EMBEDDED_ZIP]]', 'EMBEDDED_ZIP_B64 = ""'],
    ['# [[VERSION_PLACEHOLDER]]', 'VERSION = "dev"'],
    ['# [[BUILD_TIME_PLACEHOLDER]]', 'BUILD_TIME = "dev"'],
    ['# [[SSL_CERT_PLACEHOLDER]]', 'SSL_CERT_PEM = ""'],
    ['# [[SSL_KEY_PLACEHOLDER]]', 'SSL_KEY_PEM = ""'],
  ]) {
    assert(hostScript.includes(marker + '\n' + placeholder),
      'pc-host/host.py must carry the placeholder block: ' + marker);
  }
  assert(hostScript.includes('pinkythegawd/ps5-webkit-autoloader'),
    'the host update check must point at the fork repository');
  assert(!hostScript.includes('itsPLK'), 'host.py must not point at the upstream repo');
  assert(!hostScript.includes('selected_exploit'),
    'host.py must not serve the removed selected_exploit virtual file');

  // 5. the Makefile stages the whole docroot the host serves.
  const makefile = fs.readFileSync('Makefile', 'utf8');
  for (const required of [
    'umtx2-prepare:',
    'cp $(HOST_INDEX) $(HOST_STAGE)/index.html',
    'cp -R $(UMTX2_DIR) $(HOST_STAGE)/umtx2',
    'cp build/deps/elfldr.elf $(HOST_STAGE)/elfldr.elf',
    'cp $(HOST_PAYLOAD) $(HOST_STAGE)/autoload.elf',
    'tools/build_host.py --frontend $(HOST_STAGE)',
  ]) {
    assert(makefile.includes(required), 'the Makefile host target must contain: ' + required);
  }

  console.log('umtx2 + host checks passed: patch markers, router routing, host placeholders and staging.');
})().catch(error => { console.error(error); process.exitCode = 1; });
