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

/**
 * Show the modal dialog box with a dust template contents
 */
ld2l.$.showModal = function(template, context) {
	dust.render(template, context, function(err, out) {
		if (err) {
			console.log(err);
		}

		var modal = document.getElementById('modal');
		modal.innerHTML = out;
		modal.style.display = 'flex';
	});
}

/**
 * Hide the modal dialog box when we're done
 */
ld2l.$.hideModal = function() {
	var modal = document.getElementById('modal');
	modal.style.display = 'none';
}

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

ld2l._version = {
	version : 0,
	socket : null
};

/**
 * Handle client side versioning
 */
ld2l.$.onReady(function() {
	ld2l._version.socket = io();
	ld2l._version.socket.on('version', function(v) {
		console.log('Received version string '+v);
		if (0 == ld2l._version.version) {
			ld2l._version.version = v;
		}
		else {
			ld2l.$.showModal('newversion', {});
		}
	});
});

// Hovercard data is cached here and used to determine if we load more
ld2l._hover = {
	cache : {},
	current : null,
	fadeTimer : null
};

/**
 * Handle loading hovercard-like info boxes for things. The given element supplies
 * information about the hovercard via data attributes:
 * data-hovercard-type: 'player' or 'team'
 * data-hovercard-id: id of the item to look up
 * @param[in] elm The element for which hovercard data needs to be populated
 */
ld2l.loadHovercard = function(elem) {
	var type = elem.dataset.hovercardType;
	var id = elem.dataset.hovercardId;
	var cacheId = type+'-'+id;
	var hovercardWrapper = document.getElementById('hovercard');

	if (ld2l._hover.current)  {
		ld2l._hover.current.destroy();
		ld2l._hover.current = null;
	}

	if (ld2l._hover.fadeTimer) {
		clearTimeout(ld2l._hover.fadeTimer);
		ld2l._hover.fadeTimer = null;
	}

	ld2l._hover.current = new Popper(
		elem,
		hovercardWrapper,
		{ placement : 'right-start' }
	);

	hovercardWrapper.style.display = 'block';
	hovercardWrapper.innerHTML = 'Loading...';

	if (ld2l._hover.cache[cacheId] !== undefined) {
		hovercardWrapper.innerHTML = ld2l._hover.cache[cacheId];
		return;
	}

	ld2l._hover.cache[cacheId] = 'Loading...';

	ld2l.$.ajax('/hovercard', {
		type : type,
		id : id
	}).then(function(data) {
		dust.render(data.hoverTemplate, data.hoverData, function(err, out) {
			ld2l._hover.cache[cacheId] = out;
			hovercardWrapper.innerHTML = ld2l._hover.cache[cacheId];
		});
	});
}

/**
 * Prepare to hide hovercard, but if we move into the hovercard before the fade
 * time ends, don't hide it
 */
ld2l.hideHovercard = function() {
	if (!ld2l._hover.fadeTimer)
		ld2l._hover.fadeTimer = setTimeout(ld2l.actuallyHideHovercard, 500);
}

/**
 * Actually hide the hovercard
 */
ld2l.actuallyHideHovercard = function() {
	var hovercardWrapper = document.getElementById('hovercard');
	ld2l._hover.fadeTimer = null;
	hovercardWrapper.style.display = 'none';
	ld2l._hover.current.destroy();
	ld2l._hover.current = null;
}

/**
 * Cancel hover card fade if we move onto the hovercard itself
 */
ld2l.$.onReady(function() {
	var hovercardWrapper = document.getElementById('hovercard');
	hovercardWrapper.addEventListener('mouseenter', function(evt) {
		if (ld2l._hover.fadeTimer) {
			clearTimeout(ld2l._hover.fadeTimer);
			ld2l._hover.fadeTimer = null;
		}
	});
	hovercardWrapper.addEventListener('mouseleave', ld2l.hideHovercard);
});
