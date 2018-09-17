/**
 * UI support for lobby management
 */

if (undefined === ld2l) {
	var ld2l = {};
}

ld2l.inhouseQueue = {
	socket : null,
	queue : [],
	steamid : '',
	players : [],

	setIdentity : function(id) {
		this.steamid = id;
	},

	addPlayer : function(player) {
		this.queue.push(player);
		if (this.queue.length == 1) {
			$('#inhouseQueue').html('');
		}
		dust.render('autocomplete', player, function(err, out) {
			$('#inhouseQueue').append(out);
		});
	},

	removePlayer : function(player) {
		this.queue = _.reject(this.queue, function(v) {
			return v.steamid == player.steamid;
		});

		$('#inhouseQueue > div[data-steamid="'+player.steamid+'"]').detach();

		if (this.queue.length == 0) {
			$('#inhouseQueue').html('Queue is currently empty.');
		}
	},

	clearQueue : function() {
		$('#inhouseQueue').html('Queue is currently empty.');
		$('#queueMe').css('display', '');
		$('#leaveQueue').css('display', 'none');
	},

	queueMe : function() {
		$.ajax({
			url : '/lobbies/queue',
			method : 'POST',
			accepts : 'application/json'
		}).done(function(data, status, xhr) {
			if (data.success) {
				$('#queueMe').css('display', 'none');
				$('#leaveQueue').css('display', '');
			}
		});
	},

	leaveQueue : function() {
		$.ajax({
			url : '/lobbies/leaveQueue',
			method : 'POST',
			accepts : 'application/json'
		}).done(function(data, status, xhr) {
			if (data.success) {
				$('#queueMe').css('display', '');
				$('#leaveQueue').css('display', 'none');
			}
		});
	},

	doReadyCheck : function(data) {
		dust.render('readycheck', data, function(err, out) {
			$('#inhouseConfig').html(out);
			$('#inhouseConfig').css('display', 'flex');

			var ping = new Audio('https://d1u5p3l4wpay3k.cloudfront.net/dota2_gamepedia/b/b1/Scan.mp3');
			ping.volume = 0.3;
			ping.play();
		});
	},

	iAmReady : function(elem) {
		this.socket.emit('ready');
		$(elem).prop('disabled', true);
	},

	markReady : function(steamid) {
		$('div[data-steamid="'+steamid+'"]')
			.children('.ready')
			.css('display', 'block');
	},

	readyCheckFailed : function() {
		dust.render('readycheck_failed', {}, function(err, out) {
			$('#inhouseConfig').html(out);
			$('#inhouseConfig').css('display', 'flex');
		});
	},

	clearPrompt : function() {
		$('#inhouseConfig').css('display', 'none');
	},

	startMatchConfig : function(data) {
		this.players = data.players;

		dust.render('matchconfig', {
			players : data.players,
			captains : data.captains,
		}, function(err, out) {
			$('#inhouseConfig').html(out);
			$('#inhouseConfig').css('display', 'flex');

			// Add pick dummies
			var counter = 0;
			_.each(data.pickOrder, function(v) {
				dust.render('pick_dummy', {pick : counter}, function(err, out) {
					$('div[data-side="'+v+'"]').append(out);

					if (0 == counter) {
						$('div[data-pick="0"]').addClass('active');
					}
				});
				counter += 1;
			});
		});
	},

	pickHandler : function(data) {
		var playerDiv = $('div[data-steamid="'+data.steamid+'"]');
		playerDiv.detach();

		var slot = $('div[data-pick="'+data.pick+'"]');
		slot.removeClass('ld2l-player-dummy active');
		slot.html(playerDiv);

		var nextSlot = $('div[data-pick="'+(data.pick+1)+'"]');
		if (nextSlot.length > 0) {
			nextSlot.addClass('active');
		}
	},

	turn : function(data) {
		if (data.steamid == this.steamid) {
			$('#yourTurn').css('display', 'block');
		}
		else {
			$('#yourTurn').css('display', 'none');
		}
	},

	launch : function(data) {
		dust.render('lobby_launch', data, function(err, out) {
			$('.ld2l-config-container').append(out);
		});
	},

	pickPlayer : function(elem) {
		console.log('Picked '+elem.dataset.steamid);
		this.socket.emit('pick', {
			steamid : elem.dataset.steamid
		});
	},

	clearConfig : function() {
		this.clearPrompt();
	}

};

$(window).load(function() {
	ld2l.inhouseQueue.socket = io('/queue');

	ld2l.inhouseQueue.socket.on('addPlayer', function(data) {
		console.log('Add a player');
		console.log(data);
		ld2l.inhouseQueue.addPlayer(data);
	});

	ld2l.inhouseQueue.socket.on('removePlayer', function(data) {
		console.log('Remove a player');
		console.log(data);
		ld2l.inhouseQueue.removePlayer(data);
	});

	ld2l.inhouseQueue.socket.on('clearQueue', function() {
		console.log('Inhouse queue reset');
		ld2l.inhouseQueue.clearQueue();
	});

	ld2l.inhouseQueue.socket.on('identity', function(data) {
		console.log('Setting id to '+data.steamid);
		ld2l.inhouseQueue.setIdentity(data.steamid);
	});

	ld2l.inhouseQueue.socket.on('readyCheck', function(data) {
		console.log('Ready check starting');
		ld2l.inhouseQueue.doReadyCheck(data);
	});

	ld2l.inhouseQueue.socket.on('markReady', function(data) {
		console.log('Player '+data.steamid+' ready');
		ld2l.inhouseQueue.markReady(data.steamid);
	});

	ld2l.inhouseQueue.socket.on('readyCheckFailed', function() {
		console.log('Ready check failed.');
		ld2l.inhouseQueue.readyCheckFailed();
	});

	ld2l.inhouseQueue.socket.on('configStart', function(data) {
		console.log('Inhouse config start');
		console.log(data);
		ld2l.inhouseQueue.startMatchConfig(data);
	});

	ld2l.inhouseQueue.socket.on('pick', function(data) {
		console.log(data.steamid+' was picked '+data.pick);
		ld2l.inhouseQueue.pickHandler(data);
	});

	ld2l.inhouseQueue.socket.on('turn', function(data) {
		console.log('New turn: '+data.steamid);
		ld2l.inhouseQueue.turn(data);
	});

	ld2l.inhouseQueue.socket.on('launch', function(data) {
		console.log('Lobby was launched');
		ld2l.inhouseQueue.launch(data);
	});
});

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
			def.reject();
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
