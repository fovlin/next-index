import { logout, openLogin, toggleTheme } from "./actions.js";
import { refresh } from "./api.js";
import { esc, footer, formatDate, formatFull, formatSize, formatTime, icon, listing, main, plural, selected, state, stats, summaryActions, summaryRoot, topbar, typeOf, visibleEntries } from "./core.js";
import { openUpload } from "./upload.js";

function selectMarkup(entry) {
	if (!state.selecting || entry.kind === "parent") {
		return "";
	}

	return '<input type="checkbox" data-select="' + esc(entry.name) + '"' + (state.selection[entry.name] ? " checked" : "") + ' aria-label="Select ' + esc(entry.name) + '">';
}
export function renderTopbar() {
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
		authMarkup = '<button class="btn" id="login-btn" title="Sign in" aria-label="Sign in">' + icon("login") + "<span>Sign in</span></button>";
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
		state.query = searchInput.value.trim();
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
export function renderSummary() {
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

	var names = selected();

	var tools = state.authenticated
		? '<button class="icon-btn" data-action="mkdir" title="New folder" aria-label="New folder">' + icon("folderPlus") + "</button>" +
			'<button class="icon-btn' + (state.selecting ? " active" : "") + '" data-action="toggle-selection" title="Select files" aria-label="Select files" aria-pressed="' + state.selecting + '">' + icon("select") + "</button>"
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
		tools +
		'<div class="segmented" role="group" aria-label="View mode">' +
		'<button data-view="list" class="' + (state.view === "list" ? "active" : "") + '" title="List view" aria-label="List view">' + icon("list") + "</button>" +
		'<button data-view="grid" class="' + (state.view === "grid" ? "active" : "") + '" title="Grid view" aria-label="Grid view">' + icon("grid") + "</button>" +
		"</div>";

	fitSummary();
}
export function fitSummary() {
	var overflowing = function () {
		return summaryRoot.scrollWidth > summaryRoot.clientWidth + 1;
	};

	summaryRoot.classList.remove("compact", "compact-tight");

	if (!overflowing()) {
		return;
	}

	summaryRoot.classList.add("compact");

	if (overflowing()) {
		summaryRoot.classList.add("compact-tight");
	}
}
export function renderListing() {
	var entries = visibleEntries();

	listing.classList.toggle("selecting", state.selecting);

	if (state.entries.length === 0) {
		listing.innerHTML =
			'<div class="empty"><div class="empty-icon">' + icon("folderOpen") + "</div>" +
			"<h2>This folder is empty</h2>" +
			"<p>Nothing here yet. Upload a file to get started.</p>" +
			'<div>' +
			'<button class="btn" data-action="back">' + icon("parent") + "<span>Back</span></button>" +
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

				var entry = state.entries.find(function (item) {
					return item.name === tile.dataset.name;
				});

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
function selectAllMarkup(entries) {
	var checked =
		entries.length > 0 &&
		entries.every(function (entry) {
			return state.selection[entry.name];
		});

	return '<input type="checkbox" id="select-all" aria-label="Select all"' + (checked ? " checked" : "") + ">";
}
function gridMarkup(entries) {
	var lastPage = state.parent.name === "/" ? "" : itemMarkup(state.parent);

	return (
		'<div class="grid">' + lastPage + entries.map(itemMarkup).join("") + "</div>"
	);
}
function rowMarkup(entry) {
	var type = typeOf(entry);
	var size = entry.kind === "file" ? formatSize(entry.size) : "—";
	var tag = state.selecting ? "div" : "a";
	var hrefAttr = state.selecting ? "" : ' href="' + esc(entry.href) + '"';

	return (
		'<tr' + (state.selection[entry.name] ? ' class="selected"' : "") + ' data-name="' + esc(entry.name) + '" data-href="' + esc(entry.href) + '">' +
		(state.selecting ? '<td class="col-select">' + selectMarkup(entry) + "</td>" : "") +
		"<td>" +
		'<' + tag + ' class="entry"' + hrefAttr + '>' +
		'<span class="entry-icon ' + type[1] + '">' + icon(type[0]) + "</span>" +
		'<span class="name-wrap"><span class="entry-name">' + nameMarkup(entry) + "</span>" +
		(entry.link ? '<span class="badge">link</span>' : "") +
		"</span>" +
		"</" + tag + ">" +
		"</td>" +
		'<td class="col-size size" title="' + (entry.kind === "file" ? entry.size + " bytes" : "") + '">' + size + "</td>" +
		'<td class="col-time time" title="' + esc(formatFull(entry.mod)) + '">' + esc(formatDate(entry.mod)) + '<small>' + esc(formatTime(entry.mod)) + '</small></td>' +
		'<td class="col-actions"><div class="row-actions">' + menuMarkup(entry) + "</div></td>" +
		"</tr>"
	);
}
function itemMarkup(entry) {
	var type = typeOf(entry);
	var tag = state.selecting ? "div" : "a";
	var hrefAttr = state.selecting ? "" : ' href="' + esc(entry.href) + '"';
	var menu = menuMarkup(entry);
	var thumb =
		entry.thumb && entry.kind === "file"
			? '<div class="thumb"><img src="' + esc(entry.href) + '" alt="" loading="lazy" decoding="async"></div>'
			: '<div class="thumb"><span class="entry-icon ' + type[1] + '">' + icon(type[0]) + "</span></div>";

	return (
		'<div class="tile' + (state.selection[entry.name] ? " selected" : "") + '" data-name="' + esc(entry.name) + '">' +
		(state.selecting ? '<span class="tile-select">' + selectMarkup(entry) + "</span>" : "") +
		'<' + tag + ' class="tile-main"' + hrefAttr + '>' +
		thumb +
		'<span class="tile-name" title="' + esc(entry.name) + '">' + esc(entry.name) + "</span>" +
		'<span class="tile-meta"><span>' + formatDate(entry.mod) + "</span><span>" + formatTime(entry.mod) + "</span></span>" +
		"</" + tag + ">" +
		(menu ? '<div class="tile-actions row-actions">' + menu + "</div>" : "") +
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
	if (state.selecting || entry.kind === "parent") {
		return "";
	}

	return '<button class="row-action" data-menu="' + esc(entry.name) + '" title="More" aria-label="More">' + icon("more") + "</button>";
}
export function renderFooter() {
	var status = state.authenticated ? '<span class="status-dot" title="Signed in"></span>' : '<span class="status-dot locked" title="Read only"></span>';
	var location;

	if (state.authenticated) {
		location = "signed in as: " + esc(state.username);
	} else if (state.writable) {
		location = "browsing is public · sign in to manage files";
	} else {
		location = "read only · uploads are disabled on this server";
	}

	footer.innerHTML =
		'<div class="footer-side">' + status + '<span class="mono">' + location + "</span></div>" +
		'<div class="footer-side"><span>' + esc(state.site || "NEXT_INDEX") + ' v' + esc(state.version) + '</span><span class="stat-dot"></span><span>' + state.entries.length + ' items</span><span class="stat-dot"></span><span>press <kbd>/</kbd> to search</span></div>';
}
