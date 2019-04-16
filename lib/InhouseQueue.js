/**
 * Interface used to queue for inhouses with a websocket based UI
 */

var _ = require('underscore');
var fl = require('flux-link');
var db = require('db-filters');
var randomstring = require('randomstring');

var mysql = require('../mysql');
var logger = require('../logger.js');

var lobbies = require('../lib/lobbies.js');
var MatchConfig = require('../lib/MatchConfig.js');

// Options to control code in debugging/live
const queueTarget = 10;
const skipReadyCheck = false;

// Inhouse queue states
const STATE_QUEUE = 0;
const STATE_READYCHECK = 1;
const STATE_CONFIGURING = 2;

var io = null;
var queues = {};

/**
 * Function for a module with access to the server instance to provide us with an io instance to
 * talk to users
 */
function setup(realio) {
	io = realio;
}

/**
 * Create an InhouseQueue, which is the inhouse queue for a particular season
 */
function InhouseQueue(season) {
	this.season = season;
	this.nextId = 0;
	this.readyTimeout = null;
	this.ioQueue = io.of('/queue-'+season.id);
	this.sockets = {};
	this.reset();

	var that = this;
	this.ioQueue.on('connect', function(socket) {
		// Sync queue state
		socket.emit('clearQueue');
		that.queue.forEach(function(v) {
			socket.emit('addPlayer', lobbies.clientPlayerInfo(v));
		});

		// Configure socket-identity information for quick reference
		that.sockets[socket.request.user.steamid] = socket;
		socket.emit('identity', {steamid : socket.request.user.steamid});

		// If we're configuring a match, share with the class
		if (null !== that.config) {
			that.config.syncState(socket);
		}

		// Set up disconnect event to remove someone who queued
		socket.on('disconnect', function() {
			var isPlayer = _.some(that.queue, function(v) {
				return v.steamid == socket.request.user.steamid;
			});

			// If we're ready checking, abort
			if (STATE_READYCHECK == that.state && isPlayer) {
				that.failReadyCheck();
			}

			// If we're configuring and a captain quits, abort
			if (STATE_CONFIGURING == that.state) {
				if (that.config.captains[0].steamid == socket.request.user.steamid
					|| that.config.captains[1].steamid == socket.request.user.steamid) {

					that.reset();
				}
			}

			that.removePlayer({
				steamid : socket.request.user.steamid
			});

			delete that.sockets[socket.request.user.steamid];
		});

		// Handle ready checks
		socket.on('ready', function() {
			that.markReady(socket.request.user.steamid);
		});

		// Forward picks to the config if one is active
		socket.on('pick', function(data) {
			if (null !== that.config) {
				that.config.pick(socket, data);
			}
		});
	});
};

/**
 * Re-initializer for reusable state modifications to be reset
 */
InhouseQueue.prototype.reset = function() {
	// @xxx local debugging
//	this.queue = [{
//		steamid : "76561198013590952",
//		display_name : '.teekay',
//		avatar : "https://steamcdn-a.akamaihd.net/steamcommunity/public/images/avatars/f0/f0b5ee6bbbf9af8ae7853ac3a61cfa14532014ab.jpg",
//		wins : 3,
//		losses : 2,
//		ihmmr : 1.39
//	}, {
//		steamid : '76561198062530567',
//		display_name : 'Clare',
//		avatar : 'https://steamcdn-a.akamaihd.net/steamcommunity/public/images/avatars/f5/f540924149a7357629613388ebf52ea095ed5b50.jpg',
//		wins : 4,
//		losses : 1,
//		ihmmr : 1.86
//	}, {
//		steamid : '76561198048886742',
//		display_name : 'megaera',
//		avatar : 'https://steamcdn-a.akamaihd.net/steamcommunity/public/images/avatars/cd/cd60dfc7a876d04499696965c17b68efc3833eb7.jpg',
//		wins : 2,
//		losses : 3,
//		ihmmr : 0.93
//	}];

	this.queue = [];
	this.state = STATE_QUEUE;
	this.config = null;

	if (this.ioQueue) {
		this.ioQueue.emit('clearQueue');
	}

	if (this.readyTimeout) {
		clearTimeout(this.readyTimeout);
		this.readyTimeout = null;
	}
};

/**
 * Helper to safely send a message to a specific steamid, silently dropping it otherwise
 * @param[in] steamid The steamid to send to
 * @param[in] msg The message (or event string)
 * @param[in] data Data passed along with event to client
 */
InhouseQueue.prototype.safeSend = function(steamid, msg, data) {
	if (undefined !== this.sockets[steamid]) {
		this.sockets[steamid].emit(msg, data);
	}
};

/**
 * Add a player to the inhouse queue
 * @param[in] player The player object to add to the queue
 */
InhouseQueue.prototype.addPlayer = function(player) {
	// If we're waiting for a game to launch don't allow people to queue
	if (STATE_QUEUE != this.state) {
		return false;
	}

	// Find "ihmmr" used to select captains based on record
	player.ihmmr = 0;
	var games = player.wins + player.losses;
	if (games > 1) {
		var winrate = player.wins / games;
		player.ihmmr = winrate * Math.log2(games);
		player.ihmmr = player.ihmmr.toFixed(2);
	}

	var alreadyQueued = _.some(this.queue, function(v) {
		return v.steamid == player.steamid;
	});

	if (!alreadyQueued) {
		this.queue.push(player);
		// @xxx temporary to be able to test as captain locally
//		this.queue.unshift(player);

		// Push a stripped user object to the client with only public info
		this.ioQueue.emit('addPlayer', lobbies.clientPlayerInfo(player));

		// Start the queue when we're full
		if (this.queue.length == queueTarget) {
			this.startReadyCheck();
		}
	}

	return !alreadyQueued;
};

/**
 * Remove a player from the queue
 * @param[in] player The player to remove. If they're not in the queue, no error
 */
InhouseQueue.prototype.removePlayer = function(player) {
	this.queue = _.reject(this.queue, function(v) {
		return v.steamid == player.steamid;
	});

	this.ioQueue.emit('removePlayer', {
		steamid : player.steamid
	});

	return true;
};

/**
 * Begin a ready check by informing all players of what is happening
 */
InhouseQueue.prototype.startReadyCheck = function() {
	var that = this;

	this.ready = {};
	this.state = STATE_READYCHECK;

	// Mark everyone unready before we send any notifications
	_.each(this.queue, function(v) {
		that.ready[v.steamid] = false;
	});

	// Only send the ready check to the people actually in the game
	var players = _.map(this.queue, lobbies.clientPlayerInfo);
	_.each(this.queue, function(v) {
		if (!skipReadyCheck) {
			that.safeSend(v.steamid, 'readyCheck', {players : players});
		}
		else {
			that.markReady(v.steamid);
		}
	});

	// Start a timeout to abort the lobby if the ready check fails within a minute
	this.readyTimeout = setTimeout(function() {
		if (STATE_READYCHECK == that.state) {
			that.failReadyCheck();
		}
	}, 60000);
};

/**
 * Used to fail a ready check in progress
 */
InhouseQueue.prototype.failReadyCheck = function() {
	logger.debug('Ready check failed.', 'Lobbies');

	// Copy previous queue state so it can be recreated
	var requeue = this.queue.slice();
	var ready = Object.assign({}, this.ready);

	var that = this;
	_.each(this.queue, function(v) {
		that.safeSend(v.steamid, 'readyCheckFailed', {});
	});

	this.reset();

	// Requeue people who were ready and waiting
	requeue.forEach(function(v) {
		if (ready[v.steamid]) {
			that.addPlayer(v);
		}
	});
};

/**
 * Handle a client reporting that it is ready in response to the ready check
 */
InhouseQueue.prototype.markReady = function(steamid) {
	// Make sure they actually need to submit a ready check
	if (undefined === this.ready[steamid])
		return;

	this.ready[steamid] = true;
	this.ioQueue.emit('markReady', {
		steamid : steamid
	});

	var allReady = _.reduce(this.ready, function(memo, v) { return memo && v; }, true);
	if (allReady) {
		this.config = new MatchConfig(this);
		this.state = STATE_CONFIGURING;
		this.nextId += 1;
	}
};

/**
 * Get, creating if necessasry, the inhouse queue object for the given season
 */
var getQueue = new fl.Chain(
	function(env, after, season) {
		if (undefined === queues[season.id]) {
			queues[season.id] = new InhouseQueue(season);
		}

		after(queues[season.id]);
	}
);

module.exports = {
	setup : setup,
	getQueue : getQueue,
};
