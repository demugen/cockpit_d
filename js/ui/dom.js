/* Small DOM helpers. Text always goes through textContent. */

(function (App) {
  'use strict';

  function create(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
    return node;
  }

  function text(node, value) {
    node.textContent = value === undefined || value === null ? '' : String(value);
    return node;
  }

  function icon(name, size, className) {
    var node = App.ui.icons.create(name, size);
    if (className) node.classList.add(className);
    return node;
  }

  function button(className, label, iconName) {
    var node = create('button', className || 'btn');
    node.type = 'button';
    if (iconName) node.appendChild(icon(iconName, 20));
    if (label) node.appendChild(create('span', 'btn-label', label));
    return node;
  }

  function setPressed(node, pressed) {
    node.setAttribute('aria-pressed', pressed ? 'true' : 'false');
    node.classList.toggle('is-on', !!pressed);
  }

  function on(node, type, handler, options) {
    node.addEventListener(type, handler, options);
    return function off() {
      node.removeEventListener(type, handler, options);
    };
  }

  function delegate(root, selector, type, handler) {
    return on(root, type, function (event) {
      var target = event.target.closest ? event.target.closest(selector) : null;
      if (target && root.contains(target)) handler(event, target);
    });
  }

  function setImage(node, source) {
    if (!source) {
      node.hidden = true;
      node.removeAttribute('src');
      return;
    }
    node.hidden = false;
    if (node.getAttribute('src') !== source) node.src = source;
  }

  App.ui.dom = {
    create: create,
    clear: clear,
    text: text,
    icon: icon,
    button: button,
    setPressed: setPressed,
    on: on,
    delegate: delegate,
    setImage: setImage
  };
})(window.App);
