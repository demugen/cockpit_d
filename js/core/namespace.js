/* Global namespace and the deferred widget definition list.
   No ES modules: the add-on runs from file:// inside an Android WebView. */

(function (window) {
  'use strict';

  var App = window.App || {};
  App.version = '2.0.0';
  App.core = App.core || {};
  App.services = App.services || {};
  App.widgets = App.widgets || {};
  App.ui = App.ui || {};
  App.widgetDefs = App.widgetDefs || [];
  window.App = App;
})(window);
