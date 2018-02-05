/**
 * @todo this needs audit logging of changes being made
 */

var fl = require('flux-link');
var privs = require('../lib/privs.js');
var db = require('db-filters');
var _ = require('underscore');
var request = require('request');

var seasons = require('../lib/seasons.js');
var users = require('../lib/users.js');

/**
 * Helper chain that is used to check if someone has the ability to create seasons or not and sets
 * an environment variable to indicate this
 */
var checkSeasonPrivs = new fl.Branch(
	privs.isLoggedIn,
	new fl.Chain(
		function(env, after) {
			after(env.user.steamid);
		},
		privs.getPrivs,
		function (env, after, adminPrivs) {
			after(privs.hasPriv(adminPrivs, privs.MODIFY_SEASON));
		}
	),
	function(env, after) {
		after(false);
	}
);

/**
 * Handler to rename a season
 */
var edit_season = new fl.Branch(
	checkSeasonPrivs,
	new fl.Chain(
		function(env, after) {
			var id = parseInt(env.req.params.seasonid);
			if (isNaN(id)) {
				env.$throw(new Error('Invalid season ID specified'));
				return;
			}

			var seasonStatus = parseInt(env.req.body.status);
			if (!env.req.body.name || !seasons.isValidStatus(seasonStatus)) {
				env.$throw(new Error('Bad season update parameters given'));
				return;
			}

			env.filters.seasons.update({
				name : env.req.body.name,
				status : seasonStatus
			}, {id : id}).exec(after, env.$throw);
		},
		function(env, after) {
			env.$redirect('/seasons/'+env.req.params.seasonid);
			after();
		}
	),
	function(env, after) {
		env.$throw(new Error('You do not have permission to change season settings'));
	}
);

/**
 * Handler for the season listing route
 */
var season_index = new fl.Chain(
	checkSeasonPrivs,
	function(env, after, canCreateSeason) {
		env.$output({canCreateSeason : canCreateSeason});
		env.filters.seasons.select({}).exec(after, env.$throw);
	},
	function(env, after, seasons) {
		env.$output({seasons : seasons});
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
		if (signups.length > 0) {
			env.filters.privs.select({
				steamid : signups.map(function(v, k) { return v.steamid; }),
				priv : privs.JOIN_SEASON
			}).exec(after, env.$throw);
		}
		else {
			after([]);
		}
	},
	function(env, after, allPrivs) {
		var privTable = {};
		allPrivs.forEach(function(v, k) {
			privTable[v.steamid] = 1;
		});
		env.season_info$signups.forEach(function(v, k) {
			if (privTable[v.steamid] !== undefined)
				v.vouched = 1;
			else
				v.vouched = 0;
		});

		env.$output({signups : env.season_info$signups});
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
				var canEdit = privs.hasPriv(userPrivs, privs.MODIFY_SEASON);
				var canSignUp = privs.hasPriv(userPrivs, privs.JOIN_SEASON);
				var signedUp = _.reduce(env.season_info$signups, function(memo, v, k) {
					return memo || (v.steamid == env.user.steamid);
				}, false);
				var statusLabels = [
					{value : seasons.STATUS_HIDDEN, label : "Hidden"},
					{value : seasons.STATUS_SIGNUPS, label : "Signups"},
					{value : seasons.STATUS_PLAYING, label : "Playing"},
					{value : seasons.STATUS_FINISHED, label : "Finished"}
				];

				env.$output({
					canSignUp : canSignUp && !signedUp,
					signedUp : signedUp,
					canEditSeason : canEdit,
					statuses : statusLabels
				});
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
var season_create = new fl.Branch(
	checkSeasonPrivs,
	new fl.Chain(
		function(env, after) {
			env.filters.seasons.insert({
				name : 'New Season',
				status : 0
			}).exec(after, env.$throw);
		},
		function(env, after) {
			env.$redirect('/seasons');
			after();
		}
	),
	function(env, after) {
		env.$throw(new Error('You don\'t have privs to create a new season'));
	}
);

/**
 * Show signup form, if a person is allowed to sign up
 */
var show_signup_form = new fl.Branch(
	privs.isLoggedIn,
	new fl.Chain(
		function(env, after) {
			var id = parseInt(env.req.params.seasonid);
			if (isNaN(id)) {
				env.$throw(new Error('Invalid season ID specified'));
				return;
			}

			env.filters.seasons.select({id : id}).exec(after, env.$throw);
		},
		function(env, after, seasonInfo) {
			if (seasons.STATUS_SIGNUPS != seasonInfo[0].status) {
				env.$throw(new Error('This season is not currently accepting signups'));
				return;
			}

			env.$output({
				season_name : seasonInfo[0].name,
				season_id : seasonInfo[0].id
			});

			env.filters.signups.select({
				steamid : env.user.steamid,
				season : seasonInfo[0].id
			}).exec(after, env.$throw);
		},
		function(env, after, signup) {
			if (signup.length > 0) {
				// dust uses === comparison and requires strings, so convert numbers we have
				env.$output({
					statement : signup[0].statement,
					captain : signup[0].captain+'',
					standin : signup[0].standin+'',
					editSignup : true
				});
			}

			env.$template('season_signup');
			after(env.user.id32);
		},
		users.getMedal,
		function(env, after, medal) {
			env.$output({medal : medal});
			after();
		}
	),
	function(env, after) {
		env.$throw(new Error('You must be logged in to sign up'));
	}
);

/**
 * Handle a signup form and send them back if it was incomplete
 */
var handle_signup_form = new fl.Branch(
	privs.isLoggedIn,
	new fl.Chain(
		function(env, after) {
			var id = parseInt(env.req.params.seasonid);
			if (isNaN(id)) {
				env.$throw(new Error('Invalid season ID specified'));
				return;
			}

			env.filters.seasons.select({id : id}).exec(after, env.$throw);
		},
		function(env, after, seasonInfo) {
			if (seasons.STATUS_SIGNUPS !== seasonInfo[0].status) {
				env.$throw(new Error('This season is not currently accepting signups'));
				return;
			}

			env.handle_signup$season = seasonInfo[0];
			after(env.user.id32);
		},
		users.getMedal,
		function(env, after, medal) {
			env.handle_signup$medal = medal;
			env.filters.signups.select({
				steamid : env.user.steamid,
				season : env.handle_signup$season.id
			}).exec(after, env.$throw);
		},
		function(env, after, signup) {
			if (signup.length > 0) {
				env.filters.signups.update({
					medal : env.handle_signup$medal,
					statement : env.req.body.statement,
					captain : parseInt(env.req.body.captain),
					standin : parseInt(env.req.body.standin)
				}, {
					steamid : env.user.steamid,
					season : env.handle_signup$season.id
				}).exec(after, env.$throw);
			}
			else {
				env.filters.signups.insert({
					steamid : env.user.steamid,
					season : env.handle_signup$season.id,
					medal : env.handle_signup$medal,
					statement : env.req.body.statement,
					captain : parseInt(env.req.body.captain),
					standin : parseInt(env.req.body.standin)
				}).exec(after, env.$throw);
			}
		},
		function(env, after) {
			env.$redirect('/seasons/'+env.handle_signup$season.id);
			after();
		}
	),
	function(env, after) {
		env.$throw(new Error('You must be logged in to sign up'));
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

	server.add_route('/seasons/signup/:seasonid', {
		fn : handle_signup_form,
		pre : ['default'],
		post : ['default']
	}, 'post');

	server.add_route('/seasons/admin/create', {
		fn : season_create,
		pre : ['default'],
		post : ['default']
	}, 'get');

	server.add_route('/seasons/edit/:seasonid', {
		fn : edit_season,
		pre : ['default'],
		post : ['default']
	}, 'post');
}
