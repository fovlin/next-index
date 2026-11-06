import { logout } from "./actions.js";
import { refresh } from "./api.js";
import { toast } from "./ui.js";

function readState() {
	try {
		return JSON.parse(document.getElementById("next-index-bootstrap").textContent);
	} catch (error) {
		return null;
	}
}

export var state = readState();

var parameters = new URLSearchParams(window.location.search);

var LOCALE = "en-US";

export var ensuredDirectories = {};

export function resetEnsuredDirectories() {
	ensuredDirectories = {};
}

if (state) {
	state.entries = Array.isArray(state.entries) ? state.entries : [];
	state.crumbs = Array.isArray(state.crumbs) ? state.crumbs : [];
	state.view = localStorage.getItem("next-index-view") === "grid" ? "grid" : "list";
	state.theme = localStorage.getItem("next-index-theme") === "light" ? "light" : "dark";

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

	document.documentElement.dataset.theme = state.theme;
}

var FOLDER = '<path d="M3.55 7.65 A2.4 2.4 0 0 1 5.95 5.25 h3.3 a2.1 2.1 0 0 1 1.68 .84 l.9 1.26 H17.95 a2.5 2.5 0 0 1 2.5 2.5 v6.9 A2.5 2.5 0 0 1 17.95 18.75 H5.95 a2.4 2.4 0 0 1 -2.4 -2.4 V7.65 Z"/>';

var ICONS = {
	parent: FOLDER + '<path d="M14.8 13H9.2" stroke-width="1.5"/><path d="m11.8 10.6-2.6 2.4 2.6 2.4" stroke-width="1.5"/>',
	layers: '<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5"/><path d="m3 16 9 5 9-5"/>',
	search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.2-3.2"/>',
	refresh: '<path d="M20 11a8 8 0 1 0-2.34 5.66"/><path d="M20 4v7h-7"/>',
	moon: '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5Z"/>',
	sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
	upload: '<path d="M12 16V4"/><path d="m7 9 5-5 5 5"/><path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>',
	folder: FOLDER,
	folderOpen: '<path d="M5.42 19.5 h11.9 a2 2 0 0 0 1.94 -1.5 l1.2 -5 A1.6 1.6 0 0 0 18.92 10.9 H7.92 a2 2 0 0 0 -1.94 1.5 L4.72 17.6 M5.42 19.5 a2 2 0 0 1 -2 -2 V6.1 a1.6 1.6 0 0 1 1.6 -1.6 h5.1 a2 2 0 0 1 1.6 .8 l1.2 1.6 h5.5 a1.6 1.6 0 0 1 1.6 1.6 v2.4"/>',
	folderPlus: FOLDER + '<path d="M12 10.5v5"/><path d="M9.5 13h5"/>',
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
export var topbar = document.getElementById("topbar");
export var main = document.getElementById("main");
export var footer = document.getElementById("footer");
export var toastRoot = document.getElementById("toast-root");
export var modalRoot = document.getElementById("modal-root");
main.innerHTML = '<div class="summary"><div class="stats" id="stats"></div><div class="summary-actions" id="summary-actions"></div></div><div class="card" id="listing"></div>';
export var summaryRoot = document.querySelector(".summary");
export var stats = document.getElementById("stats");
export var summaryActions = document.getElementById("summary-actions");
export var listing = document.getElementById("listing");
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
export function esc(value) {
	return String(value).replace(/[&<>"']/g, function (char) {
		return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char];
	});
}
export function icon(name, className) {
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
export function typeOf(entry) {
	var group = groupOf(entry);
	return TYPE_ICONS[group] || TYPE_ICONS.file;
}
export function formatSize(bytes) {
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
export function formatDate(unix) {
	return new Date(unix * 1000).toLocaleDateString(LOCALE, {
		year: "numeric",
		month: "2-digit",
		day: "2-digit"
	});
}
export function formatTime(unix) {
	return new Date(unix * 1000).toLocaleTimeString(LOCALE, {
		hour12: false
	});
}
export function formatFull(unix) {
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
export function visibleEntries() {
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
		var needle = state.query.toLowerCase();

		entries = entries.filter(function (entry) {
			return entry.name.toLowerCase().indexOf(needle) !== -1;
		});
	}

	return entries;
}
export function selected() {
	return Object.keys(state.selection).filter(function (name) {
		return state.selection[name];
	});
}
export function plural(count, singular, many) {
	return count === 1 ? singular : many;
}
export function joinPath(base, name) {
	if (!base.endsWith("/")) {
		base += "/";
	}

	return base + name + "/";
}
