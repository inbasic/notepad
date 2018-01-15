/* globals tinymce, EventEmitter, webext, sidebar, api */
'use strict';

var editor = new EventEmitter();

tinymce.init({
  selector:'textarea',
  branding: false,
  menubar: 'edit insert view format',
  paste_data_images: false,
  plugins: [
    'charmap searchreplace insertdatetime table'
  ]
});
tinymce.on('AddEditor', e => {
  editor.instance = e.editor;
  e.editor.on('Init', e => {
    webext.storage.get({
      selected: 'note--1',
    }).then(({selected}) => {
      editor.update.content(selected);
      editor.update.title(selected);
      editor.emit('init', e);
      editor.instance.focus();
      editor.instance.on('Change', debounce(e => editor.emit('change', e), 1000));
      editor.instance.on('NodeChange', debounce(e => editor.emit('selection', e), 1000));
    });
  });
  e.editor.on('Click', e => editor.emit('click', e));
  e.editor.on('Dirty', e => editor.emit('dirty', e));
});

editor.write = (
  id = editor.id,
  content = editor.instance.getContent(),
  bookmark = editor.instance.selection.getBookmark(2, true)
) => webext.runtime.sendMessage({
  method: 'save-note',
  id,
  content: content,
  bookmark
});
editor.on('change', () => editor.id && editor.write());
editor.on('selection', () => {
  const id = editor.id;
  const bookmark = editor.instance.selection.getBookmark(2, true);
  if (bookmark && id) {
    webext.runtime.sendMessage({
      method: 'save-bookmark',
      id,
      bookmark
    });
  }
});

editor.update = {};
editor.update.content = id => webext.storage.get({
  [id + '-content']: '',
  [id + '-bookmark']: null,
}).then(prefs => {
  const instance = editor.instance;
  if (editor.id && instance.isDirty()) {
    editor.write();
  }

  instance.setContent(prefs[id + '-content']);
  if (prefs[id + '-bookmark']) {
    instance.selection.moveToBookmark(prefs[id + '-bookmark']);
  }
  editor.id = id;
  instance.setDirty(false);
});
editor.update.title = id => api.note.get(id).then(notes => {
  editor.emit('updating', id);
  document.title = notes.map(n => n.name).join('/');
});

// unbeforeunload
window.addEventListener('beforeunload', () => {
  if (editor.id && editor.instance.isDirty()) {
    editor.write();
  }
});

document.addEventListener('DOMContentLoaded', () => {
  // when a new note is selected
  sidebar.on('selected', id => {
    editor.update.content(id);
    editor.update.title(id);
  }).if(id => id.startsWith('note-') && id !== editor.id);
  // when note's name is selected
  sidebar.on('name-changed', editor.update.title).if(id => editor.id === id);
});
