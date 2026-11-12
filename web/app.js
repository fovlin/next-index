(function () {
	"use strict";

	function readState() {
		try {
			return JSON.parse(document.getElementById("next-index-bootstrap").textContent);
		} catch (error) {
			return null;
		}
	}

	var state = readState();

	var parameters = new URLSearchParams(window.location.search);

	var LOCALE = "en-US";

	if (state) {
		state.entries = Array.isArray(state.entries) ? state.entries : [];
		state.crumbs = Array.isArray(state.crumbs) ? state.crumbs : [];
		var storedTheme = localStorage.getItem("next-index-theme");
		state.theme = storedTheme === "light" || storedTheme === "dark" ? storedTheme : "";

		if (parameters.get("theme") === "light" || parameters.get("theme") === "dark") {
			state.theme = parameters.get("theme");
		}

		state.sort = readSort();
		state.uploads = [];
		state.uploading = false;
		state.selection = {};
		state.selecting = false;

		applyTheme();

		if (window.matchMedia) {
			window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", function () {
				syncTheme();
			});
		}

		window.addEventListener("storage", function (event) {
			if (event.key !== null && event.key !== "next-index-theme") {
				return;
			}

			state.theme = event.newValue === "light" || event.newValue === "dark" ? event.newValue : "";
			syncTheme();
		});
	}

	var FOLDER = '<path d="M5.5 4.75h4.3c.6 0 1.15.25 1.55.7l.9 1.05H18.5A2.5 2.5 0 0 1 21 9v7.75a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 16.75V7.25a2.5 2.5 0 0 1 2.5-2.5Z"/>';

	var ICONS = {
		parent: FOLDER + '<path d="M14.8 13H9.2" stroke-width="1.5"/><path d="m11.8 10.6-2.6 2.4 2.6 2.4" stroke-width="1.5"/>',
		layers: '<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5"/><path d="m3 16 9 5 9-5"/>',
		refresh: '<path d="M20 11a8 8 0 1 0-2.34 5.66"/><path d="M20 4v7h-7"/>',
		moon: '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5Z"/>',
		sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
		upload: '<path d="M12 16V4"/><path d="m7 9 5-5 5 5"/><path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>',
		download: '<path d="M12 4v12"/><path d="m7 11 5 5 5-5"/><path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>',
		folder: FOLDER,
		folderOpen: '<path d="M5.42 19.5 h11.9 a2 2 0 0 0 1.94 -1.5 l1.2 -5 A1.6 1.6 0 0 0 18.92 10.9 H7.92 a2 2 0 0 0 -1.94 1.5 L4.72 17.6 M5.42 19.5 a2 2 0 0 1 -2 -2 V6.1 a1.6 1.6 0 0 1 1.6 -1.6 h5.1 a2 2 0 0 1 1.6 .8 l1.2 1.6 h5.5 a1.6 1.6 0 0 1 1.6 1.6 v2.4"/>',
		folderPlus: FOLDER + '<path d="M12 10.4v5"/><path d="M9.5 12.9h5"/>',
		file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z"/><path d="M14 3v5h5"/>',
		image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="m21 15-4.5-4.5L7 20"/>',
		video: '<rect x="3" y="5" width="14" height="14" rx="2"/><path d="m17 10 4-2v8l-4-2"/>',
		audio: '<path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>',
		archive: '<path d="M4 7h16v13H4z"/><path d="M2 4h20v3H2z"/><path d="M10 11h4"/>',
		code: '<path d="m9 8-5 4 5 4"/><path d="m15 8 5 4-5 4"/>',
		doc: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z"/><path d="M9 13h6M9 17h4"/>',
		sheet: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M9 4v16M15 4v16"/>',
		slide: '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M12 17v3M8 20h8"/>',
		font: '<path d="m6 20 6-16 6 16"/><path d="M8.5 14h7"/>',
		disk: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2"/><path d="M12 3v3"/>',
		pencil: '<path d="M4 20h4L19 9a2.83 2.83 0 0 0-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/>',
		trash: '<path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13h10l1-13"/><path d="M10 11v5M14 11v5"/>',
		x: '<path d="m6 6 12 12M18 6 6 18"/>',
		chevronRight: '<path d="m9 6 6 6-6 6"/>',
		arrowUp: '<path d="M12 19V5M6 11l6-6 6 6"/>',
		check: '<path d="m5 13 4 4L19 7"/>',
		alert: '<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16.5v.5"/>',
		info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6"/><path d="M12 7.5v.5"/>',
		login: '<path d="M14 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-2"/><path d="M9 12h11"/><path d="m17 8 4 4-4 4"/>',
		logout: '<path d="M10 8V6a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-6a2 2 0 0 1-2-2v-2"/><path d="M15 12H4"/><path d="m7 8-4 4 4 4"/>',
		lock: '<rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
		home: '<path d="m3 11 9-8 9 8"/><path d="M5 10v10h14V10"/>',
		copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>',
		move: '<path d="M3 12h11"/><path d="m10 8 4 4-4 4"/><path d="M17 4h4v16h-4"/>',
		more: '<circle cx="5" cy="12" r="2.2" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="2.2" fill="currentColor" stroke="none"/>',
		eye: '<path d="M3 12a9 6.5 0 0 1 18 0 9 6.5 0 0 1-18 0Z"/><circle cx="12" cy="12" r="3"/>',
		select: '<rect x="3" y="3" width="18" height="18" rx="4"/><path d="m8 12 2.5 2.5L16 9"/>',
	};
	var GROUPS = {
		image: ["png", "jpg", "jpeg", "gif", "webp", "avif", "bmp", "ico", "svg", "tif", "tiff", "heic"],
		video: ["mp4", "webm", "mkv", "mov", "avi", "m4v", "ogv", "flv", "wmv"],
		audio: ["mp3", "wav", "flac", "ogg", "m4a", "aac", "opus", "wma", "mid"],
		archive: ["zip", "tar", "gz", "bz2", "xz", "7z", "rar", "zst", "tgz", "tbz2", "lz4"],
		code: ["js", "mjs", "cjs", "ts", "jsx", "tsx", "go", "py", "rb", "rs", "c", "h", "cc", "cpp", "hpp", "cs", "java", "kt", "swift", "php", "lua", "sh", "bash", "zsh", "fish", "ps1", "bat", "cmd", "sql", "toml", "yaml", "yml", "json", "jsonc", "xml", "html", "htm", "css", "scss", "sass", "less", "vue", "svelte", "proto", "graphql", "ini", "conf", "env", "dockerfile", "makefile"],
		pdf: ["pdf"],
		doc: ["md", "markdown", "txt", "text", "rst", "log", "doc", "docx", "odt", "rtf", "epub", "pages", "tex"],
		sheet: ["xls", "xlsx", "csv", "tsv", "ods", "numbers"],
		slide: ["ppt", "pptx", "odp", "key"],
		font: ["ttf", "otf", "woff", "woff2", "eot"],
		disk: ["iso", "img", "dmg", "vhd", "vhdx", "qcow2", "vmdk"]
	};
	var TYPE_ICONS = {
		parent: ["parent", "icon-dir"],
		dir: ["folder", "icon-dir"],
		image: ["image", "icon-image"],
		video: ["video", "icon-video"],
		audio: ["audio", "icon-audio"],
		archive: ["archive", "icon-archive"],
		code: ["code", "icon-code"],
		pdf: ["doc", "icon-pdf"],
		doc: ["doc", "icon-doc"],
		sheet: ["sheet", "icon-sheet"],
		slide: ["slide", "icon-slide"],
		font: ["font", "icon-font"],
		disk: ["disk", "icon-disk"],
		file: ["file", "icon-doc"]
	};
	var topbar = document.getElementById("topbar");
	var main = document.getElementById("main");
	var footer = document.getElementById("footer");
	var toastRoot = document.getElementById("toast-root");
	var modalRoot = document.getElementById("modal-root");
	var activeUploads = [];
	var uploadCancelled = false;
	var uploadRun = 0;
	main.innerHTML = '<div class="bar"><nav class="crumbs" id="crumbs" aria-label="Breadcrumb"></nav><div class="summary-actions" id="summary-actions"></div><div class="summary" id="summary"></div></div><div class="card" id="listing"></div>';
	var crumbsRoot = document.getElementById("crumbs");
	var barRoot = document.querySelector(".bar");
	var summaryRoot = document.getElementById("summary");
	var summaryActions = document.getElementById("summary-actions");
	var listing = document.getElementById("listing");
	function readSort() {
		try {
			var parsed = JSON.parse(localStorage.getItem("next-index-sort"));

			if (parsed && ["name", "size", "mod"].indexOf(parsed.key) !== -1 && (parsed.dir === 1 || parsed.dir === -1)) {
				return parsed;
			}
		} catch (error) {
			/* ignore */
		}

		return { key: "name", dir: 1 };
	}

	function systemTheme() {
		if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
			return "dark";
		}

		return "light";
	}

	function syncTheme() {
		applyTheme();
		renderTopbar();
	}
	function currentTheme() {
		return state.theme || systemTheme();
	}

	function applyTheme() {
		if (state.theme) {
			document.documentElement.dataset.theme = state.theme;
			return;
		}

		delete document.documentElement.dataset.theme;
	}
	function esc(value) {
		return String(value).replace(/[&<>"']/g, function (char) {
			return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char];
		});
	}
	function icon(name, className) {
		return '<svg class="' + (className || "") + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[name] || ICONS.file) + "</svg>";
	}
	function groupOf(entry) {
		if (entry.kind === "dir" || entry.kind === "parent") {
			return entry.kind;
		}

		var extension = (entry.ext || "").toLowerCase();

		for (var group in GROUPS) {
			if (GROUPS[group].indexOf(extension) !== -1) {
				return group;
			}
		}

		return "file";
	}
	function typeOf(entry) {
		var group = groupOf(entry);
		return TYPE_ICONS[group] || TYPE_ICONS.file;
	}
	function formatSize(bytes) {
		if (!bytes) {
			return "0 B";
		}

		var units = ["B", "KB", "MB", "GB", "TB", "PB"];
		var value = bytes;
		var index = 0;

		while (value >= 1024 && index < units.length - 1) {
			value /= 1024;
			index++;
		}

		return (index === 0 ? String(value) : value.toFixed(1)) + " " + units[index];
	}
	function formatDate(unix) {
		return new Date(unix * 1000).toLocaleDateString(LOCALE, {
			year: "numeric",
			month: "2-digit",
			day: "2-digit"
		});
	}
	function formatFull(unix) {
		return new Date(unix * 1000).toLocaleString(LOCALE, {
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
			hour: "2-digit",
			minute: "2-digit",
			second: "2-digit",
			hour12: false
		});
	}
	function visibleEntries() {
		var entries = state.entries.slice();

		entries.sort(function (left, right) {
			var leftDir = left.kind === "dir";
			var rightDir = right.kind === "dir";

			if (leftDir !== rightDir) {
				return leftDir ? -1 : 1;
			}

			var result = 0;

			if (state.sort.key === "name") {
				result = left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: "base" });
			} else if (state.sort.key === "size") {
				result = (left.size || 0) - (right.size || 0);
			} else {
				result = (left.mod || 0) - (right.mod || 0);
			}

			return result * state.sort.dir;
		});


		return entries;
	}
	function selected() {
		return Object.keys(state.selection).filter(function (name) {
			return state.selection[name];
		});
	}
	function plural(count, singular, many) {
		return count === 1 ? singular : many;
	}

	function openMenu(button) {
		var name = button.dataset.menu;
		var entry = state.entries.find(function (item) {
			return item.name === name;
		});

		if (!entry) {
			return;
		}

		if (!state.authenticated) {
			openDetails(entry);
			return;
		}

		closeMenu();

		var menu = document.createElement("div");

		menu.className = "menu";
		menu.id = "row-menu";
		menu.innerHTML =
			'<button type="button" data-action="details" data-name="' + esc(name) + '">' + icon("info") + "<span>Details</span></button>" +
			'<button type="button" data-action="download" data-name="' + esc(name) + '">' + icon("download") + "<span>Download</span></button>" +
			'<button type="button" data-action="rename" data-name="' + esc(name) + '">' + icon("pencil") + "<span>Rename</span></button>" +
			'<button type="button" data-action="move" data-name="' + esc(name) + '">' + icon("move") + "<span>Move</span></button>" +
			'<button type="button" data-action="copy" data-name="' + esc(name) + '">' + icon("copy") + "<span>Copy</span></button>" +
			'<button type="button" data-action="delete" data-name="' + esc(name) + '" class="danger">' + icon("trash") + "<span>Delete</span></button>";

		document.body.appendChild(menu);

		var rect = button.getBoundingClientRect();
		var scrollX = window.scrollX;
		var scrollY = window.scrollY;
		var minLeft = scrollX + 8;
		var minTop = scrollY + 8;
		var maxLeft = scrollX + window.innerWidth - menu.offsetWidth - 8;
		var maxTop = scrollY + window.innerHeight - menu.offsetHeight - 8;
		var left = Math.min(rect.left + scrollX, maxLeft);
		var top = rect.bottom + scrollY + 4;

		if (top > maxTop) {
			top = rect.top + scrollY - menu.offsetHeight - 4;
		}

		menu.style.left = Math.max(minLeft, Math.min(left, maxLeft)) + "px";
		menu.style.top = Math.max(minTop, Math.min(top, maxTop)) + "px";
	}
	function closeMenu() {
		var menu = document.getElementById("row-menu");

		if (menu) {
			menu.remove();
		}
	}
	function toast(type, message) {
		var element = document.createElement("div");
		element.className = "toast " + type;
		element.innerHTML = icon(type === "success" ? "check" : "alert") + "<span>" + esc(message) + "</span>";
		toastRoot.appendChild(element);

		setTimeout(function () {
			element.classList.add("leaving");
			setTimeout(function () {
				element.remove();
			}, 220);
		}, 3600);
	}
	function openModal(html, className) {
		closeModal();

		modalRoot.innerHTML =
			'<div class="overlay" data-overlay><div class="dialog ' + (className || "") + '" role="dialog" aria-modal="true">' + html + "</div></div>";

		document.body.classList.add("modal-open");

		modalRoot.querySelectorAll("[data-close]").forEach(function (element) {
			element.addEventListener("click", closeModal);
		});

		var focusTarget = modalRoot.querySelector("input:not([type=hidden]), textarea, button.btn-primary");

		if (focusTarget) {
			setTimeout(function () {
				focusTarget.focus();
			}, 30);
		}
	}
	function closeModal() {
		modalRoot.innerHTML = "";
		document.body.classList.remove("modal-open");
	}
	function formDialog(options) {
		openModal(
			'<form id="dialog-form" novalidate>' +
			'<div class="dialog-head"><h2>' + options.title + "</h2>" +
			'<button type="button" class="icon-btn sm" data-close aria-label="Close">' + icon("x") + "</button></div>" +
			'<p class="sub">' + options.sub + "</p>" +
			'<div class="field"><label for="dialog-input">' + options.label + "</label>" +
			'<input class="input" id="dialog-input" autocomplete="off" spellcheck="false" value="' + esc(options.value || "") + '" placeholder="' + esc(options.placeholder || "") + '"></div>' +
			'<div class="form-error" id="dialog-error"></div>' +
			'<div class="dialog-actions"><button type="button" class="btn" data-close>Cancel</button>' +
			'<button type="submit" class="btn btn-primary">' + options.submit + "</button></div>" +
			"</form>"
		);

		var form = document.getElementById("dialog-form");
		var input = document.getElementById("dialog-input");
		var errorElement = document.getElementById("dialog-error");

		input.focus();

		form.addEventListener("submit", function (event) {
			event.preventDefault();
			options.run(input.value.trim(), errorElement);
		});

		return input;
	}


	function api(path, options) {
		options = options || {};

		if (options.body) {
			options.headers = Object.assign({ "Content-Type": "application/json" }, options.headers || {});
		}

		return fetch(path, Object.assign({ credentials: "same-origin" }, options)).then(function (response) {
			return response
				.json()
				.catch(function () {
					return {};
				})
				.then(function (data) {
					if (!response.ok) {
						var error = new Error(data.error || "request failed (" + response.status + ")");
						error.status = response.status;
						throw error;
					}

					return data;
				});
		});
	}
	function refresh() {
		var button = document.getElementById("refresh-btn");
		var spinner = button ? button.querySelector("svg") : null;

		if (spinner) {
			spinner.classList.add("spin");
		}

		return api("/@next-index/api/list?path=" + encodeURIComponent(state.path))
			.then(function (result) {
				state.entries = Array.isArray(result.entries) ? result.entries : [];
				state.crumbs = Array.isArray(result.crumbs) ? result.crumbs : state.crumbs;

				var kept = {};

				state.entries.forEach(function (entry) {
					if (state.selection[entry.name]) {
						kept[entry.name] = true;
					}
				});

				state.selection = kept;

				renderBody();
				renderFooter();
				return result;
			})
			.catch(handleError)
			.finally(function () {
				if (spinner) {
					spinner.classList.remove("spin");
				}
			});
	}
	function handleError(error) {
		if (error.status === 401) {
			state.authenticated = false;
			state.username = "";

			if (state.loginRequired) {
				window.location.reload();
				return;
			}

			renderPage();
			openLogin();
			return;
		}

		toast("error", error.message || String(error));
	}
	function setFormError(element, message) {
		element.innerHTML = message ? "<p>" + esc(message) + "</p>" : "";
	}
	function send(url, body, message, errorElement) {
		setFormError(errorElement, "");

		api(url, { method: "POST", body: JSON.stringify(body) })
			.then(function (result) {
				closeModal();
				toast("success", typeof message === "function" ? message(result) : message);
				return refresh();
			})
			.catch(function (error) {
				if (error.status === 401) {
					handleError(error);
					return;
				}

				setFormError(errorElement, error.message);
			});
	}


	function selectMarkup(entry) {
		if (!state.selecting || entry.kind === "parent") {
			return "";
		}

		return '<input type="checkbox" data-select="' + esc(entry.name) + '"' + (state.selection[entry.name] ? " checked" : "") + ' aria-label="Select ' + esc(entry.name) + '">';
	}
	function renderCrumbs() {
		var crumbs = state.crumbs
			.map(function (crumb, index) {
				var isLast = index === state.crumbs.length - 1;
				var isRoot = index === 0;
				var inner = (isRoot ? icon("home") : "") + esc(crumb.name);

				if (isLast) {
					return '<span class="crumb current">' + inner + "</span>";
				}

				return '<a class="crumb" href="' + esc(crumb.href) + '">' + inner + "</a>";
			})
			.join('<span class="crumb-sep">' + icon("chevronRight") + "</span>");

		if (!crumbs) {
			crumbs = '<span class="crumb current">' + icon("home") + "root</span>";
		}

		crumbsRoot.innerHTML = crumbs;
	}
	function renderTopbar() {
		var authMarkup = state.authenticated
			? '<button class="btn" id="logout-btn" title="Sign out" aria-label="Sign out">' + icon("logout") + "<span>Sign out</span></button>"
			: '<button class="btn btn-primary" id="login-btn" title="Sign in" aria-label="Sign in">' + icon("login") + "<span>Sign in</span></button>";

		topbar.innerHTML =
			'<div class="topbar-inner">' +
			'<a class="brand" href="/" aria-label="Home">' +
			'<span class="brand-mark">' + icon("layers") + "</span>" +
			'<span class="brand-name">' + esc(state.site || "NEXT_INDEX") + "</span>" +
			'<span class="brand-version">v' + esc(state.version) + "</span>" +
			"</a>" +
			'<div class="topbar-actions">' +
			'<button class="icon-btn" id="refresh-btn" title="Refresh" aria-label="Refresh">' + icon("refresh") + "</button>" +
			'<button class="icon-btn" id="theme-btn" title="Toggle theme" aria-label="Toggle theme">' + (currentTheme() === "dark" ? icon("sun") : icon("moon")) + "</button>" +
			authMarkup +
			"</div>" +
			"</div>";

		document.getElementById("refresh-btn").addEventListener("click", refresh);
		document.getElementById("theme-btn").addEventListener("click", toggleTheme);

		var loginButton = document.getElementById("login-btn");
		if (loginButton) {
			loginButton.addEventListener("click", function () {
				openLogin();
			});
		}

		var logoutButton = document.getElementById("logout-btn");
		if (logoutButton) {
			logoutButton.addEventListener("click", function () {
				openModal(
					'<div class="dialog-head"><h2>Sign out?</h2>' +
					'<button type="button" class="icon-btn sm" data-close aria-label="Close">' + icon("x") + "</button></div>" +
					'<p class="sub">You can sign back in at any time.</p>' +
					'<div class="dialog-actions"><button type="button" class="btn" data-close>Cancel</button>' +
					'<button type="button" class="btn btn-primary" id="confirm-logout">Sign out</button></div>'
				);

				document.getElementById("confirm-logout").addEventListener("click", function () {
					closeModal();
					logout();
				});
			});
		}
	}
	function renderSummary() {
		barRoot.classList.toggle("selecting", state.selecting);

		var names = selected();

		var tools = state.authenticated
			? '<button class="icon-btn" data-action="download-folder" title="Download folder" aria-label="Download folder">' + icon("download") + "</button>" +
				'<button class="icon-btn" data-action="mkdir" title="New folder" aria-label="New folder">' + icon("folderPlus") + "</button>" +
				'<button class="icon-btn' + (state.selecting ? " active" : "") + '" data-action="toggle-selection" title="Select files" aria-label="Select files" aria-pressed="' + state.selecting + '">' + icon("select") + "</button>" +
				'<button class="icon-btn" data-action="upload" title="Upload files" aria-label="Upload files">' + icon("upload") + "</button>"
			: "";

		var batch = "";

		if (state.selecting) {
			batch = '<div class="batch">' +
				(names.length
					? '<button class="btn btn-sm" data-action="batch-copy">' + icon("copy") + "<span>Copy</span></button>" +
						'<button class="btn btn-sm" data-action="batch-move">' + icon("move") + "<span>Move</span></button>" +
						'<button class="btn btn-sm" data-action="batch-delete">' + icon("trash") + "<span>Delete</span></button>"
					: "<span>Select items</span>") +
				'<button class="icon-btn" data-action="toggle-selection" title="Done" aria-label="Done">' + icon("x") + "</button>" +
				"</div>";
		}

		summaryRoot.innerHTML = batch;
		summaryActions.innerHTML = tools;
	}
	function renderListing() {
		var entries = visibleEntries();

		listing.classList.toggle("selecting", state.selecting);

		if (state.entries.length === 0) {
			listing.innerHTML =
				'<div class="empty"><div class="empty-icon">' + icon("folderOpen") + "</div>" +
				"<h2>This folder is empty</h2>" +
				"<p>Nothing here yet. Upload a file to get started.</p>" +
				"<div>" +
				(state.path === "/" ? "" : '<button class="btn" data-action="back">' + icon("parent") + "<span>Back</span></button>") +
				(state.authenticated
					? '<button class="btn btn-primary" data-action="upload">' + icon("upload") + "<span>Upload files</span></button>"
					: '<button class="btn btn-primary" data-action="login">' + icon("login") + "<span>Sign in to upload</span></button>") +
				"</div></div>";
			return;
		}

		if (entries.length === 0) {
			listing.innerHTML =
				'<div class="empty"><div class="empty-icon">' + icon("folder") + "</div>" +
				"<h2>Empty folder</h2>" +
				"<p>Nothing has been uploaded here yet.</p>" +
				"</div>";
			return;
		}

		listing.innerHTML = tableMarkup(entries);

	}
	function tableMarkup(entries) {
		var sorted = state.sort;

		function header(key, label, className) {
			var isSorted = sorted.key === key;
			var classes = "col-" + className + (isSorted ? " sorted" : "") + (isSorted && sorted.dir < 0 ? " desc" : "");

			return (
				'<th class="' + classes + '">' +
				'<button class="sort-btn" data-sort="' + key + '">' + label + icon("arrowUp", "arrow") + "</button>" +
				"</th>"
			);
		}

		var lastPage = state.parent.name === "/" ? "" : rowMarkup(state.parent);
		var rows = lastPage + entries.map(rowMarkup).join("");

		return (
			"<table class=\"table\">" +
			"<thead><tr>" +
			(state.selecting ? '<th class="col-select">' + selectAllMarkup(entries) + "</th>" : "") +
			header("name", "Name", "name") +
			header("size", "Size", "size") +
			header("mod", "Modified", "time") +
			'<th class="col-actions"></th>' +
			"</tr></thead>" +
			"<tbody>" + rows + "</tbody>" +
			"</table>"
		);
	}
	function allSelected(entries) {
		return (
			entries.length > 0 &&
			entries.every(function (entry) {
				return state.selection[entry.name];
			})
		);
	}
	function selectAllMarkup(entries) {
		var checked = allSelected(entries);

		return '<input type="checkbox" id="select-all" aria-label="Select all"' + (checked ? " checked" : "") + ">";
	}
	function rowMarkup(entry) {
		var type = typeOf(entry);
		var size = entry.kind === "file" ? formatSize(entry.size) : "—";
		var link = state.selecting ? ["div", ""] : ["a", ' href="' + esc(entry.href) + '"'];

		return (
			'<tr' + (state.selection[entry.name] ? ' class="selected"' : "") + ' data-name="' + esc(entry.name) + '" data-href="' + esc(entry.href) + '">' +
			(state.selecting ? '<td class="col-select">' + selectMarkup(entry) + "</td>" : "") +
			"<td>" +
			'<' + link[0] + ' class="entry"' + link[1] + '>' +
			'<span class="entry-icon ' + type[1] + '">' + icon(type[0]) + "</span>" +
			'<span class="name-wrap"><span class="entry-name" title="' + esc(entry.name) + '">' + nameMarkup(entry) + "</span>" +
			(entry.link ? '<span class="badge">link</span>' : "") +
			"</span>" +
			"</" + link[0] + ">" +
			"</td>" +
			'<td class="col-size size" title="' + (entry.kind === "file" ? entry.size + " bytes" : "") + '">' + size + "</td>" +
			'<td class="col-time time">' + esc(formatDate(entry.mod)) + "</td>" +
			'<td class="col-actions">' + menuMarkup(entry) + "</td>" +
			"</tr>"
		);
	}
	function nameMarkup(entry) {
		return esc(entry.name);
	}
	function menuMarkup(entry) {
		if (state.selecting || entry.kind === "parent") {
			return "";
		}

		return '<button class="row-action" data-menu="' + esc(entry.name) + '" title="More" aria-label="More">' + icon("more") + "</button>";
	}
	function renderFooter() {
		var status = state.authenticated ? '<span class="status-dot" title="Signed in"></span>' : '<span class="status-dot locked" title="Not signed in"></span>';
		var location = state.authenticated ? "signed in as: " + esc(state.username) : "sign in to manage files";

		footer.innerHTML =
			'<div class="footer-side">' + status + '<span class="mono">' + location + "</span></div>";
	}

	function renderBody() {
		renderSummary();
		renderListing();
	}

	function renderPage() {
		renderTopbar();
		renderCrumbs();
		renderSummary();
		renderListing();
		renderFooter();
	}


	function toggleSelection() {
		state.selecting = !state.selecting;

		if (!state.selecting) {
			state.selection = {};
		}

		renderBody();
	}
	var shellActions = {
		back: function () {
			window.location.href = "../";
		},
		mkdir: function () {
			openMkdir();
		},
		upload: function () {
			openUpload();
		},
		login: function () {
			openLogin();
		},
		"download-folder": function () {
			var url = new URL(window.location.href);
			url.searchParams.set("download", "1");
			window.location.href = url.href;
		},
		"toggle-selection": toggleSelection,
		"batch-copy": function () {
			openTransfer("copy", selected());
		},
		"batch-move": function () {
			openTransfer("move", selected());
		},
		"batch-delete": function () {
			openDelete(selected());
		}
	};
	var entryActions = {
		details: function (entry) {
			openDetails(entry);
		},
		rename: function (entry) {
			openRename(entry);
		},
		delete: function (entry) {
			openDelete([entry.name]);
		},
		copy: function (entry) {
			openTransfer("copy", [entry.name]);
		},
		move: function (entry) {
			openTransfer("move", [entry.name]);
		},
		download: function (entry) {
			downloadEntry(entry);
		}
	};
	function handleAction(action, name) {
		var run = shellActions[action];

		if (run) {
			run();
			return;
		}

		var entry = state.entries.find(function (item) {
			return item.name === name;
		});

		if (!entry) {
			return;
		}

		run = entryActions[action];

		if (run) {
			run(entry);
		}
	}
	function syncSelectAll() {
		var checkbox = document.getElementById("select-all");

		if (!checkbox) {
			return;
		}

		var entries = visibleEntries();
		var picked = entries.filter(function (entry) {
			return state.selection[entry.name];
		}).length;

		checkbox.checked = entries.length > 0 && picked === entries.length;
		checkbox.indeterminate = picked > 0 && picked < entries.length;
	}
	function markRows(name, selected) {
		Array.prototype.forEach.call(listing.querySelectorAll("tr[data-name]"), function (item) {
			if (item.dataset.name !== name) {
				return;
			}

			item.classList.toggle("selected", selected);

			var checkbox = item.querySelector("[data-select]");

			if (checkbox) {
				checkbox.checked = selected;
			}
		});
	}
	function setSelected(name, selected) {
		if (selected) {
			state.selection[name] = true;
		} else {
			delete state.selection[name];
		}

		markRows(name, selected);
		syncSelectAll();
		renderSummary();
	}
	function toggleSelect(name) {
		setSelected(name, !state.selection[name]);
	}
	function toggleSelectAll() {
		var entries = visibleEntries();
		var all = allSelected(entries);

		state.selection = {};

		if (!all) {
			entries.forEach(function (entry) {
				state.selection[entry.name] = true;
			});
		}

		Array.prototype.forEach.call(listing.querySelectorAll("tr[data-name]"), function (item) {
			var selected = !!state.selection[item.dataset.name];

			item.classList.toggle("selected", selected);

			var checkbox = item.querySelector("[data-select]");

			if (checkbox) {
				checkbox.checked = selected;
			}
		});

		syncSelectAll();
		renderSummary();
	}
	function toggleSort(key) {
		if (state.sort.key === key) {
			state.sort.dir *= -1;
		} else {
			state.sort = { key: key, dir: key === "mod" ? -1 : 1 };
		}

		localStorage.setItem("next-index-sort", JSON.stringify(state.sort));
		renderListing();
	}
	function flipTheme() {
		var next = currentTheme() === "dark" ? "light" : "dark";

		if (next === systemTheme()) {
			state.theme = "";
			localStorage.removeItem("next-index-theme");
		} else {
			state.theme = next;
			localStorage.setItem("next-index-theme", next);
		}

		applyTheme();
	}
	function toggleTheme() {
		flipTheme();
		renderTopbar();
	}

	function loginFormMarkup(closable) {
		return (
			'<form id="login-form" novalidate aria-label="Sign in">' +
			(closable
				? '<div class="dialog-head"><h2>Sign in</h2><button type="button" class="icon-btn sm" data-close aria-label="Close">' + icon("x") + "</button></div>"
				: "") +
			'<div class="field"><label for="login-user">Username</label>' +
			'<input class="input" id="login-user" name="username" autocomplete="username" autocapitalize="off" spellcheck="false"></div>' +
			'<div class="field"><label for="login-password">Password</label>' +
			'<div class="input-wrap">' +
			'<input class="input" id="login-password" name="password" type="password" autocomplete="current-password" autocapitalize="off">' +
			'<button type="button" class="input-reveal" id="login-reveal" aria-label="Show password">' + icon("eye") + "</button>" +
			"</div></div>" +
			'<div class="form-error" id="login-error"></div>' +
			'<div class="dialog-actions">' +
			(closable ? '<button type="button" class="btn" data-close>Cancel</button>' : "") +
			'<button type="submit" class="btn btn-primary login-submit" id="login-submit">Sign in</button></div>' +
			"</form>"
		);
	}

	function bindLoginForm() {
		var form = document.getElementById("login-form");
		var errorElement = document.getElementById("login-error");
		var submitButton = document.getElementById("login-submit");
		var userInput = document.getElementById("login-user");
		var passwordInput = document.getElementById("login-password");

		var revealButton = document.getElementById("login-reveal");

		revealButton.addEventListener("mousedown", function (event) {
			event.preventDefault();
		});

		revealButton.addEventListener("click", function () {
			var show = passwordInput.type === "password";

			passwordInput.type = show ? "text" : "password";
			revealButton.classList.toggle("on", show);
			revealButton.setAttribute("aria-label", show ? "Hide password" : "Show password");
		});

		userInput.value = state.username || "";

		if (passwordInput.value) {
			passwordInput.focus();
		} else {
			userInput.focus();
		}

		form.addEventListener("submit", function (event) {
			event.preventDefault();

			var username = userInput.value.trim();
			var password = passwordInput.value;

			if (!username || !password) {
				setFormError(errorElement, "Enter both a username and a password.");
				return;
			}

			setFormError(errorElement, "");
			submitButton.disabled = true;
			submitButton.textContent = "Signing in…";

			api("/@next-index/api/login", {
				method: "POST",
				body: JSON.stringify({ username: username, password: password })
			})
				.then(function (result) {
					state.authenticated = true;
					state.username = result.username || username;
					closeModal();

					if (state.loginRequired) {
						window.location.replace(window.location);
						return;
					}

					renderPage();
					toast("success", "Signed in as " + state.username);
				})
				.catch(function (error) {
					setFormError(errorElement, error.message);
				})
				.finally(function () {
					submitButton.disabled = false;
					submitButton.textContent = "Sign in";
				});
		});
	}

	function openLogin() {
		if (state.authenticated) {
			return;
		}

		openModal(loginFormMarkup(true));
		bindLoginForm();
	}

	function renderLoginScreen() {
		document.body.classList.add("login-page");
		topbar.innerHTML = "";
		footer.innerHTML = "";
		main.innerHTML =
			'<div class="dialog login-card">' +
			'<button type="button" class="icon-btn login-theme" id="login-theme" title="Toggle theme" aria-label="Toggle theme">' +
			(currentTheme() === "dark" ? icon("sun") : icon("moon")) +
			"</button>" +
			'<div class="login-brand"><img class="login-mark" src="/@next-index/assets/favicon.svg" alt="">' +
			"<span>" + esc(state.site || "NEXT_INDEX") + "</span></div>" +
			loginFormMarkup(false) +
			"</div>";

		bindLoginForm();

		var loginTheme = document.getElementById("login-theme");

		loginTheme.addEventListener("click", function () {
			flipTheme();
			loginTheme.innerHTML = currentTheme() === "dark" ? icon("sun") : icon("moon");
		});
	}

	function logout() {
		api("/@next-index/api/logout", { method: "POST" })
			.catch(function () {
				return {};
			})
			.then(function () {
				state.authenticated = false;
				state.username = "";

				if (state.loginRequired) {
					window.location.reload();
					return;
				}

				renderPage();
				toast("success", "Signed out.");
			});
	}
	function openMkdir() {
		if (!state.authenticated) {
			openLogin();
			return;
		}

		formDialog({
			title: "New folder",
			sub: "Create a folder inside <b>" + esc(state.path) + "</b>",
			label: "Folder name",
			placeholder: "untitled folder",
			submit: "Create",
			run: function (name, error) {
				if (!name) {
					setFormError(error, "Enter a folder name.");
					return;
				}

				send("/@next-index/api/mkdir", { path: state.path, name: name }, "Created folder \u201c" + name + "\u201d", error);
			}
		});
	}
	function downloadEntry(entry) {
		var url = new URL(entry.href, window.location.href);
		url.searchParams.set("download", "1");
		window.location.href = url.href;
	}
	function openDetails(entry) {
		var rows = [
			["Name", esc(entry.name)],
			["Kind", entry.kind === "dir" ? "Folder" : entry.ext ? entry.ext.toUpperCase() + " file" : "File"],
			["Size", entry.kind === "dir" ? "-" : esc(formatSize(entry.size)) + " <span class=\"muted\">(" + entry.size + " bytes)</span>"],
			["Modified", esc(formatFull(entry.mod))],
			["Location", esc(state.path + entry.name)]
		];

		if (entry.link && entry.target) {
			rows.push(["Links to", esc(entry.target)]);
		}

		var body = rows.map(function (row) {
			return "<div><dt>" + row[0] + "</dt><dd>" + row[1] + "</dd></div>";
		}).join("");

		var actions = "";

		if (entry.kind !== "dir" || state.authenticated) {
			actions = '<button type="button" class="btn btn-primary" id="detail-download">' + icon("download") + "<span>Download</span></button>";
		}

		openModal(
			'<div class="dialog-head"><div><h2>' + esc(entry.name) + "</h2></div>" +
			'<button type="button" class="icon-btn sm" data-close aria-label="Close">' + icon("x") + "</button></div>" +
			'<dl class="detail-list">' + body + "</dl>" +
			'<div class="dialog-actions"><button type="button" class="btn" data-close>Close</button>' + actions + "</div>"
		);

		var downloadButton = document.getElementById("detail-download");

		if (downloadButton) {
			downloadButton.addEventListener("click", function () {
				downloadEntry(entry);
			});
		}
	}
	function openRename(entry) {
		if (!state.authenticated) {
			openLogin();
			return;
		}

		var input = formDialog({
			title: "Rename",
			sub: "Rename <b>" + esc(entry.name) + "</b> in this folder.",
			label: "New name",
			value: entry.name,
			submit: "Rename",
			run: function (name, error) {
				if (!name) {
					setFormError(error, "Enter a new name.");
					return;
				}

				if (name === entry.name) {
					closeModal();
					return;
				}

				send("/@next-index/api/rename", { path: state.path, from: entry.name, to: name }, function (result) {
					return "Renamed to \u201c" + result.name + "\u201d";
				}, error);
			}
		});

		input.select();
	}
	function openTransfer(kind, names) {
		if (!names.length) {
			return;
		}

		if (!state.authenticated) {
			openLogin();
			return;
		}

		var copying = kind === "copy";
		var single = names.length === 1;

		var input = formDialog({
			title: copying ? "Copy" : "Move",
			sub: single ? "<b>" + esc(names[0]) + "</b> \u2014 " + (copying ? "the full path to copy it to." : "the folder to move it into.") : "<b>" + names.length + "</b> items \u2014 the destination folder.",
			label: copying && single ? "Destination path" : "Destination folder",
			value: copying && single ? state.path + names[0] : state.path,
			submit: copying ? "Copy" : "Move",
			run: function (to, error) {
				if (!to) {
					setFormError(error, "Enter a destination path.");
					return;
				}

				if (!copying || !single) {
					if (to.charAt(to.length - 1) !== "/") {
						to += "/";
					}
				}

				state.selection = {};
				state.selecting = false;

				send("/@next-index/api/" + kind, { path: state.path, names: names, to: to }, (copying ? "Copied " : "Moved ") + (single ? "\u201c" + names[0] + "\u201d" : names.length + " items"), error);
			}
		});

		input.setSelectionRange(input.value.length, input.value.length);
	}
	function openDelete(names) {
		if (!names.length) {
			return;
		}

		if (!state.authenticated) {
			openLogin();
			return;
		}

		var single = names.length === 1;
		var entry = single ? state.entries.filter(function (item) {
			return item.name === names[0];
		})[0] : null;
		var preview = names
			.map(function (name) {
				return '<div class="delete-name">' + esc(name) + "</div>";
			})
			.join("");

		openModal(
			'<div class="dialog-head"><div><h2>Delete ' + (single ? (entry && entry.kind === "dir" ? "folder" : "file") : names.length + " items") + "?</h2></div>" +
			'<button type="button" class="icon-btn sm" data-close aria-label="Close">' + icon("x") + "</button></div>" +
			'<p class="sub">This action cannot be undone.</p>' +
			'<div class="delete-target">' + preview + "</div>" +
			'<div class="dialog-actions"><button type="button" class="btn" data-close>Cancel</button>' +
			'<button type="button" class="btn btn-danger" id="confirm-delete">Delete</button></div>'
		);

		document.getElementById("confirm-delete").addEventListener("click", function () {
			var button = this;
			button.disabled = true;
			button.textContent = "Deleting\u2026";

			api("/@next-index/api/delete", {
				method: "POST",
				body: JSON.stringify({ path: state.path, names: names })
			})
				.then(function () {
					closeModal();
					state.selection = {};
					state.selecting = false;
					toast("success", single ? "Deleted \u201c" + names[0] + "\u201d" : "Deleted " + names.length + " items");
					return refresh();
				})
				.catch(function (error) {
					if (error.status === 401) {
						handleError(error);
						return;
					}

					button.disabled = false;
					button.textContent = "Delete";
					toast("error", error.message);
				});
		});
	}


	function openUpload() {
		if (!state.authenticated) {
			openLogin();
			return;
		}

		state.uploads = [];

		openModal(
			'<div class="dialog-head"><h2>Upload files</h2>' +
			'<button type="button" class="icon-btn sm" data-close aria-label="Close">' + icon("x") + "</button></div>" +
			'<p class="sub">Files go to <b>' + esc(state.path) + "</b></p>" +
			'<div class="dropzone" id="dropzone">' + icon("upload") +
			"<div><b>Choose files to upload</b></div>" +
			"<span>" + (state.maxUploadMB > 0 ? "Up to " + state.maxUploadMB + " MB per upload" : "No upload limit") + "</span></div>" +
			'<input type="file" id="file-input" multiple hidden>' +
			'<div class="file-list" id="file-list"></div>' +
			'<div class="upload-meta"><label class="checkbox"><input type="checkbox" id="overwrite-checkbox"> Replace existing files</label>' +
			'<span id="upload-summary"></span></div>' +
			'<div class="dialog-actions"><button type="button" class="btn" id="cancel-upload">Cancel</button>' +
			'<button type="button" class="btn btn-primary" id="start-upload" disabled>Upload</button></div>',
			"wide"
		);

		var dropzone = document.getElementById("dropzone");
		var fileInput = document.getElementById("file-input");
		var fileList = document.getElementById("file-list");
		var startButton = document.getElementById("start-upload");

		dropzone.addEventListener("click", function () {
			fileInput.click();
		});

		fileInput.addEventListener("change", function () {
			addUploads(fileInput.files);
			fileInput.value = "";
		});

		fileList.addEventListener("click", function (event) {
			var removeButton = event.target.closest("[data-remove]");

			if (!removeButton) {
				return;
			}

			event.stopPropagation();
			state.uploads.splice(Number(removeButton.dataset.remove), 1);
			renderUploadFiles();
		});

		startButton.addEventListener("click", startUpload);

		document.getElementById("cancel-upload").addEventListener("click", function () {
			cancelUploads();
			closeModal();
		});

		modalRoot.querySelector(".dialog-head [data-close]").addEventListener("click", cancelUploads);

		renderUploadFiles();

		function addUploads(files) {
			if (!files || files.length === 0) {
				return;
			}

			var limit = state.maxUploadMB > 0 ? state.maxUploadMB << 20 : 0;

			Array.prototype.forEach.call(files, function (file) {
				if (limit > 0 && file.size > limit) {
					toast("error", file.name + " is larger than " + state.maxUploadMB + " MB");
					return;
				}

				var added = state.uploads.some(function (item) {
					return item.name === file.name && item.size === file.size && item.lastModified === file.lastModified;
				});

				if (added) {
					return;
				}

				state.uploads.push(file);
			});

			renderUploadFiles();
		}
	}
	function cancelUploads() {
		if (!state.uploading) {
			return;
		}

		uploadCancelled = true;
		uploadRun++;
		state.uploading = false;
		state.uploads = [];

		activeUploads.slice().forEach(function (request) {
			request.abort();
		});

		activeUploads = [];
		refresh();
	}
	function renderUploadFiles() {
		var fileList = document.getElementById("file-list");
		var startButton = document.getElementById("start-upload");
		var summary = document.getElementById("upload-summary");

		if (!fileList) {
			return;
		}

		fileList.innerHTML = state.uploads
			.map(function (item, index) {
				var label = item.name;

				return (
					'<div class="file-row" data-index="' + index + '">' +
					'<span class="fname" title="' + esc(label) + '">' + esc(label) + "</span>" +
					'<span class="fsize">' + formatSize(item.size) + "</span>" +
					'<div class="file-progress"><span></span></div>' +
					'<button type="button" class="row-action" data-remove="' + index + '" title="Remove" aria-label="Remove">' + icon("x") + "</button>" +
					"</div>"
				);
			})
			.join("");

		var total = state.uploads.reduce(function (sum, item) {
			return sum + item.size;
		}, 0);

		summary.textContent = state.uploads.length === 0 ? "No files selected" : state.uploads.length + " " + plural(state.uploads.length, "file", "files") + " · " + formatSize(total);
		startButton.disabled = state.uploads.length === 0 || state.uploading;
		startButton.textContent = state.uploading ? "Uploading…" : "Upload";
	}
	function startUpload() {
		if (state.uploading || state.uploads.length === 0) {
			return;
		}

		state.uploading = true;
		uploadCancelled = false;

		var run = ++uploadRun;

		var startButton = document.getElementById("start-upload");
		var overwriteCheckbox = document.getElementById("overwrite-checkbox");
		var overwrite = overwriteCheckbox ? overwriteCheckbox.checked : false;

		renderUploadFiles();

		var success = 0;
		var failed = 0;
		var sent = 0;
		var loaded = {};
		var totalBytes = state.uploads.reduce(function (sum, item) {
			return sum + item.size;
		}, 0);
		var summary = document.getElementById("upload-summary");

		var chain = Promise.resolve();

		state.uploads.forEach(function (item, index) {
			chain = chain.then(function () {
				if (run !== uploadRun) {
					return;
				}

				var row = document.querySelector('.file-row[data-index="' + index + '"]');
				var progress = row ? row.querySelector(".file-progress span") : null;
				var sizeCell = row ? row.querySelector(".fsize") : null;
				var label = item.name;

				return uploadFile(item, state.path, overwrite, function (done, total) {
					if (progress) {
						progress.style.width = Math.round((done / total) * 100) + "%";
					}

					if (sizeCell) {
						sizeCell.textContent = formatSize(done) + " / " + formatSize(total);
					}

					sent += done - (loaded[index] || 0);
					loaded[index] = done;

					if (summary) {
						summary.textContent = formatSize(sent) + " / " + formatSize(totalBytes);
					}
				})
					.then(function (result) {
						var uploaded = result.files && result.files[0];

						if (uploaded && uploaded.ok === false) {
							throw new Error(uploaded.error || "upload failed");
						}

						success++;
						if (row) {
							row.classList.add("done");
						}
						if (progress) {
							progress.style.width = "100%";
						}
						if (sizeCell) {
							sizeCell.textContent = formatSize(item.size);
						}
					})
					.catch(function (error) {
						if (error.cancelled) {
							return;
						}

						failed++;
						if (row) {
							row.classList.add("failed");
						}
						if (progress) {
							progress.style.width = "100%";
						}
						if (sizeCell) {
							sizeCell.textContent = formatSize(item.size);
						}
						toast("error", label + ": " + error.message);
					});
			});
		});

		chain
			.then(function () {
				if (run !== uploadRun) {
					return;
				}

				state.uploading = false;
				state.uploads = [];
				startButton.disabled = true;
				startButton.textContent = "Upload";

				if (summary) {
					summary.textContent = "No files selected";
				}
				return refresh();
			})
			.then(function () {
				if (run !== uploadRun) {
					return;
				}

				if (document.contains(startButton)) {
					closeModal();
				}

				if (uploadCancelled) {
					return;
				}

				if (success > 0) {
					toast("success", "Uploaded " + success + " " + plural(success, "file", "files"));
				}

				if (failed > 0 && success === 0) {
					toast("error", "No files were uploaded.");
				}
			});
	}
	function uploadFile(file, targetPath, overwrite, onProgress) {
		return new Promise(function (resolve, reject) {
			var request = new XMLHttpRequest();
			var settled = false;
			var query = "?path=" + encodeURIComponent(targetPath) + (overwrite ? "&overwrite=1" : "");

			function settle(fn, value) {
				if (settled) {
					return;
				}

				settled = true;
				activeUploads = activeUploads.filter(function (item) {
					return item !== request;
				});
				fn(value);
			}

			request.open("POST", "/@next-index/api/upload" + query);
			request.withCredentials = true;

			request.upload.addEventListener("progress", function (event) {
				if (event.lengthComputable && onProgress) {
					onProgress(event.loaded, event.total);
				}
			});

			request.addEventListener("load", function () {
				var data = {};

				try {
					data = JSON.parse(request.responseText);
				} catch (error) {
					/* ignore */
				}

				if (request.status >= 200 && request.status < 300) {
					settle(resolve, data);
					return;
				}

				var error = new Error(data.error || "upload failed (" + request.status + ")");
				error.status = request.status;
				settle(reject, error);
			});

			request.addEventListener("error", function () {
				settle(reject, new Error("network error"));
			});

			request.addEventListener("abort", function () {
				var error = new Error("cancelled");
				error.cancelled = true;
				settle(reject, error);
			});

			var form = new FormData();
			form.append("file", file, file.name);

			activeUploads.push(request);
			request.send(form);
		});
	}
	function bindEvents() {
		summaryActions.addEventListener("click", function (event) {
			var actionButton = event.target.closest("[data-action]");

			if (actionButton) {
				handleAction(actionButton.dataset.action);
			}
		});

		summaryRoot.addEventListener("click", function (event) {
			var actionButton = event.target.closest("[data-action]");

			if (actionButton) {
				handleAction(actionButton.dataset.action);
			}
		});

		listing.addEventListener("click", function (event) {
			var sortButton = event.target.closest("[data-sort]");

			if (sortButton) {
				toggleSort(sortButton.dataset.sort);
				return;
			}

			var checkbox = event.target.closest("[data-select]");

			if (checkbox) {
				event.stopPropagation();
				setSelected(checkbox.dataset.select, checkbox.checked);
				return;
			}

			if (event.target.closest("#select-all")) {
				toggleSelectAll();
				return;
			}

			if (state.selecting) {
				var target = event.target.closest("tr[data-name]");

				if (target) {
					event.preventDefault();

					var known = state.entries.some(function (entry) {
						return entry.name === target.dataset.name;
					});

					if (known) {
						toggleSelect(target.dataset.name);
					}

					return;
				}
			}

			var menuButton = event.target.closest("[data-menu]");

			if (menuButton) {
				event.preventDefault();
				event.stopPropagation();
				openMenu(menuButton);
				return;
			}

			var action = event.target.closest("[data-action]");

			if (action) {
				event.preventDefault();
				event.stopPropagation();
				handleAction(action.dataset.action, action.dataset.name);
				return;
			}

			if (event.target.closest("button, a, input, label")) {
				return;
			}

			var row = event.target.closest("tr[data-href]");

			if (row) {
				window.location.href = row.dataset.href;
			}
		});

		document.addEventListener("keydown", function (event) {
			if (event.key === "Escape") {
				closeMenu();

				if (modalRoot.firstChild) {
					if (state.uploading) {
						cancelUploads();
					}

					closeModal();
				}

				return;
			}

			if (event.ctrlKey || event.metaKey || event.altKey) {
				return;
			}

			var target = event.target;
			var tag = (target.tagName || "").toLowerCase();

			if (tag === "input" || tag === "textarea" || tag === "select" || target.isContentEditable) {
				return;
			}

			if (modalRoot.firstChild || document.getElementById("row-menu")) {
				return;
			}

			if (event.key === "u" || event.key === "U") {
				openUpload();
			} else if (event.key === "n" || event.key === "N") {
				openMkdir();
			}
		});

		document.addEventListener("click", function (event) {
			var item = event.target.closest("#row-menu [data-action]");

			if (item) {
				closeMenu();
				handleAction(item.dataset.action, item.dataset.name);
				return;
			}

			if (!event.target.closest("#row-menu")) {
				closeMenu();
			}
		});

	}

	if (state) {
		if (state.loginRequired && !state.authenticated) {
			renderLoginScreen();
			return;
		}

		bindEvents();
		renderPage();
	}

})();
