/**
 * Core LD2L functionality available on every page
 */

/**
 * Handle expanding/minimizing the sidebar menu for mobile/small layouts
 */
$(document).ready(function() {
	$('#menu-link').click(function() {
		$('#ld2l-layout').toggleClass('active');
	});
});

// Main object that we store stuff on
var ld2l = {};
