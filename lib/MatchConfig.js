/**
 * Store a match configuration state before the lobby is launched and provide for
 * socket.io interface to draft players onto teams
 */

var _ = require('underscore');
var fl = require('flux-link');
var db = require('db-filters');
var randomstring = require('randomstring');

var mysql = require('../mysql');
var logger = require('../logger.js');

var config = require('../config.js');
var lobbies = require('../lib/lobbies.js');

// Pick order for captains drafting players
// 0 = radiant, 1 = dire
const pickOrder = [0, 1, 1, 0, 0, 1, 1, 0];

/**
 * Create a MatchConfig which is used to store the match configuration state before
 * we call the actual lobby creation functions
 * @param[in] queue InhouseQueue object with configuration and notification
 * @todo timeouts
 * @todo button to cancel match
 */
function MatchConfig(queue) {
	this.io = queue.ioQueue;
	this.players = _.map(queue.queue, lobbies.clientPlayerInfo);
	this.id = queue.nextId;
	this.queue = queue;
	this.pickNumber = 0;
	this.season = queue.season;

	this.settings = {
		name : 'LD2L Inhouse '+this.season.id+'-'+this.id,
		password : randomstring.generate(8),
		tournament : this.season.ticket,
		ident : 'ld2l-inhouse-'+this.season.id+'-'+randomstring.generate(8),
		hook : config.base_url + '/seasons/'+this.season.id+'/inhouses/results'
	};
	logger.var_dump(this.settings, {
		name : 'Lobby Settings',
		src : 'Lobbies'
	});

	// Sort all players by inhouse rating to find best captains
	this.players = _.sortBy(this.players, function(p) {
		return -p.ihmmr;
	});

	// Grab captains from the top of the list
	this.captains = _.map(this.players.splice(0, 2), function(v, k) {
		return _.extend(lobbies.clientPlayerInfo(v), {
			side : k,
			team : (k == 0) ? 'Radiant' : 'Dire'
		});
	});

	// Matches the array format in lobbies.create for teams
	this.teams = [
		{
			captain : this.captains[0].steamid,
			players : [this.captains[0].steamid]
		},
		{
			captain : this.captains[1].steamid,
			players : [this.captains[1].steamid]
		}
	];

	this.syncState();
}

/**
 * Helper to sync the config state on a client join
 * @param[in] socket (optional) If given sync to this socket only
 */
MatchConfig.prototype.syncState = function(socket) {
	socket = socket || this.io;

	socket.emit('configStart', {
		players : this.players,
		captains : this.captains,
		pickOrder : pickOrder,
		id : this.id
	});

	socket.emit('turn', {
		steamid : this.teams[pickOrder[this.pickNumber]].captain
	});
};

/**
 * Check if the given user object is the captain who should pick next
 * @param[in] user User object
 * @return true if this person can pick, false otherwise
 */
MatchConfig.prototype.isYourTurn = function(captain) {
	var side = -1;
	if (this.teams[0].captain == captain.steamid)
		side = 0;
	else if (this.teams[1].captain == captain.steamid)
		side = 1;

	if (side < 0)
		return false;

	return pickOrder[this.pickNumber] == side;
};

/**
 * Test if a given steam id is pickable, that is someone in the player list
 * @param[in] steamid id to check
 * @return true if they can be picked, false otherwise
 */
MatchConfig.prototype.isPickable = function(steamid) {
	return _.any(this.players, function(v) {
		return v.steamid == steamid;
	});
};

/**
 * Pick a player for the draft
 * @param[in] socket socket.io object for the person trying to pick
 * @param[in] data {steamid} Description of who to pick
 */
MatchConfig.prototype.pick = function(socket, data) {
	if (!this.isYourTurn(socket.request.user))
		return;

	if (!this.isPickable(data.steamid))
		return;

	// Add player to team
	var side = 0;
	if (this.teams[1].captain == socket.request.user.steamid)
		side = 1;

	var player = _.find(this.players, function(v) {
		return v.steamid == data.steamid;
	});

	this.teams[side].players.push(player.steamid);

	// Remove picked player from the draft pool
	this.players = _.reject(this.players, function(v) {
		return v.steamid == data.steamid;
	});

	this.io.emit('pick', {
		steamid : data.steamid,
		pick : this.pickNumber
	});

	this.pickNumber += 1;

	if (this.pickNumber < pickOrder.length) {
		this.io.emit('turn', {
			steamid : this.teams[pickOrder[this.pickNumber]].captain
		});
	}

	if (this.players.length == 0) {
		this.io.emit('launch', {
			lobbyName : this.settings.name,
			lobbyPassword : this.settings.password
		});
		this.queue.reset();
		this.launchGame();
	}
};

/**
 * Pass lobby information to kaedebot and start the game
 */
MatchConfig.prototype.launchGame = function() {
	var env = new fl.Environment({
		settings : _.extend({}, this.settings, {teams : this.teams})
	});

	launchChain.call(null, env, function() {});
};

/**
 * Chain for launching lobbies that includes the normal setup a request would have
 */
var launchChain = new fl.Chain(
	mysql.init_db,
	// Extract arguments from the environment
	function(env, after) {
		after(env.settings);
	},
	lobbies.create,
	mysql.cleanup_db
);

module.exports = MatchConfig;
