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

document.addEventListener('DOMContentLoaded', function() {
	ld2l.popupMenu = {
		_menuChecks : [],
		popper : null,
		menuWrapper : document.getElementById('float-menu'),
		menuList : null
	};
});

ld2l.clearMenu = function() {
	document.body.removeEventListener('click', ld2l.clearMenu);
	ld2l.popupMenu.menuWrapper.style.display = 'none';
	ld2l.popupMenu.popper.destroy();
	ld2l.popupMenu.popper = null;
};

ld2l.showMenu = function(elem) {
	ld2l.popupMenu._menuChecks.forEach(function(v) {
		v(elem);
	});

	ld2l.popupMenu.menuList = document.createElement('ul');
	ld2l.popupMenu.menuList.setAttribute('id', 'float-menu-list');
	$(ld2l.popupMenu.menuList).addClass('pure-menu-list');

	ld2l.popupMenu.menuWrapper.style.display = 'block';
	ld2l.popupMenu.menuWrapper.innerHTML = '';
	ld2l.popupMenu.menuWrapper.appendChild(ld2l.popupMenu.menuList);

	if (ld2l.popupMenu.popper)
		ld2l.popupMenu.popper.destroy();

	ld2l.popupMenu.popper = new Popper(
		elem,
		ld2l.popupMenu.menuWrapper,
		{placement : 'bottom-start'}
	);

	document.body.addEventListener('click', ld2l.clearMenu);
};

ld2l.registerMenuHandler = function(fn) {
	ld2l.popupMenu._menuChecks.push(fn);
};

ld2l.addMenuItem = function(text, action) {
	var item = document.createElement('li');
	$(item).addClass('pure-menu-item');
	ld2l.popupMenu.menuList.appendChild(item);

	var link = document.createElement('a');
	$(link).addClass('ld2l-menu-link');
	link.addEventListener('click', action);
	link.innerHTML = text;

	item.appendChild(link);
	return $(link);
}
