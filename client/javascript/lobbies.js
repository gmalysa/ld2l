/**
 * UI support for lobby management
 */

if (undefined === ld2l) {
	var ld2l = {};
}

/**
 * Helper function that creates a promise for resolving a player's name to steamid
 * based on the input element and associated data
 * @param[in] v The input element
 * @return Promise that will be resolved when the element has a steamid or rejected if
 *         one cannot be found
 */
ld2l.resolveName = function(v) {
	var jElem = $(v);
	var def = $.Deferred();

	if (jElem.data('steamid')) {
		def.resolve(jElem.data('steamid'));
	}
	else {
		if (jElem.val().length > 0) {
			$.ajax({
				url : '/search',
				data : {
					key : jElem.val()
				},
				method : 'POST',
				dataType : 'json',
				accepts : 'application/json'
			}).done(function(data, status, xhr) {
				var results = data.search;

				if (results.length != 1) {
					def.reject();
				}
				else {
					jElem.val(results[0].display_name);
					jElem.data('steamid', results[0].steamid);
					def.resolve(results[0].steamid);
				}
			});
		}
		else {
//			def.reject();
			def.resolve('12345768890');
		}
	}

	return def;
}

/**
 * UI callback when the create lobby button is pressed. Validate and forward to server
 * for sending to KBaaS
 */
ld2l.createLobby = function() {
	var radiant = $.map($('#radiant input[type="text"]'), ld2l.resolveName);
	var dire = $.map($('#dire input[type="text"]'), ld2l.resolveName);

	var radTeamPromise = $.Deferred();
	var direTeamPromise = $.Deferred();

	$.when.apply(null, radiant).done(function() {
		radTeamPromise.resolve(Array.prototype.slice.call(arguments));
	}).fail(function() {
		radTeamPromise.reject();
	});

	$.when.apply(null, dire).done(function() {
		direTeamPromise.resolve(Array.prototype.slice.call(arguments));
	}).fail(function() {
		direTeamPromise.reject();
	});

	$.when(radTeamPromise, direTeamPromise).done(function(radiant, dire) {
		console.log('Radiant players: '+radiant);
		console.log('Dire players: '+dire);

		var radiantCaptain = radiant[parseInt($('input[name="radiantCaptain"]').val())];
		var direCaptain = dire[parseInt($('input[name="direCaptain"]').val())];

		console.log('Radiant captain: '+radiantCaptain);
		console.log('Dire captain: '+direCaptain);

		$.ajax({
			url : '/lobbies/create',
			data : {lobby : JSON.stringify({
				teams : [{
					players : radiant,
					captain : radiantCaptain
				}, {
					players : dire,
					captain : direCaptain
				}]
			})},
			method : 'POST',
			dataType : 'json',
			accepts : 'application/json'
		}).done(function(data, status, xhr) {
			console.log(data);
		});
	}).fail(function() {
		console.log('Some players missing!');
	});
}
