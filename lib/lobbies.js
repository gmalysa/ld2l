/**
 * Create and host lobbies using Kaedebot-as-a-Service, with the results to be reported to us
 */

var fl = require('flux-link');
var db = require('db-filters');
var _ = require('underscore');
var request = require('request');

var config = require('../config.js');

/**
 * Retrieve a list of all currently going lobbies
 * @return array of lobby objects as defined by KBaaS spec (not posted anywhere, good luck)
 */
var getAll = new fl.Chain(
	function(env, after) {
		request(config.kbaas_url + '/lobbies'
			+ '?key= ' + config.kbaas_key,
			function(error, response, body) {
				var data = JSON.parse(body);
				after(data);
			}
		);
	}
);

/**
 * Create a new lobby with the given settings
 * @param[in] settings Object of settings, defaults or internal values will be added
 */
var create = new fl.Chain(
	function(env, after, settings) {
		var args = _.extend({
			name : 'LD2L Lobby',
			password : 'ld2l',
			ident : 'ld2l-lobby',
			key : config.kbaas_key,
			hook : config.base_url + '/lobbies/results',
			tournament : 0,
			teams : [],
			config : {}
		}, settings);

		if (args.teams.length != 2) {
			env.$throw(new Error('Must create a lobby with two teams'));
			return;
		}

		if (args.teams[0].players.length != 5 || args.teams[1].players.length != 5) {
			env.$throw(new Error('Both teams must have exactly 5 players'));
			return;
		}

		if (!args.teams[0].captain || !args.teams[1].captain) {
			env.$throw(new Error('Both teams must have a captain specified'));
			return;
		}

		request.post(config.kbaas_url + '/lobbies/create', {
			'content-type' : 'application/json',
			body : JSON.stringify(args)
		}, function(err, response, body) {
			after(JSON.parse(body));
		});
	}
);

/**
 * Save the results of a lobby game
 * @param[in] LobbyResponse lobby LobbyResponse object from KBaaS summarizing the game
 */
var saveResults = new fl.Chain(
	function(env, after, lobby) {
		console.log(JSON.stringify(lobby));
		after();
	}
);

module.exports = {
	getAll : getAll,
	create : create,
	saveResults : saveResults
};
