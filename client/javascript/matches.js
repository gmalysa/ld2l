/**
 * Convert hero, player, and items to their data value from jquery before submitting
 */

if (undefined === ld2l) {
	var ld2l = {};
}

/**
 * Process results for match details submission
 * Everything about this makes me hate jquery
 */
$(document).ready(function() {
	$('form').each(function(k, form) {
		var hero = $('input[name="hero"]');
		var player = $('input[name="steamid"]');
		var item = $('input[name="items"]');

		$(form).submit(function(evt) {
			hero.each(function(k, v) {
				v = $(v);
				if (isNaN(parseInt(v.val()))) {
					v.val(v.data('id'));
				}
			});

			player.each(function(k, v) {
				v = $(v);
				if (undefined !== v.data('steamid')) {
					v.val(v.data('steamid'));
				}
			});

			item.each(function(k, v) {
				v = $(v);
				if (v.data('id')) {
					v.val(v.data('id'));
				}
			});
		});
	});
});

/**
 * Process form for submitting roster
 */
ld2l.submitRoster = function(e) {
	var standin = $('#standin');
	console.log(standin);
	console.log(standin.data());
	if (standin.data('steamid')) {
		standin.val(standin.data('steamid'));
	}
};

$(document).ready(function() {
	$('#rosterForm').submit(ld2l.submitRoster);
});
