/**
 * Handle expanding/minimizing the sidebar menu for mobile/small layouts
 */
$(document).ready(function() {
	$('#menu-link').click(function() {
		$('#ld2l-layout').toggleClass('active');
	});
});

if (undefined === ld2l) {
	var ld2l = {};
}

ld2l._menuChecks = [];

ld2l.clearMenu = function() {
	$('#float-menu').css({display : 'none'});
	$('body').off('click');
};

ld2l.showMenu = function(elem, event) {
	var menu = $('#float-menu');
	menu.html('');

	ld2l._menuChecks.forEach(function(v) {
		v(elem, event);
	});

	menu.wrap('<ul class="pure-menu-list"></ul>');
	menu.css({
		top : event.clientY,
		left : event.clientX,
		display : 'block'
	});

	$('body').on('click', ld2l.clearMenu);
	event.stopPropagation();
};

ld2l.registerMenuHandler = function(fn) {
	ld2l._menuChecks.push(fn);
};

ld2l.addMenuItem = function(text, action) {
	var menu = $('#float-menu');
	var item = $(document.createElement('li'));
	item.addClass('pure-menu-item');
	menu.append(item);

	var link = $(document.createElement('a'));
	link.addClass('ld2l-menu-link');
	link.click(action);
	link.append(text);

	item.append(link);
}
