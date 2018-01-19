
var fl = require('flux-link');
var privs = require('../lib/privs.js');
var db = require('db-filters');
var _ = require('underscore');

/**
 * Helper chain that is used to check if someone has the ability to create seasons or not and sets
 * an environment variable to indicate this
 */
var checkSeasonPrivs = new fl.Chain(
	function(env, after) {
		env.canCreateSeason = false;
		after();
	},
	new fl.Branch(
		privs.isLoggedIn,
		new fl.Chain(
			function(env, after) {
				after(env.user.steamid);
			},
			privs.getPrivs,
			function (env, after, adminPrivs) {
				env.canCreateSeason = privs.hasPriv(adminPrivs, privs.MODIFY_SEASON);
				after();
			}
		),
		function(env, after) {
			after();
		}
	)
);

/**
 * Handler for the season listing route
 */
var season_index = new fl.Chain(
	checkSeasonPrivs,
	function(env, after) {
		env.filters.seasons.select({}).exec(after, env.$throw);
	},
	function(env, after, seasons) {
		env.$output({
			seasons : seasons,
			canCreateSeason : env.canCreateSeason
		});
		env.$template('season_list');
		after();
	}
);

/**
 * Show season details which is a list of players that signed up
 */
var season_info = new fl.Chain(
	// Show signup list
	function(env, after) {
		var id = parseInt(env.req.params.seasonid, 10);
		if (isNaN(id)) {
			env.$throw(new Error('Season not found'));
			return;
		}

		env.seasonId = id;
		env.filters.signups.select({season : id})
			.left_join(env.filters.users, 'u')
			.on(['steamid', 'steamid'])
			.order(0, db.$asc('time'))
			.exec(after, env.$throw);
	},
	function(env, after, signups) {
		env.season_info$signups = signups;
		env.$output({signups : signups});
		env.$template('season_info');
		env.filters.seasons.select({
			id : env.seasonId
		}).exec(after, env.$throw);
	},

	// Add season status
	function(env, after, season) {
		env.$output({
			season_name : season[0].name,
			season_id : season[0].id
		});
		after();
	},

	// Check if they can sign up
	new fl.Branch(
		privs.isLoggedIn,
		new fl.Chain(
			function(env, after) {
				after(env.user.steamid);
			},
			privs.getPrivs,
			function (env, after, userPrivs) {
				var canSignUp = privs.hasPriv(userPrivs, privs.JOIN_SEASON);
				var signedUp = _.reduce(env.season_info$signups, function(memo, v, k) {
					return memo || (v.steamid == env.user.steamid);
				}, false);
				env.$output({canSignUp : canSignUp && !signedUp});
				env.$output({signedUp : signedUp});
				after();
			}
		),
		function(env, after) {
			after();
		}
	)
);

/**
 * Create a season
 */
var season_create = new fl.Chain(
	checkSeasonPrivs,
	function(env, after) {
		if (env.canCreateSeason) {
			env.filters.seasons.insert({
				name : 'New Season',
				status : 0
			}).exec(after, env.$throw);
		}
		else {
			env.$throw(new Error('You don\'t have privs to create a new season'));
		}
	},
	function(env, after) {
		env.$redirect('/seasons');
		after();
	}
);

/**
 * Show signup form, if a person is allowed to sign up
 */
var show_signup_form = new fl.Chain(
	// Dummy function to avoid crashes
	function(env, after) {
		env.$redirect('/seasons');
		after();
	}
);

/**
 * Handle a signup form and send them back if it was incomplete
 */
var handle_signup_form = new fl.Chain(
	// Dummy function to avoid crashes
	function(env, after) {
		env.$redirect('/seasons');
		after();
	}
);

module.exports.init_routes = function(server) {
	server.add_route('/seasons', {
		fn : season_index,
		pre : ['default'],
		post : ['default']
	}, 'get');

	server.add_route('/seasons/:seasonid', {
		fn : season_info,
		pre : ['default'],
		post : ['default']
	}, 'get');

	server.add_route('/seasons/signup/:seasonid', {
		fn : show_signup_form,
		pre : ['default'],
		post : ['default']
	}, 'get');

	server.add_route('/seasons/handle/:seasonid', {
		fn : handle_signup_form,
		pre : ['default'],
		post : ['default']
	}, 'post');

	server.add_route('/seasons/admin/create', {
		fn : season_create,
		pre : ['default'],
		post : ['default']
	}, 'get');
}
