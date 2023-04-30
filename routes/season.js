var fl = require('flux-link');
var db = require('db-filters');
var _ = require('underscore');
var dust = require('dustjs-linkedin');
require('dustjs-helpers');

var logger = require('../logger.js');

var config = require('../config.js');
var privs = require('../lib/privs.js');
var audit = require('../lib/audit.js');
var users = require('../lib/users.js');
var seasons = require('../lib/seasons.js');
var teams = require('../lib/teams.js');
var matches = require('../lib/matches.js');
var lobbies = require('../lib/lobbies.js');

var InhouseQueue = require('../lib/InhouseQueue.js');

/**
 * Helper used to check if someone has the ability to create seasons or not
 * @return true if they can modify seasons, false otherwise
 */
function checkSeasonPrivs(env, after) {
	after(privs.hasPriv(env.user.privs, privs.MODIFY_SEASON));
}

/**
 * Check if a player can queue for inhouses or not
 * @return true if they can queue for inhouses, false otherwise
 */
function canQueueInhouses(player) {
	return !(privs.hasPriv(player.privs, privs.INELIGIBLE)
		     || privs.hasPriv(player.privs, privs.BANNED));
}

/**
 * Preamble for all seasons, this sets up the season info that is needed on each page
 */
var season_preamble = new fl.Chain(
	function(env, after) {
		var id = parseInt(env.req.params.seasonid, 10);
		if (isNaN(id)) {
			env.$throw(new Error('Season not found'));
			return;
		}

		env.seasonId = id;
		after(id);
	},
	seasons.getSeasonBasic,
	function(env, after, season) {
		var isAdmin = privs.hasPriv(env.user.privs, privs.MODIFY_SEASON);

		// dustjs @eq only does string comparisons, so we need to convert an int value
		// to a string for comparison
		env.season = season;
		env.season.str_auction_autocash = "" + season.auction_autocash;
		env.$output({
			season : season,
			isAdmin : isAdmin
		});
		after();
	}
);

/**
 * Handler to rename a season
 */
var edit_season = new fl.Branch(
	checkSeasonPrivs,
	new fl.Chain(
		function(env, after) {
			var seasonStatus = parseInt(env.req.body.status) || 0;
			var seasonType = parseInt(env.req.body.type) || 0;
			var seasonLinear = parseInt(env.req.body.linearization) || 0;
			var seasonTicket = parseInt(env.req.body.ticket) || 0;
			let auctionBase = parseInt(env.req.body.auction_base) || 0;
			let auctionResolution = parseInt(env.req.body.auction_resolution) || 0;
			let auctionAutocash = (env.req.body.auction_autocash === 'on') ? 1 : 0;

			logger.var_dump(auctionAutocash);

			if (!env.req.body.name || !seasons.isValidStatus(seasonStatus)
				|| !seasons.isValidType(seasonType)
				|| !seasons.isValidLinearization(seasonLinear)) {
				env.$throw(new Error('Bad season update parameters given'));
				return;
			}

			env.newSeasonInfo = {
				name : env.req.body.name,
				status : seasonStatus,
				type : seasonType,
				ticket : seasonTicket,
				linearization : seasonLinear,
				auction_base : auctionBase,
				auction_resolution : auctionResolution,
				auction_autocash : auctionAutocash,
			};

			env.filters.seasons.update(env.newSeasonInfo, {id : env.season.id})
				.exec(after, env.$throw);
		},
		function(env, after) {
			after(env.user, audit.EVENT_EDIT, env.season, env.newSeasonInfo);
		},
		audit.logSeasonEvent,
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
 * Generate the main season hub page, which is just the details for a single season
 */
var season_hub = new fl.Chain(
	function(env, after) {
		var statusLabels = [
			{value : seasons.STATUS_HIDDEN, label : "Hidden"},
			{value : seasons.STATUS_SIGNUPS, label : "Signups"},
			{value : seasons.STATUS_PLAYING, label : "Playing"},
			{value : seasons.STATUS_DRAFTING, label : "Drafting"},
			{value : seasons.STATUS_FINISHED, label : "Finished"}
		];
		var typeLabels = [
			{value : seasons.TYPE_DRAFT, label : "EU/RD2L Draft"},
			{value : seasons.TYPE_IHL, label : "Inhouse League"},
			{value : seasons.TYPE_AUCTION, label : "Auction Draft"},
		];
		var linearLabels = [
			{value : seasons.LINEARIZATION_2018S1, label : "2018 Season 1"},
			{value : seasons.LINEARIZATION_2018S2, label : "2018 Season 2"},
			{value : seasons.LINEARIZATION_MAX_MMR, label : "Max MMR"},
			{value : seasons.LINEARIZATION_UNIFIED, label : "Unified MMR"},
		];

		statusLabels.forEach(function(v) {
			v.selected = '0';
			if (v.value == env.season.status)
				v.selected = '1';
		});

		typeLabels.forEach(function(v) {
			v.selected = '0';
			if (v.value == env.season.type)
				v.selected = '1';
		});

		linearLabels.forEach(function(v) {
			v.selected = '0';
			if (v.value == env.season.linearization)
				v.selected = '1';
		});

		env.$template('season_hub');
		env.$output({
			statuses : statusLabels,
			types : typeLabels,
			linearizations : linearLabels,
		});
		after();
	}
).use_local_env(true);

/**
 * Show the list of signups for the season, with filtering for ineligible/banned
 * players and standins (standins have their own page)
 */
var signups = new fl.Chain(
	function(env, after) {
		// Admins can see hidden signups but regular users cannot
		if (privs.hasPriv(env.user.privs, privs.MODIFY_SEASON)) {
			after(env.season, {valid_standin : 0, standin : 0});
		}
		else {
			after(env.season, {valid_standin : 0, standin : 0, hidden : 0});
		}
	},
	seasons.getSignups,
	function(env, after, signups) {
		var canSignUp = seasons.isAcceptingSignups(env.season);
		var signedUp = _.reduce(signups, function(memo, v, k) {
			return memo || (v.steamid == env.user.steamid);
		}, false);

		var scripts = ['sort', 'season'];

		env.$template('season_signups');
		env.$output({
			title : 'Signups',
			canSignUp : canSignUp && !signedUp,
			signedUp : signedUp,
			signups : signups,
			scripts : scripts,
			useSingleMMR : seasons.useSingleMMR(env.season),
		});
		after();
	}
).use_local_env(true);

/**
 * Export the signups to a csv format for easy download or import to google sheets
 */
var export_signups = new fl.Chain(
	function(env, after) {
		after(env.season, {hidden : 0});
	},
	seasons.getSignups,
	function(env, after, signups) {
		env.$template('season_csv_signups');
		env.$output({
			title : 'Signups Export',
			signups : signups
		});
		after();
	}
).use_local_env(true);

/**
 * Show the list of dedicated standins, which covers people who requested to be such
 * and people we moved to the standin list
 */
var standins = new fl.Chain(
	function(env, after) {
		after(env.season);
	},
	seasons.getStandins,
	function(env, after, signups) {
		env.$template('season_signups');
		env.$output({
			title : 'Standins',
			standins : true,
			signups : signups,
			scripts : ['sort', 'season']
		});
		after();
	}
).use_local_env(true);

/**
 * Show the list of draftable players as well as teams for draft interface
 */
var draft = new fl.Chain(
	function(env, after) {
		after(env.season);
	},
	seasons.getDraftableSignups,
	function(env, after, signups) {
		signups = _.sortBy(signups, function(v) {
			return -v.linear_medal;
		});
		env.$output({signups : signups});
		after(env.season.id);
	},
	teams.getAllTeams,
	function(env, after, teams) {
		if (env.season.type == seasons.TYPE_DRAFT)
			env.$template('season_draft');
		else if (env.season.type == seasons.TYPE_AUCTION)
			env.$template('season_auction_draft');
		else
			return env.$throw(new Error('This season cannot have a draft'));

		env.$output({
			title : 'Draft',
			scripts : ['sort', 'draft'],
			teams : teams
		});
		after();
	}
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
		function(env, after, result) {
			after(env.user, audit.EVENT_CREATE, {id : result.insertId}, {});
		},
		audit.logSeasonEvent,
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
		if (!seasons.isAcceptingSignups(env.season)) {
			env.$throw(new Error('This season is not currently accepting signups'));
			return;
		}

		// Find the correct steamid of the signup to edit
		var steamid = env.req.params.steamid;
		env.mySignup = true;
		if (undefined !== steamid && steamid != env.user.steamid) {
			env.mySignup = false;
			if (!privs.hasPriv(env.user.privs, privs.MODIFY_ACCOUNT)) {
				env.$throw(new Error('You do not have the ability to change signups'));
				return;
			}
		}
		else {
			steamid = env.user.steamid;
		}

		env.$output({
			steamid : steamid
		});

		env.filters.signups.select({
			steamid : steamid,
			season : env.season.id
		})
			.left_join(env.filters.users, 'u')
			.on(['steamid', 'steamid'])
			.fields(1, 'display_name')
			.exec(after, env.$throw);
	},
	function(env, after, signup) {
		if (signup.length > 0) {
			// dust uses === comparison and requires strings, so convert numbers we have
			env.$output({
				display_name : signup[0].display_name,
				statement : signup[0].statement,
				captain : signup[0].captain+'',
				standin : signup[0].standin+'',
				medal : signup[0].medal,
				core_mmr : signup[0].core_mmr,
				support_mmr : signup[0].support_mmr,
				unified_mmr : signup[0].unified_mmr,
				mmr_screenshot : signup[0].mmr_screenshot,
				mmr_valid : signup[0].mmr_valid,
				pos_1 : signup[0].pos_1+'',
				pos_2 : signup[0].pos_2+'',
				pos_3 : signup[0].pos_3+'',
				pos_4 : signup[0].pos_4+'',
				pos_5 : signup[0].pos_5+'',
				editSignup : true,
				fixedMedal : env.mySignup,
				use_single_mmr : seasons.useSingleMMR(env.season),
			});
		}
		else {
			env.$output({
				display_name : env.user.display_name,
				use_single_mmr : seasons.useSingleMMR(env.season),
			});
		}

		env.$template('season_signup');
		after();
	},
	new fl.Branch(
		function(env, after) {
			after(env.mySignup);
		},
		new fl.Chain(
			function(env, after) {
				after(env.user.id32);
			},
			users.getMedal,
			function(env, after, medal) {
				env.$output({medal : medal});
				after();
			}
		),
		function(env, after) {
			after();
		}
	)
).use_local_env(true);

/**
 * Handle a signup form and send them back if it was incomplete
 */
var handle_signup_form = new fl.Chain(
	function(env, after) {
		if (!seasons.isAcceptingSignups(env.season)) {
			env.$throw(new Error('This season is not currently accepting signups'));
			return;
		}

		var steamid = env.req.params.steamid;
		env.steamid = steamid;
		env.mySignup = true;
		if (undefined !== steamid && steamid != env.user.steamid) {
			env.mySignup = false;
			if (!privs.hasPriv(env.user.privs, privs.MODIFY_ACCOUNT)) {
				env.$throw(new Error('You do not have the ability to change signups'));
				return;
			}
		}
		else {
			env.steamid = env.user.steamid;
		}

		after();
	},
	new fl.Branch(
		function(env, after) {
			after(env.mySignup);
		},
		new fl.Chain(
			function(env, after) {
				after(env.user.id32);
			},
			users.getMedal,
			function(env, after, medal) {
				env.medal = medal;
				after();
			}
		),
		function(env, after) {
			env.medal = parseInt(env.req.body.medal);
			after();
		}
	),
	function(env, after) {
		env.filters.signups.select({
			steamid : env.steamid,
			season : env.season.id
		}).exec(after, env.$throw);
	},
	function(env, after, signup) {
		env.signup = signup[0];

		if (signup.length > 0) {
			var update = {
				medal : env.medal,
				statement : env.req.body.statement,
				captain : parseInt(env.req.body.captain),
				standin : parseInt(env.req.body.standin),
				pos_1 : parseInt(env.req.body.pos_1),
				pos_2 : parseInt(env.req.body.pos_2),
				pos_3 : parseInt(env.req.body.pos_3),
				pos_4 : parseInt(env.req.body.pos_4),
				pos_5 : parseInt(env.req.body.pos_5)
			};

			if (!signup[0].mmr_valid) {
				update.core_mmr = parseInt(env.req.body.core_mmr) || 0;
				update.support_mmr = parseInt(env.req.body.support_mmr) || 0;
				update.unified_mmr = parseInt(env.req.body.unified_mmr) || 0;
				update.mmr_screenshot = env.req.body.mmr_screenshot;
			}

			env.filters.signups.update(update, {
				steamid : env.steamid,
				season : env.season.id
			}).exec(after, env.$throw);
		}
		else {
			env.filters.signups.insert({
				time : db.$now(),
				steamid : env.steamid,
				season : env.season.id,
				medal : env.medal,
				core_mmr : parseInt(env.req.body.core_mmr) || 0,
				support_mmr : parseInt(env.req.body.support_mmr) || 0,
				unified_mmr : parseInt(env.req.body.unified_mmr) || 0,
				mmr_screenshot : env.req.body.mmr_screenshot,
				statement : env.req.body.statement,
				captain : parseInt(env.req.body.captain),
				standin : parseInt(env.req.body.standin),
				pos_1 : parseInt(env.req.body.pos_1),
				pos_2 : parseInt(env.req.body.pos_2),
				pos_3 : parseInt(env.req.body.pos_3),
				pos_4 : parseInt(env.req.body.pos_4),
				pos_5 : parseInt(env.req.body.pos_5)
			}).exec(after, env.$throw);
		}
	},
	function(env, after) {
		var data = {
			season : env.season.id,
			medal : env.medal,
			statement : env.req.body.statement.substring(0, 255),
			captain : parseInt(env.req.body.captain),
			standin : parseInt(env.req.body.standin),
			pos_1 : parseInt(env.req.body.pos_1),
			pos_2 : parseInt(env.req.body.pos_2),
			pos_3 : parseInt(env.req.body.pos_3),
			pos_4 : parseInt(env.req.body.pos_4),
			pos_5 : parseInt(env.req.body.pos_5)
		};

		// Only store these if they were available to edit
		if (!env.signup || !env.signup.mmr_valid) {
			data.core_mmr = parseInt(env.req.body.core_mmr) || 0;
			data.support_mmr = parseInt(env.req.body.support_mmr) || 0;
			data.unified_mmr = parseInt(env.req.body.unified_mmr) || 0;
			data.mmr_screenshot = env.req.body.mmr_screenshot.substring(0, 128);
		}

		after(env.user, audit.EVENT_EDIT, {
			steamid : env.steamid
		}, data);
	},
	audit.logUserEvent,
	function(env, after) {
		env.$template('season_after_signup');
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

/**
 * Get and display the leaderboard for an inhouse season
 */
var show_leaderboard = new fl.Chain(
	function(env, after) {
		if (seasons.TYPE_IHL != env.season.type) {
			env.$throw(new Error('This season is not an inhouse league and has no leaderboard!'));
			return;
		}
		after(env.season);
	},
	matches.getLeaderboards,
	function(env, after, leaderboard) {
		env.$template('leaderboard');
		env.$output({
			season : env.season,
			leaderboard : leaderboard
		});
		after();
	}
).use_local_env(true);

/**
 * Show inhouse page for an inhouse enabled season
 */
var show_queue = new fl.Chain(
	function(env, after) {
		if (seasons.TYPE_IHL != env.season.type) {
			env.$throw(new Error('This is not an inhouse season and has no queue.'));
			return;
		}

		after(env.season);
	},
	InhouseQueue.getQueue,
	function(env, after, queue) {
		// Fetch the queue object here so that queueing works for the first visitor

		env.$template('season_inhouse');
		env.$output({
			canQueueInhouses : canQueueInhouses(env.user),
			scripts : ['inhouses', 'menu']
		});

		after();
	}
).use_local_env(true);

/**
 * Add a player to the inhouse queue
 */
var queue_for_inhouse = new fl.Chain(
	function(env, after) {
		if (seasons.TYPE_IHL != env.season.type) {
			env.$throw(new Error('This is not an inhouse season and has no queue.'));
			return;
		}

		if (!canQueueInhouses(env.user)) {
			env.$throw(new Error('You are not allowed to play inhouses'));
			return;
		}

		after(env.user, env.season);
	},
	matches.getPlayerSeasonRecord,
	function(env, after, record) {
		env.user.wins = record.wins;
		env.user.losses = record.losses;
		after(env.season);
	},
	InhouseQueue.getQueue,
	function(env, after, queue) {
		env.$json({
			success : queue.addPlayer(env.user)
		});
		after();
	}
).use_local_env(true);

/**
 * Remove a player from the inhouse queue
 */
var leave_inhouse_queue = new fl.Chain(
	function(env, after) {
		if (seasons.TYPE_IHL != env.season.type) {
			env.$throw(new Error('This is not an inhouse season and has no queue.'));
			return;
		}

		after(env.season);
	},
	InhouseQueue.getQueue,
	function(env, after, queue) {
		env.$json({
			success : queue.removePlayer(env.user)
		});
		after();
	}
).use_local_env(true);

/**
 * Inhouse game results need to be added to the database
 */
var inhouse_results = new fl.Chain(
	function(env, after) {
		logger.var_dump(env.req.body);

		if (env.req.body.key != config.kbaas_key) {
			env.$throw(new Error('Incorrect API key given'));
			return;
		}

		after();
	},
	new fl.Branch(
		function(env, after) {
			// Only save results on state 5, sending results
			after(env.req.body.state == 5);
		},
		new fl.Chain(
			function(env, after) {
				env.filters.matches.insert({
					season : env.season.id,
					week : 0,
					home : 0,
					away : 0,
					result : 0,
					dotaid : 0,
					playoff : 0
				}).exec(after, env.$throw);
			},
			function(env, after, match) {
				after(env.req.body.match, lobbies.RESULTS_FORMAT_KAEDEBOT, match.insertId);
			},
			lobbies.parseResults
		),
		function(env, after) {
			after();
		}
	)
);

/**
 * Factory method for generating signup toggle routes
 * @param[in] options.fieldName Name of the database field in the signup to update
 */
function makeToggleRouteHandler(options) {
	return new fl.Branch(
		checkSeasonPrivs,
		new fl.Chain(
			function(env, after) {
				var data = {};
				data[options.fieldName] = env.req.body.flag ? 1 : 0;

				env.$json({success : true});
				env.filters.signups.update(data, {
					steamid : env.req.body.steamid,
					season : parseInt(env.req.body.season)
				}).limit(1).exec(after, env.$throw);
			},
			function(env, after) {
				var data = {
					season : parseInt(env.req.body.season)
				};
				data[options.fieldName] = env.req.body.flag;

				after(env.user, audit.EVENT_SIGNUP_FLAG, {
					steamid : env.req.body.steamid
				}, data);
			},
			audit.logUserEvent
		),
		function(env, after) {
			env.$throw(new Error('You cannot change signup attributes!'));
		}
	);
}

var hide_signup = makeToggleRouteHandler({fieldName : 'hidden'});
var lock_mmr = makeToggleRouteHandler({fieldName : 'mmr_valid'});
var mark_standin = makeToggleRouteHandler({fieldName : 'valid_standin'});
var mark_draftable = makeToggleRouteHandler({fieldName : 'draftable'});

/**
 * Chain used to get season information for display in the sidebar
 */
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
	server.add_pre_hook(season_preamble, 'season');

	InhouseQueue.setup(server.io);

	server.add_route('/seasons', {
		fn : season_index,
		pre : ['default', 'optional_user'],
		post : ['default']
	}, 'get');

	server.add_route('/seasons/:seasonid', {
		fn : season_hub,
		pre : ['default', 'optional_user', 'season'],
		post : ['default']
	}, 'get');

	server.add_route('/seasons/:seasonid/signups', {
		fn : signups,
		pre : ['default', 'optional_user', 'season'],
		post : ['default']
	}, 'get');

	server.add_route('/seasons/:seasonid/standins', {
		fn : standins,
		pre : ['default', 'optional_user', 'season'],
		post : ['default']
	}, 'get');

	server.add_route('/seasons/:seasonid/draft', {
		fn : draft,
		pre : ['default', 'optional_user', 'season'],
		post : ['default']
	}, 'get');

	server.add_route('/seasons/signup/:seasonid', {
		fn : show_signup_form,
		pre : ['default', 'require_user', 'season'],
		post : ['default']
	}, 'get');

	server.add_route('/seasons/signup/:seasonid', {
		fn : handle_signup_form,
		pre : ['default', 'require_user', 'season'],
		post : ['default']
	}, 'post');

	server.add_route('/seasons/signup/:seasonid/:steamid', {
		fn : show_signup_form,
		pre : ['default', 'require_user', 'season'],
		post : ['default']
	}, 'get');

	server.add_route('/seasons/signup/:seasonid/:steamid', {
		fn : handle_signup_form,
		pre : ['default', 'require_user', 'season'],
		post : ['default']
	}, 'post');

	server.add_route('/seasons/admin/create', {
		fn : season_create,
		pre : ['default', 'require_user'],
		post : ['default']
	}, 'get');

	server.add_route('/seasons/:seasonid/edit', {
		fn : edit_season,
		pre : ['default', 'require_user', 'season'],
		post : ['default']
	}, 'post');

	server.add_route('/seasons/:seasonid/export', {
		fn : export_signups,
		pre : ['default', 'require_user', 'season'],
		post : ['default']
	}, 'get');

	server.add_route('/seasons/new_team', {
		fn : create_team,
		pre : ['default', 'require_user'],
		post : ['default']
	}, 'post');

	server.add_route('/seasons/:seasonid/leaderboard', {
		fn : show_leaderboard,
		pre : ['default', 'optional_user', 'season'],
		post : ['default']
	}, 'get');

	server.add_route('/seasons/:seasonid/inhouses', {
		fn : show_queue,
		pre : ['default', 'require_user', 'season'],
		post : ['default']
	}, 'get');

	server.add_route('/seasons/:seasonid/inhouses/queue', {
		fn : queue_for_inhouse,
		pre : ['default', 'require_user', 'season'],
		post : ['default']
	}, 'post');

	server.add_route('/seasons/:seasonid/inhouses/leaveQueue', {
		fn : leave_inhouse_queue,
		pre : ['default', 'require_user', 'season'],
		post : ['default']
	}, 'post');

	server.add_route('/seasons/:seasonid/inhouses/results', {
		fn : inhouse_results,
		pre : ['default', 'optional_user', 'season'],
		post : ['default']
	}, 'post');

	server.add_route('/seasons/hide_signup', {
		fn : hide_signup,
		pre : ['default', 'require_user'],
		post : ['default']
	}, 'post');

	server.add_route('/seasons/lock_mmr', {
		fn : lock_mmr,
		pre : ['default', 'require_user'],
		post : ['default']
	}, 'post');

	server.add_route('/seasons/mark_draftable', {
		fn : mark_draftable,
		pre : ['default', 'require_user'],
		post : ['default']
	}, 'post');

	server.add_route('/seasons/mark_standin', {
		fn : mark_standin,
		pre : ['default', 'require_user'],
		post : ['default']
	}, 'post');

	server.add_dust_helpers({
		season_status : function(chunk, context, bodies, params) {
			var status = parseInt(dust.helpers.tap(params.status, chunk, context));

			if (seasons.STATUS_HIDDEN == status)
				chunk.write('Hidden');
			else if (seasons.STATUS_SIGNUPS == status)
				chunk.write('Accepting signups');
			else if (seasons.STATUS_PLAYING == status)
				chunk.write('Playing');
			else if (seasons.STATUS_FINISHED == status)
				chunk.write('Ended');
			else if (seasons.STATUS_DRAFTING == status)
				chunk.write('Drafting players');
			else
				chunk.write('Unrecognized status: '+status);

			return chunk;
		},
		season_type : function(chunk, context, bodies, params) {
			var type = parseInt(dust.helpers.tap(params.type, chunk, context));

			if (seasons.TYPE_DRAFT == type)
				chunk.write('EU/RD2L Draft');
			else if (seasons.TYPE_IHL == type)
				chunk.write('Inhouse League');
			else if (seasons.TYPE_AUCTION == type)
				chunk.write('Auction Draft');
			else
				chunk.write('Unrecognized type: '+type);

			return chunk;
		},
		season_linearization : function(chunk, context, bodies, params) {
			var linear = parseInt(dust.helpers.tap(params.linear, chunk, context));

			if (seasons.LINEARIZATION_2018S1 == linear)
				chunk.write('2018 January-July');
			else if (seasons.LINEARIZATION_2018S2 == linear)
				chunk.write('2018 August-December');
			else if (seasons.LINEARIZATION_MAX_MMR == linear)
				chunk.write('Max of MMRs');
			else if (seasons.LINEARIZATION_UNIFIED == linear)
				chunk.write('Single MMR');
			else
				chunk.write('Unrecognized linearization: '+linear);

			return chunk;
		}
	});

	server.add_dust_filters({
		csv : function(content) {
			return content.replace(/,/g, '').replace(/\n/g, '').replace(/\r/g, '');
		}
	});
}
