import { handleAction, openMkdir, setView, toggleSelect, toggleSelectAll, toggleSort } from "./actions.js";
import { listing, selected, state, summaryActions } from "./core.js";
import { fitSummary, renderCrumbs, renderFooter, renderListing, renderSummary, renderTopbar } from "./render.js";
import { closeMenu, closeModal, openMenu } from "./ui.js";
import { bindDropEvents, hideDropOverlay, openUpload } from "./upload.js";

if (state) {
	bindEvents();
	renderTopbar();
	renderCrumbs();
	renderSummary();
	renderListing();
	renderFooter();
}
function bindEvents() {
	window.addEventListener("resize", function () {
		fitSummary();
	});

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
			var target = event.target.closest("tr[data-name], .tile[data-name]");

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
			closeModal();
			hideDropOverlay();
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
