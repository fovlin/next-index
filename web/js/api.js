import { openLogin } from "./actions.js";
import { state } from "./core.js";
import { renderFooter, renderListing, renderSummary, renderTopbar } from "./render.js";
import { closeModal, toast } from "./ui.js";

export function api(path, options) {
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
export function refresh() {
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
export function handleError(error) {
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
export function send(url, body, message, errorElement) {
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
