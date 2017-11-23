var _ = require('underscore');
var db = require('db-filters');
var fl = require('flux-link');
var BigNumber = require('bignumber.js');

var logger = require('../logger');
var config = require('../config');
var mysql = require('../mysql');

var passport = require('passport');
var steamStrategy = require('passport-steam');
//var discordStrategy = require('passport-discord');

// Passport basic config
passport.serializeUser(function(user, done) {
	done(null, user);
});

passport.deserializeUser(function(obj, done) {
	done(null, obj);
});

/**
 * We don't have access to the init_db function defined in server.js so it needs to be duplicated
 * here for now.
 */
function init_db(env, after) {
	env.filters = db.clone_filters(db.filters);

	mysql.getValidConnection(env, function() {
		db.set_conn_all(env.conn, env.filters);
		after();
	});
}

// Set up passport for steam login info
passport.use(new steamStrategy({
	returnURL : config.base_url + '/auth/steam/return',
	realm : config.base_url,
	apiKey : config.steam_api_key
}, function(id, profile, done) {
	var env = new fl.Environment();
	var chain = new fl.Chain(
		init_db,
		function(env, after) {
			env.filters.users.select({steamid : profile.id})
				.exec(after, env.$throw);
		},
		new fl.Branch(
			function(env, after, rows) {
				if (rows.length > 0)
					after(true, rows);
				else
					after(false);
			}, function(env, after, rows) {
				env.user = rows[0];
				after();
			}, function(env, after) {
				var user = {
					steamid : profile.id,
					admin : 0,
					name : profile.displayName,
					avatar : profile._json.avatar
				};
				env.user = user;
				env.filters.users.insert(user).exec(after, env.$throw);
			}
		),
		function(env, after) {
			console.log(env.user);
			console.log(env.user.steamid);
			var steamoffset = new BigNumber('76561197960265728');
			logger.debug('offset: '+steamoffset.toString());
			var steam32 = new BigNumber(env.user.steamid+'').sub(steamoffset);
			logger.debug('steam32: '+steam32.toString());
			env.user.id32 = steam32.toString();
			after();
		});

	logger.info('Received steam ID: ' +id, 'Steam');
	chain.call(null, env, function() { done(null, env.user); });
}));


// Bind to provided express instance at init time
module.exports.init_routes = function(common) {
	common.server.use(passport.initialize());
	common.server.use(passport.session());

	common.server.get(
		'/auth/steam',
		passport.authenticate('steam', { failureRedirect : '/' }),
		function (req, res) { res.redirect('/'); }
	);
	common.server.get(
		'/auth/steam/return',
		passport.authenticate('steam', { failureRedirect : '/' }),
		function (req, res) { res.redirect('/'); }
	);
};
