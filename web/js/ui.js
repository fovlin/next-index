import { esc, icon, modalRoot, toastRoot } from "./core.js";

export function openMenu(button) {
	closeMenu();

	var name = button.dataset.menu;
	var menu = document.createElement("div");

	menu.className = "menu";
	menu.id = "row-menu";
	menu.innerHTML =
		'<button type="button" data-action="details" data-name="' + esc(name) + '">' + icon("info") + "<span>Details</span></button>" +
		'<button type="button" data-action="rename" data-name="' + esc(name) + '">' + icon("pencil") + "<span>Rename</span></button>" +
		'<button type="button" data-action="move" data-name="' + esc(name) + '">' + icon("move") + "<span>Move</span></button>" +
		'<button type="button" data-action="copy" data-name="' + esc(name) + '">' + icon("copy") + "<span>Copy</span></button>" +
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
export function closeMenu() {
	var menu = document.getElementById("row-menu");

	if (menu) {
		menu.remove();
	}
}
export function toast(type, message) {
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
export function openModal(html, className) {
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
export function closeModal() {
	modalRoot.innerHTML = "";
	document.body.style.overflow = "";
}
export function formDialog(options) {
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
