// Thème double (sombre par défaut) : bascule, persistance, et accord de la carte.
// Le DOM est piloté par data-theme sur <html> ; les couches MapLibre dont les
// couleurs ne passent pas d'un fond à l'autre sont repeintes ici.

const STORAGE_KEY = "primmobilier-theme";

// Couleurs d'overlay accordées au fond : violet clair sur Dark Matter, violet
// d'origine sur Positron. La zone (target-radius-*) n'est PAS pilotée ici : elle
// suit le FOND DE CARTE affiché, pas le thème — cf. applyZoneColor dans app.js.
const MAP_PAINT = {
  dark: {
    "cadastre-lines": { "line-color": "#a78bfa" }
  },
  light: {
    "cadastre-lines": { "line-color": "#7048e8" }
  }
};

// Fond de carte basculé automatiquement avec le thème — uniquement entre les
// deux fonds CARTO neutres, pour ne pas écraser un choix manuel (IGN, satellite…).
const AUTO_BASE = { dark: "cartodark", light: "carto" };

export function initTheme(map) {
  const toggle = document.querySelector("#themeToggle");
  let theme = localStorage.getItem(STORAGE_KEY) === "light" ? "light" : "dark";

  const whenMapReady = (fn) => {
    if (map.isStyleLoaded()) fn();
    else map.once("load", fn);
  };

  const apply = () => {
    document.documentElement.dataset.theme = theme;
    whenMapReady(() => {
      for (const [layer, props] of Object.entries(MAP_PAINT[theme])) {
        for (const [key, value] of Object.entries(props)) {
          if (map.getLayer(layer)) map.setPaintProperty(layer, key, value);
        }
      }
      swapAutoBase();
    });
    document.dispatchEvent(new CustomEvent("themechange", { detail: theme }));
  };

  // Si le fond visible est l'un des deux fonds "auto", on le fait suivre le thème.
  // On clique le bouton du menu pour réutiliser la logique d'app.js (label, état actif).
  const swapAutoBase = () => {
    const wanted = AUTO_BASE[theme];
    const other = AUTO_BASE[theme === "dark" ? "light" : "dark"];
    const visible = map.getLayoutProperty(`base-${other}`, "visibility") !== "none";
    if (!visible) return;
    const button = document.querySelector(`[data-layer="${wanted}"]`);
    if (!button) return;
    button.click();
    // Le clic pose "just-picked" (anti-réouverture après un choix manuel à la souris).
    // Ici le clic est programmatique : laissé en place, il bloquerait la PREMIÈRE
    // ouverture du menu au survol — on le retire aussitôt.
    button.closest(".layer-menu")?.classList.remove("just-picked");
  };

  toggle.addEventListener("click", () => {
    theme = theme === "dark" ? "light" : "dark";
    localStorage.setItem(STORAGE_KEY, theme);
    apply();
  });

  apply();
}
