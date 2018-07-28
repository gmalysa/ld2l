
var fl = require('flux-link');
var db = require('db-filters');

var users = require('../lib/users.js');
var privs = require('../lib/privs.js');
var lobbies = require('../lib/lobbies.js');

/**
 * List lobbies in progress, give admins the option to create a new lobby
 */
var lobby_index = new fl.Chain(
	lobbies.getAll,
	function(env, after, lobbies) {
		env.$template('lobbies');
		env.$output({
			lobbies : JSON.stringify(lobbies),
			canCreate : privs.hasPriv(env.user.privs, privs.CREATE_LOBBY),
			scripts : ['lobbies', 'menu', 'player_autocomplete']
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
};
