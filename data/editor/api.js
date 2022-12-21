/* global editor */
'use strict';

/*
Events: note-selected

*/
const api = {};

// api.note.get()
// api.note.add()
// api.api.notebook.add()

chrome.runtime.onMessage.addListener((request, sender, response) => {
  if (request.method === 'append-content') {
    response(true);

    editor.instance.insertContent(request.content);
  }
  else if (request.method === 'close') {
    window.close();
  }
});

// confirm
api.user = {
  confirm: (title, description) => new Promise(resolve => window.mscConfirm(title, description, resolve)),
  alert: (title, description) => window.mscAlert(title, description)
};

chrome.runtime.onMessage.addListener((request, sender, response) => {
  if (request.method === 'exists') {
    response(true);
    chrome.runtime.sendMessage({
      method: 'bring-to-front'
    });
  }
});
