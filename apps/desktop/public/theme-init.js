// Applies the saved theme before the app renders, so there is no flash.
// Loaded with <script src> from index.html (not inline: the CSP will drop
// 'unsafe-inline'). Plain ES5-ish JS, no modules, runs once.
//
// Storage:
//   facta_theme_choice  the theme the user picked: default | midnight | ember | light.
//                       Written only when the user picks one (lib/theme.ts).
//   facta_theme         the old key. The old app wrote it on every launch,
//                       "light" when nothing was chosen, so "light" there is
//                       not a real choice. On first run it is migrated once:
//                       "midnight" and "ember" carry over, anything else
//                       becomes the default. The old key is then removed.
(function () {
  var THEMES = ["default", "midnight", "ember", "light"];

  function isTheme(v) {
    return THEMES.indexOf(v) !== -1;
  }

  function resolve(storage) {
    var choice = null;
    var legacy = null;
    try {
      choice = storage.getItem("facta_theme_choice");
      legacy = storage.getItem("facta_theme");
    } catch (e) {
      return "default";
    }
    if (isTheme(choice)) return choice;
    if (legacy !== null) {
      try {
        if (legacy === "midnight" || legacy === "ember") storage.setItem("facta_theme_choice", legacy);
        storage.removeItem("facta_theme");
      } catch (e) {
        // Storage blocked: just use the value for this session.
      }
      if (legacy === "midnight" || legacy === "ember") return legacy;
    }
    return "default";
  }

  var storage = null;
  try {
    storage = window.localStorage;
  } catch (e) {
    storage = null;
  }
  var theme = storage ? resolve(storage) : "default";
  var root = document.documentElement;
  root.setAttribute("data-theme", theme);
  // Paint the right background before the stylesheet has loaded, so the
  // window doesn't flash white. Same values as --bg in src/index.css.
  var BG = { "default": "#060706", midnight: "#04070E", ember: "#060504", light: "#F6F6F3" };
  root.style.backgroundColor = BG[theme];
  root.style.colorScheme = theme === "light" ? "light" : "dark";
})();
