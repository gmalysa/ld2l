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
const logger = require('../logger.js');
//var drafts = require('../lib/drafts.js');

// Time in milliseconds before a bid sells
const BID_TIME_LIMIT = 15000;

const getTeams = new fl.Chain(
	mysql.init_db,
	function(env, after) {
		after(env.draftInfo.season.id);
	},
	seasons.getSeasonBasic,
	seasons.getDraftableSignups,
	function(env, after, signups) {
		env.signups = signups;
		after(env.draftInfo.season.id);
	},
	teams.getAllTeams,
	function(env, after, teams) {
		env.teams = teams;
		after();
	},
	mysql.cleanup_db,
	function(env, after) {
		after(env.teams, env.signups);
	}
);

const assignMoney = new fl.Chain(
	mysql.init_db,
	function(env, after) {
		env.idx = 0;
		after();
	},
	new fl.LoopChain(
		function(env, after) {
			after(env.idx < env.teams.length);
		},
		function(env, after) {
			let team = env.teams[env.idx];
			env.idx += 1;
			env.filters.teams.update({
				starting_money : team.starting_money,
			}, {
				id : team.id
			}).exec(after, env.$throw);
		},
	),
	mysql.cleanup_db
);

const draftPlayerToTeam = new fl.Chain(
	mysql.init_db,
	function(env, after) {
		after(env.drafted, env.team);
	},
	teams.setTeam,
	mysql.cleanup_db
);

var draftInfos = {};
var io = null;

class DraftBase {
	/**
	 * @param[in] season season - Which season we're running the draft for
	 * @todo consider io as an argument
	 */
	constructor(season) {
		this.season = season;
		this.log = [];
		this.teams = [];
		this.round = 0;
		this.room = io.of('/draft-'+season.id);
		this.room.on('connect', this.syncStatus.bind(this));
	}

	start() {
		this.logEvent('Draft started.');
		var env = new fl.Environment();
		env.draftInfo = this;
		getTeams.call(null, env, this.populateTeams.bind(this));
	}

	/**
	 * Callback used to populate teams during start
	 */
	populateTeams(teams, signups) {
		this.teams = teams;
		this.signups = signups;
	}

	/**
	 * Synchronize draft status to a newly connected client. Add your own and
	 * call this version for common information
	 */
	syncStatus(socket) {
		socket.emit('log', this.log);
		this.sendDrafters(socket);
	}

	/**
	 * Log an event that happened during the course of the draft
	 * @param[in] string message - Log message verbatim
	 */
	logEvent(message) {
		var entry = [message];
		this.log.push(message);
		this.room.emit('log', entry);
		logger.info('Logged event: '+message);
	}

	/**
	 * This is used to map a player for use on the client side with only
	 * the fields we wish to expose being visible
	 * @param[in] signup v
	 */
	cleanPlayer(v) {
		return {
			steamid : v.steamid,
			display_name : v.display_name,
			medal : v.medal,
			teamid : v.teamid,
		};
	}

	/**
	 * This is used to map one server-side team to one client-side team with
	 * only the fields we wish to expose being visible
	 * @param[in] team v
	 */
	cleanTeam(v) {
		return {
			id : v.id,
			name : v.name,
			captain : this.cleanPlayer(v.captain),
			medal : v.medal,
			players : v.players.map(this.cleanPlayer.bind(this)),
			drafted : v.drafted,
			next : v.next,
		};
	}

	/**
	 * This converts the proper server side teams array into a client-friendly version
	 * that doesn't send as much random data
	 */
	clientTeams() {
		return this.teams.map(this.cleanTeam.bind(this));
	}

	/**
	 * Get the team matching the given captain (synchronously by searching)
	 * @param[in] captain The captain to search for
	 * @return Team object or null if this person wasn't a captain
	 */
	findTeam(captain) {
		return this.teams.find(function(v) {
			return v.captain.steamid == captain.steamid;
		});
	}

	/**
	 * Draft a player onto a team and let everyone know
	 * @param[in] user user - The person who drafted to update
	 * @param[in] user drafted - The person that was drafted
	 * @param[in] team team - The team they were drafted to
	 */
	draftPlayer(user, drafted, team) {
		this.logEvent(user.display_name+' drafted '+drafted.display_name);
		this.room.emit('drafted', this.cleanPlayer(drafted));
		team.players.push(drafted);
		teams.updateMedalAverage(team);
		this.sendNext(this.room);
	}

	/**
	 * Mark that the current drafter has drafted already
	 * @param[in] user user - The person who drafted to update
	 */
	markDrafted(user) {
		var team = this.teams.find(function(v) {
			return v.captain.steamid == user.steamid;
		});

		if (!team)
			logger.error("Drafter "+user.steamid+" was not a captain!\n");

		team.drafted = true;
	}

	/**
	 * Compare two teams for sorting; different drafts use different rules, maybe
	 * @param[in] team a
	 * @param[in] team b
	 * @return positive if a is larger
	 */
	teamCompare(a, b) {
		logger.error('Bug, please define teamCompare for the class used');
		return 0;
	}

	/**
	 * Start a new round, sorting teams by average mmr and determining draft order
	 */
	startRound(round) {
		this.teams.sort(this.teamCompare);
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
	sendDrafters(socket) {
		socket = socket || this.room;

		socket.emit('round', {
			round : this.round,
		});

		this.sendNext(socket);
	}

	/**
	 * Send the next drafter to the given socket, to highlight whose turn it is
	 * @param[in] socket Send drafter information here
	 */
	sendNext(socket) {
		socket = socket || this.room;

		if (this.teams.length > 0) {
			this.teams.forEach(function(v) {
				v.next = false;
			});

			let captain = this.teams.find(function(v) {
				return !v.drafted;
			});
			if (captain) {
				captain.next = true;
				socket.emit('next', {steamid : captain.captain.steamid});
			}

			socket.emit('teams', {teams : this.clientTeams()});
		}
	}

	/**
	 * Determine if the given user is currently drafting
	 * @param[in] user Check this user object
	 * @return True if this person is allowed to draft right now
	 */
	isDrafting(user) {
		// First person who has not drafted needs to match the given user
		for (var d = 0; d < this.teams.length; ++d) {
			var other = this.teams[d].captain;
			if (!this.teams[d].drafted) {
				return other.steamid == user.steamid;
			}
		}

		// Everyone has drafted for this round
		return false;
	}
}

/**
 * @todo implement linear draft for fun. it should be more or less automatic
 * based on draft base
 */
class LinearDraft extends DraftBase {
}

class EUDraft extends DraftBase {
	constructor(season) {
		super(season);
	}

	/**
	 * Draft order is determined by average medal, increasing
	 */
	teamCompare(a, b) {
		return a.medal - b.medal;
	}

	/**
	 * In linear/EU drafts we only draft once per round, so mark the drafter
	 * as done after they've made their pick as well
	 */
	draftPlayer(user, drafted, team) {
		super.draftPlayer(user, drafted, team);
		this.markDrafted(user);
	}
}

class AuctionDraft extends DraftBase {
	constructor(season) {
		super(season);
	}

	resetBidding() {
		this.nominee = null;
		this.bidder = null;
		this.amount = 0;
		this.accepting_bids = false;

		if (this.timeout)
			clearTimeout(this.timeout);
		this.timeout = null;
		this.room.emit('nominate', {});
	}

	start() {
		this.resetBidding();
		super.start();
	}

	startRound(round) {
		super.startRound(round);
	}

	cleanPlayer(v) {
		let p = super.cleanPlayer(v);
		p.cost = v.cost;
		return p;
	}

	cleanTeam(v) {
		let t = super.cleanTeam(v);
		t.money = v.money;
		t.starting_money = v.starting_money;
		return t;
	}

	populateTeams(teams, signups) {
		super.populateTeams(teams);
		seasons.assignAuctionMoney(this.season, teams, signups);

		var env = new fl.Environment();
		env.teams = teams;
		assignMoney.call(null, env, null);
	}

	syncStatus(socket) {
		super.syncStatus(socket);
	}

	/**
	 * Draft order is determined by cash on hand, decreasing
	 */
	teamCompare(a, b) {
		return b.money - a.money;
	}

	/**
	 * Determine if this user can bid the given amount
	 * @param[in] user user
	 * @param[in] int amount
	 * @return true if they can bid that much
	 */
	canBid(user, amount) {
		var team = this.findTeam(user);
		if (!team)
			return false;

		if (team.money < amount)
			return false;
		return amount > this.amount;
	}

	/**
	 * Bid on the current nominee to the tune of amount. This assumes that
	 * canBid was called and is true
	 * @param[in] user user
	 * @param[in] int amount
	 */
	bid(user, amount) {
		this.bidder = user;
		this.amount = amount;
		this.logEvent(user.display_name + ' bid '+amount);
		this.room.emit('bid', {
			by : this.cleanPlayer(user),
			amount : amount,
		});

		if (this.timeout)
			clearTimeout(this.timeout);
		this.timeout = setTimeout(this.bidTimeout.bind(this), BID_TIME_LIMIT);
	}

	/**
	 * Nominate a given target for bidding, assumes that canBid has already been
	 * called to verify the user and amount, and the target has been verified.
	 * @param[in] user user - The person doing the nomination, must be captain
	 * @param[in] user target - The person being nominated, must be draftable
	 */
	nominate(user, target) {
		this.amount = 0;
		this.bidder = user;
		this.nominee = target;
		this.accepting_bids = true;
		this.logEvent(user.display_name + ' nominated ' + target.display_name);
		this.markDrafted(user);
		this.room.emit('nominate', {
			nominee : this.cleanPlayer(target),
			by : this.cleanPlayer(user),
		});
		this.timeout = setTimeout(this.bidTimeout.bind(this), BID_TIME_LIMIT);
	}

	/**
	 * For auction, disable drafting/nominating during bidding
	 * and also ensure that the first round is manually started before a nomination
	 * can be accepted
	 */
	isDrafting(user) {
		if (this.accepting_bids || this.round == 0)
			return false;

		return super.isDrafting(user);
	}

	draftPlayer(user, drafted, team) {
		team.money -= this.amount;
		drafted.cost = this.amount;
		this.resetBidding();
		super.draftPlayer(user, drafted, team);

		let env = new fl.Environment();
		env.user = user;
		env.team = team;
		env.drafted = drafted;
		draftPlayerToTeam.call(null, env, null);
	}

	bidTimeout() {
		logger.info('Bidding timed out');
		this.draftPlayer(this.bidder, this.nominee, this.findTeam(this.bidder));
	}
}

/**
 * Create a new draft object based on the season type
 */
function createDraft(season) {
	if (season.type == seasons.TYPE_DRAFT) {
		draftInfos[season.id] = new EUDraft(season);
		return true;
	}
	else if (season.type == seasons.TYPE_AUCTION) {
		draftInfos[season.id] = new AuctionDraft(season);
		return true;
	}
	return false;
}

/**
 * Common parsing and configuration prologue for all draft routes
 */
const draft_prologue = new fl.Chain(
	function(env, after) {
		let id = parseInt(env.req.params.seasonid);
		if (isNaN(id))
			return env.$throw(new Error('Invalid season ID specified'));

		env.seasonId = id;
		env.draft = draftInfos[id];
		after(id);
	},
	seasons.getSeasonBasic,
	function(env, after, season) {
		env.season = season;
		after();
	}
);

const check_draft_privs = function(env, after) {
	if (!privs.hasPriv(env.user.privs, privs.MODIFY_SEASON))
		return env.$throw(new Error('You don\'t have the authority to start the draft'));
	after();
}

const start_draft = new fl.Chain(
	draft_prologue,
	check_draft_privs,
	function(env, after) {
		after(env.seasonId);
	},
	seasons.getSeason,
	function(env, after, season) {
		if (!createDraft(season))
			return env.$throw(new Error('Draft is unavailable for this season type'));

		// env.draft is a stale ref in this route only, use direct lookup
		draftInfos[env.seasonId].start();
		env.$redirect('/seasons/'+season.id+'/draft');
		after();
	}
);

const next_round = new fl.Chain(
	draft_prologue,
	check_draft_privs,
	function(env, after) {
		env.draft.startRound(env.draft.round + 1);
		env.$redirect('/seasons/'+env.seasonId+'/draft');
		after();
	}
);

/**
 * Common draft/nomination verification path that sets up the user and team to be
 * drafted/nominated for next phase of draft logic
 */
const draft_check = new fl.Chain(
	function(env, after) {
		if (!env.draft.isDrafting(env.user)) {
			env.$throw(new Error('It is not your turn to draft'));
			return;
		}

		env.filters.signups.select({
			steamid : env.req.body.steamid,
			season : env.season.id
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

		logger.info('Received draft request for '+user.display_name+' from '+env.user.display_name);
		env.team = env.draft.findTeam(env.user);
		env.drafted = user;
		after();
	}
);

const check_draft_season = function(env, after) {
	if (env.season.type != seasons.TYPE_DRAFT)
		return env.$throw(new Error('This is not an EU draft season'));
	after();
}

const check_auction_season = function(env, after) {
	if (env.season.type != seasons.TYPE_AUCTION)
		return env.$throw(new Error('This is not an auction draft season'));
	after();
}

/**
 * Used by EU draft
 */
const draft_player = new fl.Chain(
	draft_prologue,
	check_draft_season,
	draft_check,
	function(env, after) {
		after(env.drafted, env.team);
	},
	teams.setTeam,
	function(env, after) {
		env.draft.draftPlayer(env.user, env.drafted, env.team);
		env.$json({success : true});
		after();
	}
);

/**
 * Used by auction draft
 */
const nominate_player = new fl.Chain(
	draft_prologue,
	check_auction_season,
	draft_check,
	function(env, after) {
		env.draft.nominate(env.user, env.drafted);
		env.$json({success : true});
		after();
	}
);

const bid = new fl.Chain(
	draft_prologue,
	check_auction_season,
	function(env, after) {
		let amount = parseInt(env.req.body.amount) || 0;
		if (!env.draft.canBid(env.user, amount))
			return env.$throw(new Error('You cannot bid that much'));

		env.draft.bid(env.user, amount);
		env.$json({success : true});
		after();
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

	server.add_route('/draft/nominate/:seasonid', {
		fn : nominate_player,
		pre : ['default', 'require_user']
	}, 'post');

	server.add_route('/draft/bid/:seasonid', {
		fn : bid,
		pre : ['default', 'require_user']
	}, 'post');

}
