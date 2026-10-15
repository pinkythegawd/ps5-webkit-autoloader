// Presentation only: runs through the standalone builder's awaited --js hook.
// Keep the actual console, payloads and exploit in this document.
// "Pinku" chrome for the MikePinku fork: header chips, EN/FR toggle, themed
// progress. The console observer contract is unchanged from upstream.
(function () {
  'use strict';
  var output = document.getElementById('console');
  if (!output || document.getElementById('loader')) return;

  function element(tag, id, parent, text) {
    var node = document.createElement(tag);
    node.id = id;
    if (text) node.textContent = text;
    parent.appendChild(node);
    return node;
  }

  /* ---- i18n (our chrome only; exploit log lines stay as-is) -------------- */
  var STRINGS = {
    en: {
      tagline: 'by MikePinku',
      fw: 'FW',
      chainPoops: 'Poops',
      chainRelapse: 'Relapse',
      chainAuto: 'Autoload',
      start: 'Starting WebKit exploit...',
      webkit: 'Starting WebKit exploit...',
      prepare: 'Preparing WebKit...',
      ready: 'WebKit ready...',
      check: 'Checking ELF loader...',
      kernel: 'Starting kernel exploit...',
      running: 'Running kernel exploit...',
      krw: 'Kernel read/write ready...',
      priv: 'Privileges ready...',
      loaderReady: 'ELF loader ready...',
      autoload: 'Loading autoload payload...',
      finishing: 'Finishing autoload...',
      donePayloads: 'Payloads finished.',
      doneAutoload: 'Autoload finished.',
      failed: 'Autoload failed. See the log above.',
      alreadyRunning: 'ELF loader already running. Nothing to do.',
      stopped: 'Stopped. See the log above.',
      error: 'An error occurred. See the log above.',
      footerNote: 'This project is free and open source: '
    },
    fr: {
      tagline: 'par MikePinku',
      fw: 'FW',
      chainPoops: 'Poops',
      chainRelapse: 'Relapse',
      chainAuto: 'Autoload',
      start: 'Lancement de l’exploit WebKit...',
      webkit: 'Lancement de l’exploit WebKit...',
      prepare: 'Préparation de WebKit...',
      ready: 'WebKit prêt...',
      check: 'Vérification du chargeur ELF...',
      kernel: 'Lancement de l’exploit kernel...',
      running: 'Exécution de l’exploit kernel...',
      krw: 'Accès kernel read/write prêt...',
      priv: 'Privilèges prêts...',
      loaderReady: 'Chargeur ELF prêt...',
      autoload: 'Chargement du payload autoload...',
      finishing: 'Finalisation de l’autoload...',
      donePayloads: 'Payloads terminés.',
      doneAutoload: 'Autoload terminé.',
      failed: 'Échec de l’autoload. Voir le journal ci-dessus.',
      alreadyRunning: 'Chargeur ELF déjà actif. Rien à faire.',
      stopped: 'Interrompu. Voir le journal ci-dessus.',
      error: 'Une erreur est survenue. Voir le journal ci-dessus.',
      footerNote: 'Ce projet est libre et open source : '
    }
  };

  var lang = 'en';
  try {
    lang = window.localStorage.getItem('pkal_lang') ||
      ((navigator.language || '').toLowerCase().indexOf('fr') === 0 ? 'fr' : 'en');
  } catch (error) { lang = 'en'; }
  function t(key) { return (STRINGS[lang] || STRINGS.en)[key] || STRINGS.en[key] || key; }

  /* ---- Chain + firmware chips -------------------------------------------- */
  var chainMatch = /(?:^|\/)(poops|relapse)\.html(?:$|\?)/.exec(location.pathname + '');
  var chain = chainMatch ? chainMatch[1] : null;
  var fwMatch = /PlayStation 5\/(\d+\.\d+)/.exec(navigator.userAgent || '');
  var fw = fwMatch ? fwMatch[1] : null;

  /* ---- Build the chrome --------------------------------------------------- */
  var loader = element('main', 'loader', document.body);

  var header = element('header', 'pageHeader', loader);
  var brand = element('div', 'brand', header);
  var mark = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  mark.setAttribute('id', 'brandMark');
  mark.setAttribute('viewBox', '0 0 64 64');
  mark.innerHTML =
    '<defs><linearGradient id="pkg" x1="0" y1="0" x2="1" y2="1">' +
    '<stop offset="0" stop-color="#ff4fa3"/><stop offset="1" stop-color="#c26bff"/>' +
    '</linearGradient></defs>' +
    '<path fill="url(#pkg)" d="M32 4a28 28 0 1 0 0 56V47a15 15 0 1 1 0-30c8 0 15 6 15 15h13C60 16.3 47.7 4 32 4z"/>' +
    '<circle cx="32" cy="32" r="7" fill="url(#pkg)"/>';
  brand.appendChild(mark);
  var name = element('div', 'brandName', brand, 'WebKit Autoloader');
  element('small', null, name, t('tagline'));

  var chips = element('div', 'statusChips', header);
  var fwChip;
  if (fw) {
    fwChip = element('div', 'fwChip', chips, t('fw') + ' ' + fw);
    fwChip.className = 'chip';
  }
  element('div', 'chainChip', chips,
    chain === 'poops' ? t('chainPoops') : chain === 'relapse' ? t('chainRelapse') : t('chainAuto')
  ).className = 'chip accent';
  var toggle = element('button', 'langToggle', chips, lang === 'fr' ? 'FR' : 'EN');
  toggle.type = 'button';
  toggle.addEventListener('click', function () {
    lang = lang === 'fr' ? 'en' : 'fr';
    toggle.textContent = lang === 'fr' ? 'FR' : 'EN';
    try { window.localStorage.setItem('pkal_lang', lang); } catch (error) { }
    var tagline = document.getElementById('brandName').querySelector('small');
    if (tagline) tagline.textContent = t('tagline');
    if (fwChip) fwChip.textContent = t('fw') + ' ' + fw;
    // Re-render the standing message in the new language; live lines keep
    // coming through say() either way.
    say(lastKey, percent, progress.getAttribute('data-state') || 'running');
  });

  var wrapper = element('div', 'logWrapper', loader);
  wrapper.appendChild(output);
  var progress = element('div', 'progressContainer', loader);
  progress.setAttribute('role', 'progressbar');
  progress.setAttribute('aria-valuemin', '0');
  progress.setAttribute('aria-valuemax', '100');
  var bar = element('div', 'progressBar', progress);
  var label = element('div', 'progressLabel', progress);

  var config = window.WKAL_PAGE || {};
  if (config.version) {
    document.title = 'WebKit Autoloader v' + config.version + ' by MikePinku' +
      (config.buildTime ? ' (built ' + config.buildTime + ')' : '');
  }
  var footer = element('div', 'footer', document.body);
  element('div', 'buildInfo', footer, 'WebKit Autoloader' +
    (config.version ? ' v' + config.version : '') + ' by MikePinku' +
    (config.buildTime ? ' (built ' + config.buildTime + ')' : ''));
  var source = element('div', 'sourceInfo', footer, t('footerNote'));
  var link = element('a', 'sourceLink', source, 'github.com/pinkythegawd/ps5-webkit-autoloader');
  link.href = 'https://github.com/pinkythegawd/ps5-webkit-autoloader';

  /* ---- Progress driver (unchanged contract) -------------------------------- */
  var percent = 0;
  var finished = false;
  var sent = false;
  var lastKey = 'start';
  function update(next, message, state, keepMessage) {
    percent = Math.max(percent, next);
    bar.style.width = percent + '%';
    if (!keepMessage) label.textContent = message;
    progress.setAttribute('aria-valuenow', String(percent));
    if (!keepMessage) progress.setAttribute('aria-valuetext', message);
    progress.setAttribute('data-state', state || 'running');
  }
  update(0, t('start'));

  function say(key, pct, state) {
    lastKey = key;
    update(pct, t(key), state);
  }

  function readLine(line) {
    var text = line.textContent || '';
    var error = /(?:^|\s)log-(?:error|minus)(?:\s|$)/.test(line.className);
    var summary = /queue finished: \d+\/\d+ completed, (\d+) failed/.exec(text);
    if (summary) {
      finished = true;
      if (Number(summary[1]) !== 0) say('failed', percent, 'error');
      else say(sent ? 'doneAutoload' : 'donePayloads', 100, 'done');
      return;
    }
    if (/queue stopped:/.test(text)) {
      finished = true;
      if (error) say('stopped', percent, 'error');
      else if (/ELF loader is already accepting connections/.test(text))
        say('alreadyRunning', 100, 'done');
      else say('stopped', percent, 'stopped');
      return;
    }
    if (error) {
      say('error', percent, 'error');
      return;
    }
    if (finished) return;
    if (/Autoload: sent \d+ bytes/.test(text)) {
      sent = true;
      say('finishing', 98);
    } else if (/\[3\/3\].*autoload\.js/.test(text)) say('autoload', 95);
    else if (/payloads loaded|elfldr.*listening/i.test(text)) say('loaderReady', 90);
    else if (/privileges ready/i.test(text)) say('priv', 80);
    else if (/read and write ready/i.test(text)) say('krw', 65);
    else if (/Starting kernel exploit|\[2\/3\]/i.test(text)) say('kernel', 40);
    else if (/\[1\/3\].*elfldr-check\.js/.test(text)) say('check', 35);
    else if (/Worker chain: ready/i.test(text)) say('ready', 30);
    else if (/ARW ready/i.test(text)) say('prepare', 20);
    else if (/Starting WebKit exploit/i.test(text)) say('webkit', 10);
    else {
      var stage = /\bSTAGE\s*([0-5])\b/i.exec(text);
      if (stage) say('running', 40 + Number(stage[1]) * 10);
    }
  }

  // Observe the native log instead of replacing writeLog or the module APIs.
  // Process only changed lines, including in-place stage updates.
  var observer = new MutationObserver(function (records) {
    var changed = [];
    function remember(node) {
      if (node.nodeType !== 1) node = node.parentNode;
      while (node && node.parentNode !== output) node = node.parentNode;
      if (node && changed.indexOf(node) < 0) changed.push(node);
    }
    records.forEach(function (record) {
      if (record.target === output) {
        for (var i = 0; i < record.addedNodes.length; i++) remember(record.addedNodes[i]);
      } else remember(record.target);
    });
    changed.forEach(readLine);
    while (output.children.length > 80) output.removeChild(output.firstElementChild);
    wrapper.scrollTop = wrapper.scrollHeight;
  });
  observer.observe(output, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class'] });
}());
