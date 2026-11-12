/* Runs in <head>, before the page paints, so a saved light/dark choice never flashes the wrong theme.
   With no saved choice the stylesheet follows the system setting. */
(function () {
  try {
    var s = JSON.parse(localStorage.getItem('tabcreator.settings') || '{}');
    if (s.theme === 'light' || s.theme === 'dark') document.documentElement.dataset.theme = s.theme;
  } catch (e) { /* storage unavailable: follow the system */ }
})();
