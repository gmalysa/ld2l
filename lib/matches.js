/**
 * Everything to do with matches and their results
 */

var pairing_options = {
	maxPointsPerRound : 2
};

var _ = require('underscore');
var fl = require('flux-link');
var db = require('db-filters');
var pairing = require('swiss-pairing')(pairing_options);

var users = require('../lib/users.js');
var teams = require('../lib/teams.js');
var seasons = require('../lib/seasons.js');

// Match played status constants
const MATCHES_UNPLAYED = 0;
const MATCHES_HOME_WIN = 1;
const MATCHES_AWAY_WIN = 2;
const MATCHES_HOME_FORFEIT = 3;
const MATCHES_AWAY_FORFEIT = 4;
const MATCHES_DOUBLE_FORFEIT = 5;

// List of property constants for match links
const PROPERTY_LEVEL = 1;
const PROPERTY_HERO = 2;
const PROPERTY_KILLS = 3;
const PROPERTY_DEATHS = 4;
const PROPERTY_ASSISTS = 5;
const PROPERTY_LAST_HITS = 6;
const PROPERTY_DENIES = 7;
const PROPERTY_GPM = 8;
const PROPERTY_XPM = 9;
const PROPERTY_DAMAGE = 10;
const PROPERTY_HEALING = 11;
const PROPERTY_TOWER_DAMAGE = 12;
const PROPERTY_TEAM = 13;
const PROPERTY_NET_WORTH = 14;
const PROPERTY_ITEM_MIN = 100;
const PROPERTY_ITEM_MAX = 120;

// Possible values for PROPERTY_TEAM
const PROPERTY_TEAM_HOME = 0;
const PROPERTY_TEAM_AWAY = 1;

// This maps from database constant values to keys on the object
const PROPERTY_MAP = {
	[PROPERTY_LEVEL] : 'level',
	[PROPERTY_HERO] : 'hero',
	[PROPERTY_KILLS] : 'kills',
	[PROPERTY_DEATHS] : 'deaths',
	[PROPERTY_ASSISTS] : 'assists',
	[PROPERTY_LAST_HITS] : 'last_hits',
	[PROPERTY_DENIES] : 'denies',
	[PROPERTY_GPM] : 'gpm',
	[PROPERTY_XPM] : 'xpm',
	[PROPERTY_DAMAGE] : 'damage',
	[PROPERTY_HEALING] : 'healing',
	[PROPERTY_TOWER_DAMAGE] : 'tower_damage',
	[PROPERTY_TEAM] : 'team',
	[PROPERTY_NET_WORTH] : 'net_worth',

	// Values between item min and max are handled specially
}

/**
 * Helper to calculate the current round for a given list of series
 * @param[in] series Array of matchups as produced by parseMatches
 * @return Week/Round number
 */
function findWeek(series) {
	return 1 + _.reduce(series, function(memo, v) {
		return v.round > memo ? v.round : memo;
	}, 0);
}

/**
 * Is the result one of the possible home victory results?
 */
function isHomeWin(r) {
	return MATCHES_HOME_WIN == r.result || MATCHES_AWAY_FORFEIT == r.result;
}

/**
 * Is the result one of the possible away victory results
 */
function isAwayWin(r) {
	return MATCHES_AWAY_WIN == r.result || MATCHES_HOME_FORFEIT == r.result;
}

/**
 * Get the details for a specific match by ID
 * @param[in] int match id
 * @return Match object including full details that are available
 *         - both teams (as objects)
 *         - results
 *         - all players (as objects)
 *         - player stats linked to each
 */
var getMatchDetails = new fl.Chain(
	function(env, after, id) {
		env.matchId = id;
		env.filters.matches.select({id : id})
			.exec(after, env.$throw);
	},
	function(env, after, match) {
		env.match = match[0];
		after(env.match.home);
	},
	teams.get,
	function(env, after, team) {
		env.match.home = team;
		after(env.match.away);
	},
	teams.get,
	function(env, after, team) {
		env.match.away = team;
		after(env.match.season);
	},
	seasons.getSeasonBasic,
	function(env, after, season) {
		env.match.season = season;
		env.filters.match_links.select({matchid : env.match.id})
			.exec(after, env.$throw);
	},
	function(env, after, links) {
		env.match.players = {};

		// Decode properties onto player list
		_.each(links, function(link) {
			if (undefined === env.match.players[link.steamid]) {
				env.match.players[link.steamid] = {
					steamid : link.steamid,
					items : []
				};
			}

			if (undefined !== PROPERTY_MAP[link.property]) {
				env.match.players[link.steamid][PROPERTY_MAP[link.property]] = link.value;
			}
			else {
				// Item to add
				env.match.players[link.steamid].items.push(link.value);
			}
		});

		// Assign players to teams
		env.match.home.match_players = [];
		env.match.away.match_players = [];
		_.each(env.match.players, function(v, k) {
			if (PROPERTY_TEAM_HOME == v.team) {
				env.match.home.match_players.push(v);
			}
			else {
				env.match.away.match_players.push(v);
			}
		});

		env.idx = 0;
		env.maxIdx = _.size(env.match.players);
		env.players = _.toArray(env.match.players);
		after();
	},
	new fl.LoopChain(
		function(env, after) {
			after(env.idx < env.maxIdx);
		},
		function(env, after) {
			after(env.players[env.idx].steamid);
		},
		users.getUser,
		function(env, after, player) {
			env.players[env.idx] = _.extend(env.players[env.idx], player);
			env.idx += 1;
			after();
		}
	),
	function(env, after) {
		// Check if valid teams were found and assign Radiant/Dire names if not
		if (undefined === env.match.home.id)
			env.match.home.name = 'Radiant';
		if (undefined === env.match.away.id)
			env.match.away.name = 'Dire';

		after(env.match);
	}
).use_local_env(true);

/**
 * Parse any collection of individual games from the database into a list of match objects
 * Team info is not added at this stage but placeholder nulls are included
 * @param[in] matches Array of results rows from the database
 * @return Object with the series in an unspecified order
 */
var parseMatches = new fl.Chain(
	function(env, after, matches) {
		env.matches = {};

		matches.forEach(function(v, k) {
			var key = v.season + '-' + v.week + '-' + v.home + '-' + v.away;
			if (env.matches[key] === undefined) {
				env.matches[key] = {
					key : key,
					home : {
						id : v.home,
						points : 0,
						ff : 0,
						team : null
					},
					away : {
						id : v.away,
						points : 0,
						ff : 0,
						team : null
					},
					round : v.week,
					season : env.id,
					playoff : v.playoff,
					games : []
				};
			}

			switch (v.result) {
				case MATCHES_HOME_WIN:
					env.matches[key].home.points += 1;
					break;
				case MATCHES_AWAY_WIN:
					env.matches[key].away.points += 1;
					break;
				case MATCHES_HOME_FORFEIT:
					env.matches[key].away.points += 1;
					env.matches[key].home.ff += 1;
					break;
				case MATCHES_AWAY_FORFEIT:
					env.matches[key].home.points += 1;
					env.matches[key].away.ff += 1;
					break;
				case MATCHES_DOUBLE_FORFEIT:
					env.matches[key].home.ff += 1;
					env.matches[key].away.ff += 1;
					break;
			}

			env.matches[key].games.push(v);
		});

		after(_.values(env.matches));
	}
).use_local_env(true);

/**
 * Given the result of parseMatches, add team information to each series. Note that
 * caching or being intelligent is up to teams.get to take care of.
 * @param[in] matches list of matches from parseMatches
 * @return Same list but with team objects added
 */
var addTeamInfo = new fl.Chain(
	function(env, after, matches) {
		env.matches = matches;
		env.matchIdx = 0;
		after();
	},
	new fl.LoopChain(
		function(env, after) {
			after(env.matchIdx < env.matches.length);
		},
		function(env, after) {
			after(env.matches[env.matchIdx].home.id);
		},
		teams.getCached,
		function(env, after, team) {
			env.matches[env.matchIdx].home.team = team;
			after(env.matches[env.matchIdx].away.id);
		},
		teams.getCached,
		function(env, after, team) {
			env.matches[env.matchIdx].away.team = team;
			env.matchIdx += 1;
			after();
		}
	),
	function(env, after) {
		after(env.matches);
	}
).use_local_env(true);

/**
 * Create a new series between two teams, including one or more matches
 * @param[in] config Configuration object with this structure:
 * 	{
 * 	  int season,
 * 	  int week,
 * 	  int home,
 * 	  int away,
 * 	  int playoff
 * 	}
 * @param[in] count Number of matches to create in this series
 * @return array of created match ids
 */
var createSeries = new fl.Chain(
	function(env, after, config, count) {
		env.data = _.extend({
			season : 0,
			week : 0,
			home : 0,
			away : 0,
			result : 0,
			dotaid : 0,
			playoff : 0
		}, config);

		env.count = count;
		env.idx = 0;
		env.matchIDs = [];
		after();
	},
	new fl.LoopChain(
		function(env, after) {
			after(env.idx < env.count);
		},
		function(env, after) {
			env.filters.matches.insert(env.data).exec(after, env.$throw);
		},
		function(env, after, result) {
			env.matchIDs.push(result.insertId);
			env.idx += 1;
			after();
		}
	),
	function(env, after) {
		after(env.matchIDs);
	}
).use_local_env(true);

/**
 * Generate the next round of matches after results have been recorded
 * @param[in] id The season ID to generate the next round of matches for
 */
var generateMatchups = new fl.Chain(
	function(env, after, season) {
		env.season = season;
		env.id = season;
		after(season);
	},
	teams.getAllTeams,
	function(env, after, teams) {
		env.participants = teams.map(function(v) {
			return {
				id : v.id,
				seed : v.medal,
				droppedOut : v.disbanded
			};
		});

		// Ignore playoff bracket matches, although there shouldn't be any if we're
		// making new matchups for regular season games
		env.filters.matches.select({
			season : env.season,
			playoff : 0
		}).exec(after, env.$throw);
	},
	parseMatches,
	function(env, after, series) {
		var week = findWeek(series);
		env.matchups = pairing.getMatchups(week, env.participants, series);
		env.week = week;
		env.matchIdx = 0;
		after();
	},
	new fl.LoopChain(
		function(env, after) {
			after(env.matchIdx < env.matchups.length);
		},
		function(env, after) {
			after({
				season : env.season,
				week : env.week,
				home : env.matchups[env.matchIdx].home,
				away : env.matchups[env.matchIdx].away,
				result : 0
			}, 2);
			env.matchIdx += 1;
		},
		createSeries
	)
).use_local_env(true);

/**
 * Add win/loss information and season standings + points to the given array of teams
 * @param[in] teams Array of team objects
 * @param[in] seasonId Season ID to use for finding matches
 * @return New teams array with the updated objects (old objects are modified too)
 */
var addStandings = new fl.Chain(
	function(env, after, teams, seasonId) {
		if (!(seasonId > 0)) {
			env.$throw(new Error('Season ID must be > 0.'));
			return;
		}

		env.id = seasonId;
		env.teams = {};
		teams.forEach(function(v) {
			env.teams[v.id] = v;
		});
		env.participants = teams.map(function(v) {
			return {
				id : v.id,
				seed : v.medal
			};
		});

		env.filters.matches.select({
			season : seasonId,
			playoff : 0
		}).exec(after, env.$throw);
	},
	parseMatches,
	function(env, after, series) {
		var week = findWeek(series);
		var standings = pairing.getStandings(week, env.participants, series);
		standings.forEach(function(v) {
			env.teams[v.id].wins = v.wins;
			env.teams[v.id].losses = v.losses;
			env.teams[v.id].tiebreaker = v.tiebreaker;
		});
		var teams = _.values(env.teams);
		teams.sort(function(a, b) {
			if (a.wins != b.wins) {
				return b.wins - a.wins;
			}
			return b.tiebreaker - a.tiebreaker;
		});
		after(teams);
	}
).use_local_env(true);

/**
 * Get the win-loss record of a given team without generating full matchups for the
 * season
 * @param[in] team The team object
 * @return Team object modified with wins/losses fields
 */
var addRecord = new fl.Chain(
	function(env, after, team) {
		env.team = team;
		env.team.wins = 0;
		env.team.losses = 0;
		env.filters.matches.select({home : env.team.id}).exec(after, env.$throw);
	},
	function(env, after, games) {
		_.each(games, function(v, k) {
			if (MATCHES_HOME_WIN == v.result || MATCHES_AWAY_FORFEIT == v.result)
				env.team.wins += 1;
			else if (MATCHES_UNPLAYED != v.result)
				env.team.losses += 1;
		});
		env.filters.matches.select({away : env.team.id}).exec(after, env.$throw);
	},
	function(env, after, games) {
		_.each(games, function(v, k) {
			if (MATCHES_AWAY_WIN == v.result || MATCHES_HOME_FORFEIT == v.result)
				env.team.wins += 1;
			else if (MATCHES_UNPLAYED != v.result)
				env.team.losses += 1;
		});

		after(env.team);
	}
).use_local_env(true);

/**
 * Get a user's most played heroes in recorded matches
 */
var getMostPlayed = new fl.Chain(
	function(env, after, user) {
		// Select hero, side, and match result, along with a count of each
		// unique triple
		env.filters.match_links
			.select({
				steamid : user.steamid,
				property : PROPERTY_HERO,
			})
			.alias('l1')
			.left_join(env.filters.match_links, 'l2')
			.on({0 : 'matchid', 1 : 'matchid'}, {0 : 'steamid', 1 :'steamid'})
			.left_join(env.filters.matches, 'matches')
			.on({0 : 'matchid', 2 : 'id'})
			.where(1, {property : PROPERTY_TEAM})
			.group(0, 'value')
			.group(1, 'value')
			.group(2, 'result')
			.fields(0, ['value', 'hero'], [db.$raw('COUNT(1)'), 'count'])
			.fields(1, ['value', 'team'])
			.fields(2, 'result')
			.exec(after, env.$throw);
	},
	function(env, after, results) {
		var counts = {};

		// Get aggregate counts
		results.forEach(function(r) {
			if (undefined === counts[r.hero]) {
				counts[r.hero] = {
					hero : r.hero,
					wins : 0,
					losses : 0,
					played : 0
				};
			}

			counts[r.hero].played += r.count;

			if (PROPERTY_TEAM_HOME == r.team) {
				if (isHomeWin(r))
					counts[r.hero].wins += r.count;
				else if (isAwayWin(r))
					counts[r.hero].losses += r.count;
			}
			else {
				if (isAwayWin(r))
					counts[r.hero].wins += r.count;
				else if (isHomeWin(r))
					counts[r.hero].losses += r.count;
			}
		});

		after(_.sortBy(counts, function(x) { return -x.played; }));
	}
).use_local_env(true);

/**
 * Get a person's record in a particular season
 */
var getPlayerSeasonRecord = new fl.Chain(
	function(env, after, user, season) {
		env.filters.match_links
			.select({
				steamid : user.steamid,
				property : PROPERTY_TEAM
			})
			.left_join(env.filters.matches, 'matches')
			.on(['matchid', 'id'])
			.where(1, {season : season.id})
			.group(0, 'value')
			.group(1, 'result')
			.fields(0, ['value', 'side'], [db.$raw('COUNT(1)'), 'count'])
			.fields(1, 'result')
			.exec(after, env.$throw);
	},
	function(env, after, results) {
		var counts = {
			wins : 0,
			losses : 0
		};

		results.forEach(function(r) {
			if (PROPERTY_TEAM_HOME == r.side) {
				if (isHomeWin(r))
					counts.wins += r.count;
				else if (isAwayWin(r))
					counts.losses += r.count;
			}
			else {
				if (isAwayWin(r))
					counts.wins += r.count;
				else if (isHomeWin(r))
					counts.losses += r.count;
			}
		});

		after(counts);
	}
).use_local_env(true);

/**
 * Helper used to add summary information to a list of rows from the matches table
 * @param[in] matches Array of matches, may be empty, that are just rows from the matches table
 * @return Array of matches with summary info from match links added:
 * 		match = {id, season, home, away, result, heroes : {
 * 			home : [{
 * 				hero : hero_id,
 * 				steamid : player_id
 * 			}],
 * 			away : [{
 * 				hero: hero_id,
 * 				steamid : player_id
 * 			}]}
 * 		}
 */
var addSummaryInfo = new fl.Chain(
	function(env, after, matches) {
		env.teams = [];
		env.matches = matches;
		env.teamInfo = {};

		_.each(matches, function(v, k) {
			env.teams.push(v.home);
			env.teams.push(v.away);
		});

		env.teams = _.uniq(env.teams);
		env.idx = 0;
		after();
	},
	// Get all the teams for a list of IDs
	// @todo this needs to be made into a function and replaced in the several places it is used
	new fl.LoopChain(
		function(env, after) {
			after(env.idx < env.teams.length);
		},
		function(env, after) {
			after(env.teams[env.idx]);
		},
		teams.get,
		function(env, after, team) {
			if (undefined !== team.id) {
				env.teamInfo[team.id] = team;
			}
			env.idx += 1;
			after();
		}
	),
	function(env, after) {
		if (env.matches.length > 0) {
			env.match_ids = _.map(env.matches, function(v, k) { return v.id; });
			var q = {
				matchid : env.match_ids,
				property : [PROPERTY_HERO, PROPERTY_TEAM]
			};

			env.filters.match_links.select(q).exec(after, env.$throw);
		}
		else {
			after([]);
		}
	},
	function(env, after, links) {
		matchSummaries = {};

		// Combine hero and team links into a single record
		_.each(links, function(v, k) {
			if (undefined === matchSummaries[v.matchid])
				matchSummaries[v.matchid] = {};

			if (undefined === matchSummaries[v.matchid][v.steamid])
				matchSummaries[v.matchid][v.steamid] = {};

			matchSummaries[v.matchid][v.steamid][v.property] = v.value;
		});

		// Create hero listings for each side from the combined records
		_.each(matchSummaries, function(v, k) {
			var homeHeroes = [];
			var awayHeroes = [];

			_.each(v, function(player, steamid) {
				var heroObj = {
					hero : player[PROPERTY_HERO],
					player : steamid
				};

				if (PROPERTY_TEAM_HOME == player[PROPERTY_TEAM])
					homeHeroes.push(heroObj);
				else
					awayHeroes.push(heroObj);
			});

			v.homeHeroes = homeHeroes;
			v.awayHeroes = awayHeroes;
		});

		// Add summary information to original match objects which are in random order
		_.each(env.matches, function(v, k) {
			// Not all matches have hero information yet (unplayed for example)
			if (undefined !== matchSummaries[v.id]) {
				v.heroes = {
					home : matchSummaries[v.id].homeHeroes,
					away : matchSummaries[v.id].awayHeroes
				};
			}

			v.home = env.teamInfo[v.home];
			v.away = env.teamInfo[v.away];
		});

		after(env.matches);
	}
).use_local_env(true);

/**
 * Helper to generate a chain that selects for either home or away based on an argument
 * @param[in] bool home If true get home matches, if false get away matches
 * @param[env] team The team to find matches for
 * @return Chain object that can be added to another function
 */
function _generateTeamMatchFinder(home) {
	return new fl.Chain(
		function(env, after) {
			var q = {};
			if (home)
				q.home = env.team.id;
			else
				q.away = env.team.id;

			env.filters.matches.select(q).exec(after, env.$throw);
		},
		addSummaryInfo
	).use_local_env(true);
}

/**
 * Get the match history for the given team object
 * @param[in] team The team to fetch match history for
 * @return Array of match summary objects
 */
var getTeamHistory = new fl.Branch(
	function(env, after, team) {
		env.team = team;
		env.matches = [];
		after(env.team.id > 0);
	},
	new fl.Chain(
		_generateTeamMatchFinder(true),
		function(env, after, matches) {
			Array.prototype.push.apply(env.matches, matches);
			after();
		},
		_generateTeamMatchFinder(false),
		function(env, after, matches) {
			Array.prototype.push.apply(env.matches, matches);
			after(env.matches);
		}
	),
	function(env, after) {
		after([]);
	}
).use_local_env(true);

/**
 * Get the match history for the given user object, separate it by season and
 * add team information as appropriate
 * @param[in] player The user object to look for
 * @return Array of objects: { season, matches }
 */
var getPlayerHistory = new fl.Chain(
	function(env, after, player) {
		// Select just one property for each to limit result size
		env.filters.match_links.select({
			steamid : player.steamid,
			property : PROPERTY_TEAM,
		}).order(db.$desc('matchid')).exec(after, env.$throw);
	},
	function(env, after, links) {
		var ids = _.map(links, function(v) {
			return v.matchid;
		});

		if (ids.length > 0)
			env.filters.matches.select({id : ids}).exec(after, env.$throw);
		else
			after([]);
	},
	addSummaryInfo,
	function(env, after, matches) {
		env.matches = matches;
		var seasons = _.uniq(_.map(matches, function(v) {
			return v.season;
		}));

		if (matches.length > 0)
			env.filters.seasons.select({id : seasons}).exec(after, env.$throw);
		else
			after([]);
	},
	function(env, after, seasons) {
		var results = {};
		_.each(seasons, function(v, k) {
			results[v.id] = {
				season : v,
				matches : []
			};
		});

		_.each(env.matches, function(v) {
			results[v.season].matches.push(v);
		});

		// Sort seasons in descending order
		results = _.sortBy(results, function(v) {
			return -v.season.id;
		});

		after(results);
	}
).use_local_env(true);

/**
 * Calculate a player's inhouse captain suitability score
 * @param[in] wins Games won
 * @param[in[ losses Games lost
 */
function getInhouseCaptainScore(wins, losses) {
	var games = wins + losses;

	if (games < 2)
		return 0;

	var winrate = wins / games;
	return (winrate * Math.log2(games)).toFixed(2);
}

/**
 * Construct the leaderboard for a particular inhouse league season based on the given
 * season object
 * @param[in] season Season object to create leaderboards for
 * @return Array, in order, of basic player info (no privs) augmented with stats for
 *         the given season
 */
var getLeaderboards = new fl.Chain(
	function(env, after, season) {
		env.season = season;
		env.filters.matches.select({season : season.id}).exec(after, env.$throw);
	},
	function(env, after, matches) {
		env.matches = matches;
		if (matches.length > 0) {
			matchIds = _.map(matches, function(v) { return v.id; });
			env.filters.match_links.select({
				matchid : matchIds,
				property : PROPERTY_TEAM
			}).exec(after, env.$throw);
		}
		else {
			after([]);
		}
	},
	function(env, after, links) {
		// Remap matches from unordered array to id -> match
		var matches = {};
		_.each(env.matches, function(v) {
			matches[v.id] = v;
		});

		// Count wins and losses for each player linked
		var players = {};
		_.each(links, function(link) {
			if (undefined === players[link.steamid]) {
				players[link.steamid] = {
					user : {},
					wins : 0,
					losses : 0
				};
			}

			if (PROPERTY_TEAM_HOME == link.value) {
				if (MATCHES_HOME_WIN == matches[link.matchid].result)
					players[link.steamid].wins += 1;
				else
					players[link.steamid].losses += 1;
			}
			else {
				if (MATCHES_AWAY_WIN == matches[link.matchid].result)
					players[link.steamid].wins += 1;
				else
					players[link.steamid].losses += 1;
			}
		});

		_.each(players, function(p) {
			p.ihmmr = getInhouseCaptainScore(p.wins, p.losses);
		});

		env.players = players;
		if (_.size(env.players) > 0) {
			env.filters.users.select({
				steamid : _.keys(env.players)
			}).exec(after, env.$throw);
		}
		else {
			after([]);
		}
	},
	function(env, after, users) {
		// Attach user objects to existing stats
		_.each(users, function(user) {
			env.players[user.steamid].user = user;
		});

		// Sort descending by wins, default is ascending sort
		env.players = _.sortBy(env.players, function(v) {
			return -(v.wins - v.losses);
		});

		after(env.players);
	}
).use_local_env(true);

/**
 * Retrieve series info, without match details, for an entire season, organized into
 * an array by week
 * @param[in] id Season ID to retrieve from
 * @return array of series info, including team objects
 */
var getAllSeries = new fl.Chain(
	function(env, after, id) {
		env.id = id;
		env.filters.matches.select({
			season : id
		}).exec(after, env.$throw);
	},
	function(env, after, matches) {
		// Normal matches have playoff set to 0
		env.matches = _.filter(matches, function(m) {
			return m.playoff == 0;
		});

		// Playoff matches, unsurprisingly, have playoff >0
		env.playoffs = _.filter(matches, function(m) {
			return m.playoff > 0;
		});
		after(env.matches);
	},
	parseMatches,
	addTeamInfo,
	function(env, after, series) {
		env.series = {};

		series.forEach(function(v) {
			if (env.series[v.round] === undefined) {
				env.series[v.round] = [];
			}

			env.series[v.round].push(v);
		});

		after(env.matches);
	},
	addSummaryInfo,
	function(env, after, matches) {
		after(env.playoffs);
	},
	parseMatches,
	addTeamInfo,
	function(env, after, series) {
		env.playoffs_series = series;
		after(env.playoffs);
	},
	addSummaryInfo,
	function(env, after, matches) {
		after({
			regular : env.series,
			playoff : env.playoffs_series
		});
	}
).use_local_env(true);

/**
 * Generate an array of playoff match infos for N teams
 * @input[in] int teams Number of teams to generate a playoff bracket for
 * @input[in] int offset Playoff match id offset
 * @return array of playoff pairings where each has {
 * 	playoff : playoff game id (used to link games)
 * 	home_seed : seed of team to use as home team
 * 	away_seed : seed of team to use as away team
 * 	home_previous : game id whose winner becomes home team
 * 	away_previous : game id whose winner becomes away team
 * }
 */
function getPlayoffTemplate(teams, offset) {
	// Fixed "bracket" when there are two teams left of one game
	if (teams <= 2) {
		return [{
			playoff : 1 + offset,
			bye : false,
			home_seed : 0,
			away_seed : 1,
			home_previous : 0,
			away_previous : 0
		}];
	}

	// Otherwise get bracket for top half and add another layer
	var N = Math.ceil(Math.log2(teams));
	var realTeams = teams;
	teams = Math.pow(2, N);
	var halfT = teams/2;
	bracket = getPlayoffTemplate(halfT, offset);

	var start = halfT/2 - 1;
	var stop = halfT - 1;
	for (var j = start; j < stop; ++j) {
		var bye = (teams - bracket[j].home_seed - 1 >= realTeams);
		bracket[j].home_previous = bracket.length + 1 + offset;
		bracket.push({
			playoff : bracket.length + 1 + offset,
			bye : bye,
			home_seed : bracket[j].home_seed,
			away_seed : teams - bracket[j].home_seed - 1,
			home_previous : 0,
			away_previous : 0
		});

		bye = (teams - bracket[j].away_seed - 1 >= realTeams);
		bracket[j].away_previous = bracket.length + 1 + offset;
		bracket.push({
			playoff : bracket.length + 1 + offset,
			bye : bye,
			home_seed : bracket[j].away_seed,
			away_seed : teams - bracket[j].away_seed - 1,
			home_previous : 0,
			away_previous : 0
		});
	}

	return bracket;
}

module.exports = {
	UNPLAYED : MATCHES_UNPLAYED,
	HOME_WIN : MATCHES_HOME_WIN,
	AWAY_WIN : MATCHES_AWAY_WIN,
	HOME_FORFEIT : MATCHES_HOME_FORFEIT,
	AWAY_FORFEIT : MATCHES_AWAY_FORFEIT,
	DOUBLE_FORFEIT : MATCHES_DOUBLE_FORFEIT,

	PROPERTY_LEVEL : PROPERTY_LEVEL,
	PROPERTY_HERO : PROPERTY_HERO,
	PROPERTY_KILLS : PROPERTY_KILLS,
	PROPERTY_DEATHS : PROPERTY_DEATHS,
	PROPERTY_ASSISTS : PROPERTY_ASSISTS,
	PROPERTY_LAST_HITS : PROPERTY_LAST_HITS,
	PROPERTY_DENIES : PROPERTY_DENIES,
	PROPERTY_GPM : PROPERTY_GPM,
	PROPERTY_XPM : PROPERTY_XPM,
	PROPERTY_DAMAGE : PROPERTY_DAMAGE,
	PROPERTY_HEALING : PROPERTY_HEALING,
	PROPERTY_TOWER_DAMAGE : PROPERTY_TOWER_DAMAGE,
	PROPERTY_TEAM : PROPERTY_TEAM,
	PROPERTY_NET_WORTH : PROPERTY_NET_WORTH,
	PROPERTY_ITEM_MIN : PROPERTY_ITEM_MIN,
	PROPERTY_ITEM_MAX : PROPERTY_ITEM_MAX,

	PROPERTY_TEAM_HOME : PROPERTY_TEAM_HOME,
	PROPERTY_TEAM_AWAY : PROPERTY_TEAM_AWAY,

	getAllSeries : getAllSeries,
	generateMatchups : generateMatchups,
	addStandings : addStandings,
	addRecord : addRecord,
	getDetails : getMatchDetails,
	getTeamHistory : getTeamHistory,
	getPlayerHistory : getPlayerHistory,
	addSummaryInfo : addSummaryInfo,
	getLeaderboards : getLeaderboards,
	getPlayoffTemplate : getPlayoffTemplate,
	createSeries : createSeries,
	getMostPlayed : getMostPlayed,
	getPlayerSeasonRecord : getPlayerSeasonRecord,
	getInhouseCaptainScore : getInhouseCaptainScore,
};
