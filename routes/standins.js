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
			return v.valid_standin == 1;
		});

		env.$template('standins');
		env.$output({
			season : season,
			vouched : standins,
			scripts : ['sort']
		});

		after();
	}
);

var toggle_standin = new fl.Chain(
	function(env, after) {
		if (!privs.hasPriv(env.user.privs, privs.MODIFY_SEASON)) {
			env.$throw(new Error('You don\'t have the authority to change standin status'));
			return;
		}

		env.$json({success : true});

		env.filters.signups.update({
			valid_standin : env.req.body.standin ? 1 : 0
		}, {
			steamid : env.req.body.steamid,
			season : env.req.body.season
		}).exec(after, env.$throw);
	}
);

module.exports.init_routes = function(server) {
	server.add_route('/standins/:seasonid', {
		fn : standin_list,
		pre : ['default', 'optional_user'],
		post : ['default']
	}, 'get');

	server.add_route('/standin/toggle', {
		fn : toggle_standin,
		pre : ['default', 'require_user'],
		post : ['default']
	}, 'post');
};
