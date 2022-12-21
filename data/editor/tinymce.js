/* global tinymce, EventEmitter, sidebar, api */
'use strict';

const editor = new EventEmitter();

function debounce(func, wait) {
  let time = 0;
  const context = this;

  return function() {
    const now = Date.now();
    if (now - time > wait) {
      func.apply(context, arguments);
      time = now;
    }
  };
}

tinymce.init({
  selector: 'textarea',
  branding: false,
  menu: {
    notepad: {title: 'Notepad', items: 'options | save'},
    edit: {title: 'Edit', items: 'undo redo | cut copy paste pastetext | selectall | searchreplace'},
    insert: {title: 'Insert', items: 'insertdatetime | charmap | inserttable tableprops deletetable cell row column'},
    view: {title: 'View', items: 'visualaid'},
    format: {title: 'Format', items: 'bold italic underline strikethrough superscript subscript code | formats | removeformat'}
  },
  paste_data_images: false,
  toolbar: 'undo redo | styleselect | bold italic | ' +
    'forecolor backcolor | ' +
    'alignleft aligncenter alignright alignjustify | ' +
    'bullist numlist outdent indent | link image',
  plugins: [
    'charmap searchreplace insertdatetime table lists advlist',
    'textcolor colorpicker code save'
  ],
  setup(editor) {
    // shortcuts
    editor.shortcuts.add('access+s', 'Toggle sidebar', () => sidebar.emit('toggle'));
    // menu
    editor.addMenuItem('options', {
      text: 'Options',
      onclick: () => chrome.runtime.openOptionsPage()
    });
    editor.addMenuItem('save', {
      text: 'Save',
      cmd: 'mceSave',
      disabled: true,
      onPostRender: function() {
        const self = this;
        editor.on('nodeChange', function() {
          self.disabled(editor.getParam('save_enablewhendirty', true) && !editor.isDirty());
        });
      }
    });
  },
  save_onsavecallback() {
    editor.write();
  }
});
tinymce.on('AddEditor', e => {
  editor.instance = e.editor;

  e.editor.on('Init', e => {
    chrome.storage.local.get({
      'selected-note': 'note--1'
    }, prefs => {
      const id = prefs['selected-note'];
      editor.update.content(id);
      editor.update.title(id);
      editor.emit('init', e);
      editor.instance.focus();
      editor.instance.on('Change', debounce(e => editor.emit('change', e), 1000));
      editor.instance.on('NodeChange', debounce(e => editor.emit('selection', e), 1000));

      const style = localStorage.getItem('editor-css');
      if (style) {
        editor.instance.getBody().style = style;
      }
    });
  });
  e.editor.on('Click', e => editor.emit('click', e));
  e.editor.on('Dirty', e => editor.emit('dirty', e));
});

editor.write = (
  id = editor.id,
  content = editor.instance.getContent(),
  bookmark = editor.instance.selection.getBookmark(2, true)
) => new Promise(resolve => chrome.runtime.sendMessage({
  method: 'save-note',
  id,
  content: content,
  bookmark
}, resolve));
// editor.on('change', () => editor.id && editor.write());
editor.on('selection', () => {
  const id = editor.id;
  const bookmark = editor.instance.selection.getBookmark(2, true);
  if (bookmark && id) {
    chrome.runtime.sendMessage({
      method: 'save-bookmark',
      id,
      bookmark
    });
  }
});

editor.update = {};
editor.update.content = id => chrome.storage.local.get({
  [id + '-content']: '',
  [id + '-bookmark']: null
}, prefs => {
  const instance = editor.instance;
  if (editor.id && instance.isDirty()) {
    editor.instance.execCommand('mceSave');
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
  const note = notes.pop();
  editor.id = note.id; // if not is untracked, removes the id
  document.title = '[' + note.name + '] - /' + notes.map(n => n.name).join('/');
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
    chrome.storage.local.set({
      'selected-note': id
    });
  }).if(id => id.startsWith('note-') && id !== editor.id);
  // when note's name is selected
  sidebar.on('name-changed', note => editor.update.title(note.id)).if(note => editor.id === note.id);
});
