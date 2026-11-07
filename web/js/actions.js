import { api, handleError, refresh, send } from "./api.js";
import { currentTheme, esc, formatFull, formatSize, icon, selected, state, typeOf, visibleEntries } from "./core.js";
import { renderFooter, renderListing, renderSummary, renderTopbar } from "./render.js";
import { closeModal, formDialog, openModal, toast } from "./ui.js";
import { openUpload } from "./upload.js";

export function handleAction(action, name) {
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

	if (action === "details") {
		openDetails(entry);
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
export function toggleSelect(name) {
	if (state.selection[name]) {
		delete state.selection[name];
	} else {
		state.selection[name] = true;
	}

	renderSummary();
	renderListing();
}
export function toggleSelectAll() {
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
export function toggleSort(key) {
	if (state.sort.key === key) {
		state.sort.dir *= -1;
	} else {
		state.sort = { key: key, dir: key === "mod" ? -1 : 1 };
	}

	localStorage.setItem("next-index-sort", JSON.stringify(state.sort));
	renderListing();
}
export function setView(view) {
	state.view = view === "grid" ? "grid" : "list";
	localStorage.setItem("next-index-view", state.view);
	renderSummary();
	renderListing();
}
export function toggleTheme() {
	state.theme = currentTheme() === "dark" ? "light" : "dark";
	document.documentElement.dataset.theme = state.theme;
	localStorage.setItem("next-index-theme", state.theme);
	renderTopbar();
}
export function openLogin(message) {
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
export function logout() {
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
export function openMkdir() {
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
function openDetails(entry) {
	var rows = [
		["Name", esc(entry.name)],
		["Kind", entry.kind === "dir" ? "Folder" : entry.ext ? entry.ext.toUpperCase() + " file" : "File"],
		["Size", entry.kind === "dir" ? "\u2014" : esc(formatSize(entry.size)) + " <span class=\"muted\">(" + entry.size + " bytes)</span>"],
		["Modified", esc(formatFull(entry.mod))],
		["Location", esc(state.path + entry.name)]
	];

	if (entry.link && entry.target) {
		rows.push(["Links to", esc(entry.target)]);
	}

	var body = rows.map(function (row) {
		return "<div><dt>" + row[0] + "</dt><dd>" + row[1] + "</dd></div>";
	}).join("");

	openModal(
		'<div class="dialog-head"><div><h2>' + esc(entry.name) + "</h2></div>" +
		'<button type="button" class="icon-btn sm" data-close aria-label="Close">' + icon("x") + "</button></div>" +
		'<dl class="detail-list">' + body + "</dl>" +
		'<div class="dialog-actions"><button type="button" class="btn" data-close>Close</button></div>'
	);
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
