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

		// If we have results and we're tabbing, select that result
		if (evt.keyCode == 9) {
			if (ld2l.autocompleteResults.length) {
				ld2l.$.click(ld2l.autocompleteResults[0].element);
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
			ld2l.$.ajax(params.url, {key : pieces[pieces.length-1]})
			.then(function(data) {
				console.log(data);
				ld2l.inAutocomplete = false;

				var results = data.search;
				ld2l.autocompleteResults = results;
				ld2l.showMenu(elem);

				// All all partial matches, using dust to render each one
				results.forEach(function(v, k) {
					dust.render(params.template, v, function(err, out) {
						v.element = ld2l.addMenuItem(out, function() {
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

// Initialize autocomplete functionality by class
ld2l.$.onReady(function() {
	document.querySelectorAll('.ld2l-name-autocomplete').forEach(function(v) {
		ld2l.autocomplete(v, {
			url : '/search',
			template : 'autocomplete',
			display_key : 'display_name',
			data_key : 'steamid'
		})
	});

	document.querySelectorAll('.ld2l-hero-autocomplete').forEach(function(v) {
		ld2l.autocomplete(v, {
			url : '/autocomplete/heroes',
			template : 'herocomplete',
			display_key : 'localized_name',
			data_key : 'id'
		});
	});

	document.querySelectorAll('.ld2l-item-autocomplete').forEach(function(v) {
		ld2l.autocomplete(v, {
			url : '/autocomplete/items',
			template : 'itemcomplete',
			display_key : 'dname',
			data_key : 'id',
		});
	});

	document.querySelectorAll('.ld2l-standin-autocomplete').forEach(function(v) {
		ld2l.autocomplete(v, {
			url : '/autocomplete/standins/'+v.dataset.season,
			template : 'autocomplete',
			display_key : 'display_name',
			data_key : 'steamid'
		});
	});
});
