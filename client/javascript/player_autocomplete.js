/**
 * Provide autocomplete for names via /search endpoint
 */

if (undefined === ld2l) {
	var ld2l = {};
}

ld2l.inAutocomplete = false;

/**
 * Create name autocomplete that'll populate an input text field appropriately
 */
ld2l.initAutocomplete = function(elem) {
	var jElem = $(elem);

	jElem.on('keyup', function() {
		// Don't autocomplete when we expect lots of entries
		if (jElem.val().length <= 2)
			return;

		if (!ld2l.inAutocomplete) {
			ld2l.inAutocomplete = true;
			$.ajax({
				url : '/search',
				data : {
					key : jElem.val()
				},
				method : 'POST',
				dataType : 'json',
				accepts : 'application/json'
			}).done(function(data, status, xhr) {
				ld2l.inAutocomplete = false;

				var results = data.search;
				var position = jElem.position();

				ld2l.showMenu(null, {
					clientX : position.left,
					clientY : position.top + jElem.outerHeight(),
					stopPropagation : function() {}
				});

				results.forEach(function(v, k) {
					var newDiv = $(document.createElement('div'));
					newDiv.addClass('ld2l-player');
					newDiv.html(
						'<img src="'+v.avatar+'" /><span>'+v.display_name+'</span>'
					);

					ld2l.addMenuItem(newDiv, function() {
						jElem.val(v.display_name);
						jElem.data('steamid', v.steamid);
					})
				});
			});
		}
	});
}

// Initialize everything of the "ld2l-name-autocomplete" class on load
$(document).ready(function() {
	// Why does jQuery continue to have each's arguments backwards relative to js spec
	$('.ld2l-name-autocomplete').each(function(k, v) {
		ld2l.initAutocomplete(v)
	});
})
