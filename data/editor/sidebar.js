/* globals VanillaTree, editor, webext, EventEmitter, api */
'use strict';

var sidebar = new EventEmitter();
sidebar.selected = {};

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
var tree = new VanillaTree('#tree', {
  placeholder: 'to prevent losing your content, create a new note right now.',
});
sidebar.root = tree.tree;

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

sidebar.save = (...changes) => sidebar.notes().then(headers => {
  // update existing headers
  headers = headers.map(h => {
    const e = changes.filter(e => e.id === h.id).shift();
    if (e) {
      sidebar.cache[e.id] = e;
    }
    return e || h;
  });
  // add new headers
  changes.filter(h => !sidebar.cache[h.id]).forEach(h => {
    sidebar.cache[h.id] = h;
    headers.push(h);
  });

  return webext.storage.set({
    headers
  });
});

sidebar.cache = {};

sidebar.once('open', () => sidebar.notes().then(headers => {
  const max = headers.length * 3;
  let i = 0;
  const one = () => {
    i += 1;
    const header = headers.shift();
    if (header) {
      if (i > max) {  // if parent is not detected, add to root
        delete header.parent;
      }
      if (header.parent && !sidebar.cache[header.parent]) {
        headers.push(header);
      }
      else {
        sidebar.cache[header.id] = header;
        tree.add({
          label: header.name,
          id: header.id,
          selected: header.selected,
          parent: header.parent
        });
      }
      one();
    }
  };
  one();
  // open selected note;
  let parent = sidebar.selected;
  while (parent && parent.id) {
    tree.open(parent.id);
    parent = sidebar.cache[parent.parent];
  }
})).if(status => status === true);

// events
sidebar.root.addEventListener('vtree-select', ({detail}) => {
  sidebar.selected = sidebar.cache[detail.id] || {};
  sidebar.emit('selected', detail.id);
  webext.storage.set({
    selected: detail.id
  });
});

// get closest notebook
sidebar.parent = n => n.id ? (n.id.startsWith('notebook-') ? n.id : n.parent) : null;
// add a new note
sidebar.add = {
  note: (name, content = false) => {
    name = name || 'new note';
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

    sidebar.save(note).then(() => {
      const next = () => tree.add(Object.assign({
        label: name
      }, note));
      if (content) {
        editor.write(note.id).then(next);
      }
      else {
        next();
      }
    });

    return note;
  },
  notebook: (name, content = false) => {
    name = name || 'new notebook';
    const parent = sidebar.parent(sidebar.selected);
    const notebook = {
      name,
      id: 'notebook-' + Math.random(),
      parent,
      selected: true,
      opened: true
    };

    sidebar.save(notebook).then(() => {
      tree.add(Object.assign({
        label: name
      }, notebook));
      sidebar.add.note(null, content);
    });

    return notebook;
  }
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
        sidebar.selected = {};
      }
      sidebar.emit('deleted', [id]);
    });
  };
  if (del) {
    api.user.confirm(
      'Delete',
      `Are you sure you want to delete "${sidebar.cache[id].name}"? This action is irreversible.`
    ).then(perform);
  }
  else {
    perform();
  }
};
sidebar.delete.notebook = (id = sidebar.selected.id) => {
  api.user.confirm(
    'Delete',
    `Are you sure you want ot delete "${sidebar.cache[id].name}" and all its child notes? This action is irreversible.`
  ).then(() => {
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
      sidebar.selected = {};
    }
    if (id === sidebar.selected.id) {
      sidebar.selected = {};
    }
    if (editor.id) {
      tree.select(editor.id);
    }
    sidebar.emit('deleted', ids);
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
  const del = document.querySelector('#sidebar [data-cmd="delete"]');
  const save = document.querySelector('#sidebar [type="submit"]');
  sidebar.on('selected', id => {
    name.value = sidebar.cache[id].name;
    name.select();
    name.focus();
    del.disabled = save.disabled = false;
  });
  document.querySelector('#sidebar [data-id=details]').addEventListener('submit', e => {
    e.preventDefault();
    const label = name.value || 'no name';
    document.querySelector('#tree .vtree-selected a').textContent = label;
    sidebar.selected.name = label;

    sidebar.save(sidebar.selected).then(() => sidebar.emit('name-changed', sidebar.selected));
  });

  sidebar.on('deleted', () => {
    del.disabled = save.disabled = sidebar.root.querySelector('.vtree-selected') === null;
  });
}

// commands
document.querySelector('#sidebar [data-id=toolbox]').addEventListener('click', ({target}) => {
  const cmd = target.dataset.cmd;
  if (cmd === 'new-note') {
    sidebar.add.note(null, editor.id ? null : true);
  }
  else if (cmd === 'new-notebook') {
    sidebar.add.notebook(null, editor.id ? null : true);
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

// api (sidebar might not yet be loaded)
api.note.get = id => {
  const empty = Promise.resolve([{
    name: '* untracked note',
    id: null
  }]);

  if (id) {
    return sidebar.notes().then(headers => {
      let parent = headers.filter(h => h.id === id).shift();
      if (parent) {
        const cache = headers.reduce((p, c) => {
          p[c.id] = c;
          return p;
        }, {});
        const list = [];
        while (parent) {
          list.unshift(parent);
          parent = cache[parent.parent];
        }
        return list;
      }
      return empty;
    });
  }
  else {
    return empty;
  }
};
