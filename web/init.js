var stored = localStorage.getItem("next-index-theme");
var dark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;

if (stored === "light" || stored === "dark") {
	if (stored !== (dark ? "dark" : "light")) {
		document.documentElement.dataset.theme = stored;
	}
}
