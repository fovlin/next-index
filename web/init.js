var theme = localStorage.getItem("next-index-theme");
if (theme === "light" || theme === "dark") {
    document.documentElement.dataset.theme = theme;
};