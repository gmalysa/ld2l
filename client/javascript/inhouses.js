/**
 * UI support for inhouse queues
 * @todo Remove jquery dependency here
 */

if (undefined === ld2l) {
	var ld2l = {};
}

ld2l.inhouseQueue = {
	socket : null,
	queue : [],
	steamid : '',
	players : [],
	seasonId : 0,
	notificationsEnabled: false,

	setIdentity : function(id) {
		this.steamid = id;
	},

	addPlayer : function(player) {
		this.queue.push(player);
		if (this.queue.length == 1) {
			$('#inhouseQueue').html('');
		}
		dust.render('inhouse_player', player, function(err, out) {
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
		this.queue = [];
	},

	queueMe : function() {
		$.ajax({
			url : '/seasons/'+this.seasonId+'/inhouses/queue',
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
			url : '/seasons/'+this.seasonId+'/inhouses/leaveQueue',
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
		ld2l.$.showModal('readycheck', data);

		var ping = new Audio('http://ld2l.gg/static/Scan_clear.mp3');
		ping.volume = 0.3;
		ping.play();
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
		ld2l.$.showModal('readycheck_failed', {});
	},

	startMatchConfig : function(data) {
		this.players = data.players;

		ld2l.$.showModal('matchconfig', {
			players : data.players,
			captains : data.captains,
		}, function() {
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
		var playerDiv = $('div[data-picksteamid="'+data.steamid+'"]');
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
			var modal = document.getElementById('modal-content');
			modal.innerHTML = modal.innerHTML + out;
		});
	},

	pickPlayer : function(elem) {
		console.log('Picked '+elem.dataset.picksteamid);
		this.socket.emit('pick', {
			steamid : elem.dataset.picksteamid
		});
	},

	enableNotifications : function () {
		if ("Notification" in window) {
			 if (Notification.permission !== 'denied') {
				Notification.requestPermission(function (permission) {
					if (permission === "granted") {
						ld2l.inhouseQueue.notificationsEnabled = true;
					}
				});
			}
			 else if (Notification.permission === 'granted') {
				ld2l.inhouseQueue.notificationsEnabled = true;
			 }
		}
	},

	sendNotification : function (title, body, icon) {
		if (this.notificationsEnabled) {
			if (ld2l.inhouseQueue.queue.length >= 10 ) {
				new Notification(title, { body: 'Queue is full!', icon: 'https://ld2l.gg/static/images/ld2l-logo.png'});
				new Audio(`https://ld2l.gg/static/Scan_clear.mp3`).play()
			}
			else {
				new Notification(title, { body, icon });
			}
		}
	}
};

ld2l.$.onReady(function() {

	ld2l.inhouseQueue.enableNotifications()

	var seasonId = document.getElementById('inhouseData').dataset.season;
	ld2l.inhouseQueue.seasonId = seasonId;
	ld2l.inhouseQueue.socket = io('/queue-'+seasonId, {transports : ['websocket']});

	ld2l.inhouseQueue.socket.on('addPlayer', function(data) {
		console.log('Add a player');
		console.log(data);
		ld2l.inhouseQueue.addPlayer(data);

		if (data.display_name) {
			ld2l.inhouseQueue.sendNotification(
				'LD2L inhouses',
				`${data.display_name} joined the queue ${ld2l.inhouseQueue.queue.length} / 10`,
				data.avatar);
		}
		else {
			ld2l.inhouseQueue.sendNotification('LD2L inhouses', `players in the queue ${ld2l.inhouseQueue.queue.length} / 10`);
		}

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
