
var _ = require('underscore');
var fl = require('flux-link');
var db = require('db-filters');
var randomstring = require('randomstring');

var mysql = require('../mysql');

var users = require('../lib/users.js');
var privs = require('../lib/privs.js');
var lobbies = require('../lib/lobbies.js');

// Pick order for captains drafting players
// 0 = radiant, 1 = dire
const pickOrder = [0, 1, 1, 0, 1, 0, 0, 1];

/**
 * Check if a player can queue for inhouses or not
 */
function canQueueInhouses(player) {
	return !(privs.hasPriv(player.privs, privs.INELIGIBLE)
		     || privs.hasPriv(player.privs, privs.BANNED));
}

/**
 * Map a server-side player info object into a client-side-safe one. If given a client-
 * side-safe one already, it produces a copy.
 * @param[in]
 */
function _clientPlayerInfo(player) {
	return {
		steamid : player.steamid,
		display_name : player.display_name,
		avatar : player.avatar
	};
}

var matchConfigs = {};

/**
 * Create a MatchConfig which is used to store the match configuration state before
 * we call the actual lobby creation functions
 * @param[in] io socket.io object for communicating with clients
 * @param[in] players Array of ten players that are in this match
 * @param[in] id identifier to use to find this match config in requests
 * @todo match config history to clients
 * @todo timeouts
 */
function MatchConfig(io, players, id) {
	this.io = io;
	this.players = players;
	this.id = id;
	this.ioConfig = io.of('/queue-config-'+id);
	this.pickNumber = 0;

	// @todo tournament id -> season property instead of hardcoded
	// this is the KB inhouse league ticket
	this.settings = {
		name : 'LD2L Inhouse '+id,
		password : randomstring.generate(8),
		tournament : 10287,
		ident : 'ld2l-inhouse-'+randomstring.generate(8)
	};
	console.log(this.settings);

	// First two signups are captain for now
	this.captains = _.map(this.players.splice(0, 2), function(v, k) {
		return _.extend(_clientPlayerInfo(v), {
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

	io.of('/queue').emit('config_start', {
		players : _.map(players, _clientPlayerInfo),
		captains : this.captains,
		pickOrder : pickOrder,
		id : id
	});

	var that = this;
	this.ioConfig.on('connect', function(socket) {
		// If we're done stop trying to inform people of the current pick
		if (pickOrder[that.pickNumber]) {
			that.ioConfig.emit('turn', {
				steamid : that.teams[pickOrder[that.pickNumber]].captain
			});
		}

		socket.on('pick', function(data) {
			if (!that.isYourTurn(socket.request.user))
				return;

			if (!that.isPickable(data.steamid))
				return;

			// Add player to team
			var side = 0;
			if (that.teams[1].captain == socket.request.user.steamid)
				side = 1;

			var player = _.find(that.players, function(v) {
				return v.steamid == data.steamid;
			});

			that.teams[side].players.push(player.steamid);

			// Remove picked player from the draft pool
			that.players = _.reject(that.players, function(v) {
				return v.steamid == data.steamid;
			});

			that.ioConfig.emit('pick', {
				steamid : data.steamid,
				pick : that.pickNumber
			});

			that.pickNumber += 1;

			if (that.pickNumber < pickOrder.length) {
				that.ioConfig.emit('turn', {
					steamid : that.teams[pickOrder[that.pickNumber]].captain
				});
			}

			if (that.players.length == 0) {
				that.ioConfig.emit('launch', {
					lobbyName : that.settings.name,
					lobbyPassword : that.settings.password
				});
				that.launchGame();
			}
		});
	});
}

MatchConfig.prototype = _.extend(MatchConfig.prototype, {
	/**
	 * Check if the given user object is the captain who should pick next
	 * @param[in] user User object
	 * @return true if this person can pick, false otherwise
	 */
	isYourTurn : function(captain) {
		var side = -1;
		if (this.teams[0].captain == captain.steamid)
			side = 0;
		else if (this.teams[1].captain == captain.steamid)
			side = 1;

		if (side < 0)
			return false;

		return pickOrder[this.pickNumber] == side;
	},

	/**
	 * Test if a given steam id is pickable, that is someone in the player list
	 * @param[in] steamid id to check
	 * @return true if they can be picked, false otherwise
	 */
	isPickable : function(steamid) {
		return _.any(this.players, function(v) {
			return v.steamid == steamid;
		});
	},

	/**
	 * Pass lobby information to kaedebot and start the game
	 */
	launchGame : function() {
		var env = new fl.Environment({
			settings : _.extend({}, this.settings, {teams : this.teams})
		});

		launchChain.call(null, env, function() {});
	}
});

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

/**
 * Create an InhouseQueue, which is a singleton object for this module
 * @param[in] io socket.io object for communicating with clients
 */
function InhouseQueue(io) {
	// @todo local debugging
//	this.queue = [{
//		steamid : "76561198013590952",
//		display_name : '.teekay',
//		avatar : "https://steamcdn-a.akamaihd.net/steamcommunity/public/images/avatars/f0/f0b5ee6bbbf9af8ae7853ac3a61cfa14532014ab.jpg"
//	}, {
//		steamid : '76561198062530567',
//		display_name : 'Clare',
//		avatar : 'https://steamcdn-a.akamaihd.net/steamcommunity/public/images/avatars/f5/f540924149a7357629613388ebf52ea095ed5b50.jpg'
//	}];
//	, {
//		steamid : '76561198048886742',
//		display_name : 'megaera',
//		avatar : 'https://steamcdn-a.akamaihd.net/steamcommunity/public/images/avatars/cd/cd60dfc7a876d04499696965c17b68efc3833eb7.jpg'
//	}];
	this.queue = [];
	this.io = null;
	this.nextId = 0;
}

InhouseQueue.prototype = _.extend(InhouseQueue.prototype, {
	/**
	 * Initializer called once we have a reference to socket.io instance
	 * @param[in] io socket.io server instance
	 */
	setup : function(io) {
		this.io = io;
		this.ioQueue = io.of('/queue');

		var that = this;
		this.ioQueue.on('connect', function(socket) {
			// Sync queue state
			that.queue.forEach(function(v) {
				socket.emit('addPlayer', _clientPlayerInfo(v));
			});

			socket.emit('identity', {steamid : socket.request.user.steamid});

			// Set up disconnect event to remove someone who queued
			socket.on('disconnect', function() {
				if (undefined !== socket.request.user) {
					that.removePlayer({
						steamid : socket.request.user.steamid
					});
				}
			});
		});
	},

	/**
	 * Add a player to the inhouse queue
	 * @param[in] player The player object to add to the queue
	 */
	addPlayer : function(player) {
		var alreadyQueued = _.some(this.queue, function(v) {
			return v.steamid == player.steamid;
		});

		if (!alreadyQueued) {
			this.queue.push(player);
			// @todo temporary to be able to test as captain locally
//			this.queue.unshift(player);

			// Push a stripped user object to the client with only public info
			this.ioQueue.emit('addPlayer', _clientPlayerInfo(player));

			// At ten queuers start the match
			if (this.queue.length == 10) {
				var setup = new MatchConfig(this.io, this.queue, this.nextId);
				this.nextId += 1;

				this.queue = [];
			}
		}

		return !alreadyQueued;
	},

	/**
	 * Remove a player from the queue
	 * @param[in] player The player to remove. If they're not in the queue, no error
	 */
	removePlayer : function(player) {
		this.queue = _.reject(this.queue, function(v) {
			return v.steamid == player.steamid;
		});

		this.ioQueue.emit('removePlayer', {
			steamid : player.steamid
		});

		return true;
	}
});

var inhouseQueue = new InhouseQueue();

/**
 * Queue a player to inhouses
 */
function queueForInhouse(env, after) {
	if (!canQueueInhouses(env.user)) {
		env.$throw(new Error('You are not allowed to play inhouses'));
		return;
	}

	env.$json({
		success : inhouseQueue.addPlayer(env.user)
	});
	after();
}

/**
 * Remove them from inhouses by their input (page departure is separate)
 */
function leaveInhouseQueue(env, after) {
	env.$json({
		success : inhouseQueue.removePlayer(env.user)
	});
	after();
}

// Actual route stuff below

/**
 * List lobbies in progress, give admins the option to create a new lobby
 */
var lobby_index = new fl.Chain(
	lobbies.getAll,
	function(env, after, lobbies) {
		// Temporary for testing
//		lobbies = {"lobbies":[{"lobbyName":"LD2L Lobby","timeout":1536182060,"lobby":{"fill_with_bots":false,"series_type":0,"game_name":"LD2L Lobby","bot_difficulty_dire":0,"leader_id":76561198395782380,"dota_tv_delay":1,"members":[{"partner_account_type":0,"meta_xp_awarded":0,"id":"76561198395782380","cameraman":false,"channel":6,"coach_team":5,"slot":0,"favorite_team_packed":0,"team":4,"meta_level":0,"is_plus_subscriber":false,"meta_xp":0,"name":"YuiBot","leaver_status":1,"hero_id":0},{"partner_account_type":0,"meta_xp_awarded":0,"id":"76561198048886742","cameraman":false,"channel":6,"coach_team":5,"slot":3,"favorite_team_packed":563044447930478,"team":1,"meta_level":0,"is_plus_subscriber":true,"meta_xp":0,"name":"megaera","leaver_status":0,"hero_id":0},{"partner_account_type":0,"meta_xp_awarded":0,"id":"76561198007934819","cameraman":false,"channel":6,"coach_team":5,"slot":1,"favorite_team_packed":563044442703987,"team":0,"meta_level":0,"is_plus_subscriber":true,"meta_xp":0,"name":"ButteryGreg","leaver_status":0,"hero_id":0}],"game_version":0,"bot_dire":0,"dire_series_wins":0,"pass_key":"ld2l","lan_host_ping_to_server_region":0,"bot_difficulty_radiant":0,"penalty_level_radiant":0,"cm_pick":1,"allow_cheats":false,"previous_match_override":0,"game_mode":2,"pause_setting":0,"radiant_series_wins":0,"allow_spectating":true,"intro_mode":false,"visibility":0,"selection_priority_rules":0,"state":2,"league_series_id":0,"lobby_type":1,"league_game_id":0,"leagueid":0,"allchat":false,"penalty_level_dire":0,"bot_radiant":0,"server_region":1,"lan":false},"lobbyPassword":"ld2l","tournament":0,"ident":"ld2l-lobby","hook":"http://ld2l.gg/lobbies/results"},{"lobbyName":"LD2L Lobby","timeout":1536182060,"lobby":{"fill_with_bots":false,"series_type":0,"game_name":"LD2L Lobby","bot_difficulty_dire":0,"leader_id":76561198395782380,"dota_tv_delay":1,"members":[{"partner_account_type":0,"meta_xp_awarded":0,"id":"76561198395782380","cameraman":false,"channel":6,"coach_team":5,"slot":0,"favorite_team_packed":0,"team":4,"meta_level":0,"is_plus_subscriber":false,"meta_xp":0,"name":"YuiBot","leaver_status":1,"hero_id":0},{"partner_account_type":0,"meta_xp_awarded":0,"id":"76561198048886742","cameraman":false,"channel":6,"coach_team":5,"slot":3,"favorite_team_packed":563044447930478,"team":1,"meta_level":0,"is_plus_subscriber":true,"meta_xp":0,"name":"megaera","leaver_status":0,"hero_id":0},{"partner_account_type":0,"meta_xp_awarded":0,"id":"76561198007934819","cameraman":false,"channel":6,"coach_team":5,"slot":1,"favorite_team_packed":563044442703987,"team":0,"meta_level":0,"is_plus_subscriber":true,"meta_xp":0,"name":"ButteryGreg","leaver_status":0,"hero_id":0}],"game_version":0,"bot_dire":0,"dire_series_wins":0,"pass_key":"ld2l","lan_host_ping_to_server_region":0,"bot_difficulty_radiant":0,"penalty_level_radiant":0,"cm_pick":1,"allow_cheats":false,"previous_match_override":0,"game_mode":2,"pause_setting":0,"radiant_series_wins":0,"allow_spectating":true,"intro_mode":false,"visibility":0,"selection_priority_rules":0,"state":2,"league_series_id":0,"lobby_type":1,"league_game_id":0,"leagueid":0,"allchat":false,"penalty_level_dire":0,"bot_radiant":0,"server_region":1,"lan":false},"lobbyPassword":"ld2l","tournament":0,"ident":"ld2l-lobby","hook":"http://ld2l.gg/lobbies/results"}]};

		env.lobbies = lobbies.lobbies;
		env.players = _.flatten(_.map(env.lobbies, function(v) {
			return v.lobby.members;
		}));
		var steamids = _.map(env.players, function(v) { return v.id; });

		if (steamids.length > 0) {
			env.filters.users.select({
				steamid : steamids
			}).exec(after, env.$throw);
		}
		else {
			after([]);
		}
	},
	function (env, after, users) {
		// Remap to steamid index table
		var players = {};
		_.each(users, function(u) {
			players[u.steamid] = u;
		});

		// Attach user objects instead of steamids to lobby members
		_.each(env.lobbies, function(lobby) {
			_.each(lobby.lobby.members, function(m) {
				if (undefined !== players[m.id])
					m.player = players[m.id];
			});
		});

		env.$template('lobbies');
		env.$output({
			lobbies : env.lobbies,
			canCreate : privs.hasPriv(env.user.privs, privs.CREATE_LOBBY),
			canInvite : false,
			canQueueInhouses : canQueueInhouses(env.user),
			scripts : ['lobbies', 'menu', 'autocomplete']
		});

		after();
	}
);

/**
 * Create a lobby based on parameters supplied via html
 */
var create = new fl.Chain(
	function(env, after) {
		if (!privs.hasPriv(env.user.privs, privs.CREATE_LOBBY)) {
			env.$throw(new Error('Insufficient privs to create a lobby'));
			return;
		}

		after(JSON.parse(env.req.body.lobby));
	},
	lobbies.create,
	function(env, after, response) {
		console.log(response);
		env.$json({success : true});
		after();
	}
);

/**
 * Save results of a lobby game provided by kaedebot
 */
var lobby_results = new fl.Chain(
	function(env, after) {
		console.log(env.req.body);
		after(JSON.parse(env.req.body));
	},
	lobbies.saveResults
);

module.exports.init_routes = function(server) {
	inhouseQueue.setup(server.io);

	server.io.on('connect', function(s) {
		console.log('Client connected to inhouse queue');
	});

	server.add_route('/lobbies', {
		pre : ['default', 'require_user'],
		post : ['default'],
		fn : lobby_index
	}, 'get');

	server.add_route('/lobbies/create', {
		pre : ['default', 'require_user'],
		post : ['default'],
		fn : create
	}, 'post');

	server.add_route('/lobbies/results', {
		pre : ['default'],
		post : ['default'],
		fn : lobby_results
	}, 'post');

	server.add_route('/lobbies/queue', {
		pre : ['default', 'require_user'],
		post : ['default'],
		fn : queueForInhouse
	}, 'post');

	server.add_route('/lobbies/leaveQueue', {
		pre : ['default', 'require_user'],
		post : ['default'],
		fn : leaveInhouseQueue
	}, 'post');
};
