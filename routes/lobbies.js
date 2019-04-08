
var _ = require('underscore');
var fl = require('flux-link');
var db = require('db-filters');
var request = require('request');

var config = require('../config.js');
var logger = require('../logger.js');
var privs = require('../lib/privs.js');
var lobbies = require('../lib/lobbies.js');
var prelobbies = require('../lib/prelobbies.js');

/**
 * List lobbies in progress, give admins the option to create a new lobby
 */
var lobby_index = new fl.Chain(
	lobbies.getAll,
	function(env, after, lobbies) {
		env.$template('lobbies');
		env.$output({
			lobbies : lobbies,
			canCreate : privs.hasPriv(env.user.privs, privs.CREATE_LOBBY),
			canInvite : false,
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
		if (env.req.body.key != config.kbaas_key) {
			env.$throw(new Error('Incorrect API key given'));
			return;
		}
		logger.var_dump(env.req.body, 'KBaaS');
		after();
	},
	prelobbies.KBUpdate
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

	server.add_route('/lobbies/parse', {
		pre : ['default', 'require_user'],
		post : ['default'],
		fn : null
	}, 'get');
};
