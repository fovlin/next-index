(function () {
	"use strict";

	var state;

	try {
		state = JSON.parse(document.getElementById("next-index-bootstrap").textContent);
	} catch (error) {
		return;
	}

	state.entries = Array.isArray(state.entries) ? state.entries : [];
	state.crumbs = Array.isArray(state.crumbs) ? state.crumbs : [];
	state.view = localStorage.getItem("next-index-view") === "grid" ? "grid" : "list";
	state.theme = localStorage.getItem("next-index-theme") === "light" ? "light" : "dark";

	var parameters = new URLSearchParams(window.location.search);

	if (parameters.get("view") === "grid" || parameters.get("view") === "list") {
		state.view = parameters.get("view");
	}

	if (parameters.get("theme") === "light" || parameters.get("theme") === "dark") {
		state.theme = parameters.get("theme");
	}
	state.sort = readSort();
	state.query = "";
	state.uploads = [];
	state.uploading = false;
	state.selection = {};
	state.selecting = false;
	var ensuredDirectories = {};

	document.documentElement.dataset.theme = state.theme;

	var ICONS = {
		parent: '<path d="M2 19V6.5A2.5 2.5 0 0 1 4.5 4H8a2 2 0 0 1 1.7.9L11 6.5h8.5A2.5 2.5 0 0 1 22 9v10a2.5 2.5 0 0 1-2.5 2.5h-15A2.5 2.5 0 0 1 2 19Z"/><path d="M17.8 14H7.6"/><path d="m10.1 11.5-2.5 2.5 2.5 2.5"/>',
		layers: '<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5"/><path d="m3 16 9 5 9-5"/>',
		search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.2-3.2"/>',
		refresh: '<path d="M20 11a8 8 0 1 0-2.34 5.66"/><path d="M20 4v7h-7"/>',
		moon: '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5Z"/>',
		sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
		upload: '<path d="M12 16V4"/><path d="m7 9 5-5 5 5"/><path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>',
		folder: '<path d="M2 19V6.5A2.5 2.5 0 0 1 4.5 4H8a2 2 0 0 1 1.7.9L11 6.5h8.5A2.5 2.5 0 0 1 22 9v10a2.5 2.5 0 0 1-2.5 2.5h-15A2.5 2.5 0 0 1 2 19Z"/>',
		folderOpen: '<path d="M2 19V6.5A2.5 2.5 0 0 1 4.5 4H8a2 2 0 0 1 1.7.9L11 6.5h8.5A2.5 2.5 0 0 1 22 9v10a2.5 2.5 0 0 1-2.5 2.5h-15A2.5 2.5 0 0 1 2 19Z"/><path d="M8 14h8"/>',
		folderPlus: '<path d="M2 19V6.5A2.5 2.5 0 0 1 4.5 4H8a2 2 0 0 1 1.7.9L11 6.5h8.5A2.5 2.5 0 0 1 22 9v10a2.5 2.5 0 0 1-2.5 2.5h-15A2.5 2.5 0 0 1 2 19Z"/><path d="M12 11.2v5.6"/><path d="M9.2 14h5.6"/>',
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
		login: '<path d="M14 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-2"/><path d="M9 12h11"/><path d="m17 8 4 4-4 4"/>',
		logout: '<path d="M10 8V6a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-6a2 2 0 0 1-2-2v-2"/><path d="M15 12H4"/><path d="m7 8-4 4 4 4"/>',
		lock: '<rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
		home: '<path d="m3 11 9-8 9 8"/><path d="M5 10v10h14V10"/>',
		copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>',
		move: '<path d="M3 12h11"/><path d="m10 8 4 4-4 4"/><path d="M17 4h4v16h-4"/>',
		more: '<circle cx="5" cy="12" r="2.2" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="2.2" fill="currentColor" stroke="none"/>',
		select: '<rect x="3" y="3" width="18" height="18" rx="4"/><path d="m8 12 2.5 2.5L16 9"/>',
		list: '<path d="M9 6h12M9 12h12M9 18h12"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/>',
		grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>'
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

	main.innerHTML = '<div class="summary"><div class="stats" id="stats"></div><div class="summary-actions" id="summary-actions"></div></div><div class="card" id="listing"></div>';

	var summaryRoot = document.querySelector(".summary");
	var stats = document.getElementById("stats");
	var summaryActions = document.getElementById("summary-actions");
	var listing = document.getElementById("listing");

	bindEvents();
	renderTopbar();
	renderSummary();
	renderListing();
	renderFooter();

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
		return new Date(unix * 1000).toLocaleDateString('en-US', {
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
		});
	}

	function formatTime(unix) {
		return new Date(unix * 1000).toLocaleTimeString('en-US', {
			hour12: false,
		});
	}

	function formatFull(unix) {
		return new Date(unix * 1000).toLocaleString();
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

		if (state.query) {
			entries = entries.filter(function (entry) {
				return entry.name.toLowerCase().indexOf(state.query) !== -1;
			});
		}

		return entries;
	}

	function selected() {
		return Object.keys(state.selection).filter(function (name) {
			return state.selection[name];
		});
	}

	function selectMarkup(entry) {
		if (!state.selecting || entry.kind === "parent") {
			return "";
		}

		return '<input type="checkbox" class="select-box" data-select="' + esc(entry.name) + '"' + (state.selection[entry.name] ? " checked" : "") + ' aria-label="Select ' + esc(entry.name) + '">';
	}

	function renderTopbar() {
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

		var authMarkup = "";

		if (state.authenticated) {
			authMarkup =
				'<span class="user-chip" title="Signed in"><span class="avatar">' + esc((state.username || "?").slice(0, 1)) + '</span><span class="user-name">' + esc(state.username) + "</span></span>" +
				'<button class="icon-btn" id="logout-btn" title="Sign out" aria-label="Sign out">' + icon("logout") + "</button>";
		} else if (state.writable) {
			authMarkup = '<button class="btn btn-ghost" id="login-btn" title="Sign in" aria-label="Sign in">' + icon("login") + "<span>Sign in</span></button>";
		} else {
			authMarkup = '<span class="readonly-chip">' + icon("lock") + "read only</span>";
		}

		topbar.innerHTML =
			'<div class="topbar-inner">' +
			'<a class="brand" href="/" aria-label="Home">' +
			'<span class="brand-mark">' + icon("layers") + "</span>" +
			'<span class="brand-name">' + esc(state.site || "NEXT_INDEX") + "</span>" +
			'<span class="brand-version">v' + esc(state.version) + "</span>" +
			"</a>" +
			'<nav class="crumbs" aria-label="Breadcrumb">' + crumbs + "</nav>" +
			'<div class="search">' +
			icon("search", "search-icon") +
			'<input id="search-input" type="search" placeholder="Search this folder" autocomplete="off" spellcheck="false" aria-label="Search this folder">' +
			"<kbd>/</kbd>" +
			"</div>" +
			'<div class="topbar-actions">' +
			'<button class="icon-btn" id="refresh-btn" title="Refresh" aria-label="Refresh">' + icon("refresh") + "</button>" +
			'<button class="icon-btn" id="theme-btn" title="Toggle theme" aria-label="Toggle theme">' + (state.theme === "dark" ? icon("sun") : icon("moon")) + "</button>" +
			authMarkup +
			(state.writable ? '<button class="btn btn-primary" id="upload-btn" title="Upload files" aria-label="Upload files">' + icon("upload") + "<span>Upload</span></button>" : "") +
			"</div>" +
			"</div>";

		var searchInput = document.getElementById("search-input");
		searchInput.value = state.query;

		searchInput.addEventListener("input", function () {
			state.query = searchInput.value.trim().toLowerCase();
			renderSummary();
			renderListing();
		});

		document.getElementById("refresh-btn").addEventListener("click", refresh);
		document.getElementById("theme-btn").addEventListener("click", toggleTheme);
		var uploadButton = document.getElementById("upload-btn");

		if (uploadButton) {
			uploadButton.addEventListener("click", function () {
				openUpload();
			});
		}

		var loginButton = document.getElementById("login-btn");
		if (loginButton) {
			loginButton.addEventListener("click", function () {
				openLogin();
			});
		}

		var logoutButton = document.getElementById("logout-btn");
		if (logoutButton) {
			logoutButton.addEventListener("click", logout);
		}
	}

	function renderSummary() {
		summaryRoot.classList.toggle("selecting", state.selecting);

		var entries = state.entries;
		var directories = entries.filter(function (entry) {
			return entry.kind === "dir";
		}).length;
		var files = entries.length - directories;
		var totalSize = entries.reduce(function (sum, entry) {
			return sum + (entry.kind === "file" ? entry.size || 0 : 0);
		}, 0);

		var parts = [
			"<span><b>" + directories + "</b> " + plural(directories, "folder", "folders") + "</span>",
			'<span class="stat-dot"></span>',
			"<span><b>" + files + "</b> " + plural(files, "file", "files") + "</span>",
			'<span class="stat-dot"></span>',
			"<span><b>" + formatSize(totalSize) + "</b> total</span>"
		];

		if (state.query) {
			parts.push('<span class="stat-dot"></span>');
			parts.push("<span><b>" + visibleEntries().length + "</b> matches</span>");
		}

		stats.innerHTML = parts.join("");

		var mkdirButton = state.authenticated
			? '<button class="btn btn-sm" data-action="mkdir" title="New folder" aria-label="New folder">' + icon("folderPlus") + "<span>New folder</span></button>"
			: "";

		var names = selected();

		var selectButton = state.authenticated
			? '<button class="icon-btn select-toggle' + (state.selecting ? " active" : "") + '" data-action="toggle-selection" title="Select files" aria-label="Select files" aria-pressed="' + state.selecting + '">' + icon("select") + "</button>"
			: "";

		var batch = "";

		if (state.selecting) {
			batch =
				'<div class="batch">' +
				"<span><b>" + names.length + "</b> selected</span>" +
				(names.length
					? '<button class="btn btn-sm" data-action="batch-copy">' + icon("copy") + "<span>Copy</span></button>" +
						'<button class="btn btn-sm" data-action="batch-move">' + icon("move") + "<span>Move</span></button>" +
						'<button class="btn btn-sm" data-action="batch-delete">' + icon("trash") + "<span>Delete</span></button>"
					: "") +
				'<button class="icon-btn" data-action="toggle-selection" title="Done" aria-label="Done">' + icon("x") + "</button>" +
				"</div>";
		}

		summaryActions.innerHTML =
			batch +
			mkdirButton +
			selectButton +
			'<div class="segmented" role="group" aria-label="View mode">' +
			'<button data-view="list" class="' + (state.view === "list" ? "active" : "") + '" title="List view" aria-label="List view">' + icon("list") + "</button>" +
			'<button data-view="grid" class="' + (state.view === "grid" ? "active" : "") + '" title="Grid view" aria-label="Grid view">' + icon("grid") + "</button>" +
			"</div>";
	}

	function renderListing() {
		var entries = visibleEntries();

		listing.classList.toggle("selecting", state.selecting);

		if (state.entries.length === 0) {
			listing.innerHTML =
				'<div class="empty"><div class="empty-icon">' + icon("folderOpen") + "</div>" +
				"<h2>This folder is empty</h2>" +
				"<p>Nothing here yet. Upload a file to get started.</p>" +
				'<div>' +
				'<button class="btn btn-ghost" data-action="back">' + icon("parent") + "<span>Back</span></button>" +
				(state.authenticated
					? '<button class="btn btn-primary" data-action="upload">' + icon("upload") + "<span>Upload files</span></button>"
					: state.writable
						? '<button class="btn btn-primary" data-action="login">' + icon("login") + "<span>Sign in to upload</span></button>"
						: "") +
				"</div></div>";
			return;
		}

		if (entries.length === 0) {
			listing.innerHTML =
				'<div class="empty"><div class="empty-icon">' + icon("search") + "</div>" +
				"<h2>No matches</h2>" +
				"<p>Nothing here matches “" + esc(state.query) + "”.</p>" +
				'<button class="btn btn-sm" data-action="clear-search">Clear search</button>' +
				"</div>";
			return;
		}

		listing.innerHTML = state.view === "grid" ? gridMarkup(entries) : tableMarkup(entries);

		bindThumbnails();
	}

	function bindThumbnails() {
		listing.querySelectorAll(".thumb img").forEach(function (image) {
			image.addEventListener(
				"error",
				function () {
					var thumb = image.closest(".thumb");
					var tile = image.closest(".tile");

					if (!thumb || !tile) {
						return;
					}

					var entry = state.entries.filter(function (item) {
						return item.name === tile.dataset.name;
					})[0];

					if (!entry) {
						return;
					}

					var type = typeOf(entry);
					thumb.innerHTML = '<span class="entry-icon ' + type[1] + '">' + icon(type[0]) + "</span>";
				},
				{ once: true }
			);
		});
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

		var lastPage = state.parent.name === "/" ? lastPage = "" : rowMarkup(state.parent)

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

	function selectAllMarkup(entries) {
		var checked =
			entries.length > 0 &&
			entries.every(function (entry) {
				return state.selection[entry.name];
			});

		return '<input type="checkbox" id="select-all" aria-label="Select all"' + (checked ? " checked" : "") + ">";
	}

	function gridMarkup(entries) {
		var lastPage = state.parent.name === "/" ? lastPage = "" : itemMarkup(state.parent)
		return (
			'<div class="grid">' + lastPage + entries.map(itemMarkup).join("") + "</div>"
		);
	}

	function rowMarkup(entry) {
		var type = typeOf(entry);
		var size = entry.kind === "file" ? formatSize(entry.size) : "—";

		return (
			'<tr' + (state.selection[entry.name] ? ' class="selected"' : "") + ' data-name="' + esc(entry.name) + '" data-href="' + esc(entry.href) + '">' +
			(state.selecting ? '<td class="col-select">' + selectMarkup(entry) + "</td>" : "") +
			'<td class="col-name">' +
			'<a class="entry" href="' + esc(entry.href) + '">' +
			'<span class="entry-icon ' + type[1] + '">' + icon(type[0]) + "</span>" +
			'<span class="name-wrap"><span class="entry-name">' + nameMarkup(entry) + "</span>" +
			(entry.link ? '<span class="badge badge-link">link</span>' : "") +
			"</span>" +
			"</a>" +
			"</td>" +
			'<td class="col-size size" title="' + (entry.kind === "file" ? entry.size + " bytes" : "") + '">' + size + "</td>" +
			'<td class="col-time time" title="' + esc(formatFull(entry.mod)) + '">' + esc(formatDate(entry.mod)) + '<small>' + esc(formatTime(entry.mod)) + '</small></td>' +
			'<td class="col-actions"><div class="row-actions">' + menuMarkup(entry) + "</div></td>" +
			"</tr>"
		);
	}

	function itemMarkup(entry) {
		var type = typeOf(entry);
		var meta = entry.kind === "file" ? formatSize(entry.size) : "folder";
		var thumb =
			entry.thumb && entry.kind === "file"
				? '<div class="thumb"><img src="' + esc(entry.href) + '" alt="" loading="lazy" decoding="async"></div>'
				: '<div class="thumb"><span class="entry-icon ' + type[1] + '">' + icon(type[0]) + "</span></div>";

		return (
			'<div class="tile' + (state.selection[entry.name] ? " selected" : "") + '" data-name="' + esc(entry.name) + '">' +
			(state.selecting ? '<span class="tile-select">' + selectMarkup(entry) + "</span>" : "") +
			'<a class="tile-main" href="' + esc(entry.href) + '">' +
			thumb +
			'<span class="tile-name" title="' + esc(entry.name) + '">' + esc(entry.name) + "</span>" +
			'<span class="tile-meta"><span>' + meta + "</span><span>" + formatDate(entry.mod) + "</span></span>" +
			"</a>" +
			(menuMarkup(entry) ? '<div class="tile-actions row-actions">' + menuMarkup(entry) + "</div>" : "") +
			"</div>"
		);
	}

	function nameMarkup(entry) {
		var name = entry.name;

		if (entry.kind !== "file") {
			return esc(name);
		}

		var dot = name.lastIndexOf(".");

		if (dot <= 0 || dot === name.length - 1) {
			return esc(name);
		}

		return esc(name.slice(0, dot)) + '<span class="entry-ext">' + esc(name.slice(dot)) + "</span>";
	}

	function menuMarkup(entry) {
		if (!state.authenticated || state.selecting || entry.kind === "parent") {
			return "";
		}

		return '<button class="row-action" data-menu="' + esc(entry.name) + '" title="More" aria-label="More">' + icon("more") + "</button>";
	}

	function renderFooter() {
		var status = state.authenticated ? '<span class="status-dot" title="Signed in"></span>' : '<span class="status-dot locked" title="Read only"></span>';
		var location;

		if (state.authenticated) {
			location = esc(state.username);
		} else if (state.writable) {
			location = "browsing is public · sign in to manage files";
		} else {
			location = "read only · uploads are disabled on this server";
		}

		footer.innerHTML =
			'<div class="footer-side">' + status + '<span class="mono">' + location + "</span></div>" +
			'<div class="footer-side"><span>' + esc(state.site || "NEXT_INDEX") + ' v' + esc(state.version) + '</span><span class="stat-dot"></span><span>' + state.entries.length + ' items</span><span class="stat-dot"></span><span>press <kbd>/</kbd> to search</span></div>';
	}

	function plural(count, singular, many) {
		return count === 1 ? singular : many;
	}

	function bindEvents() {
		summaryActions.addEventListener("click", function (event) {
			var viewButton = event.target.closest("[data-view]");

			if (viewButton) {
				setView(viewButton.dataset.view);
				return;
			}

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
				state.selection[checkbox.dataset.select] = checkbox.checked;

				var item = checkbox.closest("tr, .tile");

				if (item) {
					item.classList.toggle("selected", checkbox.checked);
				}

				renderSummary();
				return;
			}

			if (event.target.closest("#select-all")) {
				toggleSelectAll();
				return;
			}

			if (state.selecting) {
				var item = event.target.closest("tr[data-name], .tile[data-name]");

				if (item) {
					event.preventDefault();

					var known = state.entries.some(function (entry) {
						return entry.name === item.dataset.name;
					});

					if (known) {
						toggleSelect(item.dataset.name);
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
				closeModal();
				hideDropOverlay();
				return;
			}

			var target = event.target;
			var tag = (target.tagName || "").toLowerCase();

			if (tag === "input" || tag === "textarea" || tag === "select" || target.isContentEditable) {
				return;
			}

			if (event.key === "/") {
				event.preventDefault();
				var searchInput = document.getElementById("search-input");
				if (searchInput) {
					searchInput.focus();
					searchInput.select();
				}
				return;
			}

			if (event.key === "u" || event.key === "U") {
				openUpload();
			} else if (event.key === "n" || event.key === "N") {
				openMkdir();
			} else if (event.key === "g" || event.key === "G") {
				setView(state.view === "grid" ? "list" : "grid");
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

		bindDropEvents();
	}

	function handleAction(action, name) {
		if (action === "clear-search") {
			state.query = "";
			var searchInput = document.getElementById("search-input");
			if (searchInput) {
				searchInput.value = "";
			}
			renderSummary();
			renderListing();
			return;
		}

		if (action === "mkdir") {
			openMkdir();
			return;
		}

		if (action === "upload") {
			openUpload();
			return;
		}

		if (action === "login") {
			openLogin();
			return;
		}

		if (action === "back") {
			window.location.href = "../";
			return;
		}

		if (action === "toggle-selection") {
			state.selecting = !state.selecting;

			if (!state.selecting) {
				state.selection = {};
			}

			renderSummary();
			renderListing();
			return;
		}

		if (action === "batch-copy") {
			openTransfer("copy", selected());
			return;
		}

		if (action === "batch-move") {
			openTransfer("move", selected());
			return;
		}

		if (action === "batch-delete") {
			openDelete(selected());
			return;
		}

		var entry = state.entries.filter(function (item) {
			return item.name === name;
		})[0];

		if (!entry) {
			return;
		}

		if (action === "rename") {
			openRename(entry);
		} else if (action === "delete") {
			openDelete([entry.name]);
		} else if (action === "copy") {
			openTransfer("copy", [entry.name]);
		} else if (action === "move") {
			openTransfer("move", [entry.name]);
		}
	}

	function toggleSelectAll() {
		var entries = visibleEntries();
		var all = entries.length > 0 && entries.every(function (entry) {
			return state.selection[entry.name];
		});

		entries.forEach(function (entry) {
			if (all) {
				delete state.selection[entry.name];
			} else {
				state.selection[entry.name] = true;
			}
		});

		renderSummary();
		renderListing();
	}

	function openMenu(button) {
		closeMenu();

		var name = button.dataset.menu;
		var menu = document.createElement("div");

		menu.className = "menu";
		menu.id = "row-menu";
		menu.innerHTML =
			'<button type="button" data-action="copy" data-name="' + esc(name) + '">' + icon("copy") + "<span>Copy</span></button>" +
			'<button type="button" data-action="move" data-name="' + esc(name) + '">' + icon("move") + "<span>Move</span></button>" +
			'<button type="button" data-action="rename" data-name="' + esc(name) + '">' + icon("pencil") + "<span>Rename</span></button>" +
			'<button type="button" data-action="delete" data-name="' + esc(name) + '" class="danger">' + icon("trash") + "<span>Delete</span></button>";

		document.body.appendChild(menu);

		var rect = button.getBoundingClientRect();
		var left = Math.min(rect.right - menu.offsetWidth, window.innerWidth - menu.offsetWidth - 8);
		var top = rect.bottom + 4;

		if (top + menu.offsetHeight > window.innerHeight - 8) {
			top = rect.top - menu.offsetHeight - 4;
		}

		menu.style.left = Math.max(8, left) + "px";
		menu.style.top = Math.max(8, top) + "px";
	}

	function closeMenu() {
		var menu = document.getElementById("row-menu");

		if (menu) {
			menu.remove();
		}
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

	function setView(view) {
		state.view = view === "grid" ? "grid" : "list";
		localStorage.setItem("next-index-view", state.view);
		renderSummary();
		renderListing();
	}

	function toggleTheme() {
		state.theme = state.theme === "dark" ? "light" : "dark";
		document.documentElement.dataset.theme = state.theme;
		localStorage.setItem("next-index-theme", state.theme);
		renderTopbar();
	}

	function toast(type, message) {
		var element = document.createElement("div");
		element.className = "toast " + type;
		element.innerHTML = icon(type === "success" ? "check" : "alert") + "<span>" + esc(message) + "</span>";
		toastRoot.appendChild(element);

		setTimeout(function () {
			element.style.transition = "opacity .2s ease, transform .2s ease";
			element.style.opacity = "0";
			element.style.transform = "translateY(8px)";
			setTimeout(function () {
				element.remove();
			}, 220);
		}, 3600);
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

				renderSummary();
				renderListing();
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
			renderTopbar();
			renderSummary();
			renderListing();
			renderFooter();
			openLogin("Your session expired. Sign in again to manage files.");
			return;
		}

		toast("error", error.message || String(error));
	}

	function openLogin(message) {
		if (!state.writable) {
			toast("error", "Write access is disabled. Run `next-index config -P` on the server to enable it.");
			return;
		}

		if (state.authenticated) {
			return;
		}

		openModal(
			'<form id="login-form" novalidate>' +
			'<div class="dialog-head"><div><h2>Sign in</h2></div>' +
			'<button type="button" class="icon-btn sm" data-close aria-label="Close">' + icon("x") + "</button></div>" +
			'<p class="sub">' + (message ? esc(message) : "Browsing is public. Sign in to upload, rename, create and delete files.") + "</p>" +
			'<div class="field"><label for="login-user">Username</label>' +
			'<input class="input" id="login-user" name="username" autocomplete="username" spellcheck="false"></div>' +
			'<div class="field"><label for="login-password">Password</label>' +
			'<input class="input" id="login-password" name="password" type="password" autocomplete="current-password"></div>' +
			'<div class="form-error" id="login-error"></div>' +
			'<div class="dialog-actions"><button type="button" class="btn" data-close>Cancel</button>' +
			'<button type="submit" class="btn btn-primary" id="login-submit">Sign in</button></div>' +
			"</form>"
		);

		var form = document.getElementById("login-form");
		var errorElement = document.getElementById("login-error");
		var submitButton = document.getElementById("login-submit");
		var userInput = document.getElementById("login-user");

		userInput.value = state.username || "";

		form.addEventListener("submit", function (event) {
			event.preventDefault();

			var username = userInput.value.trim();
			var password = document.getElementById("login-password").value;

			if (!username || !password) {
				errorElement.textContent = "Enter both a username and a password.";
				return;
			}

			errorElement.textContent = "";
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
					renderTopbar();
					renderSummary();
					renderListing();
					renderFooter();
					toast("success", "Signed in as " + state.username);
				})
				.catch(function (error) {
					errorElement.textContent = error.message;
				})
				.finally(function () {
					submitButton.disabled = false;
					submitButton.textContent = "Sign in";
				});
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
				renderTopbar();
				renderSummary();
				renderListing();
				renderFooter();
				toast("success", "Signed out.");
			});
	}

	function openModal(html, className) {
		closeModal();

		modalRoot.innerHTML =
			'<div class="overlay" data-overlay><div class="dialog ' + (className || "") + '" role="dialog" aria-modal="true">' + html + "</div></div>";

		document.body.style.overflow = "hidden";

		var overlay = modalRoot.querySelector("[data-overlay]");

		overlay.addEventListener("mousedown", function (event) {
			if (event.target === overlay) {
				closeModal();
			}
		});

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
		document.body.style.overflow = "";
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

	function send(url, body, message, errorElement) {
		errorElement.textContent = "";

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

				errorElement.textContent = error.message;
			});
	}

	function openMkdir() {
		if (!state.authenticated) {
			openLogin("Sign in to create folders.");
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
					error.textContent = "Enter a folder name.";
					return;
				}

				send("/@next-index/api/mkdir", { path: state.path, name: name }, "Created folder \u201c" + name + "\u201d", error);
			}
		});
	}

	function openRename(entry) {
		if (!state.authenticated) {
			openLogin("Sign in to rename files.");
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
					error.textContent = "Enter a new name.";
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

		if (entry.kind === "file") {
			var dot = entry.name.lastIndexOf(".");

			if (dot > 0) {
				input.setSelectionRange(0, dot);
			}
		}
	}

	function openTransfer(kind, names) {
		if (!names.length) {
			return;
		}

		if (!state.authenticated) {
			openLogin("Sign in to " + kind + " files.");
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
					error.textContent = "Enter a destination path.";
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
			openLogin("Sign in to delete files.");
			return;
		}

		var single = names.length === 1;
		var entry = single ? state.entries.filter(function (item) {
			return item.name === names[0];
		})[0] : null;
		var type = entry ? typeOf(entry) : null;

		var preview = names
			.slice(0, 4)
			.map(function (name) {
				return "<span>" + esc(name) + "</span>";
			})
			.join("");

		if (names.length > 4) {
			preview += "<span>+" + (names.length - 4) + " more</span>";
		}

		openModal(
			'<div class="dialog-head"><div><h2>Delete ' + (single ? (entry && entry.kind === "dir" ? "folder" : "file") : names.length + " items") + "?</h2></div>" +
			'<button type="button" class="icon-btn sm" data-close aria-label="Close">' + icon("x") + "</button></div>" +
			'<p class="sub">This action cannot be undone.</p>' +
			'<div class="delete-target">' + (type ? '<span class="entry-icon ' + type[1] + '">' + icon(type[0]) + "</span>" : "") + preview + "</div>" +
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

	function openUpload(items) {
		if (!state.writable) {
			toast("error", "Write access is disabled. Run `next-index config -P` on the server to enable it.");
			return;
		}

		if (!state.authenticated) {
			openLogin("Sign in to upload files.");
			return;
		}

		state.uploads = items ? items.slice() : [];
		ensuredDirectories = {};

		openModal(
			'<div class="dialog-head"><h2>Upload files</h2>' +
			'<button type="button" class="icon-btn sm" data-close aria-label="Close">' + icon("x") + "</button></div>" +
			'<p class="sub">Files go to <b>' + esc(state.path) + "</b></p>" +
			'<div class="dropzone" id="dropzone">' + icon("upload") +
			"<div><b>Drop files or folders here</b></div>" +
			'<span>or <button type="button" class="link-btn" id="pick-files">choose files</button> · <button type="button" class="link-btn" id="pick-folder">choose a folder</button></span>' +
			"<span>" + (state.maxUploadMB > 0 ? "Up to " + state.maxUploadMB + " MB per upload" : "No upload limit") + "</span></div>" +
			'<input type="file" id="file-input" multiple hidden>' +
			'<input type="file" id="folder-input" webkitdirectory hidden>' +
			'<div class="file-list" id="file-list"></div>' +
			'<div class="upload-meta"><label class="checkbox"><input type="checkbox" id="overwrite-checkbox"> Replace existing files</label>' +
			'<span id="upload-summary"></span></div>' +
			'<div class="dialog-actions"><button type="button" class="btn" data-close>Cancel</button>' +
			'<button type="button" class="btn btn-primary" id="start-upload" disabled>Upload</button></div>',
			"wide"
		);

		var dropzone = document.getElementById("dropzone");
		var fileInput = document.getElementById("file-input");
		var folderInput = document.getElementById("folder-input");
		var fileList = document.getElementById("file-list");
		var startButton = document.getElementById("start-upload");

		dropzone.addEventListener("click", function () {
			fileInput.click();
		});

		document.getElementById("pick-files").addEventListener("click", function (event) {
			event.stopPropagation();
			fileInput.click();
		});

		document.getElementById("pick-folder").addEventListener("click", function (event) {
			event.stopPropagation();
			folderInput.click();
		});

		dropzone.addEventListener("dragover", function (event) {
			event.preventDefault();
			dropzone.classList.add("dragging");
		});

		dropzone.addEventListener("dragleave", function () {
			dropzone.classList.remove("dragging");
		});

		dropzone.addEventListener("drop", function (event) {
			event.preventDefault();
			event.stopPropagation();
			dropzone.classList.remove("dragging");

			itemsFromDataTransfer(event.dataTransfer).then(function (items) {
				addUploads(items);
			});
		});

		fileInput.addEventListener("change", function () {
			addUploads(filesToItems(fileInput.files));
			fileInput.value = "";
		});

		folderInput.addEventListener("change", function () {
			addUploads(filesToItems(folderInput.files));
			folderInput.value = "";
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

		renderUploadFiles();

		function addUploads(newItems) {
			if (!newItems || newItems.length === 0) {
				return;
			}

			newItems.forEach(function (item) {
				state.uploads.push(item);
			});

			renderUploadFiles();
		}
	}

	function filesToItems(files) {
		return Array.prototype.map.call(files || [], function (file) {
			var relative = file.webkitRelativePath || "";
			var slash = relative.lastIndexOf("/");

			return {
				file: file,
				dir: slash > 0 ? relative.slice(0, slash) : ""
			};
		});
	}

	function itemsFromDataTransfer(dataTransfer) {
		if (!dataTransfer) {
			return Promise.resolve([]);
		}

		var items = dataTransfer.items ? Array.prototype.slice.call(dataTransfer.items) : [];
		var entries = [];

		items.forEach(function (item) {
			if (item.kind !== "file" || !item.webkitGetAsEntry) {
				return;
			}

			var entry = item.webkitGetAsEntry();

			if (entry) {
				entries.push(entry);
			}
		});

		if (entries.length === 0) {
			return Promise.resolve(filesToItems(dataTransfer.files));
		}

		var collected = [];

		return walkEntries(entries, "").then(function () {
			return collected;
		});

		function walkEntries(entryList, baseDirectory) {
			return Promise.all(
				entryList.map(function (entry) {
					return new Promise(function (resolve) {
						if (entry.isFile) {
							entry.file(
								function (file) {
									collected.push({ file: file, dir: baseDirectory });
									resolve();
								},
								function () {
									resolve();
								}
							);
							return;
						}

						if (entry.isDirectory) {
							var reader = entry.createReader();
							var directory = baseDirectory ? baseDirectory + "/" + entry.name : entry.name;
							var readNext = function () {
								reader.readEntries(
									function (children) {
										if (children.length === 0) {
											resolve();
											return;
										}

										walkEntries(children, directory).then(readNext);
									},
									function () {
										resolve();
									}
								);
							};

							readNext();
							return;
						}

						resolve();
					});
				})
			);
		}
	}

	function joinPath(base, name) {
		if (!base.endsWith("/")) {
			base += "/";
		}

		return base + name + "/";
	}

	async function ensureDirectory(relativeDirectory) {
		if (!relativeDirectory) {
			return state.path;
		}

		var segments = relativeDirectory.split("/").filter(Boolean);
		var current = state.path;
		var relative = "";

		for (var index = 0; index < segments.length; index++) {
			var segment = segments[index];
			relative += (relative ? "/" : "") + segment;

			if (!ensuredDirectories[relative]) {
				try {
					await api("/@next-index/api/mkdir", {
						method: "POST",
						body: JSON.stringify({ path: current, name: segment })
					});
				} catch (error) {
					if (error.status !== 409) {
						throw error;
					}
				}

				ensuredDirectories[relative] = true;
			}

			current = joinPath(current, segment);
		}

		return current;
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
				var label = (item.dir ? item.dir + "/" : "") + item.file.name;

				return (
					'<div class="file-row" data-index="' + index + '">' +
					'<span class="fname" title="' + esc(label) + '">' + esc(label) + "</span>" +
					'<span class="fsize">' + formatSize(item.file.size) + "</span>" +
					'<div class="file-progress"><span></span></div>' +
					'<button type="button" class="row-action" data-remove="' + index + '" title="Remove" aria-label="Remove">' + icon("x") + "</button>" +
					"</div>"
				);
			})
			.join("");

		var total = state.uploads.reduce(function (sum, item) {
			return sum + item.file.size;
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

		var startButton = document.getElementById("start-upload");
		var overwriteCheckbox = document.getElementById("overwrite-checkbox");
		var overwrite = overwriteCheckbox ? overwriteCheckbox.checked : false;

		renderUploadFiles();

		var success = 0;
		var failed = 0;

		var chain = Promise.resolve();

		state.uploads.forEach(function (item, index) {
			chain = chain.then(function () {
				var row = document.querySelector('.file-row[data-index="' + index + '"]');
				var progress = row ? row.querySelector(".file-progress span") : null;
				var label = (item.dir ? item.dir + "/" : "") + item.file.name;

				return ensureDirectory(item.dir)
					.then(function (targetPath) {
						return uploadFile(item.file, targetPath, overwrite, function (ratio) {
							if (progress) {
								progress.style.width = Math.round(ratio * 100) + "%";
							}
						});
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
					})
					.catch(function (error) {
						failed++;
						if (row) {
							row.classList.add("failed");
						}
						if (progress) {
							progress.style.width = "100%";
						}
						toast("error", label + ": " + error.message);
					});
			});
		});

		chain
			.then(function () {
				state.uploading = false;
				state.uploads = [];
				startButton.disabled = true;
				startButton.textContent = "Upload";
				return refresh();
			})
			.then(function () {
				closeModal();

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
			var query = "?path=" + encodeURIComponent(targetPath) + (overwrite ? "&overwrite=1" : "");

			request.open("POST", "/@next-index/api/upload" + query);
			request.withCredentials = true;

			request.upload.addEventListener("progress", function (event) {
				if (event.lengthComputable && onProgress) {
					onProgress(event.loaded / event.total);
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
					resolve(data);
					return;
				}

				var error = new Error(data.error || "upload failed (" + request.status + ")");
				error.status = request.status;
				reject(error);
			});

			request.addEventListener("error", function () {
				reject(new Error("network error"));
			});

			var form = new FormData();
			form.append("file", file, file.name);
			request.send(form);
		});
	}

	var dragDepth = 0;
	var dropOverlay = null;

	function bindDropEvents() {
		window.addEventListener("dragenter", function (event) {
			if (!hasFiles(event)) {
				return;
			}

			event.preventDefault();
			dragDepth++;

			if (state.writable && state.authenticated) {
				showDropOverlay();
			}
		});

		window.addEventListener("dragover", function (event) {
			if (hasFiles(event)) {
				event.preventDefault();
			}
		});

		window.addEventListener("dragleave", function () {
			dragDepth = Math.max(0, dragDepth - 1);

			if (dragDepth === 0) {
				hideDropOverlay();
			}
		});

		window.addEventListener("drop", function (event) {
			if (!hasFiles(event)) {
				return;
			}

			event.preventDefault();
			dragDepth = 0;
			hideDropOverlay();

			if (!state.writable || !state.authenticated) {
				openLogin("Sign in to upload files.");
				return;
			}

			itemsFromDataTransfer(event.dataTransfer).then(function (items) {
				if (items.length > 0) {
					openUpload(items);
				}
			});
		});
	}

	function hasFiles(event) {
		return !!event.dataTransfer && Array.prototype.indexOf.call(event.dataTransfer.types, "Files") !== -1;
	}

	function showDropOverlay() {
		if (dropOverlay) {
			return;
		}

		dropOverlay = document.createElement("div");
		dropOverlay.className = "drop-overlay";
		dropOverlay.innerHTML =
			'<div class="drop-overlay-inner">' + icon("upload") + "<strong>Drop files or folders to upload</strong><span>They will be added to this folder</span></div>";
		document.body.appendChild(dropOverlay);
	}

	function hideDropOverlay() {
		if (dropOverlay) {
			dropOverlay.remove();
			dropOverlay = null;
		}
	}
})();
