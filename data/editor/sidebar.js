/* globals VanillaTree, editor, webext, EventEmitter, api, mscConfirm */
'use strict';

var sidebar = new EventEmitter();

// open and close
{
  const element = document.getElementById('sidebar');
  // open
  document.getElementById('sidebar-button').addEventListener('click', () => {
    element.dataset.open = true;
    sidebar.emit('open', true);
  });
  // close
  document.addEventListener('DOMContentLoaded', () => {
    editor.on('click', () => {
      if (element.dataset.open === 'true') {
        element.dataset.open = false;
        sidebar.emit('open', false);
      }
    });
  });
}
// content
const tree = new VanillaTree('#tree', {
  placeholder: 'Loading...',
});
sidebar.notes = () => webext.storage.get({
  selected: 'note--1',
  headers: [{
    name: 'First note',
    id: 'note--1',
    selected: true
  }]
}).then(({headers, selected}) => headers.map(h => {
  h.selected = h.id === selected;
  return h;
}));

sidebar.cache = {};

sidebar.once('open', () => sidebar.notes().then(headers => {
  headers.forEach(header => {
    sidebar.cache[header.id] = header;
    tree.add({
      label: header.name,
      id: header.id,
      selected: header.selected,
      parent: header.parent
    });
  });
  let parent = sidebar.selected;
  while (parent) {
    tree.open(parent.id);
    parent = sidebar.cache[parent.parent];
  }
})).if(v => v);

// events
tree.tree.addEventListener('vtree-select', ({detail}) => {
  sidebar.selected = sidebar.cache[detail.id];
  sidebar.emit('selected', detail.id);
  webext.storage.set({
    selected: detail.id
  });
});

// add a new note
sidebar.parent = n => {
  if (n.id.startsWith('notebook-')) {
    return n.id;
  }
  return n.parent;
};

sidebar.add = {
  note: (name = 'new note') => sidebar.notes().then(headers => {
    const note = {
      name,
      id: 'note-' + Math.random(),
      selected: true
    };
    const pid = sidebar.selected ? sidebar.parent(sidebar.selected) : null;

    if (pid) {
      note.parent = pid;
      tree.open(note.parent);
    }

    headers.push(note);
    sidebar.cache[note.id] = note;
    webext.storage.set({headers}).then(() => tree.add(Object.assign({
      label: name
    }, note)));

    return note;
  }),
  notebook: (name = 'new notebook') => sidebar.notes().then(headers => {
    const parent = sidebar.parent(sidebar.selected);
    const notebook = {
      name,
      id: 'notebook-' + Math.random(),
      parent,
      selected: true,
      opened: true
    };
    headers.push(notebook);
    sidebar.cache[notebook.id] = notebook;
    tree.add(Object.assign({
      label: name
    }, notebook));
    webext.storage.set({headers}).then(() => sidebar.add.note());

    return notebook;
  })
};
sidebar.delete = {};
sidebar.delete.note = (id = sidebar.selected.id, del = true) => {
  const perform = () => {
    sidebar.notes().then(headers => {
      delete sidebar.cache[id];
      if (del) {
        webext.storage.set({
          headers: headers.filter(h => h.id !== id)
        });
      }
      webext.runtime.sendMessage({
        method: 'delete-note',
        id
      });
      if (del) {
        tree.remove(id);
      }
      if (id === sidebar.selected.id) {
        editor.id = null;
        editor.update.title(null);
      }
    });
  };
  if (del) {
    mscConfirm('Delete', `Are you sure you want to delete "${sidebar.cache[id].name}"? This action is irreversible.`, perform);
  }
  else {
    perform();
  }
};
sidebar.delete.notebook = (id = sidebar.selected.id) => {
  mscConfirm('Delete', `Are you sure you want ot delete "${sidebar.cache[id].name}" and all its child notes? This action is irreversible."`, () => {
    const ids = [...tree.getChildList(id).querySelectorAll('[data-vtree-id]')].map(e => e.dataset.vtreeId);
    const notebooks = [id, ...ids.filter(i => i.startsWith('notebook-'))];
    const notes = ids.filter(i => i.startsWith('note-'));

    sidebar.notes().then(headers => {
      webext.storage.set({
        headers: headers.filter(h => notebooks.indexOf(h.id) === -1 && notes.indexOf(h.id) === -1)
      });
    });
    notes.forEach(id => sidebar.delete.note(id, false));
    notebooks.forEach(id => delete sidebar.cache[id]);
    tree.remove(id);
    // current note is in the list
    if (ids.indexOf(editor.id) !== -1) {
      editor.id = null;
      editor.update.title(null);
      sidebar.selected = null;
    }
    else {
      tree.select(editor.id);
    }
  });
};

api.note = {};
api.note.add = sidebar.add.note;
api.note.delete = sidebar.delete.note;
api.notebook = {};
api.notebook.add = sidebar.add.notebook;

// details
{
  const name = document.querySelector('#sidebar [data-id=details] [data-id=name]');
  sidebar.on('selected', id => {
    name.value = sidebar.cache[id].name;
  });
  document.querySelector('#sidebar [data-id=details]').addEventListener('submit', e => {
    e.preventDefault();
    const label = name.value || 'no name';
    document.querySelector('#tree .vtree-selected a').textContent = label;
    const id = sidebar.selected.id;
    sidebar.notes().then(headers => {
      let index = -1;
      for (let i = 0; i < headers.length; i += 1) {
        if (headers[i].id === id) {
          index = i;
        }
      }
      headers[index].name = label;
      sidebar.selected.name = label;
      sidebar.cache[id].name = label;
      webext.storage.set({headers});
      sidebar.emit('name-changed', id, label);
    });
  });
}

// commands
document.querySelector('#sidebar [data-id=toolbox]').addEventListener('click', ({target}) => {
  const cmd = target.dataset.cmd;
  if (cmd === 'new-note') {
    sidebar.add.note();
  }
  else if (cmd === 'new-notebook') {
    sidebar.add.notebook();
  }
  else if (cmd === 'delete') {
    if (sidebar.selected.id.startsWith('note-')) {
      sidebar.delete.note();
    }
    else {
      sidebar.delete.notebook();
    }
  }
});

// api
api.note.get = id => id ? sidebar.notes().then(headers => {
  let parent = headers.filter(h => h.id === id).shift();
  const list = [];
  while (parent) {
    list.unshift(parent);
    parent = sidebar.cache[parent.parent];
  }
  return list;
}) : Promise.resolve([{
  name: '* untracked note',
  id
}]);
