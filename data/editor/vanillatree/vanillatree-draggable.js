/* globals sidebar, tree, api */
'use strict';

// make all a elements draggable
sidebar.root.addEventListener('vtree-add', e => {
  const source = e.target.querySelector('a');
  source.draggable = true;
});

sidebar.once('open', () => {
  const img = document.createElement('img');
  img.src = 'vanillatree/target.png';
  let source;
  sidebar.root.addEventListener('dragstart', e => {
    e.dataTransfer.setData('text', e.target.closest('li').dataset.vtreeId);
    e.dataTransfer.setDragImage(img, 0, 0);
    e.target.source = true;
    source = e.target;
  });
  // clean-up
  sidebar.root.addEventListener('dragend', () => source && delete source.source);
  // allow drop
  sidebar.root.addEventListener('dragover', e => {
    const target = e.target;
    if (target.draggable === true && target.source !== true) {
      e.preventDefault();
    }
  });
  // add a new class on drag enter
  sidebar.root.addEventListener('dragenter', e => {
    const target = e.target;

    if (target.draggable === true && target.source !== true) {
      target.classList.add('dragged');
    }
  });
  // remove the class on drag leave
  sidebar.root.addEventListener('dragleave', e => {
    const target = e.target;

    if (target.draggable === true) {
      target.classList.remove('dragged');
      e.stopPropagation();
    }
  });
  // change the header on drop and dispatch an event
  sidebar.root.addEventListener('drop', e => {
    const sid = e.dataTransfer.getData('text');
    // clean up
    e.target.classList.remove('dragged');
    delete tree.getLeaf(sid).querySelector('a').source;

    let did = e.target.closest('li').dataset.vtreeId;
    did = sidebar.parent(sidebar.cache[did]);

    const note = sidebar.cache[sid];
    note.parent = did;
    try {
      tree.move(sid, did);
      sidebar.save(note).then(() => sidebar.emit('position-changed', sidebar.cache[sid]));
    }
    catch (e) {
      api.user.alert('Operation not permitted', e.message);
    }
  });
});
