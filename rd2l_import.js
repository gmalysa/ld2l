
const PROFILE_RESOLVE_BATCH_SIZE = 10;
const ADD_TO_SEASON = 35;
const IMPORT_FILE_NAME = 'est-sun-players.csv';

let _ = require('underscore');
let db = require('db-filters');
let fl = require('flux-link');
let fs = require('fs');
let {parse} = require('csv-parse/sync');
let request = require('request');

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

let rd2l_signups = parse(fs.readFileSync(IMPORT_FILE_NAME), {
	columns : true,
	skip_empty_lines: true
});
logger.var_dump(rd2l_signups);

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
 * Given a list of the signup entry CSV records from RD2L's draft sheet export,
 * create signup entries in the database for them in the given season
 */
let create_signups = new fl.Chain(
	mysql.init_db,
	function(env, after, signups) {
		// Extract steam32 and add to all of them as a separate field
		signups.forEach(function(v) {
			let s32 = v.opendota.match(/[0-9]{4,}$/);
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
				core_mmr : parseInt(signup.draft_mmr) || 0,
				support_mmr : parseInt(signup.draft_mmr) || 0,
				unified_mmr : parseInt(signup.draft_mmr) || 0,
				mmr_screenshot : signup.mmr_screenshot,
				statement : signup.statement,
				pos_1 : parseInt("Role: Position 1") || 5,
				pos_2 : parseInt("Role: Position 2") || 5,
				pos_3 : parseInt("Role: Position 3") || 5,
				pos_4 : parseInt("Role: Position 4") || 5,
				pos_5 : parseInt("Role: Position 5") || 5,
				standin : 0,
				captain : 0,
			}).exec(after, env.$throw);
		},
		function(env, after) {
			env.idx = env.idx + 1;
			after();
		}
	),
	mysql.cleanup_db
).use_local_env(true);

let env = new fl.Environment();
//create_accounts.call(null, env, function() { logger.info('Finished'); },
//	["47669091", "142218997", "29074731"]);
create_signups.call(null, env, function() { logger.info('Finished'); }, rd2l_signups);
