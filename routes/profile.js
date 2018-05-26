
var fl = require('flux-link');
var privs = require('../lib/privs.js');
var users = require('../lib/users.js');

/**
 * Just push the steamid, pretty standard helper
 */
function _pushSteamId(env, after) {
	after(env.user.steamid);
}

/**
 * Test if the given set of viewer privs can vouch the given set of user/profile privs
 * @param[in] viewPrivs The privs of the person viewing the profile
 * @param[in] userPrivs The privs of the person being viewed
 * @return 1 if they can, 0 otherwise
 */
function canVouch(viewPrivs, userPrivs) {
	return privs.hasPriv(viewPrivs, privs.VOUCH) && !privs.hasPriv(userPrivs, privs.JOIN_SEASON);
}

/**
 * Populate the template arguments correctly based on other stuff we collected
 * Arguments come on the stack, to be pushed in order:
 * @param[in] displayUser The user object being displayed
 * @param[in] userPrivs Privs of user being viewed
 * @param[in] viewPrivs Privs of viewing user
 */
function buildProfile(env, after) {
	var viewPrivs = env.$pop();
	var userPrivs = env.$pop();
	var displayUser = env.$pop();
	var showPrivs = privs.hasPriv(viewPrivs, privs.VIEW_PRIVS);
	var canLink = false;
	var scripts = [];

	if (env.user && env.user.steamid == displayUser.steamid)
		canLink = true;

	if (showPrivs)
		scripts.push('profile');

	env.$template('profile');
	env.$output({
		title : 'Profile for '+displayUser.name,
		profileUser : displayUser,
		dotabuff : 'https://www.dotabuff.com/players/'+displayUser.id32,
		opendota : 'https://www.opendota.com/players/'+displayUser.id32,
		showPrivs : showPrivs,
		vouched : privs.hasPriv(userPrivs, privs.JOIN_SEASON),
		canVouch : canVouch(viewPrivs, userPrivs),
		canLink : canLink,
		scripts : scripts,
		privs : [
			{
				name : 'modify_account',
				has : privs.hasPriv(userPrivs, privs.MODIFY_ACCOUNT),
				id : privs.MODIFY_ACCOUNT,
				label : 'Modify accounts'
			},
			{
				name : 'modify_season',
				has : privs.hasPriv(userPrivs, privs.MODIFY_SEASON),
				id : privs.MODIFY_SEASON,
				label : 'Modify seasons'
			},
			{
				name : 'join_season',
				has : privs.hasPriv(userPrivs, privs.JOIN_SEASON),
				id : privs.JOIN_SEASON,
				label : 'Vouched'
			},
			{
				name : 'view_privs',
				has : privs.hasPriv(userPrivs, privs.VIEW_PRIVS),
				id : privs.VIEW_PRIVS,
				label : 'View privs'
			},
			{
				name : 'vouch',
				has : privs.hasPriv(userPrivs, privs.VOUCH),
				id : privs.VOUCH,
				label : 'Vouch'
			},
			{
				name : 'news',
				has : privs.hasPriv(userPrivs, privs.POST_NEWS),
				id : privs.POST_NEWS,
				label : 'Post News',
			},
			{
				name : 'ineligible',
				has : privs.hasPriv(userPrivs, privs.INELIGIBLE),
				id : privs.INELIGIBLE,
				label : 'Ineligible (mmr)'
			},
			{
				name : 'banned',
				has : privs.hasPriv(userPrivs, privs.BANNED),
				id : privs.BANNED,
				label : 'Banned'
			}
		]
	});
	after();
}

/**
 * Handlers: default, require_user
 */
var profile = new fl.Chain(
	function(env, after) {
		env.$push(env.user);
		env.$push(env.user.privs);
		env.$push(env.user.privs);
		after();
	},
	buildProfile
);

/**
 * Handlers: default, optional_user
 * @param[in] steamid ID of the profile to view, in any format
 * @throws Exception if nobody with that ID has registered here yet
 */
var public_profile = new fl.Chain(
	function(env, after) {
		after(env.req.params.steamid);
	},
	users.getUser,
	function(env, after, displayUser) {
		if (displayUser === null) {
			env.$throw(new Error('Unable to find user matching this profile'));
		}
		else {
			env.$push(displayUser);
			env.$push(displayUser.privs);
			env.$push(env.user.privs);
			after();
		}
	},
	buildProfile
);

/**
 * Handlers: default, require_user
 * @throws Exception if the logged in player is not allowed to vouch people
 */
var vouch = new fl.Chain(
	function(env, after) {
		after(env.req.params.steamid);
	},
	users.getUser,
	function(env, after, player) {
		if (null == player) {
			env.$throw(new Error('This person hasn\'t registered yet and cannot be vouched'));
		}
		else {
			after(env.user, player);
		}
	},
	users.vouchUser,
	function(env, after) {
		// When called from ajax don't redirect
		if (env.req.accepts('html'))
			env.$redirect('/profile/' + env.req.params.steamid);
		else
			env.$json({success : true});
		after();
	}
);

/**
 * Add or remove a single priv when the box is checked
 */
var change_priv = new fl.Chain(
	function(env, after) {
		after(env.req.params.steamid);
	},
	users.getUser,
	new fl.Branch(
		function(env, after, player) {
			if (null == player) {
				env.$throw(new Error('This person hasn\'t registered and cannot have privs changed'));
			}
			else {
				after('1' == env.req.body.value);
			}
		},
		new fl.Chain(
			function(env, after) {
				after(env.req.params.steamid, env.req.body.priv);
			},
			privs.addPriv
		),
		new fl.Chain(
			function(env, after) {
				after(env.req.params.steamid, env.req.body.priv);
			},
			privs.removePriv
		)
	),
	function(env, after) {
		env.$json({success : true});
		after();
	}
);

module.exports.init_routes = function(server) {
	server.add_route('/profile', {
		fn : profile,
		pre : ['default', 'require_user'],
		post : ['default']
	}, 'get');

	server.add_route('/profile/:steamid', {
		fn : public_profile,
		pre : ['default', 'optional_user'],
		post : ['default']
	}, 'get');

	server.add_route('/profile/:steamid/vouch', {
		fn : vouch,
		pre : ['default', 'require_user'],
		post : ['default']
	}, 'get');

	server.add_route('/profile/:steamid/priv', {
		fn : change_priv,
		pre : ['default', 'require_user'],
		post : ['default']
	}, 'post');
}
