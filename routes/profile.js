
var fl = require('flux-link');
var privs = require('../lib/privs.js');
var users = require('../lib/users.js');

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
	var showPrivs = false;

	// Make sure privs exist and viewer has access to them
	if (userPrivs.length > 0 && privs.hasPriv(viewPrivs, privs.VIEW_PRIVS))
		showPrivs = true;

	env.$template('profile');
	env.$output({
		title : 'Profile for '+displayUser.name,
		user : env.user,
		profileUser : displayUser,
		dotabuff : 'https://www.dotabuff.com/players/'+displayUser.id32,
		opendota : 'https://www.opendota.com/players/'+displayUser.id32,
		showPrivs : showPrivs,
		vouched : privs.hasPriv(userPrivs, privs.JOIN_SEASON),
		privs : [
			{
				name : 'modify_account',
				has : privs.hasPriv(userPrivs, privs.MODIFY_ACCOUNT),
				label : 'Modify accounts'
			},
			{
				name : 'modify_season',
				has : privs.hasPriv(userPrivs, privs.MODIFY_SEASON),
				label : 'Modify seasons'
			},
			{
				name : 'join_season',
				has : privs.hasPriv(userPrivs, privs.JOIN_SEASON),
				label : 'Vouched'
			},
			{
				name : 'view_privs',
				has : privs.hasPriv(userPrivs, privs.VIEW_PRIVS),
				label : 'View privs'
			}
		]
	});
	after();
}
var profile = new fl.Chain(
	new fl.Branch(
		privs.isLoggedIn,
		new fl.Chain(
			function(env, after) {
				env.$push(env.user);
				env.$push(env.user.steamid);
				after();
			},
			privs.getPrivs,
			function(env, after, userPrivs) {
				// Same privs to display and view profile
				env.$push(userPrivs);
				env.$push(userPrivs);
				after();
			},
			buildProfile
		),
		function(env, after) {
			env.$redirect('/');
			after();
		}
	)
);

var public_profile = new fl.Chain(
	new fl.Branch(
		privs.isLoggedIn,
		new fl.Chain(
			function(env, after) {
				after(env.user.steamid);
			},
			privs.getPrivs,
			function (env, after, viewerPrivs) {
				env.userPrivs = viewerPrivs;
				after();
			}
		),
		function(env, after) {
			env.userPrivs = [];
			after();
		}
	),
	function(env, after) {
		after(env.req.params.steamid);
	},
	users.getUser,
	function(env, after, displayUser) {
		if (displayUser === null)
			env.$throw(new Error('Unable to find user matching this profile'));

		env.displayUser = displayUser;
		env.$push(displayUser.steamid);
		after();
	},
	privs.getPrivs,
	function(env, after, displayPrivs) {
		env.$push(env.displayUser);
		env.$push(displayPrivs);
		env.$push(env.userPrivs);
		after();
	},
	buildProfile
);

module.exports.init_routes = function(server) {
	server.add_route('/profile', {
		fn : profile,
		pre : ['default'],
		post : ['default']
	}, 'get');

	server.add_route('/profile/:steamid', {
		fn : public_profile,
		pre : ['default'],
		post : ['default']
	}, 'get');
}
