/**
 * @todo this needs audit logging of changes being made
 */

var fl = require('flux-link');
var db = require('db-filters');
var _ = require('underscore');
var request = require('request');

var privs = require('../lib/privs.js');
var users = require('../lib/users.js');
var seasons = require('../lib/seasons.js');
var teams = require('../lib/teams.js');

/**
 * Helper chain that is used to check if someone has the ability to create seasons or not
 * @return true if they can modify seasons, false otherwise
 */
function checkSeasonPrivs(env, after) {
	after(privs.hasPriv(env.user.privs, privs.MODIFY_SEASON));
}

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
		after(id);
	},
	seasons.getSeason,
	function (env, after, season) {
		var canEdit = privs.hasPriv(env.user.privs, privs.MODIFY_SEASON);
		var canSignUp = true;
		var signedUp = _.reduce(season.signups, function(memo, v, k) {
			return memo || (v.steamid == env.user.steamid);
		}, false);
		var statusLabels = [
			{value : seasons.STATUS_HIDDEN, label : "Hidden"},
			{value : seasons.STATUS_SIGNUPS, label : "Signups"},
			{value : seasons.STATUS_PLAYING, label : "Playing"},
			{value : seasons.STATUS_DRAFTING, label : "Drafting"},
			{value : seasons.STATUS_FINISHED, label : "Finished"}
		];
		var isDrafting = (season.status == seasons.STATUS_DRAFTING);
		var scripts = [];

		statusLabels.forEach(function(v, k) {
			if (v.value == season.status)
				v.selected = '1';
			else
				v.selected = '0';
		});

		if (isDrafting || canEdit) {
			scripts.push('draft');
			scripts.push('sort');
		}

		env.season = season;
		env.$template('season_info');
		env.$output({
			canSignUp : canSignUp && !signedUp && !isDrafting,
			signedUp : signedUp && !isDrafting,
			canEditSeason : canEdit,
			isDrafting : isDrafting,
			showTeams : false,
			statuses : statusLabels,
			season : season,
			scripts : scripts
		});
		after();
	},
	new fl.Branch(
		function(env, after) {
			after(env.season.status == seasons.STATUS_DRAFTING);
		},
		new fl.Chain(
			function(env, after) {
				after(env.season.id);
			},
			teams.getAllTeams,
			function(env, after, teams) {
				env.$output({teams : teams});
				after();
			}
		),
		function(env, after) {
			after();
		}
	)
).use_local_env(true);

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
var show_signup_form = new fl.Chain(
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
);

/**
 * Handle a signup form and send them back if it was incomplete
 */
var handle_signup_form = new fl.Chain(
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
				time : db.$now(),
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
);

/**
 * Ajax callback to create a new team with the given captain
 */
var create_team = new fl.Chain(
	function(env, after) {
		env.seasonId = parseInt(env.req.body.season);
		if (isNaN(env.seasonId)) {
			env.$throw(new Error('Invalid season ID specified'));
			return;
		}

		env.steamid = env.req.body.steamid;
		after(env.seasonId);
	},
	seasons.getSeason,
	function(env, after, season) {
		env.season = season;
		env.foundPlayer = season.signups.reduce(function(memo, v) {
			return memo || (v.steamid == env.steamid);
		}, false);

		if (!env.foundPlayer) {
			env.$throw(new Error('Nobody with this steam ID signed up'));
			return;
		}

		after(env.steamid);
	},
	users.getUser,
	function(env, after, captain) {
		after(env.user, captain, env.season.id);
	},
	teams.create,
	function(env, after, team) {
		env.$json({
			name : team.name,
			id : team.id,
		});
		after();
	}
).use_local_env(true);

var sidebar_seasons = new fl.Chain(
	function(env, after) {
		env.filters.seasons.select({
			status : [
				seasons.STATUS_SIGNUPS,
				seasons.STATUS_PLAYING,
				seasons.STATUS_DRAFTING
			]
		}).exec(after, env.$throw);
	},
	function(env, after, seasons) {
		env.$output({
			'sidebar_seasons' : seasons
		});
		after();
	}
);

module.exports.init_routes = function(server) {
	server.add_pre_hook(sidebar_seasons, 'default');

	server.add_route('/seasons', {
		fn : season_index,
		pre : ['default', 'optional_user'],
		post : ['default']
	}, 'get');

	server.add_route('/seasons/:seasonid', {
		fn : season_info,
		pre : ['default', 'optional_user'],
		post : ['default']
	}, 'get');

	server.add_route('/seasons/signup/:seasonid', {
		fn : show_signup_form,
		pre : ['default', 'require_user'],
		post : ['default']
	}, 'get');

	server.add_route('/seasons/signup/:seasonid', {
		fn : handle_signup_form,
		pre : ['default', 'require_user'],
		post : ['default']
	}, 'post');

	server.add_route('/seasons/admin/create', {
		fn : season_create,
		pre : ['default', 'require_user'],
		post : ['default']
	}, 'get');

	server.add_route('/seasons/edit/:seasonid', {
		fn : edit_season,
		pre : ['default', 'require_user'],
		post : ['default']
	}, 'post');

	server.add_route('/seasons/new_team', {
		fn : create_team,
		pre : ['default', 'require_user'],
		post : ['default']
	}, 'post');
}
