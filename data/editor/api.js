/* globals webext, editor */
'use strict';

/*
Events: note-selected

*/
var api = {};

// api.note.get()
// api.note.add()
// api.api.notebook.add()

api.port = webext.runtime.connect({
  name: 'editor'
});
api.port.onMessage.addListener(request => {
  if (request.method === 'append-content') {
    editor.instance.insertContent(request.content);
  }
});
document.addEventListener('DOMContentLoaded', () => {
  editor.on('updating', id => api.port.postMessage({
    method: 'my-id',
    id
  }));
});
