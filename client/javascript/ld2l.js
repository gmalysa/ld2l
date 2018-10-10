/**
 * Core LD2L functionality available on every page
 */

// Main object that we store stuff on
var ld2l = {};

// Helpers for things we previously needed jquery for
ld2l.$ = {};

/**
 * Call a function when the DOM is ready or immediately if it already is
 * @param[in] f Function to call
 */
ld2l.$.onReady = function(f) {
	if (document.readyState != 'loading')
		f();
	else
		document.addEventListener('DOMContentLoaded', f);
};

/**
 * Make an AJAX call and parse the result for any global stuff we want to do
 * @param[in] string url The url to send the request to
 * @param[in] object data The data object, jsond
 * @param[in] (optional) object options Additional options for request
 * @return Promise with the response
 */
ld2l.$.ajax = function(url, data, options) {
	var args = _.extend({
		method : 'POST',
		credentials: 'same-origin',
		headers : {
			'Content-Type': 'application/json',
			'Accept' : 'application/json'
		},
		body : JSON.stringify(data)
	}, options || {});

	return fetch(url, args).then(function(r) { return r.json(); });
};

/**
 * Generate a click event on the given HTMLElement
 * @param[in] HTMLElement e Create a click on this element
 */
ld2l.$.click = function(e) {
	if (typeof MouseEvent == "function") {
		var evt = new MouseEvent("click", {
			view : window,
			bubbles : true,
			cancelable : true
		});
	}
	else {
		var evt = document.createEvent("MouseEvents");
		evt.initMouseEvent(
			"click",
			true, // canBubble
			true, // cancelable
			window,
			0, // detail
			0, // screenX
			0, // screenY
			0, // clientX
			0, // clientY
			false, // ctrl
			false, // alt
			false, // shift
			false, // meta
			0, // button
			null // eventTarget, null for click
		);
	}

	e.dispatchEvent(evt);
};

// Separate code that actually runs on every page instead of just lib things

/**
 * Handle expanding/minimizing the sidebar menu for mobile/small layouts
 */
ld2l.$.onReady(function() {
	var menu = document.getElementById('menu-link');
	menu.addEventListener('click', function() {
		document.getElementById('ld2l-layout').classList.toggle('active');
	});
});

