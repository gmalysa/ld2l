/**
 * Provide autocomplete for things on the match details entry page
 * @todo This struggles with people removing the middle contents of a csv. Very tedious to fix
 *       without a more complex map of entries that is used
 * @todo make csv support/encoding optional and controlled by params
 */

if (undefined === ld2l) {
	var ld2l = {};
}

ld2l.inAutocomplete = false;
ld2l.autocompleteResults = [];

ld2l.autocomplete = function(elem, params) {
	var jElem = $(elem);

	jElem.on('keydown', function(evt) {
		// Don't autocomplete when we expect lots of entries
		if (jElem.val().length <= 2)
			return;

		console.log(ld2l.autocompleteResults.length);
		console.log(evt.keyCode);

		// If we have results and we're tabbing, select that result
		if (evt.keyCode == 9) {
			if (ld2l.autocompleteResults.length) {
				ld2l.autocompleteResults[0].jquery.click();
				evt.preventDefault();
			}
			return;
		}

		// Split on commas and autocomplete the last one
		var contents = jElem.val();
		var pieces = contents.split(',');

		var dataContents = jElem.data(params.data_key)+'';
		var dataPieces = dataContents.split(',');

		if (!ld2l.inAutocomplete) {
			ld2l.inAutocomplete = true;
			$.ajax({
				url : params.url,
				data : {
					key : pieces[pieces.length-1]
				},
				method : 'POST',
				dataType : 'json',
				accepts : 'application/json'
			}).done(function(data, status, xhr) {
				ld2l.inAutocomplete = false;

				var results = data.search;
				var position = jElem.position();

				// Reset the menu based on this input box
				ld2l.showMenu(null, {
					clientX : position.left,
					clientY : position.top + jElem.outerHeight(),
					stopPropagation : function() {}
				});

				ld2l.autocompleteResults = results;

				// All all partial matches, using dust to render each one
				results.forEach(function(v, k) {
					dust.render(params.template, v, function(err, out) {
						v.jquery = ld2l.addMenuItem(out, function() {
							// Reconstruct the contents of both as a csv
							pieces[pieces.length-1] = v[params.display_key];
							jElem.val(pieces.join(','));
							dataPieces[pieces.length-1] = v[params.data_key];
							jElem.data(params.data_key, dataPieces.join(','));

							jElem.focus();
							ld2l.autocompleteResults = [];
						});
					});
				});
			});
		}
	});
}

// Initialize everything of the "ld2l-name-autocomplete" class on load for names
$(document).ready(function() {
	// Why does jQuery continue to have each's arguments backwards relative to js spec
	$('.ld2l-name-autocomplete').each(function(k, v) {
		ld2l.autocomplete(v, {
			url : '/search',
			template : 'autocomplete',
			display_key : 'display_name',
			data_key : 'steamid'
		})
	});
});

// Same but with heroes
$(document).ready(function() {
	$('.ld2l-hero-autocomplete').each(function(k, v) {
		ld2l.autocomplete(v, {
			url : '/heroes',
			template : 'herocomplete',
			display_key : 'localized_name',
			data_key : 'id'
		});
	});
});

// Same but with items
$(document).ready(function() {
	$('.ld2l-item-autocomplete').each(function(k, v) {
		ld2l.autocomplete(v, {
			url : '/items',
			template : 'itemcomplete',
			display_key : 'dname',
			data_key : 'id',
		});
	});
});
