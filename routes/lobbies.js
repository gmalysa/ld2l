
var _ = require('underscore');
var fl = require('flux-link');
var db = require('db-filters');

var logger = require('../logger.js');
var users = require('../lib/users.js');
var privs = require('../lib/privs.js');
var lobbies = require('../lib/lobbies.js');
var InhouseQueue = require('../lib/InhouseQueue.js');

/**
 * Check if a player can queue for inhouses or not
 */
function canQueueInhouses(player) {
	return !(privs.hasPriv(player.privs, privs.INELIGIBLE)
		     || privs.hasPriv(player.privs, privs.BANNED));
}

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

/**
 * List lobbies in progress, give admins the option to create a new lobby
 */
var lobby_index = new fl.Chain(
	lobbies.getAll,
	function(env, after, lobbies) {
		// Temporary for testing

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
		logger.debug(env.req.body, 'KBaaS');
		after(JSON.parse(env.req.body));
	},
	lobbies.saveResults
);

module.exports.init_routes = function(server) {
	inhouseQueue.setup(server.io);

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
