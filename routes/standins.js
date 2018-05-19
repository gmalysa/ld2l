/**
 * Help people find standins for the given season
 */

var fl = require('flux-link');
var db = require('db-filters');
var _ = require('underscore');

var privs = require('../lib/privs.js');
var users = require('../lib/users.js');
var seasons = require('../lib/seasons.js');
var teams = require('../lib/teams.js');

var standin_list = new fl.Chain(
	function(env, after) {
		var id = parseInt(env.req.params.seasonid);
		if (isNaN(id)) {
			env.$throw(new Error('Invalid season ID specified'));
			return;
		}

		env.seasonId = id;
		after(id);
	},
	seasons.getSeason,
	function(env, after, season) {
		var standins = season.signups.filter(function(v) {
			return v.teamid == 0;
		});

		var vouched = standins.filter(function(v) {
			return v.vouched == 1;
		});

		var unvouched = standins.filter(function(v) {
			return v.vouched == 0;
		});

		env.$template('standins');
		env.$output({
			season : season,
			vouched : vouched,
			unvouched : unvouched
		});

		after();
	}
);

module.exports.init_routes = function(server) {
	server.add_route('/standins/:seasonid', {
		fn : standin_list,
		pre : ['default', 'optional_user'],
		post : ['default']
	}, 'get');
};
