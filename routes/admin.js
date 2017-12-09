
var fl = require('flux-link');
var _ = require('underscore');

var privs = require('../lib/privs.js');

var loadPrivs = new fl.Chain(
	function(env, after) {
		env.filters.privs.insert({
			steamid : env.user.steamid,
			priv : privs.MODIFY_ACCOUNT
		}).exec(after, env.$throw);
	},
	function(env, after) {
		env.filters.privs.insert({
			steamid : env.user.steamid,
			priv : privs.MODIFY_SEASON
		}).exec(after, env.$throw);
	},
	function(env, after) {
		env.filters.privs.insert({
			steamid : env.user.steamid,
			priv : privs.JOIN_SEASON
		}).exec(after, env.$throw);
	},
	function(env, after) {
		env.filters.privs.insert({
			steamid : env.user.steamid,
			priv : privs.VIEW_PRIVS
		}).exec(after, env.$throw);
	}
);

var bootstrap = new fl.Chain(
	new fl.Branch(
		privs.isLoggedIn,
		// Logged in
		new fl.Chain(
			function (env, after) {
				env.filters.privs.select().exec(after, env.$throw);
			},
			function(env, after, rows) {
				if (0 == rows.length) {
					loadPrivs.call(null, env, after);
				}
				else {
					after();
				}
			}
		),
		// Not logged in
		function (env, after) {
			after();
		}
	),
	function (env, after) {
		env.$redirect('/');
		after();
	}
);

module.exports.init_routes = function(server) {
	server.add_route('/admin/bootstrap', {
		fn : bootstrap,
		pre : ['default'],
		post : ['default'],
	}, 'get');
}
