/**
 * Requests specific to drafting teams
 */

var fl = require('flux-link');
var db = require('db-filters');
var _ = require('underscore');

var mysql = require('../mysql');

var privs = require('../lib/privs.js');
var users = require('../lib/users.js');
var seasons = require('../lib/seasons.js');
var teams = require('../lib/teams.js');
//var drafts = require('../lib/drafts.js');

var getTeams = new fl.Chain(
	mysql.init_db,
	function(env, after) {
		after(env.draftInfo.season.id);
	},
	teams.getAllTeams,
	function(env, after, teams) {
		env.teams = teams;
		after();
	},
	mysql.cleanup_db,
	function(env, after) {
		after(env.teams);
	}
).use_local_env(true);

var draftInfos = {};
var io = null;

/**
 * Object for tracking information about an ongoing draft
 */
function Draft(season) {
	this.log = [];
	this.teams = [];
	this.season = season;
	this.round = 0;
	this.room = io.of('/draft-'+season.id);

	var that = this;
	this.room.on('connect', function(socket) {
		socket.emit('log', that.log);
		that.sendDrafters(socket);
	});

	this.start();
}

/**
 * Log an event that happened during the course of the draft
 */
Draft.prototype.logEvent = function(message) {
	var entry = [message];
	this.log.push(message);
	this.room.emit('log', entry);
	console.log('Logged event: '+message);
}

/**
 * Start a new draft, loading all team information from the database
 */
Draft.prototype.start = function() {
	this.logEvent('Draft started.');

	var env = new fl.Environment();
	env.draftInfo = this;
	var that = this;

	getTeams.call(null, env, function(teams) {
		that.teams = teams;
		that.startRound(1);
	});
}

/**
 * This converts the proper server side teams array into a client-friendly version
 * that doesn't expose as much random data
 */
Draft.prototype.clientTeams = function() {
	return _.map(this.teams, function(v) {
		return {
			id : v.id,
			name : v.name,
			captain : {
				avatar : v.captain.avatar,
				display_name : v.captain.display_name,
				steamid : v.captain.steamid,
				solo_mmr : v.captain.solo_mmr,
				party_mmr : v.captain.party_mmr,
			},
			medal : v.medal,
			players : _.map(v.players, function(v) {
				return {
					avatar : v.avatar,
					display_name : v.display_name,
					steamid : v.steamid,
					solo_mmr : v.solo_mmr,
					party_mmr : v.party_mmr,
				};
			}),
			drafted : v.drafted
		};
	});
}

/**
 * Start a new round, sorting teams by average mmr and determining draft order
 */
Draft.prototype.startRound = function(round) {
	this.teams.sort(function(a, b) {
		return a.medal - b.medal;
	});

	this.teams.forEach(function(v, k) {
		v.drafted = false;
	});

	this.round = round;
	this.logEvent('<b>Round '+round+'</b> started!');
	this.sendDrafters(this.room);
}

/**
 * Send all drafter status information to all clients
 * @param[in] socket The socket to send to (either a room or a person)
 */
Draft.prototype.sendDrafters = function(socket) {
	socket = socket || this.room;

	socket.emit('round', {
		round : this.round,
		teams : this.clientTeams()
	});

	this.sendNext(socket);
};

/**
 * Send the next drafter to the given socket, to highlight whose turn it is
 * @param[in] socket Send drafter information here
 */
Draft.prototype.sendNext = function(socket) {
	socket = socket || this.room;

	if (this.teams.length > 0) {
		var captain = _.find(this.teams, function(v) {
			return !v.drafted;
		});

		// Nobody is undrafted at the end of a round
		if (captain) {
			socket.emit('next', {
				steamid : captain.captain.steamid,
				team : captain.id
			});
		}
	}
};

/**
 * Get the team matching the given captain (synchronously by searching)
 * @param[in] captain The captain to search for
 * @return Team object or null if this person wasn't a captain
 */
Draft.prototype.findTeam = function(captain) {
	for (var t in this.teams) {
		var team = this.teams[t];
		if (team.captain.steamid == captain.steamid)
			return team;
	}

	return null;
}

/**
 * Update all listeners with new team status
 * @param[in] team The team whose status has changed
 */
Draft.prototype.updateTeam = function(team) {
	this.room.emit('team', {
		id : team.id,
		players : team.players,
		medal : team.medal
	});
}

/**
 * Mark that the current drafter has drafted already
 * @param[in] user The person who drafted to update
 * @param[in] drafted The person that was drafted
 * @param[in] team The team they were drafted to
 */
Draft.prototype.markDrafted = function(user, drafted, team) {
	var teamIdx = 0;
	for (var d = 0; d < this.teams.length; ++d) {
		if (this.teams[d].captain.steamid == user.steamid) {
			console.log('Matched drafter '+user.steamid);
			this.teams[d].drafted = true;
			teamIdx = d;
		}
	}

	var player = {
		steamid : drafted.steamid,
		avatar : drafted.avatar,
		display_name : drafted.display_name,
		team : team.id
	};

	// Player is added to the team elsewhere
	this.room.emit('drafted', player);
	this.sendNext(this.room);
	this.logEvent(user.display_name+' drafted '+drafted.display_name);
}

/**
 * Determine if the given user is currently drafting
 * @param[in] user Check this user object
 * @return True if this person is allowed to draft right now
 */
Draft.prototype.isDrafting = function(user) {
	// First person who has not drafted needs to match the given user
	for (var d = 0; d < this.teams.length; ++d) {
		var other = this.teams[d].captain;
		if (!this.teams[d].drafted) {
			return other.steamid == user.steamid;
		}
	}

	// Not even on the drafter list
	return false;
}

var start_draft = new fl.Chain(
	function(env, after) {
		var id = parseInt(env.req.params.seasonid);
		if (isNaN(id)) {
			env.$throw(new Error('Invalid season ID specified'));
			return;
		}

		if (!privs.hasPriv(env.user.privs, privs.MODIFY_SEASON)) {
			env.$throw(new Error('You don\'t have the authority to start the draft'));
			return;
		}

		env.seasonId = id;
		after(id);
	},
	seasons.getSeason,
	function(env, after, season) {
		draftInfos[env.seasonId] = new Draft(season);
		env.$redirect('/seasons/'+season.id+'/draft');
		after();
	}
);

var next_round = new fl.Chain(
	function(env, after) {
		var id = parseInt(env.req.params.seasonid);
		if (isNaN(id)) {
			env.$throw(new Error('Invalid season ID specified'));
			return;
		}

		if (!privs.hasPriv(env.user.privs, privs.MODIFY_SEASON)) {
			env.$throw(new Error('You don\'t have the authority to start the draft'));
			return;
		}

		env.seasonId = id;
		draftInfos[env.seasonId].startRound(draftInfos[env.seasonId].round + 1);
		env.$redirect('/seasons/'+id+'/draft');
		after();
	}
);

var draft_player = new fl.Chain(
	function(env, after) {
		var id = parseInt(env.req.params.seasonid);
		if (isNaN(id)) {
			env.$throw(new Error('Invalid season ID specified'));
			return;
		}

		env.seasonId = id;

		if (!draftInfos[env.seasonId].isDrafting(env.user)) {
			env.$throw(new Error('It is not your turn to draft'));
			return;
		}

		env.filters.signups.select({
			steamid : env.req.body.steamid,
			season : id
		})
			.left_join(env.filters.users, 'users')
			.on(['steamid', 'steamid'])
			.exec(after, env.$throw);
	},
	function(env, after, user) {
		if (user.length == 0) {
			env.$throw(new Error('Matching steamid not found!'));
			return;
		}

		var user = user[0];
		if (user.teamid > 0 || user.draftable == 0) {
			env.$throw(new Error('This person cannot be drafted!'));
			return;
		}

		console.log('Received draft request for '+user.display_name+' from '+env.user.display_name);
		env.team = draftInfos[env.seasonId].findTeam(env.user);
		env.drafted = user;
		after(env.drafted, env.team);
	},
	teams.setTeam,
	function(env, after) {
		env.team.players.push(env.drafted);
		teams.updateMedalAverage(env.team);
		draftInfos[env.seasonId].updateTeam(env.team);
		draftInfos[env.seasonId].markDrafted(env.user, env.drafted, env.team);
		env.$json({success : true});
		after();
	}
);

var toggle_draftable = new fl.Chain(
	function(env, after) {
		if (!privs.hasPriv(env.user.privs, privs.MODIFY_SEASON)) {
			env.$throw(new Error('You don\'t have the authority to change draftable'));
			return;
		}

		env.$json({success : true});

		env.filters.signups.update({
			draftable : env.req.body.draftable ? 1 : 0
		}, {
			steamid : env.req.body.steamid,
			season : env.req.body.season
		}).exec(after, env.$throw);
	}
);

module.exports.init_routes = function(server) {
	io = server.io;

	server.add_route('/draft/start/:seasonid', {
		fn : start_draft,
		pre : ['default', 'require_user']
	});

	server.add_route('/draft/choose/:seasonid', {
		fn: draft_player,
		pre : ['default', 'require_user']
	}, 'post');

	server.add_route('/draft/next/:seasonid', {
		fn : next_round,
		pre : ['default', 'require_user']
	});

	server.add_route('/draft/toggle', {
		fn : toggle_draftable,
		pre : ['default', 'require_user']
	}, 'post');
}
