/* globals webext */
'use strict';

// notepad lazy internals
var ports = [];

webext.runtime.on('message', ({id, content, bookmark}, sender, response) => {
  webext.storage.set({
    [id + '-content']: content,
    [id + '-bookmark']: bookmark
  }).then(response);
  return true;
}).if(({method}) => method === 'save-note');
webext.runtime.on('message', ({id, bookmark}, sender, response) => webext.storage.set({
  [id + '-bookmark']: bookmark
}).then(response)).if(({method}) => method === 'save-bookmark');
webext.runtime.on('message', ({id}) => webext.storage.remove([
  id + '-content',
  id + '-bookmark'
])).if(({method}) => method === 'delete-note');

webext.contextMenus.on('clicked', ({menuItemId, selectionText}) => {
  const port = ports.filter(p => p.id === menuItemId).shift();
  if (port) {
    port.postMessage({
      method: 'append-content',
      content: selectionText
    });
  }
  else {
    const id = menuItemId + '-content';
    webext.storage.get({
      [id]: ''
    }).then(prefs => {
      const content = prefs[id] + '<br><br>' + selectionText;
      webext.storage.set({
        [id]: content
      });
    });
  }
}).if(({menuItemId}) => menuItemId.startsWith('note-'));

webext.runtime.on('connect', port => {
  ports.push(port);
  port.onMessage.addListener(request => {
    if (request.method === 'my-id') {
      port.id = request.id;
    }
  });
  port.onDisconnect.addListener(() => {
    const index = ports.indexOf(port);
    if (index !== -1) {
      ports.splice(index, 1);
    }
  });
});

// browser action UI opening
webext.browserAction.on('clicked', tab => webext.storage.get({
  mode: 'tab',
  width: 800,
  height: 600,
  'content-height': 300,
  left: screen.availLeft + Math.round((screen.availWidth - 700) / 2),
  top: screen.availTop + Math.round((screen.availHeight - 500) / 2)
}).then(prefs => {
  if (prefs.mode === 'tab') {
    webext.tabs.single({
      url: '/data/editor/index.html'
    });
  }
  else if (prefs.mode === 'application-content') {
    chrome.windows.get(tab.windowId, win => {
      chrome.windows.update(tab.windowId, {
        top: screen.availTop,
        height: screen.height - prefs['content-height']
      });
      webext.windows.single({
        url: 'data/editor/index.html',
        width: win.width,
        height: prefs['content-height'],
        left: win.left,
        top: screen.availTop + screen.height - 300,
        type: 'popup'
      });
    });
  }
  else {
    webext.windows.single({
      url: 'data/editor/index.html',
      width: prefs.width,
      height: prefs.height,
      left: prefs.left,
      top: prefs.top,
      type: 'popup'
    });
  }
}));

// context-menu creation
var menu = () => {
  webext.storage.get({
    mode: 'tab',
    headers: [{
      name: 'My first note',
      id: 'note--1',
    }]
  }).then(({headers, mode}) => {
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
      contexts: ['browser_action'],
      type: 'radio',
      checked: mode === 'tab'
    }, {
      id: 'browser-mode-window',
      title: 'Mode: Window',
      contexts: ['browser_action'],
      type: 'radio',
      checked: mode === 'window'
    }, {
      id: 'browser-mode-application-content',
      title: 'Mode: Application Content',
      contexts: ['browser_action'],
      type: 'radio',
      checked: mode === 'application-content'
    });
    webext.contextMenus.removeAll().then(() => webext.contextMenus.batch(items));
  });
};
webext.runtime.on('start-up', menu);
webext.storage.on('changed', menu).if(p => p.headers);
webext.contextMenus.on('clicked', ({menuItemId}) => webext.storage.set({
  mode: menuItemId.replace('browser-mode-', '')
}));

// FAQs and Feedback
webext.runtime.on('start-up', () => {
  const {name, version, homepage_url} = webext.runtime.getManifest();
  const page = homepage_url; // eslint-disable-line camelcase
  // FAQs
  webext.storage.get({
    'version': null,
    'faqs': navigator.userAgent.indexOf('Firefox') === -1,
    'last-update': 0,
  }).then(prefs => {
    if (prefs.version ? (prefs.faqs && prefs.version !== version) : true) {
      const now = Date.now();
      const doUpdate = (now - prefs['last-update']) / 1000 / 60 / 60 / 24 > 30;
      webext.storage.set({
        version,
        'last-update': doUpdate ? Date.now() : prefs['last-update']
      }).then(() => {
        // do not display the FAQs page if last-update occurred less than 30 days ago.
        if (doUpdate) {
          const p = Boolean(prefs.version);
          webext.tabs.create({
            url: page + '?version=' + version +
              '&type=' + (p ? ('upgrade&p=' + prefs.version) : 'install'),
            active: p === false
          });
        }
      });
    }
  });
  // Feedback
  webext.runtime.setUninstallURL(
    page + '?rd=feedback&name=' + name + '&version=' + version
  );
});
