/**
 * Interface used to queue for inhouses with a websocket based UI
 */

var _ = require('underscore');
var fl = require('flux-link');
var db = require('db-filters');
var randomstring = require('randomstring');

var mysql = require('../mysql');

var logger = require('../logger.js');
var users = require('../lib/users.js');
var privs = require('../lib/privs.js');
var lobbies = require('../lib/lobbies.js');
var MatchConfig = require('../lib/MatchConfig.js');

// Options to control code in debugging/live
const queueTarget = 10;
const skipReadyCheck = false;

// Inhouse queue states
const STATE_QUEUE = 0;
const STATE_READYCHECK = 1;
const STATE_CONFIGURING = 2;

/**
 * Create an InhouseQueue, which is a singleton object for this module
 * @param[in] io socket.io object for communicating with clients
 */
function InhouseQueue(io) {
	this.reset();
	this.io = null;
	this.ioQueue = null;
	this.nextId = 0;
}

/**
 * Initializer called once we have a reference to socket.io instance
 * @param[in] io socket.io server instance
 */
InhouseQueue.prototype.setup = function(io) {
	this.io = io;
	this.ioQueue = io.of('/queue');
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
			that.config.syncState();
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
//		avatar : "https://steamcdn-a.akamaihd.net/steamcommunity/public/images/avatars/f0/f0b5ee6bbbf9af8ae7853ac3a61cfa14532014ab.jpg"
//	}, {
//		steamid : '76561198062530567',
//		display_name : 'Clare',
//		avatar : 'https://steamcdn-a.akamaihd.net/steamcommunity/public/images/avatars/f5/f540924149a7357629613388ebf52ea095ed5b50.jpg'
//	}, {
//		steamid : '76561198048886742',
//		display_name : 'megaera',
//		avatar : 'https://steamcdn-a.akamaihd.net/steamcommunity/public/images/avatars/cd/cd60dfc7a876d04499696965c17b68efc3833eb7.jpg'
//	}];

	this.queue = [];
	this.state = STATE_QUEUE;
	this.config = null;

	if (this.ioQueue) {
		this.ioQueue.emit('clearQueue');
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
			that.sockets[v.steamid].emit('readyCheck', {players : players});
		}
		else {
			that.markReady(v.steamid);
		}
	});

	// Start a timeout to abort the lobby if the ready check fails within a minute
	setTimeout(function() {
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

	var that = this;
	_.each(this.queue, function(v) {
		that.sockets[v.steamid].emit('readyCheckFailed');
	});

	this.reset();
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
		this.config = new MatchConfig(this.ioQueue, this.queue, this.nextId, this);
		this.state = STATE_CONFIGURING;
		this.nextId += 1;
	}
};

module.exports = InhouseQueue;
