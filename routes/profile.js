
var fl = require('flux-link');
var privs = require('../lib/privs.js');

var profile = new fl.Chain(
	new fl.Branch(
		privs.isLoggedIn,
		new fl.Chain(
			function(env, after) {
				after(env.user.steamid);
			},
			privs.getPrivs,
			function(env, after, userPrivs) {
				var showPrivs = false;
				if (userPrivs.length > 0 && privs.hasPriv(userPrivs, privs.VIEW_PRIVS))
					showPrivs = true;

				env.$template('profile');
				env.$output({
					title : 'Learn Dota 2 League',
					user : env.user,
					dotabuff : 'https://www.dotabuff.com/players/'+env.user.id32,
					opendota : 'https://www.opendota.com/players/'+env.user.id32,
					showPrivs : showPrivs,
					privs : {
						MODIFY_ACCOUNT : privs.hasPriv(userPrivs, privs.MODIFY_ACCOUNT),
						MODIFY_SEASON : privs.hasPriv(userPrivs, privs.MODIFY_SEASON),
						JOIN_SEASON : privs.hasPriv(userPrivs, privs.JOIN_SEASON),
						VIEW_PRIVS : privs.hasPriv(userPrivs, privs.VIEW_PRIVS),
					}
				});
				after();
			}
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
				after();
			}
		),
		function (env, after) {
			after();
		}
	)
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
