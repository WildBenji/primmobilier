/* shell.js — bascule de thème (clair par défaut, D13) + bandeau auto-masquant,
   partagés par les maquettes Atlas / Observatoire / Export.

   Convention de thème unifiée : aucun attribut = clair, data-theme="dark" =
   sombre (signature néon). Émet un événement "themechange" sur window à chaque
   bascule, pour que les pages à graphiques (D3) se redessinent aux bonnes
   couleurs sans dupliquer la logique de thème. */
(function () {
  var root = document.documentElement;
  if (new URLSearchParams(location.search).get("theme") === "dark") root.setAttribute("data-theme", "dark");

  var tt = document.getElementById("themeToggle");
  if (tt) tt.addEventListener("click", function () {
    if (root.getAttribute("data-theme") === "dark") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", "dark");
    window.dispatchEvent(new Event("themechange"));
  });

  // Bandeau auto-masquant, seulement s'il y en a un (Atlas, Observatoire).
  var shell = document.querySelector(".shell");
  if (shell) {
    var setShell = function (open) {
      shell.classList.toggle("show", open);
      root.style.setProperty("--shell-h", open ? "56px" : "0px");
    };
    document.addEventListener("pointermove", function (e) {
      if (e.clientY <= 6) setShell(true);
      else if (e.clientY > shell.offsetHeight + 10 && !shell.matches(":hover")) setShell(false);
    });
    setShell(true);
    setTimeout(function () { setShell(false); }, 1900);
  }
})();
