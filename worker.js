const store = prefs => new Promise(resolve => chrome.storage.local.set(prefs, resolve));

chrome.runtime.onMessage.addListener((request, sender, response) => {
  if (request.method === 'save-note') {
    const {id, content, bookmark} = request;

    store({
      [id + '-content']: content,
      [id + '-bookmark']: bookmark
    }).then(response);

    return true;
  }
  else if (request.method === 'save-bookmark') {
    const {id, bookmark} = request;

    store({
      [id + '-bookmark']: bookmark
    }).then(response);

    return true;
  }
  else if (request.method === 'delete-note') {
    const {id} = request;

    chrome.storage.local.remove([
      id + '-content',
      id + '-bookmark'
    ]);
  }
  else if (request.method === 'bring-to-front') {
    chrome.tabs.update(sender.tab.id, {
      highlighted: true
    });
    chrome.windows.update(sender.tab.windowId, {
      focused: true
    });
  }
});

chrome.contextMenus.onClicked.addListener(info => {
  const {menuItemId, selectionText} = info;

  if (menuItemId.startsWith('note-')) {
    chrome.runtime.sendMessage({
      method: 'append-content',
      content: selectionText
    }, r => {
      chrome.runtime.lastError;
      if (r !== true) {
        const id = menuItemId + '-content';

        chrome.storage.local.get({
          [id]: ''
        }, prefs => {
          const content = prefs[id] + '<br><br>' + selectionText;
          store({
            [id]: content
          });
        });
      }
    });
  }
});

// browser action UI opening
chrome.action.onClicked.addListener(tab => {
  chrome.runtime.sendMessage({
    method: 'exists'
  }, async r => {
    chrome.runtime.lastError;
    const win = await chrome.windows.getCurrent();

    chrome.storage.local.get({
      'mode': 'tab',
      'width': 800,
      'height': 600,
      'content-height': 300,
      'left': win.left + Math.round((win.width - 700) / 2),
      'top': win.top + Math.round((win.height - 500) / 2)
    }, prefs => {
      if (prefs.mode === 'tab') {
        if (r !== true) {
          chrome.tabs.create({
            index: tab.index + 1,
            url: '/data/editor/index.html'
          });
        }
      }
      else if (prefs.mode === 'application-content') {
        chrome.windows.get(tab.windowId, win => {
          chrome.windows.update(tab.windowId, {
            top: win.top,
            height: win.height - prefs['content-height']
          });
          if (r !== true) {
            chrome.windows.create({
              url: 'data/editor/index.html',
              width: win.width,
              height: prefs['content-height'],
              left: win.left,
              top: win.top + win.height - 300,
              type: 'popup'
            });
          }
        });
      }
      else if (r !== true) {
        chrome.windows.create({
          url: 'data/editor/index.html',
          width: prefs.width,
          height: prefs.height,
          left: prefs.left,
          top: prefs.top,
          type: 'popup'
        });
      }
    });
  });
});

// context-menu creation
const menu = () => {
  chrome.storage.local.get({
    mode: 'tab',
    headers: [{
      name: 'My first note',
      id: 'note--1'
    }]
  }, ({headers, mode}) => {
    const cache = {};
    headers.forEach(h => cache[h.id] = h);
    const items = headers.filter(h => h.id.startsWith('note-')).map(h => ({
      type: 'normal',
      id: h.id,
      title: (h.parent && cache[h.parent] ? cache[h.parent].name + '/' + h.name : h.name) || 'no name',
      contexts: ['selection'],
      documentUrlPatterns: ['*://*/*']
    }));
    // browser-action
    items.push({
      id: 'browser-mode-tab',
      title: 'Mode: Tab',
      contexts: ['action'],
      type: 'radio',
      checked: mode === 'tab'
    }, {
      id: 'browser-mode-window',
      title: 'Mode: Window',
      contexts: ['action'],
      type: 'radio',
      checked: mode === 'window'
    }, {
      id: 'browser-mode-application-content',
      title: 'Mode: Application Content',
      contexts: ['action'],
      type: 'radio',
      checked: mode === 'application-content'
    });
    chrome.contextMenus.removeAll(() => {
      for (const item of items) {
        chrome.contextMenus.create(item);
      }
    });
  });
};
chrome.runtime.onInstalled.addListener(menu);
chrome.runtime.onStartup.addListener(menu);
chrome.storage.onChanged.addListener(ps => ps.headers && menu());

chrome.contextMenus.onClicked.addListener(({menuItemId}) => {
  store({
    mode: menuItemId.replace('browser-mode-', '')
  });
});

/* FAQs & Feedback */
{
  const {management, runtime: {onInstalled, setUninstallURL, getManifest}, storage, tabs} = chrome;
  if (navigator.webdriver !== true) {
    const page = getManifest().homepage_url;
    const {name, version} = getManifest();
    onInstalled.addListener(({reason, previousVersion}) => {
      management.getSelf(({installType}) => installType === 'normal' && storage.local.get({
        'faqs': true,
        'last-update': 0
      }, prefs => {
        if (reason === 'install' || (prefs.faqs && reason === 'update')) {
          const doUpdate = (Date.now() - prefs['last-update']) / 1000 / 60 / 60 / 24 > 45;
          if (doUpdate && previousVersion !== version) {
            tabs.query({active: true, currentWindow: true}, tbs => tabs.create({
              url: page + '?version=' + version + (previousVersion ? '&p=' + previousVersion : '') + '&type=' + reason,
              active: reason === 'install',
              ...(tbs && tbs.length && {index: tbs[0].index + 1})
            }));
            storage.local.set({'last-update': Date.now()});
          }
        }
      }));
    });
    setUninstallURL(page + '?rd=feedback&name=' + encodeURIComponent(name) + '&version=' + version);
  }
}
