/* globals mscConfirm */

'use strict';

document.getElementById('editor-css').value = (localStorage.getItem('editor-css') || '');
document.getElementById('root-css').value = (localStorage.getItem('root-css') || '');

document.getElementById('save').addEventListener('click', () => {
  localStorage.setItem('editor-css', document.getElementById('editor-css').value);
  localStorage.setItem('root-css', document.getElementById('root-css').value);

  const info = document.getElementById('info');
  info.textContent = 'Options saved';
  window.setTimeout(() => info.textContent = '', 750);
});
document.getElementById('support').addEventListener('click', () => chrome.tabs.create({
  url: chrome.runtime.getManifest().homepage_url + '?rd=donate'
}));

document.getElementById('export').addEventListener('click', () => chrome.storage.local.get(null, prefs => {
  const p = {};
  p.headers = (prefs.headers || []);
  p.headers.forEach(({id}) => {
    p[id + '-content'] = prefs[id + '-content'];
    p[id + '-bookmark'] = prefs[id + '-bookmark'];
  });

  const text = JSON.stringify(p, null, '\t');
  const blob = new Blob([text], {type: 'application/json'});
  const objectURL = URL.createObjectURL(blob);
  Object.assign(document.createElement('a'), {
    href: objectURL,
    type: 'application/json',
    download: 'my-notes.json',
  }).dispatchEvent(new MouseEvent('click'));
  setTimeout(() => URL.revokeObjectURL(objectURL));
}));

function close() {
  chrome.runtime.getBackgroundPage(b => {
    b.ports.forEach(p => p.postMessage({
      method: 'close'
    }));
  });
}

document.getElementById('import').addEventListener('click', () => {
  chrome.storage.local.get(null, prefs => {
    const fileInput = document.createElement('input');
    fileInput.style.display = 'none';
    fileInput.type = 'file';
    fileInput.accept = '.json';
    fileInput.acceptCharset = 'utf-8';

    document.body.appendChild(fileInput);
    fileInput.initialValue = fileInput.value;
    fileInput.onchange = readFile;
    fileInput.click();

    function readFile() {
      if (fileInput.value !== fileInput.initialValue) {
        const file = fileInput.files[0];
        if (file.size > 100e6) {
          console.warn('100MB backup? I don\'t believe you.');
          return;
        }
        const fReader = new FileReader();
        fReader.onloadend = event => {
          fileInput.remove();
          const json = JSON.parse(event.target.result);
          const ids = [];
          json.headers.forEach(o => ids.push(o.id));
          // remove duplicated ids
          prefs.headers = (prefs.headers || []).filter(o => ids.indexOf(o.id) === -1);
          prefs.headers = [...prefs.headers, ...json.headers];
          const p = {
            headers: prefs.headers
          };
          json.headers.map(o => o.id).forEach(id => {
            p[id + '-content'] = json[id + '-content'];
            p[id + '-bookmark'] = json[id + '-bookmark'];
          });
          close();
          window.setTimeout(() => chrome.storage.local.set(p, () => chrome.runtime.reload()), 1000);
        };
        fReader.readAsText(file, 'utf-8');
      }
    }
  });
});
document.getElementById('reset').addEventListener('click', () => {
  mscConfirm('All your notes will be deleted. Are you sure?', () => {
    close();
    window.setTimeout(() => {
      chrome.storage.local.clear(() => chrome.runtime.reload());
    }, 500);
  });
});

document.getElementById('open').addEventListener('click', () => chrome.tabs.create({
  url: '/data/options/index.html'
}));
