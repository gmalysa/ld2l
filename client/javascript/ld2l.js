/**
 * Core LD2L functionality available on every page
 */

/**
 * Handle expanding/minimizing the sidebar menu for mobile/small layouts
 */
document.addEventListener('DOMContentLoaded', function() {
	var menu = document.getElementById('menu-link');
	menu.addEventListener('click', function() {
		document.getElementById('ld2l-layout').classList.toggle('active');
	});
});

// Main object that we store stuff on
var ld2l = {};

// Helpers for things we previously needed jquery for
ld2l.$ = {};

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
}
