
const PROFILE_RESOLVE_BATCH_SIZE = 10;
const ADD_TO_SEASON = 36;
const IMPORT_FILE_NAME = 'sealson1.csv';

let _ = require('underscore');
let db = require('db-filters');
let fl = require('flux-link');
let fs = require('fs');
let {parse} = require('csv-parse/sync');
let request = require('request');
var animals = require('animals');
var adjectives = require('superb');

let config = require('./config.js');
let logger = require('./logger');
let mysql = require('./mysql');
let users = require('./lib/users.js');

// Database static init before doing other stuff
mysql.init();
db.init(process.cwd() + '/filters', function(file) {
	logger.info('Adding database definition ' + file.blue.bold + '...', 'db-filters');
}, db.l_info);

db.set_log(function(msg) {
	logger.info(msg, 'db-filters');
});

let seal_signups = parse(fs.readFileSync(IMPORT_FILE_NAME), {
	columns : true,
	skip_empty_lines: true
});
logger.var_dump(seal_signups);

/**
 * Given a list of 32 bit steam account IDs, try to resolve and create all of the
 * profiles via steam webapi
 * @param[in] array of steam id32 values
 *
 * @todo there's a bug with passing the output of one fl.p.map to another fl.p.map
 * maybe the underlying type is not correct for Object.keys()
 */
let create_accounts = new fl.Chain(
	function(env, after, steamids) {
		env.steamids = steamids;
		after(steamids);
	},
	fl.p.map(users.findUserId),
	function(env, after, steamid64s) {
		env.steamid64s = steamid64s;
		env.idx = 0;
		env.newUsers = [];
		env.newProfiles = [];
		after();
	},
	new fl.LoopChain(
		function(env, after) {
			after(env.idx < env.steamid64s.length);
		},
		function(env, after) {
			after(env.steamid64s[env.idx]);
		},
		users.getUser,
		function(env, after, user) {
			if (user == null)
				env.newUsers.push(env.steamid64s[env.idx]);
			env.idx = env.idx + 1;
			after();
		}
	),
	new fl.LoopChain(
		function(env, after) {
			// Try to batch some number of IDs at a time
			if (env.newUsers.length > 0) {
				let idstring = env.newUsers.splice(0, PROFILE_RESOLVE_BATCH_SIZE).join(',');
				env.idstring = idstring;
				after(true);
			}
			else {
				after(false);
			}
		},
		function(env, after) {
			request('http://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/' +
				'?key=' + config.steam_api_key +
				'&steamids=' + encodeURIComponent(env.idstring),
				env.$check(after));
		},
		function(env, after, response, body) {
			let data = JSON.parse(body);
			logger.var_dump(data);
			let profiles = data.response.players.map(function(v) {
				return {
					id : v.steamid,
					displayName : v.personaname,
					_json : {
						avatar : v.avatar,
					},
				};
			});

			Array.prototype.push.apply(env.newProfiles, profiles);
			after();
		}
	),
	function(env, after) {
		env.idx = 0;
		after();
	},
	new fl.LoopChain(
		function(env, after) {
			after(env.idx < env.newProfiles.length);
		},
		function(env, after) {
			env.profile = env.newProfiles[env.idx];
			logger.debug('Adding profile: ');
			logger.var_dump(env.newProfiles[env.idx]);
			after(env.newProfiles[env.idx].id);
		},
		users.addUser,
		function(env, after, user) {
			logger.var_dump(user);
			env.idx = env.idx + 1;
			after();
		}
	)
).use_local_env(true);

/**
 * Make teams based on the fields in the csv and then assign people to the
 * teams
 */
let create_teams = new fl.Chain(
	function(env, after) {
		env.teams = [];
		env.signups.forEach(function(v, k) {
			let idx = parseInt(v.index) - 1;
			let cap = parseInt(v.is_cap);

			if (!env.teams[idx]) {
				env.teams[idx] = { players : [] };
			}

			if (cap)
				env.teams[idx].captain = v;
			else
				env.teams[idx].players.push(v);

			v.team = env.teams[idx];
			logger.info(v.display_name+' on team '+idx);
		});

		env.idx = 0;
		after();
	},
	new fl.LoopChain(
		function(env, after) {
			after(env.idx < env.teams.length);
		},
		function(env, after) {
			env.teams[env.idx].name = adjectives() +  ' ' + animals();
			env.filters.teams.insert({
				captainid : env.teams[env.idx].captain.steamid,
				seasonid : ADD_TO_SEASON,
				name : env.teams[env.idx].name,
			}).exec(after, env.$throw);
		},
		function(env, after, result) {
			if (result.insertId > 0) {
				env.teams[env.idx].id = result.insertId;
				logger.info('Created team '+env.teams[env.idx].name);
				env.idx = env.idx + 1;
				after();
			}
			else {
				env.$throw(new Error('DB error creating team'));
			}
		}
	),
	function(env, after) {
		env.idx = 0;
		after();
	},
	new fl.LoopChain(
		function(env, after) {
			after(env.idx < env.signups.length);
		},
		function(env, after) {
			let signup = env.signups[env.idx];
			logger.info('Set team for '+signup.display_name);
			env.filters.signups.update({
				teamid : signup.team.id
			}, {
				season : ADD_TO_SEASON,
				steamid : signup.steamid,
			}).exec(after, env.$throw);
		},
		function(env, after) {
			env.idx = env.idx + 1;
			after();
		}
	),
).use_local_env(true);

/**
 * Given a list of the signup entry CSV records from SEAL's draft sheet in granola
 * format create signup entries in the database for them in the given season
 */
let create_signups = new fl.Chain(
	mysql.init_db,
	function(env, after, signups) {
		// Extract steam32 and add to all of them as a separate field
		signups.forEach(function(v) {
			let s32 = v.dotabuff.match(/[0-9]{4,}$/);
			v.steam32 = s32;
		});
		let steamids = signups.map(function(v) {
			return v.steam32;
		});
		env.signups = signups;
		after(steamids);
	},
	create_accounts,
	function(env, after) {
		env.idx = 0;
		after();
	},
	new fl.LoopChain(
		function(env, after) {
			after(env.idx < env.signups.length);
		},
		function(env, after) {
			after(env.signups[env.idx].steam32);
		},
		users.getUser,
		function(env, after, user) {
			env.signups[env.idx].steamid = user.steamid;
			env.signups[env.idx].display_name = user.display_name;
			env.idx = env.idx + 1;
			after();
		}
	),
	function(env, after) {
		env.idx = 0;
		after();
	},
	new fl.LoopChain(
		function(env, after) {
			after(env.idx < env.signups.length);
		},
		function(env, after) {
			let signup = env.signups[env.idx];
			env.filters.signups.insert({
				steamid : signup.steamid,
				time : db.$now(),
				season : ADD_TO_SEASON,
				medal : parseInt(signup.rank) || 0,
				core_mmr : parseInt(signup.adjusted) || 0,
				support_mmr : parseInt(signup.adjusted) || 0,
				unified_mmr : parseInt(signup.adjusted) || 0,
				mmr_screenshot : signup.mmr_screenshot || '',
				statement : signup.statement || '',
				pos_1 : 1,
				pos_2 : 2,
				pos_3 : 3,
				pos_4 : 4,
				pos_5 : 5,
				standin : 0,
				captain : 0,
			}).exec(after, env.$throw);
		},
		function(env, after) {
			env.idx = env.idx + 1;
			after();
		}
	),
	create_teams,
	mysql.cleanup_db
).use_local_env(true);

let env = new fl.Environment();
//create_accounts.call(null, env, function() { logger.info('Finished'); },
//	["47669091", "142218997", "29074731"]);
create_signups.call(null, env, function() { logger.info('Finished'); }, seal_signups);
