#!/bin/sh
set -e
cd "$(dirname "$0")"

{
	echo '(function () {'
	echo '	"use strict";'
	for file in js/core.js js/ui.js js/api.js js/render.js js/actions.js js/upload.js js/main.js; do
		sed -e '/^import /d' -e 's/^export //' -e 's/^/\t/' -e 's/^\t$//' "$file"
		echo
	done
	echo '})();'
} > app.js

cat css/base.css css/chrome.css css/listing.css css/dialog.css css/feedback.css css/responsive.css > main.css
