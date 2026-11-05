import { openLogin } from "./actions.js";
import { api, refresh, send } from "./api.js";
import { ensuredDirectories, esc, formatSize, icon, joinPath, plural, selected, state } from "./core.js";
import { closeModal, openModal, toast } from "./ui.js";

export function openUpload(items) {
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
export function filesToItems(files) {
	return Array.prototype.map.call(files || [], function (file) {
		var relative = file.webkitRelativePath || "";
		var slash = relative.lastIndexOf("/");

		return {
			file: file,
			dir: slash > 0 ? relative.slice(0, slash) : ""
		};
	});
}
export function itemsFromDataTransfer(dataTransfer) {
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
export async function ensureDirectory(relativeDirectory) {
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
export function renderUploadFiles() {
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
export function startUpload() {
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
export function uploadFile(file, targetPath, overwrite, onProgress) {
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
export var dragDepth = 0;
export var dropOverlay = null;
export function bindDropEvents() {
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
export function hasFiles(event) {
	return !!event.dataTransfer && Array.prototype.indexOf.call(event.dataTransfer.types, "Files") !== -1;
}
export function showDropOverlay() {
	if (dropOverlay) {
		return;
	}

	dropOverlay = document.createElement("div");
	dropOverlay.className = "drop-overlay";
	dropOverlay.innerHTML =
		'<div class="drop-overlay-inner">' + icon("upload") + "<strong>Drop files or folders to upload</strong><span>They will be added to this folder</span></div>";
	document.body.appendChild(dropOverlay);
}
export function hideDropOverlay() {
	if (dropOverlay) {
		dropOverlay.remove();
		dropOverlay = null;
	}
}
